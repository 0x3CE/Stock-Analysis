"""
CribleService — lecture des résultats du Crible des marchés.

Les fichiers viennent de crible/crible_marches.py :
- crible_resultats.parquet : les lignes, lues avec DuckDB (même requête demain
  sur Cloudflare R2 ou sur le VPS) ;
- crible_resultats.json : le bloc `meta` (date d'extraction, taux de change),
  et les lignes en repli si DuckDB ou le Parquet manquent.

Les données sont gardées en mémoire et relues quand un fichier change.
Une valeur manquante reste None (règle 2 du CLAUDE.md).
"""

from __future__ import annotations

import json
import logging
import math
import threading
from pathlib import Path

logger = logging.getLogger(__name__)

FICHIER_PARQUET = "crible_resultats.parquet"
FICHIER_JSON = "crible_resultats.json"


class CribleIndisponible(Exception):
    """Aucun fichier du crible n'est lisible."""


def _propre(v):
    if isinstance(v, float) and not math.isfinite(v):
        return None
    return v


class CribleService:
    def __init__(self, dossier: Path):
        self.dossier = Path(dossier)
        self._verrou = threading.Lock()
        self._signature = None
        self._meta: dict = {}
        self._lignes: list[dict] = []
        self._par_ticker: dict[str, dict] = {}
        self.source = None

    # ------------------------------------------------------------------
    def _signature_fichiers(self):
        sig = []
        for nom in (FICHIER_PARQUET, FICHIER_JSON):
            p = self.dossier / nom
            sig.append((nom, p.stat().st_mtime_ns) if p.exists() else (nom, None))
        return tuple(sig)

    def _lire_parquet(self, chemin: Path) -> list[dict]:
        import duckdb  # importé ici : le service fonctionne aussi sans DuckDB (repli JSON)
        con = duckdb.connect()
        try:
            cur = con.execute("SELECT * FROM read_parquet(?)", [str(chemin)])
            colonnes = [d[0] for d in cur.description]
            return [{c: _propre(v) for c, v in zip(colonnes, ligne)} for ligne in cur.fetchall()]
        finally:
            con.close()

    def _charger(self):
        json_p, parquet_p = self.dossier / FICHIER_JSON, self.dossier / FICHIER_PARQUET
        meta, lignes, source = {}, None, None
        if json_p.exists():
            with open(json_p, encoding="utf-8") as f:
                brut = json.load(f)
            meta = brut.get("meta") or {}
            lignes_json = brut.get("lignes")
        else:
            lignes_json = None
        if parquet_p.exists():
            try:
                lignes, source = self._lire_parquet(parquet_p), "parquet"
            except Exception:  # noqa: BLE001
                logger.exception("Lecture du Parquet impossible, repli sur le JSON")
        if lignes is None and lignes_json is not None:
            lignes, source = [{k: _propre(v) for k, v in l.items()} for l in lignes_json], "json"
        if lignes is None:
            raise CribleIndisponible(f"Aucun résultat du crible dans {self.dossier}")
        self._meta, self.source = meta, source
        self._lignes = [l for l in lignes if l.get("statut") == "OK"]
        self._par_ticker = {str(l.get("ticker", "")).upper(): l for l in self._lignes}
        logger.info("Crible chargé (%s) : %d sociétés", source, len(self._lignes))

    def _a_jour(self):
        sig = self._signature_fichiers()
        if sig != self._signature:
            with self._verrou:
                if sig != self._signature:
                    self._charger()
                    self._signature = sig

    # ------------------------------------------------------------------
    def tout(self) -> dict:
        """Meta et lignes au statut OK."""
        self._a_jour()
        meta = {k: v for k, v in self._meta.items() if k != "retires"}  # la liste des retirés est lourde
        meta["source_fichier"] = self.source
        meta["nb_societes"] = len(self._lignes)
        return {"meta": meta, "lignes": self._lignes}

    def societe(self, ticker: str) -> dict | None:
        self._a_jour()
        return self._par_ticker.get(ticker.upper())
