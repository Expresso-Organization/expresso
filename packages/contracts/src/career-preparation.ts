import { z } from "zod";
const Text = z.string().trim().min(1).max(2000);
export const PreparationTaskSchema = z.strictObject({
  id: z.uuid(), gapId: z.uuid(), requirement: z.string().min(1).max(300),
  kind: z.enum(["confirm", "learn", "project", "check", "portfolio"]),
  week: z.number().int().min(1).max(12), date: z.iso.date(),
  minutes: z.number().int().min(30).max(60),
  title: z.string().trim().min(1).max(300), action: Text, deliverable: Text,
});
export const PreparationSettingsSchema = z.strictObject({
  weeklyHours: z.number().int().min(1).max(40),
  weeks: z.number().int().min(1).max(12), startDate: z.iso.date(),
});
export const CreatePreparationSchema = z.strictObject({
  requestId: z.uuid(), gapResultId: z.uuid(),
  gapIds: z.array(z.uuid()).min(1).max(10).refine((ids) => new Set(ids).size === ids.length, "duplicate gap IDs"),
  settings: PreparationSettingsSchema,
});
export const PreparationPlanSchema = z.strictObject({
  id: z.uuid(), conversationId: z.uuid(), gapResultId: z.uuid(), requestId: z.uuid(),
  version: z.number().int().positive(), status: z.enum(["draft", "approved", "rejected"]),
  title: z.string().trim().min(1).max(300), summary: Text,
  settings: PreparationSettingsSchema, gapIds: z.array(z.uuid()).min(1).max(10),
  tasks: z.array(PreparationTaskSchema).min(1).max(40), totalMinutes: z.number().int().positive(),
  createdAt: z.iso.datetime(), decidedAt: z.iso.datetime().nullable(),
  generatorVersion: z.number().int().positive(),
});
export const ApprovePreparationSchema = z.strictObject({
  expectedVersion: z.number().int().positive(), title: z.string().trim().min(1).max(300), summary: Text,
  taskEdits: z.array(z.strictObject({ id: z.uuid(), title: z.string().trim().min(1).max(300), action: Text, deliverable: Text })).min(1).max(40),
});
export const RejectPreparationSchema = z.strictObject({ expectedVersion: z.number().int().positive() });
export const PreparationResponseSchema = z.strictObject({ data: PreparationPlanSchema });
export const PreparationListResponseSchema = z.strictObject({ data: z.array(PreparationPlanSchema).max(50), stale: z.boolean() });
export type PreparationSettings = z.infer<typeof PreparationSettingsSchema>;
export type PreparationTask = z.infer<typeof PreparationTaskSchema>;
export type PreparationPlan = z.infer<typeof PreparationPlanSchema>;
export type CreatePreparation = z.infer<typeof CreatePreparationSchema>;
export type ApprovePreparation = z.infer<typeof ApprovePreparationSchema>;
