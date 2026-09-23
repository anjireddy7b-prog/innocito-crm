CREATE TYPE "public"."calendar_sync_status" AS ENUM('NOT_CONNECTED', 'SYNCED', 'FAILED');--> statement-breakpoint
ALTER TABLE "meetings" ADD COLUMN "external_calendar_provider" "oauth_provider";--> statement-breakpoint
ALTER TABLE "meetings" ADD COLUMN "external_event_id" varchar(255);--> statement-breakpoint
ALTER TABLE "meetings" ADD COLUMN "calendar_sync_status" "calendar_sync_status" DEFAULT 'NOT_CONNECTED' NOT NULL;--> statement-breakpoint
ALTER TABLE "meetings" ADD COLUMN "calendar_sync_error" text;