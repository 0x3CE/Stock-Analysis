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
class StockDataService:
    @staticmethod
    def fetch_stock_info(ticker: str) -> yf.Ticker:
        """
        Récupère l'objet Ticker yfinance et vérifie la présence de données.
        Si pas de données via info, tente fast_info puis history.
        """
        try:
            stock = yf.Ticker(ticker)
        except Exception as e:
            raise HTTPException(status_code=404, detail=f"Erreur initialisation ticker {ticker}: {str(e)}")

        # Try to read info / fast_info safely
        info = {}
        try:
            info = stock.info or {}
        except Exception:
            info = {}

        fast = {}
        try:
            fast = getattr(stock, "fast_info", {}) or {}
        except Exception:
            fast = {}

        # try common price fields
        price = info.get("currentPrice") or info.get("regularMarketPrice") or fast.get("last_price") or fast.get("lastPrice")
        if price is None:
            # fallback: try small history to detect whether ticker yields data
            try:
                hist = stock.history(period="5d")
                if hist.empty:
                    raise HTTPException(status_code=404, detail=f"Ticker {ticker} invalide ou données indisponibles")
            except HTTPException:
                raise
            except Exception:
                raise HTTPException(status_code=404, detail=f"Ticker {ticker} invalide ou données indisponibles")
        return stock

    @staticmethod
    def get_historical_prices(stock: yf.Ticker, period: str = "1y") -> List[Dict]:
        hist = stock.history(period=period)

        if hist.empty:
            return []

        historical = []
        for date, row in hist.iterrows():
            historical.append({
                "date": date.strftime("%Y-%m-%d"),
                "price": round(float(row.get('Close', row.get('close', 0))), 2),
                "volume": int(row.get('Volume', row.get('volume', 0)) or 0)
            })

        return historical

    @staticmethod
    def extract_kpis(stock: yf.Ticker) -> Dict:
        # read info / fast_info robustly
        info = {}
        try:
            info = stock.info or {}
        except Exception:
            info = {}

        fast = {}
        try:
            fast = getattr(stock, "fast_info", {}) or {}
        except Exception:
            fast = {}

        # Price fallback
        current_price = info.get('currentPrice') or info.get('regularMarketPrice') or fast.get('last_price') or 0
        previous_close = info.get('previousClose') or current_price
        try:
            price_change = ((current_price - previous_close) / previous_close * 100) if previous_close else 0
        except Exception:
            price_change = 0

        market_cap = info.get('marketCap') or 0
        dividend_yield = info.get('dividendYield')
        trailing_pe = info.get('trailingPE')
        volume = info.get('volume') or 0

        return {
            "current_price": round(float(current_price or 0), 2),
            "price_change": round(float(price_change or 0), 2),
            "market_cap": round(float(market_cap or 0) / 1e9, 2),
            "pe_ratio": round(float(trailing_pe), 2) if trailing_pe else None,
            "dividend_yield": round(float(dividend_yield * 100), 2) if dividend_yield else None,
            "volume": round(float(volume or 0) / 1e6, 2),
            "high_52w": round(float(info.get('fiftyTwoWeekHigh')), 2) if info.get('fiftyTwoWeekHigh') else None,
            "low_52w": round(float(info.get('fiftyTwoWeekLow')), 2) if info.get('fiftyTwoWeekLow') else None,
            "beta": round(float(info.get('beta')), 2) if info.get('beta') else None,
            "eps": round(float(info.get('trailingEps')), 2) if info.get('trailingEps') else None,
            "roe": round(float(info.get('returnOnEquity') * 100), 2) if info.get('returnOnEquity') else None,
            "debt_to_equity": round(float(info.get('debtToEquity')), 2) if info.get('debtToEquity') else None,
            "current_ratio": round(float(info.get('currentRatio')), 2) if info.get('currentRatio') else None,
            "profit_margin": round(float(info.get('profitMargins') * 100), 2) if info.get('profitMargins') else None,
        }
    
    @staticmethod
    def get_dividend_history(stock: yf.Ticker) -> List[Dict]:
        try:
            # Récupère l'historique des dividendes
            dividends = stock.dividends
            if dividends.empty:
                return []

            # Convertis l'index en datetime naif (sans fuseau horaire)
            dividends.index = dividends.index.tz_localize(None)

            # Filtre les 5 dernières années
            now = datetime.now()
            five_years_ago = now - pd.DateOffset(years=5)
            filtered = dividends[dividends.index >= pd.Timestamp(five_years_ago)]

            # Formate les données : une entrée par année (dernier dividende de l'année)
            history = []
            for year, group in filtered.groupby(filtered.index.year):
                # Récupère la dernière date et le montant associé
                last_date = group.index[-1]  # Dernière date du groupe
                last_amount = group.iloc[-1]  # Dernier montant du groupe
                history.append({
                    "year": str(year),
                    "amount": round(float(last_amount), 2),
                    "date": last_date.strftime("%Y-%m-%d")  # Date du versement
                })

            return history

        except Exception as e:
            print(f"Erreur récupération dividendes: {e}")
            return []
        
    @staticmethod
    def get_profit_and_margin_history(stock: yf.Ticker) -> List[Dict]:
        """
        Récupère l'évolution du bénéfice net et de la marge nette sur plusieurs années.
        """
        try:
            # Compte de résultat (annualisé)
            financials = stock.financials
            if financials.empty:
                return []

            history = []
            for col in financials.columns:
                try:
                    year = col.year
                    revenue = float(financials.loc["Total Revenue", col]) if "Total Revenue" in financials.index else None
                    net_income = float(financials.loc["Net Income", col]) if "Net Income" in financials.index else None

                    if revenue and net_income:
                        margin = (net_income / revenue) * 100
                        history.append({
                            "year": str(year),
                            "net_income": round(net_income / 1e9, 2),  # en milliards
                            "margin": round(margin, 2)
                        })
                except Exception:
                    continue

            return sorted(history, key=lambda x: x["year"])
        except Exception as e:
            print(f"Erreur récupération bénéfices/marges: {e}")
            return []


# === Service métier : Calcul du Piotroski F-Score ===
class PiotroskiService:
    @staticmethod
    def calculate_score(stock: yf.Ticker) -> Dict:
        info = {}
        try:
            info = stock.info or {}
        except Exception:
            info = {}

        # Basic placeholders (keeps your existing logic with safe .get usage)
        profitability = []
        leverage = []
        operating = []

        roa = info.get('returnOnAssets') or 0
        profitability.append({
            "criterion": "ROA Positif",
            "score": 1 if roa and roa > 0 else 0,
            "detail": f"ROA: {round((roa or 0) * 100, 2)}%"
        })

        ocf = info.get('operatingCashflow') or 0
        profitability.append({
            "criterion": "Cash Flow Opérationnel > 0",
            "score": 1 if ocf and ocf > 0 else 0,
            "detail": f"OCF: {round((ocf or 0) / 1e9, 2)}B"
        })

        profitability.append({
            "criterion": "ROA en croissance",
            "score": 1 if roa and roa > 0.05 else 0,
            "detail": "Estimation basée sur ROA actuel"
        })

        net_income = info.get('netIncomeToCommon') or 0
        quality_score = 1 if ocf > net_income else 0
        detail_ni = f"OCF/NI: {round(ocf / net_income, 2) if net_income else 'N/A'}"
        profitability.append({
            "criterion": "Qualité des bénéfices (OCF > NI)",
            "score": quality_score,
            "detail": detail_ni
        })

        debt_to_equity = info.get('debtToEquity') or 0
        leverage.append({
            "criterion": "Dette/Equity < 100",
            "score": 1 if debt_to_equity < 100 else 0,
            "detail": f"D/E: {round(debt_to_equity, 2)}"
        })

        current_ratio = info.get('currentRatio') or 0
        leverage.append({
            "criterion": "Current Ratio > 1.5",
            "score": 1 if current_ratio > 1.5 else 0,
            "detail": f"Ratio: {round(current_ratio, 2)}"
        })

        leverage.append({
            "criterion": "Pas de nouvelle émission d'actions",
            "score": 1,
            "detail": "Estimation (données limitées)"
        })

        profit_margin = info.get('profitMargins') or 0
        operating.append({
            "criterion": "Marge brute > 15%",
            "score": 1 if profit_margin > 0.15 else 0,
            "detail": f"Marge: {round((profit_margin or 0) * 100, 2)}%"
        })

        operating.append({
            "criterion": "Rotation des actifs en hausse",
            "score": 1 if profit_margin > 0.10 else 0,
            "detail": "Estimation basée sur marge"
        })

        total = sum([c["score"] for c in profitability + leverage + operating])

        if total >= 7:
            interpretation = "EXCELLENT - Fondamentaux solides, entreprise de qualité"
        elif total >= 4:
            interpretation = "MOYEN - Signaux mitigés, analyse approfondie recommandée"
        else:
            interpretation = "FAIBLE - Fondamentaux fragiles, prudence fortement recommandée"

        return {
            "total_score": total,
            "profitability": profitability,
            "leverage": leverage,
            "operating": operating,
            "interpretation": interpretation
        }



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


@app.get("/search/{query}")
async def search_stocks(query: str):
    try:
        query = query.strip()
        if not query:
            return {"results": []}

        # Utilisation de yfinance.Search
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

@app.get("/news/{ticker}", response_model=List[NewsItem])
async def get_stock_news(ticker: str):
    """
    Récupère les actualités Yahoo Finance pour une entreprise donnée.
    """
    if not ticker:
        raise HTTPException(status_code=400, detail="Ticker vide")

    try:
        news = StockDataService.get_yahoo_news(ticker)
        if not news:
            return []
        return news
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erreur récupération news : {str(e)}")


@app.get("/analyze/{input_str}", response_model=StockAnalysis)
async def analyze_stock(input_str: str):
    """
    Analyse complète d'une action.
    Essaie d'abord d'interpréter l'entrée comme un ticker; si échec -> recherche par nom.
    """
    raw = input_str.strip()
    if not raw:
        raise HTTPException(status_code=400, detail="Ticker/nom vide")

    symbol = raw.upper()

    # 1) Try to fetch assuming symbol
    stock = None
    try:
        stock = StockDataService.fetch_stock_info(symbol)
    except HTTPException:
        # 2) Fallback: search by name (case insensitive)
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

    # Extraction
    kpis = StockDataService.extract_kpis(stock)
    historical = StockDataService.get_historical_prices(stock, period="1y")
    piotroski = PiotroskiService.calculate_score(stock)
    dividend_history = StockDataService.get_dividend_history(stock)
    name = ""
    try:
        name = stock.info.get("longName") or stock.info.get("shortName") or symbol
    except Exception:
        name = symbol

    profit_margin_history = StockDataService.get_profit_and_margin_history(stock)


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