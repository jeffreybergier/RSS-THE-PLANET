# Use the latest LTS Node version
FROM node:20-slim

# Install basic tools (optional, for debugging)
RUN apt-get update && apt-get install -y curl git && rm -rf /var/lib/apt/lists/*

# Set the working directory inside the container
WORKDIR /app

# We install wrangler inside the container so it doesn't touch your Mac
RUN npm install -g wrangler

# Cloudflare's dev server needs to bind to 0.0.0.0 to be visible on your Mac
ENV WRANGLER_SEND_METRICS=false

# Expose the default Wrangler dev port
EXPOSE 8787

CMD ["wrangler", "dev", "--ip", "0.0.0.0"]