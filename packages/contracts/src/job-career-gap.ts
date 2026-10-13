import { z } from "zod";
import { JobCareerMatchInputSnapshotSchema } from "./job-career-match.js";

export const CareerGapTypeSchema = z.enum(["evidence", "experience", "skill", "qualification", "portfolio"]);
export const CareerGapStatusSchema = z.enum(["needs_confirmation", "needs_improvement"]);
export const CareerGapEvidenceSchema = z.strictObject({
  sourceType: z.enum(["job", "record", "user_message"]),
  sourceId: z.uuid(),
  quote: z.string().trim().min(1).max(2000),
});
// AI는 입력에 있는 요건 번호와 출처만 반환하고 안정 ID는 서버가 생성합니다.
export const CareerGapAiItemSchema = z.strictObject({
  requirementIndex: z.number().int().min(0).max(11),
  type: CareerGapTypeSchema,
  status: CareerGapStatusSchema,
  priority: z.enum(["high", "medium", "low"]),
  explanation: z.string().trim().min(1).max(2000),
  evidence: z.array(CareerGapEvidenceSchema).min(1).max(8),
  suggestedAction: z.string().trim().min(1).max(2000),
});
export const CareerGapAiOutputSchema = z.strictObject({
  summary: z.string().trim().min(1).max(3000),
  items: z.array(CareerGapAiItemSchema).max(20),
});
export const CareerGapItemSchema = CareerGapAiItemSchema.extend({
  id: z.uuid(),
  requirement: z.string().trim().min(1).max(300),
  nextAction: z.enum(["interview", "explore_experience", "prepare", "check_qualification", "improve_portfolio"]),
});
export const AnalyzeCareerGapSchema = z.strictObject({
  requestId: z.uuid(),
  messageIds: z.array(z.uuid()).max(20).refine((ids) => new Set(ids).size === ids.length, "duplicate message IDs"),
});
export const CareerGapResultSchema = z.strictObject({
  id: z.uuid(), conversationId: z.uuid(), jobPostingId: z.uuid(), careerMatchId: z.uuid(), requestId: z.uuid(),
  createdAt: z.iso.datetime(), promptVersion: z.number().int().positive(),
  inputFingerprint: z.string().regex(/^[a-f0-9]{64}$/),
  inputSnapshot: JobCareerMatchInputSnapshotSchema,
  messageIds: z.array(z.uuid()).max(20),
  summary: z.string().trim().min(1).max(3000), items: z.array(CareerGapItemSchema).max(20),
});
export const CareerGapResponseSchema = z.strictObject({ data: CareerGapResultSchema });
export const GetCareerGapResponseSchema = z.strictObject({ data: CareerGapResultSchema.nullable(), stale: z.boolean() });
export type AnalyzeCareerGap = z.infer<typeof AnalyzeCareerGapSchema>;
export type CareerGapAiOutput = z.infer<typeof CareerGapAiOutputSchema>;
export type CareerGapItem = z.infer<typeof CareerGapItemSchema>;
export type CareerGapResult = z.infer<typeof CareerGapResultSchema>;
