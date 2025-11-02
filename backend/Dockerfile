# ---- Backend ----
FROM python:3.12.3-slim

# Définir le répertoire de travail
WORKDIR /app

# Copier les fichiers du backend
COPY ./requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# Exposer le port FastAPI
EXPOSE 8000
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]

