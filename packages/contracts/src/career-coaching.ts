import { z } from "zod";
import { PreparationSettingsSchema } from "./agent-chat.js";
export const ExplorationInputSchema = z.strictObject({
 experience: z.string().trim().min(1).max(4000), interests: z.string().trim().min(1).max(1000),
 constraints: z.string().trim().max(1000), weeklyHours: PreparationSettingsSchema.shape.weeklyHours,
});
export const CoachingFeedbackSchema = z.strictObject({
 id: z.uuid(), kind: z.enum(["job", "condition", "plan"]), target: z.string().trim().min(1).max(200),
 label: z.string().trim().max(300).optional(), reason: z.string().trim().min(1).max(500), active: z.boolean(),
}).superRefine((value,ctx)=>{ if(value.kind === "job" && !z.uuid().safeParse(value.target).success) ctx.addIssue({code:"custom",path:["target"],message:"목록에서 공고를 선택하세요."}); });
export const CoachingCandidateSchema = z.strictObject({ role: z.string(), reasons: z.array(z.string()), confidence: z.enum(["low", "medium"]), nextQuestion: z.string() });
export const ImprovementSchema = z.strictObject({ id: z.uuid(), portfolioId: z.uuid(), kind: z.enum(["record", "portfolio", "preparation"]),
 title: z.string(), period: z.enum(["7d", "30d", "all"]), evidence: z.array(z.string()), prompt: z.string(), sourceHash: z.string(), status: z.enum(["pending", "approved", "rejected"]) });
export const CoachingStateSchema = z.strictObject({ version: z.number().int().nonnegative(),
 profile: ExplorationInputSchema.nullable(), candidates: z.array(CoachingCandidateSchema),
 feedback: z.array(CoachingFeedbackSchema).max(50), appliedFeedback: z.array(z.string()), improvements: z.array(ImprovementSchema).max(20),
});
export const CoachingResponseSchema = z.strictObject({ data: CoachingStateSchema });
export const CoachingExploreSchema = z.strictObject({ expectedVersion: z.number().int().nonnegative(), profile: ExplorationInputSchema });
export const CoachingFeedbackInputSchema = z.strictObject({ expectedVersion: z.number().int().nonnegative(), feedback: CoachingFeedbackSchema });
export const CoachingAnalyticsInputSchema = z.strictObject({ expectedVersion: z.number().int().nonnegative(), portfolioId: z.uuid(), period: z.enum(["7d", "30d", "all"]) });
export const CoachingDecisionSchema = z.strictObject({ expectedVersion: z.number().int().nonnegative(), id: z.uuid(), decision: z.enum(["approved", "rejected"]) });
export type CoachingState = z.infer<typeof CoachingStateSchema>;
export type ExplorationInput = z.infer<typeof ExplorationInputSchema>;
export type CoachingFeedback = z.infer<typeof CoachingFeedbackSchema>;
export type Improvement = z.infer<typeof ImprovementSchema>;
