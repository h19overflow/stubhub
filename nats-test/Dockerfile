FROM node:24-alpine AS base
WORKDIR /app

COPY package.json ./
RUN npm install

COPY tsconfig.json ./
COPY src ./src

RUN npm run build

ENV NATS_URL=http://nats-srv:4222

CMD ["node", "dist/publisher.js"]
