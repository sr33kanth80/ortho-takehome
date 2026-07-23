CREATE TABLE IF NOT EXISTS "companies" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "company_dynamic_settings" (
	"company_id" text PRIMARY KEY NOT NULL,
	"default_policy" text DEFAULT 'deny' NOT NULL,
	"max_cost_per_call_cents" integer DEFAULT 25 NOT NULL,
	"daily_user_limit_cents" integer DEFAULT 200 NOT NULL,
	"monthly_company_limit_cents" integer DEFAULT 10000 NOT NULL,
	"updated_by" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "company_memberships" (
	"id" text PRIMARY KEY NOT NULL,
	"company_id" text NOT NULL,
	"user_id" text NOT NULL,
	"role" text DEFAULT 'employee' NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"dynamic_execution_enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "company_memberships" ADD COLUMN IF NOT EXISTS "dynamic_execution_enabled" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "company_memberships" ADD COLUMN IF NOT EXISTS "updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "dynamic_api_policies" (
	"id" text PRIMARY KEY NOT NULL,
	"company_id" text NOT NULL,
	"api" text NOT NULL,
	"path" text NOT NULL,
	"method" text NOT NULL,
	"effect" text NOT NULL,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "dynamic_api_executions" (
	"id" text PRIMARY KEY NOT NULL,
	"company_id" text NOT NULL,
	"user_id" text NOT NULL,
	"conversation_id" text,
	"tool_call_id" text NOT NULL,
	"api" text NOT NULL,
	"path" text NOT NULL,
	"method" text NOT NULL,
	"status" text NOT NULL,
	"policy_decision" text NOT NULL,
	"estimated_cost_cents" integer DEFAULT 0 NOT NULL,
	"actual_cost_cents" integer,
	"request_preview" jsonb,
	"response_preview" jsonb,
	"error_code" text,
	"error_message" text,
	"upstream_request_id" text,
	"duration_ms" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "governance_audit_events" (
	"id" text PRIMARY KEY NOT NULL,
	"company_id" text NOT NULL,
	"actor_user_id" text NOT NULL,
	"action" text NOT NULL,
	"target_type" text NOT NULL,
	"target_id" text NOT NULL,
	"before" jsonb,
	"after" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'company_dynamic_settings_company_id_companies_id_fk') THEN ALTER TABLE "company_dynamic_settings" ADD CONSTRAINT "company_dynamic_settings_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'company_dynamic_settings_updated_by_users_id_fk') THEN ALTER TABLE "company_dynamic_settings" ADD CONSTRAINT "company_dynamic_settings_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'company_memberships_company_id_companies_id_fk') THEN ALTER TABLE "company_memberships" ADD CONSTRAINT "company_memberships_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'company_memberships_user_id_users_id_fk') THEN ALTER TABLE "company_memberships" ADD CONSTRAINT "company_memberships_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'dynamic_api_policies_company_id_companies_id_fk') THEN ALTER TABLE "dynamic_api_policies" ADD CONSTRAINT "dynamic_api_policies_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'dynamic_api_policies_created_by_users_id_fk') THEN ALTER TABLE "dynamic_api_policies" ADD CONSTRAINT "dynamic_api_policies_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'dynamic_api_executions_company_id_companies_id_fk') THEN ALTER TABLE "dynamic_api_executions" ADD CONSTRAINT "dynamic_api_executions_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'dynamic_api_executions_user_id_users_id_fk') THEN ALTER TABLE "dynamic_api_executions" ADD CONSTRAINT "dynamic_api_executions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'governance_audit_events_company_id_companies_id_fk') THEN ALTER TABLE "governance_audit_events" ADD CONSTRAINT "governance_audit_events_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'governance_audit_events_actor_user_id_users_id_fk') THEN ALTER TABLE "governance_audit_events" ADD CONSTRAINT "governance_audit_events_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE restrict; END IF;
END $$;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "company_memberships_user_unique" ON "company_memberships" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "company_memberships_company_idx" ON "company_memberships" USING btree ("company_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "dynamic_api_policies_endpoint_unique" ON "dynamic_api_policies" USING btree ("company_id","api","path","method");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "dynamic_api_policies_company_idx" ON "dynamic_api_policies" USING btree ("company_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "dynamic_api_executions_tool_call_unique" ON "dynamic_api_executions" USING btree ("company_id","tool_call_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "dynamic_api_executions_company_created_idx" ON "dynamic_api_executions" USING btree ("company_id","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "dynamic_api_executions_user_created_idx" ON "dynamic_api_executions" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "dynamic_api_executions_status_idx" ON "dynamic_api_executions" USING btree ("company_id","status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "governance_audit_company_created_idx" ON "governance_audit_events" USING btree ("company_id","created_at");--> statement-breakpoint
INSERT INTO "companies" ("id", "name", "status") SELECT 'meridian-default', 'Meridian Company', 'active' WHERE NOT EXISTS (SELECT 1 FROM "companies");--> statement-breakpoint
INSERT INTO "company_dynamic_settings" ("company_id") SELECT "id" FROM "companies" WHERE "status" = 'active' ON CONFLICT DO NOTHING;--> statement-breakpoint
INSERT INTO "company_memberships" ("id", "company_id", "user_id", "role", "status")
SELECT 'enterprise-' || u."id", c."id", u."id",
  CASE WHEN NOT EXISTS (SELECT 1 FROM "company_memberships" m2 WHERE m2."company_id" = c."id" AND m2."role" IN ('admin', 'manager')) THEN 'manager' ELSE 'employee' END,
  'active'
FROM "users" u
CROSS JOIN LATERAL (SELECT "id" FROM "companies" WHERE "status" = 'active' ORDER BY "created_at", "id" LIMIT 1) c
WHERE NOT EXISTS (SELECT 1 FROM "company_memberships" m WHERE m."user_id" = u."id")
ON CONFLICT ("user_id") DO NOTHING;--> statement-breakpoint
INSERT INTO "governance_audit_events" ("id", "company_id", "actor_user_id", "action", "target_type", "target_id", "after")
SELECT 'bootstrap-' || m."user_id", m."company_id", m."user_id", 'company.bootstrap', 'company', m."company_id", '{"source":"migration"}'::jsonb
FROM "company_memberships" m WHERE m."role" IN ('admin', 'manager')
ON CONFLICT DO NOTHING;
