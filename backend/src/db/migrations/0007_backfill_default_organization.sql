-- Phase 1 / Migration Plan step 1 (data migration, no destructive changes):
-- Seed exactly one "default" organization representing the existing business, then backfill
-- every row created before multi-tenancy existed onto it. Idempotent — safe to re-run:
-- the INSERT no-ops on conflict, and every UPDATE only touches rows still missing an org.

INSERT INTO "organizations" ("name", "slug", "is_active")
VALUES ('SDR ReachOut', 'default', true)
ON CONFLICT ("slug") DO NOTHING;
--> statement-breakpoint

UPDATE "users" SET "organization_id" = (SELECT "id" FROM "organizations" WHERE "slug" = 'default')
WHERE "organization_id" IS NULL;
--> statement-breakpoint

UPDATE "companies" SET "organization_id" = (SELECT "id" FROM "organizations" WHERE "slug" = 'default')
WHERE "organization_id" IS NULL;
--> statement-breakpoint

UPDATE "contacts" SET "organization_id" = (SELECT "id" FROM "organizations" WHERE "slug" = 'default')
WHERE "organization_id" IS NULL;
--> statement-breakpoint

UPDATE "campaigns" SET "organization_id" = (SELECT "id" FROM "organizations" WHERE "slug" = 'default')
WHERE "organization_id" IS NULL;
--> statement-breakpoint

UPDATE "leads" SET "organization_id" = (SELECT "id" FROM "organizations" WHERE "slug" = 'default')
WHERE "organization_id" IS NULL;
--> statement-breakpoint

UPDATE "meetings" SET "organization_id" = (SELECT "id" FROM "organizations" WHERE "slug" = 'default')
WHERE "organization_id" IS NULL;
--> statement-breakpoint

UPDATE "tasks" SET "organization_id" = (SELECT "id" FROM "organizations" WHERE "slug" = 'default')
WHERE "organization_id" IS NULL;
--> statement-breakpoint

UPDATE "documents" SET "organization_id" = (SELECT "id" FROM "organizations" WHERE "slug" = 'default')
WHERE "organization_id" IS NULL;
--> statement-breakpoint

UPDATE "comments" SET "organization_id" = (SELECT "id" FROM "organizations" WHERE "slug" = 'default')
WHERE "organization_id" IS NULL;
--> statement-breakpoint

UPDATE "activities" SET "organization_id" = (SELECT "id" FROM "organizations" WHERE "slug" = 'default')
WHERE "organization_id" IS NULL;
--> statement-breakpoint

UPDATE "notifications" SET "organization_id" = (SELECT "id" FROM "organizations" WHERE "slug" = 'default')
WHERE "organization_id" IS NULL;
--> statement-breakpoint

UPDATE "audit_logs" SET "organization_id" = (SELECT "id" FROM "organizations" WHERE "slug" = 'default')
WHERE "organization_id" IS NULL;
