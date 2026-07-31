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
| PATCH | `/:id` | `ADMIN` role | Update profile fields / role / **Email ID**. `email` is validated (`z.string().email()`) and checked for uniqueness case-insensitively across all other users (409 `Conflict` if taken); re-submitting the user's current email is a no-op. A change writes a dedicated `EMAIL_CHANGED` audit log entry (`oldValues.email` / `newValues.email`), separate from the general `UPDATE`/`ROLE_CHANGED` entry for the rest of the request. |
| PATCH | `/:id/active` | `ADMIN` role | `{ isActive }` — disabling immediately revokes that user's refresh tokens. Admins cannot disable themselves. |
| POST | `/:id/reset-password` | `ADMIN` role | Generates and returns a new temporary password. |

**Email ID is the single source of truth for where notifications go.** Nothing in
the codebase caches or snapshots a user's email address anywhere else —
`utils/notifier.ts`'s `notifyUser()` (the one function every lead-assignment,
status-change, and task-assignment notification already goes through) looks
up `users.email` fresh from the database on every call, keyed by `userId`.
So the moment an Admin changes a user's Email ID via `PATCH /users/:id`, that
new address is what the next notification — of any kind already wired up —
uses, automatically, no extra configuration.

**Outbound email is a scaffold, not yet turned on.** This app has no email
provider configured (no SMTP/SendGrid/SES credentials exist anywhere in this
repo). `utils/emailer.ts` is a provider-agnostic `sendEmail()` that
`notifyUser()` already calls for every notification; while `SMTP_HOST` is
unset it just logs what would have been sent and returns, so nothing
silently claims to have delivered mail that didn't go anywhere. Setting
`SMTP_HOST`/`SMTP_PORT`/`SMTP_USER`/`SMTP_PASSWORD`/`SMTP_FROM` (see
`.env.example`) turns on real delivery with no other code changes — it will
immediately start using whatever email is currently on each user's account.
Two notification types the request mentioned — meeting reminders and overdue
task alerts — aren't triggered by anything yet either (there's no scheduled
job in this codebase); "comment mention" detection doesn't exist yet in the
Comments feature. Wiring those is a larger, separate piece of work from
enabling email delivery itself. Password-reset emails deliberately do **not**
email the plaintext temporary password (a well-known anti-pattern) — an
Admin still relays it out of band, same as today.

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

`industry` and `country` are curated dropdowns in the UI (see
`utils/leadFormOptions.ts` — Industry: ISV, Healthcare, BFSI, Retail, Energy
& Utilities (E&U), Hospitality, Business Services, Marketing & Advertisement,
Logistics & Supply Chain, Real Estate & Construction, Consumer Goods, Others.
Country: USA, UK, Europe, Australia, Singapore, India, Others) but are
validated as plain strings server-side, not a hard enum — this keeps
pre-existing free-text company records (e.g. from spreadsheet imports done
before this list existed) editable without being rejected on an unrelated
field change. `state` and `website` are free text (`website` is loosely
validated as a URL and normalized to include `https://` if no protocol was
given). `annualRevenue` is a plain numeric field ("Revenue" in the Lead
Creation form).

## Contacts — `/api/contacts`

Same shape as Companies, gated by `contacts:manage`. `GET /:id` includes
`company` and `leads[]`.

## Leads — `/api/leads` (the core entity)

| Method | Path | Permission | Notes |
|---|---|---|---|
| GET | `/` | `leads:view` | Filters: `search` (company/contact/email/phone/lead ID/email response/industry/website), `status`, `source`, `priority`, `campaignId`, `assignedToId`, `currentOwnerId`, `sdrId` (Lead Generated by), `createdBySdrId` (Created By), `companyId`, `country`, `industry`; `sortBy` any indexed column. |
| POST | `/import` | `leads:create` | `multipart/form-data`, field name `file` — a `.csv` or `.xlsx` file. Creates Companies/Contacts/Campaigns/Leads/Meetings from each row (same logic the initial database seed uses to import the original spreadsheet — see `utils/spreadsheetImport.ts`). Expects a header row with at least "Name" and "Company" columns; also recognizes "IST Rep", "Lead Generated By"/"SDR"/"SDR Name", "Created By", "Designation", "Email ID"/"Email", "Phone", "City", "State", "Country", "Industry", "Website"/"Website URL", "Revenue"/"Annual Revenue", "Email/Cold Calling"/"Source", "Status", "Campaign", "Meeting Date", "Lead Received Date"/"Received Date", "Email Response"/"Comments"/"Comment"/"Notes", "Category" (case-insensitive, a few common aliases accepted). Rows are matched against existing companies (by name) and contacts (by email, or by name+company when no email column) to avoid duplicates on re-import; a row whose company+contact pair already has an active lead is skipped rather than creating a duplicate lead. Returns `{ totalDataRows, created, skippedDuplicates, skippedInvalidRows, errors: [{ row, message }] }` — a single bad row does not fail the whole import. Invalidates the dashboard cache so KPIs reflect the import immediately. |
| GET | `/:id` | `leads:view` | Full detail: company (incl. `industry`/`country`/`state`/`website`/`annualRevenue`), contact, campaign, assignedTo, currentOwner, sdr (Lead Generated by), createdBySdr (Created By), createdBy, `_count`, plus `meetings[]`, `tasks[]`, `documents[]`, `leadComments[]`, `activities[]`. |
| POST | `/` | `leads:create` | Body can include an inline `contact: { firstName, lastName, ... }` and/or `company: { industry, country, state, website, annualRevenue }` — the service upserts/creates the company and contact rows transactionally. `company` details are only applied when a brand-new company is created inline (matched-by-name existing companies are never overwritten by a new lead's form data). Also accepts `sdrId` ("Lead Generated by" — must be an active INSIDE_SALES user id), `createdBySdrId` ("Created By" — same source, a separate manual attribution field, distinct from the system-audit `createdById`), `leadReceivedDate` (defaults to today when omitted), and an optional `meetingScheduledDate` + `meetingScheduledTime` ("HH:MM") + `meetingTimeZone` — when `meetingScheduledDate` is present a Meeting row is created alongside the lead (same behavior as the CSV import's "Meeting Date" handling). |
| PATCH | `/:id` | `leads:edit_own` **or** `leads:edit_any` | Ownership check happens in the service: `edit_own` only succeeds if the caller is the lead's `assignedTo`, `currentOwner`, or `createdBy`. Accepts the same body shape as POST (all fields optional) except `assignedToId`/`currentOwnerId`, which only change via `PATCH /:id/assign`; `sdrId` and `createdBySdrId` and `leadReceivedDate` are editable here. Unlike POST, an included `company: { industry, country, state, website, annualRevenue }` updates the lead's *already-linked* company directly (not just brand-new companies) — the Edit Lead form pre-fills these from the company's real current values, so this is an intentional edit, not a creation-time guess. `meetingScheduledDate`/`meetingScheduledTime`/`meetingTimeZone` reschedule the lead's "Initial Meeting" (creating it if the lead doesn't have one yet); other meetings added via `POST /meetings` are untouched — use `PATCH /meetings/:id` for those. |
| PATCH | `/:id/assign` | `leads:assign` | `{ assignedToId?, currentOwnerId?, note? }`. |
| POST | `/bulk-assign` | `leads:assign` | `{ leadIds: string[], assignedToId?, currentOwnerId? }`. |
| PATCH | `/:id/status` | `leads:edit_own` or `leads:edit_any` | `{ status, lossReason?, note? }` — a lead can be moved to any valid status at any time (no enforced pipeline order); the value is still validated against the fixed set of real lead statuses and rejected with 400 if it isn't one. |
| DELETE | `/:id` | `ADMIN` role | Soft delete (`isActive = false`) — preserves the record for audit/reporting. |

Every mutation on a lead writes an `activities` row (visible in the Timeline
tab) and an `audit_logs` row.

**Lead Creation module fields** (added on top of the original field set):

- **Campaign** — the dropdown now also offers Staffing, Pen Testing,
  AI-Led Quality Engineering (AI-Led QE), AI-Led Digital Engineering
  (AI-Led DE), and Generic, seeded as real `campaigns` rows (migration
  `0003_seed_new_campaigns.sql`) alongside whatever campaigns already
  existed — nothing pre-existing was removed or renamed.
- **Revenue** — `company.annualRevenue`, a plain numeric field (reuses the
  `companies.annual_revenue` column, which existed already but wasn't yet
  exposed on this form).
- **Industry** — `company.industry`, curated dropdown (see Companies
  section above for the exact list and the enum-vs-string tradeoff).
- **Lead Generated by** (renamed from "SDR Name") — `sdrId`, populated live
  from `GET /users/assignable?roles=INSIDE_SALES` (the same mechanism the
  existing "Assign To" field already used) — never a hardcoded list, always
  reflects current active Inside Sales users. Distinct from
  `assignedToId`/`currentOwnerId`.
- **Created By** — `createdBySdrId`, migration
  `0004_add_lead_created_by_sdr.sql`. Same live INSIDE_SALES dropdown source
  as "Lead Generated by", but a separate field: it's a manually-selected
  attribution (e.g. an Admin or a different rep entering the lead on that
  SDR's behalf), not the system-audit `createdById` (always whoever is
  actually logged in and submitting the form).
- **Email Response** — renamed from `comments` (column, API field, exports,
  search all renamed — this was a genuine rename via `ALTER TABLE ...
  RENAME COLUMN`, migration `0002_rename_comments_to_email_response.sql`,
  not just a relabel, so no data was lost).
- **Lead Received Date** — `leadReceivedDate`, defaults to today at creation,
  editable afterward by anyone with edit rights on the lead.
- **Meeting Schedule** — `meetingScheduledDate` / `meetingScheduledTime` /
  `meetingTimeZone`. On `POST /leads` this inserts a `meetings` row titled
  "Initial Meeting"; on `PATCH /leads/:id` it reschedules that same meeting
  (creating it if the lead has none yet) — the New Lead and Edit Lead forms
  present and validate this identically. `meetings.timeZone` is a free-text
  column (one of EST/CST/MST/PST or a manually-typed value for non-US leads).
- **Country** — `company.country`, curated dropdown (USA, UK, Europe,
  Australia, Singapore, India, Others). Also drives the frontend's
  Meeting Time Zone business logic: USA shows the EST/CST/MST/PST picker,
  anything else switches to a free-text timezone field.
- **State** — `company.state`, free text (column already existed).
- **Website** — `company.website`, free text with loose URL validation
  and `https://` auto-prefixing (column already existed).

**Edit Lead form parity with New Lead:** the Edit Lead form (`LeadEditPanel.tsx`)
carries every field above — Revenue, Industry, Lead Generated by, Created By,
Lead Received Date, Meeting Schedule, Country, State, Website, Email Response, the expanded
Campaign list — pre-populated with the lead's current data, using the same
shared field components, Zod schema fragments, and layout as the New Lead
form (`components/shared/CompanyDetailsFields.tsx`,
`MeetingScheduleFields.tsx`, `WebsiteField.tsx`, `SdrAndReceivedDateFields.tsx`,
and `lib/leadFormOptions.ts`). The one deliberate behavioral difference: on
Edit, the Company details block updates the lead's already-linked company
record directly (see the PATCH row above), since the form is showing and
editing that company's real current values rather than guessing at
creation-time inline details for a brand-new company.

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
| GET | `/summary?period=&year=&quarter=&month=` | `dashboard:view` | Single aggregate payload (KPIs, pipeline-by-stage, lead-source breakdown, country distribution, campaign performance, rep performance, monthly trend) — cached in Redis (60s TTL) since it's the one genuinely expensive query in the app. `period` is `all` (default), `year`, `quarter`, or `month`; `year` is required unless `period=all`, `quarter` (1-4) is required when `period=quarter`, `month` (1-12) is required when `period=month`. When a period is given, every lead/meeting-derived figure is scoped to that date range (e.g. `?period=quarter&year=2026&quarter=3` = Jul-Sep 2026); with no `period`, behavior is unchanged (all-time). The response includes `appliedPeriod: { period, year?, quarter?, month?, label }` describing what was actually applied. The cache key is parameterized by period so different filter selections don't collide. |

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
