"""
Tests unitaires pour StockDataService.
Exécuter : pytest backend/tests/ depuis la racine du projet
"""
import math
import pytest
import pandas as pd
from unittest.mock import MagicMock, patch
import sys, os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from services.stock_service import StockDataService, PIOTROSKI_HIGH_THRESHOLD, PIOTROSKI_MID_THRESHOLD


# ---------------------------------------------------------------------------
# _safe_float
# ---------------------------------------------------------------------------

class TestSafeFloat:
    """Règle 2 du CLAUDE.md : une donnée manquante reste None, jamais 0."""

    def test_normal_value(self):
        assert StockDataService._safe_float(3.14) == pytest.approx(3.14)

    def test_integer(self):
        assert StockDataService._safe_float(42) == 42.0

    def test_vrai_zero_conserve(self):
        assert StockDataService._safe_float(0) == 0.0

    def test_nan_returns_none(self):
        assert StockDataService._safe_float(float("nan")) is None

    def test_inf_returns_none(self):
        assert StockDataService._safe_float(float("inf")) is None

    def test_negative_inf_returns_none(self):
        assert StockDataService._safe_float(float("-inf")) is None

    def test_none_returns_none(self):
        assert StockDataService._safe_float(None) is None

    def test_string_number(self):
        assert StockDataService._safe_float("2.5") == pytest.approx(2.5)

    def test_invalid_string_returns_none(self):
        assert StockDataService._safe_float("abc") is None


# ---------------------------------------------------------------------------
# _safe_df_value
# ---------------------------------------------------------------------------

class TestSafeDfValue:
    def test_valid_cell(self):
        df = pd.DataFrame({"col": [10.0]}, index=["row"])
        assert StockDataService._safe_df_value(df, "row", "col") == 10.0

    def test_missing_row_returns_none(self):
        df = pd.DataFrame({"col": [10.0]}, index=["row"])
        assert StockDataService._safe_df_value(df, "missing", "col") is None

    def test_nan_cell_returns_none(self):
        df = pd.DataFrame({"col": [float("nan")]}, index=["row"])
        assert StockDataService._safe_df_value(df, "row", "col") is None


# ---------------------------------------------------------------------------
# Piotroski thresholds
# ---------------------------------------------------------------------------

class TestPiotroskiThresholds:
    def test_high_threshold(self):
        assert PIOTROSKI_HIGH_THRESHOLD == 7

    def test_mid_threshold(self):
        assert PIOTROSKI_MID_THRESHOLD == 4


# ---------------------------------------------------------------------------
# compute_piotroski_fscore — retour vide si données manquantes
# ---------------------------------------------------------------------------

class TestPiotroskiEmptyData:
    def test_empty_balance_sheet_returns_empty(self):
        stock = MagicMock()
        stock.balance_sheet = pd.DataFrame()
        stock.financials = pd.DataFrame()
        stock.info = {}

        result = StockDataService.compute_piotroski_fscore(stock)

        assert result["total_score"] is None  # inconnu, pas 0
        assert result["inconnus"] == 9
        assert result["profitability"] == []
        assert result["leverage"] == []
        assert result["operating"] == []
        assert result["interpretation"] == "N/A"


ANNEES = [pd.Timestamp("2025-12-31"), pd.Timestamp("2024-12-31")]


def _etat(lignes):
    return pd.DataFrame({c: {k: v[i] for k, v in lignes.items()} for i, c in enumerate(ANNEES)})


def _societe(sans=()):
    """Société fictive qui passe les 9 critères ; `sans` retire des lignes des états."""
    bilan = {"Total Assets": [1000.0, 1000.0], "Long Term Debt": [200.0, 250.0],
             "Current Assets": [500.0, 400.0], "Current Liabilities": [250.0, 250.0],
             "Ordinary Shares Number": [100.0, 102.0]}
    compte = {"Net Income": [120.0, 100.0], "Total Revenue": [1100.0, 1000.0], "Gross Profit": [550.0, 480.0]}
    flux = {"Operating Cash Flow": [150.0, 130.0]}
    for d in (bilan, compte, flux):
        for k in sans:
            d.pop(k, None)
    stock = MagicMock()
    stock.balance_sheet, stock.financials, stock.cashflow = _etat(bilan), _etat(compte), _etat(flux)
    return stock


class TestPiotroskiTroisValeurs:
    def test_societe_complete(self):
        r = StockDataService.compute_piotroski_fscore(_societe())
        assert r["total_score"] == 9
        assert r["inconnus"] == 0
        assert r["interpretation"].startswith("Entreprise solide")

    def test_total_assets_manquant_ne_passe_plus(self):
        """Avant : max(0, 1) = 1, le ROA valait le bénéfice net / 1 et passait à tort."""
        r = StockDataService.compute_piotroski_fscore(_societe(sans=("Total Assets",)))
        roa = r["profitability"][0]
        assert roa["score"] is None and roa["statut"] == "INCONNU"
        # ROA, ROA en hausse, levier en baisse, rotation des actifs : 4 inconnus
        assert r["inconnus"] == 4
        assert r["total_score"] == 5

    def test_cfo_absent_inconnu_sans_repli_sur_info(self):
        stock = _societe(sans=("Operating Cash Flow",))
        stock.info = {"operatingCashflow": 999.0, "freeCashflow": 999.0}  # 12 mois glissants : non utilisés
        r = StockDataService.compute_piotroski_fscore(stock)
        assert [c["score"] for c in r["profitability"]] == [1, None, 1, None]

    def test_echec_reste_un_echec(self):
        stock = _societe()
        stock.financials.loc["Net Income"] = [-10.0, 100.0]
        r = StockDataService.compute_piotroski_fscore(stock)
        assert r["profitability"][0]["score"] == 0
        assert r["profitability"][0]["statut"] == "ÉCHEC"

    def test_un_seul_exercice(self):
        stock = MagicMock()
        stock.balance_sheet = pd.DataFrame({ANNEES[0]: {"Total Assets": 1.0}})
        stock.financials = pd.DataFrame({ANNEES[0]: {"Net Income": 1.0}})
        assert StockDataService.compute_piotroski_fscore(stock)["total_score"] is None


class TestInterpretation:
    def test_complet(self):
        assert StockDataService.interpret_piotroski(8, 0).startswith("Entreprise solide")
        assert StockDataService.interpret_piotroski(2, 0).startswith("Signaux")

    def test_fourchette_dans_une_zone(self):
        txt = StockDataService.interpret_piotroski(7, 2)
        assert "entre 7 et 9" in txt and "solide" in txt

    def test_fourchette_a_cheval(self):
        txt = StockDataService.interpret_piotroski(3, 4)
        assert "insuffisantes" in txt


class TestKpisSansDonnees:
    def test_tout_manquant_reste_none(self):
        stock = MagicMock()
        stock.info = {}
        stock.fast_info = {}
        stock.balance_sheet = pd.DataFrame()
        stock.financials = pd.DataFrame()
        k = StockDataService.extract_kpis(stock)
        for cle in ("current_price", "price_change", "market_cap", "volume", "pe_ratio", "roe"):
            assert k[cle] is None, cle

    def test_variation_reelle_de_zero_conservee(self):
        stock = MagicMock()
        stock.info = {"currentPrice": 10.0, "previousClose": 10.0, "returnOnEquity": 0.1}
        stock.fast_info = {}
        assert StockDataService.extract_kpis(stock)["price_change"] == 0.0


class TestProfitMarginSansZero:
    def test_annee_partielle(self):
        stock = MagicMock()
        stock.financials = _etat({"Total Revenue": [1000e6, float("nan")], "Net Income": [100e6, 80e6]})
        h = StockDataService.get_profit_and_margin_history(stock)
        assert h[0]["year"] == "2024" and h[0]["margin"] is None and h[0]["net_income"] == 0.08
        assert h[1]["margin"] == 10.0


# ---------------------------------------------------------------------------
# get_dividend_history — retour vide si pas de dividendes
# ---------------------------------------------------------------------------

class TestDividendHistory:
    def test_empty_dividends(self):
        stock = MagicMock()
        stock.dividends = pd.Series(dtype=float)
        result = StockDataService.get_dividend_history(stock)
        assert result == []

    def test_returns_list(self):
        import datetime
        dates = pd.DatetimeIndex([
            "2022-03-15", "2022-06-15", "2023-03-15", "2023-06-15"
        ]).tz_localize("UTC")
        stock = MagicMock()
        stock.dividends = pd.Series([0.22, 0.23, 0.24, 0.25], index=dates)
        result = StockDataService.get_dividend_history(stock)
        assert isinstance(result, list)
        assert all("year" in r and "amount" in r for r in result)


# ---------------------------------------------------------------------------
# get_profit_and_margin_history — retour vide si financials vides
# ---------------------------------------------------------------------------

class TestProfitMarginHistory:
    def test_empty_financials(self):
        stock = MagicMock()
        stock.financials = pd.DataFrame()
        result = StockDataService.get_profit_and_margin_history(stock)
        assert result == []
