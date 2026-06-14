"""market_routes.py — Snapshot des indices et actifs pour le carousel."""
import logging
import math
import yfinance as yf
from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse
from cachetools import TTLCache
from core.limiter import limiter

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api")

_snapshot_cache: TTLCache = TTLCache(maxsize=1, ttl=60)

MARKET_TICKERS = [
    ("^DJI",     "DJIA",    2),
    ("^GSPC",    "S&P 500", 2),
    ("^IXIC",    "NASDAQ",  2),
    ("EURUSD=X", "EUR/USD", 4),
    ("GC=F",     "Gold",    2),
    ("BTC-USD",  "BTC",     2),
    ("CL=F",     "Oil WTI", 2),
]


def _safe_float(v) -> float:
    try:
        r = float(v)
        return 0.0 if (math.isnan(r) or math.isinf(r)) else r
    except Exception:
        return 0.0


def _build_snapshot() -> list[dict]:
    symbols = " ".join(t[0] for t in MARKET_TICKERS)
    try:
        tickers_obj = yf.Tickers(symbols)
    except Exception:
        return []

    results = []
    for symbol, label, decimals in MARKET_TICKERS:
        try:
            fast = tickers_obj.tickers[symbol].fast_info
            price = _safe_float(fast.last_price)
            prev  = _safe_float(fast.previous_close)
            if price == 0 or prev == 0:
                results.append({"label": label, "value": "—", "change": "—", "up": True})
                continue
            change_pct = (price - prev) / prev * 100
            results.append({
                "label":  label,
                "value":  f"{price:,.{decimals}f}",
                "change": f"{'+' if change_pct >= 0 else ''}{change_pct:.2f}%",
                "up":     change_pct >= 0,
            })
        except Exception as exc:
            logger.warning("Snapshot %s : %s", symbol, exc)
            results.append({"label": label, "value": "—", "change": "—", "up": True})
    return results


@router.get("/market-snapshot")
@limiter.limit("30/minute")
async def get_market_snapshot(request: Request):
    """Retourne un snapshot des indices et actifs (cache TTL 60s)."""
    if "data" in _snapshot_cache:
        return JSONResponse(_snapshot_cache["data"])
    data = _build_snapshot()
    if data and any(item["value"] != "—" for item in data):
        _snapshot_cache["data"] = data
    return JSONResponse(data)
