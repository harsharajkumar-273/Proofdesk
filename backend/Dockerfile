FROM node:22-alpine

WORKDIR /app

# Runtime needs git for workspace operations and docker-cli for build containers
# mounted through /var/run/docker.sock.
RUN apk add --no-cache bash docker-cli docker-cli-buildx git openssh-client python3 make g++

ENV DOCKER_BUILDKIT=1

COPY package*.json ./
RUN npm ci --omit=dev

COPY src/ ./src/
COPY assets/ ./assets/

RUN mkdir -p /var/lib/proofdesk

EXPOSE 4000
CMD ["node", "src/server.js"]
