# Image Playwright officielle (navigateurs + libs déjà installés)
# Choisir un tag et garder EXACTEMENT la même version côté NPM.
FROM mcr.microsoft.com/playwright:v1.43.0-jammy

# Indiquer où sont les navigateurs & empêcher tout (re)téléchargement
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1

WORKDIR /app

# Copier uniquement ce qui est nécessaire
COPY package.json .
COPY server.js .

# Installer les deps (sans scripts postinstall)
RUN npm install --omit=dev

# Port d'écoute de l'app ; Render mappe ce port vers l'URL publique
ENV PORT=3000
EXPOSE 3000

CMD ["node", "server.js"]
