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
from datetime import datetime, timedelta
import pandas as pd

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
    """Modèle représentant les KPIs principaux d'une action."""
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
    """Modèle représentant un critère individuel du Piotroski F-Score."""
    criterion: str
    score: int
    detail: str


class PiotroskiScore(BaseModel):
    """Modèle du Piotroski F-Score complet avec détails par catégorie."""
    total_score: int
    profitability: List[PiotroskiCriterion]
    leverage: List[PiotroskiCriterion]
    operating: List[PiotroskiCriterion]
    interpretation: str


class HistoricalData(BaseModel):
    """Point de données historiques (prix + volume)."""
    date: str
    price: float
    volume: int


class StockAnalysis(BaseModel):
    """Réponse complète de l'analyse d'une action."""
    ticker: str
    name: str
    kpis: StockKPIs
    historical_data: List[HistoricalData]
    piotroski_score: PiotroskiScore


# === Service métier : Récupération des données yfinance ===
class StockDataService:
    """Service responsable de la récupération et transformation des données."""
    
    @staticmethod
    def fetch_stock_info(ticker: str) -> yf.Ticker:
        """Récupère l'objet Ticker yfinance avec gestion d'erreur."""
        try:
            stock = yf.Ticker(ticker)
            # Vérification que le ticker existe en testant l'accès aux infos
            if not stock.info or 'regularMarketPrice' not in stock.info:
                raise ValueError(f"Ticker {ticker} invalide ou données indisponibles")
            return stock
        except Exception as e:
            raise HTTPException(status_code=404, detail=f"Erreur ticker {ticker}: {str(e)}")
    
    @staticmethod
    def get_historical_prices(stock: yf.Ticker, period: str = "1y") -> List[Dict]:
        """Récupère l'historique des prix sur une période donnée."""
        hist = stock.history(period=period)
        
        if hist.empty:
            return []
        
        # Transformation en format exploitable par le frontend
        historical = []
        for date, row in hist.iterrows():
            historical.append({
                "date": date.strftime("%Y-%m-%d"),
                "price": round(float(row['Close']), 2),
                "volume": int(row['Volume'])
            })
        
        return historical
    
    @staticmethod
    def extract_kpis(stock: yf.Ticker) -> Dict:
        """Extrait les KPIs depuis l'objet yfinance avec valeurs par défaut."""
        info = stock.info
        
        current_price = info.get('currentPrice') or info.get('regularMarketPrice', 0)
        previous_close = info.get('previousClose', current_price)
        price_change = ((current_price - previous_close) / previous_close * 100) if previous_close else 0
        
        return {
            "current_price": round(current_price, 2),
            "price_change": round(price_change, 2),
            "market_cap": round(info.get('marketCap', 0) / 1e9, 2),
            "pe_ratio": round(info.get('trailingPE', 0), 2) if info.get('trailingPE') else None,
            "dividend_yield": round(info.get('dividendYield', 0) * 100, 2) if info.get('dividendYield') else None,
            "volume": round(info.get('volume', 0) / 1e6, 2),
            "high_52w": round(info.get('fiftyTwoWeekHigh', 0), 2) if info.get('fiftyTwoWeekHigh') else None,
            "low_52w": round(info.get('fiftyTwoWeekLow', 0), 2) if info.get('fiftyTwoWeekLow') else None,
            "beta": round(info.get('beta', 0), 2) if info.get('beta') else None,
            "eps": round(info.get('trailingEps', 0), 2) if info.get('trailingEps') else None,
            "roe": round(info.get('returnOnEquity', 0) * 100, 2) if info.get('returnOnEquity') else None,
            "debt_to_equity": round(info.get('debtToEquity', 0), 2) if info.get('debtToEquity') else None,
            "current_ratio": round(info.get('currentRatio', 0), 2) if info.get('currentRatio') else None,
            "profit_margin": round(info.get('profitMargins', 0) * 100, 2) if info.get('profitMargins') else None,
        }


# === Service métier : Calcul du Piotroski F-Score ===
class PiotroskiService:
    """Service dédié au calcul du Piotroski F-Score selon les 9 critères standards."""
    
    @staticmethod
    def calculate_score(stock: yf.Ticker) -> Dict:
        """
        Calcule le Piotroski F-Score (0-9) en évaluant 9 critères financiers.
        Retourne le score total + détails par catégorie.
        """
        info = stock.info
        financials = stock.financials
        balance_sheet = stock.balance_sheet
        cashflow = stock.cashflow
        
        # Initialisation des catégories de critères
        profitability = []
        leverage = []
        operating = []
        
        # === RENTABILITÉ (4 critères) ===
        
        # 1. ROA positif (Net Income / Total Assets > 0)
        roa = info.get('returnOnAssets', 0)
        profitability.append({
            "criterion": "ROA Positif",
            "score": 1 if roa > 0 else 0,
            "detail": f"ROA: {round(roa * 100, 2)}%"
        })
        
        # 2. Cash Flow opérationnel positif
        ocf = info.get('operatingCashflow', 0)
        profitability.append({
            "criterion": "Cash Flow Opérationnel > 0",
            "score": 1 if ocf > 0 else 0,
            "detail": f"OCF: {round(ocf / 1e9, 2)}B"
        })
        
        # 3. ROA en croissance (comparaison année N vs N-1)
        # Note: nécessite données historiques complètes
        profitability.append({
            "criterion": "ROA en croissance",
            "score": 1 if roa > 0.05 else 0,  # Approximation basée sur ROA actuel
            "detail": "Estimation basée sur ROA actuel"
        })
        
        # 4. Qualité des bénéfices (OCF > Net Income)
        net_income = info.get('netIncomeToCommon', 0)
        profitability.append({
            "criterion": "Qualité des bénéfices (OCF > NI)",
            "score": 1 if ocf > net_income else 0,
            "detail": f"OCF/NI: {round(ocf / net_income, 2) if net_income else 'N/A'}"
        })
        
        # === LEVIER / LIQUIDITÉ / SOURCES DE FINANCEMENT (3 critères) ===
        
        # 5. Dette à long terme en baisse
        debt_to_equity = info.get('debtToEquity', 100)
        leverage.append({
            "criterion": "Dette/Equity < 100",
            "score": 1 if debt_to_equity < 100 else 0,
            "detail": f"D/E: {round(debt_to_equity, 2)}"
        })
        
        # 6. Current Ratio en hausse (Actifs courants / Passifs courants)
        current_ratio = info.get('currentRatio', 0)
        leverage.append({
            "criterion": "Current Ratio > 1.5",
            "score": 1 if current_ratio > 1.5 else 0,
            "detail": f"Ratio: {round(current_ratio, 2)}"
        })
        
        # 7. Pas d'émission de nouvelles actions (dilution)
        # Note: nécessite comparaison historique du nombre d'actions
        leverage.append({
            "criterion": "Pas de nouvelle émission d'actions",
            "score": 1,  # Par défaut à 1 (données historiques limitées)
            "detail": "Estimation (données limitées)"
        })
        
        # === EFFICACITÉ OPÉRATIONNELLE (2 critères) ===
        
        # 8. Marge brute en hausse
        profit_margin = info.get('profitMargins', 0)
        operating.append({
            "criterion": "Marge brute > 15%",
            "score": 1 if profit_margin > 0.15 else 0,
            "detail": f"Marge: {round(profit_margin * 100, 2)}%"
        })
        
        # 9. Rotation des actifs en hausse (Ventes / Total Assets)
        # Note: nécessite comparaison historique
        operating.append({
            "criterion": "Rotation des actifs en hausse",
            "score": 1 if profit_margin > 0.10 else 0,  # Approximation
            "detail": "Estimation basée sur marge"
        })
        
        # Calcul du score total
        total = sum([c["score"] for c in profitability + leverage + operating])
        
        # Interprétation du score selon la méthodologie Piotroski
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
    """Endpoint racine pour vérifier que l'API fonctionne."""
    return {
        "message": "Stock Analysis API",
        "version": "1.0.0",
        "endpoints": {
            "/analyze/{ticker}": "Analyse complète d'une action",
            "/health": "Statut de l'API"
        }
    }


@app.get("/health")
async def health_check():
    """Endpoint de santé pour monitoring."""
    return {"status": "healthy", "timestamp": datetime.now().isoformat()}


@app.get("/analyze/{ticker}", response_model=StockAnalysis)
async def analyze_stock(ticker: str):
    """
    Endpoint principal : analyse complète d'une action.
    
    Args:
        ticker: Symbole de l'action (ex: AAPL, MSFT, TSLA)
    
    Returns:
        StockAnalysis: Objet contenant KPIs, historique et Piotroski F-Score
    
    Raises:
        HTTPException: Si le ticker est invalide ou données indisponibles
    """
    ticker = ticker.upper()
    
    # Récupération des données via le service
    stock = StockDataService.fetch_stock_info(ticker)
    
    # Extraction des différentes composantes
    kpis = StockDataService.extract_kpis(stock)
    historical = StockDataService.get_historical_prices(stock, period="1y")
    piotroski = PiotroskiService.calculate_score(stock)
    
    # Construction de la réponse complète
    return {
        "ticker": ticker,
        "name": stock.info.get('longName', ticker),
        "kpis": kpis,
        "historical_data": historical,
        "piotroski_score": piotroski
    }


# === Point d'entrée de l'application ===
if __name__ == "__main__":
    import uvicorn
    
    # Lancement du serveur en mode développement
    # En production: utiliser gunicorn ou équivalent
    uvicorn.run(
        "main:app",  # Remplacer "main" par le nom de votre fichier
        host="0.0.0.0",
        port=8000,
        reload=True  # Hot reload en dev
    )