ALTER TABLE "conversations" ADD COLUMN IF NOT EXISTS "company_id" text;--> statement-breakpoint
UPDATE "conversations" AS "conversation"
SET "company_id" = "membership"."company_id"
FROM "company_memberships" AS "membership"
WHERE "conversation"."company_id" IS NULL
	AND "membership"."user_id" = "conversation"."user_id"
	AND "membership"."status" = 'active';--> statement-breakpoint
ALTER TABLE "conversations" ALTER COLUMN "company_id" SET NOT NULL;--> statement-breakpoint
DO $$ BEGIN
	IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'conversations_company_id_companies_id_fk') THEN
		ALTER TABLE "conversations" ADD CONSTRAINT "conversations_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE restrict ON UPDATE no action;
	END IF;
END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "conversations_company_updated_idx" ON "conversations" USING btree ("company_id","updated_at");
