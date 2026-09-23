CREATE TABLE "dashboard_widgets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"report_definition_id" uuid NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "dashboard_widgets" ADD CONSTRAINT "dashboard_widgets_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dashboard_widgets" ADD CONSTRAINT "dashboard_widgets_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dashboard_widgets" ADD CONSTRAINT "dashboard_widgets_report_definition_id_custom_report_definitions_id_fk" FOREIGN KEY ("report_definition_id") REFERENCES "public"."custom_report_definitions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "dashboard_widgets_org_user_idx" ON "dashboard_widgets" USING btree ("organization_id","user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "dashboard_widgets_user_report_unique" ON "dashboard_widgets" USING btree ("user_id","report_definition_id");