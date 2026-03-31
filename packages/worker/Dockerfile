FROM node:20-alpine AS base
WORKDIR /app

# Install semgrep + bandit + gitleaks
RUN apk add --no-cache python3 py3-pip git curl && \
    pip3 install semgrep bandit --break-system-packages && \
    curl -sSfL https://github.com/gitleaks/gitleaks/releases/download/v8.18.4/gitleaks_8.18.4_linux_x64.tar.gz \
    | tar -xz -C /usr/local/bin gitleaks

FROM base AS deps
COPY package.json ./
RUN npm install

FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . ./
RUN npx tsc

FROM base AS runner
WORKDIR /app
COPY --from=builder /app/dist ./dist
COPY --from=deps /app/node_modules ./node_modules
COPY package.json ./

RUN addgroup -S devaudit && adduser -S devaudit -G devaudit && \
    mkdir -p /tmp/devaudit-repos && chown devaudit:devaudit /tmp/devaudit-repos
USER devaudit

CMD ["node", "dist/index.js"]
