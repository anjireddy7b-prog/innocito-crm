# Deployment Guide

Two supported paths: **Docker Compose** (self-hosted, a single `docker
compose up` on any VM) and **Railway** (managed, the live hosted instance for
this project — see the bottom of this doc for the actual deployed URLs).

## Option A — Docker Compose

Prerequisites: Docker Engine + Compose plugin.

```bash
cp .env.example .env
# Edit .env — at minimum set real values for:
#   JWT_ACCESS_SECRET, JWT_REFRESH_SECRET  (openssl rand -base64 48)
#   SEED_ADMIN_EMAIL, SEED_ADMIN_PASSWORD

docker compose up -d --build
```

This starts four services:

| Service | Image | Port | Notes |
|---|---|---|---|
| `postgres` | `postgres:16-alpine` | 5432 | Data persisted in the `postgres_data` volume. |
| `redis` | `redis:7-alpine` | 6379 | Cache + rate-limit store; app degrades gracefully (in-memory fallback) if this is removed. |
| `backend` | built from `backend/Dockerfile` | 4000 | Runs migrations automatically on boot (`docker-entrypoint.sh`), then seeds (idempotent, controlled by `RUN_SEED_ON_BOOT`) if enabled, then starts the API. |
| `frontend` | built from `frontend/Dockerfile` (nginx) | 8080 → 80 | Serves the built SPA and reverse-proxies `/api/*` and `/uploads/*` to `backend:4000`. |

Once healthy, the app is at **http://localhost:8080**. Sign in with the
seeded Admin (`SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` from `.env` —
defaults to `admin@innocito.com` / `ChangeMe!123`, which you should change on
first login).

Useful commands:

```bash
docker compose logs -f backend        # tail API logs
docker compose exec backend sh        # shell into the API container
docker compose exec backend node dist/db/seed.js   # re-run the (idempotent) seed manually
docker compose down                   # stop (keeps volumes/data)
docker compose down -v                # stop and wipe all data
```

Uploaded documents persist in the `backend_uploads` named volume across
container restarts/rebuilds.

### Production hardening checklist

- Put the `frontend` service behind a real TLS-terminating reverse proxy or
  load balancer (this repo's nginx config is HTTP-only; terminate TLS in
  front of it, or add a `443` server block + certs).
- Set `CLIENT_ORIGIN` to your real public origin (CORS + refresh-cookie
  scoping both depend on it).
- Do not expose ports `5432`/`6379` publicly — remove those `ports:` mappings
  in `docker-compose.yml` once you've confirmed connectivity, and rely on the
  Docker network for `backend` → `postgres`/`redis`.
- Rotate `JWT_ACCESS_SECRET`/`JWT_REFRESH_SECRET` out of `.env.example`-style
  defaults before anyone but you can reach the instance.
- Set `RUN_SEED_ON_BOOT=false` after the first successful boot in a shared
  environment — the seed is idempotent and safe to leave on, but there's no
  reason to re-run it on every restart once real data exists.

## Option B — Railway (hosted)

Railway is used for the project's live instance: two services (`backend`,
`frontend`) plus managed Postgres and Redis plugins in one project, deployed
straight from this repository via the Railway MCP tooling / CLI — no
`docker-compose.yml` involved on that side (Railway builds each service from
its own `Dockerfile` directly).

1. **Create the project** and add the **Postgres** and **Redis** plugins —
   Railway provisions both and exposes `DATABASE_URL` / connection vars
   automatically as service variables you can reference.
2. **Backend service** — point it at `backend/` (root directory) so Railway
   picks up `backend/Dockerfile`. Set variables:
   - `NODE_ENV=production`
   - `DATABASE_URL` → reference the Postgres plugin's connection string
   - `REDIS_URL` → reference the Redis plugin's connection string
   - `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` → generated secrets
   - `CLIENT_ORIGIN` → the frontend service's public Railway domain (set
     after step 3, once that domain exists)
   - `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` → your real bootstrap Admin
   - `RUN_SEED_ON_BOOT=true` for the first deploy (the entrypoint script
     runs migrations, then the idempotent seed, then starts the server —
     identical to the Docker Compose path)
   - Generate a public domain for the backend, or keep it private and only
     reachable from the frontend service over Railway's internal network —
     either works since the frontend proxies `/api`.
3. **Frontend service** — point it at `frontend/` so Railway picks up
   `frontend/Dockerfile`. The image's nginx config is a *template*
   (`nginx.conf.template`) resolved via `envsubst` at container start, so set
   the `BACKEND_ORIGIN` service variable to the backend's Railway **private**
   networking address — `http://<backend-service-name>.railway.internal:4000`
   — so browser → frontend → backend traffic never leaves Railway's internal
   network for the API leg. `PORT` is auto-injected by Railway and already
   wired into the same template. Generate a public domain for this service —
   that's the app's URL.
4. **First deploy** — Railway builds both Dockerfiles, the backend's
   entrypoint runs migrations + seed against the managed Postgres, and the
   app is live at the frontend's generated domain.
5. **Subsequent deploys** — push to the connected branch (or trigger a
   deploy via the Railway MCP/CLI); `RUN_SEED_ON_BOOT` should be flipped to
   `false` once real data exists so restarts don't re-touch the seed logic
   unnecessarily (it's a no-op either way, but there's no reason to pay the
   query cost every boot).

### Live instance

| | |
|---|---|
| App URL | _filled in after deployment — see the delivery message for this session_ |
| API health check | `<app-url-or-backend-url>/health` |
| Seeded Admin login | the `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` configured for that deployment |

## Environment variable reference

| Variable | Required | Default | Notes |
|---|---|---|---|
| `NODE_ENV` | no | `development` | `production` disables verbose pino-pretty logging and enables `Secure` cookies. |
| `PORT` | no | `4000` | Backend listen port. |
| `CLIENT_ORIGIN` | yes (prod) | `http://localhost:5173` | Comma-separated list allowed for CORS + refresh cookie. |
| `DATABASE_URL` | **yes** | — | `postgresql://user:pass@host:5432/db`. |
| `REDIS_URL` | no | — | If unset, caching falls back to an in-memory `Map` automatically. |
| `JWT_ACCESS_SECRET` | **yes** | — | ≥16 chars; use ≥32 in any shared environment. |
| `JWT_REFRESH_SECRET` | **yes** | — | Must differ from the access secret. |
| `JWT_ACCESS_EXPIRES_IN` | no | `15m` | |
| `JWT_REFRESH_EXPIRES_IN` | no | `7d` | |
| `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` | no | `admin@innocito.com` / `ChangeMe!123` | Only used by the seed script — change the password on first login. |
| `UPLOAD_DIR` | no | `./uploads` | Must be a writable, persisted path/volume in production. |
| `MAX_UPLOAD_MB` | no | `15` | |
| `LOG_LEVEL` | no | `info` | pino level. |
| `RUN_SEED_ON_BOOT` | no (Docker/Railway only) | `true` | Entrypoint-script flag, not read by the app itself. |

Frontend build-time variable: `VITE_API_PROXY_TARGET` (dev-server proxy target
only — the production nginx build proxies via `nginx.conf`, not this
variable, unless you customize it per the Railway notes above).
