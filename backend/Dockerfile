# Stage 1: Build
FROM node:22-alpine AS builder

WORKDIR /app

# Install build dependencies for native modules
RUN apk add --no-cache make g++ python3 git

COPY package*.json ./
COPY prisma ./prisma/
COPY prisma.config.ts ./
COPY tsconfig.json ./

# Install all dependencies including devDependencies
RUN npm ci

COPY src/ ./src/
COPY assets/ ./assets/

# Run build pipeline (prepareDbSchema, prisma generate, tsc)
RUN npm run build

# Stage 2: Production
FROM node:22-alpine

WORKDIR /app

# Runtime needs git for workspace operations and docker-cli for build containers
# mounted through /var/run/docker.sock.
RUN apk add --no-cache bash docker-cli docker-cli-buildx git openssh-client python3 make g++

ENV DOCKER_BUILDKIT=1

COPY package*.json ./
COPY prisma ./prisma/
COPY prisma.config.ts ./

# Install only production dependencies
RUN npm ci --omit=dev

# Copy compiled files, generated Prisma client, and assets
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/assets ./assets

RUN mkdir -p /var/lib/proofdesk

EXPOSE 4000
CMD ["node", "dist/server.js"]
