# --- Dependencies --------------------------------------------------------
FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# --- Build -----------------------------------------------------------------
FROM node:20-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

# --- Runtime (static assets served by nginx) --------------------------------
FROM nginx:1.27-alpine AS runtime

# nginx:alpine's entrypoint runs envsubst over every *.template in
# /etc/nginx/templates/ into /etc/nginx/conf.d/ on container start, so
# ${PORT} and ${BACKEND_ORIGIN} below are resolved from real env vars at
# `docker run` / Railway deploy time — no rebuild needed to point this image
# at a different backend or listen port.
COPY nginx.conf.template /etc/nginx/templates/default.conf.template
COPY --from=build /app/dist /usr/share/nginx/html

# Sane defaults for `docker compose up` (Compose service DNS name "backend");
# Railway overrides both via service variables (PORT is auto-injected,
# BACKEND_ORIGIN should be set to http://<backend-service>.railway.internal:4000).
ENV PORT=80
ENV BACKEND_ORIGIN=http://backend:4000

EXPOSE 80
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -q -O /dev/null "http://127.0.0.1:${PORT}/" || exit 1

CMD ["nginx", "-g", "daemon off;"]
