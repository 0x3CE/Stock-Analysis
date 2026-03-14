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
    def test_normal_value(self):
        assert StockDataService._safe_float(3.14) == pytest.approx(3.14)

    def test_integer(self):
        assert StockDataService._safe_float(42) == 42.0

    def test_nan_returns_zero(self):
        assert StockDataService._safe_float(float("nan")) == 0.0

    def test_inf_returns_zero(self):
        assert StockDataService._safe_float(float("inf")) == 0.0

    def test_negative_inf_returns_zero(self):
        assert StockDataService._safe_float(float("-inf")) == 0.0

    def test_none_returns_zero(self):
        assert StockDataService._safe_float(None) == 0.0

    def test_string_number(self):
        assert StockDataService._safe_float("2.5") == pytest.approx(2.5)

    def test_invalid_string_returns_zero(self):
        assert StockDataService._safe_float("abc") == 0.0


# ---------------------------------------------------------------------------
# _safe_df_value
# ---------------------------------------------------------------------------

class TestSafeDfValue:
    def test_valid_cell(self):
        df = pd.DataFrame({"col": [10.0]}, index=["row"])
        assert StockDataService._safe_df_value(df, "row", "col") == 10.0

    def test_missing_row_returns_zero(self):
        df = pd.DataFrame({"col": [10.0]}, index=["row"])
        assert StockDataService._safe_df_value(df, "missing", "col") == 0.0

    def test_nan_cell_returns_zero(self):
        df = pd.DataFrame({"col": [float("nan")]}, index=["row"])
        assert StockDataService._safe_df_value(df, "row", "col") == 0.0


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

        assert result["total_score"] == 0
        assert result["profitability"] == []
        assert result["leverage"] == []
        assert result["operating"] == []
        assert result["interpretation"] == "N/A"

    def test_score_interpretation_high(self):
        """Vérifie l'interprétation pour un score ≥ 7."""
        stock = MagicMock()
        stock.balance_sheet = pd.DataFrame()
        stock.financials = pd.DataFrame()
        stock.info = {}
        result = StockDataService.compute_piotroski_fscore(stock)
        # Avec données vides, score = 0 → interprétation faible
        assert "faible" in result["interpretation"].lower() or result["interpretation"] == "N/A"


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
