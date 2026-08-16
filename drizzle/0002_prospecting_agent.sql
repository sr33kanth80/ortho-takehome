CREATE TABLE "business_profiles" (
	"company_id" text PRIMARY KEY NOT NULL,
	"business_name" text NOT NULL,
	"website" text,
	"offer" text NOT NULL,
	"value_proposition" text NOT NULL,
	"target_industries" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"target_locations" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"company_sizes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"buyer_roles" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"buying_signals" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"exclusions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"example_customers" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"notes" text,
	"updated_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "prospect_accounts" (
	"id" text PRIMARY KEY NOT NULL,
	"company_id" text NOT NULL,
	"mission_id" text NOT NULL,
	"name" text NOT NULL,
	"domain" text,
	"website" text,
	"industry" text,
	"location" text,
	"employee_count" integer,
	"description" text NOT NULL,
	"fit_score" integer NOT NULL,
	"signal_score" integer NOT NULL,
	"overall_score" integer NOT NULL,
	"status" text DEFAULT 'new' NOT NULL,
	"contact_status" text DEFAULT 'not_started' NOT NULL,
	"rationale" text NOT NULL,
	"why_now" text NOT NULL,
	"outreach_angle" text NOT NULL,
	"evidence" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"raw_data" jsonb,
	"rejection_reason" text,
	"reviewed_by" text,
	"reviewed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "prospect_contacts" (
	"id" text PRIMARY KEY NOT NULL,
	"company_id" text NOT NULL,
	"mission_id" text NOT NULL,
	"account_id" text NOT NULL,
	"full_name" text NOT NULL,
	"title" text NOT NULL,
	"linkedin_url" text,
	"email" text,
	"phone" text,
	"email_status" text DEFAULT 'unknown' NOT NULL,
	"source" text NOT NULL,
	"confidence" integer DEFAULT 0 NOT NULL,
	"rationale" text NOT NULL,
	"preferred" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "prospect_feedback" (
	"id" text PRIMARY KEY NOT NULL,
	"company_id" text NOT NULL,
	"mission_id" text NOT NULL,
	"account_id" text NOT NULL,
	"user_id" text NOT NULL,
	"decision" text NOT NULL,
	"reason" text,
	"snapshot" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "prospect_mission_runs" (
	"id" text PRIMARY KEY NOT NULL,
	"company_id" text NOT NULL,
	"mission_id" text NOT NULL,
	"user_id" text NOT NULL,
	"status" text NOT NULL,
	"stage" text DEFAULT 'research' NOT NULL,
	"summary" text,
	"error_message" text,
	"cost_cents" integer DEFAULT 0 NOT NULL,
	"charges" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"tool_trace" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "prospect_missions" (
	"id" text PRIMARY KEY NOT NULL,
	"company_id" text NOT NULL,
	"owner_user_id" text NOT NULL,
	"name" text NOT NULL,
	"brief" text NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"target_count" integer DEFAULT 25 NOT NULL,
	"max_spend_cents" integer DEFAULT 300 NOT NULL,
	"spent_cents" integer DEFAULT 0 NOT NULL,
	"strategy" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"last_summary" text,
	"last_error" text,
	"last_run_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "business_profiles" ADD CONSTRAINT "business_profiles_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "business_profiles" ADD CONSTRAINT "business_profiles_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prospect_accounts" ADD CONSTRAINT "prospect_accounts_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prospect_accounts" ADD CONSTRAINT "prospect_accounts_mission_id_prospect_missions_id_fk" FOREIGN KEY ("mission_id") REFERENCES "public"."prospect_missions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prospect_accounts" ADD CONSTRAINT "prospect_accounts_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prospect_contacts" ADD CONSTRAINT "prospect_contacts_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prospect_contacts" ADD CONSTRAINT "prospect_contacts_mission_id_prospect_missions_id_fk" FOREIGN KEY ("mission_id") REFERENCES "public"."prospect_missions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prospect_contacts" ADD CONSTRAINT "prospect_contacts_account_id_prospect_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."prospect_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prospect_feedback" ADD CONSTRAINT "prospect_feedback_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prospect_feedback" ADD CONSTRAINT "prospect_feedback_mission_id_prospect_missions_id_fk" FOREIGN KEY ("mission_id") REFERENCES "public"."prospect_missions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prospect_feedback" ADD CONSTRAINT "prospect_feedback_account_id_prospect_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."prospect_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prospect_feedback" ADD CONSTRAINT "prospect_feedback_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prospect_mission_runs" ADD CONSTRAINT "prospect_mission_runs_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prospect_mission_runs" ADD CONSTRAINT "prospect_mission_runs_mission_id_prospect_missions_id_fk" FOREIGN KEY ("mission_id") REFERENCES "public"."prospect_missions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prospect_mission_runs" ADD CONSTRAINT "prospect_mission_runs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prospect_missions" ADD CONSTRAINT "prospect_missions_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prospect_missions" ADD CONSTRAINT "prospect_missions_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "prospect_accounts_mission_domain_unique" ON "prospect_accounts" USING btree ("mission_id","domain");--> statement-breakpoint
CREATE INDEX "prospect_accounts_mission_score_idx" ON "prospect_accounts" USING btree ("mission_id","overall_score");--> statement-breakpoint
CREATE INDEX "prospect_accounts_company_status_idx" ON "prospect_accounts" USING btree ("company_id","status");--> statement-breakpoint
CREATE INDEX "prospect_contacts_account_idx" ON "prospect_contacts" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "prospect_contacts_mission_idx" ON "prospect_contacts" USING btree ("mission_id");--> statement-breakpoint
CREATE INDEX "prospect_feedback_company_created_idx" ON "prospect_feedback" USING btree ("company_id","created_at");--> statement-breakpoint
CREATE INDEX "prospect_mission_runs_mission_started_idx" ON "prospect_mission_runs" USING btree ("mission_id","started_at");--> statement-breakpoint
CREATE INDEX "prospect_missions_company_updated_idx" ON "prospect_missions" USING btree ("company_id","updated_at");--> statement-breakpoint
CREATE INDEX "prospect_missions_owner_idx" ON "prospect_missions" USING btree ("owner_user_id");