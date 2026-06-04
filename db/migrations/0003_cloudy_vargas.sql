CREATE TABLE "open_weeks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"week_start" date NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "open_weeks_week_start_unique" UNIQUE("week_start")
);
--> statement-breakpoint
ALTER TABLE "students" ADD COLUMN "guardian_name" text;--> statement-breakpoint
ALTER TABLE "students" ADD COLUMN "guardian_phone" text;--> statement-breakpoint
ALTER TABLE "students" ADD COLUMN "receipt_label" text;