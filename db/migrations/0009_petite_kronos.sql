CREATE TABLE "standby_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"student_id" uuid,
	"name" text NOT NULL,
	"phone" text NOT NULL,
	"email" text,
	"weekdays" text NOT NULL,
	"start_time" text NOT NULL,
	"end_time" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"fulfilled_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "standby_requests" ADD CONSTRAINT "standby_requests_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "standby_status_idx" ON "standby_requests" USING btree ("status");