-- Phase 3, step 1 of 3 (see 0012, 0013, and the Architecture Report): begin migrating `roles`
-- from a single global, hardcoded catalog — today exactly 5 rows, shared by literally every
-- organization on the platform — to tenant-scoped, admin-editable data.
--
-- The old constraint assumed one globally-unique row per role name across the whole platform.
-- It has to go before step 2's data backfill can give a second organization a role named e.g.
-- "ADMIN" without conflicting; its correct per-organization replacement lands in 0013, once
-- every role row actually has an organization_id to be unique within.
ALTER TABLE "roles" DROP CONSTRAINT "roles_name_unique";--> statement-breakpoint
-- organization_id is added NULLABLE so the rest of this step stays purely additive and
-- zero-risk: no existing row is touched until 0012's backfill runs.
ALTER TABLE "roles" ADD COLUMN "organization_id" uuid;--> statement-breakpoint
ALTER TABLE "roles" ADD CONSTRAINT "roles_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "roles_org_idx" ON "roles" USING btree ("organization_id");