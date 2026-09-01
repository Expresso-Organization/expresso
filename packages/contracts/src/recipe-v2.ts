import { z } from "zod";

import { TimestampSchema, UuidSchema } from "./common.js";

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

export const RecipeV2ItemSchema = z
  .strictObject({
    id: UuidSchema,
    order: z.number().int().nonnegative(),
    /** 이 자리에서 무엇을 말할지. §3.3 — 비어 있어도 유효하다. */
    text: z.string().max(2_000),
    sourceBindings: z.array(RecipeV2SourceBindingSchema).max(50),
  })
  .refine(
    (item) => item.sourceBindings.filter(({ role }) => role === "primary").length <= 1,
    { message: "an item keeps at most one primary source", path: ["sourceBindings"] },
  );
export type RecipeV2Item = z.infer<typeof RecipeV2ItemSchema>;

export const RecipeV2SectionSchema = z.strictObject({
  id: UuidSchema,
  order: z.number().int().nonnegative(),
  title: z.string().max(300),
  /** 이 섹션을 왜 두는지. */
  purpose: z.string().max(1_000),
  /** 읽고 나면 남는 한 줄. 03 생성이 이 섹션에서 지켜야 할 것. */
  takeaway: z.string().max(500),
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
  z.strictObject({ operation: z.literal("add_section"), title: TitleSchema, purpose: z.string().trim().max(1_000) }),
  z.strictObject({
    operation: z.literal("update_section"),
    sectionId: UuidSchema,
    title: TitleSchema.optional(),
    purpose: z.string().trim().max(1_000).optional(),
    takeaway: z.string().trim().max(500).optional(),
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
]);
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
