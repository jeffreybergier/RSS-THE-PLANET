# --- Base Stage ---
FROM node:20-slim AS base-container
RUN apt-get update && apt-get install -y curl git && rm -rf /var/lib/apt/lists/*
WORKDIR /app

# 1. Install Global tools (These rarely change, keep them high up)
RUN npm install -g wrangler @google/gemini-cli

# 2. Copy only dependency files
COPY package.json package-lock.json* ./

# 3. Install local dependencies
# This layer is now cached UNLESS package.json changes
RUN npm install

# --- Wrangler ---
FROM base-container AS wrangler-container
# We don't even need COPY . . here if we use volumes in Compose, 
# but it's good practice for "production-ready" images.
COPY . . 
CMD ["wrangler", "dev", "--ip", "0.0.0.0"]

# --- Node ---
FROM base-container AS node-container
COPY . .
CMD ["npm", "start"]

# --- Gemini ---
FROM base-container AS gemini-container
# We don't COPY here because we'll live-map the code via volumes anyway
CMD ["tail", "-f", "/dev/null"]