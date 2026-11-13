"""
Tests hors ligne de crible_marches.py. Aucun appel réseau.
Lancer : python test_crible.py
"""

import json
import os
import re
import sys
import tempfile
import unittest
from datetime import datetime, timedelta, timezone

import pandas as pd

ICI = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, ICI)

import crible_marches as cm  # noqa: E402
from test_screener import FauxTicker, societe_solide  # noqa: E402


def info_complete(**plus):
    info = {
        "longName": "Solide SA", "shortName": "SOLIDE", "country": "France", "exchange": "PAR",
        "sector": "Industrials", "industry": "Machinery", "currency": "EUR", "financialCurrency": "EUR",
        "recommendationKey": "buy", "mostRecentQuarter": 1759190400,  # 30/09/2025
        "currentPrice": 50.0, "marketCap": 5_000.0, "trailingPE": 20.0, "forwardPE": 18.0,
        "enterpriseToEbitda": 12.0, "priceToBook": 3.0, "trailingAnnualDividendYield": 0.025,
        "payoutRatio": 0.4, "returnOnEquity": 0.18, "grossMargins": 0.5, "operatingMargins": 0.18,
        "profitMargins": 0.12, "revenueGrowth": 0.07, "earningsQuarterlyGrowth": 0.09,
        "totalDebt": 400.0, "totalCash": 100.0, "ebitda": 260.0, "freeCashflow": 200.0,
        "52WeekChange": 0.15, "fiftyTwoWeekHigh": 55.0, "targetMeanPrice": 60.0,
        "numberOfAnalystOpinions": 12, "beta": 0.7, "quoteType": "EQUITY",
    }
    info.update(plus)
    return info


def faux(info=None, dividendes=None):
    t = societe_solide()
    t.info = info if info is not None else info_complete()
    t.earnings_estimate = pd.DataFrame({"growth": [0.08, 0.1]}, index=["0y", "+1y"])
    if dividendes is not None:
        t.dividends = dividendes
    return t


def serie_div(par_an):
    """{année: montant annuel} → série de versements semestriels."""
    dates, vals = [], []
    for a, v in sorted(par_an.items()):
        dates += [pd.Timestamp(f"{a}-05-15", tz="Europe/Paris"), pd.Timestamp(f"{a}-11-15", tz="Europe/Paris")]
        vals += [v / 2, v / 2]
    return pd.Series(vals, index=pd.DatetimeIndex(dates))


class TestExtraction(unittest.TestCase):
    def test_extraire_tout_remplit_les_champs(self):
        l = cm.extraire_tout("SOL.PA", fabrique=lambda _: faux(), contexte={"region": "Europe", "liste": "Europe"})
        self.assertEqual(l["statut"], "OK")
        self.assertEqual(l["nom"], "Solide SA")
        self.assertEqual(l["trimestre"], "2025-09-30")
        self.assertEqual(l["exercice"], "2025-12-31")
        self.assertAlmostEqual(l["rendement_div_pct"], 2.5)
        self.assertAlmostEqual(l["marge_op_ttm_pct"], 18.0)
        self.assertAlmostEqual(l["croissance_ca_1y_pct"], 6.8)
        self.assertAlmostEqual(l["croissance_bpa_0y_pct"], 8.0)
        self.assertEqual(l["dette_nette_ttm"], 300.0)
        self.assertAlmostEqual(l["levier_ttm"], 300.0 / 260.0)
        self.assertFalse(l["tresorerie_nette"])
        self.assertAlmostEqual(l["rendement_fcf_pct"], 4.0)
        self.assertAlmostEqual(l["potentiel_pct"], 20.0)
        self.assertTrue(l["pea_possible"])
        self.assertEqual(l["verdict_defensif"], "RETENU")
        self.assertEqual(l["region"], "Europe")
        self.assertEqual(set(l), set(cm.CHAMPS))

    def test_champs_absents_restent_none(self):
        l = cm.extraire_tout("X", fabrique=lambda _: FauxTicker(info={"longName": "Vide"}))
        self.assertEqual(l["statut"], "OK")
        for k in ("cours", "per_prev", "beta", "dette_nette_ttm", "levier_ttm", "rendement_fcf_pct",
                  "croissance_ca_1y_pct", "div_annees", "capi", "pea_possible"):
            self.assertIsNone(l[k], k)
        self.assertEqual(l["verdict_defensif"], "À VÉRIFIER")

    def test_info_vide_donne_erreur(self):
        l = cm.extraire_tout("ZZZ", fabrique=lambda _: FauxTicker(info={}))
        self.assertEqual(l["statut"], "ERREUR")
        self.assertTrue(l["motif"])

    def test_pas_une_action(self):
        l = cm.extraire_tout("SPY", fabrique=lambda _: FauxTicker(info={"longName": "SPDR", "quoteType": "ETF"}))
        self.assertEqual(l["statut"], "ERREUR")

    def test_exclusion_par_nom_apres_info(self):
        l = cm.extraire_tout("NESTLEIND.NS", fabrique=lambda _: faux(info_complete(longName="Nestlé India")))
        self.assertEqual(l["statut"], "EXCLU")

    def test_exclusion_sans_reseau(self):
        def fabrique(_):
            raise AssertionError("pas de réseau pour Nestlé")
        self.assertEqual(cm.traiter("NESN.SW", fabrique=fabrique)["statut"], "EXCLU")

    def test_cotation_secondaire(self):
        l = cm.extraire_tout("APC.DE", fabrique=lambda _: faux(info_complete(country="United States")),
                             contexte={"pays_admis": cm.pays_admis_bourse("GER")})
        self.assertEqual(l["statut"], "RETIRE")

    def test_cotation_secondaire_europeenne(self):
        """ABB (Suisse) à Stockholm : la Suisse a sa bourse dans l'univers, donc cotation secondaire."""
        l = cm.extraire_tout("ABB.ST", fabrique=lambda _: faux(info_complete(country="Switzerland")),
                             contexte={"pays_admis": cm.pays_admis_bourse("STO")})
        self.assertEqual(l["statut"], "RETIRE")

    def test_pays_sans_bourse_admis(self):
        l = cm.extraire_tout("MT.AS", fabrique=lambda _: faux(info_complete(country="Luxembourg")),
                             contexte={"pays_admis": cm.pays_admis_bourse("AMS")})
        self.assertEqual(l["statut"], "OK")

    def test_cotation_principale_hors_pays(self):
        l = cm.extraire_tout("AIR.PA", fabrique=lambda _: faux(info_complete(country="Netherlands")),
                             contexte={"pays_admis": cm.pays_admis_bourse("PAR")})
        self.assertEqual(l["statut"], "OK")

    def test_sans_pays_retire_si_liste_de_bourse(self):
        """Obligation Crédit Agricole à Paris : pas de pays de siège."""
        info = {"longName": "Crédit Agricole S.A. 1.4% BDS", "quoteType": "EQUITY", "currentPrice": 98.7}
        l = cm.extraire_tout("ACALS.PA", fabrique=lambda _: FauxTicker(info=info),
                             contexte={"pays_admis": cm.pays_admis_bourse("PAR")})
        self.assertEqual(l["statut"], "RETIRE")
        # sans filtre de bourse (ticker demandé), la ligne reste
        self.assertEqual(cm.extraire_tout("ACALS.PA", fabrique=lambda _: FauxTicker(info=info))["statut"], "OK")

    def test_londres_en_pence_pas_de_rendement_fcf(self):
        l = cm.extraire_tout("SOL.L", fabrique=lambda _: faux(info_complete(currency="GBp", financialCurrency="GBP")))
        self.assertIsNone(l["rendement_fcf_pct"])

    def test_volume_moyen(self):
        l = cm.extraire_tout("SOL.PA", fabrique=lambda _: faux(info_complete(averageVolume=2_000_000)))
        self.assertEqual(l["volume_moyen"], 2_000_000)

    def test_tresorerie_nette(self):
        l = cm.extraire_tout("CASH", fabrique=lambda _: faux(info_complete(totalDebt=50.0, totalCash=300.0)))
        self.assertTrue(l["tresorerie_nette"])
        self.assertLess(l["levier_ttm"], 0)

    def test_ebitda_negatif_levier_inconnu(self):
        l = cm.extraire_tout("NEG", fabrique=lambda _: faux(info_complete(ebitda=-10.0)))
        self.assertIsNone(l["levier_ttm"])


class TestDividendes(unittest.TestCase):
    def test_sans_baisse(self):
        s = serie_div({2019: 1.0, 2020: 1.1, 2021: 1.2, 2022: 1.3, 2023: 1.4, 2024: 1.5, 2025: 1.6, 2026: 0.8})
        n, baisses, g = cm.stats_dividendes(s, annee_courante=2026)
        self.assertEqual(n, 7)  # 2026 n'est pas complète
        self.assertEqual(baisses, 0)
        self.assertAlmostEqual(g, 100 * ((1.6 / 1.0) ** (1 / 6) - 1))

    def test_baisse_et_interruption(self):
        s = serie_div({2018: 2.0, 2020: 1.0, 2021: 1.2, 2022: 0.9, 2023: 1.0, 2024: 1.1, 2025: 1.2})
        n, baisses, _ = cm.stats_dividendes(s, annee_courante=2026)
        self.assertEqual(n, 6)  # la série s'arrête au trou de 2019
        self.assertEqual(baisses, 1)

    def test_plus_de_dividende(self):
        s = serie_div({2020: 1.0, 2021: 1.0})
        self.assertEqual(cm.stats_dividendes(s, annee_courante=2026), (0, 0, None))

    def test_historique_absent(self):
        self.assertEqual(cm.stats_dividendes(None), (None, None, None))
        self.assertEqual(cm.stats_dividendes(pd.Series(dtype=float)), (None, None, None))

    def test_extraction_lit_les_dividendes(self):
        s = serie_div({a: 1.0 + 0.1 * i for i, a in enumerate(range(2016, datetime.now(timezone.utc).year))})
        l = cm.extraire_tout("DIV", fabrique=lambda _: faux(dividendes=s))
        self.assertGreaterEqual(l["div_annees"], 5)
        self.assertEqual(l["div_baisses"], 0)


class TestCache(unittest.TestCase):
    def test_aller_retour_et_peremption(self):
        with tempfile.TemporaryDirectory() as d:
            cm.ecrire_cache(d, "ROG.SW", {"ticker": "ROG.SW", "statut": "OK"})
            self.assertEqual(cm.lire_cache(d, "ROG.SW")["statut"], "OK")
            plus_tard = datetime.now(timezone.utc) + timedelta(days=4)
            self.assertIsNone(cm.lire_cache(d, "ROG.SW", maintenant=plus_tard))
            self.assertIsNone(cm.lire_cache(d, "ABSENT"))

    def test_cache_d_une_ancienne_version_ignore(self):
        with tempfile.TemporaryDirectory() as d:
            with open(os.path.join(d, "ABB.ST.json"), "w", encoding="utf-8") as f:
                json.dump({"date": datetime.now(timezone.utc).isoformat(), "ligne": {"statut": "OK"}}, f)
            self.assertIsNone(cm.lire_cache(d, "ABB.ST"))

    def test_traiter_utilise_le_cache(self):
        with tempfile.TemporaryDirectory() as d:
            appels = []

            def fabrique(tk):
                appels.append(tk)
                return faux()
            cm.traiter("SOL.PA", {"region": "Europe", "liste": "Europe"}, d, fabrique=fabrique)
            l = cm.traiter("SOL.PA", {"region": "Europe", "liste": "Europe"}, d, fabrique=fabrique)
            self.assertEqual(len(appels), 1)
            self.assertEqual(l["statut"], "OK")
            cm.traiter("SOL.PA", None, d, rafraichir=True, fabrique=fabrique)
            self.assertEqual(len(appels), 2)

    def test_erreur_pas_mise_en_cache(self):
        with tempfile.TemporaryDirectory() as d:
            cm.traiter("ZZZ", None, d, fabrique=lambda _: FauxTicker(info={}))
            self.assertIsNone(cm.lire_cache(d, "ZZZ"))

    def test_reprises_sur_429(self):
        with tempfile.TemporaryDirectory() as d:
            essais, pauses = [], []

            class Limite(Exception):
                pass

            def fabrique(_):
                essais.append(1)
                if len(essais) < 3:
                    raise Limite("Too Many Requests. Rate limited. Try after a while.")
                return faux()
            l = cm.traiter("SOL.PA", None, d, fabrique=fabrique, dormir=pauses.append)
            self.assertEqual(l["statut"], "OK")
            self.assertEqual(pauses, [5.0, 15.0])

    def test_reprise_finale(self):
        """1er passage complet : Sanofi, Hermès… restés en 429 après 4 essais."""
        with tempfile.TemporaryDirectory() as d:
            erreur = cm.ligne_vide("SAN.PA", {"region": "Europe", "liste": "Europe"})
            erreur.update(statut="ERREUR", motif="YFRateLimitError : Too Many Requests. Rate limited.",
                          bourse_screen="PAR")
            autre = cm.ligne_vide("X")
            autre.update(statut="ERREUR", motif="KeyError : boum")
            pauses = []
            lignes = cm.reprise_finale([erreur, autre], dossier_cache=d,
                                       fabrique=lambda _: faux(info_complete()), dormir=pauses.append)
            self.assertEqual(lignes[0]["statut"], "OK")
            self.assertEqual(lignes[0]["bourse_screen"], "PAR")
            self.assertEqual(lignes[1]["statut"], "ERREUR")  # pas une 429 : pas de nouvel essai
            self.assertEqual(pauses, [60.0])

    def test_autre_erreur_sans_reprise(self):
        with tempfile.TemporaryDirectory() as d:
            pauses = []

            def fabrique(_):
                raise KeyError("boum")
            l = cm.traiter("X", None, d, fabrique=fabrique, dormir=pauses.append)
            self.assertEqual(l["statut"], "ERREUR")
            self.assertEqual(pauses, [])


class TestDedoublonnage(unittest.TestCase):
    def ligne(self, tk, nom, pays, bourse=None, liste="Europe", capi=1.0, statut="OK"):
        return {"ticker": tk, "nom": nom, "pays": pays, "bourse_screen": bourse, "liste": liste,
                "capi_usd": capi, "statut": statut}

    def test_retire_secondaires_et_doublons(self):
        lignes = [
            self.ligne("AIR.PA", "Airbus SE", "Netherlands", "PAR", capi=150),
            self.ligne("AIR.DE", "Airbus SE", "Netherlands", "GER", capi=140),
            self.ligne("SAP.DE", "SAP SE", "Germany", "GER"),
            self.ligne("SAP", "SAP SE", "Germany", None, liste="Extra"),
            self.ligne("APC.DE", "Apple Inc.", "United States", "GER", statut="RETIRE"),
            self.ligne("ERR", None, None, statut="ERREUR"),
        ]
        gardees, sec, dbl = cm.filtrer_et_dedoublonner(lignes)
        tk = sorted(l["ticker"] for l in gardees)
        self.assertEqual(tk, ["AIR.PA", "ERR", "SAP.DE"])
        self.assertEqual(sec, 1)
        self.assertEqual(dbl, 2)

    def test_sp500_prioritaire_hors_pays_du_siege(self):
        lignes = [self.ligne("LIN.DE", "Linde plc", "Ireland", "GER", capi=300),
                  self.ligne("LIN", "Linde plc", "Ireland", None, liste="S&P 500", capi=200)]
        gardees, _, _ = cm.filtrer_et_dedoublonner(lignes)
        self.assertEqual([l["ticker"] for l in gardees], ["LIN"])

    def test_hors_pays_la_plus_echangee_gagne(self):
        """Airbus (Pays-Bas) à Paris et à Madrid : aucune n'est « maison », on garde la plus échangée."""
        a = self.ligne("AIR.MC", "Airbus SE", "Netherlands", "MCE", capi=180)
        b = self.ligne("AIR.PA", "Airbus SE", "Netherlands", "PAR", capi=180)
        a["echanges_jour_usd"], b["echanges_jour_usd"] = 5e6, 300e6
        gardees, _, _ = cm.filtrer_et_dedoublonner([a, b])
        self.assertEqual([l["ticker"] for l in gardees], ["AIR.PA"])

    def test_nom_normalise(self):
        self.assertEqual(cm.nom_normalise("Roche Holding AG"), cm.nom_normalise("Roche Holding Ltd"))
        self.assertNotEqual(cm.nom_normalise("Coca-Cola Co"), cm.nom_normalise("Cola Corp"))


class TestTauxEtCapi(unittest.TestCase):
    def test_taux_usd_et_pence(self):
        cours = {"EURUSD=X": 1.10, "GBPUSD=X": 1.30, "CHFUSD=X": 1.20}

        class FX:
            def __init__(self, tk):
                self.fast_info = {"last_price": cours[tk]} if tk in cours else {}
        taux = cm.taux_usd(["EUR", "GBp", "CHF", "XXX", None], fabrique=FX)
        self.assertEqual(taux["USD"], 1.0)
        self.assertAlmostEqual(taux["GBp"], 0.013)
        self.assertAlmostEqual(taux["GBP"], 1.30)
        self.assertIsNone(taux["XXX"])
        lignes = cm.ajouter_capi_usd([{"capi": 100.0, "devise": "EUR"}, {"capi": 100.0, "devise": "XXX"},
                                      {"capi": None, "devise": "EUR"}], taux)
        self.assertAlmostEqual(lignes[0]["capi_usd"], 110.0)
        self.assertIsNone(lignes[1]["capi_usd"])
        self.assertIsNone(lignes[2]["capi_usd"])

    def test_londres_capi_en_livres_cours_en_pence(self):
        """HSBC, 1er essai du 13/11/2026 : cours 1 349,2 GBp, capitalisation Yahoo en GBP."""
        taux = {"GBP": 1.3227514028549194, "GBp": 0.013227514028549194}
        l = cm.ajouter_capi_usd([{"capi": 236e9, "devise": "GBp", "cours": 1349.2, "volume_moyen": 20e6}], taux)[0]
        self.assertAlmostEqual(l["capi_usd"] / 1e9, 312.2, places=1)  # et non 3,1 Md$
        self.assertAlmostEqual(l["echanges_jour_usd"] / 1e6, 1349.2 * 20 * 0.013227514028549194, places=3)


class TestUnivers(unittest.TestCase):
    def test_tickers_demandes_sans_reseau(self):
        taches, files, ecartes = cm.construire_univers(set(), tickers=["NVDA", "nvda", "ROG.SW"])
        self.assertEqual([t for t, _ in taches], ["NVDA", "ROG.SW"])
        self.assertEqual((files, ecartes), ([], []))

    def test_preselection(self):
        """Candidats réels de Paris et Francfort au 1er essai du 13/11/2026."""
        exclus = {cm.nom_normalise(n) for n in ["Apple Inc.", "Microsoft", "Nvidia", "Alphabet Inc. (Class A)"]}
        cands = [("ACALS.PA", "Crédit Agricole S.A. 1.4% BDS 20/04/2027"), ("ACALK.PA", "Crédit Agricole S.A. 1.3% SNR BDS"),
                 ("APC.DE", "Apple Inc."), ("MSF.DE", "Microsoft Corporation"), ("ABEA.DE", "Alphabet Inc."),
                 ("NVD.DE", "NVIDIA Corporation"), ("SAP.DE", "SAP SE"), ("MC.PA", "LVMH Moët Hennessy - Louis Vuitton"),
                 ("X.DE", "")]
        gardes, ecartes = cm.preselectionner(cands, exclus)
        self.assertEqual([t for t, _ in gardes], ["SAP.DE", "MC.PA", "X.DE"])
        self.assertEqual(len(ecartes), 6)

    def test_remplir_quotas_passe_les_secondaires(self):
        """Comme à Francfort : les premiers candidats sont étrangers, on continue jusqu'au quota."""
        pays = {"APC.DE": "United States", "MSF.DE": "United States", "SAP.DE": "Germany",
                "SIE.DE": "Germany", "ALV.DE": "Germany", "DTE.DE": "Germany"}
        ctx = {"region": "Europe", "liste": "Europe", "pays_admis": cm.pays_admis_bourse("GER"), "bourse_screen": "GER"}
        files = [{"bourse": "GER", "region": "Europe", "quota": 3,
                  "candidats": [(tk, dict(ctx)) for tk in pays]}]
        appels = []

        def fabrique(tk):
            appels.append(tk)
            return faux(info_complete(country=pays[tk], longName=tk))
        with tempfile.TemporaryDirectory() as d:
            lignes = cm.remplir_quotas(files, fils=2, dossier_cache=d, fabrique=fabrique)
        ok = sorted(l["ticker"] for l in lignes if l["statut"] == "OK")
        self.assertEqual(ok, ["ALV.DE", "SAP.DE", "SIE.DE"])
        self.assertNotIn("DTE.DE", appels)  # quota atteint : on s'arrête
        self.assertEqual(sum(1 for l in lignes if l["statut"] == "RETIRE"), 2)

    def test_preselection_debut_de_nom_sur_bourse_internationale(self):
        """2e essai du 13/11/2026 : Amazon, Cisco, Costco et Eli Lilly passaient à Francfort et Vienne."""
        sp = {cm.nom_normalise(n) for n in ["Amazon", "Cisco", "Costco", "Eli Lilly and Company", "Target"]}
        cands = [("AMZ.DE", "Amazon.com, Inc."), ("CIS.DE", "Cisco Systems, Inc."),
                 ("CTO.DE", "Costco Wholesale Corporation"), ("LLY.DE", "Eli Lilly & Co"), ("SAP.DE", "SAP SE")]
        gardes, _ = cm.preselectionner(cands, sp, debut=True)
        self.assertEqual([t for t, _ in gardes], ["SAP.DE"])
        # Ailleurs, nom exact seulement : « Target Healthcare REIT » reste à Londres
        gardes, _ = cm.preselectionner([("THRL.L", "Target Healthcare REIT plc")], sp, debut=False)
        self.assertEqual(len(gardes), 1)

    def test_preselection_carrefour(self):
        """Sur Xetra, ASML et Roche sont déjà candidates à Amsterdam et à Zurich."""
        ailleurs = {cm.nom_normalise(n) for n in ["ASML Holding N.V.", "Roche Holding AG"]}
        cands = [("ASME.DE", "ASML Holding N.V."), ("RHO.DE", "Roche Holding AG"), ("SIE.DE", "Siemens AG")]
        gardes, ecartes = cm.preselectionner(cands, set(), noms_ailleurs=ailleurs)
        self.assertEqual([t for t, _ in gardes], ["SIE.DE"])
        self.assertIn("autre bourse", ecartes[0][1])

    def test_lignes_d_une_meme_societe_extraites_ensemble(self):
        """Suisse, 2e essai : Roche (RO.SW, ROP.SW) et Novartis (NOVN.SW, NOVNEE.SW) remplissaient le quota."""
        lignes_six = [("RO.SW", "Roche Holding AG", 29_663), ("NOVN.SW", "Novartis AG", 3_247_094),
                      ("NOVNEE.SW", "Novartis AG", 283_687), ("ROP.SW", "Roche Holding AG", 978_397),
                      ("ABBN.SW", "ABB Ltd", 2_000_000), ("UBSG.SW", "UBS Group AG", 9_000_000)]
        info = {tk: (nom, vol) for tk, nom, vol in lignes_six}
        ctx = {"region": "Suisse", "liste": "Suisse", "pays_admis": cm.pays_admis_bourse("EBS"), "bourse_screen": "EBS"}
        files = [{"bourse": "EBS", "region": "Suisse", "quota": 3,
                  "candidats": [(tk, dict(ctx, nom_screen=nom)) for tk, nom, _ in lignes_six]}]

        def fabrique(tk):
            return faux(info_complete(country="Switzerland", longName=info[tk][0], averageVolume=info[tk][1],
                                      currency="CHF", financialCurrency="CHF"))
        with tempfile.TemporaryDirectory() as d:
            lignes = cm.remplir_quotas(files, fils=2, dossier_cache=d, fabrique=fabrique)
        cm.ajouter_capi_usd(lignes, {"CHF": 1.19, "USD": 1.0})
        gardees, _, dbl = cm.filtrer_et_dedoublonner(lignes)
        self.assertEqual(sorted(l["ticker"] for l in gardees), ["ABBN.SW", "NOVN.SW", "ROP.SW"])
        self.assertEqual(dbl, 2)

    def test_pays_admis_bourse(self):
        self.assertIn("Germany", cm.pays_admis_bourse("GER"))
        self.assertIn("Luxembourg", cm.pays_admis_bourse("GER"))
        self.assertNotIn("Switzerland", cm.pays_admis_bourse("STO"))
        self.assertEqual(cm.pays_admis_bourse("JPX"), {"Japan"})
        self.assertIsNone(cm.pays_admis_bourse("NYQ"))

    def test_region_depuis_pays(self):
        self.assertEqual(cm.region_depuis_pays("United States"), "États-Unis")
        self.assertEqual(cm.region_depuis_pays("Switzerland"), "Suisse")
        self.assertEqual(cm.region_depuis_pays("France"), "Europe")
        self.assertEqual(cm.region_depuis_pays("Japan"), "Asie")
        self.assertIsNone(cm.region_depuis_pays("Brazil"))

    def test_quotas_environ_1300(self):
        total = 503 + sum(cm.EUROPE.values()) + sum(cm.SUISSE.values()) + sum(cm.ASIE.values())
        self.assertTrue(1200 <= total <= 1400, total)


class TestExport(unittest.TestCase):
    def test_json_csv_parquet(self):
        l = cm.extraire_tout("SOL.PA", fabrique=lambda _: faux(), contexte={"region": "Europe", "liste": "Europe"})
        l["capi_usd"] = 5500.0
        l["bourse_screen"] = "PAR"  # champ interne, pas exporté
        nan = cm.ligne_vide("ERR")
        nan.update(statut="ERREUR", motif="test", cours=float("nan"))
        with tempfile.TemporaryDirectory() as d:
            chemins = cm.exporter([l, nan], {"date_extraction": "2026-11-13 10:00"}, d)
            with open(chemins["json"], encoding="utf-8") as f:
                j = json.load(f)
            self.assertEqual(set(j), {"meta", "lignes"})
            self.assertEqual(list(j["lignes"][0]), cm.CHAMPS)
            self.assertIsNone(j["lignes"][1]["cours"])  # NaN → null, jamais 0
            self.assertNotIn("bourse_screen", j["lignes"][0])
            csv = pd.read_csv(chemins["csv"], sep=";", decimal=",")
            self.assertEqual(len(csv), 2)
            if "parquet" in chemins:
                pq = pd.read_parquet(chemins["parquet"])
                self.assertEqual(list(pq.columns), cm.CHAMPS)
                self.assertTrue(pd.isna(pq.loc[1, "cours"]))
                self.assertAlmostEqual(pq.loc[0, "capi_usd"], 5500.0)

    def test_champs_lus_par_le_site(self):
        """Chaque champ du SCHEMA du site existe dans l'export (contrat avec le site)."""
        with open(os.path.join(ICI, "moteur_site.js"), encoding="utf-8") as f:
            js = f.read()
        bloc = js[js.index("const SCHEMA"):js.index("function normaliserLigne")]
        champs_site = set(re.findall(r'"([a-z0-9_]+)"', bloc))
        manquants = champs_site - set(cm.CHAMPS) - {"str", "bool", "num"}
        self.assertEqual(manquants, set())


if __name__ == "__main__":
    r = unittest.TextTestRunner(verbosity=1).run(unittest.defaultTestLoader.loadTestsFromModule(sys.modules[__name__]))
    print("Tous les tests passent." if r.wasSuccessful() else "Des tests échouent.")
    sys.exit(0 if r.wasSuccessful() else 1)
