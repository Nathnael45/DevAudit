FROM node:20-alpine AS base
WORKDIR /app

FROM base AS deps
COPY package.json ./
COPY packages/api/package.json ./packages/api/
RUN npm install --workspace=packages/api

FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY tsconfig.base.json ./
COPY packages/api ./packages/api
WORKDIR /app/packages/api
RUN npx tsc

FROM base AS runner
WORKDIR /app
COPY --from=builder /app/packages/api/dist ./dist
COPY --from=deps /app/node_modules ./node_modules
COPY packages/api/package.json ./package.json

EXPOSE 3001
CMD ["node", "dist/index.js"]
