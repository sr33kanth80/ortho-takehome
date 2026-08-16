import { z } from "zod";

const shortText = z.string().trim().min(1).max(240);
const longText = z.string().trim().min(1).max(4_000);

const stringList = z
  .array(z.string().trim().min(1).max(160))
  .max(30)
  .transform((values) => [...new Set(values.map((value) => value.trim()).filter(Boolean))]);

export const businessProfileInput = z.object({
  businessName: shortText,
  website: z.string().trim().max(500).optional().nullable(),
  offer: longText,
  valueProposition: longText,
  targetIndustries: stringList,
  targetLocations: stringList,
  companySizes: stringList,
  buyerRoles: stringList,
  buyingSignals: stringList,
  exclusions: stringList,
  exampleCustomers: stringList,
  notes: z.string().trim().max(4_000).optional().nullable(),
});

export const missionInput = z.object({
  name: shortText,
  brief: longText,
  targetCount: z.number().int().min(1).max(100).default(25),
  maxSpendCents: z.number().int().min(1).max(25_000).default(300),
});

export const missionUpdateInput = z.object({
  name: shortText.optional(),
  brief: longText.optional(),
  targetCount: z.number().int().min(1).max(100).optional(),
  maxSpendCents: z.number().int().min(1).max(25_000).optional(),
  status: z.enum(["draft", "paused", "completed"]).optional(),
});

export const reviewInput = z.object({
  status: z.enum(["approved", "rejected", "archived", "new"]),
  reason: z.string().trim().max(1_000).optional().nullable(),
});

export const evidenceSchema = z.object({
  label: z.string().min(1).max(500),
  url: z.string().max(1_000).nullable(),
  observedAt: z.string().max(80).nullable(),
});

export const contactOutputSchema = z.object({
  fullName: z.string().min(1).max(240),
  title: z.string().min(1).max(240),
  linkedinUrl: z.string().max(1_000).nullable(),
  email: z.string().max(320).nullable(),
  phone: z.string().max(100).nullable(),
  emailStatus: z.enum(["unverified", "valid", "risky", "invalid", "unknown"]),
  source: z.string().min(1).max(240),
  confidence: z.number().int().min(0).max(100),
  rationale: z.string().min(1).max(1_500),
});

export const missionResearchOutputSchema = z.object({
  summary: z.string().min(1).max(2_000),
  strategy: z.array(z.string().min(1).max(500)).min(1).max(12),
  prospects: z
    .array(
      z.object({
        name: z.string().min(1).max(240),
        domain: z.string().max(500).nullable(),
        website: z.string().max(1_000).nullable(),
        industry: z.string().max(240).nullable(),
        location: z.string().max(240).nullable(),
        employeeCount: z.number().int().nonnegative().nullable(),
        description: z.string().min(1).max(2_000),
        fitScore: z.number().int().min(0).max(100),
        signalScore: z.number().int().min(0).max(100),
        overallScore: z.number().int().min(0).max(100),
        rationale: z.string().min(1).max(2_000),
        whyNow: z.string().min(1).max(2_000),
        outreachAngle: z.string().min(1).max(2_000),
        evidence: z.array(evidenceSchema).min(1).max(8),
        contact: contactOutputSchema.nullable(),
      }),
    )
    .min(1)
    .max(8),
});

export const contactResearchOutputSchema = z.object({
  summary: z.string().min(1).max(1_000),
  contacts: z.array(contactOutputSchema).max(5),
});

export const intakeTurnSchema = z.object({
  role: z.enum(["user", "assistant"]),
  text: z.string().trim().min(1).max(4_000),
});

export const intakeInput = z.object({
  messages: z.array(intakeTurnSchema).min(1).max(12),
  selectedMissionId: z.string().trim().min(1).max(100).optional().nullable(),
});

export const intakeOutputSchema = z.object({
  action: z.enum(["clarify", "update_profile", "create_mission", "run_mission"]),
  reply: z.string().min(1).max(1_500),
  profile: businessProfileInput.nullable(),
  mission: missionInput.nullable(),
});

export type BusinessProfileInput = z.infer<typeof businessProfileInput>;
export type MissionInput = z.infer<typeof missionInput>;
export type MissionUpdateInput = z.infer<typeof missionUpdateInput>;
export type ReviewInput = z.infer<typeof reviewInput>;
export type MissionResearchOutput = z.infer<typeof missionResearchOutputSchema>;
export type ContactResearchOutput = z.infer<typeof contactResearchOutputSchema>;
export type IntakeInput = z.infer<typeof intakeInput>;
export type IntakeOutput = z.infer<typeof intakeOutputSchema>;

export function normalizeDomain(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim().toLowerCase();
  if (!trimmed) return null;
  try {
    const url = new URL(trimmed.includes("://") ? trimmed : `https://${trimmed}`);
    return url.hostname.replace(/^www\./, "") || null;
  } catch {
    return trimmed.replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0] || null;
  }
}
export function calculateOverallScore(fitScore: number, signalScore: number): number {
  return Math.round(Math.max(0, Math.min(100, fitScore * 0.65 + signalScore * 0.35)));
}
