from fastapi import APIRouter, HTTPException
from yfinance import Search as YFSearch
import yfinance as yf
from services.stock_service import StockDataService

router = APIRouter(prefix="/api")

@router.get("/search/{query}")
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

@router.get("/analyze/{input_str}")
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

    # Construction sécurisée des dicts
    try: kpis = StockDataService.extract_kpis(stock)
    except Exception: kpis = {}
    try: historical = StockDataService.get_historical_prices(stock)
    except Exception: historical = []
    try: dividend_history = StockDataService.get_dividend_history(stock)
    except Exception: dividend_history = []
    try: profit_margin_history = StockDataService.get_profit_and_margin_history(stock)
    except Exception: profit_margin_history = []
    try: piotroski = StockDataService.compute_piotroski_fscore(stock)
    except Exception:
        piotroski = {"total_score": 0, "profitability": [], "leverage": [], "operating": [], "interpretation": "N/A"}

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
