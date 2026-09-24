ALTER TYPE "public"."audit_action" ADD VALUE 'SESSION_REVOKED';--> statement-breakpoint
ALTER TYPE "public"."audit_action" ADD VALUE 'ACCOUNT_LOCKED';--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "failed_login_attempts" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "locked_until" timestamp;