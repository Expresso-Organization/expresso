import { z } from "zod";

import { TimestampSchema, UuidSchema } from "./common.js";
import { PageDraftSchema } from "./page.js";
import { TemplateFontSchema } from "./templates.js";

/**
 * 디자인을 정하는 대화.
 *
 * 제작의 디자인 단계에서 에이전트와 주고받는 것이다. 에이전트의 답에는 글과 함께 카드가 붙는다 — **견본**이나
 * **첫 화면**(`DesignSnippet`, 그 사람의 자료로 그린 포트폴리오 맨 위 한 장면).
 *
 * 견본은 스타일(`DesignStyle`, 색 · 서체 · 분위기)과 레이아웃(`DesignLayout`, 구성)을 따로 놓는다. 사용자는 각각에서
 * 하나씩 골라 첫 화면을 그리게 하거나 말로 전하고, 고른 첫 화면으로 지면을 만든다.
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

/** 스타일 — 색 · 서체 · 분위기. 견본 카드 한 장이다. 구성은 정하지 않는다. */
export const DesignStyleSchema = z.strictObject({
  id: UuidSchema,
  name: z.string().min(1).max(120),
  words: z.string().min(1).max(1_000),
  tokens: DesignTokensSchema,
});
export type DesignStyle = z.infer<typeof DesignStyleSchema>;

/**
 * 레이아웃의 배치도가 놓이는 격자. 첫 화면 한 장(1440×900)을 가로 16칸 · 세로 10칸으로 나눈다(한 칸 90px).
 * 견본은 이 배치도를 그림으로 보이고, 첫 화면을 그리는 쪽도 같은 배치도를 받는다 — 보고 고른 것과 그려진 것이 같은 값에서 나온다.
 */
export const DESIGN_LAYOUT_GRID = { columns: 16, rows: 10 } as const;
/** 배치도의 블록이 무엇인가. `title` 이름이나 큰 글자 · `text` 글 · `figure` 이 사람의 일로 그리는 그림 · `accent` 강조 요소. */
export const DESIGN_LAYOUT_BLOCK_KINDS = ["title", "text", "figure", "accent"] as const;
export const DesignLayoutBlockSchema = z
  .strictObject({
    kind: z.enum(DESIGN_LAYOUT_BLOCK_KINDS),
    x: z.number().int().min(0).max(DESIGN_LAYOUT_GRID.columns - 1),
    y: z.number().int().min(0).max(DESIGN_LAYOUT_GRID.rows - 1),
    w: z.number().int().min(1).max(DESIGN_LAYOUT_GRID.columns),
    h: z.number().int().min(1).max(DESIGN_LAYOUT_GRID.rows),
  })
  .refine((block) => block.x + block.w <= DESIGN_LAYOUT_GRID.columns && block.y + block.h <= DESIGN_LAYOUT_GRID.rows, "블록이 격자를 벗어났습니다.");
export type DesignLayoutBlock = z.infer<typeof DesignLayoutBlockSchema>;

/** 레이아웃 — 첫 화면의 구성. 무엇을 주인공으로 세우고 나머지를 어디에 두는가. 색과 서체는 정하지 않는다. */
export const DesignLayoutSpecSchema = z.strictObject({
  name: z.string().min(1).max(120),
  words: z.string().min(1).max(1_000),
  blocks: z.array(DesignLayoutBlockSchema).min(1).max(24),
});
export type DesignLayoutSpec = z.infer<typeof DesignLayoutSpecSchema>;
/** 견본 카드로 놓인 레이아웃. */
export const DesignLayoutSchema = DesignLayoutSpecSchema.extend({ id: UuidSchema });
export type DesignLayout = z.infer<typeof DesignLayoutSchema>;

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
  /** 그릴 때 따른 레이아웃. 카탈로그의 디자인만 골라 그렸으면 null이다 — 구성은 그린 쪽이 정했다. */
  layout: DesignLayoutSpecSchema.nullable(),
  css: PageDraftSchema.shape.css,
  html: PageDraftSchema.shape.html,
  fromSnippetId: UuidSchema.nullable(),
  createdAt: TimestampSchema,
});
export type DesignSnippet = z.infer<typeof DesignSnippetSchema>;

/** 말이 가리키는 대상. 견본의 스타일 · 견본의 레이아웃 · 첫 화면 · 카탈로그의 디자인 판. */
export const DesignSubjectSchema = z.strictObject({
  kind: z.enum(["style", "layout", "snippet", "catalog"]),
  id: UuidSchema,
  name: z.string().max(200),
});
export type DesignSubject = z.infer<typeof DesignSubjectSchema>;

/** 사용자가 한 일. 말하기 · 고른 스타일과 레이아웃으로 그리기 · 카탈로그의 디자인으로 그리기. */
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

/** 그리는 중이거나 그린 첫 화면 한 장. 스타일과 레이아웃은 그리기 전에 정해져 있어 기다리는 동안 그 값으로 자리를 채운다. */
export const DesignScreenItemSchema = z.strictObject({
  id: UuidSchema,
  name: z.string().min(1).max(120),
  words: z.string().max(2_000),
  tokens: DesignTokensSchema,
  /** 그릴 레이아웃. 카탈로그의 디자인만 골랐으면 null이고, 그리는 쪽이 자료를 보고 구성을 정한다. */
  layout: DesignLayoutSpecSchema.nullable(),
  status: z.enum(["drawing", "done", "failed"]),
  snippetId: UuidSchema.nullable(),
});
export type DesignScreenItem = z.infer<typeof DesignScreenItemSchema>;

/** 바뀌는 자리 하나의 길이와 개수의 상한. 서버가 이 안에서 고르고, 넘는 것은 싣지 않는다. */
export const DESIGN_TARGET_MAX_LENGTH = 300;
export const DESIGN_TARGET_MAX_COUNT = 48;

export const DesignCardSchema = z.discriminatedUnion("kind", [
  /** 견본. 스타일과 레이아웃을 따로 놓는다 — 사용자는 각각에서 하나씩 고른다. 한쪽만 새로 낼 때는 다른 쪽이 비어 있다. */
  z.strictObject({ kind: z.literal("proposals"), styles: z.array(DesignStyleSchema), layouts: z.array(DesignLayoutSchema) }),
  z.strictObject({ kind: z.literal("screens"), items: z.array(DesignScreenItemSchema) }),
  z.strictObject({
    kind: z.literal("revision"),
    fromSnippetId: UuidSchema,
    item: DesignScreenItemSchema,
    /**
     * 바뀌는 자리. 문서 안의 요소를 가리키는 CSS 선택자다. 고치는 호출이 조각을 쓰는 동안에는 **지금 첫 화면**에서
     * 그 조각이 닿는 요소를, 다 고친 뒤에는 **고친 첫 화면**에서 바뀐 요소를 가리킨다. 화면은 이 자리를 청사진으로 보인다.
     * 자리를 알아내지 못했으면 비어 있다. 이 칸이 생기기 전에 저장된 카드에도 없다.
     */
    targets: z.array(z.string().min(1).max(DESIGN_TARGET_MAX_LENGTH)).max(DESIGN_TARGET_MAX_COUNT).default([]),
  }),
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
    /** 말이 가리키는 대상. 첫 화면이거나 카탈로그의 디자인이다. 카탈로그의 디자인이면 `id`가 디자인 판 ID다. */
    subject: z.strictObject({ kind: z.enum(["snippet", "catalog"]), id: UuidSchema }).optional(),
  }),
  /** 견본에서 고른 스타일 하나와 레이아웃 하나로 첫 화면을 그린다. */
  z.strictObject({ action: z.literal("draw"), requestId: UuidSchema, styleId: UuidSchema, layoutId: UuidSchema }),
  /** 카탈로그의 디자인을 스타일로 삼아 그린다. 견본에서 고른 레이아웃이 있으면 함께 보낸다. */
  z.strictObject({ action: z.literal("draw_catalog"), requestId: UuidSchema, revisionId: UuidSchema, layoutId: UuidSchema.optional() }),
]);
export type SendDesignMessage = z.infer<typeof SendDesignMessageSchema>;

export const RetryDesignChatSchema = z.strictObject({ requestId: UuidSchema });
export const SelectDesignSnippetSchema = z.strictObject({ snippetId: UuidSchema.nullable() });
export type SelectDesignSnippet = z.infer<typeof SelectDesignSnippetSchema>;
