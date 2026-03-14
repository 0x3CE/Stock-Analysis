"""
Backend API pour l'analyse d'actions avec calcul du Piotroski F-Score.
Architecture: FastAPI + yfinance.

Installation:
pip install fastapi uvicorn yfinance pandas python-dotenv numpy
"""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from core.config import settings
from core.limiter import limiter
from routes import analysis_routes, health_routes, buffet_routes

# === Configuration FastAPI ===
app = FastAPI(
    title=settings.APP_TITLE,
    description=settings.APP_DESCRIPTION,
    version=settings.APP_VERSION
)

# Rate limiting
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET"],
    allow_headers=["*"],
)

# Enregistrement des routes
app.include_router(health_routes.router)
app.include_router(analysis_routes.router)
app.include_router(buffet_routes.router)
