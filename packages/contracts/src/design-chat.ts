import { z } from "zod";

import { TimestampSchema, UuidSchema } from "./common.js";
import { PageDraftSchema } from "./page.js";
import { TemplateFontSchema } from "./templates.js";

/**
 * 디자인을 정하는 대화.
 *
 * 제작의 디자인 단계에서 에이전트와 주고받는 것이다. 에이전트의 답에는 글과 함께 카드가 붙는다 — 색 · 서체만 보이는
 * **견본**(`DesignDirection`)이나, 그 사람의 자료로 그린 포트폴리오 맨 위 한 장면인 **첫 화면**(`DesignSnippet`).
 * 사용자는 카드를 눌러 답하거나 말로 스타일을 전하고, 고른 첫 화면으로 지면을 만든다.
 */

const HexColorSchema = z.string().regex(/^#[0-9a-fA-F]{6}$/);

/** 스타일이 정하는 것. 자유 생성이 고른 스타일에서 지키는 값과 같다 — 색 셋 · 서체 계열 · 밀도. */
export const DesignTokensSchema = z.strictObject({
  background: HexColorSchema,
  text: HexColorSchema,
  accent: HexColorSchema,
  font: TemplateFontSchema,
  density: z.enum(["compact", "comfortable", "spacious"]),
});
export type DesignTokens = z.infer<typeof DesignTokensSchema>;

/** 견본. 방향의 이름과 한두 문장, 색과 서체. 배치는 담지 않는다. */
export const DesignDirectionSchema = z.strictObject({
  id: UuidSchema,
  name: z.string().min(1).max(120),
  words: z.string().min(1).max(1_000),
  tokens: DesignTokensSchema,
});
export type DesignDirection = z.infer<typeof DesignDirectionSchema>;

/** 첫 화면이 어디서 왔는가. 에이전트의 제안 · 사용자가 말한 스타일 · 카탈로그의 디자인 · 앞선 첫 화면을 고친 것. */
export const DesignSnippetOriginSchema = z.enum(["agent", "user", "catalog", "edit"]);

/** 첫 화면. 소독을 마친 마크업과 CSS다. 고르면 완성 지면의 맨 앞에 그대로 들어간다. */
export const DesignSnippetSchema = z.strictObject({
  id: UuidSchema,
  origin: DesignSnippetOriginSchema,
  name: z.string().min(1).max(120),
  /** 그린 쪽이 건네는 한두 문장. 이 첫 화면에서 무엇을 앞에 세웠는지. */
  note: z.string().max(1_000),
  /** 이 첫 화면을 낳은 말. 방향의 설명이거나 고친 지시다. */
  words: z.string().max(2_000),
  tokens: DesignTokensSchema,
  css: PageDraftSchema.shape.css,
  html: PageDraftSchema.shape.html,
  fromSnippetId: UuidSchema.nullable(),
  createdAt: TimestampSchema,
});
export type DesignSnippet = z.infer<typeof DesignSnippetSchema>;

/** 말이 가리키는 대상. 견본 · 첫 화면 · 카탈로그의 디자인 판. */
export const DesignSubjectSchema = z.strictObject({
  kind: z.enum(["direction", "snippet", "catalog"]),
  id: UuidSchema,
  name: z.string().max(200),
});
export type DesignSubject = z.infer<typeof DesignSubjectSchema>;

/** 사용자가 한 일. 말하기 · 견본으로 그리기 · 카탈로그의 디자인으로 그리기. */
export const DesignActionSchema = z.enum(["say", "draw", "draw_catalog"]);

export const DesignUserMessageSchema = z.strictObject({
  id: UuidSchema,
  role: z.literal("user"),
  action: DesignActionSchema,
  /** `say`의 글. 카드를 눌러 한 일은 비어 있고 화면이 `action`과 `subjects`로 문장을 만든다. */
  text: z.string().max(8_000),
  subjects: z.array(DesignSubjectSchema),
  createdAt: TimestampSchema,
});

/** 그리는 중이거나 그린 첫 화면 한 장. 방향의 색과 서체는 그리기 전에 정해져 있어 기다리는 동안 그 값으로 자리를 채운다. */
export const DesignScreenItemSchema = z.strictObject({
  id: UuidSchema,
  name: z.string().min(1).max(120),
  words: z.string().max(2_000),
  tokens: DesignTokensSchema,
  status: z.enum(["drawing", "done", "failed"]),
  snippetId: UuidSchema.nullable(),
});
export type DesignScreenItem = z.infer<typeof DesignScreenItemSchema>;

export const DesignCardSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("directions"), directions: z.array(DesignDirectionSchema) }),
  z.strictObject({ kind: z.literal("screens"), items: z.array(DesignScreenItemSchema) }),
  z.strictObject({ kind: z.literal("revision"), fromSnippetId: UuidSchema, item: DesignScreenItemSchema }),
]);
export type DesignCard = z.infer<typeof DesignCardSchema>;

export const DesignAssistantMessageSchema = z.strictObject({
  id: UuidSchema,
  role: z.literal("assistant"),
  text: z.string().max(8_000),
  status: z.enum(["running", "complete", "failed"]),
  card: DesignCardSchema.nullable(),
  createdAt: TimestampSchema,
});

export const DesignChatMessageSchema = z.discriminatedUnion("role", [DesignUserMessageSchema, DesignAssistantMessageSchema]);
export type DesignChatMessage = z.infer<typeof DesignChatMessageSchema>;

/** 답 하나를 만드는 실행. `interrupted`는 만드는 중에 서버가 꺼진 것이다. */
export const DesignRunSchema = z.strictObject({
  id: UuidSchema,
  requestId: UuidSchema,
  status: z.enum(["running", "complete", "failed", "interrupted"]),
  error: z.string().max(1_000).nullable(),
  startedAt: TimestampSchema,
});

export const DesignChatSchema = z.strictObject({
  id: UuidSchema,
  brewId: UuidSchema,
  messages: z.array(DesignChatMessageSchema),
  snippets: z.array(DesignSnippetSchema),
  selectedSnippetId: UuidSchema.nullable(),
  run: DesignRunSchema.nullable(),
  /** 바뀔 때마다 오른다. 화면이 가진 값과 같으면 서버는 대화를 다시 보내지 않는다. */
  version: z.number().int().nonnegative(),
  updatedAt: TimestampSchema,
});
export type DesignChat = z.infer<typeof DesignChatSchema>;

/** 대화 읽기의 응답. 아직 열지 않았으면 `chat`이 null이고, `since`와 판이 같으면 `unchanged`다. */
export const DesignChatStateSchema = z.strictObject({ chat: DesignChatSchema.nullable(), unchanged: z.boolean() });
export const DesignChatStateResponseSchema = z.strictObject({ data: DesignChatStateSchema });
export const DesignChatResponseSchema = z.strictObject({ data: DesignChatSchema });
export const DesignChatQuerySchema = z.strictObject({ since: z.coerce.number().int().nonnegative().optional() });

export const OpenDesignChatSchema = z.strictObject({ requestId: UuidSchema });

export const SendDesignMessageSchema = z.discriminatedUnion("action", [
  z.strictObject({
    action: z.literal("say"),
    requestId: UuidSchema,
    text: z.string().trim().min(1).max(8_000),
    /** 말이 가리키는 대상. 카탈로그의 디자인이면 `id`가 디자인 판 ID다. */
    subject: DesignSubjectSchema.pick({ kind: true, id: true }).optional(),
  }),
  z.strictObject({ action: z.literal("draw"), requestId: UuidSchema, directionIds: z.array(UuidSchema).min(1) }),
  z.strictObject({ action: z.literal("draw_catalog"), requestId: UuidSchema, revisionId: UuidSchema }),
]);
export type SendDesignMessage = z.infer<typeof SendDesignMessageSchema>;

export const RetryDesignChatSchema = z.strictObject({ requestId: UuidSchema });
export const SelectDesignSnippetSchema = z.strictObject({ snippetId: UuidSchema.nullable() });
export type SelectDesignSnippet = z.infer<typeof SelectDesignSnippetSchema>;
