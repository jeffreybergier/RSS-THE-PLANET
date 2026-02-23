## Instructions

# For handy shortcuts see compose.yml

# Build
# docker build -f Containerfile --target app -t rssplanet-app .
# docker build -f Containerfile --target gemini -t rssplanet-gemini .

# Run App - Node.js
# docker run -it --rm -p 3000:3000 -v "$(pwd):/app" -v /app/node_modules rssplanet-app npm start
# docker run -it --rm -v "$(pwd):/app" -v /app/node_modules rssplanet-app npm run test

# Run App - Wrangler
# docker run -it --rm -p 3000:8787 -v "$(pwd):/app" -v /app/node_modules rssplanet-app wrangler dev --ip 0.0.0.0
# docker run -it --rm -v "$(pwd):/app" -v /app/node_modules rssplanet-app npm run test:wrangler

# Run Gemini
# docker run -it --rm -v "$(pwd):/app" -v /app/node_modules -v ~/.gemini:/root/.gemini rssplanet-gemini gemini

# --- Base ---
FROM node:20-slim AS app
EXPOSE 3000
EXPOSE 8787
RUN apt-get update && apt-get install -y curl git && rm -rf /var/lib/apt/lists/*
WORKDIR /app

# 1. Global tools
RUN npm install -g wrangler

# 2. App Dependencies
COPY package.json package-lock.json* ./
RUN npm install

# 3. Source Code
COPY . .

# --- Gemini Environment ---
FROM app AS gemini
RUN npm install -g @google/gemini-cli