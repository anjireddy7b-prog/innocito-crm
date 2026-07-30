# Entity-Relationship Diagram

Sixteen normalized tables, UUID primary keys throughout, indexed on every foreign
key and every column used for filtering/sorting in the API (status, source,
priority, dates, read/unread flags). Full column definitions live in
`backend/src/db/schema.ts`; migrations are generated with `drizzle-kit` into
`backend/src/db/migrations/`.

```mermaid
erDiagram
    ROLES ||--o{ USERS : "has many"
    ROLES ||--o{ ROLE_PERMISSIONS : "grants"
    PERMISSIONS ||--o{ ROLE_PERMISSIONS : "granted via"

    USERS ||--o{ REFRESH_TOKENS : "issues"
    USERS ||--o{ USERS : "created_by"
    USERS ||--o{ LEADS : "assigned_to"
    USERS ||--o{ LEADS : "current_owner"
    USERS ||--o{ LEADS : "created_by"
    USERS ||--o{ MEETINGS : "created_by"
    USERS ||--o{ TASKS : "assigned_to / created_by"
    USERS ||--o{ DOCUMENTS : "uploaded_by"
    USERS ||--o{ COMMENTS : "authored_by"
    USERS ||--o{ ACTIVITIES : "actor"
    USERS ||--o{ NOTIFICATIONS : "recipient"
    USERS ||--o{ AUDIT_LOGS : "actor"

    COMPANIES ||--o{ CONTACTS : "employs"
    COMPANIES ||--o{ LEADS : "is target of"
    COMPANIES ||--o{ DOCUMENTS : "attached to"
    COMPANIES ||--o{ ACTIVITIES : "involves"

    CONTACTS ||--o{ LEADS : "is contact for"
    CONTACTS ||--o{ ACTIVITIES : "involves"

    CAMPAIGNS ||--o{ LEADS : "sources"

    LEADS ||--o{ MEETINGS : "has"
    LEADS ||--o{ TASKS : "has"
    LEADS ||--o{ DOCUMENTS : "has"
    LEADS ||--o{ COMMENTS : "has"
    LEADS ||--o{ ACTIVITIES : "generates"
    LEADS ||--o{ NOTIFICATIONS : "triggers"

    ROLES {
        uuid id PK
        enum name "ADMIN | INSIDE_SALES | SALES | DELIVERY | MANAGEMENT"
        text description
    }
    PERMISSIONS {
        uuid id PK
        varchar key UK "e.g. leads:edit_any"
        text description
    }
    ROLE_PERMISSIONS {
        uuid role_id FK
        uuid permission_id FK
    }
    USERS {
        uuid id PK
        varchar email UK
        text password_hash
        varchar first_name
        varchar last_name
        uuid role_id FK
        boolean is_active
        boolean must_change_password
        timestamp last_login_at
        uuid created_by_id FK
    }
    REFRESH_TOKENS {
        uuid id PK
        uuid user_id FK
        varchar token_hash UK
        timestamp expires_at
        timestamp revoked_at
    }
    COMPANIES {
        uuid id PK
        varchar name
        varchar domain
        varchar industry
        varchar country
        numeric annual_revenue
    }
    CONTACTS {
        uuid id PK
        uuid company_id FK
        varchar first_name
        varchar last_name
        varchar email
        varchar phone
        boolean is_primary
    }
    CAMPAIGNS {
        uuid id PK
        varchar name
        varchar code UK
        varchar status
        timestamp start_date
        timestamp end_date
        numeric budget
    }
    LEADS {
        uuid id PK
        integer lead_number UK "identity, human-readable INN-100001"
        uuid company_id FK
        uuid contact_id FK
        uuid campaign_id FK
        enum source
        enum status
        enum priority
        numeric deal_value
        integer probability
        timestamp expected_close_date
        uuid assigned_to_id FK
        uuid current_owner_id FK
        uuid created_by_id FK
        boolean is_active "soft delete"
    }
    MEETINGS {
        uuid id PK
        uuid lead_id FK
        varchar title
        enum type
        enum status
        timestamp scheduled_at
        integer duration_mins
        text mom
    }
    TASKS {
        uuid id PK
        uuid lead_id FK
        varchar title
        enum status
        enum priority
        timestamp due_date
        uuid assigned_to_id FK
    }
    DOCUMENTS {
        uuid id PK
        uuid lead_id FK
        uuid company_id FK
        varchar original_name
        varchar mime_type
        integer size_bytes
        enum document_type
        uuid uploaded_by_id FK
    }
    COMMENTS {
        uuid id PK
        uuid lead_id FK
        uuid user_id FK
        text body
    }
    ACTIVITIES {
        uuid id PK
        enum type
        text description
        jsonb metadata
        uuid lead_id FK
        uuid company_id FK
        uuid contact_id FK
        uuid user_id FK
    }
    NOTIFICATIONS {
        uuid id PK
        uuid user_id FK
        enum type
        varchar title
        boolean is_read
        uuid lead_id FK
    }
    AUDIT_LOGS {
        uuid id PK
        uuid user_id FK
        enum action
        varchar entity_type
        varchar entity_id
        jsonb old_values
        jsonb new_values
        varchar ip_address
    }
```

## Notable design decisions

- **`leads.lead_number`** is a Postgres `GENERATED ALWAYS AS IDENTITY` integer,
  formatted as a display ID (`INN-100001`) in the API layer — human-friendly,
  monotonic, and collision-free without an extra sequence table.
- **Soft delete on leads** (`is_active`) instead of hard delete, so the audit
  trail and historical reporting stay intact after a lead is "deleted" from the UI.
- **`assigned_to` vs `current_owner`** are modeled as two separate FKs to `users`
  on `leads`, matching the real workflow: Inside Sales owns qualification and
  routing (`assigned_to`), while Sales/Delivery drives the deal to close
  (`current_owner`). Both are optional and independently reassignable.
- **`activities`** is a single polymorphic timeline table (nullable FKs to
  lead/company/contact) so one query can answer "everything that happened here"
  for any entity, and a global feed is just `WHERE lead_id IS NOT NULL ORDER BY
  created_at DESC LIMIT 50`.
- **RBAC is data-driven**, not hardcoded: `roles` ← `role_permissions` →
  `permissions` means granting a role a new capability is a data change, not a
  code change. The seed script wires up the five default roles against a fixed
  `PERMISSIONS` registry shared (by convention) between backend and frontend.
