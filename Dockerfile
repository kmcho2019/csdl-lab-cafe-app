# Dockerfile

FROM node:18-bullseye-slim

# Install Git, SSH client, and OpenSSL 1.1 runtime for Prisma engines
RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    git \
    openssh-client \
    libssl1.1 \
  && rm -rf /var/lib/apt/lists/*

# Set the working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Copy the rest of the app's source code
COPY . .

# Default command runs the Next.js dev server (override as needed).
CMD ["npm", "run", "dev", "--", "--hostname", "0.0.0.0"]
