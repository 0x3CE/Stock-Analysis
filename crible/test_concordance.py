"""
Concordance du profil défensif entre Python (screener_qualite.evaluer) et le
site (moteur_site.js, exécuté avec Node). Cas aléatoires, autour des seuils,
avec des inconnues et des plages [min, max].
Lancer : python test_concordance.py [nombre_de_cas]
Ignoré (sans échec) si Node n'est pas installé.
"""

import json
import os
import random
import shutil
import subprocess
import sys
import tempfile

ICI = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, ICI)

import screener_qualite as sq  # noqa: E402

NOEUD = r"""
const M = require(process.argv[2]);
const cas = JSON.parse(require("fs").readFileSync(process.argv[3], "utf8"));
const sortie = cas.map((c) => {
  const r = M.evaluer(c.x, c.s);
  const st = {};
  Object.keys(r).forEach((k) => { st[k] = r[k].statut; });
  return { st: st, verdict: M.verdict(r) };
});
process.stdout.write(JSON.stringify(sortie));
"""


def _valeur(rng, centre, ecart, p_none=0.2, p_plage=0.1):
    t = rng.random()
    if t < p_none:
        return None
    if t < p_none + p_plage:
        a, b = sorted(round(rng.gauss(centre, ecart), 2) for _ in range(2))
        return [a, b]
    if rng.random() < 0.08:
        return float(centre)  # pile sur le seuil
    return round(rng.gauss(centre, ecart), 2)


def _bool(rng, p_none=0.25):
    return None if rng.random() < p_none else rng.random() < 0.5


def _scalaire(rng, centre, ecart, p_none=0.25):
    return None if rng.random() < p_none else round(rng.gauss(centre, ecart), 1)


def generer(n, graine=20261113):
    rng = random.Random(graine)
    cas = []
    for _ in range(n):
        s = dict(sq.CRITERES)
        if rng.random() < 0.3:
            s = {k: round(v * rng.uniform(0.5, 1.5), 2) for k, v in s.items()}
            if s["croissance_min_pct"] > s["croissance_max_pct"]:
                s["croissance_min_pct"], s["croissance_max_pct"] = s["croissance_max_pct"], s["croissance_min_pct"]
        x = {
            "capex_pct_ca": _valeur(rng, 2.0, 1.5),
            "capex_couvert": _bool(rng),
            "marge_op_pct": _valeur(rng, 12.0, 6.0),
            "marge_brute_ecart_type": _valeur(rng, 3.0, 2.0),
            "marge_brute_nb_annees": rng.choice([None, 3, 4]),
            "fcf": _scalaire(rng, 50, 80),
            "retours": _scalaire(rng, 40, 40),
            "dette_nette": _scalaire(rng, 50, 120),
            "dette_nette_prec": _scalaire(rng, 50, 120),
            "ebitda": _scalaire(rng, 40, 50),
            "croissance_pct": _valeur(rng, 8.0, 6.0),
            "croissance_source": rng.choice([None, "prévision des analystes pour l'exercice suivant"]),
            "per_prev": _valeur(rng, 22.0, 10.0),
            "beta": _valeur(rng, 1.0, 0.4),
            "rachats_absents": _bool(rng, 0.5),
            "dividendes_absents": _bool(rng, 0.5),
        }
        if rng.random() < 0.35:
            # Société solide dont on ne perturbe qu'un ou deux champs : couvre RETENU et À VÉRIFIER.
            base = {"capex_pct_ca": 4.0, "capex_couvert": True, "marge_op_pct": 20.0,
                    "marge_brute_ecart_type": 1.0, "fcf": 100.0, "retours": 60.0, "dette_nette": 100.0,
                    "dette_nette_prec": 98.0, "ebitda": 80.0, "croissance_pct": 8.0, "per_prev": 15.0,
                    "beta": 0.7}
            garder = set(rng.sample(sorted(base), rng.choice([0, 1, 2])))
            for k, v in base.items():
                if k not in garder:
                    x[k] = v
            s = dict(sq.CRITERES)
        # Chemins précalculés (plages venant de sources divergentes)
        if rng.random() < 0.15:
            x["retours_sur_fcf"] = _valeur(rng, 1.0, 0.4, p_none=0.3)
        if rng.random() < 0.15:
            x["hausse_dette_pct"] = _valeur(rng, 10.0, 10.0, p_none=0.3)
        if rng.random() < 0.15:
            x["levier"] = _valeur(rng, 2.5, 1.0, p_none=0.3)
        cas.append({"x": x, "s": s})
    return cas


def comparer(n=3000):
    noeud = shutil.which("node")
    if not noeud:
        print("Node absent : concordance non vérifiée.")
        return None
    cas = generer(n)
    with tempfile.TemporaryDirectory() as d:
        entree = os.path.join(d, "cas.json")
        with open(entree, "w", encoding="utf-8") as f:
            json.dump(cas, f)
        script = os.path.join(d, "comparer.js")
        with open(script, "w", encoding="utf-8") as f:
            f.write(NOEUD)
        res = subprocess.run([noeud, script, os.path.join(ICI, "moteur_site.js"), entree],
                             capture_output=True, text=True, check=True)
    js = json.loads(res.stdout)
    ecarts = []
    for c, j in zip(cas, js):
        r = sq.evaluer(c["x"], c["s"])
        py = {k: v["statut"] for k, v in r.items()}
        if py != j["st"] or sq.verdict(r) != j["verdict"]:
            ecarts.append({"cas": c, "python": py, "site": j["st"]})
    return n, ecarts


if __name__ == "__main__":
    n = int(sys.argv[1]) if len(sys.argv) > 1 else 3000
    r = comparer(n)
    if r is None:
        sys.exit(0)
    total, ecarts = r
    if ecarts:
        print(f"{len(ecarts)} écart(s) sur {total} cas. Premier :")
        print(json.dumps(ecarts[0], ensure_ascii=False, indent=1))
        print("Des tests échouent.")
        sys.exit(1)
    print(f"{total} cas : Python et le site donnent les mêmes statuts et verdicts.")
    print("Tous les tests passent.")
