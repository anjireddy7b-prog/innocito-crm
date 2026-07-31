ALTER TABLE "leads" ADD COLUMN "created_by_sdr_id" uuid;--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_created_by_sdr_id_users_id_fk" FOREIGN KEY ("created_by_sdr_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "leads_created_by_sdr_idx" ON "leads" USING btree ("created_by_sdr_id");