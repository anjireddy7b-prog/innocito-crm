ALTER TABLE "leads" ADD COLUMN "ai_summary" text;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "ai_next_step" text;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "ai_score" integer;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "ai_insights_generated_at" timestamp;