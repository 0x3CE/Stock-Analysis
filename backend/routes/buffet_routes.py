"""
buffett_routes.py — Buffett Indicator (Market Cap / GDP) via Banque Mondiale.

Source unique : World Bank API (données annuelles)
- CM.MKT.LCAP.CD : Capitalisation boursière totale (USD)
- NY.GDP.MKTP.CD : PIB nominal (USD)

Aucune clé API requise.
"""

import asyncio
import logging
import httpx
from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse
from cachetools import TTLCache
from core.limiter import limiter

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api")

# Les données World Bank sont annuelles — cache 1 heure
_buffett_cache: TTLCache = TTLCache(maxsize=1, ttl=3600)

# ---------------------------------------------------------------------------
# Seuils d'interprétation
# ---------------------------------------------------------------------------

THRESHOLDS = [
    (75,  "Sous-évalué",            "#22c55e", "Le marché est attractif. Les valorisations sont basses par rapport à l'économie réelle."),
    (100, "Correctement valorisé",  "#60a5fa", "Le marché reflète correctement la valeur de l'économie."),
    (125, "Légèrement surévalué",   "#f59e0b", "Prudence conseillée. Les valorisations commencent à dépasser les fondamentaux."),
    (150, "Fortement surévalué",    "#ef4444", "Zone de danger. Le marché est significativement au-dessus de sa valeur historique."),
    (999, "Extrêmement surévalué",  "#dc2626", "Niveau historiquement extrême. Risque élevé de correction majeure."),
]

def interpret(ratio: float) -> dict:
    for threshold, label, color, message in THRESHOLDS:
        if ratio < threshold:
            return {"label": label, "color": color, "message": message}
    return {"label": THRESHOLDS[-1][1], "color": THRESHOLDS[-1][2], "message": THRESHOLDS[-1][3]}

# ---------------------------------------------------------------------------
# Récupération Banque Mondiale
# ---------------------------------------------------------------------------

async def fetch_world_bank(client: httpx.AsyncClient, indicator: str, country_code: str) -> float | None:
    """
    Récupère la dernière valeur annuelle disponible d'un indicateur Banque Mondiale.
    Interroge les 5 dernières années pour trouver une valeur non nulle.
    Retry automatique en cas de timeout ou d'erreur réseau.
    """
    url = f"https://api.worldbank.org/v2/country/{country_code}/indicator/{indicator}"
    params = {"format": "json", "mrv": 5, "per_page": 5}

    for attempt in range(2):
        try:
            resp = await client.get(url, params=params, timeout=25)
            resp.raise_for_status()
            data = resp.json()
            if not data or len(data) < 2:
                return None
            for entry in data[1]:
                if entry.get("value"):
                    return float(entry["value"])
            return None
        except (httpx.TimeoutException, httpx.NetworkError) as exc:
            if attempt == 0:
                logger.warning("Retry %s/%s (attempt %d): %s", indicator, country_code, attempt + 1, exc)
                await asyncio.sleep(1)
            else:
                raise


async def fetch_country(
    client: httpx.AsyncClient,
    country_code: str,
    country_name: str,
    flag: str,
) -> dict:
    """
    Construit le Buffett Indicator pour un pays.
    Les deux indicateurs sont récupérés séquentiellement pour éviter le rate-limiting.
    """
    market_cap = await fetch_world_bank(client, "CM.MKT.LCAP.CD", country_code)
    await asyncio.sleep(0.3)
    gdp = await fetch_world_bank(client, "NY.GDP.MKTP.CD", country_code)

    if market_cap is None or gdp is None or gdp == 0:
        return {"country": country_name, "flag": flag, "error": "Données indisponibles"}

    ratio  = (market_cap / gdp) * 100
    interp = interpret(ratio)

    return {
        "country":    country_name,
        "flag":       flag,
        "ratio":      round(ratio, 1),
        "market_cap": round(market_cap / 1e12, 2),
        "gdp":        round(gdp / 1e12, 2),
        "unit":       "T$",
        "source":     "Banque Mondiale",
        **interp,
    }

# ---------------------------------------------------------------------------
# Route principale
# ---------------------------------------------------------------------------

COUNTRIES = [
    ("US", "États-Unis", "🇺🇸"),
    ("XC", "Zone Euro",  "🇪🇺"),
    ("GB", "Royaume-Uni","🇬🇧"),
    ("JP", "Japon",      "🇯🇵"),
]

@router.get("/buffett-indicator")
@limiter.limit("20/minute")
async def get_buffett_indicator(request: Request):
    """
    Retourne le Buffett Indicator pour les 4 marchés configurés.
    Cache 1h (données annuelles). Les erreurs par pays sont isolées.
    """
    if "data" in _buffett_cache:
        return JSONResponse(_buffett_cache["data"])

    async with httpx.AsyncClient() as client:
        results = await asyncio.gather(
            *[fetch_country(client, code, name, flag) for code, name, flag in COUNTRIES],
            return_exceptions=True,
        )

    countries = []
    for r in results:
        if isinstance(r, Exception):
            logger.exception("Erreur Buffett Indicator : %s", r)
            countries.append({"error": "Données indisponibles"})
        else:
            countries.append(r)

    payload = {"countries": countries}
    # Ne mettre en cache que si au moins 3 pays ont des données valides
    if sum(1 for c in countries if "error" not in c) >= 3:
        _buffett_cache["data"] = payload

    return JSONResponse(payload)
