"""
Backend API pour l'analyse d'actions avec calcul du Piotroski F-Score.
Architecture: FastAPI + yfinance.

Installation:
pip install fastapi uvicorn yfinance pandas python-dotenv numpy
"""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from core.config import settings
from routes import analysis_routes, health_routes

# === Configuration FastAPI ===
app = FastAPI(
    title=settings.APP_TITLE,
    description=settings.APP_DESCRIPTION,
    version=settings.APP_VERSION
)

# CORS pour React
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.ALLOWED_ORIGINS,  # En prod : restreindre le domaine
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Enregistrement des routes
app.include_router(health_routes.router)
app.include_router(analysis_routes.router)