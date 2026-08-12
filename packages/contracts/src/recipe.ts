import { z } from "zod";

import { TimestampSchema, UuidSchema } from "./common.js";
import {
  PortfolioPlanDraftCoreSchema,
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
  evidence: z.array(RecipeEvidencePathSchema).min(1),
});

export const RecipeSectionSchema = z.strictObject({
  id: UuidSchema,
  order: z.number().int().nonnegative(),
  title: z.string().min(1).max(300),
  purpose: z.string().min(1).max(1_000),
  targetLength: z.number().int().positive(),
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
  evidencePaths: z.array(RecipeEvidencePathSchema).min(3),
  unusedSources: z.array(z.strictObject({
    recordId: UuidSchema,
    reason: z.string().min(1).max(500),
  })),
  /** 옛 레시피는 null, v1 planner가 만든 레시피는 완전한 설계안을 가진다. */
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
 * §8.3이 이 계약에만 붙여 둔 금지 조항이 "완성 문장 생성 금지"다. 여기서 문장을
 * 쓰기 시작하면 추출이 할 일이 없어지고, 사용자는 고칠 것이 두 군데로 갈린다.
 * 요점은 "무엇을 말할지"까지만 적는다.
 */
const SENTENCE_ENDING = /(?:습니다|합니다|입니다|했다|하였다|였다|이다|한다|된다|됩니다)[.!?]?\s*$/;

/**
 * 완성 문장인가.
 *
 * 스키마가 아니라 **계약 검사**로 쓴다 — 사람이 쓴 기록 제목은 문장일 수 있고,
 * 그건 우리가 막을 일이 아니다. 막아야 하는 것은 **모델이 여기서 문장을 쓰는
 * 것**이다(§8.3: 완성 문장 생성 금지).
 */
export function isCompleteSentence(text: string): boolean {
  return SENTENCE_ENDING.test(text.trim());
}

export const RecipeDraftItemSchema = z.strictObject({
  /** 이 자리에서 무엇을 말할지. 요점이지 문장이 아니다. */
  pointText: z.string().min(1).max(200),
  /** 프롬프트에서 준 재료 번호. 근거 없는 항목은 만들 수 없다. */
  sources: z.array(z.number().int().min(1).max(40)).min(1).max(5),
});

/** SectionContext 6항목. 추출이 이걸 그대로 읽어 문장을 쓴다. */
export const RecipeDraftSectionSchema = z.strictObject({
  title: z.string().min(1).max(60),
  purpose: z.string().min(1).max(300),
  /** 이 섹션에 쓸 글자 수. 합이 분량 프리셋에 맞아야 한다. */
  targetLength: z.number().int().min(100).max(1_500),
  /** 이 섹션을 왜 두는가. 02b가 그대로 보여준다. */
  goal: z.string().min(1).max(300),
  points: z.array(z.string().min(1).max(200)).min(1).max(8),
  /** 이 섹션에서 살릴 수치. 재료에 실제로 있는 값만. */
  metrics: z.array(z.string().min(1).max(120)).max(8),
  tone: z.string().min(1).max(60),
  format: z.enum(["narrative", "bullets", "metrics", "timeline"]),
  /** 이 섹션에서 쓰면 안 되는 말. 추출이 어기면 재생성된다. */
  exclude: z.array(z.string().min(1).max(120)).max(8),
  takeaway: z.string().min(1).max(300),
  contentPattern: z.enum(["hero", "case-study", "metrics", "timeline", "capabilities", "about", "contact"]),
  interactionOpportunity: z.string().max(300).nullable(),
  items: z.array(RecipeDraftItemSchema).min(1).max(8),
});

export const RecipeDraftSchema = z
  .strictObject({
    plan: PortfolioPlanDraftCoreSchema,
    sections: z.array(RecipeDraftSectionSchema).min(3).max(7),
    /** 쓰지 않은 기록과 그 이유. 02b의 "이건 왜 안 썼나"가 이걸 읽는다. */
    unused: z.array(z.strictObject({
      source: z.number().int().min(1).max(40),
      reason: z.string().min(1).max(200),
    })).max(40),
  })
  .superRefine((draft, context) => {
    const titles = new Set<string>();
    for (const section of draft.sections) {
      const title = section.title.trim();
      if (titles.has(title)) {
        context.addIssue({
          code: "custom",
          message: `"${title}" 섹션이 두 번 있습니다`,
          path: ["sections"],
        });
      }
      titles.add(title);
    }
  });

export type RecipeDraft = z.infer<typeof RecipeDraftSchema>;
