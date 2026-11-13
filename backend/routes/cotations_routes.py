"""cotations_routes.py — Cours et variation du jour de quelques tickers (watchlist)."""

import logging
import math

import yfinance as yf
from cachetools import TTLCache
from fastapi import APIRouter, HTTPException, Request

from core.config import settings
from core.limiter import limiter

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api")

MAX_TICKERS = 12
_cache: TTLCache = TTLCache(maxsize=300, ttl=60)


def _nombre(v):
    try:
        x = float(v)
    except (TypeError, ValueError):
        return None
    return x if math.isfinite(x) else None


def cotation(symbole: str, fabrique=yf.Ticker) -> dict:
    """Cours, variation du jour (%) et devise. Une valeur introuvable vaut None, jamais 0."""
    cours = precedent = devise = None
    try:
        fi = fabrique(symbole).fast_info
        cours = _nombre(fi["last_price"])
        precedent = _nombre(fi["previous_close"])
        devise = fi["currency"]
    except Exception:  # noqa: BLE001
        logger.warning("Cotation indisponible : %s", symbole)
    variation = (cours - precedent) / precedent * 100 if cours is not None and precedent else None
    return {
        "ticker": symbole,
        "cours": round(cours, 2) if cours is not None else None,
        "variation_pct": round(variation, 2) if variation is not None else None,
        "devise": devise or None,
    }


@router.get("/cotations")
@limiter.limit("30/minute")
async def get_cotations(request: Request, tickers: str = ""):
    """?tickers=GOOGL,MSFT,ASML.AS (12 au plus). Cache de 60 s par ticker."""
    symboles = []
    for brut in tickers.split(","):
        s = brut.strip().upper()
        if not s:
            continue
        if not settings.TICKER_REGEX.match(s):
            raise HTTPException(status_code=400, detail=f"Ticker invalide : {brut.strip()[:20]}")
        if s not in symboles:
            symboles.append(s)
    if len(symboles) > MAX_TICKERS:
        raise HTTPException(status_code=400, detail=f"{MAX_TICKERS} tickers au plus")
    res = []
    for s in symboles:
        if s not in _cache:
            c = cotation(s)
            if c["cours"] is not None:  # on ne garde pas un échec en cache
                _cache[s] = c
            res.append(c)
        else:
            res.append(_cache[s])
    return {"cotations": res}
