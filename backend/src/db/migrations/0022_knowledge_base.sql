CREATE TYPE "public"."knowledge_article_status" AS ENUM('DRAFT', 'PUBLISHED');--> statement-breakpoint
CREATE TABLE "knowledge_articles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"title" varchar(255) NOT NULL,
	"category" varchar(150),
	"tags" text[] DEFAULT '{}'::text[] NOT NULL,
	"content" text NOT NULL,
	"status" "knowledge_article_status" DEFAULT 'DRAFT' NOT NULL,
	"created_by_id" uuid,
	"published_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "knowledge_articles" ADD CONSTRAINT "knowledge_articles_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_articles" ADD CONSTRAINT "knowledge_articles_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "knowledge_articles_org_idx" ON "knowledge_articles" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "knowledge_articles_org_status_idx" ON "knowledge_articles" USING btree ("organization_id","status");--> statement-breakpoint
CREATE INDEX "knowledge_articles_org_category_idx" ON "knowledge_articles" USING btree ("organization_id","category");