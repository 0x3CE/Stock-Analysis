# 📊 Dashboard d'Analyse d'Actions avec Piotroski F-Score

Architecture moderne **Backend Python (FastAPI) + Frontend React** pour l'analyse financière d'actions avec calcul automatique du Piotroski F-Score.

---

## 🏗️ Architecture

```
project/
├── backend/
│   ├── main.py              # API FastAPI
│   ├── requirements.txt     # Dépendances Python
│   └── .env                 # Variables d'environnement (optionnel)
│
└── stock-dashboard/
    ├── src/
    │   └── App.jsx          # Dashboard React
    ├── package.json
    └── ...
```

---

## 🚀 Installation

### 1️⃣ Backend Python (FastAPI)

```bash
# Créer un environnement virtuel
python -m venv venv

# Activer l'environnement
# Sur Windows:
venv\Scripts\activate
# Sur Mac/Linux:
source venv/bin/activate

# Installer les dépendances
pip install fastapi uvicorn yfinance pandas python-dotenv
```

**Ou créer un `requirements.txt` :**
```txt
fastapi==0.104.1
uvicorn[standard]==0.24.0
yfinance==0.2.32
pandas==2.1.3
python-dotenv==1.0.0
```

Puis : `pip install -r requirements.txt`

### 2️⃣ Frontend React

```bash
# Si projet existant
npm install recharts lucide-react

# Si nouveau projet (Create React App / Vite)
npx create-react-app stock-dashboard
cd stock-dashboard
npm install recharts lucide-react
```

---

## ▶️ Lancement

### 1. Démarrer le Backend (port 8000)

```bash
cd backend
python main.py
```

L'API sera disponible sur : **http://localhost:8000**

Endpoints disponibles :
- `GET /` - Documentation API
- `GET /health` - Health check
- `GET /analyze/{ticker}` - Analyse complète d'une action

### 2. Démarrer le Frontend (port 3000)

```bash
cd frontend
npm start
```

Le dashboard sera accessible sur : **http://localhost:3000**

---

## 📡 Configuration CORS (si nécessaire)

Si vous rencontrez des erreurs CORS, vérifiez dans `main.py` :

```python
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],  # Votre URL frontend
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
```

---

## 🧪 Tester l'API manuellement

### Via curl :
```bash
curl http://localhost:8000/analyze/AAPL
```

### Via navigateur :
```
http://localhost:8000/analyze/AAPL
```

### Documentation interactive (Swagger) :
```
http://localhost:8000/docs
```

---

## 📊 Fonctionnalités

### KPIs Principaux
- Prix actuel + variation journalière
- Capitalisation boursière
- P/E Ratio, Dividend Yield
- Volume, Beta, EPS
- ROE, Debt/Equity, Current Ratio
- Marges de profit

### Piotroski F-Score (0-9)
Analyse sur **9 critères** répartis en 3 catégories :

1. **Rentabilité** (4 critères)
   - ROA positif
   - Cash Flow opérationnel positif
   - ROA en croissance
   - Qualité des bénéfices

2. **Levier / Liquidité** (3 critères)
   - Dette/Equity
   - Current Ratio
   - Pas de nouvelle émission d'actions

3. **Efficacité Opérationnelle** (2 critères)
   - Marge brute
   - Rotation des actifs

### Visualisations
- Graphique d'évolution du prix sur 30 jours
- KPI cards avec icônes colorées
- Score Piotroski avec code couleur (vert ≥7, jaune 4-6, rouge <4)

---

## 🛠️ Technologies Utilisées

### Backend
- **FastAPI** : Framework web moderne et rapide
- **yfinance** : Récupération de données Yahoo Finance
- **Pydantic** : Validation des données
- **Uvicorn** : Serveur ASGI

### Frontend
- **React** : Bibliothèque UI
- **Recharts** : Graphiques interactifs
- **Lucide React** : Icônes modernes
- **Tailwind CSS** : Styling

---

## 📝 Exemples de Tickers

- **AAPL** : Apple Inc.
- **MSFT** : Microsoft
- **GOOGL** : Alphabet (Google)
- **TSLA** : Tesla
- **AMZN** : Amazon
- **NVDA** : NVIDIA
- **META** : Meta (Facebook)

---

## 🔧 Production

### Backend (avec Gunicorn)
```bash
pip install gunicorn
gunicorn -w 4 -k uvicorn.workers.UvicornWorker main:app --bind 0.0.0.0:8000
```

### Frontend (Build)
```bash
npm run build
# Servir les fichiers statiques avec nginx ou équivalent
```

---

## 🐛 Troubleshooting

### Erreur "Ticker invalide"
- Vérifier que le symbole existe sur Yahoo Finance
- Essayer avec un ticker connu (AAPL, MSFT)

### Erreur CORS
- Vérifier la configuration du middleware CORS dans `main.py`
- S'assurer que l'URL frontend est autorisée

### API lente
- Les appels à yfinance peuvent prendre 2-5 secondes
- Possibilité d'ajouter un cache Redis pour améliorer les performances

---

## 📚 Ressources

- [Documentation FastAPI](https://fastapi.tiangolo.com/)
- [Documentation yfinance](https://pypi.org/project/yfinance/)
- [Méthodologie Piotroski](https://en.wikipedia.org/wiki/Piotroski_F-score)
- [Documentation Recharts](https://recharts.org/)

---

## 📄 Licence

MIT License - Libre d'utilisation pour vos projets personnels et commerciaux.