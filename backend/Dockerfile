# --- Base -------------------------------------------------------------
FROM node:20-alpine AS base
WORKDIR /app
RUN apk add --no-cache dumb-init

# --- Dependencies (full, incl. devDependencies for the build step) ----
FROM base AS deps
COPY package.json package-lock.json ./
RUN npm ci

# --- Build --------------------------------------------------------------
FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY package.json package-lock.json ./
COPY tsconfig.json drizzle.config.ts ./
COPY src ./src
RUN npm run build

# --- Production dependencies only --------------------------------------
FROM base AS prod-deps
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# --- Runtime -------------------------------------------------------------
FROM base AS runtime
ENV NODE_ENV=production
COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY package.json ./
COPY src/db/migrations ./src/db/migrations
COPY seed-data ./seed-data
COPY docker-entrypoint.sh ./docker-entrypoint.sh

RUN chmod +x ./docker-entrypoint.sh \
  && mkdir -p /app/uploads && addgroup -S innocito && adduser -S innocito -G innocito \
  && chown -R innocito:innocito /app

USER innocito
EXPOSE 4000

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "require('http').get('http://127.0.0.1:4000/health',res=>process.exit(res.statusCode===200?0:1)).on('error',()=>process.exit(1))"

ENTRYPOINT ["dumb-init", "--"]
CMD ["./docker-entrypoint.sh"]
