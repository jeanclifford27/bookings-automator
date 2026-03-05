# Image Playwright OFFICIELLE : navigateurs + libs déjà installés
# (choix : v1.43.0 — tu peux prendre v1.58.2-noble si tu préfères, mais alors aligne package.json)
FROM mcr.microsoft.com/playwright:v1.43.0-jammy

# Indiquer où sont les navigateurs et empêcher tout (re)téléchargement
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1

WORKDIR /app

# Copier uniquement ce qui est nécessaire pour la prod
COPY package.json .
COPY server.js .

# Installer les dépendances Node (sans postinstall)
RUN npm install --omit=dev

# Port exposé par l'app (Render mappe ce port vers l’URL publique)
ENV PORT=3000
EXPOSE 3000

# Lancer le serveur
CMD ["node", "server.js"]
