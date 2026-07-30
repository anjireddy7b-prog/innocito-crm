# Innocito CRM — Internal Lead Management System

A production-grade internal CRM built to replace an Excel/SharePoint lead
tracker: the same lead fields the team already used (company, contact,
source, campaign, deal value, status, meeting details, MoM, next steps, ...),
now backed by a real relational database, role-based access control, a full
audit trail, and a Salesforce-inspired UI — without the Excel-file merge
conflicts.

## What's in here

```
backend/     Express + TypeScript API — PostgreSQL (Drizzle ORM) + Redis
frontend/    React + TypeScript SPA — Vite, Tailwind, a hand-built shadcn/ui
             component library, React Query, React Hook Form + Zod
docs/        Architecture, ER diagram, API reference, auth flow, deployment guide
docker-compose.yml   One-command local/self-hosted stack (Postgres + Redis + both apps)
```

Full narrative documentation:

- [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md) — system design, folder
  structure, security posture, testing strategy
- [`docs/ER_DIAGRAM.md`](./docs/ER_DIAGRAM.md) — full schema as a Mermaid ER
  diagram, plus the reasoning behind the less-obvious modeling decisions
- [`docs/API.md`](./docs/API.md) — every endpoint, its permission, and its
  notable behavior
- [`docs/AUTH_FLOW.md`](./docs/AUTH_FLOW.md) — JWT + rotating-refresh-token +
  RBAC flow, sequence-diagrammed
- [`docs/DEPLOYMENT.md`](./docs/DEPLOYMENT.md) — Docker Compose and Railway,
  step by step

## Quick start (local development, no Docker)

Prerequisites: Node ≥20, a running PostgreSQL 16 instance, a running Redis
instance (optional — the app falls back to in-memory caching without it).

```bash
npm install                     # installs both workspaces (backend + frontend)

cp backend/.env.example backend/.env
# edit backend/.env — at minimum DATABASE_URL must point at a real Postgres db

npm run db:migrate              # applies the schema
npm run seed                    # idempotent — creates roles/permissions, an
                                 # Admin user, and imports the original
                                 # spreadsheet's 54 leads

npm run dev:backend             # http://localhost:4000
npm run dev:frontend            # http://localhost:5173 (proxies /api to :4000)
```

Sign in with the Admin credentials from `backend/.env`
(`SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD`, defaulting to
`admin@innocito.com` / `ChangeMe!123`).

## Quick start (Docker Compose)

```bash
cp .env.example .env            # set real JWT secrets + admin credentials
docker compose up -d --build
```

The full stack (Postgres, Redis, API, SPA behind nginx) comes up at
**http://localhost:8080**. See [`docs/DEPLOYMENT.md`](./docs/DEPLOYMENT.md)
for the full walkthrough, production-hardening checklist, and the Railway
deployment steps used for this project's live hosted instance.

## Tests

```bash
npm run test:backend
```

30 tests (unit + integration) run against a real, dedicated
`innocito_crm_test` Postgres database — not mocked — covering auth, RBAC
enforcement, the full lead lifecycle, and Admin-only user management. See
`backend/tests/` and the testing section of `docs/ARCHITECTURE.md`.

## Roles

| Role | Can do |
|---|---|
| **Admin** | Everything, plus user management (create/disable/reset-password/assign-role — the only way accounts are created) and lead delete. |
| **Inside Sales** | Create/edit own leads, assign leads to Sales/Delivery, upload documents, schedule meetings, comment, update lead info. |
| **Sales** / **Delivery** | Update meeting details, MoM, technical comments, follow-ups, demo/proposal/opportunity status, final outcomes on leads they own. |
| **Management** | Full read access + reports/dashboard/audit-log visibility for oversight, without day-to-day CRUD permissions. |

There is no self-registration anywhere in the product — every account is
created by an Admin.
