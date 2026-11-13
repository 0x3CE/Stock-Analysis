"""crible_routes.py — Résultats du Crible des marchés (environ 1 300 sociétés)."""

import logging
import os

from fastapi import APIRouter, HTTPException, Request

from core.config import settings
from core.limiter import limiter
from routes.analysis_routes import SafeJSONResponse, _validate_ticker
from services.crible_service import CribleIndisponible, creer_service

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/crible")
service = creer_service(settings.CRIBLE_DOSSIER, settings.CRIBLE_R2_BUCKET, os.environ)

MESSAGE_ABSENT = "Pas encore de données du crible : lancer crible/crible_marches.py, puis crible/publier_r2.py pour le site en ligne."


@router.get("")
@limiter.limit("30/minute")
async def get_crible(request: Request):
    """Toutes les sociétés exploitables et le bloc meta (date d'extraction, taux de change)."""
    try:
        return SafeJSONResponse(service.tout())
    except CribleIndisponible:
        raise HTTPException(status_code=503, detail=MESSAGE_ABSENT)


@router.get("/{ticker}")
@limiter.limit("60/minute")
async def get_societe(request: Request, ticker: str):
    symbole = _validate_ticker(ticker)
    try:
        ligne = service.societe(symbole)
    except CribleIndisponible:
        raise HTTPException(status_code=503, detail=MESSAGE_ABSENT)
    if ligne is None:
        raise HTTPException(status_code=404, detail=f"{symbole} n'est pas dans le crible")
    return SafeJSONResponse(ligne)
