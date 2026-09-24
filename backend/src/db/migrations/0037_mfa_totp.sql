ALTER TYPE "public"."audit_action" ADD VALUE 'MFA_ENABLED';--> statement-breakpoint
ALTER TYPE "public"."audit_action" ADD VALUE 'MFA_DISABLED';--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "mfa_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "mfa_secret_enc" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "mfa_backup_codes" jsonb;