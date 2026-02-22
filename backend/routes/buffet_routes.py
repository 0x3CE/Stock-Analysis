"""
buffett_routes.py — Buffett Indicator (Market Cap / GDP) via Banque Mondiale.

Source unique : World Bank API (données annuelles)
- CM.MKT.LCAP.CD : Capitalisation boursière totale (USD)
- NY.GDP.MKTP.CD : PIB nominal (USD)

Aucune clé API requise.
"""

import asyncio
import httpx
from fastapi import APIRouter
from fastapi.responses import JSONResponse

router = APIRouter(prefix="/api")

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
    """Retourne label, couleur et message selon le ratio."""
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
    """
    url = f"https://api.worldbank.org/v2/country/{country_code}/indicator/{indicator}"
    params = {"format": "json", "mrv": 5, "per_page": 5}
    resp = await client.get(url, params=params, timeout=10)
    resp.raise_for_status()
    data = resp.json()
    if not data or len(data) < 2:
        return None
    for entry in data[1]:
        if entry.get("value"):
            return float(entry["value"])
    return None


async def fetch_country(
    client: httpx.AsyncClient,
    country_code: str,
    country_name: str,
    flag: str,
) -> dict:
    """
    Construit le Buffett Indicator pour un pays.
    Retourne un dict avec ratio, market_cap, gdp et interprétation.
    """
    market_cap, gdp = await asyncio.gather(
        fetch_world_bank(client, "CM.MKT.LCAP.CD", country_code),
        fetch_world_bank(client, "NY.GDP.MKTP.CD",  country_code),
    )

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
async def get_buffett_indicator():
    """
    Retourne le Buffett Indicator pour les 4 marchés configurés.
    Les erreurs par pays sont isolées — un pays en échec ne bloque pas les autres.
    """
    async with httpx.AsyncClient() as client:
        results = await asyncio.gather(
            *[fetch_country(client, code, name, flag) for code, name, flag in COUNTRIES],
            return_exceptions=True,
        )

    countries = [
        {"error": str(r)} if isinstance(r, Exception) else r
        for r in results
    ]

    return JSONResponse({"countries": countries})