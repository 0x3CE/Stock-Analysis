import os
import re

class Settings:
    APP_TITLE = "Stock Analysis API"
    APP_DESCRIPTION = "API d'analyse d'actions avec Piotroski F-Score"
    APP_VERSION = "1.0.0"

    # En production, définir ALLOWED_ORIGINS dans .env (séparé par des virgules)
    # Ex: ALLOWED_ORIGINS=https://mon-app.onrender.com,https://mondomaine.com
    _raw_origins = os.getenv("ALLOWED_ORIGINS", "*")
    ALLOWED_ORIGINS: list[str] = (
        ["*"] if _raw_origins == "*"
        else [o.strip() for o in _raw_origins.split(",") if o.strip()]
    )

    # Regex de validation pour les tickers (AAPL, BRK.B, ^GSPC, EUR=X, etc.)
    TICKER_REGEX = re.compile(r"^[A-Z0-9.\-\^=]{1,15}$")

settings = Settings()