ALTER TABLE "payments" ADD COLUMN "intent" text;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "intent_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "confirm_asked_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "bit_link" text;