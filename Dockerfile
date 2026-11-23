FROM node:22-alpine

WORKDIR /app
ENV NODE_ENV=production

# Спочатку залежності: цей шар кешується, якщо package.json не змінився
COPY package*.json ./
RUN npm ci --omit=dev

# Потім код
COPY . .

# Версію передасть GitHub Actions, вона з'явиться в бейджі на сайті
ARG APP_VERSION=dev
ENV APP_VERSION=$APP_VERSION

EXPOSE 3000
USER node
CMD ["node", "server.js"]