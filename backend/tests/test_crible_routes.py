"""
Tests des routes /api/crible, sur de petits fichiers fabriqués (aucun réseau).
"""
import json
import os
import sys
import time

import pandas as pd
import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from fastapi.testclient import TestClient

import routes.crible_routes as crible_routes
from main import app
from services.crible_service import CribleService

client = TestClient(app)

LIGNES = [
    {"ticker": "ROG.SW", "nom": "Roche Holding AG", "statut": "OK", "per_prev": 14.2, "beta": None, "capi_usd": 3.8e11},
    {"ticker": "SAP.DE", "nom": "SAP SE", "statut": "OK", "per_prev": float("nan"), "beta": 1.1, "capi_usd": 2.7e11},
    {"ticker": "NESN.SW", "nom": None, "statut": "EXCLU", "per_prev": None, "beta": None, "capi_usd": None},
]
META = {"date_extraction": "2026-11-13 13:59", "taux_usd": {"EUR": 1.1, "USD": 1.0}, "retires": [{"ticker": "X"}]}


def _ecrire(dossier, parquet=True, json_=True):
    if json_:
        with open(os.path.join(dossier, "crible_resultats.json"), "w", encoding="utf-8") as f:
            lignes = [{k: (None if v != v else v) for k, v in l.items()} for l in LIGNES]
            json.dump({"meta": META, "lignes": lignes}, f)
    if parquet:
        df = pd.DataFrame(LIGNES)
        df["per_prev"] = df["per_prev"].astype("Float64")
        df.to_parquet(os.path.join(dossier, "crible_resultats.parquet"), index=False)


@pytest.fixture
def service(tmp_path, monkeypatch):
    s = CribleService(tmp_path)
    monkeypatch.setattr(crible_routes, "service", s)
    return s


def test_absent_503(service):
    r = client.get("/api/crible")
    assert r.status_code == 503
    assert "crible_marches.py" in r.json()["detail"]


def test_lecture_parquet(service, tmp_path):
    _ecrire(tmp_path)
    r = client.get("/api/crible")
    assert r.status_code == 200
    j = r.json()
    assert [l["ticker"] for l in j["lignes"]] == ["ROG.SW", "SAP.DE"]  # seulement les OK
    assert j["meta"]["source_fichier"] == "parquet"
    assert j["meta"]["nb_societes"] == 2
    assert j["meta"]["taux_usd"]["EUR"] == 1.1
    assert "retires" not in j["meta"]


def test_valeurs_manquantes_restent_null(service, tmp_path):
    _ecrire(tmp_path)
    lignes = {l["ticker"]: l for l in client.get("/api/crible").json()["lignes"]}
    assert lignes["SAP.DE"]["per_prev"] is None   # NaN → null, jamais 0
    assert lignes["ROG.SW"]["beta"] is None


def test_repli_json_sans_parquet(service, tmp_path):
    _ecrire(tmp_path, parquet=False)
    j = client.get("/api/crible").json()
    assert j["meta"]["source_fichier"] == "json"
    assert len(j["lignes"]) == 2


def test_une_societe(service, tmp_path):
    _ecrire(tmp_path)
    assert client.get("/api/crible/rog.sw").json()["nom"] == "Roche Holding AG"
    assert client.get("/api/crible/NESN.SW").status_code == 404   # exclue : pas servie
    assert client.get("/api/crible/AAPL;DROP").status_code == 400


def test_relu_quand_le_fichier_change(service, tmp_path):
    _ecrire(tmp_path)
    assert len(client.get("/api/crible").json()["lignes"]) == 2
    time.sleep(0.01)
    LIGNES.append({"ticker": "UCB.BR", "nom": "UCB SA", "statut": "OK", "per_prev": 19.8, "beta": 0.4,
                   "capi_usd": 6e10})
    try:
        _ecrire(tmp_path)
        assert len(client.get("/api/crible").json()["lignes"]) == 3
    finally:
        LIGNES.pop()


def test_reponse_compressee(service, tmp_path):
    """Compression au-delà de 1 000 octets (le vrai crible pèse plusieurs Mo)."""
    sup = [{"ticker": f"T{i}.PA", "nom": f"Société {i}", "statut": "OK", "per_prev": 10.0 + i, "beta": 0.5,
            "capi_usd": 1e9 * i} for i in range(50)]
    LIGNES.extend(sup)
    try:
        _ecrire(tmp_path)
        r = client.get("/api/crible", headers={"Accept-Encoding": "gzip"})
        assert r.headers.get("content-encoding") == "gzip"
        assert len(r.json()["lignes"]) == 52
    finally:
        del LIGNES[-50:]
