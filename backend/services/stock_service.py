"""
StockDataService — Service de récupération et d'analyse des données boursières.

Responsabilités :
- Récupérer les données depuis yfinance
- Extraire les KPIs financiers
- Calculer le Piotroski F-Score
- Construire les historiques (prix, dividendes, bénéfices)

Règle (CLAUDE.md, règle 2) : une donnée manquante reste inconnue. Elle vaut
None, jamais 0. Un critère Piotroski sans données vaut INCONNU (score None),
et le score total est alors une fourchette.
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

OK, ECHEC, INCONNU = "OK", "ÉCHEC", "INCONNU"


# ---------------------------------------------------------------------------
# Service principal
# ---------------------------------------------------------------------------

class StockDataService:
    """Fournit toutes les opérations de données financières pour un ticker donné."""

    # ------------------------------------------------------------------
    # Utilitaires internes
    # ------------------------------------------------------------------

    @staticmethod
    def _safe_float(value):
        """Nombre fini, ou None si la valeur est absente, NaN, infinie ou illisible."""
        if value is None or isinstance(value, bool):
            return None
        try:
            result = float(value)
        except (TypeError, ValueError):
            return None
        return result if math.isfinite(result) else None

    @staticmethod
    def _safe_df_value(df: pd.DataFrame, row: str, col):
        """Lit une cellule d'un DataFrame. None si la ligne, la colonne ou la valeur manque."""
        try:
            return StockDataService._safe_float(df.at[row, col])
        except Exception:
            return None

    @staticmethod
    def _first_row(df: pd.DataFrame, col, *rows):
        """Première valeur connue parmi plusieurs intitulés de ligne (Yahoo les change parfois)."""
        for row in rows:
            v = StockDataService._safe_df_value(df, row, col)
            if v is not None:
                return v
        return None

    @staticmethod
    def _get_field(info: dict, fast, key: str, alt_key: str = None):
        """
        Lit un champ depuis info, sinon depuis fast_info. None si rien n'est trouvé.
        Une vraie valeur 0 est conservée (pas de « or » qui l'écarterait).
        """
        v = StockDataService._safe_float(info.get(key)) if info else None
        if v is None and alt_key and fast is not None:
            try:
                v = StockDataService._safe_float(fast[alt_key])
            except Exception:
                v = None
        return v

    @staticmethod
    def _round(value, digits=2, scale=1.0):
        return None if value is None else round(value / scale, digits)

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
        Si stock.info est rate-limité (cloud IPs), calcule les métriques
        fondamentales depuis le bilan et le compte de résultat en repli.
        Toute valeur introuvable vaut None.
        """
        try:
            info: dict = stock.info or {}
        except Exception:
            info = {}
        try:
            fast = stock.fast_info
        except Exception:
            fast = None

        def get(key: str, alt: str = None):
            return StockDataService._get_field(info, fast, key, alt)

        current_price = get("currentPrice", "last_price")
        prev_close    = get("previousClose", "previous_close")

        # Variation journalière en % (None si données insuffisantes)
        if current_price is not None and prev_close:
            price_change = (current_price - prev_close) / prev_close * 100
        else:
            price_change = None

        roe_raw       = get("returnOnEquity")
        d_e_raw       = get("debtToEquity")
        cr_raw        = get("currentRatio")
        pm_raw        = get("profitMargins")
        eps_raw       = get("trailingEps")
        beta_raw      = get("beta")
        div_yield_raw = get("dividendYield")
        pe_raw        = get("trailingPE")

        # ── Repli sur les états financiers si info est vide (rate limit) ──
        if all(v is None for v in (roe_raw, d_e_raw, cr_raw, pm_raw, eps_raw)):
            try:
                bs  = getattr(stock, "balance_sheet", pd.DataFrame())
                is_ = getattr(stock, "financials",    pd.DataFrame())
                if not bs.empty and not is_.empty:
                    bc, ic = bs.columns[0], is_.columns[0]
                    first = StockDataService._first_row

                    net_income  = first(is_, ic, "Net Income")
                    revenue     = first(is_, ic, "Total Revenue")
                    equity      = first(bs, bc, "Stockholders Equity", "Total Equity Gross Minority Interest")
                    curr_assets = first(bs, bc, "Current Assets")
                    curr_liab   = first(bs, bc, "Current Liabilities")
                    total_debt  = first(bs, bc, "Total Debt")
                    shares = StockDataService._get_field({}, fast, "", "shares")
                    if shares is None:
                        shares = first(bs, bc, "Ordinary Shares Number")

                    if equity and equity > 0:
                        if net_income is not None:
                            roe_raw = net_income / equity
                        if total_debt is not None:
                            d_e_raw = total_debt / equity * 100
                    if curr_assets is not None and curr_liab and curr_liab > 0:
                        cr_raw = curr_assets / curr_liab
                    if net_income is not None and revenue and revenue > 0:
                        pm_raw = net_income / revenue
                    if net_income is not None and shares and shares > 0:
                        eps_raw = net_income / shares
                    if pe_raw is None and eps_raw and eps_raw > 0 and current_price is not None:
                        pe_raw = current_price / eps_raw
            except Exception:
                pass  # repli impossible : les champs restent None

        r = StockDataService._round
        return {
            "current_price":  r(current_price),
            "price_change":   r(price_change),
            "market_cap":     r(get("marketCap", "market_cap"), 2, MARKET_CAP_SCALE),
            "pe_ratio":       r(pe_raw),
            "dividend_yield": r(div_yield_raw * 100) if div_yield_raw is not None else None,
            "volume":         r(get("volume", "last_volume"), 2, VOLUME_SCALE),
            "high_52w":       r(get("fiftyTwoWeekHigh", "year_high")),
            "low_52w":        r(get("fiftyTwoWeekLow", "year_low")),
            "beta":           r(beta_raw),
            "eps":            r(eps_raw),
            "roe":            r(roe_raw * 100) if roe_raw is not None else None,
            "debt_to_equity": r(d_e_raw),
            "current_ratio":  r(cr_raw),
            "profit_margin":  r(pm_raw * 100) if pm_raw is not None else None,
        }

    # ------------------------------------------------------------------
    # Historique des prix
    # ------------------------------------------------------------------

    @staticmethod
    def get_historical_prices(stock: yf.Ticker, period: str = "1y") -> list[dict]:
        """
        Retourne l'historique de prix (date, clôture, volume) pour la période donnée.
        Les jours sans cours de clôture sont ignorés.
        """
        hist = stock.history(period=period)
        if hist.empty:
            return []

        hist = hist.reset_index()
        res = []
        for _, row in hist.iterrows():
            price = StockDataService._safe_float(row["Close"])
            if price is None:
                continue
            vol = StockDataService._safe_float(row.get("Volume"))
            res.append({
                "date":   row["Date"].strftime("%Y-%m-%d"),
                "price":  round(price, 2),
                "volume": int(vol) if vol is not None else None,
            })
        return res

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

        # Suppression du fuseau horaire pour la comparaison de dates
        dividends.index = dividends.index.tz_localize(None)
        cutoff = datetime.now() - pd.DateOffset(years=DIVIDEND_HISTORY_YEARS)
        recent_dividends = dividends[dividends.index >= cutoff]

        result = []
        for year, group in recent_dividends.groupby(recent_dividends.index.year):
            last_date = group.index[-1]
            last_amount = StockDataService._safe_float(group.iloc[-1])
            if last_amount is None:
                continue
            result.append({
                "year":   str(year),
                "amount": round(last_amount, 2),
                "date":   last_date.strftime("%Y-%m-%d"),
            })
        return result

    # ------------------------------------------------------------------
    # Historique bénéfice net et marge
    # ------------------------------------------------------------------

    @staticmethod
    def get_profit_and_margin_history(stock: yf.Ticker) -> list[dict]:
        """
        Bénéfice net (en milliards) et marge nette (%) par exercice.
        Une valeur manquante reste None (trou dans le graphique, pas un 0).
        Un exercice sans aucune des deux valeurs est ignoré.
        """
        financials: pd.DataFrame = getattr(stock, "financials", pd.DataFrame())
        if financials.empty:
            return []

        history = []
        for col in financials.columns:
            year = col.year if hasattr(col, "year") else str(col)
            revenue    = StockDataService._safe_df_value(financials, "Total Revenue", col)
            net_income = StockDataService._safe_df_value(financials, "Net Income", col)
            if revenue is None and net_income is None:
                continue
            margin = net_income / revenue * 100 if net_income is not None and revenue and revenue > 0 else None
            history.append({
                "year":       str(year),
                "net_income": StockDataService._round(net_income, 2, FINANCIALS_SCALE),
                "margin":     StockDataService._round(margin),
            })

        return sorted(history, key=lambda x: x["year"])

    # ------------------------------------------------------------------
    # Calcul du Piotroski F-Score
    # ------------------------------------------------------------------

    @staticmethod
    def interpret_piotroski(score: int, inconnus: int) -> str:
        """
        Interprétation du score. Avec des critères inconnus, le vrai score est
        entre `score` et `score + inconnus` : on ne conclut que si toute la
        fourchette tombe dans la même zone.
        """
        def zone(s):
            if s >= PIOTROSKI_HIGH_THRESHOLD:
                return "Entreprise solide — très bonne gestion financière."
            if s >= PIOTROSKI_MID_THRESHOLD:
                return "Entreprise avec du potentiel — analyse approfondie recommandée."
            return "Signaux financiers faibles — prudence."

        if inconnus == 0:
            return zone(score)
        bas, haut = zone(score), zone(score + inconnus)
        prefixe = (f"Score partiel : {score}/9, {inconnus} critère{'s' if inconnus > 1 else ''} "
                   f"inconnu{'s' if inconnus > 1 else ''} (score réel entre {score} et {score + inconnus}). ")
        if bas == haut:
            return prefixe + bas
        return prefixe + "Données insuffisantes pour conclure."

    @staticmethod
    def compute_piotroski_fscore(stock: yf.Ticker) -> dict:
        """
        Calcule le Piotroski F-Score (0–9) selon les 9 critères standards :
        4 de rentabilité, 3 de levier/liquidité, 2 d'efficacité opérationnelle.
        Chaque critère vaut 1 (OK), 0 (ÉCHEC) ou None (INCONNU, données manquantes).
        Seuls les états annuels sont utilisés : pas de mélange avec les chiffres
        sur 12 mois glissants de stock.info.
        """
        balance_sheet: pd.DataFrame = getattr(stock, "balance_sheet", pd.DataFrame())
        income_stmt:   pd.DataFrame = getattr(stock, "financials", pd.DataFrame())
        cashflow_stmt: pd.DataFrame = getattr(stock, "cashflow", pd.DataFrame())

        _empty_result = {
            "total_score":    None,
            "inconnus":       9,
            "profitability":  [],
            "leverage":       [],
            "operating":      [],
            "interpretation": "N/A",
        }

        if balance_sheet.empty or income_stmt.empty or len(income_stmt.columns) < 2:
            return _empty_result

        # Colonnes : exercice courant vs précédent
        cols = income_stmt.columns
        current_col, prev_col = cols[0], cols[1]
        bs_cols = balance_sheet.columns
        bs_current_col = bs_cols[0]
        bs_prev_col    = bs_cols[1] if len(bs_cols) >= 2 else None

        first = StockDataService._first_row

        def bs(col, *rows):
            return None if col is None else first(balance_sheet, col, *rows)

        def is_(col, *rows):
            return first(income_stmt, col, *rows)

        def cf(col, *rows):
            if cashflow_stmt is None or cashflow_stmt.empty or col not in cashflow_stmt.columns:
                return None
            return first(cashflow_stmt, col, *rows)

        def ratio(a, b):
            return a / b if a is not None and b is not None and b > 0 else None

        def plus_grand(a, b):
            return None if a is None or b is None else a > b

        profitability, leverage, operating = [], [], []

        def add_criterion(category: list, criterion: str, passed, detail: str):
            score = None if passed is None else (1 if passed else 0)
            statut = INCONNU if passed is None else (OK if passed else ECHEC)
            if passed is None:
                detail = f"Données manquantes. {detail}"
            category.append({"criterion": criterion, "score": score, "statut": statut, "detail": detail})

        def f(v, fmt):
            return "inconnu" if v is None else format(v, fmt)

        # ── Rentabilité ────────────────────────────────────────────────

        total_assets_curr = bs(bs_current_col, "Total Assets")
        total_assets_prev = bs(bs_prev_col, "Total Assets")
        net_income_curr   = is_(current_col, "Net Income")
        net_income_prev   = is_(prev_col, "Net Income")
        roa_curr = ratio(net_income_curr, total_assets_curr)
        roa_prev = ratio(net_income_prev, total_assets_prev)
        cfo = cf(current_col, "Operating Cash Flow", "Cash Flow From Continuing Operating Activities")

        add_criterion(profitability, "ROA positive",
                      None if roa_curr is None else roa_curr > 0,
                      f"ROA={f(roa_curr, '.3f')}")

        add_criterion(profitability, "Cash flow opérationnel positif",
                      None if cfo is None else cfo > 0,
                      f"CFO={f(cfo, ',.0f')}")

        add_criterion(profitability, "ROA en amélioration",
                      plus_grand(roa_curr, roa_prev),
                      f"Précédent={f(roa_prev, '.3f')} | Actuel={f(roa_curr, '.3f')}")

        add_criterion(profitability, "CFO > Bénéfice net (qualité bénéfices)",
                      plus_grand(cfo, net_income_curr),
                      f"CFO={f(cfo, ',.0f')} | NI={f(net_income_curr, ',.0f')}")

        # ── Levier / Liquidité ─────────────────────────────────────────

        ltd_rows = ("Long Term Debt", "Long Term Debt And Capital Lease Obligation",
                    "Long Term Debt And Due After One Year")
        lev_curr = ratio(bs(bs_current_col, *ltd_rows), total_assets_curr)
        lev_prev = ratio(bs(bs_prev_col, *ltd_rows), total_assets_prev)

        cr_curr = ratio(bs(bs_current_col, "Current Assets"), bs(bs_current_col, "Current Liabilities"))
        cr_prev = ratio(bs(bs_prev_col, "Current Assets"), bs(bs_prev_col, "Current Liabilities"))

        # Une seule ligne pour les deux années : « Share Issued » compte aussi les
        # actions autodétenues, la mélanger avec « Ordinary Shares Number » fausserait la comparaison.
        shares_curr = bs(bs_current_col, "Ordinary Shares Number")
        shares_prev = bs(bs_prev_col, "Ordinary Shares Number")

        add_criterion(leverage, "Levier en baisse",
                      plus_grand(lev_prev, lev_curr),
                      f"Précédent={f(lev_prev, '.3f')} | Actuel={f(lev_curr, '.3f')}")

        add_criterion(leverage, "Current ratio en amélioration",
                      plus_grand(cr_curr, cr_prev),
                      f"Précédent={f(cr_prev, '.2f')} | Actuel={f(cr_curr, '.2f')}")

        add_criterion(leverage, "Pas de nouvelles actions émises",
                      None if shares_curr is None or shares_prev is None else shares_curr <= shares_prev,
                      f"Précédent={f(shares_prev, ',.0f')} | Actuel={f(shares_curr, ',.0f')}")

        # ── Efficacité opérationnelle ──────────────────────────────────

        revenue_curr = is_(current_col, "Total Revenue")
        revenue_prev = is_(prev_col, "Total Revenue")

        def gross_profit(col, revenue):
            gp = is_(col, "Gross Profit")
            if gp is None:
                cogs = is_(col, "Cost Of Revenue", "Reconciled Cost Of Revenue")
                gp = revenue - cogs if revenue is not None and cogs is not None else None
            return gp

        gm_curr = ratio(gross_profit(current_col, revenue_curr), revenue_curr)
        gm_prev = ratio(gross_profit(prev_col, revenue_prev), revenue_prev)
        at_curr = ratio(revenue_curr, total_assets_curr)
        at_prev = ratio(revenue_prev, total_assets_prev)

        add_criterion(operating, "Marge brute en amélioration",
                      plus_grand(gm_curr, gm_prev),
                      f"Précédent={f(gm_prev, '.3f')} | Actuel={f(gm_curr, '.3f')}")

        add_criterion(operating, "Rotation des actifs en amélioration",
                      plus_grand(at_curr, at_prev),
                      f"Précédent={f(at_prev, '.3f')} | Actuel={f(at_curr, '.3f')}")

        # ── Score et interprétation ────────────────────────────────────

        tous = profitability + leverage + operating
        total_score = sum(1 for c in tous if c["score"] == 1)
        inconnus = sum(1 for c in tous if c["score"] is None)

        return {
            "total_score":    total_score,
            "inconnus":       inconnus,
            "profitability":  profitability,
            "leverage":       leverage,
            "operating":      operating,
            "interpretation": StockDataService.interpret_piotroski(total_score, inconnus),
        }
