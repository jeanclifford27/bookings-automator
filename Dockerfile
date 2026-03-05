FROM mcr.microsoft.com/playwright:v1.43.0-jammy

WORKDIR /app

COPY package.json .
COPY server.js .

RUN npm install

CMD ["node", "server.js"]
