# API Reference

Base URL: `/api` (proxied by Vite in dev, by nginx in the Docker/production
build). All endpoints except `POST /api/auth/login` require a valid
`Authorization: Bearer <accessToken>` header — see
[`AUTH_FLOW.md`](./AUTH_FLOW.md) for how that token is obtained and refreshed.

**Response envelope** (every endpoint, success or failure):

```jsonc
{
  "success": true,
  "data": { /* ... */ },
  "meta": { "total": 132, "page": 1, "pageSize": 20, "totalPages": 7, "hasNextPage": true, "hasPrevPage": false } // list endpoints only
}
```

```jsonc
{ "success": false, "message": "Lead not found", "details": { /* zod field errors, when applicable */ } }
```

**Pagination** — any list endpoint accepts `?page=1&pageSize=20`
(`pageSize` capped server-side); most also accept `search`, one or more
entity-specific filters, and `sortBy`/`sortDir=asc|desc`.

## Auth — `/api/auth`

| Method | Path | Auth | Notes |
|---|---|---|---|
| POST | `/login` | public | Rate-limited. Sets the refresh-token httpOnly cookie; returns `{ accessToken, user }`. |
| POST | `/refresh` | refresh cookie + CSRF header | Rotates the refresh token; returns a new `accessToken`. |
| POST | `/logout` | refresh cookie + CSRF header | Revokes the current refresh token, clears the cookie. |
| GET | `/me` | Bearer | Returns the current user + resolved permission list. |
| POST | `/change-password` | Bearer | `{ currentPassword, newPassword }`. Revokes all of that user's other sessions. |

## Users — `/api/users` (Admin-only, except `/assignable`)

| Method | Path | Permission | Notes |
|---|---|---|---|
| GET | `/assignable` | any authenticated user | Lightweight `{ id, firstName, lastName, role }[]` list for assignment dropdowns. |
| GET | `/` | `ADMIN` role | Paginated, filterable by `search`, `roleName`, `isActive`. |
| GET | `/:id` | `ADMIN` role | |
| POST | `/` | `ADMIN` role | Creates a user with a generated temporary password (no self-registration exists anywhere in the API). |
| PATCH | `/:id` | `ADMIN` role | Update profile fields / role. |
| PATCH | `/:id/active` | `ADMIN` role | `{ isActive }` — disabling immediately revokes that user's refresh tokens. Admins cannot disable themselves. |
| POST | `/:id/reset-password` | `ADMIN` role | Generates and returns a new temporary password. |

## Roles — `/api/roles`

| Method | Path | Permission | Notes |
|---|---|---|---|
| GET | `/` | `roles:view` | Returns all 5 roles with their granted permission keys — powers the Users page's role picker. |

## Companies — `/api/companies`

| Method | Path | Permission | Notes |
|---|---|---|---|
| GET | `/` | authenticated | Filterable by `search`, `country`, `industry`. |
| GET | `/:id` | authenticated | Includes `contacts[]` and `leads[]`. |
| POST | `/` | `companies:manage` | |
| PATCH | `/:id` | `companies:manage` | |
| DELETE | `/:id` | `companies:manage` | Hard delete; linked leads/contacts keep their FK set to null. |

## Contacts — `/api/contacts`

Same shape as Companies, gated by `contacts:manage`. `GET /:id` includes
`company` and `leads[]`.

## Leads — `/api/leads` (the core entity)

| Method | Path | Permission | Notes |
|---|---|---|---|
| GET | `/` | `leads:view` | Filters: `search` (company/contact/email/phone/lead ID), `status`, `source`, `priority`, `campaignId`, `assignedToId`, `currentOwnerId`, `companyId`, `country`; `sortBy` any indexed column. |
| GET | `/:id` | `leads:view` | Full detail: company, contact, campaign, assignedTo, currentOwner, createdBy, `_count`, plus `meetings[]`, `tasks[]`, `documents[]`, `leadComments[]`, `activities[]`. |
| POST | `/` | `leads:create` | Body can include an inline `contact: { firstName, lastName, ... }` — the service upserts/creates the company and contact rows transactionally. |
| PATCH | `/:id` | `leads:edit_own` **or** `leads:edit_any` | Ownership check happens in the service: `edit_own` only succeeds if the caller is the lead's `assignedTo`, `currentOwner`, or `createdBy`. |
| PATCH | `/:id/assign` | `leads:assign` | `{ assignedToId?, currentOwnerId?, note? }`. |
| POST | `/bulk-assign` | `leads:assign` | `{ leadIds: string[], assignedToId?, currentOwnerId? }`. |
| PATCH | `/:id/status` | `leads:edit_own` or `leads:edit_any` | `{ status, lossReason?, note? }` — validated against a finite-state machine (`utils` `VALID_TRANSITIONS`); an illegal transition (e.g. `WON` → `NEW`) is rejected with 400. |
| DELETE | `/:id` | `ADMIN` role | Soft delete (`isActive = false`) — preserves the record for audit/reporting. |

Every mutation on a lead writes an `activities` row (visible in the Timeline
tab) and an `audit_logs` row.

## Campaigns — `/api/campaigns`

Same CRUD shape, gated by `campaigns:manage`. `GET /:id` includes `leads[]`
for the campaign-performance view.

## Meetings — `/api/meetings`

| Method | Path | Permission | Notes |
|---|---|---|---|
| GET | `/` | authenticated | Filters: `leadId`, `upcoming=true` (status=SCHEDULED and future), `from`/`to` date range. |
| POST | `/` | `meetings:manage` | Requires `leadId`; auto-advances a `NEW`/`CONTACTED`/`QUALIFIED` lead to `MEETING_SCHEDULED`. |
| PATCH | `/:id` | `meetings:manage` | Status changes / MoM entry both write distinct activity-timeline entries. |
| DELETE | `/:id` | `meetings:manage` | |

## Tasks — `/api/tasks`

| Method | Path | Permission | Notes |
|---|---|---|---|
| GET | `/` | authenticated | Filters: `leadId`, `assignedToId`, `status` (comma-separated), `overdue=true`. |
| POST | `/` | `tasks:manage` | Notifies the assignee if one is set. |
| PATCH | `/:id` | `tasks:manage` | Setting `status: COMPLETED` stamps `completedAt` and logs a timeline entry. |
| DELETE | `/:id` | `tasks:manage` | |

## Documents — `/api/documents`

| Method | Path | Permission | Notes |
|---|---|---|---|
| GET | `/` | authenticated | Filters: `leadId`, `companyId`. |
| POST | `/` | `documents:upload` | `multipart/form-data`: `file` + `leadId` or `companyId` + `documentType`. MIME-type allowlisted, filename randomized on disk. |
| DELETE | `/:id` | `documents:delete` | Removes the DB row and the file from disk. |

## Comments — `/api/comments`

| Method | Path | Permission | Notes |
|---|---|---|---|
| GET | `/?leadId=` | authenticated | |
| POST | `/` | `comments:create` | |
| PATCH | `/:id` | authenticated (author only, enforced in service) | |
| DELETE | `/:id` | authenticated (author only, enforced in service) | |

## Notifications — `/api/notifications` (always scoped to the caller)

| Method | Path | Notes |
|---|---|---|
| GET | `/` | Latest 50 for the current user + `meta.unreadCount`. |
| PATCH | `/:id/read` | |
| POST | `/read-all` | |

## Activities — `/api/activities`

| Method | Path | Notes |
|---|---|---|
| GET | `/?leadId=&companyId=&contactId=&limit=` | Unified, polymorphic timeline feed — omit all filters for a global recent-activity feed (used by the Activities page), capped at 200. |

## Audit Logs — `/api/audit-logs`

| Method | Path | Permission | Notes |
|---|---|---|---|
| GET | `/?entityType=&action=&userId=&page=&pageSize=` | `audit_logs:view` | Every create/update/delete/login/export/assignment/status-change/password-reset, with before/after JSON snapshots. |

## Dashboard — `/api/dashboard`

| Method | Path | Permission | Notes |
|---|---|---|---|
| GET | `/summary` | `dashboard:view` | Single aggregate payload (KPIs, pipeline-by-stage, lead-source breakdown, country distribution, campaign performance, rep performance, monthly trend) — cached in Redis (60s TTL) since it's the one genuinely expensive query in the app. |

## Search — `/api/search`

| Method | Path | Notes |
|---|---|---|
| GET | `/?q=` | Global autocomplete across leads (ID/company/contact/email/phone), companies, contacts, campaigns, and sales reps — powers the top-nav search. Requires `q.length >= 2`. |

## Reports — `/api/reports` (`reports:export` permission)

| Method | Path | Notes |
|---|---|---|
| GET | `/leads/export.csv` | Streams a CSV of all active leads. |
| GET | `/leads/export.xlsx` | Same data as a formatted Excel workbook. |
| GET | `/leads/export.pdf` | Same data as a landscape PDF table. |

Every export call records an `EXPORT` audit-log entry with the row count and
format.
