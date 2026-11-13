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
import time
from pathlib import Path

logger = logging.getLogger(__name__)

FICHIER_PARQUET = "crible_resultats.parquet"
FICHIER_JSON = "crible_resultats.json"
DOSSIER_EXTENSIONS = Path(__file__).resolve().parents[1] / ".duckdb_extensions"


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


# ---------------------------------------------------------------------------
# Version en ligne : fichiers publiés sur Cloudflare R2 par crible/publier_r2.py
# ---------------------------------------------------------------------------

def _sql_texte(v: str) -> str:
    return "'" + str(v).replace("'", "''") + "'"


class CribleDistant(CribleService):
    """
    Lit crible_resultats.parquet et crible_meta.parquet sous un préfixe distant
    (r2://bucket/crible). Relit au plus toutes les `rafraichir_s` secondes. Si R2
    ne répond pas, garde les dernières données lues ; sans aucune donnée, 503.
    """

    def __init__(self, prefixe: str, identifiants: dict | None = None, rafraichir_s: float = 600,
                 horloge=time.monotonic):
        super().__init__(Path("."))
        self.prefixe = prefixe.rstrip("/")
        self.identifiants = identifiants
        self.rafraichir_s = rafraichir_s
        self._horloge = horloge
        self._charge_le = None

    def _connexion(self):
        import duckdb
        con = duckdb.connect()
        if self.identifiants:
            # Extension httpfs rangée dans le dossier du backend : installée au build par
            # render.yaml, et retéléchargée par DuckDB si elle manque.
            con.execute(f"SET extension_directory={_sql_texte(str(DOSSIER_EXTENSIONS))}")
            con.execute("INSTALL httpfs")
            con.execute("LOAD httpfs")
            ids = self.identifiants
            con.execute("CREATE SECRET r2_crible (TYPE r2, KEY_ID {}, SECRET {}, ACCOUNT_ID {})".format(
                _sql_texte(ids["R2_ACCESS_KEY_ID"]), _sql_texte(ids["R2_SECRET_ACCESS_KEY"]),
                _sql_texte(ids["R2_ACCOUNT_ID"])))
        return con

    def _charger(self):
        con = self._connexion()
        try:
            cur = con.execute("SELECT * FROM read_parquet(?)", [f"{self.prefixe}/crible_resultats.parquet"])
            colonnes = [d[0] for d in cur.description]
            lignes = [{c: _propre(v) for c, v in zip(colonnes, l)} for l in cur.fetchall()]
            brut = con.execute("SELECT meta_json FROM read_parquet(?)",
                               [f"{self.prefixe}/crible_meta.parquet"]).fetchone()
        finally:
            con.close()
        self._meta = json.loads(brut[0]) if brut and brut[0] else {}
        self.source = "r2"
        self._lignes = [l for l in lignes if l.get("statut") == "OK"]
        self._par_ticker = {str(l.get("ticker", "")).upper(): l for l in self._lignes}
        logger.info("Crible chargé depuis %s : %d sociétés", self.prefixe, len(self._lignes))

    def _a_jour(self):
        maintenant = self._horloge()
        if self._charge_le is not None and maintenant - self._charge_le < self.rafraichir_s:
            return
        with self._verrou:
            if self._charge_le is not None and maintenant - self._charge_le < self.rafraichir_s:
                return
            try:
                self._charger()
            except Exception as e:  # noqa: BLE001
                if not self._lignes:
                    raise CribleIndisponible(f"Crible illisible sur {self.prefixe} : {type(e).__name__}") from e
                logger.exception("R2 ne répond pas : on garde les données déjà chargées")
            self._charge_le = maintenant


VARIABLES_R2 = ("R2_ACCOUNT_ID", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY")


def creer_service(dossier_local: Path, bucket: str | None, env: dict) -> CribleService:
    """R2 si CRIBLE_R2_BUCKET est défini (site en ligne), sinon le dossier local (développement)."""
    if bucket:
        manquantes = [v for v in VARIABLES_R2 if not env.get(v)]
        if manquantes:
            logger.error("CRIBLE_R2_BUCKET défini mais variables manquantes : %s", ", ".join(manquantes))
        return CribleDistant(f"r2://{bucket}/crible", {v: env.get(v, "") for v in VARIABLES_R2})
    return CribleService(dossier_local)
