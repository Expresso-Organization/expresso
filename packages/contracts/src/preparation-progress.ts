import { z } from "zod";
import { PreparationSettingsSchema, PreparationTaskSchema } from "./career-preparation.js";
export const TaskProgressStatusSchema = z.enum(["not_started", "in_progress", "completed", "blocked"]);
const OutcomeUrl = z.union([z.literal(""), z.url().max(2048).refine((value) => ["http:", "https:"].includes(new URL(value).protocol), "http(s) only")]);
export const ProgressTaskSchema = PreparationTaskSchema.extend({
  status: TaskProgressStatusSchema, note: z.string().max(2000), outcome: z.string().max(2000),
  outcomeUrl: OutcomeUrl, spentMinutes: z.number().int().min(0).max(100000), updatedAt: z.iso.datetime(),
});
export const ReplanSlotSchema = z.strictObject({ taskId: z.uuid(), week: z.number().int().min(1).max(12), date: z.iso.date(), minutes: z.number().int().min(30).max(60) });
export const ProgressHistorySchema = z.strictObject({
  scheduleVersion: z.number().int().positive(), settings: PreparationSettingsSchema,
  slots: z.array(ReplanSlotSchema).max(40), approvedAt: z.iso.datetime(),
});
export const PreparationProgressSchema = z.strictObject({
  planId: z.uuid(), conversationId: z.uuid(), version: z.number().int().positive(), scheduleVersion: z.number().int().positive(),
  settings: PreparationSettingsSchema, tasks: z.array(ProgressTaskSchema).min(1).max(40),
  history: z.array(ProgressHistorySchema).min(1).max(50), updatedAt: z.iso.datetime(),
});
export const UpdateTaskProgressSchema = z.strictObject({
  requestId: z.uuid(), expectedVersion: z.number().int().positive(), status: TaskProgressStatusSchema,
  note: z.string().max(2000), outcome: z.string().max(2000), outcomeUrl: OutcomeUrl,
  spentMinutes: z.number().int().min(0).max(100000),
}).refine((input) => input.status !== "completed" || !!input.outcome.trim() || !!input.outcomeUrl, "completion needs outcome or link");
export const CreateReplanSchema = z.strictObject({ requestId: z.uuid(), expectedVersion: z.number().int().positive(), settings: PreparationSettingsSchema });
export const ReplanDecisionSchema = z.strictObject({ expectedVersion: z.number().int().positive() });
export const PreparationReplanSchema = z.strictObject({
  id: z.uuid(), planId: z.uuid(), conversationId: z.uuid(), requestId: z.uuid(),
  version: z.number().int().positive(), baseProgressVersion: z.number().int().positive(),
  status: z.enum(["draft", "approved", "rejected"]), settings: PreparationSettingsSchema,
  slots: z.array(ReplanSlotSchema).min(1).max(40), createdAt: z.iso.datetime(), decidedAt: z.iso.datetime().nullable(),
});
export const ProgressResponseSchema = z.strictObject({ data: PreparationProgressSchema.nullable() });
export const ReplanResponseSchema = z.strictObject({ data: PreparationReplanSchema });
export const ReplanListResponseSchema = z.strictObject({ data: z.array(PreparationReplanSchema).max(50) });
export type PreparationProgress = z.infer<typeof PreparationProgressSchema>;
export type ProgressTask = z.infer<typeof ProgressTaskSchema>;
export type UpdateTaskProgress = z.infer<typeof UpdateTaskProgressSchema>;
export type CreateReplan = z.infer<typeof CreateReplanSchema>;
export type PreparationReplan = z.infer<typeof PreparationReplanSchema>;
export type ReplanSlot = z.infer<typeof ReplanSlotSchema>;
