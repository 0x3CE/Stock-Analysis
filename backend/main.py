"""
Backend API pour l'analyse d'actions avec calcul du Piotroski F-Score.
Architecture: FastAPI + yfinance.

Installation:
pip install fastapi uvicorn yfinance pandas python-dotenv numpy
"""

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional, List, Dict, Any
import yfinance as yf
from yfinance import Search as YFSearch
from datetime import datetime
import pandas as pd
import numpy as np

# === Configuration FastAPI ===
app = FastAPI(
    title="Stock Analysis API",
    description="API d'analyse d'actions avec Piotroski F-Score",
    version="1.0.0"
)

# CORS pour React
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # En prod : restreindre le domaine
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# === Modèles Pydantic ===
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
    date: Optional[str] = None

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

# === Service pour les données yfinance ===
class StockDataService:

    @staticmethod
    def safe_float(value: Any) -> float:
        try:
            if value is None or (isinstance(value, float) and np.isnan(value)):
                return 0.0
            return float(value)
        except Exception:
            return 0.0

    @staticmethod
    def fetch_stock_info(ticker: str) -> yf.Ticker:
        stock = yf.Ticker(ticker)
        try:
            # Test minimal pour vérifier que le ticker existe
            _ = stock.fast_info or stock.info
        except Exception:
            raise HTTPException(status_code=404, detail=f"Aucune donnée trouvée pour {ticker}")
        return stock

    @staticmethod
    def extract_kpis(stock: yf.Ticker) -> Dict:
        info = getattr(stock, "info", {}) or {}
        fast = getattr(stock, "fast_info", {}) or {}

        def g(key, alt=None):
            return info.get(key) or fast.get(alt) or None

        current_price = g("currentPrice", "last_price")
        prev_close = g("previousClose", "last_price")
        price_change = ((current_price - prev_close) / prev_close * 100) if current_price and prev_close else 0

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

    @staticmethod
    def get_historical_prices(stock: yf.Ticker, period: str = "1y") -> List[Dict]:
        hist = stock.history(period=period)
        if hist.empty:
            return []
        hist.reset_index(inplace=True)
        return [{"date": d.strftime("%Y-%m-%d"), "price": round(float(c), 2), "volume": int(v)}
                for d, c, v in zip(hist['Date'], hist['Close'], hist['Volume'])]

    @staticmethod
    def get_dividend_history(stock: yf.Ticker) -> List[Dict]:
        divs = getattr(stock, "dividends", pd.Series())
        if divs.empty:
            return []
        divs.index = divs.index.tz_localize(None)
        now = datetime.now()
        filtered = divs[divs.index >= (now - pd.DateOffset(years=5))]
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

    @staticmethod
    def get_profit_and_margin_history(stock: yf.Ticker) -> List[Dict]:
        fin = getattr(stock, "financials", pd.DataFrame())
        if fin.empty:
            return []

        fin = fin.fillna(0)
        history = []
        for col in fin.columns:
            try:
                year = col.year if hasattr(col, "year") else str(col)
                revenue = StockDataService.safe_float(fin.at["Total Revenue", col])
                net_income = StockDataService.safe_float(fin.at["Net Income", col])
                margin = (net_income / revenue * 100) if revenue else 0
                history.append({"year": str(year), "net_income": round(net_income / 1e9, 2), "margin": round(margin, 2)})
            except Exception:
                continue
        return sorted(history, key=lambda x: x["year"])

    @staticmethod
    def compute_piotroski_fscore(stock: yf.Ticker) -> Dict:
        bs = getattr(stock, "balance_sheet", pd.DataFrame())
        is_ = getattr(stock, "financials", pd.DataFrame())
        cf = getattr(stock, "cashflow", pd.DataFrame())

        if bs.empty or is_.empty or cf.empty:
            return {
                "total_score": 0,
                "profitability": [],
                "leverage": [],
                "operating": [],
                "interpretation": "N/A"
            }

        def safe(df, row, col):
            try:
                return StockDataService.safe_float(df.at[row, col])
            except Exception:
                return 0

        cols = is_.columns[:2] if len(is_.columns) >= 2 else is_.columns
        current, prev = cols[0], cols[1] if len(cols) > 1 else cols[0]

        total_score = 0
        profitability, leverage, operating = [], [], []

        # 1. ROA positive
        roa_curr = safe(is_, "Net Income", current) / max(safe(bs, "Total Assets", current), 1)
        score = 1 if roa_curr > 0 else 0
        total_score += score
        profitability.append({"criterion": "ROA positive", "score": score, "detail": f"ROA={roa_curr:.2f}"})

        # 2. CFO positif
        cfo = safe(cf, "Total Cash From Operating Activities", current)
        score = 1 if cfo > 0 else 0
        total_score += score
        profitability.append({"criterion": "Cash flow positif", "score": score, "detail": f"CFO={cfo:.2f}"})

        # 3. ROA improving
        roa_prev = safe(is_, "Net Income", prev) / max(safe(bs, "Total Assets", prev), 1)
        score = 1 if roa_curr > roa_prev else 0
        total_score += score
        profitability.append({"criterion": "ROA improving", "score": score, "detail": f"Prev={roa_prev:.2f} Curr={roa_curr:.2f}"})

        # 4. CFO > Net Income
        ni = safe(is_, "Net Income", current)
        score = 1 if cfo > ni else 0
        total_score += score
        profitability.append({"criterion": "CFO > Net Income", "score": score, "detail": f"CFO={cfo:.2f} NI={ni:.2f}"})

        # 5. Leverage decreased
        leverage_curr = safe(bs, "Long Term Debt", current) / max(safe(bs, "Total Assets", current), 1)
        leverage_prev = safe(bs, "Long Term Debt", prev) / max(safe(bs, "Total Assets", prev), 1)
        score = 1 if leverage_curr < leverage_prev else 0
        total_score += score
        leverage.append({"criterion": "Leverage decreased", "score": score, "detail": f"Prev={leverage_prev:.2f} Curr={leverage_curr:.2f}"})

        # 6. Current ratio improved
        curr_ratio_curr = safe(bs, "Total Current Assets", current) / max(safe(bs, "Total Current Liabilities", current), 1)
        curr_ratio_prev = safe(bs, "Total Current Assets", prev) / max(safe(bs, "Total Current Liabilities", prev), 1)
        score = 1 if curr_ratio_curr > curr_ratio_prev else 0
        total_score += score
        leverage.append({"criterion": "Current ratio improved", "score": score, "detail": f"Prev={curr_ratio_prev:.2f} Curr={curr_ratio_curr:.2f}"})

        # 7. No new shares
        shares_curr = safe(bs, "Ordinary Shares Number", current)
        shares_prev = safe(bs, "Ordinary Shares Number", prev)
        score = 1 if shares_curr <= shares_prev else 0
        total_score += score
        leverage.append({"criterion": "No new shares", "score": score, "detail": f"Prev={shares_prev} Curr={shares_curr}"})

        # 8. Gross margin improved
        gm_curr = safe(is_, "Gross Profit", current) / max(safe(is_, "Total Revenue", current), 1)
        gm_prev = safe(is_, "Gross Profit", prev) / max(safe(is_, "Total Revenue", prev), 1)
        score = 1 if gm_curr > gm_prev else 0
        total_score += score
        operating.append({"criterion": "Gross margin improved", "score": score, "detail": f"Prev={gm_prev:.2f} Curr={gm_curr:.2f}"})

        # 9. Asset turnover improved
        at_curr = safe(is_, "Total Revenue", current) / max(safe(bs, "Total Assets", current), 1)
        at_prev = safe(is_, "Total Revenue", prev) / max(safe(bs, "Total Assets", prev), 1)
        score = 1 if at_curr > at_prev else 0
        total_score += score
        operating.append({"criterion": "Asset turnover improved", "score": score, "detail": f"Prev={at_prev:.2f} Curr={at_curr:.2f}"})

        # Interprétation
        if total_score >= 7:
            interp = "EXCELLENT"
        elif total_score >= 4:
            interp = "MOYEN"
        else:
            interp = "FAIBLE"

        return {
            "total_score": total_score,
            "profitability": profitability,
            "leverage": leverage,
            "operating": operating,
            "interpretation": interp
        }

# === Routes API ===
@app.get("/")
async def root():
    return {"message": "Stock Analysis API", "version": "1.0.0"}

@app.get("/health")
async def health_check():
    return {"status": "healthy", "timestamp": datetime.now().isoformat()}

@app.get("/search/{query}")
async def search_stocks(query: str):
    query = query.strip()
    if not query:
        return {"results": []}
    try:
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

@app.get("/analyze/{input_str}")
async def analyze_stock(input_str: str):
    raw = input_str.strip()
    if not raw:
        raise HTTPException(status_code=400, detail="Ticker/nom vide")

    symbol = raw.upper()
    try:
        stock = StockDataService.fetch_stock_info(symbol)
    except HTTPException:
        # Recherche par nom
        try:
            results = yf.search(raw)
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Erreur recherche: {str(e)}")
        if not results:
            raise HTTPException(status_code=404, detail=f"Aucune action trouvée pour '{raw}'")
        symbol = results[0].get("symbol")
        stock = StockDataService.fetch_stock_info(symbol)

    # Extraction
    kpis = StockDataService.extract_kpis(stock)
    historical = StockDataService.get_historical_prices(stock, period="1y")
    dividend_history = StockDataService.get_dividend_history(stock)
    profit_margin_history = StockDataService.get_profit_and_margin_history(stock)
    piotroski = StockDataService.compute_piotroski_fscore(stock)

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

# === Lancer avec uvicorn ===
# if __name__ == "__main__":
#     import
