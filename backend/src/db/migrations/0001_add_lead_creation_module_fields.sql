ALTER TABLE "leads" ADD COLUMN "sdr_id" uuid;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "lead_received_date" timestamp DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "meetings" ADD COLUMN "time_zone" varchar(50);--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_sdr_id_users_id_fk" FOREIGN KEY ("sdr_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "leads_sdr_idx" ON "leads" USING btree ("sdr_id");--> statement-breakpoint
CREATE INDEX "leads_received_date_idx" ON "leads" USING btree ("lead_received_date");