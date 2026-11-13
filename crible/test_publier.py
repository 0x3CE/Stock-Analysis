"""
Tests hors ligne de publier_r2.py : la publication écrit dans un dossier local
au lieu de R2 (même code DuckDB, seul le préfixe change). Aucun réseau.
Lancer : python3 test_publier.py
"""

import json
import os
import sys
import tempfile
import unittest

import duckdb
import pandas as pd

ICI = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, ICI)

import publier_r2 as pr  # noqa: E402


def fabriquer(dossier):
    lignes = [
        {"ticker": "ROP.SW", "nom": "Roche Holding AG", "statut": "OK", "liste": "Suisse", "per_prev": 14.2},
        {"ticker": "SAP.DE", "nom": "SAP SE", "statut": "OK", "liste": "Europe", "per_prev": None},
        {"ticker": "PERSO", "nom": "Ligne détenue", "statut": "OK", "liste": "Extra", "per_prev": 30.0},
        {"ticker": "SAN.PA", "nom": None, "statut": "ERREUR", "liste": "Europe", "per_prev": None},
        {"ticker": "NESN.SW", "nom": None, "statut": "EXCLU", "liste": "Suisse", "per_prev": None},
    ]
    df = pd.DataFrame(lignes)
    df["per_prev"] = df["per_prev"].astype("Float64")
    df.to_parquet(os.path.join(dossier, "crible_resultats.parquet"), index=False)
    meta = {"date_extraction": "2026-11-13 14:11", "taux_usd": {"EUR": 1.1}, "retires": [{"ticker": "APC.DE"}]}
    with open(os.path.join(dossier, "crible_resultats.json"), "w", encoding="utf-8") as f:
        json.dump({"meta": meta, "lignes": lignes}, f)


class TestPublication(unittest.TestCase):
    def test_version_publique(self):
        with tempfile.TemporaryDirectory() as local, tempfile.TemporaryDirectory() as distant:
            fabriquer(local)
            os.makedirs(os.path.join(distant, "historique"))
            con = duckdb.connect()
            r = pr.publier(con, local, distant)
            self.assertEqual((r["lignes_locales"], r["publiees"], r["extras_retirees"]), (5, 2, 1))

            pub = con.execute("SELECT ticker, per_prev FROM read_parquet(?) ORDER BY ticker",
                              [r["fichiers"]["dernier"]]).fetchall()
            self.assertEqual(pub, [("ROP.SW", 14.2), ("SAP.DE", None)])   # ni Extra, ni erreur, ni Nestlé ; null gardé
            self.assertTrue(r["fichiers"]["historique"].endswith("historique/2026-11-13.parquet"))
            self.assertTrue(os.path.exists(r["fichiers"]["historique"]))

            meta = json.loads(con.execute("SELECT meta_json FROM read_parquet(?)", [r["fichiers"]["meta"]]).fetchone()[0])
            self.assertEqual(meta["nb_societes"], 2)
            self.assertNotIn("retires", meta)
            self.assertEqual(meta["taux_usd"]["EUR"], 1.1)

    def test_sans_resultats(self):
        with tempfile.TemporaryDirectory() as local:
            with self.assertRaises(SystemExit):
                pr.publier(duckdb.connect(), local, local)

    def test_identifiants_manquants(self):
        with self.assertRaises(SystemExit) as e:
            pr.lire_identifiants({"R2_BUCKET": "b"})
        self.assertIn("R2_ACCOUNT_ID", str(e.exception))
        self.assertEqual(pr.lire_identifiants({v: "x" for v in pr.VARIABLES})["R2_BUCKET"], "x")

    def test_account_id_en_adresse(self):
        # Cas réel du 13/11/2026 : l'adresse complète collée à la place de l'identifiant.
        env = {v: "x" for v in pr.VARIABLES}
        env["R2_ACCOUNT_ID"] = "https://667e3449dfe73c7e4faf4909c19a173f.r2.cloudflarestorage.com"
        with self.assertRaises(SystemExit) as e:
            pr.lire_identifiants(env)
        self.assertIn("seulement l'identifiant", str(e.exception))

    def test_litteral_sql(self):
        self.assertEqual(pr._sql_texte("ab'c"), "'ab''c'")


if __name__ == "__main__":
    r = unittest.TextTestRunner(verbosity=1).run(unittest.defaultTestLoader.loadTestsFromModule(sys.modules[__name__]))
    print("Tous les tests passent." if r.wasSuccessful() else "Des tests échouent.")
    sys.exit(0 if r.wasSuccessful() else 1)
