import { z } from "zod";

export const CreateChatFactSchema = z.strictObject({
  requestId: z.uuid(),
  messageIds: z.array(z.uuid()).min(1).max(10),
}).refine(
  (value) =>
    new Set(value.messageIds).size === value.messageIds.length,
  { message: "duplicate message IDs" },
);

export const ApproveChatFactSchema = z.strictObject({
  categoryId: z.uuid(),
  title: z.string().trim().min(1).max(300),
  bodyMd: z.string().trim().min(1).max(20000),
});

export const ChatFactSchema = z.strictObject({
  id: z.uuid(),
  sessionId: z.uuid(),
  requestId: z.uuid(),
  status: z.enum(["pending", "approved", "rejected"]),

  // AI가 만든 최초 초안
  title: z.string().min(1).max(300),
  bodyMd: z.string().min(1).max(20000),

  // 사용자가 선택한 발언 원문
  sources: z.array(
    z.strictObject({
      messageId: z.uuid(),
      quote: z.string().min(1).max(4000),
    }),
  ).min(1).max(10),

  // 승인한 최종 내용
  approvedTitle: z.string().nullable(),
  approvedBodyMd: z.string().nullable(),
  categoryId: z.uuid().nullable(),
  recordId: z.uuid().nullable(),

  createdAt: z.iso.datetime(),
  decidedAt: z.iso.datetime().nullable(),
});

export const ChatFactResponseSchema = z.strictObject({
  data: ChatFactSchema,
});

export const ChatFactListResponseSchema = z.strictObject({
  data: z.array(ChatFactSchema).max(100),
});

export type CreateChatFact = z.infer<
  typeof CreateChatFactSchema
>;

export type ApproveChatFact = z.infer<
  typeof ApproveChatFactSchema
>;

export type ChatFact = z.infer<typeof ChatFactSchema>;