"""
Tests d'intégration pour les routes FastAPI.
Exécuter : pytest backend/tests/ depuis la racine du projet
"""
import pytest
import sys, os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from fastapi.testclient import TestClient
from main import app

client = TestClient(app)


# ---------------------------------------------------------------------------
# Health
# ---------------------------------------------------------------------------

class TestHealthRoutes:
    def test_root_returns_200(self):
        response = client.get("/")
        assert response.status_code == 200

    def test_health_returns_ok(self):
        response = client.get("/health")
        assert response.status_code == 200
        data = response.json()
        assert data.get("status") == "healthy"


# ---------------------------------------------------------------------------
# Validation ticker
# ---------------------------------------------------------------------------

class TestTickerValidation:
    def test_empty_ticker_returns_400(self):
        response = client.get("/api/analyze/ ")
        assert response.status_code in (400, 422)

    def test_invalid_ticker_characters_returns_400(self):
        # Ticker avec injection de caractères spéciaux
        response = client.get("/api/analyze/AAPL;DROP TABLE")
        assert response.status_code == 400

    def test_ticker_too_long_returns_400(self):
        response = client.get("/api/analyze/TOOLONGTICKER1234567")
        assert response.status_code == 400


# ---------------------------------------------------------------------------
# Search
# ---------------------------------------------------------------------------

class TestSearchRoute:
    def test_empty_query_returns_empty(self):
        response = client.get("/api/search/ ")
        assert response.status_code == 200
        assert response.json() == {"results": []}

    def test_valid_query_returns_results_structure(self):
        response = client.get("/api/search/Apple")
        assert response.status_code == 200
        data = response.json()
        assert "results" in data
        assert isinstance(data["results"], list)
