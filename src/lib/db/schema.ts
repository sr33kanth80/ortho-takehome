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
