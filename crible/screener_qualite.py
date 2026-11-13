"""
screener_qualite.py — Profil défensif du Crible des marchés.

Sept critères : capex productif, pouvoir de fixer ses prix, retours payés par
le cash, croissance du CA, PER prévisionnel, dette nette / EBITDA, bêta.

Logique à trois valeurs : chaque critère vaut OK, ÉCHEC ou INCONNU.
Un échec avéré l'emporte ; sinon une seule inconnue donne INCONNU.
Verdict : RETENU, À VÉRIFIER ou EXCLU.

evaluer() est la copie exacte du moteur JavaScript du site (moteur_site.js).
Toute modification ici doit être reportée là-bas, et inversement :
test_concordance.py compare les deux sur des milliers de cas aléatoires.

Une valeur peut être un nombre, une plage [min, max] (sources divergentes) ou
None (inconnu). Une donnée manquante n'est jamais remplacée par 0, sauf une
exception documentée : une ligne « rachats » ou « dividendes » absente des
états compte pour 0, et une note le signale.

Usage seul :
    python screener_qualite.py --univers univers.csv
"""

from __future__ import annotations

import argparse
import csv
import math
import re
import statistics
import sys
from datetime import datetime, timezone

OK, ECHEC, INCONNU = "OK", "ÉCHEC", "INCONNU"

# ---------------------------------------------------------------------------
# Seuils du profil défensif. Mêmes clés que SEUILS_DEFAUT dans le site :
# le site peut générer ce bloc, à coller ici tel quel.
# Aucun seuil ne change en silence (règle 7 du CLAUDE.md).
# ---------------------------------------------------------------------------
CRITERES = {
    "capex_min_pct_ca": 2.0,
    "marge_brute_ecart_type_max": 3.0,
    "marge_op_min_pct": 12.0,
    "croissance_min_pct": 5.0,
    "croissance_max_pct": 12.0,
    "per_max": 25.0,
    "dette_nette_ebitda_max": 2.5,
    "hausse_dette_nette_max_pct": 10.0,
    "beta_max": 1.0,
}

LISTE_CRITERES = [
    ("capex", 1, "Capex productif"),
    ("prix", 2, "Pouvoir de fixer ses prix"),
    ("cash", 3, "Retours payés par le cash"),
    ("croissance", 4, "Croissance du CA"),
    ("per", 5, "PER prévisionnel"),
    ("levier", 6, "Dette nette / EBITDA"),
    ("beta", 7, "Bêta"),
]

# ---------------------------------------------------------------------------
# Exclusions à vie (règle 6 du CLAUDE.md). Ne jamais retirer.
# ---------------------------------------------------------------------------
EXCLUSIONS = {
    "NESN.SW": "Nestlé — boycott, exclue à vie",
    "NSRGY": "Nestlé (ADR) — boycott, exclue à vie",
    "NSRGF": "Nestlé (OTC) — boycott, exclue à vie",
}
_RE_NESTLE = re.compile(r"nestl[eé]", re.IGNORECASE)


def _exclusion(ticker, nom=None):
    """Motif d'exclusion du ticker ou du nom, sinon None."""
    t = str(ticker or "").upper().strip()
    if t in EXCLUSIONS:
        return EXCLUSIONS[t]
    if _RE_NESTLE.search(str(nom or "")):
        return "Nestlé — boycott, exclue à vie"
    return None


# ---------------------------------------------------------------------------
# Format (français)
# ---------------------------------------------------------------------------

def _plage(v):
    return isinstance(v, (list, tuple))


def fmt(v, d=1):
    if v is None:
        return "—"
    if _plage(v):
        return fmt(v[0], d) + " – " + fmt(v[1], d)
    txt = f"{v:,.{d}f}".replace(",", " ").replace(".", ",")
    if "," in txt:
        txt = txt.rstrip("0").rstrip(",")
    return txt


def fmt_fixe(v, d):
    if v is None:
        return "—"
    if _plage(v):
        return fmt_fixe(v[0], d) + " – " + fmt_fixe(v[1], d)
    return f"{v:,.{d}f}".replace(",", " ").replace(".", ",")


def signe(v, d=1):
    if _plage(v):
        return signe(v[0], d) + " à " + signe(v[1], d)
    return ("+" if v > 0 else "") + fmt(v, d)


def oui_non(b):
    return "inconnu" if b is None else ("oui" if b else "non")


# ---------------------------------------------------------------------------
# Comparaisons à trois valeurs : True (passe), False (échoue), None (inconnu)
# ---------------------------------------------------------------------------

def au_moins(v, minimum):
    if v is None:
        return None
    if _plage(v):
        if v[0] >= minimum:
            return True
        if v[1] < minimum:
            return False
        return None
    return v >= minimum


def au_plus(v, maximum):
    if v is None:
        return None
    if _plage(v):
        if v[1] <= maximum:
            return True
        if v[0] > maximum:
            return False
        return None
    return v <= maximum


def entre(v, a, b):
    x, y = au_moins(v, a), au_plus(v, b)
    if x is False or y is False:
        return False
    if x is None or y is None:
        return None
    return True


def _statut(*tests):
    """Un échec avéré l'emporte ; sinon une seule inconnue donne INCONNU."""
    if any(t is False for t in tests):
        return ECHEC
    if any(t is None for t in tests):
        return INCONNU
    return OK


def _chevauche(t):
    return " Les sources encadrent le seuil : impossible de trancher." if t is None else ""


# ---------------------------------------------------------------------------
# Lecture des états annuels (réseau : via l'objet yfinance)
# ---------------------------------------------------------------------------

def _num(v):
    """Nombre fini ou None. Ne remplace jamais une absence par 0."""
    if v is None or isinstance(v, bool):
        return None
    try:
        x = float(v)
    except (TypeError, ValueError):
        return None
    return x if math.isfinite(x) else None


def _cle(s):
    return re.sub(r"[^a-z0-9]", "", str(s).lower())


def _ligne(df, *intitules):
    """
    Série d'une ligne d'un état financier, colonnes de la plus récente à la
    plus ancienne. Plusieurs intitulés sont essayés, avec ou sans espaces
    (Yahoo les change parfois). None si aucune ligne n'existe.
    """
    if df is None or getattr(df, "empty", True):
        return None
    index = {_cle(i): i for i in df.index}
    for nom in intitules:
        vrai = index.get(_cle(nom))
        if vrai is not None:
            serie = df.loc[vrai]
            if getattr(serie, "ndim", 1) > 1:  # intitulé en double
                serie = serie.iloc[0]
            return serie
    return None


def _colonnes_triees(df):
    """Colonnes de la plus récente à la plus ancienne."""
    try:
        return sorted(df.columns, reverse=True)
    except TypeError:
        return list(df.columns)


def _valeurs(df, *intitules):
    """Liste [récent → ancien] des valeurs d'une ligne (None si case vide). None si ligne absente."""
    serie = _ligne(df, *intitules)
    if serie is None:
        return None
    return [_num(serie.get(c)) for c in _colonnes_triees(df)]


def _premier(vals):
    return vals[0] if vals else None


def _date_colonne(df):
    try:
        c = _colonnes_triees(df)[0]
        return c.strftime("%Y-%m-%d") if hasattr(c, "strftime") else str(c)[:10]
    except Exception:
        return None


def _estimation(df, periode, colonne="growth"):
    """Valeur d'une estimation du consensus (périodes '0q', '+1q', '0y', '+1y')."""
    try:
        if df is None or df.empty or periode not in df.index or colonne not in df.columns:
            return None
        return _num(df.at[periode, colonne])
    except Exception:
        return None


def completer_etats(m, t):
    """
    Complète le dict m avec les états annuels de l'objet yfinance t.
    Les valeurs absentes restent None. Renvoie m.
    """
    try:
        compte = t.income_stmt
    except Exception:
        compte = None
    try:
        flux = t.cashflow
    except Exception:
        flux = None
    try:
        bilan = t.balance_sheet
    except Exception:
        bilan = None

    ca = _valeurs(compte, "Total Revenue", "Operating Revenue")
    marge_brute = _valeurs(compte, "Gross Profit")
    if marge_brute is None:
        cout = _valeurs(compte, "Cost Of Revenue", "Reconciled Cost Of Revenue")
        if cout is not None and ca is not None:
            marge_brute = [r - c if r is not None and c is not None else None for r, c in zip(ca, cout)]
    res_op = _valeurs(compte, "Operating Income", "Total Operating Income As Reported")
    ebitda = _valeurs(compte, "EBITDA")
    if ebitda is None or _premier(ebitda) is None:
        da = _valeurs(flux, "Depreciation And Amortization", "Depreciation Amortization Depletion")
        if da is None:
            da = _valeurs(compte, "Reconciled Depreciation")
        if res_op is not None and da is not None:
            ebitda = [o + d if o is not None and d is not None else None for o, d in zip(res_op, da)]

    capex = _valeurs(flux, "Capital Expenditure", "Capital Expenditure Reported")
    cfo = _valeurs(flux, "Operating Cash Flow", "Cash Flow From Continuing Operating Activities")
    fcf = _valeurs(flux, "Free Cash Flow")
    rachats = _valeurs(flux, "Repurchase Of Capital Stock", "Common Stock Payments")
    dividendes = _valeurs(flux, "Cash Dividends Paid", "Common Stock Dividend Paid")

    dette = _valeurs(bilan, "Total Debt")
    tresorerie = _valeurs(bilan, "Cash Cash Equivalents And Short Term Investments",
                          "Cash And Cash Equivalents")

    m["exercice"] = _date_colonne(compte) if compte is not None and not getattr(compte, "empty", True) else None
    m["ca_annuel"] = ca  # récent → ancien
    m["ca"] = _premier(ca)
    m["marge_brute_annuelle_pct"] = (
        [100 * g / r if g is not None and r not in (None, 0) else None for g, r in zip(marge_brute, ca)]
        if marge_brute is not None and ca is not None else None
    )
    m["resultat_op"] = _premier(res_op)
    m["ebitda"] = _premier(ebitda)
    c0 = _premier(capex)
    m["capex"] = abs(c0) if c0 is not None else None
    m["cfo"] = _premier(cfo)
    f0 = _premier(fcf)
    if f0 is None and m["cfo"] is not None and m["capex"] is not None:
        f0 = m["cfo"] - m["capex"]
    m["fcf"] = f0

    # Exception unique à la règle 2 : ligne absente = 0, avec une note.
    if rachats is None:
        m["rachats"], m["rachats_absents"] = 0.0, True
    else:
        r0 = _premier(rachats)
        m["rachats"], m["rachats_absents"] = (abs(r0) if r0 is not None else None), False
    if dividendes is None:
        m["dividendes"], m["dividendes_absents"] = 0.0, True
    else:
        d0 = _premier(dividendes)
        m["dividendes"], m["dividendes_absents"] = (abs(d0) if d0 is not None else None), False

    def _dn(i):
        if dette is None or tresorerie is None or len(dette) <= i or len(tresorerie) <= i:
            return None
        if dette[i] is None or tresorerie[i] is None:
            return None
        return dette[i] - tresorerie[i]

    m["dette_nette"] = _dn(0)
    m["dette_nette_prec"] = _dn(1)

    # Prévisions du consensus (croissance, en ratio : 0,08 = 8 %)
    try:
        estim = t.revenue_estimate
    except Exception:
        estim = None
    m["croissance_ca_1y"] = _estimation(estim, "+1y")
    m["croissance_ca_0y"] = _estimation(estim, "0y")
    return m


# ---------------------------------------------------------------------------
# Mesures brutes (hors ligne)
# ---------------------------------------------------------------------------

def _tcac(serie_recente_ancienne):
    """Taux de croissance annuel composé (%), du plus ancien au plus récent connu."""
    if not serie_recente_ancienne:
        return None, 0
    vals = [v for v in serie_recente_ancienne if v is not None]
    if len(vals) < 2:
        return None, len(vals)
    recent, ancien = serie_recente_ancienne[0], serie_recente_ancienne[-1]
    # On exige que les deux bornes soient connues : pas de trou comblé.
    if recent is None or ancien is None or ancien <= 0 or recent <= 0:
        return None, len(vals)
    n = len(serie_recente_ancienne) - 1
    return 100 * ((recent / ancien) ** (1 / n) - 1), n + 1


def mesures(m):
    """Chiffres bruts exportés, avec les noms de champs que lit le site."""
    ca = m.get("ca")
    capex = m.get("capex")
    cfo = m.get("cfo")

    capex_pct = 100 * capex / ca if capex is not None and ca not in (None, 0) and ca > 0 else None
    capex_couvert = (capex <= cfo) if capex is not None and cfo is not None else None

    res_op = m.get("resultat_op")
    marge_op = 100 * res_op / ca if res_op is not None and ca not in (None, 0) and ca > 0 else None

    mb = [v for v in (m.get("marge_brute_annuelle_pct") or [])[:4] if v is not None]
    ecart = statistics.stdev(mb) if len(mb) >= 3 else None

    rachats, dividendes = m.get("rachats"), m.get("dividendes")
    retours = rachats + dividendes if rachats is not None and dividendes is not None else None

    tcac, _ = _tcac(m.get("ca_annuel"))
    if m.get("croissance_ca_1y") is not None:
        croissance, source = 100 * m["croissance_ca_1y"], "prévision des analystes pour l'exercice suivant"
    elif m.get("croissance_ca_0y") is not None:
        croissance, source = 100 * m["croissance_ca_0y"], "prévision pour l'exercice en cours"
    elif tcac is not None:
        n = len(m.get("ca_annuel") or []) - 1
        croissance, source = tcac, f"moyenne annuelle des {n} derniers exercices"
    else:
        croissance, source = None, None

    return {
        "capex_pct_ca": capex_pct,
        "capex_couvert": capex_couvert,
        "marge_op_pct": marge_op,
        "marge_brute_ecart_type": ecart,
        "marge_brute_nb_annees": len(mb) if mb else None,
        "fcf": m.get("fcf"),
        "retours": retours,
        "rachats_absents": m.get("rachats_absents"),
        "dividendes_absents": m.get("dividendes_absents"),
        "dette_nette": m.get("dette_nette"),
        "dette_nette_prec": m.get("dette_nette_prec"),
        "ebitda": m.get("ebitda"),
        "croissance_pct": croissance,
        "croissance_source": source,
        "per_prev": m.get("per_prev"),
        "beta": m.get("beta"),
        "ca": ca,
        "dividendes_verses": dividendes,
        "tcac_ca_pct": tcac,
        "exercice": m.get("exercice"),
    }


# ---------------------------------------------------------------------------
# Évaluation : copie exacte de evaluer() du site
# ---------------------------------------------------------------------------

def _g(x, k):
    return x.get(k) if isinstance(x, dict) else None


def evaluer(x, s=None):
    s = s or CRITERES
    r = {}

    # 1. Capex
    pct, cv = _g(x, "capex_pct_ca"), _g(x, "capex_couvert")
    if pct is None and cv is None:
        r["capex"] = {"statut": INCONNU, "valeur": None,
                      "texte": "Capex, chiffre d'affaires ou cash-flow opérationnel manquant."}
    else:
        t = None if pct is None else au_moins(pct, s["capex_min_pct_ca"])
        r["capex"] = {
            "statut": _statut(t, cv),
            "valeur": None if pct is None else fmt(pct) + " %",
            "texte": ("Capex en % du CA inconnu." if pct is None else
                      f"Capex = {fmt(pct)} % du CA (seuil ≥ {fmt(s['capex_min_pct_ca'])} %)." + _chevauche(t))
            + f" Financé par le cash opérationnel : {oui_non(cv)}.",
        }

    # 2. Pouvoir de fixer ses prix (indice, pas une preuve)
    mop, ec = _g(x, "marge_op_pct"), _g(x, "marge_brute_ecart_type")
    if mop is None and ec is None:
        r["prix"] = {"statut": INCONNU, "valeur": None,
                     "texte": "Marges non disponibles (il faut 3 ans de marge brute et la marge opérationnelle)."}
    else:
        nb = _g(x, "marge_brute_nb_annees")
        r["prix"] = {
            "statut": _statut(None if mop is None else au_moins(mop, s["marge_op_min_pct"]),
                              None if ec is None else au_plus(ec, s["marge_brute_ecart_type_max"])),
            "valeur": None if mop is None else fmt(mop) + " %",
            "texte": ("Marge opérationnelle inconnue." if mop is None else
                      f"Marge opérationnelle {fmt(mop)} % (seuil ≥ {fmt(s['marge_op_min_pct'])} %).")
            + " " + ("Stabilité de la marge brute inconnue." if ec is None else
                     f"Écart-type de la marge brute {fmt(ec)} pts" + (f" sur {nb} ans" if nb else "")
                     + f" (seuil ≤ {fmt(s['marge_brute_ecart_type_max'])})."),
        }

    # 3. Dividendes + rachats couverts par le cash-flow libre, dette nette sous contrôle
    maxi = s["hausse_dette_nette_max_pct"]
    ratio, couvert = None, None
    if _g(x, "retours_sur_fcf") is not None:
        ratio = x["retours_sur_fcf"]
        couvert = au_plus(ratio, 1)
    elif _g(x, "fcf") is not None and _g(x, "retours") is not None:
        couvert = x["retours"] <= x["fcf"]
        ratio = x["retours"] / x["fcf"] if x["fcf"] > 0 else None
    h, h_ok, h_txt = None, None, "Évolution de la dette nette inconnue."
    dn, dnp = _g(x, "dette_nette"), _g(x, "dette_nette_prec")
    if _g(x, "hausse_dette_pct") is not None:
        h = x["hausse_dette_pct"]
        h_ok = au_plus(h, maxi)
        h_txt = f"Dette nette {signe(h)} % par an (seuil ≤ +{fmt(maxi)} %)." + _chevauche(h_ok)
    elif dn is not None and dnp is not None:
        if dnp <= 0:
            h_ok = dn <= 0 or dn <= abs(dnp) * maxi / 100
            h_txt = "Trésorerie nette l'année précédente ; dette nette " + (
                "toujours maîtrisée." if h_ok else "devenue significative.")
        else:
            h = 100 * (dn - dnp) / dnp
            h_ok = h <= maxi
            h_txt = f"Dette nette {signe(h)} % sur un an (seuil ≤ +{fmt(maxi)} %)."
    if ratio is not None:
        c_txt = f"Dividendes + rachats = {fmt(ratio, 2)} fois le cash-flow libre (seuil ≤ 1)."
    elif couvert is True:
        c_txt = "Dividendes + rachats couverts par le cash-flow libre."
    elif couvert is False:
        c_txt = "Dividendes + rachats supérieurs au cash-flow libre."
    else:
        c_txt = "Couverture des dividendes et rachats par le cash-flow libre inconnue."
    notes = []
    if _g(x, "rachats_absents"):
        notes.append("Pas de ligne rachats dans les données (comptés 0).")
    if _g(x, "dividendes_absents"):
        notes.append("Pas de ligne dividendes dans les données (comptés 0).")
    r["cash"] = {
        "statut": _statut(couvert, h_ok),
        "valeur": (fmt_fixe(ratio, 2) + "×") if ratio is not None else
                  (f"dette {signe(h, 1)} %/an" if h is not None else None),
        "texte": " ".join([c_txt, h_txt] + notes),
    }

    # 4. Croissance du chiffre d'affaires
    g, a, b = _g(x, "croissance_pct"), s["croissance_min_pct"], s["croissance_max_pct"]
    src = f" ({x['croissance_source']})" if _g(x, "croissance_source") else ""
    if g is None:
        r["croissance"] = {"statut": INCONNU, "valeur": None, "texte": "Croissance du chiffre d'affaires inconnue."}
    else:
        t = entre(g, a, b)
        suite = (f"Dans ta fourchette de {fmt(a)} à {fmt(b)} %." if t is True else
                 f"Hors de ta fourchette de {fmt(a)} à {fmt(b)} %." if t is False else
                 f"La fourchette chevauche ta borne ({fmt(a)} à {fmt(b)} %) : impossible de trancher.")
        r["croissance"] = {"statut": _statut(t), "valeur": fmt(g) + " %",
                           "texte": f"Croissance {fmt(g)} %{src}. " + suite}

    # 5. PER prévisionnel
    p, m_ = _g(x, "per_prev"), s["per_max"]
    if p is None or (not _plage(p) and p <= 0):
        r["per"] = {"statut": INCONNU, "valeur": None, "texte": "PER prévisionnel absent ou négatif."}
    else:
        t = au_plus(p, m_)
        r["per"] = {"statut": _statut(t), "valeur": fmt(p),
                    "texte": f"PER {fmt(p)} (seuil ≤ {fmt(m_)})." + _chevauche(t)}

    # 6. Levier
    m_, e = s["dette_nette_ebitda_max"], _g(x, "ebitda")
    if _g(x, "levier") is not None:
        t = au_plus(x["levier"], m_)
        r["levier"] = {"statut": _statut(t), "valeur": fmt_fixe(x["levier"], 1) + "×",
                       "texte": f"Dette nette = {fmt(x['levier'], 2)} fois l'EBITDA (seuil ≤ {fmt(m_)})." + _chevauche(t)}
    elif dn is None:
        r["levier"] = {"statut": INCONNU, "valeur": None, "texte": "Dette nette manquante."}
    elif dn <= 0:
        r["levier"] = {"statut": OK, "valeur": "trésorerie nette", "texte": "Trésorerie nette : pas de dette nette."}
    elif e is None:
        r["levier"] = {"statut": INCONNU, "valeur": None, "texte": "EBITDA manquant."}
    elif e <= 0:
        r["levier"] = {"statut": ECHEC, "valeur": None, "texte": "EBITDA négatif ou nul avec une dette nette positive."}
    else:
        lev = dn / e
        r["levier"] = {"statut": OK if lev <= m_ else ECHEC, "valeur": fmt_fixe(lev, 1) + "×",
                       "texte": f"Dette nette = {fmt(lev, 2)} fois l'EBITDA (seuil ≤ {fmt(m_)})."}

    # 7. Bêta
    bt, m_ = _g(x, "beta"), s["beta_max"]
    if bt is None:
        r["beta"] = {"statut": INCONNU, "valeur": None, "texte": "Bêta manquant."}
    else:
        t = au_plus(bt, m_)
        r["beta"] = {"statut": _statut(t), "valeur": fmt_fixe(bt, 2),
                     "texte": f"Bêta {fmt(bt, 2)} (seuil ≤ {fmt(m_, 2)})." + _chevauche(t)}
    return r


def verdict(res):
    statuts = [v["statut"] for v in res.values()]
    if ECHEC in statuts:
        return "EXCLU"
    if INCONNU in statuts:
        return "À VÉRIFIER"
    return "RETENU"


# ---------------------------------------------------------------------------
# Utilisation seule : python screener_qualite.py --univers univers.csv
# ---------------------------------------------------------------------------

def _lire_univers(chemin):
    with open(chemin, newline="", encoding="utf-8-sig") as f:
        lignes = f.read().splitlines()
    if not lignes:
        return []
    sep = ";" if lignes[0].count(";") >= lignes[0].count(",") else ","
    return [l["ticker"].strip() for l in csv.DictReader(lignes, delimiter=sep) if (l.get("ticker") or "").strip()]


def analyser_ticker(ticker, fabrique=None):
    """Ligne du CSV pour un ticker (réseau via yfinance)."""
    ex = _exclusion(ticker)
    if ex:
        return {"ticker": ticker, "verdict": "EXCLU", "motif": ex}
    if fabrique is None:
        import yfinance as yf
        fabrique = yf.Ticker
    t = fabrique(ticker)
    try:
        info = t.info or {}
    except Exception as e:  # noqa: BLE001
        return {"ticker": ticker, "verdict": "ERREUR", "motif": f"info indisponible : {e}"}
    nom = info.get("longName") or info.get("shortName")
    ex = _exclusion(ticker, nom)
    if ex:
        return {"ticker": ticker, "nom": nom, "verdict": "EXCLU", "motif": ex}
    m = {"per_prev": _num(info.get("forwardPE")), "beta": _num(info.get("beta"))}
    completer_etats(m, t)
    mes = mesures(m)
    res = evaluer(mes)
    ligne = {"ticker": ticker, "nom": nom, "verdict": verdict(res), "motif": None}
    for cle, _, _ in LISTE_CRITERES:
        ligne[f"{cle}_statut"] = res[cle]["statut"]
        ligne[f"{cle}_valeur"] = res[cle]["valeur"]
        ligne[f"{cle}_texte"] = res[cle]["texte"]
    ligne.update(mes)
    ligne["date_extraction"] = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M")
    ligne["source"] = "Yahoo Finance (yfinance)"
    return ligne


def main(argv=None):
    p = argparse.ArgumentParser(description="Filtre défensif seul (CSV « ; »).")
    p.add_argument("--univers", required=True, help="CSV avec une colonne « ticker »")
    p.add_argument("--sortie", default="resultats_filtre.csv")
    a = p.parse_args(argv)
    lignes = []
    for tk in _lire_univers(a.univers):
        print(f"… {tk}", file=sys.stderr)
        try:
            lignes.append(analyser_ticker(tk))
        except Exception as e:  # noqa: BLE001
            lignes.append({"ticker": tk, "verdict": "ERREUR", "motif": str(e)})
    champs = []
    for l in lignes:
        for k in l:
            if k not in champs:
                champs.append(k)
    with open(a.sortie, "w", newline="", encoding="utf-8-sig") as f:
        w = csv.DictWriter(f, fieldnames=champs, delimiter=";")
        w.writeheader()
        for l in lignes:
            w.writerow({k: ("" if v is None else v) for k, v in l.items()})
    compte = {}
    for l in lignes:
        compte[l["verdict"]] = compte.get(l["verdict"], 0) + 1
    print(f"{len(lignes)} sociétés → {a.sortie} : {compte}", file=sys.stderr)


if __name__ == "__main__":
    main()
