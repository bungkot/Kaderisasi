import { z } from "zod"

export const OwaspIdSchema = z.enum([
  "A01:2025",
  "A02:2025",
  "A03:2025",
  "A04:2025",
  "A05:2025",
  "A06:2025",
  "A07:2025",
  "A08:2025",
  "A09:2025",
  "A10:2025",
])

export const SeveritySchema = z.enum(["critical", "high", "medium", "low", "info"])

export const HttpMethodSchema = z.enum([
  "GET",
  "POST",
  "PUT",
  "PATCH",
  "DELETE",
  "OPTIONS",
  "HEAD",
])

export const FindingSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  owasp_id: OwaspIdSchema,
  severity: SeveritySchema,
  endpoint: z.string().min(1),
  method: HttpMethodSchema,
  evidence: z.string().min(1),
  payload: z.string().optional(),
  confidence: z.number().min(0).max(1),
  remediation: z.string().optional(),
})

export const FindingsSchema = z.array(FindingSchema)

export const GroundTruthFindingSchema = z.object({
  endpoint: z.string().min(1),
  type: z.string().min(1),
  payload: z.string().optional(),
  evidence: z.string().optional(),
  owasp_id: OwaspIdSchema.optional(),
  severity: SeveritySchema.optional(),
  core: z.boolean(),
})

export const GroundTruthSchema = z.object({
  findings: z.array(GroundTruthFindingSchema),
  notes: z.string().optional(),
})

export const AgentTaskCardSchema = z.object({
  id: z.string().min(1),
  owasp_id: OwaspIdSchema,
  title: z.string().min(1),
  category: z.string().min(1),
  target: z.string().min(1),
  scope: z.array(z.string().min(1)),
  objective: z.string().min(1),
  constraints: z.array(z.string()),
  deliverables: z.array(z.string()),
  estimated_requests: z.number().int().nonnegative(),
})

export const TaskDefinitionSchema = AgentTaskCardSchema.extend({
  ground_truth: GroundTruthSchema,
})
