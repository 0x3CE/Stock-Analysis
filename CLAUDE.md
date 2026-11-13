# Stock dashboard — analyse d'actions et Crible des marchés

Site public d'analyse d'actions. Son but : aider à construire un portefeuille en actions générationnel et résilient, c'est-à-dire fait de sociétés connues et reconnues comme solides pendant les krachs. C'est aussi la vitrine technique du projet.

Données : Yahoo Finance (via yfinance), FRED et Banque mondiale.

Version du 13/11/2026. Ce fichier ne contient aucune donnée personnelle (voir « Confidentialité »).

## Règles de travail (non négociables)

1. **Chiffres vérifiés et datés.** Tout chiffre donné à l'utilisateur vient d'une source citée, avec sa date. Les données viennent de Yahoo Finance via yfinance, une API non officielle ; leur date est celle de l'extraction. Avant toute décision, recoupe avec les publications de la société (communiqués de résultats, rapport annuel).
2. **Une donnée manquante reste inconnue.** `None` en Python, `null` en JavaScript, `INCONNU` dans les verdicts. Ne jamais l'estimer, la remplacer par 0, ni la compléter de mémoire. Un chiffre que tu calcules toi-même est signalé « mon calcul ».
3. **Sources divergentes : montrer les deux.** Exemple : un PER de 9,5 chez une source et de 13,6 chez une autre donne la fourchette 9,5 – 13,6. Ne choisis pas entre elles.
4. **Contredire avec des contre-exemples.** Quand l'utilisateur affirme quelque chose de faux ou de partiellement faux, dis-le et donne un contre-exemple concret.
5. **L'utilisateur décide.** Claude rassemble les chiffres et explique le pourquoi. La décision d'achat ou de vente revient à l'utilisateur. Le site montre des verdicts critère par critère, jamais un conseil d'achat. Ne présente jamais un choix comme une certitude.
6. **Nestlé est exclue à vie.** Les cotations NESN.SW, NSRGY et NSRGF, et tout nom contenant « Nestlé ». Ne retire jamais cette exclusion : `EXCLUSIONS` et `_exclusion()` dans `crible/screener_qualite.py`, `EXCLUSIONS` et `exclusion()` dans le moteur JavaScript.
7. **Aucun seuil ne change en silence.** Toute modification de critère, de seuil ou de règle de calcul est annoncée à l'utilisateur, avec l'ancienne et la nouvelle valeur.

## Feuille de route

| Étape | Contenu | État |
|---|---|---|
| 1 | Scripts du crible dans `crible/`. Backend sans 0 par défaut, Piotroski à trois valeurs. | Fait (13/11/2026) : 1 351 sociétés au premier passage complet. |
| 2 | Le crible dans le site : onglet, profils défensif, offensif, rendement et valeur, filtres, fiche société enrichie. Choix de la devise : EUR, USD, CHF, JPY, GBP. | À faire |
| 3 | 5e profil « Résilience » : baisse maximale et temps de retour au plus haut pendant 2000-2002, 2008-2009, mars 2020 et 2022, comparés à l'indice ; dividende maintenu ou coupé. Repères : or, obligations, S&P 500. Contexte macro avec FRED et la Banque mondiale. | À faire |
| 4 | Comptes (Supabase) et portefeuille : actions, ETF et or. Répartition par secteur, pays et devise, concentration, comportement dans les krachs passés. | À faire |
| 5 | Agent branché sur la clé d'API Claude ou GPT de l'utilisateur. Passage sur un VPS (DuckDB), fin du cold start de Render. | Plus tard |

Décisions d'architecture (13/11/2026) :
- **Données de marché :** fichiers Parquet sur Cloudflare R2, lus par DuckDB dans le backend. Plus tard, DuckDB sur le VPS.
- **Comptes et portefeuilles :** Supabase, pas DuckDB, qui n'accepte qu'un programme à la fois en écriture.
- **Hébergement :** Render pour l'instant. Une tâche planifiée y est payante et un service gratuit n'a pas de disque permanent : le crible tourne sur le Mac de l'utilisateur.
- **La page claude.ai « Crible des marchés »** sert de maquette. Elle sera supprimée une fois le site complet ; sa grille « Vérifié à la main » est alors à reprendre dans le site.
- **Rôles :** Claude code tout pour l'instant, à la demande de l'utilisateur.

## Arborescence

| Dossier | Rôle |
|---|---|
| `backend/` | API FastAPI (Python 3.12) : analyse d'un ticker, Piotroski, Buffett Indicator, instantané des marchés. |
| `stock-dashboard/` | Front React 18 + Vite : recherche, vue d'ensemble, financiers, Piotroski, Buffett, comparaison. |
| `crible/` | Crible des marchés : extraction de l'univers (environ 1 300 sociétés) et profil défensif. |
| `render.yaml`, `docker-compose.yml` | Déploiement Render et lancement local. |
| `task/todo.md` | Anciens sprints (non versionné). |

## Commandes

Claude n'installe rien et ne télécharge rien : il donne le nom, la version et la commande exacte, l'utilisateur la lance. Le bac à sable de Claude Code n'a accès ni à Yahoo ni à Wikipédia : les extractions sont lancées par l'utilisateur, qui colle ensuite le journal.

**Crible** (Python 3.12 du système : yfinance 0.2.66, pandas 2.1.3, lxml, pyarrow 19, duckdb 2.0)

```bash
cd crible
python3 test_screener.py && python3 test_crible.py && python3 test_concordance.py   # avant toute modification livrée
python3 crible_marches.py --limite 5        # essai : 5 sociétés par liste ou par bourse
python3 crible_marches.py                   # univers complet (~23 min) ; relancer reprend grâce au cache
python3 crible_marches.py --fils 2          # en cas de nombreuses erreurs 429
python3 crible_marches.py --tickers NVDA,ASML.AS,ROG.SW
python3 crible_marches.py --rafraichir      # ignore le cache (valable 3 jours)
python3 screener_qualite.py --univers univers.csv   # filtre défensif seul, CSV « ; »
```

**Backend**

```bash
cd backend && uvicorn main:app --reload --port 8000
```

Tests du backend : pytest parcourt `backend/` et rencontre `backend/.env`, que le bac à sable bloque. Claude copie `core models routes services tests main.py pytest.ini __init__.py` dans `$TMPDIR` et lance `python3 -m pytest tests -q -p no:cacheprovider` là-bas. `test_valid_query_returns_results_structure` appelle Yahoo : il échoue sans réseau. Le `venv/` du dépôt n'a ni pytest ni yfinance ; le Python 3.12 du système les a.

**Front**

```bash
cd stock-dashboard && npm start      # http://localhost:3000
npm test                             # vitest : pas installé dans node_modules au 13/11/2026 (npm install)
```

Sans vitest, Claude vérifie que le front compile avec `./node_modules/.bin/vite build --outDir "$TMPDIR/build_essai"`. Il teste les fonctions pures avec `node --input-type=module`.

## Crible des marchés (`crible/`)

### Fichiers

| Fichier | Rôle |
|---|---|
| `screener_qualite.py` | Profil défensif : seuils `CRITERES`, `completer_etats()`, `mesures()`, `evaluer()`, `verdict()`, exclusions. Peut servir seul (`--univers univers.csv`). |
| `crible_marches.py` | Univers, extraction de tous les chiffres, cache, reprises, dédoublonnage, export. |
| `moteur_site.js` | Copie du moteur JavaScript de la page claude.ai (version du 12/11/2026) : profils défensif, offensif, rendement et valeur. Référence pour l'étape 2. |
| `test_screener.py`, `test_crible.py` | Tests hors ligne, avec de fausses sociétés (`FauxTicker`). Aucun appel réseau. Plusieurs tests reprennent des cas réels des essais du 13/11/2026. |
| `test_concordance.py` | Compare `evaluer()` et `moteur_site.js` (avec Node) sur des milliers de cas aléatoires. 0 écart sur 20 000 cas le 13/11/2026. |
| `univers.csv` | Petite liste de départ pour `screener_qualite.py` (colonne `ticker`). |
| `sp500_constituents.csv` | Copie locale du S&P 500 (ticker, nom), réécrite à chaque lecture réussie de Wikipédia. |
| `extra_local.txt` | Tickers ajoutés à l'univers, un par ligne. **Non versionné** (positions détenues). Modèle : `extra_local.exemple.txt`. |

Sorties, non versionnées (déjà dans `.gitignore`) : `crible_resultats.json`, `.csv` et `.parquet`, `resultats_filtre.csv`, et le cache `cache_crible/`.

### Profil défensif (`screener_qualite.py`)

- `completer_etats(m, t)` lit les états annuels de yfinance. Plusieurs intitulés de ligne sont essayés, avec ou sans espaces, car Yahoo les change parfois. La fonction en tire le CA, la marge brute, le résultat opérationnel, l'EBITDA, le capex, le cash-flow opérationnel, le cash-flow libre, les rachats, les dividendes et la dette nette, ainsi que la prévision de CA du consensus.
- `mesures(m)` produit les chiffres bruts exportés. `evaluer(x)` applique les 7 critères.
- Logique à trois valeurs : un échec avéré l'emporte, sinon une seule inconnue donne `INCONNU`. Verdict : `RETENU`, `À VÉRIFIER` ou `EXCLU`. Une valeur peut être une plage `[min, max]` (sources divergentes, règle 3).
- Une ligne rachats ou dividendes absente des états compte pour 0, et une note le dit. C'est la seule exception à la règle 2. Une case vide dans une ligne présente reste inconnue.
- `evaluer()` est la copie exacte du moteur JavaScript. Toute modification de l'un se reporte sur l'autre, et `test_concordance.py` doit rester à 0 écart.

### Extraction de l'univers (`crible_marches.py`)

- **Univers :**
  - S&P 500 depuis Wikipédia, sinon la copie locale ;
  - Europe, Suisse et Asie via `yf.screen`, bourse par bourse, classement par capitalisation, quotas dans `EUROPE`, `SUISSE` et `ASIE` ;
  - les tickers de `extra_local.txt`.
- **`remplir_quotas()`** traite les candidats d'une bourse dans l'ordre des capitalisations, par lots, jusqu'à obtenir le quota de sociétés distinctes au statut `OK`. Les lignes d'une même société (Roche RO.SW et ROP.SW) sont extraites ensemble.
- **`preselectionner()`** écarte sans appel réseau :
  - les noms d'obligations ou de warrants (Paris renvoyait des obligations Crédit Agricole) ;
  - les noms du S&P 500. Sur `BOURSES_INTERNATIONALES` (Xetra, Vienne, SIX), un début de nom suffit (« Cisco » pour « Cisco Systems, Inc. ») ; ailleurs, il faut le nom exact, pour garder « Target Healthcare REIT » à Londres ;
  - sur `BOURSES_CARREFOUR` (Xetra, Vienne), les noms déjà candidats sur une autre bourse de l'univers. Ces deux bourses ont une profondeur fixe (`PROFONDEUR_BOURSE` : 1 500 et 2 000 candidats), même avec `--limite`. Raison : leurs premières capitalisations sont des cotations étrangères. À Vienne, il a fallu écarter 112 lignes pour trouver 8 sociétés autrichiennes.
- **Pays du siège :** une société cotée hors du pays de son siège sort de `extraire_tout()` avec le statut interne `RETIRE`, juste après `t.info`. Deux exceptions : les pays sans bourse dans l'univers (`PAYS_SANS_BOURSE_EUROPE` : Luxembourg, Jersey…) et la liste tenue à la main `COTATIONS_PRINCIPALES_HORS_PAYS` (Airbus et STMicroelectronics à Paris, Glencore à Londres…). Une ligne de bourse sans pays de siège est aussi `RETIRE`.
- **`filtrer_et_dedoublonner()`** retire les lignes `RETIRE` et les doublons. Elle garde la cotation de la bourse du pays du siège, puis celle du S&P 500, puis la plus échangée (`echanges_jour_usd`), puis la plus grosse capitalisation. `meta.retires` liste les titres retirés avec leur motif.
- **`traiter()`** gère :
  - le cache : un JSON par ticker, 3 jours, `VERSION_CACHE` à augmenter quand l'extraction ou le filtre change ;
  - les reprises sur erreur 429 : 4 essais, attente de 5, 15 puis 45 s ;
  - les exclusions.

  Les erreurs ne sont pas mises en cache.
- **`reprise_finale()`** retente une par une, après une minute de pause, les sociétés restées en 429. Au premier passage complet, 18 erreurs restaient, dont Sanofi, Hermès, BNP Paribas et AXA. Une société récupérée ainsi peut faire dépasser de peu le quota de sa bourse.
- **Taux de change :** `taux_usd()` les récupère. Pour un cours en pence (`GBp`), Yahoo donne la capitalisation en livres : voir `DEVISE_CAPI`.

### Format de sortie

- `crible_resultats.json` vaut `{"meta": {...}, "lignes": [...]}`. Ne renomme ni ne supprime aucun champ existant ; en ajouter un est sans risque. La liste est `CHAMPS` dans `crible_marches.py`, et un test vérifie que chaque champ lu par le moteur JavaScript y figure.
- `crible_resultats.parquet` porte le même contenu, avec des types fixes (texte, booléen nullable, `Float64`), pour DuckDB.
- `meta` : date d'extraction, statuts, sociétés par région, titres retirés avec leur motif, doublons, `taux_usd` (valeur en USD d'une unité d'EUR, USD, CHF, JPY et GBP).
- `statut` vaut `OK`, `ERREUR` ou `EXCLU`, avec un `motif` pour les deux derniers. `verdict_defensif` est le verdict du script, avec les seuils `CRITERES` du moment.
- Les champs `*_pct` sont déjà en pourcentage (12,5 veut dire 12,5 %). Les montants (`fcf_ttm`, `dette_nette_ttm`, `ebitda_ttm`, etc.) sont dans `devise_comptable`, et `cours` dans `devise`. `capi` aussi, sauf avec `GBp` : la capitalisation est alors en GBP.
- `devise` et `devise_comptable` diffèrent pour 74 sociétés au 13/11/2026 (TotalEnergies, Shell et HSBC publient en USD, Unilever en EUR). `rendement_fcf_pct` n'est calculé que si les deux sont égales.
- `capi_usd` sert à comparer les tailles. `volume_moyen` vient de `averageVolume`. `echanges_jour_usd` vaut volume moyen × cours, en USD (mon calcul).
- `levier_ttm` = (dette totale − trésorerie) / EBITDA sur 12 mois, `None` si l'EBITDA est négatif ou nul. `tresorerie_nette` vaut vrai si la dette nette est inférieure ou égale à 0.
- `croissance_ca_0y_pct` et `croissance_ca_1y_pct` sont les prévisions du consensus pour l'exercice en cours et le suivant (même logique pour `bpa`). `*_trim_pct` compare le dernier trimestre à celui de l'année précédente.
- `rendement_div_pct` vient de `trailingAnnualDividendYield` (12 derniers mois). `div_annees`, `div_baisses` et `croissance_div_pct` portent sur les années civiles complètes.
- `pea_possible` vaut vrai si le siège est dans l'Espace économique européen. C'est une indication : l'éligibilité réelle se confirme auprès du courtier.
- Dates : `trimestre` (dernier trimestre publié), `exercice` (dernier exercice annuel), `date_extraction` (UTC).

### Vérifier une extraction

Après chaque passage complet :
1. Lire, pour chaque bourse, la ligne « n/quota sociétés » du journal. Un « quota non atteint » demande de regarder `meta.retires`.
2. Lister les erreurs (`statut == "ERREUR"`) et leur motif. Pour des 429, relancer : le cache évite de tout refaire.
3. Mesurer le taux de champs manquants. Au 13/11/2026 : marge opérationnelle et EBITDA manquent pour environ 16 % des sociétés (surtout banques et assurances), le PER prévisionnel pour 2 %.
4. Chercher les valeurs aberrantes : PER prévisionnel inférieur à 4, capitalisation, rendement du dividende, marge, croissance, levier.
5. Donner à l'utilisateur le nombre de sociétés exploitables, d'erreurs et d'exclusions.

### Limites connues

- Yahoo Finance n'est pas une source officielle. Ses chiffres peuvent être faux ou en retard, d'où la règle 1.
- Banques et assurances n'ont ni EBITDA ni marge brute : elles sortent souvent `À VÉRIFIER`. Ce n'est pas un défaut de la société.
- PER prévisionnels douteux au 13/11/2026 : 2,66 pour Samsung Electronics, 2,27 pour SK hynix, 1,78 pour SK Square ; 1,21 pour Tokio Marine, contre un PER passé de 51,5. À recouper avant tout usage.
- Croissances de CA prévues extrêmes, peut-être réelles : environ 70 % pour Kimberly-Clark (rachat de Kenvue ?, à vérifier), environ 1 700 % pour ABIVAX. Elles viennent du consensus, pas d'une erreur du script.
- La marge et sa stabilité indiquent un pouvoir de fixer ses prix, sans le prouver.
- Aucun critère chiffré ne repère un bénéfice au sommet du cycle (pétrole, mémoire, matières premières). Regarder la prévision de BPA de l'exercice suivant.
- La règle « dette nette ≤ +10 %/an » pénalise aussi la dette prise pour une acquisition. Elle reste en place tant que l'utilisateur n'a pas décidé autrement.

## Backend (`backend/`)

- **Routes :**
  - `/api/analyze/{ticker}` : KPIs, historique, dividendes, marges, Piotroski. Cache de 5 min, 10 requêtes/min.
  - `/api/search/{query}` : 30 requêtes/min.
  - `/api/buffett-indicator` : Banque mondiale, cache 1 h.
  - `/api/market-snapshot` : cache 60 s.
  - `/health`.
- **`services/stock_service.py` :** `_safe_float()` renvoie `None` pour une valeur absente, NaN ou infinie, jamais 0. Les KPIs introuvables valent `null`, et le site affiche « — ».
- **Piotroski à trois valeurs :** chaque critère a `score` 1, 0 ou `null` et `statut` `OK`, `ÉCHEC` ou `INCONNU`. `total_score` compte les 1 ; `inconnus` compte les critères sans données. Le score réel est donc compris entre `total_score` et `total_score + inconnus`.
  - `interpret_piotroski()` ne conclut que si toute la fourchette tombe dans une seule zone : 7 et plus, 4 à 6, moins de 4.
  - Seuls les états annuels servent : pas de repli sur les chiffres des 12 derniers mois de `stock.info`. Ces replis ont été retirés le 13/11/2026, car ils mélangeaient deux périodes ou reconstituaient un nombre d'actions.
- Seuils Piotroski : `PIOTROSKI_HIGH_THRESHOLD = 7`, `PIOTROSKI_MID_THRESHOLD = 4`, identiques dans `stock-dashboard/src/utils/Formatters.js`.
- Configuration : `ALLOWED_ORIGINS` (CORS) dans `backend/.env`.

## Front (`stock-dashboard/`)

- React 18, Vite 5, Recharts, CSS modules avec des jetons de design dans `src/styles/tokens.css`.
- Onglets : Vue d'ensemble, Financiers, Piotroski, Buffett, Comparer.
- `getPiotroskiColor(score, inconnus)` applique la même règle que `interpret_piotroski()`. Un score `null` ou une fourchette à cheval sur deux zones donne « À VÉRIFIER », jamais « FAIBLE ».
- Configuration : `VITE_API_URL` dans `stock-dashboard/.env`.
- Déploiement : site statique et API sur Render (`render.yaml`).

## Conventions de code

- Code, commentaires, messages et noms de variables en français, comme l'existant.
- Crible : le réseau n'est appelé que dans `extraire_tout()`, `completer_etats()`, `univers_sp500()`, `candidats_screen()` et `taux_usd()`. Tout le reste est testable hors ligne.
- Chaque nouveau critère a trois cas de test : `OK`, `ÉCHEC` et `INCONNU`. Chaque nouveau champ exporté a un test d'extraction.
- Ne jamais remplacer `None` par 0 ou par une moyenne pour qu'un calcul passe.
- Un défaut trouvé sur des données réelles devient un test, avec la date et le cas réel en commentaire.
- Intégration dans le backend : `from crible_marches import extraire_tout` et `from screener_qualite import evaluer, verdict`.

## Quand l'utilisateur demande une analyse

1. Partir du dernier `crible/crible_resultats.json` et en donner la date d'extraction.
2. Vérifier les chiffres qui comptent pour la décision dans les publications de la société, ou sur le web, avec leur date.
3. Répondre avec les sources, les écarts entre sources, et les contre-exemples si une hypothèse ne tient pas.
4. Rappeler que la décision lui revient.

## Confidentialité

- Ne rien ajouter de personnel à ce fichier : il est versionné, et le site sera public.
- Les positions détenues vont dans `crible/extra_local.txt`, jamais dans le code.
- Claude ne lit ni ne modifie les fichiers `.env` (`backend/.env`, `stock-dashboard/.env`). Les clés à venir (FRED, Cloudflare R2, Supabase) y seront placées par l'utilisateur.
