-- Phase 3, step 3 of 3 (see 0011, 0012, and the Architecture Report). Safe now: 0012's backfill
-- guaranteed every role row has an organization_id, so NOT NULL cannot fail, and the per-org
-- unique index can only fail to create if two roles in the SAME organization already share a
-- name — impossible today since 0012 gave each org exactly one copy of each of the 5 names.
ALTER TABLE "roles" ALTER COLUMN "organization_id" SET NOT NULL;--> statement-breakpoint
-- Enum -> varchar needs an explicit cast; every existing value is one of the enum's own labels,
-- which is always valid text, so this cannot fail on existing data.
ALTER TABLE "roles" ALTER COLUMN "name" SET DATA TYPE varchar(100) USING "name"::text;--> statement-breakpoint
CREATE UNIQUE INDEX "roles_org_name_unique" ON "roles" USING btree ("organization_id","name");--> statement-breakpoint
-- Nothing references this type anymore now that `name` is varchar — drop it rather than leave an
-- orphaned type sitting in the schema.
DROP TYPE "public"."role_name";