CREATE TABLE "saved_views" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"entity_type" varchar(50) DEFAULT 'LEAD' NOT NULL,
	"name" varchar(150) NOT NULL,
	"is_shared" boolean DEFAULT false NOT NULL,
	"created_by_id" uuid,
	"filters" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "saved_views" ADD CONSTRAINT "saved_views_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saved_views" ADD CONSTRAINT "saved_views_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "saved_views_org_entity_idx" ON "saved_views" USING btree ("organization_id","entity_type");--> statement-breakpoint
CREATE UNIQUE INDEX "saved_views_org_entity_creator_name_unique" ON "saved_views" USING btree ("organization_id","entity_type","created_by_id","name");