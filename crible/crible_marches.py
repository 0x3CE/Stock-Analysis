"""
crible_marches.py — Données de tout l'univers du Crible des marchés.

Univers (environ 1 300 sociétés) :
  - S&P 500 depuis Wikipédia, sinon la copie locale sp500_constituents.csv ;
  - Europe, Suisse et Asie via yf.screen, bourse par bourse, classement par
    capitalisation, quotas dans EUROPE, SUISSE et ASIE ;
  - les tickers de extra_local.txt (non versionné : il peut contenir des
    positions détenues).

Sorties (à ne pas versionner) : crible_resultats.json, .csv (« ; ») et
.parquet, et le cache cache_crible/ (un JSON par ticker, valable 3 jours).

Le réseau n'est appelé que dans extraire_tout(), completer_etats(),
univers_*() et taux_usd(). Tout le reste se teste hors ligne.

Exemples :
    python crible_marches.py --limite 5
    python crible_marches.py --regions us,ch --fils 2
    python crible_marches.py --tickers NVDA,ASML.AS,ROG.SW
    python crible_marches.py --rafraichir
"""

from __future__ import annotations

import argparse
import io
import json
import math
import os
import re
import sys
import threading
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone

from screener_qualite import _exclusion, _num, completer_etats, evaluer, mesures, verdict

VERSION = "2026-11-13"
ICI = os.path.dirname(os.path.abspath(__file__))
SOURCE = "Yahoo Finance via yfinance (API non officielle)"
CACHE_JOURS = 3
VERSION_CACHE = 2  # à augmenter quand l'extraction ou le filtre change : le cache est alors ignoré

# ---------------------------------------------------------------------------
# Quotas par bourse (codes Yahoo, voir yfinance.const.EQUITY_SCREENER_EQ_MAP)
# ---------------------------------------------------------------------------
EUROPE = {
    "PAR": 90, "GER": 90, "LSE": 110, "AMS": 35, "MIL": 40, "MCE": 35, "STO": 40,
    "CPH": 20, "HEL": 15, "OSL": 15, "BRU": 15, "VIE": 8, "ISE": 5, "LIS": 5,
}
SUISSE = {"EBS": 80}
ASIE = {"JPX": 150, "KSC": 50, "TAI": 50}

# On parcourt les candidats d'une bourse dans l'ordre des capitalisations
# jusqu'à remplir son quota. Au-delà de ce multiple du quota, on s'arrête.
SURECHANTILLON_MAX = 6
# Bourses où les premières capitalisations sont surtout des cotations
# étrangères (constaté le 13/11/2026 : 30 premiers candidats de Xetra et de
# Vienne tous étrangers). On y lit plus loin, et on écarte avant extraction
# les noms déjà présents sur une autre bourse de l'univers.
SURECHANTILLON_BOURSE = {"EBS": 10}
# Profondeur fixe (nombre de candidats lus), indépendante du quota et de --limite.
# 3e essai : à Xetra, SAP, Siemens et Allianz n'apparaissent qu'après 69
# candidats étrangers ; à Vienne, aucune société autrichienne dans les 300
# premiers. La lecture s'arrête de toute façon dès que le quota est atteint.
PROFONDEUR_BOURSE = {"GER": 1500, "VIE": 2000}
BOURSES_CARREFOUR = {"GER", "VIE"}
# Sur ces bourses, un nom du S&P 500 suffit comme début de nom (« Cisco » pour
# « Cisco Systems, Inc. »). Ailleurs, il faut le nom exact (risque de faux positifs).
BOURSES_INTERNATIONALES = {"GER", "VIE", "EBS"}

# Pays du siège de chaque bourse. Une société cotée sur une bourse dont le pays
# n'est pas celui de son siège est une cotation secondaire (Apple à Francfort,
# ABB à Stockholm), sauf si son pays n'a pas de bourse dans l'univers
# (Luxembourg, Jersey…) ou si elle figure dans COTATIONS_PRINCIPALES_HORS_PAYS.
PAYS_DE_BOURSE = {
    "PAR": "France", "GER": "Germany", "LSE": "United Kingdom", "AMS": "Netherlands", "MIL": "Italy",
    "MCE": "Spain", "STO": "Sweden", "CPH": "Denmark", "HEL": "Finland", "OSL": "Norway", "BRU": "Belgium",
    "VIE": "Austria", "ISE": "Ireland", "LIS": "Portugal", "EBS": "Switzerland", "JPX": "Japan",
    "KSC": "South Korea", "TAI": "Taiwan",
}
PAYS_SANS_BOURSE_EUROPE = {
    "Luxembourg", "Jersey", "Guernsey", "Isle of Man", "Liechtenstein", "Greece", "Poland", "Iceland",
    "Czech Republic", "Malta", "Cyprus", "Faroe Islands", "Gibraltar",
}
# Sociétés dont la cotation principale est hors du pays de leur siège. Liste
# tenue à la main : y ajouter une société perdue par le filtre.
COTATIONS_PRINCIPALES_HORS_PAYS = {
    "AIR.PA": "Airbus, siège aux Pays-Bas",
    "STMPA.PA": "STMicroelectronics, siège en Suisse",
    "ENX.PA": "Euronext, siège aux Pays-Bas",
    "ARGX.BR": "argenx, siège aux Pays-Bas",
    "EDPR.LS": "EDP Renováveis, siège en Espagne",
    "STLAM.MI": "Stellantis, siège aux Pays-Bas",
    "GLEN.L": "Glencore, siège en Suisse",
    "CCH.L": "Coca-Cola HBC, siège en Suisse",
    "EXPN.L": "Experian, siège en Irlande",
    "QIA.DE": "Qiagen, siège aux Pays-Bas",
}

PAYS_EUROPE = {
    "France", "Germany", "United Kingdom", "Netherlands", "Italy", "Spain", "Sweden", "Denmark",
    "Finland", "Norway", "Belgium", "Austria", "Ireland", "Portugal", "Switzerland",
} | PAYS_SANS_BOURSE_EUROPE


def pays_admis_bourse(bourse):
    """Pays de siège admis pour une bourse de l'univers (None : pas de filtre)."""
    pays = PAYS_DE_BOURSE.get(bourse)
    if pays is None:
        return None
    if pays in ("Japan", "South Korea", "Taiwan"):
        return {pays}
    return {pays} | PAYS_SANS_BOURSE_EUROPE

# Une obligation ou un warrant porte souvent un taux ou ces mots dans son nom.
_RE_PAS_UNE_ACTION = re.compile(
    r"\d+(?:[.,]\d+)?\s?%|\b(?:BDS?|SNR|NOTES?|BONDS?|OBLIG\w*|TSDI|WARRANTS?|TURBO|CERTIFICATES?)\b",
    re.IGNORECASE,
)

# Devise de la capitalisation quand le cours est en centièmes : Yahoo donne le
# cours en pence (GBp) mais la capitalisation en livres (GBP).
DEVISE_CAPI = {"GBp": "GBP", "ZAc": "ZAR", "ILA": "ILS"}

# Pays du siège dans l'Espace économique européen (indication PEA seulement)
EEE = {
    "France", "Germany", "Netherlands", "Italy", "Spain", "Sweden", "Denmark", "Finland", "Belgium",
    "Austria", "Ireland", "Portugal", "Luxembourg", "Greece", "Poland", "Czech Republic", "Malta",
    "Cyprus", "Norway", "Iceland", "Liechtenstein", "Estonia", "Latvia", "Lithuania", "Slovakia",
    "Slovenia", "Hungary", "Romania", "Bulgaria", "Croatia",
}

# Devises proposées dans le site
DEVISES_SITE = ["EUR", "USD", "CHF", "JPY", "GBP"]

# Champs exportés, dans l'ordre. Ne renommer ni supprimer aucun champ : le site
# les lit. En ajouter un est sans risque.
CHAMPS_TEXTE = [
    "ticker", "nom", "pays", "bourse", "secteur", "industrie", "devise", "devise_comptable", "reco",
    "trimestre", "exercice", "region", "liste", "statut", "motif", "date_extraction", "source",
    "croissance_source",
]
CHAMPS_BOOL = ["tresorerie_nette", "pea_possible", "capex_couvert", "rachats_absents", "dividendes_absents"]
CHAMPS_NUM = [
    "cours", "capi", "capi_usd", "per_passe", "per_prev", "ve_ebitda", "cours_vc", "rendement_div_pct",
    "taux_distribution_pct", "roe_pct", "marge_brute_ttm_pct", "marge_op_ttm_pct", "marge_nette_ttm_pct",
    "croissance_ca_trim_pct", "croissance_bpa_trim_pct", "dette_totale", "tresorerie", "ebitda_ttm", "fcf_ttm",
    "perf_52s_pct", "plus_haut_52s", "objectif_moyen", "nb_analystes", "dette_nette_ttm", "levier_ttm",
    "rendement_fcf_pct", "potentiel_pct", "ecart_plus_haut_pct", "croissance_ca_0y_pct", "croissance_ca_1y_pct",
    "croissance_bpa_0y_pct", "croissance_bpa_1y_pct", "ca", "dividendes_verses", "tcac_ca_pct", "div_annees",
    "div_baisses", "croissance_div_pct", "capex_pct_ca", "marge_op_pct", "marge_brute_ecart_type",
    "marge_brute_nb_annees", "fcf", "retours", "dette_nette", "dette_nette_prec", "ebitda", "croissance_pct",
    "beta", "volume_moyen", "echanges_jour_usd",
]
CHAMPS_VERDICT = ["verdict_defensif"]
CHAMPS = CHAMPS_TEXTE + CHAMPS_BOOL + CHAMPS_NUM + CHAMPS_VERDICT

_journal_verrou = threading.Lock()


def journal(msg):
    with _journal_verrou:
        print(msg, file=sys.stderr, flush=True)


# ---------------------------------------------------------------------------
# Petits calculs (hors ligne)
# ---------------------------------------------------------------------------

def _pct(v):
    """Ratio Yahoo (0,125) → pourcentage (12,5). None reste None."""
    v = _num(v)
    return 100 * v if v is not None else None


def _date_epoch(v):
    v = _num(v)
    if v is None:
        return None
    try:
        return datetime.fromtimestamp(v, tz=timezone.utc).strftime("%Y-%m-%d")
    except (OverflowError, OSError, ValueError):
        return None


def stats_dividendes(dividendes, annee_courante=None):
    """
    Statistiques sur les années civiles complètes.
    dividendes : série pandas (index de dates, montant par action) ou None.
    Renvoie (div_annees, div_baisses, croissance_div_pct) :
      - div_annees : nombre d'années consécutives avec un dividende, en
        remontant depuis la dernière année complète (0 si elle n'en a pas) ;
      - div_baisses : nombre de baisses d'une année sur l'autre sur cette période ;
      - croissance_div_pct : croissance annuelle moyenne sur cette période.
    (None, None, None) si l'historique est absent.
    """
    if dividendes is None or getattr(dividendes, "empty", True):
        return None, None, None
    annee_courante = annee_courante or datetime.now(timezone.utc).year
    par_an = {}
    for date, montant in dividendes.items():
        m = _num(montant)
        if m is None or m <= 0:
            continue
        par_an[date.year] = par_an.get(date.year, 0.0) + m
    derniere = annee_courante - 1
    serie = []
    a = derniere
    while a in par_an:
        serie.append(par_an[a])
        a -= 1
    serie.reverse()  # ancien → récent
    if not serie:
        return 0, 0, None
    baisses = sum(1 for x, y in zip(serie, serie[1:]) if y < x * 0.999)
    croissance = None
    if len(serie) >= 2 and serie[0] > 0:
        croissance = 100 * ((serie[-1] / serie[0]) ** (1 / (len(serie) - 1)) - 1)
    return len(serie), baisses, croissance


def calculs_derives(l):
    """Champs calculés à partir des chiffres extraits (mon calcul, signalé dans le CLAUDE.md)."""
    dt, tr = l.get("dette_totale"), l.get("tresorerie")
    l["dette_nette_ttm"] = dt - tr if dt is not None and tr is not None else None
    dn, eb = l["dette_nette_ttm"], l.get("ebitda_ttm")
    l["tresorerie_nette"] = (dn <= 0) if dn is not None else None
    l["levier_ttm"] = dn / eb if dn is not None and eb is not None and eb > 0 else None
    fcf, capi = l.get("fcf_ttm"), l.get("capi")
    meme_devise = l.get("devise") is not None and l.get("devise") == l.get("devise_comptable")
    l["rendement_fcf_pct"] = 100 * fcf / capi if meme_devise and fcf is not None and capi else None
    cours, obj, haut = l.get("cours"), l.get("objectif_moyen"), l.get("plus_haut_52s")
    l["potentiel_pct"] = 100 * (obj / cours - 1) if obj is not None and cours else None
    l["ecart_plus_haut_pct"] = 100 * (cours / haut - 1) if cours is not None and haut else None
    l["pea_possible"] = (l.get("pays") in EEE) if l.get("pays") else None
    return l


def ligne_vide(ticker, contexte=None):
    l = {c: None for c in CHAMPS}
    l["ticker"] = ticker
    l["source"] = SOURCE
    l["date_extraction"] = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M")
    if contexte:
        l["region"] = contexte.get("region")
        l["liste"] = contexte.get("liste")
    return l


# ---------------------------------------------------------------------------
# Extraction d'une société (réseau)
# ---------------------------------------------------------------------------

def _fabrique_defaut():
    import yfinance as yf
    return yf.Ticker


def extraire_tout(ticker, fabrique=None, contexte=None):
    """
    Tous les chiffres d'une société. Lit t.info, les estimations
    (revenue_estimate, earnings_estimate : colonnes 0y et +1y), l'historique
    des dividendes et les états annuels (via completer_etats()).
    statut : OK, ERREUR, EXCLU, ou RETIRE (statut interne : cotation
    secondaire ou titre qui n'est pas une action, retiré ensuite par
    filtrer_et_dedoublonner()).
    """
    contexte = contexte or {}
    l = ligne_vide(ticker, contexte)
    ex = _exclusion(ticker)
    if ex:
        l.update(statut="EXCLU", motif=ex)
        return l

    t = (fabrique or _fabrique_defaut())(ticker)
    info = t.info or {}
    if not info or (info.get("longName") is None and info.get("shortName") is None
                    and info.get("regularMarketPrice") is None and info.get("currentPrice") is None):
        l.update(statut="ERREUR", motif="Yahoo ne renvoie aucune donnée pour ce ticker.")
        return l

    l["nom"] = info.get("longName") or info.get("shortName")
    l["pays"] = info.get("country")
    ex = _exclusion(ticker, l["nom"])
    if ex:
        l.update(statut="EXCLU", motif=ex)
        return l

    type_titre = info.get("quoteType")
    if type_titre and type_titre != "EQUITY":
        l.update(statut="ERREUR", motif=f"Type {type_titre} : pas une action.")
        return l

    admis = contexte.get("pays_admis")
    if admis is not None and ticker.upper() not in COTATIONS_PRINCIPALES_HORS_PAYS:
        if l["pays"] is None:
            l.update(statut="RETIRE", motif="Pays du siège absent : sans doute une obligation, un warrant ou un fonds.")
            return l
        if l["pays"] not in admis:
            l.update(statut="RETIRE", motif=f"Siège {l['pays']} : cotation secondaire.")
            return l

    l.update(
        bourse=info.get("exchange"),
        secteur=info.get("sector"),
        industrie=info.get("industry"),
        devise=info.get("currency"),
        devise_comptable=info.get("financialCurrency"),
        reco=info.get("recommendationKey"),
        trimestre=_date_epoch(info.get("mostRecentQuarter")),
        cours=_num(info.get("currentPrice")) if _num(info.get("currentPrice")) is not None
        else _num(info.get("regularMarketPrice")),
        capi=_num(info.get("marketCap")),
        per_passe=_num(info.get("trailingPE")),
        per_prev=_num(info.get("forwardPE")),
        ve_ebitda=_num(info.get("enterpriseToEbitda")),
        cours_vc=_num(info.get("priceToBook")),
        rendement_div_pct=_pct(info.get("trailingAnnualDividendYield")),
        taux_distribution_pct=_pct(info.get("payoutRatio")),
        roe_pct=_pct(info.get("returnOnEquity")),
        marge_brute_ttm_pct=_pct(info.get("grossMargins")),
        marge_op_ttm_pct=_pct(info.get("operatingMargins")),
        marge_nette_ttm_pct=_pct(info.get("profitMargins")),
        croissance_ca_trim_pct=_pct(info.get("revenueGrowth")),
        croissance_bpa_trim_pct=_pct(info.get("earningsQuarterlyGrowth")),
        dette_totale=_num(info.get("totalDebt")),
        tresorerie=_num(info.get("totalCash")),
        ebitda_ttm=_num(info.get("ebitda")),
        fcf_ttm=_num(info.get("freeCashflow")),
        perf_52s_pct=_pct(info.get("52WeekChange")),
        plus_haut_52s=_num(info.get("fiftyTwoWeekHigh")),
        objectif_moyen=_num(info.get("targetMeanPrice")),
        nb_analystes=_num(info.get("numberOfAnalystOpinions")),
        beta=_num(info.get("beta")),
        volume_moyen=_num(info.get("averageVolume")),
    )

    # Estimations du consensus
    for attr, prefixe in (("revenue_estimate", "croissance_ca"), ("earnings_estimate", "croissance_bpa")):
        try:
            df = getattr(t, attr)
        except Exception:  # noqa: BLE001
            df = None
        for periode, suffixe in (("0y", "0y"), ("+1y", "1y")):
            v = None
            try:
                if df is not None and not df.empty and periode in df.index and "growth" in df.columns:
                    v = _num(df.at[periode, "growth"])
            except Exception:  # noqa: BLE001
                v = None
            l[f"{prefixe}_{suffixe}_pct"] = 100 * v if v is not None else None

    # Historique des dividendes
    try:
        div = t.dividends
    except Exception:  # noqa: BLE001
        div = None
    l["div_annees"], l["div_baisses"], l["croissance_div_pct"] = stats_dividendes(div)

    # États annuels et profil défensif
    m = {"per_prev": l["per_prev"], "beta": l["beta"]}
    completer_etats(m, t)
    l.update(mesures(m))
    calculs_derives(l)
    l["verdict_defensif"] = verdict(evaluer(l))
    l["statut"] = "OK"
    return l


# ---------------------------------------------------------------------------
# Cache, reprises sur erreur 429, exclusions
# ---------------------------------------------------------------------------

def _fichier_cache(dossier, ticker):
    return os.path.join(dossier, re.sub(r"[^A-Za-z0-9._-]", "_", ticker) + ".json")


def lire_cache(dossier, ticker, jours=CACHE_JOURS, maintenant=None):
    chemin = _fichier_cache(dossier, ticker)
    try:
        with open(chemin, encoding="utf-8") as f:
            d = json.load(f)
        date = datetime.fromisoformat(d["date"])
    except (OSError, ValueError, KeyError, TypeError):
        return None
    maintenant = maintenant or datetime.now(timezone.utc)
    if (maintenant - date).total_seconds() > jours * 86400:
        return None
    if d.get("version") != VERSION_CACHE:  # format ou règles changés : on refait
        return None
    return d.get("ligne")


def ecrire_cache(dossier, ticker, ligne):
    os.makedirs(dossier, exist_ok=True)
    chemin = _fichier_cache(dossier, ticker)
    tmp = chemin + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump({"date": datetime.now(timezone.utc).isoformat(), "version": VERSION_CACHE, "ligne": ligne}, f,
                  ensure_ascii=False)
    os.replace(tmp, chemin)


def _est_429(e):
    nom = type(e).__name__
    txt = str(e)
    return nom == "YFRateLimitError" or "Too Many Requests" in txt or "429" in txt or "Rate limited" in txt


def traiter(ticker, contexte=None, dossier_cache=None, rafraichir=False, fabrique=None,
            essais=4, attente=5.0, dormir=time.sleep):
    """Une société : cache d'abord, sinon extraction avec reprises sur 429 (attente croissante)."""
    dossier_cache = dossier_cache or os.path.join(ICI, "cache_crible")
    ex = _exclusion(ticker)
    if ex:
        l = ligne_vide(ticker, contexte)
        l.update(statut="EXCLU", motif=ex)
        return l
    if not rafraichir:
        l = lire_cache(dossier_cache, ticker)
        if l is not None:
            if contexte:  # la même société peut venir d'une autre liste
                l["region"], l["liste"] = contexte.get("region"), contexte.get("liste")
            return l
    derniere = None
    for i in range(essais):
        try:
            l = extraire_tout(ticker, fabrique=fabrique, contexte=contexte)
            if l["statut"] != "ERREUR":
                ecrire_cache(dossier_cache, ticker, l)
            return l
        except Exception as e:  # noqa: BLE001
            derniere = e
            if _est_429(e) and i < essais - 1:
                pause = attente * (3 ** i)
                journal(f"  429 sur {ticker} : nouvel essai dans {pause:.0f} s")
                dormir(pause)
                continue
            break
    l = ligne_vide(ticker, contexte)
    l.update(statut="ERREUR", motif=f"{type(derniere).__name__} : {derniere}"[:300])
    return l


# ---------------------------------------------------------------------------
# Cotations secondaires et doublons (hors ligne)
# ---------------------------------------------------------------------------

_SUFFIXES = re.compile(
    r"\b(inc|incorporated|corp|corporation|co|company|ltd|limited|plc|ag|sa|se|nv|n\.v|spa|s\.p\.a|ab|asa|"
    r"oyj|a/s|as|kgaa|holding|holdings|group|the|and|com|class [a-z]|cl [a-z])\b\.?",
    re.IGNORECASE,
)


def nom_normalise(nom):
    n = (nom or "").lower()
    n = re.sub(r"\(.*?\)", " ", n)
    n = _SUFFIXES.sub(" ", n)
    n = re.sub(r"[^a-z0-9à-ÿ]+", " ", n)
    return " ".join(n.split())


def filtrer_et_dedoublonner(lignes):
    """
    Retire les lignes RETIRE (cotations secondaires, titres qui ne sont pas
    des actions) et les doublons (même nom sur deux bourses, ou deux classes
    d'actions). Garde en priorité la cotation de la bourse du pays du siège,
    puis la liste S&P 500, puis la cotation la plus échangée (en USD par jour),
    puis la plus grosse capitalisation.
    Renvoie (lignes gardées, nb retirées, nb doublons).
    """
    retirees = [l for l in lignes if l.get("statut") == "RETIRE"]
    restantes = [l for l in lignes if l.get("statut") != "RETIRE"]

    def priorite(l):
        maison = PAYS_DE_BOURSE.get(l.get("bourse_screen") or "") == l.get("pays")
        sp = l.get("liste") == "S&P 500"
        return (0 if maison else 1, 0 if sp else 1, -(l.get("echanges_jour_usd") or 0), -(l.get("capi_usd") or 0))

    gardees, vus_ticker, groupes = [], set(), {}
    for l in restantes:
        tk = (l.get("ticker") or "").upper()
        if tk in vus_ticker:
            continue
        vus_ticker.add(tk)
        if l.get("statut") != "OK" or not l.get("nom"):
            gardees.append(l)
            continue
        groupes.setdefault(nom_normalise(l["nom"]), []).append(l)
    doublons = 0
    for groupe in groupes.values():
        groupe.sort(key=priorite)
        gardees.append(groupe[0])
        doublons += len(groupe) - 1
    return gardees, len(retirees), doublons


# ---------------------------------------------------------------------------
# Taux de change (réseau) et capitalisation en USD (hors ligne)
# ---------------------------------------------------------------------------

def taux_usd(devises, fabrique=None):
    """Valeur en USD d'une unité de chaque devise. GBp (pence) = GBP / 100. None si inconnu."""
    fab = fabrique or _fabrique_defaut()
    res = {"USD": 1.0}
    for d in sorted(set(x for x in devises if x)):
        if d in res:
            continue
        base = "GBP" if d == "GBp" else ("ZAR" if d == "ZAc" else ("ILS" if d == "ILA" else d))
        if base not in res:
            try:
                fi = fab(f"{base}USD=X").fast_info
                v = _num(fi["last_price"] if isinstance(fi, dict) else fi.last_price)
            except Exception:  # noqa: BLE001
                v = None
            res[base] = v
        res[d] = res[base] / 100 if d in ("GBp", "ZAc", "ILA") and res[base] is not None else res[base]
    return res


def ajouter_capi_usd(lignes, taux):
    """
    capi_usd : capitalisation en USD. Pour un cours en centièmes (GBp), la
    capitalisation de Yahoo est déjà dans l'unité principale (GBP).
    echanges_jour_usd : volume moyen × cours, en USD (mesure de liquidité).
    """
    for l in lignes:
        devise = l.get("devise")
        capi, t_capi = l.get("capi"), taux.get(DEVISE_CAPI.get(devise, devise))
        l["capi_usd"] = capi * t_capi if capi is not None and t_capi is not None else None
        vol, cours, t = l.get("volume_moyen"), l.get("cours"), taux.get(devise)
        l["echanges_jour_usd"] = vol * cours * t if vol is not None and cours is not None and t is not None else None
    return lignes


# ---------------------------------------------------------------------------
# Univers (réseau)
# ---------------------------------------------------------------------------

def univers_sp500():
    """
    (tickers, noms) du S&P 500 depuis Wikipédia ; met à jour la copie locale.
    Si Wikipédia est inaccessible, la copie locale. Sinon deux listes vides.
    """
    import pandas as pd
    copie = os.path.join(ICI, "sp500_constituents.csv")
    try:
        import requests
        r = requests.get("https://en.wikipedia.org/wiki/List_of_S%26P_500_companies",
                         headers={"User-Agent": "crible-marches/1.0 (outil personnel)"}, timeout=20)
        r.raise_for_status()
        table = pd.read_html(io.StringIO(r.text))[0]
        tickers = [str(s).strip().replace(".", "-") for s in table["Symbol"]]
        noms = [str(s).strip() for s in table["Security"]] if "Security" in table else [""] * len(tickers)
        if len(tickers) < 400:
            raise ValueError(f"seulement {len(tickers)} lignes lues")
        pd.DataFrame({"ticker": tickers, "nom": noms}).to_csv(copie, index=False)
        journal(f"S&P 500 : {len(tickers)} sociétés (Wikipédia, copie locale mise à jour)")
        return tickers, noms
    except Exception as e:  # noqa: BLE001
        if os.path.exists(copie):
            df = pd.read_csv(copie, dtype=str).fillna("")
            tickers = [t.strip() for t in df["ticker"] if t.strip()]
            noms = list(df["nom"]) if "nom" in df else []
            journal(f"S&P 500 : Wikipédia inaccessible ({e}) ; copie locale, {len(tickers)} sociétés")
            return tickers, noms
        journal(f"S&P 500 : Wikipédia inaccessible ({e}) et pas de copie locale : liste vide")
        return [], []


def candidats_screen(bourse, nombre):
    """[(symbole, nom)] d'une bourse, par capitalisation décroissante, via yf.screen."""
    import yfinance as yf
    from yfinance import EquityQuery
    res, offset = [], 0
    try:
        while len(res) < nombre:
            taille = min(250, nombre - len(res))
            r = yf.screen(EquityQuery("eq", ["exchange", bourse]), offset=offset, size=taille,
                          sortField="intradaymarketcap", sortAsc=False)
            quotes = (r or {}).get("quotes") or []
            if not quotes:
                break
            res += [(q["symbol"], q.get("longName") or q.get("shortName") or "")
                    for q in quotes if q.get("symbol") and q.get("quoteType", "EQUITY") == "EQUITY"]
            offset += len(quotes)
            if len(quotes) < taille:
                break
    except Exception as e:  # noqa: BLE001
        journal(f"  {bourse} : erreur du screener ({e})")
    return res[:nombre]


def _debut_de_nom(court, long_):
    """Vrai si les mots de `court` sont les premiers mots de `long_` (noms normalisés)."""
    c, l = court.split(), long_.split()
    return bool(c) and l[:len(c)] == c


def preselectionner(candidats, noms_exclus, debut=False, noms_ailleurs=None):
    """
    Hors ligne. Écarte sans appel réseau :
      - les titres dont le nom évoque une obligation ou un warrant ;
      - ceux qui portent le nom d'une société du S&P 500 (Apple à Francfort),
        nom exact, ou début de nom si `debut` ;
      - ceux dont le nom figure parmi les candidats d'une autre bourse de
        l'univers (`noms_ailleurs`, pour les bourses carrefours).
    Renvoie (gardés, écartés [(ticker, motif)]).
    """
    gardes, ecartes = [], []
    for tk, nom in candidats:
        n = nom_normalise(nom) if nom else ""
        if nom and _RE_PAS_UNE_ACTION.search(nom):
            ecartes.append((tk, f"« {nom} » : obligation ou warrant, pas une action."))
        elif n and (n in noms_exclus or (debut and any(_debut_de_nom(e, n) for e in noms_exclus))):
            ecartes.append((tk, f"« {nom} » : société du S&P 500, cotation secondaire."))
        elif n and noms_ailleurs and n in noms_ailleurs:
            ecartes.append((tk, f"« {nom} » : cotée sur une autre bourse de l'univers, cotation secondaire."))
        else:
            gardes.append((tk, nom))
    return gardes, ecartes


def univers_extra():
    """Tickers de extra_local.txt (un par ligne, # pour commenter). Fichier non versionné."""
    chemin = os.path.join(ICI, "extra_local.txt")
    if not os.path.exists(chemin):
        return []
    with open(chemin, encoding="utf-8") as f:
        return [l.split("#")[0].strip().upper() for l in f if l.split("#")[0].strip()]


def construire_univers(regions, limite=None, tickers=None):
    """
    Renvoie (taches, files, ecartes) :
      - taches : [(ticker, contexte)] à traiter tels quels (S&P 500, extra, tickers demandés) ;
      - files : une par bourse, {"bourse", "region", "quota", "candidats": [(ticker, contexte)]},
        à parcourir dans l'ordre jusqu'à remplir le quota (voir remplir_quotas()) ;
      - ecartes : [(ticker, motif)] retirés avant toute extraction.
    """
    taches, files, ecartes, vus = [], [], [], set()

    def nouveau(tk):
        if tk and tk.upper() not in vus:
            vus.add(tk.upper())
            return True
        return False

    if tickers:
        return [(tk, {"region": None, "liste": "Demande"}) for tk in tickers if nouveau(tk)], [], []

    sp_tickers, sp_noms = univers_sp500() if regions else ([], [])
    if "us" in regions:
        for tk in (sp_tickers[:limite] if limite else sp_tickers):
            if nouveau(tk):
                taches.append((tk, {"region": "États-Unis", "liste": "S&P 500", "pays_admis": None}))
    noms_exclus = {nom_normalise(n) for n in sp_noms if n}

    # 1. Candidats de toutes les bourses demandées
    bourses = []
    for code, nom, quotas in (("europe", "Europe", EUROPE), ("ch", "Suisse", SUISSE), ("asie", "Asie", ASIE)):
        if code in regions:
            for bourse, quota in quotas.items():
                q = min(quota, limite) if limite else quota
                fois = SURECHANTILLON_BOURSE.get(bourse, SURECHANTILLON_MAX)
                profondeur = PROFONDEUR_BOURSE.get(bourse) or min(q * fois, 1000)
                bourses.append((bourse, nom, q, candidats_screen(bourse, profondeur)))
    # 2. Noms vus sur les bourses qui ne sont pas des carrefours
    noms_hors_carrefour = {nom_normalise(n) for b, _, _, bruts in bourses if b not in BOURSES_CARREFOUR
                           for _, n in bruts if n}
    # 3. Présélection, puis une file par bourse
    for bourse, nom, q, bruts in bourses:
        gardes, ec = preselectionner(bruts, noms_exclus, debut=bourse in BOURSES_INTERNATIONALES,
                                     noms_ailleurs=noms_hors_carrefour if bourse in BOURSES_CARREFOUR else None)
        ecartes += ec
        ctx = {"region": nom, "liste": nom, "pays_admis": pays_admis_bourse(bourse), "bourse_screen": bourse}
        files.append({"bourse": bourse, "region": nom, "quota": q,
                      "candidats": [(tk, dict(ctx, nom_screen=n)) for tk, n in gardes if nouveau(tk)]})
        journal(f"  {bourse} : {len(bruts)} candidats lus, {len(ec)} écartés sans extraction")
    for tk in univers_extra():
        if nouveau(tk):
            taches.append((tk, {"region": None, "liste": "Extra"}))
    return taches, files, ecartes


def region_depuis_pays(pays):
    if pays == "United States":
        return "États-Unis"
    if pays in ("Switzerland", "Liechtenstein"):
        return "Suisse"
    if pays in PAYS_EUROPE:
        return "Europe"
    if pays in ("Japan", "South Korea", "Taiwan", "China", "Hong Kong", "Singapore"):
        return "Asie"
    return None


# ---------------------------------------------------------------------------
# Export (hors ligne)
# ---------------------------------------------------------------------------

def _propre(v):
    if isinstance(v, float) and not math.isfinite(v):
        return None
    return v


def exporter(lignes, meta, dossier):
    """crible_resultats.json, .csv (« ; ») et .parquet (si pyarrow est installé)."""
    os.makedirs(dossier, exist_ok=True)
    propres = [{c: _propre(l.get(c)) for c in CHAMPS} for l in lignes]
    chemins = {}
    p = os.path.join(dossier, "crible_resultats.json")
    with open(p, "w", encoding="utf-8") as f:
        json.dump({"meta": meta, "lignes": propres}, f, ensure_ascii=False, indent=1)
    chemins["json"] = p

    import pandas as pd
    df = pd.DataFrame(propres, columns=CHAMPS)
    for c in CHAMPS_TEXTE + CHAMPS_VERDICT:
        df[c] = df[c].astype("string")
    for c in CHAMPS_BOOL:
        df[c] = df[c].astype("boolean")
    for c in CHAMPS_NUM:
        df[c] = pd.to_numeric(df[c], errors="coerce").astype("Float64")
    p = os.path.join(dossier, "crible_resultats.csv")
    df.to_csv(p, sep=";", index=False, encoding="utf-8-sig", decimal=",")
    chemins["csv"] = p
    try:
        import pyarrow  # noqa: F401
        p = os.path.join(dossier, "crible_resultats.parquet")
        df.to_parquet(p, index=False)
        chemins["parquet"] = p
    except ImportError:
        journal("pyarrow absent : pas de fichier Parquet")
    return chemins


# ---------------------------------------------------------------------------
# Programme
# ---------------------------------------------------------------------------

def executer(taches, fils=4, rafraichir=False, dossier_cache=None, fabrique=None, bavard=True):
    lignes, n = [], len(taches)
    if not taches:
        return lignes
    with ThreadPoolExecutor(max_workers=max(1, fils)) as pool:
        futurs = {pool.submit(traiter, tk, ctx, dossier_cache, rafraichir, fabrique): (tk, ctx) for tk, ctx in taches}
        for i, f in enumerate(as_completed(futurs), 1):
            tk, ctx = futurs[f]
            l = f.result()
            if ctx.get("bourse_screen"):
                l["bourse_screen"] = ctx["bourse_screen"]
            lignes.append(l)
            if bavard and (i % 25 == 0 or i == n):
                journal(f"  {i}/{n} sociétés traitées")
    return lignes


def _groupes_par_nom(candidats):
    """Regroupe les lignes de cotation d'une même société (même nom au screener), dans l'ordre."""
    groupes, index = [], {}
    for tk, ctx in candidats:
        cle = nom_normalise(ctx.get("nom_screen") or "") or tk.upper()
        if cle not in index:
            index[cle] = len(groupes)
            groupes.append([])
        groupes[index[cle]].append((tk, ctx))
    return groupes


def remplir_quotas(files, fils=4, rafraichir=False, dossier_cache=None, fabrique=None):
    """
    Pour chaque bourse, traite les candidats dans l'ordre des capitalisations,
    par lots, jusqu'à obtenir `quota` sociétés distinctes au statut OK. Les
    lignes d'une même société (Roche RO.SW et ROP.SW) sont extraites ensemble,
    pour que le dédoublonnage garde la plus échangée. Les cotations secondaires
    (RETIRE) et les erreurs ne comptent pas.
    """
    lignes = []
    for f in files:
        groupes, i, res, societes = _groupes_par_nom(f["candidats"]), 0, [], set()
        while len(societes) < f["quota"] and i < len(groupes):
            lot = [c for g in groupes[i:i + (f["quota"] - len(societes))] for c in g]
            i += f["quota"] - len(societes)
            r = executer(lot, fils, rafraichir, dossier_cache, fabrique, bavard=False)
            societes |= {nom_normalise(l.get("nom")) or l["ticker"] for l in r if l.get("statut") == "OK"}
            res += r
        n_ret = sum(1 for l in res if l.get("statut") == "RETIRE")
        n_err = sum(1 for l in res if l.get("statut") == "ERREUR")
        manque = " (quota non atteint)" if len(societes) < f["quota"] else ""
        journal(f"  {f['bourse']} : {len(societes)}/{f['quota']} sociétés{manque}, {len(res)} lignes extraites "
                f"({n_ret} retirées, {n_err} erreurs)")
        lignes += res
    return lignes


def reprise_finale(lignes, pause=60.0, dossier_cache=None, fabrique=None, dormir=time.sleep):
    """
    Retente, une par une et après une pause, les sociétés restées en erreur 429.
    1er passage complet (13/11/2026) : 18 erreurs 429 malgré 4 essais, dont Sanofi,
    Hermès, BNP Paribas et AXA. Une société récupérée ici peut faire dépasser de
    peu le quota de sa bourse : on la garde.
    """
    a_refaire = [i for i, l in enumerate(lignes) if l.get("statut") == "ERREUR" and _est_429(l.get("motif") or "")]
    if not a_refaire:
        return lignes
    journal(f"Reprise finale : {len(a_refaire)} sociétés en erreur 429, pause de {pause:.0f} s")
    dormir(pause)
    recuperees = 0
    for i in a_refaire:
        ancienne = lignes[i]
        ctx = {"region": ancienne.get("region"), "liste": ancienne.get("liste")}
        if ancienne.get("bourse_screen"):
            ctx.update(bourse_screen=ancienne["bourse_screen"], pays_admis=pays_admis_bourse(ancienne["bourse_screen"]))
        l = traiter(ancienne["ticker"], ctx, dossier_cache, True, fabrique, essais=5, attente=10.0, dormir=dormir)
        if ctx.get("bourse_screen"):
            l["bourse_screen"] = ctx["bourse_screen"]
        lignes[i] = l
        recuperees += l.get("statut") != "ERREUR"
    journal(f"  {recuperees}/{len(a_refaire)} récupérées")
    return lignes


def main(argv=None):
    p = argparse.ArgumentParser(description="Extraction de l'univers du Crible des marchés.")
    p.add_argument("--limite", type=int, help="nombre maximal de sociétés par liste ou par bourse (essai)")
    p.add_argument("--regions", default="us,europe,ch,asie", help="us, europe, ch, asie (séparés par des virgules)")
    p.add_argument("--tickers", help="seulement ces tickers, séparés par des virgules")
    p.add_argument("--fils", type=int, default=4, help="requêtes en parallèle (2 en cas d'erreurs 429)")
    p.add_argument("--rafraichir", action="store_true", help="ignore le cache")
    p.add_argument("--sortie", default=ICI, help="dossier des fichiers produits")
    a = p.parse_args(argv)

    regions = {r.strip().lower() for r in a.regions.split(",") if r.strip()}
    tickers = [t.strip().upper() for t in a.tickers.split(",")] if a.tickers else None
    debut = time.time()
    taches, files, ecartes = construire_univers(regions, a.limite, tickers)
    journal(f"{len(taches)} tickers fixes et {len(files)} bourses à remplir")
    lignes = executer(taches, a.fils, a.rafraichir)
    if files:
        journal("Remplissage des quotas par bourse :")
        lignes += remplir_quotas(files, a.fils, a.rafraichir)
    reprise_finale(lignes)

    for l in lignes:
        if l.get("statut") == "OK" and not l.get("region"):
            l["region"] = region_depuis_pays(l.get("pays"))
    taux = taux_usd([l.get("devise") for l in lignes if l.get("statut") == "OK"] + DEVISES_SITE)
    ajouter_capi_usd(lignes, taux)
    retires = [{"ticker": tk, "motif": m} for tk, m in ecartes]
    retires += [{"ticker": l["ticker"], "motif": l.get("motif")} for l in lignes if l.get("statut") == "RETIRE"]
    lignes, n_ret, n_dbl = filtrer_et_dedoublonner(lignes)

    compte = {}
    for l in lignes:
        compte[l["statut"]] = compte.get(l["statut"], 0) + 1
    par_region = {}
    for l in lignes:
        if l["statut"] == "OK":
            par_region[l.get("region") or "—"] = par_region.get(l.get("region") or "—", 0) + 1
    meta = {
        "version": VERSION,
        "source": SOURCE,
        "date_extraction": datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M"),
        "nb_lignes": len(lignes),
        "statuts": compte,
        "regions": par_region,
        "cotations_secondaires_retirees": n_ret + len(ecartes),
        "doublons_retires": n_dbl,
        "retires": retires,
        "taux_usd": {d: taux.get(d) for d in DEVISES_SITE},
        "duree_s": round(time.time() - debut),
    }
    chemins = exporter(lignes, meta, a.sortie)
    journal(f"Fini en {meta['duree_s']} s : {compte} ; par région {par_region} ; "
            f"{n_ret + len(ecartes)} titres retirés (dont {len(ecartes)} sans extraction) et {n_dbl} doublons.")
    for k, v in chemins.items():
        journal(f"  {k} : {v}")


if __name__ == "__main__":
    main()
