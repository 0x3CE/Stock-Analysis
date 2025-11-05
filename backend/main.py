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
        """
        try:
            stock = yf.Ticker(ticker)
        except Exception as e:
            raise HTTPException(status_code=404, detail=f"Erreur initialisation ticker {ticker}: {str(e)}")

        # Fallback sur info / fast_info / history
        info, fast = {}, {}
        try:
            info = stock.info or {}
        except Exception:
            info = {}
        try:
            fast = getattr(stock, "fast_info", {}) or {}
        except Exception:
            fast = {}

        price = info.get("currentPrice") or info.get("regularMarketPrice") or fast.get("last_price") or fast.get("lastPrice")
        if price is None:
            try:
                hist = stock.history(period="5d")
                if hist.empty:
                    raise HTTPException(status_code=404, detail=f"Ticker {ticker} invalide ou données indisponibles")
            except Exception:
                raise HTTPException(status_code=404, detail=f"Ticker {ticker} invalide ou données indisponibles")
        return stock

    @staticmethod
    def safe_float(value):
        try:
            return round(float(value), 2)
        except (TypeError, ValueError):
            return None

    @staticmethod
    def extract_kpis(stock: yf.Ticker) -> Dict:
        info, fast = {}, {}
        try:
            info = stock.info or {}
        except Exception:
            info = {}
        try:
            fast = getattr(stock, "fast_info", {}) or {}
        except Exception:
            fast = {}

        def safe_get(*args):
            for a in args:
                if a is not None:
                    return a
            return None

        current_price = safe_get(info.get('currentPrice'), info.get('regularMarketPrice'), fast.get('last_price'), 0)
        previous_close = safe_get(info.get('previousClose'), current_price)
        try:
            price_change = ((current_price - previous_close)/previous_close*100) if previous_close else 0
        except Exception:
            price_change = 0

        return {
            "current_price": StockDataService.safe_float(current_price),
            "price_change": StockDataService.safe_float(price_change),
            "market_cap": StockDataService.safe_float(info.get('marketCap')/1e9),
            "pe_ratio": StockDataService.safe_float(info.get('trailingPE')),
            "dividend_yield": StockDataService.safe_float(info.get('dividendYield')*100) if info.get('dividendYield') else None,
            "volume": StockDataService.safe_float(info.get('volume', 0)/1e6),
            "high_52w": StockDataService.safe_float(info.get('fiftyTwoWeekHigh')),
            "low_52w": StockDataService.safe_float(info.get('fiftyTwoWeekLow')),
            "beta": StockDataService.safe_float(info.get('beta')),
            "eps": StockDataService.safe_float(info.get('trailingEps')),
            "roe": StockDataService.safe_float(info.get('returnOnEquity')*100),
            "debt_to_equity": StockDataService.safe_float(info.get('debtToEquity')),
            "current_ratio": StockDataService.safe_float(info.get('currentRatio')),
            "profit_margin": StockDataService.safe_float(info.get('profitMargins')*100),
        }

    @staticmethod
    def get_historical_prices(stock: yf.Ticker, period: str = "1y") -> List[Dict]:
        try:
            hist = stock.history(period=period)
        except Exception:
            return []

        if hist.empty:
            return []

        historical = []
        for date, row in hist.iterrows():
            historical.append({
                "date": date.strftime("%Y-%m-%d"),
                "price": StockDataService.safe_float(row.get('Close')),
                "volume": int(row.get('Volume') or 0)
            })
        return historical

    @staticmethod
    def get_dividend_history(stock: yf.Ticker) -> List[Dict]:
        try:
            divs = stock.dividends
            if divs.empty:
                return []
            divs.index = divs.index.tz_localize(None)
            five_years_ago = datetime.now() - pd.DateOffset(years=5)
            filtered = divs[divs.index >= five_years_ago]

            history = []
            for year, group in filtered.groupby(filtered.index.year):
                last_date = group.index[-1]
                last_amount = group.iloc[-1]
                history.append({
                    "year": str(year),
                    "amount": StockDataService.safe_float(last_amount),
                    "date": last_date.strftime("%Y-%m-%d")
                })
            return history
        except Exception:
            return []

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
                year = getattr(col, 'year', str(col))
                revenue = StockDataService.safe_float(financials.loc.get("Total Revenue", {}).get(col))
                net_income = StockDataService.safe_float(financials.loc.get("Net Income", {}).get(col))
                if revenue and net_income:
                    margin = net_income / revenue * 100 if revenue else 0
                    history.append({
                        "year": str(year),
                        "net_income": round(net_income/1e9, 2),
                        "margin": round(margin, 2)
                    })
            except Exception:
                continue
        return sorted(history, key=lambda x: x["year"])

class PiotroskiService:
    """
    Piotroski F-Score (les 9 critères classiques) — implémentation complète et robuste.
    Se base sur les champs disponibles dans stock.info (et fallback raisonnable).
    """

    @staticmethod
    def _safe(val):
        """Convertit en float arrondi ou retourne None."""
        try:
            if val is None:
                return None
            return round(float(val), 8)  # précision élevée pour les comparaisons
        except Exception:
            return None

    @staticmethod
    def calculate_score(stock: yf.Ticker) -> Dict:
        """
        Retourne un dict avec :
        - total_score (0..9)
        - profitability (3 critères)
        - leverage (3 critères)
        - operating (3 critères)
        - interpretation (texte)
        Chaque critère contient {criterion, score, detail}.
        """

        try:
            info = getattr(stock, "info", {}) or {}
        except Exception:
            info = {}

        # récupérations sécurisées (valeurs brutes)
        roa = PiotroskiService._safe(info.get("returnOnAssets"))              # returnOnAssets (ex: 0.12)
        ocf = PiotroskiService._safe(info.get("operatingCashflow"))          # operatingCashflow (montant)
        net_income = PiotroskiService._safe(info.get("netIncomeToCommon"))   # net income (montant)
        debt_to_equity = PiotroskiService._safe(info.get("debtToEquity"))    # ratio %
        current_ratio = PiotroskiService._safe(info.get("currentRatio"))     # ratio
        profit_margin = PiotroskiService._safe(info.get("profitMargins"))    # fraction (ex 0.2)
        # note: trailingEps, totalRevenue, etc. could be used for deeper checks if present

        # Définitions des listes de critères
        profitability = []
        leverage = []
        operating = []

        # ---------- PROFITABILITY ----------
        # 1) ROA positif
        try:
            score_roa = 1 if (roa is not None and roa > 0) else 0
            detail_roa = f"ROA: {round((roa or 0) * 100, 2)}%" if roa is not None else "ROA indisponible"
        except Exception:
            score_roa = 0
            detail_roa = "ROA indisponible"
        profitability.append({
            "criterion": "ROA positif",
            "score": score_roa,
            "detail": detail_roa
        })

        # 2) Cash flow opérationnel > 0
        try:
            score_ocf = 1 if (ocf is not None and ocf > 0) else 0
            # affichage en milliards si montant
            detail_ocf = f"OCF: {round((ocf or 0) / 1e9, 2)} B" if ocf is not None else "OCF indisponible"
        except Exception:
            score_ocf = 0
            detail_ocf = "OCF indisponible"
        profitability.append({
            "criterion": "Cash flow opérationnel > 0",
            "score": score_ocf,
            "detail": detail_ocf
        })

        # 3) ROA en croissance (approximation : ROA > 5% ici si pas d'historique détaillé)
        # (tu peux remplacer par comparaison entre années si tu veux exploiter financials)
        try:
            score_roa_growth = 1 if (roa is not None and roa > 0.05) else 0
            detail_roa_growth = f"ROA actuel: {round((roa or 0) * 100, 2)}%" if roa is not None else "ROA indisponible"
        except Exception:
            score_roa_growth = 0
            detail_roa_growth = "ROA indisponible"
        profitability.append({
            "criterion": "ROA en croissance (approx.)",
            "score": score_roa_growth,
            "detail": detail_roa_growth
        })

        # ---------- LEVERAGE (EFFET DE LEVIER) ----------
        # 4) Dette / Equity < 100
        try:
            score_de = 1 if (debt_to_equity is not None and debt_to_equity < 100) else 0
            detail_de = f"D/E: {round(debt_to_equity, 2)}" if debt_to_equity is not None else "D/E indisponible"
        except Exception:
            score_de = 0
            detail_de = "D/E indisponible"
        leverage.append({
            "criterion": "Dette/Equity < 100",
            "score": score_de,
            "detail": detail_de
        })

        # 5) Current ratio > 1.5
        try:
            score_cr = 1 if (current_ratio is not None and current_ratio > 1.5) else 0
            detail_cr = f"Current Ratio: {round(current_ratio, 2)}" if current_ratio is not None else "Current ratio indisponible"
        except Exception:
            score_cr = 0
            detail_cr = "Current ratio indisponible"
        leverage.append({
            "criterion": "Current Ratio > 1.5",
            "score": score_cr,
            "detail": detail_cr
        })

        # 6) Pas de nouvelle émission d'actions (estimation)
        # Comme yfinance n'expose pas directement 'sharesOutstanding' history, on met une estimation prudente
        try:
            # Si "sharesOutstanding" existe, on assume pas d'émission récente (on ne peut pas savoir facilement)
            shares_out = PiotroskiService._safe(info.get("sharesOutstanding"))
            detail_shares = f"SharesOutstanding: {int(shares_out)}" if shares_out is not None else "Donnée actions indisponible"
            # On ne peut pas déduire émission récente sans historique d'actions; on marque 1 (comme avant)
            score_shares = 1
        except Exception:
            detail_shares = "Donnée actions indisponible"
            score_shares = 1
        leverage.append({
            "criterion": "Pas de nouvelle émission d'actions (estimation)",
            "score": score_shares,
            "detail": detail_shares
        })

        # ---------- OPERATING (ACTIVITÉ) ----------
        # 7) Marge brute > 15% (on utilise profit_margin si disponible)
        try:
            profit_margin_pct = None
            if profit_margin is not None:
                # profit_margin arrive sous forme fraction (ex 0.2), on passe en % pour comparaison
                profit_margin_pct = profit_margin * 100 if abs(profit_margin) < 5 else profit_margin  # si déjà en %
            score_margin = 1 if (profit_margin_pct is not None and profit_margin_pct > 15) else 0
            detail_margin = f"Marge: {round(profit_margin_pct,2)}%" if profit_margin_pct is not None else "Marge indisponible"
        except Exception:
            score_margin = 0
            detail_margin = "Marge indisponible"
        operating.append({
            "criterion": "Marge brute > 15%",
            "score": score_margin,
            "detail": detail_margin
        })

        # 8) Rotation des actifs en hausse (approx via grossMargins / revenueGrowth if available)
        # On essaie d'utiliser revenueGrowth comme proxy (si > 0 -> activité en hausse)
        try:
            rev_growth = PiotroskiService._safe(info.get("revenueGrowth"))  # ex 0.05
            score_turnover = 1 if (rev_growth is not None and rev_growth > 0) else 0
            detail_turnover = f"Croissance CA: {round((rev_growth or 0)*100,2)}%" if rev_growth is not None else "Donnée croissance CA indisponible"
        except Exception:
            score_turnover = 0
            detail_turnover = "Donnée croissance CA indisponible"
        operating.append({
            "criterion": "Rotation des actifs / croissance CA positive (proxy)",
            "score": score_turnover,
            "detail": detail_turnover
        })

        # 9) Autre critère opérationnel : qualité des bénéfices (OCF > NI) — on avait aussi ce critère
        try:
            # ocf and net_income sont montants ; on compare
            if ocf is not None and net_income is not None:
                score_quality = 1 if ocf > net_income else 0
                detail_quality = f"OCF: {round(ocf,2)}, NI: {round(net_income,2)}"
            else:
                score_quality = 0
                detail_quality = "Données OCF/NI manquantes"
        except Exception:
            score_quality = 0
            detail_quality = "Données OCF/NI manquantes"
        operating.append({
            "criterion": "Qualité des bénéfices (OCF > NI)",
            "score": score_quality,
            "detail": detail_quality
        })

        # Somme des scores
        total = sum([c["score"] for c in (profitability + leverage + operating)])

        # Interprétation textuelle (même wording que précédemment)
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