## Instructions

# Build
# docker build --target app -t app .
# docker build --target gemini -t gemini .

# Run App - Node.js
# docker run -it --rm -p 3000:3000 -v "$(pwd):/app" -v /app/node_modules app npm start
# docker run -it --rm -v "$(pwd):/app" -v /app/node_modules app npm run test

# Run App - Wrangler
# docker run -it --rm -p 3000:8787 -v "$(pwd):/app" -v /app/node_modules app wrangler dev --ip 0.0.0.0
# docker run -it --rm -v "$(pwd):/app" -v /app/node_modules app npm run test:wrangler

# Run Gemini
# docker run -it --rm -v "$(pwd):/app" -v /app/node_modules -v ~/.gemini:/root/.gemini gemini gemini

# --- Base ---
FROM node:20-slim AS base
RUN apt-get update && apt-get install -y curl git && rm -rf /var/lib/apt/lists/*
WORKDIR /app

# 1. Global tools
# We install wrangler here as it's common to both environments
RUN npm install -g wrangler

# 2. Dependencies
COPY package.json package-lock.json* ./
RUN npm install

# 3. Source Code
COPY . .

# --- App Environment ---
# This single image handles both Node and Wrangler.
# Customize which one runs via the command at runtime.
FROM base AS app
EXPOSE 3000
EXPOSE 8787

# --- Gemini Environment ---
# We use a separate stage for Gemini so it can run in a dedicated container.
# This prevents Gemini from closing if the app container crashes.
FROM base AS gemini
RUN npm install -g @google/gemini-cli
# Expose the volume for Gemini settings/auth
VOLUME ["/root/.gemini"]
