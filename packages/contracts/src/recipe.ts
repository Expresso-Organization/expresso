import { z } from "zod";

import { TimestampSchema, UuidSchema } from "./common.js";
import {
  PortfolioPlanningManifestSchema,
  PortfolioPlanSchema,
} from "./portfolio-plan.js";

export const RecipeEvidencePathSchema = z.strictObject({
  id: UuidSchema,
  sourceType: z.enum(["requirement", "record", "answer"]),
  sourceId: UuidSchema,
  sourceLabel: z.string().min(1).max(5_000),
  recipeItemId: UuidSchema,
  targetPath: z.string().min(1).max(500),
});

export const RecipeItemSchema = z.strictObject({
  id: UuidSchema,
  order: z.number().int().nonnegative(),
  pointText: z.string().min(1).max(5_000),
  locked: z.boolean(),
  editedBy: z.enum(["ai", "user"]),
  /** 출처 연결은 검토용 메타데이터다. 비어 있어도 사용자가 채울 수 있다. */
  evidence: z.array(RecipeEvidencePathSchema),
});

export const RecipeSectionSchema = z.strictObject({
  id: UuidSchema,
  order: z.number().int().nonnegative(),
  title: z.string().min(1).max(300),
  purpose: z.string().min(1).max(1_000),
  targetLength: z.number().int().nonnegative(),
  context: z.strictObject({
    goal: z.string().max(1_000),
    points: z.array(z.string().max(1_000)).max(20),
    metrics: z.array(z.string().max(300)).max(20),
    format: z.string().min(1).max(100),
    tone: z.string().min(1).max(100),
    exclude: z.array(z.string().max(300)).max(20),
    takeaway: z.string().min(1).max(500).default("검증된 근거 한 가지"),
    contentPattern: z.enum(["hero", "case-study", "metrics", "timeline", "capabilities", "about", "contact"]).default("case-study"),
    interactionOpportunity: z.string().max(300).nullable().default(null),
  }),
  locked: z.boolean(),
  editedBy: z.enum(["ai", "user"]),
  items: z.array(RecipeItemSchema),
});

export const RecipeSchema = z.strictObject({
  id: UuidSchema,
  brewId: UuidSchema,
  version: z.number().int().positive(),
  status: z.enum(["draft", "confirmed"]),
  completeness: z.number().min(0).max(100),
  sections: z.array(RecipeSectionSchema).min(1),
  evidencePaths: z.array(RecipeEvidencePathSchema),
  unusedSources: z.array(z.strictObject({
    recordId: UuidSchema,
    reason: z.string().min(1).max(500),
  })),
  /**
   * 설계안은 더 이상 레시피 단계에서 만들지 않는다 — 새 레시피는 null이다.
   *
   * 레시피가 정하는 것은 무엇을 어떤 순서로 담을지고, 자리매김 · 요건 대응 ·
   * 주장 같은 지면의 판단은 03 생성이 지면을 쓰면서 한다. 예전에 만들어 둔
   * 레시피는 그 설계안을 그대로 들고 있다.
   */
  portfolioPlan: PortfolioPlanSchema.nullable().default(null),
  planningManifest: PortfolioPlanningManifestSchema.nullable().default(null),
  updatedAt: TimestampSchema,
});

export const RecipeResponseSchema = z.strictObject({ data: RecipeSchema });

export const RecipeEditSchema = z.discriminatedUnion("operation", [
  z.strictObject({ operation: z.literal("move_section"), sectionId: UuidSchema, toOrder: z.number().int().nonnegative() }),
  z.strictObject({ operation: z.literal("add_section"), title: z.string().trim().min(1).max(300), purpose: z.string().trim().min(1).max(1_000) }),
  z.strictObject({ operation: z.literal("delete_section"), sectionId: UuidSchema }),
  z.strictObject({ operation: z.literal("update_item"), itemId: UuidSchema, pointText: z.string().trim().min(1).max(5_000) }),
  z.strictObject({ operation: z.literal("move_item"), itemId: UuidSchema, toOrder: z.number().int().nonnegative() }),
  z.strictObject({ operation: z.literal("add_item"), sectionId: UuidSchema, pointText: z.string().trim().min(1).max(5_000), sourcePathId: UuidSchema }),
  z.strictObject({ operation: z.literal("delete_item"), itemId: UuidSchema }),
  z.strictObject({ operation: z.literal("instruction"), instruction: z.string().trim().min(1).max(1_000) }),
]);

export const RecipeEditResultSchema = z.strictObject({
  recipe: RecipeSchema,
  revisionId: UuidSchema,
  diff: z.array(z.strictObject({
    path: z.string().min(1).max(500),
    before: z.unknown().optional(),
    after: z.unknown().optional(),
  })).min(1),
});

export type Recipe = z.infer<typeof RecipeSchema>;
export type RecipeSection = z.infer<typeof RecipeSectionSchema>;
export type RecipeEdit = z.infer<typeof RecipeEditSchema>;

// ── §8.3 「레시피 생성」 — 모델이 내는 초안 ───────────────────────────

/**
 * 레시피는 **계획**이지 글이 아니다.
 *
 * 레시피는 페이지를 시작하는 편집 가능한 제안이다. 요점은 "무엇을 말할지"를
 * 돕지만, 문장 여부나 출처 연결은 전체 초안을 거절할 이유가 아니다.
 */
const SENTENCE_ENDING = /(?:습니다|합니다|입니다|했다|하였다|였다|이다|한다|된다|됩니다)[.!?]?\s*$/;

/**
 * 완성 문장인가.
 *
 * 표시·검토 UI에서 쓸 수 있는 보조 판정이다. 저장·재생성·삭제를 결정하지 않는다.
 */
export function isCompleteSentence(text: string): boolean {
  return SENTENCE_ENDING.test(text.trim());
}

export const RecipeDraftItemSchema = z.strictObject({
  /** 이 자리에서 무엇을 말할지에 대한 편집 가능한 제안. */
  pointText: z.string().min(1).max(200),
  /** 프롬프트에서 준 재료 번호. 비어 있으면 사용자가 나중에 연결한다. */
  sources: z.array(z.number().int().min(1).max(40)).max(5),
});

/** SectionContext 6항목. 추출이 이걸 그대로 읽어 문장을 쓴다. */
export const RecipeDraftSectionSchema = z.strictObject({
  title: z.string().min(1).max(60),
  purpose: z.string().min(1).max(300),
  /** 이 섹션에 쓸 글자 수의 제안. 0도 유효한 검토 값이다. */
  targetLength: z.number().int().nonnegative().max(1_500),
  /** 이 섹션을 왜 두는가. 02b가 그대로 보여준다. */
  goal: z.string().min(1).max(300),
  points: z.array(z.string().min(1).max(200)).max(8),
  /** 이 섹션에서 살릴 수 있는 수치 제안. */
  metrics: z.array(z.string().min(1).max(120)).max(8),
  tone: z.string().min(1).max(60),
  format: z.enum(["narrative", "bullets", "metrics", "timeline"]),
  /** 이 섹션에서 피하고 싶은 말에 대한 사용자 검토 메모. */
  exclude: z.array(z.string().min(1).max(120)).max(8),
  takeaway: z.string().min(1).max(300),
  contentPattern: z.enum(["hero", "case-study", "metrics", "timeline", "capabilities", "about", "contact"]),
  interactionOpportunity: z.string().max(300).nullable(),
  items: z.array(RecipeDraftItemSchema).max(8),
});

export const RecipeDraftSchema = z.strictObject({
  /** 한 페이지를 만들 최소 구조만 둔다. 제목 중복은 편집 판단으로 남긴다. */
  sections: z.array(RecipeDraftSectionSchema).min(1).max(20),
  /** 쓰지 않은 기록과 그 이유. 02b의 "이건 왜 안 썼나"가 이걸 읽는다. */
  unused: z.array(z.strictObject({
    source: z.number().int().min(1).max(40),
    reason: z.string().min(1).max(200),
  })).max(40),
});

export type RecipeDraft = z.infer<typeof RecipeDraftSchema>;
