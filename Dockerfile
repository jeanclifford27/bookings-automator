FROM mcr.microsoft.com/playwright:v1.43.0-jammy

WORKDIR /app

COPY package.json .
COPY server.js .

RUN npm install

# Render route le trafic vers le port 10000 par défaut.
# On expose 3000 côté app, Render fera le mapping automatiquement.
EXPOSE 3000

CMD ["node", "server.js"]
