import { z } from "zod";

import { TimestampSchema, UuidSchema } from "./common.js";
import { MediaFrameSchema } from "./media.js";
import {
  RecipeV2ItemKindSchema,
  RecipeV2PresentationSchema,
  RecipeV2SectionRoleSchema,
} from "./recipe-vocabulary.js";

/**
 * Recipe v2.
 *
 * 02 레시피가 정하는 것은 **어떤 내용이 어떤 순서로 들어갈지**뿐이다. 섹션과
 * 그 목적, 그 안에서 무엇을 말할지, 그 차례, 그리고 각 항목이 딛는 커리어
 * 기록이다.
 *
 * 표시 방식 · 요소 종류 · 폭 · 강조 같은 지면의 결정은 여기 없다. 그건 01에서
 * 고른 디자인 시스템 안에서 03 생성이 정한다 — 레시피가 배치까지 못 박으면
 * 생성이 할 수 있는 것이 조판뿐이 된다.
 *
 * 기준 문서는 `docs/architecture/portfolio-creation-flow-v2.md` §7 이다.
 */

export const RecipeV2SourceBindingSchema = z.strictObject({
  sourceType: z.enum(["record", "answer", "requirement"]),
  sourceId: UuidSchema,
  /**
   * 중심 근거는 하나다. 03 생성이 "무엇을 중심으로 쓸지"를 모호함 없이 읽는다.
   * 보조는 수를 제한하지 않는다 — 아래 50은 저장을 지키는 상한이지 제품의
   * 규칙이 아니다.
   */
  role: z.enum(["primary", "supporting"]),
  order: z.number().int().nonnegative(),
});
export type RecipeV2SourceBinding = z.infer<typeof RecipeV2SourceBindingSchema>;

// ── 문장의 종류와 값 ────────────────────────────────────────
//
// 문장은 평평한 모양이다 — `kind` 하나와 nullable 값 셋. 판별 합집합으로 두면
// 리듀서 · 저장 · 스트리밍이 전부 갈라지고, 옛 판(문장만 있던)을 그대로 읽지
// 못한다. `kind` 에 맞는 값만 채워진다(아래 `refineContent`).

/** 수치. 값은 문자열이다 — "4.42/4.5" · "26만" 처럼 사람이 적는 그대로다. */
export const RecipeV2MetricSchema = z.strictObject({
  label: z.string().trim().max(80),
  value: z.string().trim().max(40),
  unit: z.string().trim().max(20),
  note: z.string().trim().max(300),
});
export type RecipeV2Metric = z.infer<typeof RecipeV2MetricSchema>;

/** 미디어. 자산이 아직 없을 수 있다 — 초안이 "여기 스크린샷" 이라고 자리만 잡는다. */
export const RecipeV2MediaSchema = z.strictObject({
  assetId: UuidSchema.nullable(),
  caption: z.string().trim().max(300),
  frame: MediaFrameSchema,
});
export type RecipeV2Media = z.infer<typeof RecipeV2MediaSchema>;

export const RecipeV2LinkSchema = z.strictObject({
  label: z.string().trim().max(120),
  url: z.string().trim().url().max(2_000),
});
export type RecipeV2Link = z.infer<typeof RecipeV2LinkSchema>;

const ContentFieldsSchema = z.strictObject({
  kind: RecipeV2ItemKindSchema.default("point"),
  /** 이 자리에서 무엇을 말할지. §3.3 — 비어 있어도 유효하다. 미디어 · 링크에서는 곁글이다. */
  text: z.string().max(2_000),
  metric: RecipeV2MetricSchema.nullable().default(null),
  media: RecipeV2MediaSchema.nullable().default(null),
  link: RecipeV2LinkSchema.nullable().default(null),
});

function contentMatchesKind(content: z.infer<typeof ContentFieldsSchema>): boolean {
  if (content.kind === "metric") return content.metric !== null;
  if (content.kind === "media") return content.media !== null;
  if (content.kind === "link") return content.link !== null;
  return true;
}
const CONTENT_MESSAGE = { message: "the item's kind must come with its value", path: ["kind"] };

export const RecipeV2ItemSchema = ContentFieldsSchema
  .extend({
    id: UuidSchema,
    order: z.number().int().nonnegative(),
    sourceBindings: z.array(RecipeV2SourceBindingSchema).max(50),
  })
  .refine(
    (item) => item.sourceBindings.filter(({ role }) => role === "primary").length <= 1,
    { message: "an item keeps at most one primary source", path: ["sourceBindings"] },
  )
  .refine(contentMatchesKind, CONTENT_MESSAGE);
export type RecipeV2Item = z.infer<typeof RecipeV2ItemSchema>;

export const RecipeV2SectionSchema = z.strictObject({
  id: UuidSchema,
  order: z.number().int().nonnegative(),
  title: z.string().max(300),
  /** 이 섹션을 왜 두는지. */
  purpose: z.string().max(1_000),
  /**
   * 핵심 메시지 — 이 섹션을 읽고 나면 남아야 하는 한 문장.
   *
   * 03 생성이 이 섹션에서 지켜야 할 기준으로 읽는다. 목적(`purpose`)은 왜 두는지고
   * 이것은 무엇이 남는지다.
   */
  takeaway: z.string().max(500),
  /** 이 섹션이 지면에서 맡는 역할. 형식 후보를 가른다. */
  role: RecipeV2SectionRoleSchema.default("other"),
  /** 보여주는 형식(§7.9). 사용자가 02 에서 고른다. 아직 안 골랐으면 null. */
  presentation: RecipeV2PresentationSchema.nullable().default(null),
  items: z.array(RecipeV2ItemSchema).max(60),
});
export type RecipeV2Section = z.infer<typeof RecipeV2SectionSchema>;

/** §7.4 제작 의도. 전부 비워 둘 수 있다. */
export const PortfolioIntentSchema = z.strictObject({
  role: z.string().max(200),
  audience: z.string().max(200),
  highlight: z.string().max(1_000),
  lengthPreset: z.enum(["single", "double", "triple"]),
  extraRequest: z.string().max(2_000),
  /** 지원할 채용 공고. 고르지 않아도 유효하다. */
  jobPostingId: UuidSchema.nullable(),
});
export type PortfolioIntent = z.infer<typeof PortfolioIntentSchema>;

/** 고른 공고를 화면이 그리는 데 필요한 것. 원본은 `job_postings`에 있다. */
export const RecipeV2JobPostingSchema = z.strictObject({
  jobPostingId: UuidSchema,
  title: z.string().min(1).max(300),
  companyName: z.string().min(1).max(200),
  sourceUrl: z.string().max(2_000).nullable(),
  deadlineNote: z.string().max(60).nullable(),
  expiresAt: TimestampSchema.nullable(),
});
export type RecipeV2JobPosting = z.infer<typeof RecipeV2JobPostingSchema>;

export const RecipeV2UnusedSourceSchema = z.strictObject({
  recordId: UuidSchema,
  reason: z.string().max(500),
});

export const RecipeV2Schema = z.strictObject({
  schemaVersion: z.literal(2),
  id: UuidSchema,
  brewId: UuidSchema,
  version: z.number().int().positive(),
  /** 편집의 낙관적 잠금 값. 생성 version과 다르다. */
  editVersion: z.number().int().positive(),
  /** 01에서 고른 디자인. 아직 고르지 않았으면 null. */
  designSystemRevisionId: UuidSchema.nullable(),
  title: z.string().max(300),
  intent: PortfolioIntentSchema,
  jobPosting: RecipeV2JobPostingSchema.nullable(),
  selectedRecordIds: z.array(UuidSchema).max(50),
  sections: z.array(RecipeV2SectionSchema).max(30),
  /** 안 쓴 기록과 그 이유. "이건 왜 안 썼나"가 이걸 읽는다. */
  unusedSources: z.array(RecipeV2UnusedSourceSchema).max(50),
  status: z.enum(["draft", "confirmed"]),
  updatedAt: TimestampSchema,
});
export type RecipeV2 = z.infer<typeof RecipeV2Schema>;

export const RecipeV2ResponseSchema = z.strictObject({ data: RecipeV2Schema });

// ── §7.2 GUI 편집 연산 ──────────────────────────────────────────

const TitleSchema = z.string().trim().max(300);

export const RecipeV2EditSchema = z.discriminatedUnion("operation", [
  z.strictObject({ operation: z.literal("update_intent"), intent: PortfolioIntentSchema }),
  z.strictObject({ operation: z.literal("update_title"), title: TitleSchema }),
  z.strictObject({
    operation: z.literal("add_section"),
    title: TitleSchema,
    purpose: z.string().trim().max(1_000),
    role: RecipeV2SectionRoleSchema.optional(),
  }),
  z.strictObject({
    operation: z.literal("update_section"),
    sectionId: UuidSchema,
    title: TitleSchema.optional(),
    purpose: z.string().trim().max(1_000).optional(),
    takeaway: z.string().trim().max(500).optional(),
    role: RecipeV2SectionRoleSchema.optional(),
    presentation: RecipeV2PresentationSchema.nullable().optional(),
  }),
  z.strictObject({ operation: z.literal("delete_section"), sectionId: UuidSchema }),
  z.strictObject({
    operation: z.literal("add_item"),
    sectionId: UuidSchema,
    text: z.string().trim().max(2_000).optional(),
    /** 놓을 자리. 비우면 섹션 끝. */
    order: z.number().int().nonnegative().optional(),
  }),
  z.strictObject({ operation: z.literal("update_item"), itemId: UuidSchema, text: z.string().trim().max(2_000) }),
  /** 종류와 값을 통째로 바꾼다. 종류만 바꿀 때도 값을 함께 보낸다. */
  ContentFieldsSchema.extend({ operation: z.literal("update_item_content"), itemId: UuidSchema }),
  z.strictObject({ operation: z.literal("duplicate_item"), itemId: UuidSchema }),
  z.strictObject({ operation: z.literal("delete_item"), itemId: UuidSchema }),
  z.strictObject({
    operation: z.literal("bind_source"),
    itemId: UuidSchema,
    sourceType: z.enum(["record", "answer", "requirement"]),
    sourceId: UuidSchema,
    role: z.enum(["primary", "supporting"]),
  }),
  z.strictObject({ operation: z.literal("unbind_source"), itemId: UuidSchema, sourceId: UuidSchema }),
  /**
   * 실행 취소 · 다시 실행.
   *
   * 화면이 들고 있던 판을 그대로 돌려보낸다. 서버는 섹션 · 문장 · 근거를 받은
   * 것으로 갈아 끼우되 **id를 유지한다** — 되돌린 뒤에도 화면의 선택과 목차가
   * 같은 것을 가리켜야 한다. 서버 판(revision)에 기대지 않는 이유는 순서 변경이
   * 판을 남기지 않고, 판이 50개까지만 남기 때문이다.
   */
  z.strictObject({
    operation: z.literal("restore"),
    title: TitleSchema,
    intent: PortfolioIntentSchema,
    sections: z.array(RecipeV2SectionSchema).max(30),
  }),
  /** 02를 마친다. 그 뒤의 편집은 다시 `draft`다 — 03이 무엇을 읽었는지 알 수 있게. */
  z.strictObject({ operation: z.literal("confirm") }),
]).refine(
  (edit) => edit.operation !== "update_item_content" || contentMatchesKind(edit),
  CONTENT_MESSAGE,
);
export type RecipeV2Edit = z.infer<typeof RecipeV2EditSchema>;

/**
 * §11.3 — 순서는 최종 상태를 한 요청으로 받는다.
 *
 * drop 한 번에 저장 한 번이다. 섹션 사이로 옮긴 항목도 같은 요청에 담긴다 —
 * 배열의 자리가 곧 순서다.
 */
export const RecipeV2ReorderSchema = z.strictObject({
  sections: z
    .array(z.strictObject({ sectionId: UuidSchema, itemIds: z.array(UuidSchema).max(60) }))
    .max(30),
});
export type RecipeV2Reorder = z.infer<typeof RecipeV2ReorderSchema>;

export const RecipeV2EditResultSchema = z.strictObject({
  recipe: RecipeV2Schema,
  revisionId: UuidSchema,
});
