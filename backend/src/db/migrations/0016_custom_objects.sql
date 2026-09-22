CREATE TABLE "custom_object_definitions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"key" varchar(100) NOT NULL,
	"singular_label" varchar(150) NOT NULL,
	"plural_label" varchar(150) NOT NULL,
	"description" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "custom_object_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"object_definition_id" uuid NOT NULL,
	"data" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_by_id" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "custom_object_definitions" ADD CONSTRAINT "custom_object_definitions_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "custom_object_records" ADD CONSTRAINT "custom_object_records_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "custom_object_records" ADD CONSTRAINT "custom_object_records_object_definition_id_custom_object_definitions_id_fk" FOREIGN KEY ("object_definition_id") REFERENCES "public"."custom_object_definitions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "custom_object_records" ADD CONSTRAINT "custom_object_records_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "custom_object_definitions_org_idx" ON "custom_object_definitions" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "custom_object_definitions_org_key_unique" ON "custom_object_definitions" USING btree ("organization_id","key");--> statement-breakpoint
CREATE INDEX "custom_object_records_org_idx" ON "custom_object_records" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "custom_object_records_definition_idx" ON "custom_object_records" USING btree ("object_definition_id");