FROM node:22-alpine AS build
RUN apk add --no-cache python3 make g++
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:22-alpine
WORKDIR /app
COPY --from=build /app/node_modules ./node_modules
COPY . .
EXPOSE 6666
CMD ["node", "index.js"]
