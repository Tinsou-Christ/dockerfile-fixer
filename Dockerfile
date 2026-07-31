FROM node:20-alpine

WORKDIR /usr/src/app

ENV NODE_ENV=production
ENV PORT=3000
ENV DATA_DIR=/data

COPY quiz-api/package.json ./
RUN npm install --omit=dev

COPY quiz-api/server.js ./
COPY quiz-api/src ./src
COPY quiz-api/public ./public

RUN mkdir -p /data

EXPOSE 3000
CMD ["node", "server.js"]
