"""
StockDataService — Service de récupération et d'analyse des données boursières.

Responsabilités :
- Récupérer les données depuis yfinance
- Extraire les KPIs financiers
- Calculer le Piotroski F-Score
- Construire les historiques (prix, dividendes, bénéfices)
"""

from fastapi import HTTPException
import yfinance as yf
import pandas as pd
from datetime import datetime
import math


# ---------------------------------------------------------------------------
# Constantes de configuration
# ---------------------------------------------------------------------------

MARKET_CAP_SCALE = 1e9      # Milliards
VOLUME_SCALE = 1e6           # Millions
FINANCIALS_SCALE = 1e9       # Milliards pour le bénéfice net
PIOTROSKI_HIGH_THRESHOLD = 7
PIOTROSKI_MID_THRESHOLD = 4
DIVIDEND_HISTORY_YEARS = 5


# ---------------------------------------------------------------------------
# Service principal
# ---------------------------------------------------------------------------

class StockDataService:
    """Fournit toutes les opérations de données financières pour un ticker donné."""

    # ------------------------------------------------------------------
    # Utilitaires internes
    # ------------------------------------------------------------------

    @staticmethod
    def _safe_float(value) -> float:
        try:
            result = float(value)
            return 0.0 if math.isnan(result) or math.isinf(result) else result
        except Exception:
            return 0.0

    @staticmethod
    def _safe_df_value(df: pd.DataFrame, row: str, col) -> float:
        """Lit une cellule d'un DataFrame sans lever d'exception."""
        try:
            return StockDataService._safe_float(df.at[row, col])
        except Exception:
            return 0.0

    @staticmethod
    def _get_field(info: dict, fast: dict, key: str, alt_key: str = None):
        """
        Lit un champ depuis info ou fast_info avec fallback.
        Retourne None si aucune valeur n'est trouvée.
        """
        return info.get(key) or (fast.get(alt_key) if alt_key else None) or None

    # ------------------------------------------------------------------
    # Récupération du ticker
    # ------------------------------------------------------------------

    @staticmethod
    def fetch_stock_info(ticker: str) -> yf.Ticker:
        """
        Instancie et valide un ticker yfinance.
        Lève HTTP 404 si aucune donnée n'est disponible.
        """
        stock = yf.Ticker(ticker)
        try:
            _ = stock.fast_info or stock.info
        except Exception:
            raise HTTPException(
                status_code=404,
                detail=f"Aucune donnée trouvée pour le ticker '{ticker}'"
            )
        return stock

    # ------------------------------------------------------------------
    # Extraction des KPIs
    # ------------------------------------------------------------------

    @staticmethod
    def extract_kpis(stock: yf.Ticker) -> dict:
        """
        Extrait les indicateurs financiers clés depuis info et fast_info.
        Les valeurs manquantes sont retournées comme None pour indiquer l'absence de donnée.
        """
        info: dict = getattr(stock, "info", {}) or {}
        fast: dict = getattr(stock, "fast_info", {}) or {}

        def get(key: str, alt: str = None):
            return StockDataService._get_field(info, fast, key, alt)

        current_price = get("currentPrice", "last_price")
        prev_close = get("previousClose", "last_price")

        # Variation journalière en % (0 si données insuffisantes)
        if current_price and prev_close and prev_close != 0:
            price_change = (current_price - prev_close) / prev_close * 100
        else:
            price_change = 0.0

        sf = StockDataService._safe_float

        return {
            "current_price": round(sf(current_price), 2),
            "price_change": round(sf(price_change), 2),
            "market_cap": round(sf(get("marketCap")) / MARKET_CAP_SCALE, 2),
            "pe_ratio": round(sf(get("trailingPE")), 2) if get("trailingPE") else None,
            "dividend_yield": round(sf(get("dividendYield")) * 100, 2) if get("dividendYield") else None,
            "volume": round(sf(get("volume")) / VOLUME_SCALE, 2),
            "high_52w": round(sf(get("fiftyTwoWeekHigh")), 2) if get("fiftyTwoWeekHigh") else None,
            "low_52w": round(sf(get("fiftyTwoWeekLow")), 2)  if get("fiftyTwoWeekLow") else None,
            "beta": round(sf(get("beta")), 2) if get("beta") else None,
            "eps": round(sf(get("trailingEps")), 2) if get("trailingEps") else None,
            "roe": round(sf(get("returnOnEquity")) * 100, 2) if get("returnOnEquity") else None,
            "debt_to_equity": round(sf(get("debtToEquity")), 2) if get("debtToEquity") else None,
            "current_ratio":  round(sf(get("currentRatio")), 2) if get("currentRatio") else None,
            "profit_margin":  round(sf(get("profitMargins")) * 100, 2) if get("profitMargins") else None,
        }

    # ------------------------------------------------------------------
    # Historique des prix
    # ------------------------------------------------------------------

    @staticmethod
    def get_historical_prices(stock: yf.Ticker, period: str = "1y") -> list[dict]:
        """
        Retourne l'historique de prix (date, clôture, volume) pour la période donnée.
        Retourne une liste vide si aucune donnée n'est disponible.
        """
        hist = stock.history(period=period)
        if hist.empty:
            return []

        hist = hist.reset_index()
        return [
            {
                "date":   row["Date"].strftime("%Y-%m-%d"),
                "price":  round(float(row["Close"]), 2),
                "volume": int(row["Volume"]),
            }
            for _, row in hist.iterrows()
        ]

    # ------------------------------------------------------------------
    # Historique des dividendes
    # ------------------------------------------------------------------

    @staticmethod
    def get_dividend_history(stock: yf.Ticker) -> list[dict]:
        """
        Retourne le dernier dividende annuel versé sur les 5 dernières années.
        Retourne une liste vide si aucun dividende n'est disponible.
        """
        dividends: pd.Series = getattr(stock, "dividends", pd.Series())
        if dividends.empty:
            return []

        # Suppression du timezone pour la comparaison de dates
        dividends.index = dividends.index.tz_localize(None)
        cutoff = datetime.now() - pd.DateOffset(years=DIVIDEND_HISTORY_YEARS)
        recent_dividends = dividends[dividends.index >= cutoff]

        result = []
        for year, group in recent_dividends.groupby(recent_dividends.index.year):
            last_date = group.index[-1]
            last_amount = group.iloc[-1]
            result.append({
                "year":   str(year),
                "amount": round(float(last_amount), 2),
                "date":   last_date.strftime("%Y-%m-%d"),
            })
        return result

    # ------------------------------------------------------------------
    # Historique bénéfice net et marge
    # ------------------------------------------------------------------

    @staticmethod
    def get_profit_and_margin_history(stock: yf.Ticker) -> list[dict]:
        """
        Calcule le bénéfice net (en Mds $) et la marge nette (%) par année fiscale.
        Les colonnes sans 'Total Revenue' ou 'Net Income' sont ignorées silencieusement.
        """
        financials: pd.DataFrame = getattr(stock, "financials", pd.DataFrame())
        if financials.empty:
            return []

        financials = financials.fillna(0)
        history = []

        for col in financials.columns:
            try:
                year = col.year if hasattr(col, "year") else str(col)
                revenue   = StockDataService._safe_float(financials.at["Total Revenue", col])
                net_income = StockDataService._safe_float(financials.at["Net Income", col])
                margin = (net_income / revenue * 100) if revenue != 0 else 0.0

                history.append({
                    "year":       str(year),
                    "net_income": round(net_income / FINANCIALS_SCALE, 2),
                    "margin":     round(margin, 2),
                })
            except Exception:
                continue  # Colonne incomplète — on passe

        return sorted(history, key=lambda x: x["year"])

    # ------------------------------------------------------------------
    # Calcul du Piotroski F-Score
    # ------------------------------------------------------------------

    @staticmethod
    def compute_piotroski_fscore(stock: yf.Ticker) -> dict:
        """
        Calcule le Piotroski F-Score (0–9) selon les 9 critères standards :
        4 de rentabilité, 3 de levier/liquidité, 2 d'efficacité opérationnelle.
        """
        balance_sheet: pd.DataFrame = getattr(stock, "balance_sheet", pd.DataFrame())
        income_stmt:   pd.DataFrame = getattr(stock, "financials", pd.DataFrame())
        info:          dict         = getattr(stock, "info", {})

        _empty_result = {
            "total_score":    0,
            "profitability":  [],
            "leverage":       [],
            "operating":      [],
            "interpretation": "N/A",
        }

        if balance_sheet.empty or income_stmt.empty or not info:
            return _empty_result

        # Colonnes : année courante vs précédente
        cols = income_stmt.columns
        current_col = cols[0]
        prev_col    = cols[1] if len(cols) >= 2 else cols[0]

        def bs(row: str, col) -> float:
            return StockDataService._safe_df_value(balance_sheet, row, col)

        def is_(row: str, col) -> float:
            return StockDataService._safe_df_value(income_stmt, row, col)

        total_score   = 0
        profitability = []
        leverage      = []
        operating     = []

        def add_criterion(category: list, criterion: str, passed: bool, detail: str):
            """Ajoute un critère évalué à la catégorie concernée et met à jour le score."""
            nonlocal total_score
            score = 1 if passed else 0
            total_score += score
            category.append({"criterion": criterion, "score": score, "detail": detail})

        # ── Rentabilité ────────────────────────────────────────────────

        total_assets_curr = max(bs("Total Assets", current_col), 1)
        total_assets_prev = max(bs("Total Assets", prev_col), 1)
        net_income_curr   = is_("Net Income", current_col)
        net_income_prev   = is_("Net Income", prev_col)
        roa_curr = net_income_curr / total_assets_curr
        roa_prev = net_income_prev / total_assets_prev
        cfo      = StockDataService._safe_float(info.get("freeCashflow", 0))

        add_criterion(profitability, "ROA positive",
                      roa_curr > 0,
                      f"ROA={roa_curr:.2f}")

        add_criterion(profitability, "Cash flow opérationnel positif",
                      cfo > 0,
                      f"CFO={cfo:.2f}")

        add_criterion(profitability, "ROA en amélioration",
                      roa_curr > roa_prev,
                      f"Précédent={roa_prev:.2f} | Actuel={roa_curr:.2f}")

        add_criterion(profitability, "CFO > Bénéfice net",
                      cfo > net_income_curr,
                      f"CFO={cfo:.2f} | NI={net_income_curr:.2f}")

        # ── Levier / Liquidité ─────────────────────────────────────────

        ltd_curr = bs("Long Term Debt", current_col)
        ltd_prev = bs("Long Term Debt", prev_col)
        leverage_ratio_curr = ltd_curr / total_assets_curr
        leverage_ratio_prev = ltd_prev / total_assets_prev
        current_ratio       = StockDataService._safe_float(info.get("currentRatio", 0))
        shares_curr = bs("Ordinary Shares Number", current_col)
        shares_prev = bs("Ordinary Shares Number", prev_col)

        add_criterion(leverage, "Levier en baisse",
                      leverage_ratio_curr < leverage_ratio_prev,
                      f"Précédent={leverage_ratio_prev:.2f} | Actuel={leverage_ratio_curr:.2f}")

        add_criterion(leverage, "Current ratio positif",
                      current_ratio > 0,
                      f"Ratio={current_ratio:.2f}")

        add_criterion(leverage, "Pas de nouvelles actions émises",
                      shares_curr <= shares_prev,
                      f"Précédent={shares_prev} | Actuel={shares_curr}")

        # ── Efficacité Opérationnelle ───────────────────────────────────

        revenue_curr = max(is_("Total Revenue", current_col), 1)
        revenue_prev = max(is_("Total Revenue", prev_col), 1)

        gm_curr = is_("Gross Profit", current_col) / revenue_curr
        gm_prev = is_("Gross Profit", prev_col)    / revenue_prev
        at_curr = revenue_curr / total_assets_curr
        at_prev = revenue_prev / total_assets_prev

        add_criterion(operating, "Marge brute en amélioration",
                      gm_curr > gm_prev,
                      f"Précédent={gm_prev:.2f} | Actuel={gm_curr:.2f}")

        add_criterion(operating, "Rotation des actifs en amélioration",
                      at_curr > at_prev,
                      f"Précédent={at_prev:.2f} | Actuel={at_curr:.2f}")

        # ── Interprétation ─────────────────────────────────────────────

        if total_score >= PIOTROSKI_HIGH_THRESHOLD:
            interpretation = "Entreprise solide — très bonne gestion financière."
        elif total_score >= PIOTROSKI_MID_THRESHOLD:
            interpretation = "Entreprise avec du potentiel — analyse approfondie recommandée avant d'investir."
        else:
            interpretation = "Signaux financiers faibles — prudence fortement conseillée."

        return {
            "total_score":    total_score,
            "profitability":  profitability,
            "leverage":       leverage,
            "operating":      operating,
            "interpretation": interpretation,
        }