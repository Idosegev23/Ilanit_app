ALTER TABLE "message_log" ADD COLUMN "direction" text DEFAULT 'out' NOT NULL;--> statement-breakpoint
CREATE INDEX "message_log_contact_idx" ON "message_log" USING btree ("to_phone","created_at");