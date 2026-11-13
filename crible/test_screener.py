"""
Tests hors ligne du profil défensif (screener_qualite.py). Aucun appel réseau.
Lancer : python test_screener.py
"""

import os
import sys
import unittest

import pandas as pd

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import screener_qualite as sq  # noqa: E402
from screener_qualite import ECHEC, INCONNU, OK  # noqa: E402


# ---------------------------------------------------------------------------
# Fausse société : mêmes attributs que yfinance.Ticker, sans réseau
# ---------------------------------------------------------------------------

ANNEES = [pd.Timestamp("2025-12-31"), pd.Timestamp("2024-12-31"), pd.Timestamp("2023-12-31"),
          pd.Timestamp("2022-12-31")]


def etat(lignes, colonnes=ANNEES):
    """DataFrame façon yfinance : intitulés en index, exercices en colonnes."""
    return pd.DataFrame({c: {k: v[i] for k, v in lignes.items()} for i, c in enumerate(colonnes)})


class FauxTicker:
    def __init__(self, info=None, compte=None, flux=None, bilan=None, estim_ca=None, estim_bpa=None,
                 dividendes=None):
        self.info = info or {}
        self.income_stmt = compte if compte is not None else pd.DataFrame()
        self.cashflow = flux if flux is not None else pd.DataFrame()
        self.balance_sheet = bilan if bilan is not None else pd.DataFrame()
        self.revenue_estimate = estim_ca if estim_ca is not None else pd.DataFrame()
        self.earnings_estimate = estim_bpa if estim_bpa is not None else pd.DataFrame()
        self.dividends = dividendes if dividendes is not None else pd.Series(dtype=float)


def societe_solide():
    """Une société qui passe tout le profil défensif."""
    compte = etat({
        "Total Revenue": [1100.0, 1000.0, 920.0, 850.0],
        "Gross Profit": [550.0, 500.0, 465.0, 425.0],
        "Operating Income": [200.0, 180.0, 165.0, 150.0],
        "EBITDA": [260.0, 235.0, 215.0, 200.0],
    })
    flux = etat({
        "Operating Cash Flow": [230.0, 210.0, 190.0, 170.0],
        "Capital Expenditure": [-40.0, -38.0, -35.0, -30.0],
        "Free Cash Flow": [190.0, 172.0, 155.0, 140.0],
        "Repurchase Of Capital Stock": [-50.0, -40.0, -30.0, -20.0],
        "Cash Dividends Paid": [-60.0, -55.0, -50.0, -45.0],
    })
    bilan = etat({
        "Total Debt": [400.0, 390.0, 380.0, 370.0],
        "Cash Cash Equivalents And Short Term Investments": [100.0, 95.0, 90.0, 85.0],
    })
    estim = pd.DataFrame({"avg": [1180.0, 1260.0], "growth": [0.07, 0.068]}, index=["0y", "+1y"])
    return FauxTicker(info={"longName": "Solide SA", "forwardPE": 18.0, "beta": 0.7},
                      compte=compte, flux=flux, bilan=bilan, estim_ca=estim)


def mesures_solides():
    t = societe_solide()
    m = {"per_prev": 18.0, "beta": 0.7}
    sq.completer_etats(m, t)
    return sq.mesures(m)


class TestLectureEtats(unittest.TestCase):
    def test_completer_etats_lit_les_lignes(self):
        m = sq.completer_etats({}, societe_solide())
        self.assertEqual(m["ca"], 1100.0)
        self.assertEqual(m["capex"], 40.0)  # signe retiré
        self.assertEqual(m["fcf"], 190.0)
        self.assertEqual(m["rachats"], 50.0)
        self.assertEqual(m["dividendes"], 60.0)
        self.assertEqual(m["dette_nette"], 300.0)
        self.assertEqual(m["dette_nette_prec"], 295.0)
        self.assertEqual(m["exercice"], "2025-12-31")
        self.assertAlmostEqual(m["croissance_ca_1y"], 0.068)
        self.assertFalse(m["rachats_absents"])

    def test_intitules_sans_espaces(self):
        compte = etat({"TotalRevenue": [100.0, 90.0, 80.0, 70.0], "OperatingIncome": [20.0, 18.0, 16.0, 14.0]})
        m = sq.completer_etats({}, FauxTicker(compte=compte))
        self.assertEqual(m["ca"], 100.0)
        self.assertEqual(m["resultat_op"], 20.0)

    def test_colonnes_dans_le_desordre(self):
        cols = [ANNEES[2], ANNEES[0], ANNEES[3], ANNEES[1]]
        compte = etat({"Total Revenue": [920.0, 1100.0, 850.0, 1000.0]}, cols)
        m = sq.completer_etats({}, FauxTicker(compte=compte))
        self.assertEqual(m["ca"], 1100.0)
        self.assertEqual(m["exercice"], "2025-12-31")

    def test_lignes_rachats_dividendes_absentes_comptent_zero_avec_note(self):
        flux = etat({"Operating Cash Flow": [10.0, 9.0, 8.0, 7.0]})
        m = sq.completer_etats({}, FauxTicker(flux=flux))
        self.assertEqual(m["rachats"], 0.0)
        self.assertTrue(m["rachats_absents"])
        self.assertEqual(m["dividendes"], 0.0)
        self.assertTrue(m["dividendes_absents"])
        res = sq.evaluer(sq.mesures(m))
        self.assertIn("comptés 0", res["cash"]["texte"])

    def test_case_vide_reste_inconnue(self):
        flux = etat({"Repurchase Of Capital Stock": [float("nan"), -5.0, -5.0, -5.0],
                     "Cash Dividends Paid": [-3.0, -3.0, -3.0, -3.0]})
        m = sq.completer_etats({}, FauxTicker(flux=flux))
        self.assertIsNone(m["rachats"])  # ligne présente mais case vide : inconnu, pas 0
        self.assertIsNone(sq.mesures(m)["retours"])

    def test_aucune_donnee_ne_devient_zero(self):
        m = sq.completer_etats({}, FauxTicker())
        mes = sq.mesures(m)
        for k in ("capex_pct_ca", "marge_op_pct", "marge_brute_ecart_type", "fcf", "dette_nette", "ebitda",
                  "croissance_pct", "ca", "tcac_ca_pct"):
            self.assertIsNone(mes[k], k)

    def test_fcf_calcule_si_ligne_absente(self):
        flux = etat({"Operating Cash Flow": [100.0, 0, 0, 0], "Capital Expenditure": [-30.0, 0, 0, 0]})
        m = sq.completer_etats({}, FauxTicker(flux=flux))
        self.assertEqual(m["fcf"], 70.0)

    def test_ebitda_reconstitue(self):
        compte = etat({"Total Revenue": [100.0] * 4, "Operating Income": [20.0] * 4})
        flux = etat({"Depreciation And Amortization": [5.0] * 4})
        m = sq.completer_etats({}, FauxTicker(compte=compte, flux=flux))
        self.assertEqual(m["ebitda"], 25.0)

    def test_marge_brute_depuis_cout_des_ventes(self):
        compte = etat({"Total Revenue": [100.0] * 4, "Cost Of Revenue": [60.0, 61.0, 59.0, 60.0]})
        m = sq.completer_etats({}, FauxTicker(compte=compte))
        self.assertAlmostEqual(m["marge_brute_annuelle_pct"][0], 40.0)


class TestMesures(unittest.TestCase):
    def test_mesures_solides(self):
        x = mesures_solides()
        self.assertAlmostEqual(x["capex_pct_ca"], 100 * 40 / 1100)
        self.assertTrue(x["capex_couvert"])
        self.assertAlmostEqual(x["marge_op_pct"], 100 * 200 / 1100)
        self.assertEqual(x["marge_brute_nb_annees"], 4)
        self.assertEqual(x["retours"], 110.0)
        self.assertAlmostEqual(x["croissance_pct"], 6.8)
        self.assertEqual(x["croissance_source"], "prévision des analystes pour l'exercice suivant")

    def test_croissance_repli_sur_historique(self):
        m = {"ca_annuel": [1210.0, 1100.0, 1000.0]}
        x = sq.mesures(m)
        self.assertAlmostEqual(x["croissance_pct"], 10.0)
        self.assertIn("derniers exercices", x["croissance_source"])

    def test_ecart_type_exige_trois_annees(self):
        x = sq.mesures({"marge_brute_annuelle_pct": [40.0, 41.0]})
        self.assertIsNone(x["marge_brute_ecart_type"])


class TestCriteres(unittest.TestCase):
    """Trois cas par critère : OK, ÉCHEC, INCONNU."""

    def st(self, cle, **x):
        return sq.evaluer(x)[cle]["statut"]

    def test_capex(self):
        self.assertEqual(self.st("capex", capex_pct_ca=4.0, capex_couvert=True), OK)
        self.assertEqual(self.st("capex", capex_pct_ca=1.0, capex_couvert=True), ECHEC)
        self.assertEqual(self.st("capex", capex_pct_ca=4.0, capex_couvert=False), ECHEC)
        self.assertEqual(self.st("capex"), INCONNU)
        self.assertEqual(self.st("capex", capex_pct_ca=4.0), INCONNU)

    def test_prix(self):
        self.assertEqual(self.st("prix", marge_op_pct=20.0, marge_brute_ecart_type=1.0), OK)
        self.assertEqual(self.st("prix", marge_op_pct=8.0, marge_brute_ecart_type=1.0), ECHEC)
        self.assertEqual(self.st("prix", marge_op_pct=20.0, marge_brute_ecart_type=5.0), ECHEC)
        self.assertEqual(self.st("prix", marge_op_pct=20.0), INCONNU)
        self.assertEqual(self.st("prix", marge_op_pct=8.0), ECHEC)  # un échec avéré l'emporte

    def test_cash(self):
        self.assertEqual(self.st("cash", fcf=100.0, retours=80.0, dette_nette=100.0, dette_nette_prec=95.0), OK)
        self.assertEqual(self.st("cash", fcf=100.0, retours=120.0, dette_nette=100.0, dette_nette_prec=95.0), ECHEC)
        self.assertEqual(self.st("cash", fcf=100.0, retours=80.0, dette_nette=150.0, dette_nette_prec=100.0), ECHEC)
        self.assertEqual(self.st("cash", fcf=100.0, retours=80.0), INCONNU)
        self.assertEqual(self.st("cash", fcf=-10.0, retours=5.0, dette_nette=1.0, dette_nette_prec=1.0), ECHEC)
        # trésorerie nette l'année précédente
        self.assertEqual(self.st("cash", fcf=10.0, retours=5.0, dette_nette=-50.0, dette_nette_prec=-100.0), OK)
        self.assertEqual(self.st("cash", fcf=10.0, retours=5.0, dette_nette=50.0, dette_nette_prec=-100.0), ECHEC)

    def test_croissance(self):
        self.assertEqual(self.st("croissance", croissance_pct=8.0), OK)
        self.assertEqual(self.st("croissance", croissance_pct=20.0), ECHEC)
        self.assertEqual(self.st("croissance", croissance_pct=2.0), ECHEC)
        self.assertEqual(self.st("croissance"), INCONNU)
        self.assertEqual(self.st("croissance", croissance_pct=[4.0, 6.0]), INCONNU)  # plage à cheval

    def test_per(self):
        self.assertEqual(self.st("per", per_prev=15.0), OK)
        self.assertEqual(self.st("per", per_prev=30.0), ECHEC)
        self.assertEqual(self.st("per"), INCONNU)
        self.assertEqual(self.st("per", per_prev=-5.0), INCONNU)
        self.assertEqual(self.st("per", per_prev=[9.5, 13.6]), OK)
        self.assertEqual(self.st("per", per_prev=[20.0, 30.0]), INCONNU)

    def test_levier(self):
        self.assertEqual(self.st("levier", dette_nette=200.0, ebitda=100.0), OK)
        self.assertEqual(self.st("levier", dette_nette=300.0, ebitda=100.0), ECHEC)
        self.assertEqual(self.st("levier", dette_nette=200.0), INCONNU)
        self.assertEqual(self.st("levier"), INCONNU)
        self.assertEqual(self.st("levier", dette_nette=-50.0), OK)
        self.assertEqual(self.st("levier", dette_nette=50.0, ebitda=-10.0), ECHEC)

    def test_beta(self):
        self.assertEqual(self.st("beta", beta=0.8), OK)
        self.assertEqual(self.st("beta", beta=1.3), ECHEC)
        self.assertEqual(self.st("beta"), INCONNU)


class TestVerdict(unittest.TestCase):
    def test_societe_solide_retenue(self):
        self.assertEqual(sq.verdict(sq.evaluer(mesures_solides())), "RETENU")

    def test_echec_l_emporte(self):
        x = mesures_solides()
        x["beta"] = 2.0
        x["per_prev"] = None
        self.assertEqual(sq.verdict(sq.evaluer(x)), "EXCLU")

    def test_inconnu(self):
        x = mesures_solides()
        x["beta"] = None
        self.assertEqual(sq.verdict(sq.evaluer(x)), "À VÉRIFIER")

    def test_seuils_personnalises(self):
        x = mesures_solides()
        s = dict(sq.CRITERES, per_max=10.0)
        self.assertEqual(sq.evaluer(x, s)["per"]["statut"], ECHEC)


class TestExclusions(unittest.TestCase):
    def test_nestle_a_vie(self):
        for tk in ("NESN.SW", "nsrgy", "NSRGF"):
            self.assertIsNotNone(sq._exclusion(tk))
        self.assertIsNotNone(sq._exclusion("XYZ", "Nestlé India Ltd"))
        self.assertIsNotNone(sq._exclusion("XYZ", "NESTLE MALAYSIA"))
        self.assertIsNone(sq._exclusion("ROG.SW", "Roche Holding AG"))

    def test_exclusions_toujours_presentes(self):
        self.assertEqual(set(sq.EXCLUSIONS), {"NESN.SW", "NSRGY", "NSRGF"})

    def test_analyser_ticker_exclut_avant_reseau(self):
        def fabrique(_):
            raise AssertionError("aucun appel réseau pour une exclusion")
        self.assertEqual(sq.analyser_ticker("NESN.SW", fabrique)["verdict"], "EXCLU")

    def test_analyser_ticker(self):
        l = sq.analyser_ticker("SOL", lambda _: societe_solide())
        self.assertEqual(l["verdict"], "RETENU")
        self.assertEqual(l["capex_statut"], OK)


class TestFormat(unittest.TestCase):
    def test_fmt(self):
        self.assertEqual(sq.fmt(12.5), "12,5")
        self.assertEqual(sq.fmt(12.0), "12")
        self.assertEqual(sq.fmt(None), "—")
        self.assertEqual(sq.fmt([9.5, 13.6]), "9,5 – 13,6")
        self.assertEqual(sq.fmt_fixe(0.7, 2), "0,70")


if __name__ == "__main__":
    r = unittest.TextTestRunner(verbosity=1).run(unittest.defaultTestLoader.loadTestsFromModule(sys.modules[__name__]))
    print("Tous les tests passent." if r.wasSuccessful() else "Des tests échouent.")
    sys.exit(0 if r.wasSuccessful() else 1)
