# ---- Backend ----
FROM python:3.12.3-slim

# Empêche Python de créer des fichiers .pyc et améliore les logs
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

# Définir le répertoire de travail
WORKDIR /app

# Copier uniquement les dépendances d’abord (meilleur cache Docker)
COPY ./requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copier le reste du code
COPY . .

# Exposer le port FastAPI
EXPOSE 8000

# Commande de lancement
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]

