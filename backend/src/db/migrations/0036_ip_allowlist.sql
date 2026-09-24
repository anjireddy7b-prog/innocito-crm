CREATE TABLE "ip_allowlist_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"cidr" varchar(64) NOT NULL,
	"label" varchar(150),
	"created_by_id" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ip_allowlist_entries" ADD CONSTRAINT "ip_allowlist_entries_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ip_allowlist_entries" ADD CONSTRAINT "ip_allowlist_entries_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ip_allowlist_entries_org_idx" ON "ip_allowlist_entries" USING btree ("organization_id");