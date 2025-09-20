# Dockerfile

FROM node:18-alpine

# Install Git and other essentials
RUN apk add --no-cache git openssh-client

# Set the working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
# (This step will be run automatically by the dev container setup later)
# RUN npm install

# Copy the rest of the app's source code
COPY . .

# Keep the container running
CMD ["sleep", "infinity"]
