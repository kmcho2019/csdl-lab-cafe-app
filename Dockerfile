# Dockerfile

FROM node:18-alpine

# Install Git and other essentials
RUN apk add --no-cache git openssh-client

# Set the working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Copy the rest of the app's source code
COPY . .

# Default command runs the Next.js dev server (override as needed).
CMD ["npm", "run", "dev", "--", "--hostname", "0.0.0.0"]
