"""
publier_r2.py — Envoie les résultats du crible sur Cloudflare R2, pour le site en ligne.

À lancer après crible_marches.py :
    python3 publier_r2.py

Fichiers écrits dans le bucket :
    crible/crible_resultats.parquet         la dernière extraction (lue par le backend)
    crible/crible_meta.parquet              le bloc meta (une colonne meta_json)
    crible/historique/AAAA-MM-JJ.parquet    une copie datée, pour suivre les sociétés dans le temps

Confidentialité : la version publiée ne garde que les sociétés au statut OK et
retire celles de extra_local.txt (liste « Extra », des positions détenues) :
le site est public.

Identifiants lus dans les variables d'environnement (jamais dans le code) :
    R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET
DuckDB écrit sur R2 avec son extension httpfs (téléchargée par DuckDB au premier usage).
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from datetime import datetime, timezone

ICI = os.path.dirname(os.path.abspath(__file__))
VARIABLES = ("R2_ACCOUNT_ID", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "R2_BUCKET")
DOSSIER_DISTANT = "crible"


def _sql_texte(v: str) -> str:
    """Littéral SQL : CREATE SECRET n'accepte pas de paramètres préparés."""
    return "'" + str(v).replace("'", "''") + "'"


def lire_identifiants(env=None) -> dict:
    env = os.environ if env is None else env
    manquantes = [v for v in VARIABLES if not env.get(v)]
    if manquantes:
        raise SystemExit("Variables manquantes : " + ", ".join(manquantes)
                         + ". Voir l'en-tête de publier_r2.py.")
    if "/" in env["R2_ACCOUNT_ID"] or "." in env["R2_ACCOUNT_ID"]:
        # Erreur du 13/11/2026 : l'adresse https://<id>.r2.cloudflarestorage.com collée en entier.
        raise SystemExit("R2_ACCOUNT_ID doit contenir seulement l'identifiant du compte "
                         "(32 caractères), pas l'adresse https://<id>.r2.cloudflarestorage.com.")
    return {v: env[v] for v in VARIABLES}


def connexion_r2(ids: dict):
    import duckdb
    con = duckdb.connect()
    con.execute("INSTALL httpfs")
    con.execute("LOAD httpfs")
    con.execute(
        "CREATE SECRET r2_crible (TYPE r2, KEY_ID {}, SECRET {}, ACCOUNT_ID {})".format(
            _sql_texte(ids["R2_ACCESS_KEY_ID"]), _sql_texte(ids["R2_SECRET_ACCESS_KEY"]),
            _sql_texte(ids["R2_ACCOUNT_ID"])))
    return con


def meta_publique(meta: dict, nb_societes: int) -> dict:
    """Bloc meta sans la liste des titres retirés (lourde) et recompté sur la version publiée."""
    m = {k: v for k, v in (meta or {}).items() if k != "retires"}
    m["nb_societes"] = nb_societes
    m["publie_le"] = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M")
    return m


def publier(con, dossier_local: str, prefixe: str) -> dict:
    """
    Écrit la version publique sous `prefixe` (ex. r2://mon-bucket/crible, ou un dossier
    local pour les tests). Renvoie un résumé.
    """
    parquet = os.path.join(dossier_local, "crible_resultats.parquet")
    json_local = os.path.join(dossier_local, "crible_resultats.json")
    if not os.path.exists(parquet) or not os.path.exists(json_local):
        raise SystemExit(f"Résultats introuvables dans {dossier_local} : lancer d'abord crible_marches.py.")
    with open(json_local, encoding="utf-8") as f:
        meta = json.load(f).get("meta") or {}

    con.execute("""
        CREATE OR REPLACE TEMP TABLE publique AS
        SELECT * FROM read_parquet(?)
        WHERE statut = 'OK' AND coalesce(liste, '') <> 'Extra'
    """, [parquet])
    total = con.execute("SELECT count(*) FROM read_parquet(?)", [parquet]).fetchone()[0]
    retenues = con.execute("SELECT count(*) FROM publique").fetchone()[0]
    extras = con.execute("SELECT count(*) FROM read_parquet(?) WHERE liste = 'Extra'", [parquet]).fetchone()[0]

    jour = (meta.get("date_extraction") or datetime.now(timezone.utc).strftime("%Y-%m-%d"))[:10]
    cibles = {
        "dernier": f"{prefixe}/crible_resultats.parquet",
        "historique": f"{prefixe}/historique/{jour}.parquet",
    }
    for chemin in cibles.values():
        con.execute(f"COPY publique TO {_sql_texte(chemin)} (FORMAT parquet)")

    con.execute("CREATE OR REPLACE TEMP TABLE meta AS SELECT ?::VARCHAR AS meta_json",
                [json.dumps(meta_publique(meta, retenues), ensure_ascii=False)])
    cibles["meta"] = f"{prefixe}/crible_meta.parquet"
    con.execute(f"COPY meta TO {_sql_texte(cibles['meta'])} (FORMAT parquet)")
    return {"lignes_locales": total, "publiees": retenues, "extras_retirees": extras, "fichiers": cibles}


def main(argv=None):
    p = argparse.ArgumentParser(description="Publie les résultats du crible sur Cloudflare R2.")
    p.add_argument("--dossier", default=ICI, help="dossier de crible_resultats.parquet et .json")
    a = p.parse_args(argv)
    ids = lire_identifiants()
    con = connexion_r2(ids)
    try:
        r = publier(con, a.dossier, f"r2://{ids['R2_BUCKET']}/{DOSSIER_DISTANT}")
    finally:
        con.close()
    print(f"{r['publiees']} sociétés publiées sur {r['lignes_locales']} lignes locales "
          f"({r['extras_retirees']} lignes Extra retirées).", file=sys.stderr)
    for nom, chemin in r["fichiers"].items():
        print(f"  {nom} : {chemin}", file=sys.stderr)


if __name__ == "__main__":
    main()
