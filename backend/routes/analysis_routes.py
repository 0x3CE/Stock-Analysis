from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import JSONResponse
from yfinance import Search as YFSearch
from cachetools import TTLCache
import yfinance as yf
import math
import json
import logging
from services.stock_service import StockDataService
from core.config import settings
from core.limiter import limiter

router = APIRouter(prefix="/api")
logger = logging.getLogger(__name__)

# Cache des analyses : 50 tickers max, TTL 5 minutes
_analysis_cache: TTLCache = TTLCache(maxsize=50, ttl=300)


# ---------------------------------------------------------------------------
# Sérialisation JSON sécurisée (élimine NaN et Inf)
# ---------------------------------------------------------------------------

def _sanitize(obj):
    """Remplace récursivement NaN/Inf par None dans toute structure."""
    if isinstance(obj, float):
        return None if (math.isnan(obj) or math.isinf(obj)) else obj
    if isinstance(obj, dict):
        return {k: _sanitize(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [_sanitize(v) for v in obj]
    return obj

class SafeJSONResponse(JSONResponse):
    def render(self, content) -> bytes:
        return json.dumps(_sanitize(content)).encode("utf-8")


# ---------------------------------------------------------------------------
# Validation du ticker
# ---------------------------------------------------------------------------

def _validate_ticker(raw: str) -> str:
    """Valide et normalise un ticker. Lève HTTPException si invalide."""
    symbol = raw.strip().upper()
    if not symbol:
        raise HTTPException(status_code=400, detail="Ticker vide")
    if not settings.TICKER_REGEX.match(symbol):
        raise HTTPException(status_code=400, detail="Ticker invalide")
    return symbol


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@router.get("/search/{query}")
@limiter.limit("30/minute")
async def search_stocks(request: Request, query: str):
    query = query.strip()
    if not query or len(query) > 50:
        return {"results": []}

    try:
        search_obj = YFSearch(query, max_results=8)
        res = search_obj.search()
        quotes = res.quotes or []
        results = [
            {"symbol": q["symbol"], "name": q.get("shortname") or q.get("longname") or ""}
            for q in quotes[:5] if q.get("symbol")
        ]
        return {"results": results}
    except Exception:
        logger.exception("Erreur lors de la recherche : %s", query)
        raise HTTPException(status_code=500, detail="Erreur lors de la recherche")


@router.get("/analyze/{input_str}")
@limiter.limit("10/minute")
async def analyze_stock(request: Request, input_str: str):
    symbol = _validate_ticker(input_str)

    if symbol in _analysis_cache:
        logger.debug("Cache hit pour %s", symbol)
        return SafeJSONResponse(_analysis_cache[symbol])

    try:
        stock = StockDataService.fetch_stock_info(symbol)
    except HTTPException as exc:
        # Propager 429 (rate limit) directement — ne pas tenter de fallback
        if exc.status_code == 429:
            raise
        # 404 : tentative de résolution via la recherche yfinance
        try:
            search_obj = YFSearch(input_str.strip(), max_results=3)
            res = search_obj.search()
            quotes = getattr(res, "quotes", None) or []
            if not quotes:
                raise HTTPException(status_code=404, detail=f"Aucune action trouvée pour '{symbol}'")
            symbol = quotes[0].get("symbol", symbol)
        except HTTPException:
            raise
        except Exception:
            logger.exception("Erreur recherche fallback pour : %s", input_str)
            raise HTTPException(status_code=404, detail=f"Aucune action trouvée pour '{symbol}'")
        stock = StockDataService.fetch_stock_info(symbol)

    try: kpis = StockDataService.extract_kpis(stock)
    except Exception:
        logger.exception("Erreur extraction KPIs pour %s", symbol)
        kpis = {}

    try: historical = StockDataService.get_historical_prices(stock)
    except Exception:
        logger.exception("Erreur historique pour %s", symbol)
        historical = []

    # Fallback prix depuis l'historique quand stock.info est rate-limité
    if not kpis.get("current_price") and len(historical) >= 2:
        last  = historical[-1]["price"]
        prev  = historical[-2]["price"]
        kpis["current_price"] = last
        kpis["price_change"]  = round((last - prev) / prev * 100, 2) if prev else 0.0

    try: dividend_history = StockDataService.get_dividend_history(stock)
    except Exception:
        logger.exception("Erreur dividendes pour %s", symbol)
        dividend_history = []

    try: profit_margin_history = StockDataService.get_profit_and_margin_history(stock)
    except Exception:
        logger.exception("Erreur marges pour %s", symbol)
        profit_margin_history = []

    try: piotroski = StockDataService.compute_piotroski_fscore(stock)
    except Exception:
        logger.exception("Erreur Piotroski pour %s", symbol)
        piotroski = {"total_score": 0, "profitability": [], "leverage": [], "operating": [], "interpretation": "N/A"}

    try:
        info  = stock.info or {}
        name  = info.get("longName") or info.get("shortName") or symbol
        sector   = info.get("sector") or None
        industry = info.get("industry") or None
        market   = info.get("exchange") or info.get("market") or None
        currency = info.get("currency") or "USD"
    except Exception:
        name = symbol
        sector = industry = market = None
        currency = "USD"

    result = {
        "ticker":                symbol,
        "name":                  name,
        "sector":                sector,
        "industry":              industry,
        "market":                market,
        "currency":              currency,
        "kpis":                  kpis,
        "historical_data":       historical,
        "piotroski_score":       piotroski,
        "dividend_history":      dividend_history,
        "profit_margin_history": profit_margin_history,
    }
    _analysis_cache[symbol] = result
    return SafeJSONResponse(result)
