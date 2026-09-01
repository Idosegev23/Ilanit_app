ALTER TABLE "action_tokens" ALTER COLUMN "lesson_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "action_tokens" ADD COLUMN "group_billing_id" uuid;--> statement-breakpoint
ALTER TABLE "action_tokens" ADD CONSTRAINT "action_tokens_group_billing_id_group_billing_id_fk" FOREIGN KEY ("group_billing_id") REFERENCES "public"."group_billing"("id") ON DELETE cascade ON UPDATE no action;