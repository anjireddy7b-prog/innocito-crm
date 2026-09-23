CREATE TABLE "custom_report_definitions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"entity_type" varchar(50) DEFAULT 'LEAD' NOT NULL,
	"name" varchar(150) NOT NULL,
	"description" text,
	"group_by" varchar(50) NOT NULL,
	"metric" varchar(50) DEFAULT 'COUNT' NOT NULL,
	"chart_type" varchar(20) DEFAULT 'BAR' NOT NULL,
	"filters" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"is_shared" boolean DEFAULT false NOT NULL,
	"created_by_id" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "custom_report_definitions" ADD CONSTRAINT "custom_report_definitions_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "custom_report_definitions" ADD CONSTRAINT "custom_report_definitions_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "custom_report_definitions_org_entity_idx" ON "custom_report_definitions" USING btree ("organization_id","entity_type");--> statement-breakpoint
CREATE UNIQUE INDEX "custom_report_definitions_org_entity_creator_name_unique" ON "custom_report_definitions" USING btree ("organization_id","entity_type","created_by_id","name");