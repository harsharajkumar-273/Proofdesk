FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
COPY frontend/package*.json frontend/
COPY backend/package*.json backend/

RUN npm install
RUN npm install --prefix frontend
RUN npm install --prefix backend

COPY . .

EXPOSE 3000 4000

CMD ["npm", "run", "dev"]
