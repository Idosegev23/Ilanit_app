ALTER TABLE "group_billing" ADD COLUMN "intent" text;--> statement-breakpoint
ALTER TABLE "group_billing" ADD COLUMN "intent_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "group_billing" ADD COLUMN "confirm_asked_at" timestamp with time zone;