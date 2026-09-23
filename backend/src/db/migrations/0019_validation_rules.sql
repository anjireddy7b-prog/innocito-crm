CREATE TABLE "validation_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"entity_type" varchar(50) DEFAULT 'LEAD' NOT NULL,
	"name" varchar(150) NOT NULL,
	"description" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"when_field" varchar(100) NOT NULL,
	"when_operator" varchar(20) NOT NULL,
	"when_value" varchar(255),
	"then_require_fields" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"error_message" varchar(500),
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "validation_rules" ADD CONSTRAINT "validation_rules_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "validation_rules_org_entity_idx" ON "validation_rules" USING btree ("organization_id","entity_type");--> statement-breakpoint
CREATE UNIQUE INDEX "validation_rules_org_entity_name_unique" ON "validation_rules" USING btree ("organization_id","entity_type","name");