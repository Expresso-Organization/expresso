import { z } from "zod";

import { TimestampSchema, UuidSchema } from "./common.js";

/**
 * Recipe v2 — 블루프린트.
 *
 * 02 레시피 단계가 저장하는 것은 **계획**이다. 무엇을 어떤 순서로, 어떤
 * 근거로, 어떤 모양으로 보여줄지까지. 완성 문장과 픽셀은 03 생성이 쓴다.
 *
 * 기준 문서는 `docs/architecture/portfolio-creation-flow-v2.md` §7 이다.
 */

// ── §7.9 요소와 표시 방식 ────────────────────────────────────────

/**
 * 표시 방식은 여섯 갈래로 묶여 있다. 요소 종류는 자기 갈래의 표시 방식만
 * 고른다 — 「수치 묶음」을 경력 요소에 걸 수는 없다.
 */
export const VariantGroupSchema = z.enum([
  "hero", "project", "metric", "career", "skills", "other",
]);
export type VariantGroup = z.infer<typeof VariantGroupSchema>;

export const BlueprintElementKindSchema = z.enum([
  "hero", "text", "project", "metric", "chart",
  "timeline", "gallery", "skills", "quote", "profile", "contact",
]);
export type BlueprintElementKind = z.infer<typeof BlueprintElementKindSchema>;

/** 요소 종류가 어느 갈래의 표시 방식을 고를 수 있는지. */
export const ELEMENT_VARIANT_GROUP: Record<BlueprintElementKind, VariantGroup> = {
  hero: "hero",
  project: "project",
  metric: "metric",
  chart: "metric",
  timeline: "career",
  skills: "skills",
  text: "other",
  gallery: "other",
  quote: "other",
  profile: "other",
  contact: "other",
};

/**
 * §7.9 의 서른세 가지 표시 방식.
 *
 * 이름은 디자인 문서(`DESIGN.html`)의 요소 갤러리가 그리는 견본과 같은 것을
 * 가리킨다. 인스펙터가 고르는 이름과 문서가 그리는 견본이 갈리면 사용자가
 * 고른 것과 보는 것이 달라진다.
 */
export const PRESENTATION_VARIANTS: Record<
  VariantGroup,
  ReadonlyArray<{ readonly id: string; readonly label: string }>
> = {
  hero: [
    { id: "display-sentence", label: "큰 문장" },
    { id: "split", label: "좌우 분할" },
    { id: "lead-metric", label: "대표 수치 중심" },
    { id: "image-led", label: "이미지 중심" },
    { id: "profile-card", label: "짧은 프로필 카드" },
  ],
  project: [
    { id: "problem-action-result", label: "문제-행동-결과" },
    { id: "case-study", label: "긴 사례 연구" },
    { id: "artifact-led", label: "아티팩트 중심" },
    { id: "metric-led", label: "수치 중심" },
    { id: "process-timeline", label: "과정 타임라인" },
    { id: "comparison", label: "여러 프로젝트 비교" },
  ],
  metric: [
    { id: "single-number", label: "큰 숫자 하나" },
    { id: "before-after", label: "전후 비교" },
    { id: "cluster", label: "수치 묶음" },
    { id: "bars", label: "막대 비교" },
    { id: "gauge", label: "도넛 또는 게이지" },
    { id: "annotated", label: "설명이 붙은 지표" },
  ],
  career: [
    { id: "vertical-timeline", label: "세로 타임라인" },
    { id: "by-organization", label: "조직별 묶음" },
    { id: "role-led", label: "역할 중심" },
    { id: "achievement-led", label: "성과 중심" },
    { id: "project-linked", label: "프로젝트 연결형" },
  ],
  skills: [
    { id: "tags", label: "태그" },
    { id: "category-list", label: "카테고리 목록" },
    { id: "evidence", label: "숙련 근거" },
    { id: "project-linked", label: "프로젝트 연결" },
    { id: "stack-table", label: "기술 스택 표" },
  ],
  other: [
    { id: "body", label: "본문" },
    { id: "gallery", label: "이미지 갤러리" },
    { id: "quote", label: "인용" },
    { id: "profile", label: "프로필" },
    { id: "contact", label: "연락 행동" },
    { id: "footer", label: "푸터" },
  ],
};

/** 요소 종류가 고를 수 있는 표시 방식. 인스펙터의 후보 목록이 이것이다. */
export function presentationVariantsFor(
  kind: BlueprintElementKind,
): ReadonlyArray<{ readonly id: string; readonly label: string }> {
  return PRESENTATION_VARIANTS[ELEMENT_VARIANT_GROUP[kind]];
}

/** 요소 종류가 처음 놓일 때의 표시 방식. 갈래의 첫 번째다. */
export function defaultPresentationVariant(kind: BlueprintElementKind): string {
  return presentationVariantsFor(kind)[0]!.id;
}

const VARIANT_IDS = [
  ...new Set(Object.values(PRESENTATION_VARIANTS).flatMap((group) => group.map(({ id }) => id))),
] as [string, ...string[]];

export const PresentationVariantSchema = z.enum(VARIANT_IDS);

// ── §7.11 계약 ──────────────────────────────────────────────────

export const BlueprintSourceBindingSchema = z.strictObject({
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
export type BlueprintSourceBinding = z.infer<typeof BlueprintSourceBindingSchema>;

export const BlueprintMediaBindingSchema = z.strictObject({
  mediaId: UuidSchema,
  order: z.number().int().nonnegative(),
});
export type BlueprintMediaBinding = z.infer<typeof BlueprintMediaBindingSchema>;

export const BlueprintElementSchema = z
  .strictObject({
    id: UuidSchema,
    order: z.number().int().nonnegative(),
    kind: BlueprintElementKindSchema,
    /** 이 자리에서 무엇을 말할지. §3.3 — 비어 있어도 유효하다. */
    intent: z.string().max(1_000),
    takeaway: z.string().max(500),
    presentationVariant: PresentationVariantSchema,
    emphasis: z.enum(["primary", "secondary", "supporting"]),
    width: z.enum(["narrow", "content", "wide", "full"]),
    targetLength: z.number().int().nonnegative().max(4_000),
    sourceBindings: z.array(BlueprintSourceBindingSchema).max(50),
    mediaBindings: z.array(BlueprintMediaBindingSchema).max(20),
    settings: z.record(z.string(), z.unknown()),
    /** §7.8 사용자 메모. */
    note: z.string().max(1_000),
  })
  .superRefine((element, ctx) => {
    const allowed = presentationVariantsFor(element.kind);
    if (!allowed.some(({ id }) => id === element.presentationVariant)) {
      ctx.addIssue({
        code: "custom",
        path: ["presentationVariant"],
        message: `${element.kind} does not support ${element.presentationVariant}`,
      });
    }
    if (element.sourceBindings.filter(({ role }) => role === "primary").length > 1) {
      ctx.addIssue({
        code: "custom",
        path: ["sourceBindings"],
        message: "an element keeps at most one primary source",
      });
    }
  });
export type BlueprintElement = z.infer<typeof BlueprintElementSchema>;

export const BlueprintSectionSchema = z.strictObject({
  id: UuidSchema,
  order: z.number().int().nonnegative(),
  title: z.string().max(300),
  purpose: z.string().max(1_000),
  takeaway: z.string().max(500),
  elements: z.array(BlueprintElementSchema).max(60),
});
export type BlueprintSection = z.infer<typeof BlueprintSectionSchema>;

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
export const BlueprintJobPostingSchema = z.strictObject({
  jobPostingId: UuidSchema,
  title: z.string().min(1).max(300),
  companyName: z.string().min(1).max(200),
  sourceUrl: z.string().max(2_000).nullable(),
  deadlineNote: z.string().max(60).nullable(),
  expiresAt: TimestampSchema.nullable(),
});
export type BlueprintJobPosting = z.infer<typeof BlueprintJobPostingSchema>;

export const BlueprintUnusedSourceSchema = z.strictObject({
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
  jobPosting: BlueprintJobPostingSchema.nullable(),
  selectedRecordIds: z.array(UuidSchema).max(50),
  sections: z.array(BlueprintSectionSchema).max(30),
  unusedSources: z.array(BlueprintUnusedSourceSchema).max(50),
  status: z.enum(["draft", "confirmed"]),
  updatedAt: TimestampSchema,
});
export type RecipeV2 = z.infer<typeof RecipeV2Schema>;

export const RecipeV2ResponseSchema = z.strictObject({ data: RecipeV2Schema });

// ── §7.2 GUI 편집 연산 ──────────────────────────────────────────

const TitleSchema = z.string().trim().max(300);

export const BlueprintEditSchema = z.discriminatedUnion("operation", [
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
    operation: z.literal("add_element"),
    sectionId: UuidSchema,
    kind: BlueprintElementKindSchema,
    /** 놓을 자리. 비우면 섹션 끝. */
    order: z.number().int().nonnegative().optional(),
  }),
  z.strictObject({
    operation: z.literal("update_element"),
    elementId: UuidSchema,
    kind: BlueprintElementKindSchema.optional(),
    intent: z.string().trim().max(1_000).optional(),
    takeaway: z.string().trim().max(500).optional(),
    presentationVariant: PresentationVariantSchema.optional(),
    emphasis: z.enum(["primary", "secondary", "supporting"]).optional(),
    width: z.enum(["narrow", "content", "wide", "full"]).optional(),
    targetLength: z.number().int().nonnegative().max(4_000).optional(),
    note: z.string().trim().max(1_000).optional(),
  }),
  z.strictObject({ operation: z.literal("duplicate_element"), elementId: UuidSchema }),
  z.strictObject({ operation: z.literal("delete_element"), elementId: UuidSchema }),
  z.strictObject({
    operation: z.literal("bind_source"),
    elementId: UuidSchema,
    sourceType: z.enum(["record", "answer", "requirement"]),
    sourceId: UuidSchema,
    role: z.enum(["primary", "supporting"]),
  }),
  z.strictObject({ operation: z.literal("unbind_source"), elementId: UuidSchema, sourceId: UuidSchema }),
]);
export type BlueprintEdit = z.infer<typeof BlueprintEditSchema>;

/**
 * §11.3 — 순서는 최종 상태를 한 요청으로 받는다.
 *
 * drop 한 번에 저장 한 번이다. 섹션 사이로 옮긴 요소도 같은 요청에 담긴다 —
 * 배열의 자리가 곧 순서다.
 */
export const BlueprintReorderSchema = z.strictObject({
  sections: z
    .array(
      z.strictObject({
        sectionId: UuidSchema,
        elementIds: z.array(UuidSchema).max(60),
      }),
    )
    .max(30),
});
export type BlueprintReorder = z.infer<typeof BlueprintReorderSchema>;

export const BlueprintEditResultSchema = z.strictObject({
  recipe: RecipeV2Schema,
  revisionId: UuidSchema,
});
