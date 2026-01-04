FROM node:20-slim
RUN apt-get update && apt-get install -y curl git && rm -rf /var/lib/apt/lists/*
WORKDIR /app

# GLOBAL TOOLS
RUN npm install -g wrangler

# LOCAL DEPENDENCIES (The missing piece)
# We copy these two files so npm install has something to read
COPY package.json package-lock.json* ./
RUN npm install 

ENV WRANGLER_SEND_METRICS=false
EXPOSE 8787

CMD ["wrangler", "dev", "--ip", "0.0.0.0"]