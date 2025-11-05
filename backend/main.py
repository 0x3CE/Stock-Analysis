"""
Backend API pour l'analyse d'actions avec calcul du Piotroski F-Score.
Architecture: FastAPI + yfinance pour une séparation claire des responsabilités.

Installation requise:
pip install fastapi uvicorn yfinance pandas python-dotenv
"""

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional, Dict, List
import yfinance as yf
from datetime import datetime
import pandas as pd
from yfinance import Search as YFSearch
import requests
from datetime import datetime

# === Configuration de l'application ===
app = FastAPI(
    title="Stock Analysis API",
    description="API d'analyse d'actions avec Piotroski F-Score",
    version="1.0.0"
)

# Configuration CORS pour autoriser les requêtes depuis le frontend React
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # En production: spécifier les domaines autorisés
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# === Modèles de données (Pydantic pour validation) ===
class StockKPIs(BaseModel):
    current_price: float
    price_change: float
    market_cap: float
    pe_ratio: Optional[float]
    dividend_yield: Optional[float]
    volume: float
    high_52w: Optional[float]
    low_52w: Optional[float]
    beta: Optional[float]
    eps: Optional[float]
    roe: Optional[float]
    debt_to_equity: Optional[float]
    current_ratio: Optional[float]
    profit_margin: Optional[float]


class PiotroskiCriterion(BaseModel):
    criterion: str
    score: int
    detail: str


class PiotroskiScore(BaseModel):
    total_score: int
    profitability: List[PiotroskiCriterion]
    leverage: List[PiotroskiCriterion]
    operating: List[PiotroskiCriterion]
    interpretation: str


class HistoricalData(BaseModel):
    date: str
    price: float
    volume: int

class DividendHistory(BaseModel):
    year: str
    amount: float
    date: Optional[str] = None  # Optionnel, pour afficher la date exacte

class ProfitMarginHistory(BaseModel):
    year: str
    net_income: float
    margin: float

class NewsItem(BaseModel):
    title: str
    url: str
    publisher: Optional[str]
    published_at: Optional[str]


class StockAnalysis(BaseModel):
    ticker: str
    name: str
    kpis: StockKPIs
    historical_data: List[HistoricalData]
    piotroski_score: PiotroskiScore
    dividend_history: List[DividendHistory]
    profit_margin_history: List[ProfitMarginHistory]


# === Service métier : Récupération des données yfinance ===
import yfinance as yf
import pandas as pd
from datetime import datetime
from fastapi import HTTPException
from typing import Dict, List, Any
import numpy as np


class StockDataService:

    # === OUTIL INTERNE ===
    @staticmethod
    def safe_float(value: Any) -> float:
        try:
            if value is None or (isinstance(value, float) and np.isnan(value)):
                return 0.0
            return float(value)
        except Exception:
            return 0.0

    # === RÉCUPÉRATION PRINCIPALE ===
    @staticmethod
    def fetch_stock_info(ticker: str) -> yf.Ticker:
        try:
            stock = yf.Ticker(ticker)
        except Exception as e:
            raise HTTPException(status_code=404, detail=f"Erreur initialisation ticker {ticker}: {e}")

        # Test basique
        try:
            test = stock.fast_info or stock.info
        except Exception:
            raise HTTPException(status_code=404, detail=f"Aucune donnée trouvée pour {ticker}")

        return stock

    # === HISTORIQUE DES PRIX ===
    @staticmethod
    def get_historical_prices(stock: yf.Ticker, period: str = "1y") -> List[Dict]:
        try:
            hist = stock.history(period=period)
            if hist.empty:
                return []
            return [
                {
                    "date": date.strftime("%Y-%m-%d"),
                    "price": round(float(row.get("Close", 0)), 2),
                    "volume": int(row.get("Volume", 0) or 0)
                }
                for date, row in hist.iterrows()
            ]
        except Exception:
            return []

    # === EXTRACTION DES KPI ===
    @staticmethod
    def extract_kpis(stock: yf.Ticker) -> Dict:
        try:
            info = stock.info or {}
        except Exception:
            info = {}

        try:
            fast = getattr(stock, "fast_info", {}) or {}
        except Exception:
            fast = {}

        def g(key, alt=None):
            return info.get(key) or fast.get(alt) or None

        current_price = g("currentPrice", "last_price")
        prev_close = g("previousClose", "last_price")
        if not current_price or not prev_close:
            price_change = 0
        else:
            price_change = ((current_price - prev_close) / prev_close) * 100

        return {
            "current_price": round(StockDataService.safe_float(current_price), 2),
            "price_change": round(StockDataService.safe_float(price_change), 2),
            "market_cap": round(StockDataService.safe_float(g("marketCap")) / 1e9, 2),
            "pe_ratio": StockDataService.safe_float(g("trailingPE")),
            "dividend_yield": round(StockDataService.safe_float(g("dividendYield")) * 100, 2) if g("dividendYield") else None,
            "volume": round(StockDataService.safe_float(g("volume")) / 1e6, 2),
            "high_52w": StockDataService.safe_float(g("fiftyTwoWeekHigh")),
            "low_52w": StockDataService.safe_float(g("fiftyTwoWeekLow")),
            "beta": StockDataService.safe_float(g("beta")),
            "eps": StockDataService.safe_float(g("trailingEps")),
            "roe": round(StockDataService.safe_float(g("returnOnEquity")) * 100, 2) if g("returnOnEquity") else None,
            "debt_to_equity": StockDataService.safe_float(g("debtToEquity")),
            "current_ratio": StockDataService.safe_float(g("currentRatio")),
            "profit_margin": round(StockDataService.safe_float(g("profitMargins")) * 100, 2) if g("profitMargins") else None,
        }

    # === DIVIDENDES ===
    @staticmethod
    def get_dividend_history(stock: yf.Ticker) -> List[Dict]:
        try:
            dividends = stock.dividends
            if dividends.empty:
                return []

            dividends.index = dividends.index.tz_localize(None)
            now = datetime.now()
            filtered = dividends[dividends.index >= (now - pd.DateOffset(years=5))]

            result = []
            for year, group in filtered.groupby(filtered.index.year):
                last_date = group.index[-1]
                last_amount = group.iloc[-1]
                result.append({
                    "year": str(year),
                    "amount": round(float(last_amount), 2),
                    "date": last_date.strftime("%Y-%m-%d")
                })
            return result
        except Exception:
            return []

    # === BÉNÉFICES ET MARGES ===
    @staticmethod
    def get_profit_and_margin_history(stock: yf.Ticker) -> List[Dict]:
        try:
            financials = stock.financials
        except Exception:
            return []

        if financials.empty:
            return []

        history = []
        for col in financials.columns:
            try:
                year = getattr(col, "year", str(col))
                revenue = StockDataService.safe_float(financials.loc.get("Total Revenue", {}).get(col))
                net_income = StockDataService.safe_float(financials.loc.get("Net Income", {}).get(col))
                if revenue != 0:
                    margin = (net_income / revenue) * 100
                    history.append({
                        "year": str(year),
                        "net_income": round(net_income / 1e9, 2),
                        "margin": round(margin, 2)
                    })
            except Exception:
                continue

        return sorted(history, key=lambda x: x["year"])

    # === PIOTROSKI F-SCORE ===
    @staticmethod
    def compute_piotroski_fscore(stock: yf.Ticker) -> Dict:
        try:
            bs = stock.balance_sheet
            is_ = stock.financials
            cf = stock.cashflow
        except Exception:
            return {"score": None, "details": {}}

        score = 0
        details = {}

        def safe(df, row, col):
            try:
                return StockDataService.safe_float(df.loc[row, col])
            except Exception:
                return 0

        cols = is_.columns[:2] if len(is_.columns) >= 2 else is_.columns
        if len(cols) < 2:
            return {"score": None, "details": {}}

        current, prev = cols[0], cols[1]

        # 1. ROA positive
        roa_curr = safe(is_, "Net Income", current) / safe(bs, "Total Assets", current)
        if roa_curr > 0:
            score += 1
            details["ROA positive"] = True

        # 2. Cash flow positif
        cfo = safe(cf, "Total Cash From Operating Activities", current)
        if cfo > 0:
            score += 1
            details["Cash flow positif"] = True

        # 3. Amélioration ROA
        roa_prev = safe(is_, "Net Income", prev) / safe(bs, "Total Assets", prev)
        if roa_curr > roa_prev:
            score += 1
            details["ROA improving"] = True

        # 4. CFO > Net Income
        if cfo > safe(is_, "Net Income", current):
            score += 1
            details["CFO > Net Income"] = True

        # 5. Diminution du leverage
        leverage_curr = safe(bs, "Long Term Debt", current) / safe(bs, "Total Assets", current)
        leverage_prev = safe(bs, "Long Term Debt", prev) / safe(bs, "Total Assets", prev)
        if leverage_curr < leverage_prev:
            score += 1
            details["Leverage decreased"] = True

        # 6. Amélioration du current ratio
        curr_ratio_curr = safe(bs, "Total Current Assets", current) / safe(bs, "Total Current Liabilities", current)
        curr_ratio_prev = safe(bs, "Total Current Assets", prev) / safe(bs, "Total Current Liabilities", prev)
        if curr_ratio_curr > curr_ratio_prev:
            score += 1
            details["Current ratio improved"] = True

        # 7. Pas d’émission d’actions
        shares_curr = safe(bs, "Ordinary Shares Number", current)
        shares_prev = safe(bs, "Ordinary Shares Number", prev)
        if shares_curr <= shares_prev:
            score += 1
            details["No new shares"] = True

        # 8. Amélioration de la marge brute
        gross_margin_curr = safe(is_, "Gross Profit", current) / safe(is_, "Total Revenue", current)
        gross_margin_prev = safe(is_, "Gross Profit", prev) / safe(is_, "Total Revenue", prev)
        if gross_margin_curr > gross_margin_prev:
            score += 1
            details["Gross margin improved"] = True

        # 9. Amélioration du turnover (efficacité)
        asset_turn_curr = safe(is_, "Total Revenue", current) / safe(bs, "Total Assets", current)
        asset_turn_prev = safe(is_, "Total Revenue", prev) / safe(bs, "Total Assets", prev)
        if asset_turn_curr > asset_turn_prev:
            score += 1
            details["Asset turnover improved"] = True

        return {"score": score, "details": details}


# === Routes de l'API ===

@app.get("/")
async def root():
    return {
        "message": "Stock Analysis API",
        "version": "1.0.0",
        "endpoints": {
            "/analyze/{ticker}": "Analyse complète d'une action",
            "/health": "Statut de l'API",
            "/search/{query}": "Recherche d'actions par nom ou ticker"
        }
    }


@app.get("/health")
async def health_check():
    return {"status": "healthy", "timestamp": datetime.now().isoformat()}


# === RECHERCHE DE TICKER ===

@app.get("/search/{query}")
async def search_stocks(query: str):
    """
    Recherche d’actions via Yahoo Finance (max 8 résultats)
    """
    try:
        query = query.strip()
        if not query:
            return {"results": []}

        search_obj = YFSearch(query, max_results=8)
        res = search_obj.search()

        quotes = res.quotes or []
        results = []
        for q in quotes[:5]:
            sym = q.get("symbol")
            name = q.get("shortname") or q.get("longname") or ""
            if sym:
                results.append({"symbol": sym, "name": name})

        return {"results": results}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erreur recherche : {str(e)}")


# === ANALYSE COMPLÈTE ===

@app.get("/analyze/{input_str}")
async def analyze_stock(input_str: str):
    """
    Analyse complète d'une action :
    KPIs, historique de prix, bénéfices/marge, dividendes et score Piotroski
    """
    raw = input_str.strip()
    if not raw:
        raise HTTPException(status_code=400, detail="Ticker/nom vide")

    symbol = raw.upper()

    # Étape 1 — Tentative directe
    try:
        stock = StockDataService.fetch_stock_info(symbol)
    except HTTPException:
        # Étape 2 — Recherche par nom si le ticker n’existe pas
        try:
            results = yf.search(raw)
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Erreur recherche: {str(e)}")
        if not results:
            raise HTTPException(status_code=404, detail=f"Aucune action trouvée pour '{raw}'")
        symbol = results[0].get("symbol")
        if not symbol:
            raise HTTPException(status_code=404, detail=f"Aucune action trouvée pour '{raw}'")
        stock = StockDataService.fetch_stock_info(symbol)

    # === Extraction des données ===
    kpis = StockDataService.extract_kpis(stock)
    historical = StockDataService.get_historical_prices(stock, period="1y")
    piotroski = StockDataService.compute_piotroski_fscore(stock)
    dividend_history = StockDataService.get_dividend_history(stock)
    profit_margin_history = StockDataService.get_profit_and_margin_history(stock)

    try:
        name = stock.info.get("longName") or stock.info.get("shortName") or symbol
    except Exception:
        name = symbol

    return {
        "ticker": symbol,
        "name": name,
        "kpis": kpis,
        "historical_data": historical,
        "piotroski_score": piotroski,
        "dividend_history": dividend_history,
        "profit_margin_history": profit_margin_history
    }


# === Point d'entrée de l'application ===
# if __name__ == "__main__":
#     import uvicorn
#     uvicorn.run(
#         "main:app",
#         host="0.0.0.0",
#         port=8000,
#         reload=True
#     )