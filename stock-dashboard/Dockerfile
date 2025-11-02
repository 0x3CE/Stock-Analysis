# ---- Frontend ----
FROM node:20-alpine

# Définir le répertoire de travail
WORKDIR /app

# Copier les fichiers du frontend
COPY package*.json ./
RUN npm install

COPY . .

# Construire l’application pour la production
RUN npm run build

# Servir l’app avec un serveur statique léger
RUN npm install -g serve
EXPOSE 3000

CMD ["serve", "-s", "build", "-l", "3000"]
