import { JobPostingDetailSchema } from "./job-board.js";
import { CareerRecordSchema } from "./career.js";
import { PortfolioDetailSchema } from "./portfolios.js";
import { GeneratedPageSchema } from "./page.js";
import { CareerDocumentBootstrapSchema } from "./career-editor.js";
import { z } from "zod";
import { UuidSchema, TimestampSchema } from "./common.js";
import { AiEditProposalDetailSchema, AiEditProposalSchema } from "./career-ai.js";

export const AgentContextSchema = z.strictObject({ kind: z.enum(["job", "record", "portfolio"]), id: UuidSchema });
export const AgentToolResultSchema = z.strictObject({ id: z.string().max(200), name: z.string().max(100), status: z.enum(["running", "complete", "failed"]), summary: z.string().max(8_000), proposal: AiEditProposalDetailSchema.optional(), beforeDocument: CareerDocumentBootstrapSchema.shape.document.optional(), undone: z.boolean().optional() });
export const AgentMessageSchema = z.strictObject({ id: UuidSchema, role: z.enum(["user", "assistant"]), text: z.string().max(64_000), tools: z.array(AgentToolResultSchema).max(30), createdAt: TimestampSchema });
export const AgentRunSchema = z.strictObject({ id: UuidSchema, requestId: UuidSchema, status: z.enum(["running", "complete", "cancelled", "failed", "interrupted"]), error: z.string().max(1_000).nullable(), startedAt: TimestampSchema });
export const AgentConversationSchema = z.strictObject({ id: UuidSchema, title: z.string().max(120), contexts: z.array(AgentContextSchema).max(10), messages: z.array(AgentMessageSchema).max(100), run: AgentRunSchema.nullable(), version: z.number().int().nonnegative(), updatedAt: TimestampSchema });
export const AgentConversationResponseSchema = z.strictObject({ data: AgentConversationSchema });
export const AgentConversationListSchema = z.strictObject({ data: z.array(AgentConversationSchema.omit({ messages: true })).max(100) });
export const CreateAgentConversationSchema = z.strictObject({ contexts: z.array(AgentContextSchema).max(10).default([]) });
export const AgentApiKeySchema = z.string().trim().min(20).max(300).regex(/^sk-ant-[A-Za-z0-9_-]+$/);
export const SendAgentMessageSchema = z.strictObject({ requestId: UuidSchema, text: z.string().trim().min(1).max(8_000) });
export const AddAgentContextSchema = z.strictObject({ context: AgentContextSchema });
export const AgentApprovalSchema = z.strictObject({ proposalId: UuidSchema, action: z.enum(["apply", "reject", "undo"]), expectedDocumentVersion: z.number().int().nonnegative(), commandIndexes: z.array(z.number().int().nonnegative()).max(100).optional(), propertyChangeIndexes: z.array(z.number().int().nonnegative()).max(50).optional() });
export type AgentContext = z.infer<typeof AgentContextSchema>;
export type AgentMessage = z.infer<typeof AgentMessageSchema>;
export type AgentToolResult = z.infer<typeof AgentToolResultSchema>;
export type AgentRun = z.infer<typeof AgentRunSchema>;
export type AgentConversation = z.infer<typeof AgentConversationSchema>;
export type SendAgentMessage = z.infer<typeof SendAgentMessageSchema>;
export type AgentApproval = z.infer<typeof AgentApprovalSchema>;

export const AgentEditDraftSchema = AiEditProposalSchema.pick({ summary: true, commands: true, propertyChanges: true });
export type AgentEditDraft = z.infer<typeof AgentEditDraftSchema>;

export const AgentChatAccessSchema = z.strictObject({ data: z.strictObject({ enabled: z.boolean(), serverCredentialAllowed: z.boolean(), consentRequired: z.boolean(), apiKeyConfigured: z.boolean(), model: z.literal("sonnet") }) });

export const SaveAgentApiKeySchema = z.strictObject({ apiKey: AgentApiKeySchema });
export const AgentCredentialStatusSchema = z.strictObject({ data: z.strictObject({ configured: z.boolean() }) });

export const SetAgentContextsSchema = z.strictObject({ contexts: z.array(AgentContextSchema).max(10).refine(items => new Set(items.map(item => `${item.kind}:${item.id}`)).size === items.length, "중복 자료를 선택할 수 없습니다."), expectedVersion: z.number().int().nonnegative() });
export const AgentResourceDetailSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("job"), data: JobPostingDetailSchema }),
  z.strictObject({ kind: z.literal("record"), data: CareerRecordSchema, document: CareerDocumentBootstrapSchema }),
  z.strictObject({ kind: z.literal("portfolio"), data: PortfolioDetailSchema, page: GeneratedPageSchema.nullable() }),
]);
export type AgentResourceDetail = z.infer<typeof AgentResourceDetailSchema>;
