# Hi くまさん! I've optimized your Docker situation and moved everything into a clean, single Dockerfile while removing docker-compose.yml. I
# also added a dev:wrangler script to package.json so the Wrangler server binds correctly inside the container.
# 
# Step 1: Build your images
# You can build your two separate environments like this:
# 
# 
#  1 # Build the Node image
#  2 docker build --target node -t app-node .
#  3
#  4 # Build the Wrangler image
#  5 docker build --target wrangler -t app-wrangler .
# 
# Step 2: Run your commands
# Here are the 6 commands you requested, using volumes (-v) to ensure your local code changes are reflected immediately without rebuilding.
# 
# 
# Node Environment
#  1. Start Server:
#     docker run -it --rm -p 3000:3000 -v "$(pwd):/app" -v /app/node_modules app-node
#  2. Run Medium Tests:
#     docker run -it --rm -v "$(pwd):/app" -v /app/node_modules app-node npm run test:medium:node
#  3. Start Gemini:
#     docker run -it --rm -v "$(pwd):/app" -v /app/node_modules -v ~/.gemini:/root/.gemini app-node gemini
# 
# 
# Wrangler Environment
#  1. Start Server:
#     docker run -it --rm -p 3000:8787 -v "$(pwd):/app" -v /app/node_modules app-wrangler
#  2. Run Medium Tests:
#     docker run -it --rm -v "$(pwd):/app" -v /app/node_modules app-wrangler npm run test:medium:wrangler
#  3. Start Gemini:
#     docker run -it --rm -v "$(pwd):/app" -v /app/node_modules -v ~/.gemini:/root/.gemini app-wrangler gemini
# 
# 
# Note on Gemini: I mapped your local ~/.gemini folder so the CLI inside the container can access your authentication and history. I also
# used --rm to keep your system clean by removing the container as soon as you stop it.
# 
# 
# Is there anything else I can help you with?

# --- Base ---
FROM node:20-slim AS base
RUN apt-get update && apt-get install -y curl git && rm -rf /var/lib/apt/lists/*
WORKDIR /app

# 1. Global tools (kept high for caching)
RUN npm install -g wrangler @google/gemini-cli

# 2. Dependencies
COPY package.json package-lock.json* ./
RUN npm install

# 3. Code
COPY . .

# --- Node ---
FROM base AS node
EXPOSE 3333
# We don't use volumes in Dockerfile; that's done at runtime for dev.
CMD ["npm", "start"]

# --- Wrangler ---
FROM base AS wrangler
EXPOSE 8787
CMD ["npm", "run", "dev:wrangler"]
