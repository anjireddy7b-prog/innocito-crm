CREATE TYPE "public"."custom_field_type" AS ENUM('TEXT', 'TEXTAREA', 'NUMBER', 'DATE', 'BOOLEAN', 'SELECT', 'MULTI_SELECT');--> statement-breakpoint
CREATE TABLE "custom_field_definitions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"entity_type" varchar(50) DEFAULT 'LEAD' NOT NULL,
	"key" varchar(100) NOT NULL,
	"label" varchar(200) NOT NULL,
	"field_type" "custom_field_type" NOT NULL,
	"options" jsonb,
	"required" boolean DEFAULT false NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pipeline_stages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"key" varchar(100) NOT NULL,
	"label" varchar(150) NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_won" boolean DEFAULT false NOT NULL,
	"is_lost" boolean DEFAULT false NOT NULL,
	"is_terminal" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "custom_fields" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "custom_field_definitions" ADD CONSTRAINT "custom_field_definitions_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pipeline_stages" ADD CONSTRAINT "pipeline_stages_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "custom_field_definitions_org_idx" ON "custom_field_definitions" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "custom_field_definitions_org_entity_key_unique" ON "custom_field_definitions" USING btree ("organization_id","entity_type","key");--> statement-breakpoint
CREATE INDEX "pipeline_stages_org_idx" ON "pipeline_stages" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "pipeline_stages_org_key_unique" ON "pipeline_stages" USING btree ("organization_id","key");