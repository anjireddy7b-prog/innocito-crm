-- Phase 3, step 2 of 3 (data migration, no destructive schema changes — see 0011, 0013, and the
-- Architecture Report). Gives every existing organization (the original seeded org, and any
-- organization created since via self-service signup — see organizations.service.ts's signup())
-- its own independent copy of the current 5 roles, with identical grants to what they had
-- platform-wide today, so no existing user's access changes on migration day.
--
-- This also closes a latent aliasing bug: because roles were global, every organization's
-- "ADMIN" user has, until this migration, pointed at the exact same `roles` row — editing one
-- organization's role permissions would have silently changed every other organization's too
-- (including the org created by Phase 2's self-service signup, which reused this same global row
-- directly). This backfill is what makes that impossible from here on: each organization gets
-- its own rows, and Phase 3's application code creates a fresh set for every new signup too.
--
-- Idempotent — safe to re-run: every statement below is scoped to `organization_id IS NULL`
-- source rows, and once step 3 (0013) makes that column NOT NULL, none remain to re-process.

-- 1. Copy each of the 5 legacy roles onto every existing organization.
INSERT INTO "roles" ("id", "organization_id", "name", "description", "created_at", "updated_at")
SELECT gen_random_uuid(), o."id", r."name", r."description", now(), now()
FROM "organizations" o
CROSS JOIN "roles" r
WHERE r."organization_id" IS NULL;
--> statement-breakpoint

-- 2. Copy each legacy role's permission grants onto every organization's new copy of that role.
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT new_r."id", rp."permission_id"
FROM "role_permissions" rp
JOIN "roles" old_r ON old_r."id" = rp."role_id" AND old_r."organization_id" IS NULL
JOIN "roles" new_r ON new_r."organization_id" IS NOT NULL AND new_r."name" = old_r."name";
--> statement-breakpoint

-- 3. Repoint every user from the old global role row to their own organization's new copy.
-- (Comma-join rather than an explicit JOIN...ON: Postgres's UPDATE...FROM does not allow a
-- JOIN's ON clause to reference the target table, so both correlations to "u" move to WHERE.)
UPDATE "users" u
SET "role_id" = new_r."id"
FROM "roles" old_r, "roles" new_r
WHERE old_r."id" = u."role_id"
  AND old_r."organization_id" IS NULL
  AND new_r."organization_id" = u."organization_id"
  AND new_r."name" = old_r."name";
--> statement-breakpoint

-- 4. The old global template rows are now unreferenced (every user was repointed above) — remove
-- them so there is exactly one authoritative set of role definitions per organization, not a
-- stray platform-wide set sitting alongside them.
DELETE FROM "role_permissions" WHERE "role_id" IN (SELECT "id" FROM "roles" WHERE "organization_id" IS NULL);
--> statement-breakpoint

DELETE FROM "roles" WHERE "organization_id" IS NULL;
