-- Phase 2: narrow campaigns.code from a platform-wide unique constraint to unique-per-organization.
-- Phase 1 deliberately kept this global (documented in the Architecture Report, Section L) since
-- no second real organization existed yet to collide with the first. Self-service org signup
-- (Phase 2) means that's no longer true, so this closes the deferral before it can bite.
--
-- Safe on live data: dropping a UNIQUE constraint never fails, and the new composite unique index
-- can only fail to create if two rows in the SAME organization already share a non-null code —
-- impossible today since the column has only ever been globally unique (a strictly stronger
-- condition than per-organization uniqueness), so any existing data already satisfies this.
ALTER TABLE "campaigns" DROP CONSTRAINT "campaigns_code_unique";--> statement-breakpoint
CREATE UNIQUE INDEX "campaigns_org_code_unique" ON "campaigns" USING btree ("organization_id","code");