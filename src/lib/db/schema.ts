import { boolean, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

/**
 * Data model.
 *
 * `messages.parts` stores the AI SDK UIMessage `parts` array as JSONB —
 * text chunks AND tool invocations (inputs, outputs, per-call cost) in their
 * original order. This keeps replay exact (the UI re-renders history
 * identically to the live stream) without a brittle relational explosion of
 * tool-call tables. Costs are also denormalised onto the message row for
 * cheap aggregation.
 */

export const users = pgTable(
  "users",
  {
    id: text("id").primaryKey(),
    email: text("email").notNull(),
    passwordHash: text("password_hash").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("users_email_unique").on(t.email)],
);

export const companies = pgTable("companies", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  status: text("status", { enum: ["active", "suspended"] }).notNull().default("active"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const companyMemberships = pgTable(
  "company_memberships",
  {
    id: text("id").primaryKey(),
    companyId: text("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    role: text("role", { enum: ["manager", "employee", "admin", "member"] }).notNull().default("employee"),
    status: text("status", { enum: ["active", "suspended"] }).notNull().default("active"),
    dynamicExecutionEnabled: boolean("dynamic_execution_enabled").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("company_memberships_user_unique").on(t.userId),
    index("company_memberships_company_idx").on(t.companyId),
  ],
);

export const companyDynamicSettings = pgTable("company_dynamic_settings", {
  companyId: text("company_id").primaryKey().references(() => companies.id, { onDelete: "cascade" }),
  /** `deny` is the production-safe allowlist mode; `allow` preserves an explicit open catalog policy. */
  defaultPolicy: text("default_policy", { enum: ["allow", "deny"] }).notNull().default("deny"),
  maxCostPerCallCents: integer("max_cost_per_call_cents").notNull().default(25),
  dailyUserLimitCents: integer("daily_user_limit_cents").notNull().default(200),
  monthlyCompanyLimitCents: integer("monthly_company_limit_cents").notNull().default(10000),
  updatedBy: text("updated_by").references(() => users.id, { onDelete: "set null" }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const dynamicApiPolicies = pgTable(
  "dynamic_api_policies",
  {
    id: text("id").primaryKey(),
    companyId: text("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
    api: text("api").notNull(),
    path: text("path").notNull(),
    method: text("method").notNull(),
    effect: text("effect", { enum: ["allow", "deny"] }).notNull(),
    createdBy: text("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("dynamic_api_policies_endpoint_unique").on(t.companyId, t.api, t.path, t.method),
    index("dynamic_api_policies_company_idx").on(t.companyId),
  ],
);

export const dynamicExecutions = pgTable(
  "dynamic_api_executions",
  {
    id: text("id").primaryKey(),
    companyId: text("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "restrict" }),
    conversationId: text("conversation_id"),
    toolCallId: text("tool_call_id").notNull(),
    api: text("api").notNull(),
    path: text("path").notNull(),
    method: text("method").notNull(),
    status: text("status", { enum: ["pending", "succeeded", "failed", "blocked", "indeterminate"] }).notNull(),
    policyDecision: text("policy_decision").notNull(),
    estimatedCostCents: integer("estimated_cost_cents").notNull().default(0),
    actualCostCents: integer("actual_cost_cents"),
    requestPreview: jsonb("request_preview"),
    responsePreview: jsonb("response_preview"),
    errorCode: text("error_code"),
    errorMessage: text("error_message"),
    upstreamRequestId: text("upstream_request_id"),
    durationMs: integer("duration_ms"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (t) => [
    uniqueIndex("dynamic_api_executions_tool_call_unique").on(t.companyId, t.toolCallId),
    index("dynamic_api_executions_company_created_idx").on(t.companyId, t.createdAt),
    index("dynamic_api_executions_user_created_idx").on(t.userId, t.createdAt),
    index("dynamic_api_executions_status_idx").on(t.companyId, t.status),
  ],
);

export const governanceAuditEvents = pgTable(
  "governance_audit_events",
  {
    id: text("id").primaryKey(),
    companyId: text("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
    actorUserId: text("actor_user_id").notNull().references(() => users.id, { onDelete: "restrict" }),
    action: text("action").notNull(),
    targetType: text("target_type").notNull(),
    targetId: text("target_id").notNull(),
    before: jsonb("before"),
    after: jsonb("after"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("governance_audit_company_created_idx").on(t.companyId, t.createdAt)],
);

export const sessions = pgTable(
  "sessions",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("sessions_token_hash_unique").on(t.tokenHash), index("sessions_user_idx").on(t.userId)],
);

export const conversations = pgTable(
  "conversations",
  {
    id: text("id").primaryKey(), // nanoid, generated by the app
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    title: text("title").notNull().default("New conversation"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("conversations_user_updated_idx").on(t.userId, t.updatedAt)],
);

export const messages = pgTable(
  "messages",
  {
    id: text("id").primaryKey(), // UIMessage id from the AI SDK
    conversationId: text("conversation_id")
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    role: text("role", { enum: ["user", "assistant", "system"] }).notNull(),
    parts: jsonb("parts").notNull(),
    /** Total Orthogonal spend attributed to this message, in cents. */
    costCents: integer("cost_cents").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("messages_conversation_idx").on(t.conversationId, t.createdAt)],
);

/**
 * Prospecting is deliberately relational rather than another blob inside chat.
 * A company owns one living business brief, many resumable research missions,
 * and reviewable account/contact records. Agent runs and human decisions stay
 * durable so a later run can resume without repeating paid work.
 */
export const businessProfiles = pgTable("business_profiles", {
  companyId: text("company_id").primaryKey().references(() => companies.id, { onDelete: "cascade" }),
  businessName: text("business_name").notNull(),
  website: text("website"),
  offer: text("offer").notNull(),
  valueProposition: text("value_proposition").notNull(),
  targetIndustries: jsonb("target_industries").$type<string[]>().notNull().default([]),
  targetLocations: jsonb("target_locations").$type<string[]>().notNull().default([]),
  companySizes: jsonb("company_sizes").$type<string[]>().notNull().default([]),
  buyerRoles: jsonb("buyer_roles").$type<string[]>().notNull().default([]),
  buyingSignals: jsonb("buying_signals").$type<string[]>().notNull().default([]),
  exclusions: jsonb("exclusions").$type<string[]>().notNull().default([]),
  exampleCustomers: jsonb("example_customers").$type<string[]>().notNull().default([]),
  notes: text("notes"),
  updatedBy: text("updated_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const prospectMissions = pgTable(
  "prospect_missions",
  {
    id: text("id").primaryKey(),
    companyId: text("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
    ownerUserId: text("owner_user_id").notNull().references(() => users.id, { onDelete: "restrict" }),
    name: text("name").notNull(),
    brief: text("brief").notNull(),
    status: text("status", { enum: ["draft", "running", "paused", "completed", "failed"] }).notNull().default("draft"),
    targetCount: integer("target_count").notNull().default(25),
    maxSpendCents: integer("max_spend_cents").notNull().default(300),
    spentCents: integer("spent_cents").notNull().default(0),
    strategy: jsonb("strategy").$type<string[]>().notNull().default([]),
    lastSummary: text("last_summary"),
    lastError: text("last_error"),
    lastRunAt: timestamp("last_run_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("prospect_missions_company_updated_idx").on(t.companyId, t.updatedAt),
    index("prospect_missions_owner_idx").on(t.ownerUserId),
  ],
);

export const prospectAccounts = pgTable(
  "prospect_accounts",
  {
    id: text("id").primaryKey(),
    companyId: text("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
    missionId: text("mission_id").notNull().references(() => prospectMissions.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    domain: text("domain"),
    website: text("website"),
    industry: text("industry"),
    location: text("location"),
    employeeCount: integer("employee_count"),
    description: text("description").notNull(),
    fitScore: integer("fit_score").notNull(),
    signalScore: integer("signal_score").notNull(),
    overallScore: integer("overall_score").notNull(),
    status: text("status", { enum: ["new", "approved", "rejected", "archived"] }).notNull().default("new"),
    contactStatus: text("contact_status", { enum: ["not_started", "searching", "found", "unavailable"] }).notNull().default("not_started"),
    rationale: text("rationale").notNull(),
    whyNow: text("why_now").notNull(),
    outreachAngle: text("outreach_angle").notNull(),
    evidence: jsonb("evidence").$type<Array<{ label: string; url?: string; observedAt?: string }>>().notNull().default([]),
    rawData: jsonb("raw_data"),
    rejectionReason: text("rejection_reason"),
    reviewedBy: text("reviewed_by").references(() => users.id, { onDelete: "set null" }),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("prospect_accounts_mission_domain_unique").on(t.missionId, t.domain),
    index("prospect_accounts_mission_score_idx").on(t.missionId, t.overallScore),
    index("prospect_accounts_company_status_idx").on(t.companyId, t.status),
  ],
);

export const prospectContacts = pgTable(
  "prospect_contacts",
  {
    id: text("id").primaryKey(),
    companyId: text("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
    missionId: text("mission_id").notNull().references(() => prospectMissions.id, { onDelete: "cascade" }),
    accountId: text("account_id").notNull().references(() => prospectAccounts.id, { onDelete: "cascade" }),
    fullName: text("full_name").notNull(),
    title: text("title").notNull(),
    linkedinUrl: text("linkedin_url"),
    email: text("email"),
    phone: text("phone"),
    emailStatus: text("email_status", { enum: ["unverified", "valid", "risky", "invalid", "unknown"] }).notNull().default("unknown"),
    source: text("source").notNull(),
    confidence: integer("confidence").notNull().default(0),
    rationale: text("rationale").notNull(),
    preferred: boolean("preferred").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("prospect_contacts_account_idx").on(t.accountId),
    index("prospect_contacts_mission_idx").on(t.missionId),
  ],
);

export const prospectMissionRuns = pgTable(
  "prospect_mission_runs",
  {
    id: text("id").primaryKey(),
    companyId: text("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
    missionId: text("mission_id").notNull().references(() => prospectMissions.id, { onDelete: "cascade" }),
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "restrict" }),
    status: text("status", { enum: ["running", "succeeded", "failed"] }).notNull(),
    stage: text("stage").notNull().default("research"),
    summary: text("summary"),
    errorMessage: text("error_message"),
    costCents: integer("cost_cents").notNull().default(0),
    charges: jsonb("charges").$type<Array<{ api: string; path: string; cents: number }>>().notNull().default([]),
    toolTrace: jsonb("tool_trace").$type<Array<{ toolName: string; state: string }>>().notNull().default([]),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (t) => [index("prospect_mission_runs_mission_started_idx").on(t.missionId, t.startedAt)],
);

export const prospectFeedback = pgTable(
  "prospect_feedback",
  {
    id: text("id").primaryKey(),
    companyId: text("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
    missionId: text("mission_id").notNull().references(() => prospectMissions.id, { onDelete: "cascade" }),
    accountId: text("account_id").notNull().references(() => prospectAccounts.id, { onDelete: "cascade" }),
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "restrict" }),
    decision: text("decision", { enum: ["approved", "rejected"] }).notNull(),
    reason: text("reason"),
    snapshot: jsonb("snapshot").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("prospect_feedback_company_created_idx").on(t.companyId, t.createdAt)],
);
