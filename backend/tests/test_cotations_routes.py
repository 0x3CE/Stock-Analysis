"""Tests de /api/cotations, sans réseau (yfinance remplacé par une fausse fabrique)."""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from fastapi.testclient import TestClient

import routes.cotations_routes as cr
from main import app

VRAIE_COTATION = cr.cotation  # gardée avant tout remplacement

client = TestClient(app)

COURS = {"GOOGL": {"last_price": 304.75, "previous_close": 298.72, "currency": "USD"},
         "MC.PA": {"last_price": 713.4, "previous_close": None, "currency": "EUR"}}


class Faux:
    def __init__(self, s):
        if s not in COURS:
            raise KeyError(s)
        self.fast_info = COURS[s]


def test_cotations(monkeypatch):
    cr._cache.clear()
    monkeypatch.setattr(cr, "cotation", lambda s: VRAIE_COTATION(s, Faux))
    j = client.get("/api/cotations?tickers=googl,MC.PA,ZZZZ,GOOGL").json()["cotations"]
    assert [c["ticker"] for c in j] == ["GOOGL", "MC.PA", "ZZZZ"]
    assert j[0]["cours"] == 304.75 and j[0]["variation_pct"] == 2.02 and j[0]["devise"] == "USD"
    assert j[1]["variation_pct"] is None          # clôture précédente inconnue : pas de 0
    assert j[2]["cours"] is None                  # ticker introuvable : null


def test_validation():
    assert client.get("/api/cotations?tickers=AAPL;DROP").status_code == 400
    trop = ",".join(f"T{i}" for i in range(13))
    assert client.get(f"/api/cotations?tickers={trop}").status_code == 400
    assert client.get("/api/cotations").json() == {"cotations": []}

