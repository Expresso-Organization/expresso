import { z } from "zod";
import {
  DEFAULT_PORTFOLIO_ARCHETYPE,
  PortfolioArchetypeSchema,
  type PortfolioArchetype,
} from "./portfolio-archetype.js";
import { MEDIA_ASSET_PATH_PREFIX } from "./media-path.js";

const id = z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9-]{0,99}$/);
const text = z.string().max(20_000);
const binding = z.strictObject({
  $state: z
    .string()
    .regex(
      /^\/(profile|sections|career|evidence|contact|sectionById\/[a-zA-Z0-9-]+)$/,
    ),
});
export const StructuredMediaSchema = z.strictObject({
  src: z
    .string()
    .max(2_000_000)
    .refine(
      (value) =>
        (value.startsWith(MEDIA_ASSET_PATH_PREFIX) &&
          /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(?:\?w=\d+)?$/i.test(
            value.slice(MEDIA_ASSET_PATH_PREFIX.length),
          )) ||
        /^data:image\/(?:png|jpeg|webp|svg\+xml);base64,[A-Za-z0-9+/=]+$/.test(
          value,
        ),
      "허용된 프로젝트 자산이 필요합니다.",
    ),
  alt: z.string().min(1).max(500),
  origin: z.enum(["uploaded", "fictional"]),
});
export const StructuredSectionSchema = z.strictObject({
  id,
  title: z.string().min(1).max(300),
  summary: text,
  body: text,
  pattern: z.enum(["project", "about", "skills", "career"]),
  // 출처에 적힌 기간(예: "2025.08 — 2026.02"). 출처에 없으면 비웁니다. 글 · 목록형 행의 앞자리에 씁니다.
  period: z.string().min(1).max(60).optional(),
  details: z
    .array(z.strictObject({ label: z.string().min(1).max(100), text }))
    .max(12),
  media: z.array(StructuredMediaSchema).max(8),
  sourceIds: z.array(id).max(30),
  /**
   * 원문에서 찾은 수치입니다. `before`가 있으면 전후 비교로 그립니다. 값은 원문 대조(`ungroundedNumbers`)를 지난 것만 남깁니다.
   * 설계가 먼저 오는 생성에서 채우고, 옛 저장본에는 없습니다.
   */
  metrics: z
    .array(
      z.strictObject({
        label: z.string().min(1).max(40),
        value: z.string().min(1).max(24),
        before: z.string().min(1).max(24).optional(),
        note: z.string().max(80).optional(),
      }),
    )
    .max(4)
    .optional(),
  /** 큰 글자 한 문장(`PullQuote`)으로 보일 이 작업의 판단 · 원칙입니다. 설계가 먼저 오는 생성에서 채웁니다. */
  quote: z.string().min(1).max(200).optional(),
  /** 과정 흐름(`CaseFlow`)의 단계입니다. 순서대로 두며, 번호는 렌더러가 배열 순서로 매깁니다. */
  steps: z
    .array(z.strictObject({ label: z.string().min(1).max(40), text: z.string().max(200) }))
    .max(6)
    .optional(),
});
type StructuredMetric = NonNullable<z.infer<typeof StructuredSectionSchema>["metrics"]>[number];
const LEADING_NUMBER = /^[+\-−~≈]?\s?(\d+(?:\.\d+)?)/;

/**
 * "3.8초" · "420KB" · "1,200만 건"처럼 숫자로 시작하는 값에서 그 숫자를 읽습니다. 숫자로 시작하지 않으면 null입니다.
 * 글 중간의 숫자는 읽지 않습니다. 청사진의 자리 표지(`⟦12⟧`)나 "약 3배" 같은 값에서 엉뚱한 비율이 나오지 않습니다.
 */
export function metricNumber(value: string): number | null {
  const match = value.replace(/,/g, "").match(LEADING_NUMBER);
  return match ? Number(match[1]) : null;
}

/** 값에서 앞자리 숫자를 뗀 나머지(단위)입니다. "1,200만 건" → "만 건", "80%" → "%". */
export function metricUnit(value: string): string {
  return value.replace(/,/g, "").replace(LEADING_NUMBER, "").trim();
}

/** 막대 길이로 견줄 수 있는 수치 목록인지 봅니다. 두 개 이상이고, 모두 숫자로 시작하고, 단위가 같아야 합니다. */
export function comparableMetrics(metrics: readonly StructuredMetric[] | undefined): boolean {
  return (
    !!metrics &&
    metrics.length >= 2 &&
    metrics.every((metric) => metricNumber(metric.value) !== null) &&
    new Set(metrics.map((metric) => metricUnit(metric.value))).size === 1
  );
}

/** 프로필의 모양입니다. 이름 아래 한 문장 규칙은 저장 계약에서 따로 검사합니다. */
export const StructuredProfileSchema = z.strictObject({
  name: z.string().min(1).max(200),
  role: z.string().min(1).max(200),
  headline: z.string().min(1).max(160),
  intro: text,
  focus: z.array(z.string().max(100)).max(8),
});
export const StructuredPortfolioContentSchema = z.strictObject({
  version: z.literal(1),
  profile: StructuredProfileSchema.superRefine((value, context) => {
    const sentence = value.headline.trim(),
      length = [...sentence].reduce(
        (sum, char) => sum + (/\p{Script=Hangul}/u.test(char) ? 2 : 1),
        0,
      );
    if (
      /[\r\n]/.test(sentence) ||
      length > 72 ||
      !/[.!?。！？]$/.test(sentence) ||
      [...sentence.matchAll(/[.!?。！？]/g)].length !== 1
    )
      context.addIssue({
        code: "custom",
        path: ["headline"],
        message:
          "이름 아래 소개는 줄바꿈 없이 마침표·물음표·느낌표 하나로 끝나는 한 문장이어야 합니다(한글 기준 36자 이내).",
      });
  }),
  sections: z.array(StructuredSectionSchema).min(1).max(16),
  career: z
    .array(
      z.strictObject({
        id,
        period: text,
        organization: text,
        role: text,
        description: text,
      }),
    )
    .max(12),
  evidence: z
    .array(
      z.strictObject({
        id,
        title: text,
        kind: text,
        summary: text,
        body: text,
      }),
    )
    .max(40),
  contact: z
    .strictObject({
      label: z.string().max(200),
      href: z
        .string()
        .max(2_000)
        .refine((value) =>
          /^(mailto:[^\s]+@[^\s]+|https:\/\/[^\s]+)$/.test(value),
        ),
    })
    .nullable(),
});
/**
 * 내용 정리 모델 호출의 출력 스키마입니다.
 *
 * 연락처는 입력 경로가 없어 생성기가 null로 정하므로 모델에게 묻지 않습니다. 이름 아래
 * 한 문장 규칙은 공급자 스키마로 표현되지 않으므로, 받은 뒤 저장 계약으로 검사하고
 * 어기면 오류를 붙여 다시 요청합니다.
 */
export const StructuredContentModelSchema =
  StructuredPortfolioContentSchema.omit({
    contact: true,
  }).extend({ profile: StructuredProfileSchema });
export type StructuredContentModel = z.infer<
  typeof StructuredContentModelSchema
>;
export type StructuredPortfolioContent = z.infer<
  typeof StructuredPortfolioContentSchema
>;
export type StructuredSection = z.infer<typeof StructuredSectionSchema>;
// 색 묶음과 서체 종류는 수집 원본으로 그린 저장본만 씁니다. 새 생성은 디자인 시스템의 색·서체로 그리므로 비웁니다.
export const StructuredDesignSchema = z.strictObject({
  layout: z.enum(["editorial", "gallery", "dossier", "library"]),
  palette: z.enum(["ivory", "cobalt", "graphite", "sage", "burgundy"]).optional(),
  font: z.enum(["serif", "sans", "mono"]).optional(),
});
/** 사례 상세형의 첫 화면 구도: 큰 문장 · 좌우 분할 · 이미지 중심. */
export const STRUCTURED_INTRO_VARIANTS = ["statement", "split", "media"] as const;
/** 저장 계약이 받는 첫 화면 구도 전부. poster는 포스터형, sentence는 글 · 목록형 전용입니다. */
export const STRUCTURED_INTRO_ALL_VARIANTS = [...STRUCTURED_INTRO_VARIANTS, "poster", "sentence"] as const;
/** 저장 계약이 받는 목차 형태. poster는 포스터형 전용입니다. timeline은 섹션 기간을 두 개 이상 읽을 때 작업 기간 차트로 그립니다. */
export const STRUCTURED_INDEX_VARIANTS = ["rows", "mosaic", "rail", "poster", "timeline"] as const;
/** 경력 형태. chart는 기간을 두 개 이상 읽을 때 경력 기간 차트로 그립니다. 없으면(옛 저장본) list입니다. */
export const STRUCTURED_CAREER_VARIANTS = ["list", "chart"] as const;
export const STRUCTURED_CASE_TYPES = [
  // 전후 수치를 막대로 비교합니다. 이전 값이 있는 수치가 하나 이상 필요합니다.
  "CaseBeforeAfter",
  // 단계(steps) 두 개 이상을 가로 흐름으로 그립니다.
  "CaseFlow",
  // 같은 단위 수치 두 개 이상(`comparableMetrics`)을 가로 막대 차트로 그립니다.
  "CaseBars",
  // 제공 이미지 한 장을 크게 두고 제목 · 요약을 그 아래 띠에 둡니다.
  "CaseShowcase",
  "CaseEssay",
  "CaseGallery",
  "CaseTechnical",
  "CaseProcess",
  "ContentPanel",
  // 글 · 목록형 전용: "기간 · 제목 · 요약" 한 줄을 펼쳐 상세를 봅니다.
  "CaseRow",
] as const;
/**
 * 유형마다 모델이 쓸 수 있는 사례 유형입니다. 글 · 목록형은 사례 행만, 나머지는 사례 행을 뺀 다섯 가지입니다.
 * 출력 스키마와 Spec 프롬프트의 카탈로그 설명이 이 목록을 함께 씁니다.
 */
export function archetypeCaseTypes(archetype: PortfolioArchetype): readonly (typeof STRUCTURED_CASE_TYPES)[number][] {
  return archetype === "list" ? ["CaseRow"] : STRUCTURED_CASE_TYPES.filter((type) => type !== "CaseRow");
}
// 모델이 지면을 나누는 컨테이너입니다. 자식은 json-render의 기본 slot(children)에 둡니다.
export const STRUCTURED_GROUP_TYPES = ["Columns", "Grid", "Band"] as const;
export type StructuredGroupType = (typeof STRUCTURED_GROUP_TYPES)[number];
export const STRUCTURED_GROUP_VARIANTS = {
  Columns: ["even", "wide-start", "wide-end"],
  Grid: ["even"],
  Band: ["panel", "accent"],
} as const satisfies Record<StructuredGroupType, readonly string[]>;
// 컨테이너별 자식 수 [최소, 최대]입니다.
export const STRUCTURED_GROUP_CHILDREN: Record<StructuredGroupType, [number, number]> = {
  Columns: [2, 2],
  Grid: [2, 3],
  Band: [1, 3],
};
export const STRUCTURED_MAX_GROUPS = 4;
export const STRUCTURED_GROUP_VARIANT_VALUES = [
  ...new Set(Object.values(STRUCTURED_GROUP_VARIANTS).flat()),
] as [string, ...string[]];
/**
 * 요소 하나의 지면 변화입니다. 섹션마다 크기 · 배경 · 폭을 바꿔 지면이 같은 모양의 반복이 되지 않게 합니다.
 * scale=크기(lead는 사례 첫머리를 크게 그리는 표지), surface=배경(canvas 기본 · field 디자인 색면 · inverse 반전),
 * width=폭(content 본문 폭 · bleed 창 폭 전체). 옛 저장본에는 없고, 없으면 standard · canvas · content입니다.
 */
export const STRUCTURED_SCALES = ["lead", "standard", "compact"] as const;
export const STRUCTURED_SURFACES = ["canvas", "field", "inverse"] as const;
export const STRUCTURED_WIDTHS = ["content", "bleed"] as const;
const stageProps = {
  scale: z.enum(STRUCTURED_SCALES).optional(),
  surface: z.enum(STRUCTURED_SURFACES).optional(),
  width: z.enum(STRUCTURED_WIDTHS).optional(),
};
/** 지면에 둘 수 있는 큰 인용(`PullQuote`)의 최대 개수입니다. */
export const STRUCTURED_MAX_QUOTES = 2;
const leaf =<T extends string, P extends z.ZodType>(type: T, props: P) =>
  z.strictObject({
    type: z.literal(type),
    props,
    children: z.array(z.never()).max(0),
  });
export const StructuredNodeSchema = z.union([
  z.strictObject({
    type: z.literal("PortfolioPage"),
    props: z.strictObject({
      profile: binding,
      design: StructuredDesignSchema,
      motion: z.enum(["none", "subtle", "showcase"]),
      rationale: z.string().min(1).max(400),
      referenceIds: z.array(id).max(8).optional(),
      // 페이지 짜임새. 생성기가 채우고, 없으면(옛 저장본) 사례 상세형으로 그립니다.
      archetype: PortfolioArchetypeSchema.optional(),
    }),
    children: z.array(id).min(2).max(24),
  }),
  leaf(
    "NameIntro",
    z.strictObject({
      profile: binding,
      sections: binding.optional(),
      sourceId: id.optional(),
      // 키트 경로의 첫 화면 구도입니다. media는 섹션 이미지가 있을 때만 그 구도로 그립니다.
      variant: z.enum(STRUCTURED_INTRO_ALL_VARIANTS).optional(),
    }),
  ),
  leaf(
    "ProjectIndex",
    z.strictObject({
      sections: binding,
      variant: z.enum(STRUCTURED_INDEX_VARIANTS),
    }),
  ),
  ...STRUCTURED_CASE_TYPES.map((type) =>
    leaf(type, z.strictObject({ section: binding, sourceId: id.optional(), ...stageProps })),
  ),
  // 섹션들의 대표 수치를 한 줄로 크게 보입니다. 수치가 두 개 이상일 때만 둡니다.
  leaf("MetricStrip", z.strictObject({ sections: binding, ...stageProps })),
  // 한 섹션의 quote를 큰 글자 한 문장으로 보입니다. 사례와 별개 요소라 같은 섹션을 한 번 더 참조합니다.
  leaf("PullQuote", z.strictObject({ section: binding, ...stageProps })),
  leaf("CareerTimeline", z.strictObject({ career: binding, variant: z.enum(STRUCTURED_CAREER_VARIANTS).optional() })),
  leaf("EvidenceGrid", z.strictObject({ evidence: binding })),
  leaf("Contact", z.strictObject({ contact: binding })),
  // type과 variant의 짝은 validateStructuredPortfolio가 읽을 수 있는 메시지로 검사합니다.
  z.strictObject({
    type: z.enum(STRUCTURED_GROUP_TYPES),
    props: z.strictObject({ variant: z.enum(STRUCTURED_GROUP_VARIANT_VALUES) }),
    children: z.array(id).min(1).max(3),
  }),
]);
export const StructuredPortfolioSpecSchema = z.strictObject({
  root: id,
  elements: z.record(id, StructuredNodeSchema),
});
export type StructuredPortfolioSpec = z.infer<
  typeof StructuredPortfolioSpecSchema
>;
type StructuredNode = StructuredPortfolioSpec["elements"][string];
export const isStructuredGroup = (
  node: StructuredNode | undefined,
): node is Extract<StructuredNode, { type: StructuredGroupType }> =>
  !!node &&
  (STRUCTURED_GROUP_TYPES as readonly string[]).includes(node.type);
/** 페이지에서 깊이 우선으로 요소를 모읍니다. 컨테이너 자체는 제외하고 부모 ID를 함께 돌려줍니다. */
export function structuredLeaves(spec: StructuredPortfolioSpec) {
  const root = spec.elements[spec.root];
  if (root?.type !== "PortfolioPage") return [];
  return root.children.flatMap((key) => {
    const node = spec.elements[key];
    return isStructuredGroup(node)
      ? node.children.map((child) => ({
          key: child,
          node: spec.elements[child],
          parent: key,
        }))
      : [{ key, node, parent: spec.root }];
  });
}
/**
 * 설계가 먼저 오는 생성의 지면 설계입니다.
 *
 * 설계 모델이 Spec과 함께 냅니다. 섹션마다 실을지, 어떤 시각 형태로 보일지, 칸마다 글자 수를 정하고,
 * 글 채우기는 이 예산을 출력 스키마의 최대 길이로 받습니다.
 */
export const STRUCTURED_DESIGN_FORMS = ["before-after", "bars", "flow", "process", "showcase", "technical", "essay", "row"] as const;
export const StructuredDesignPlanSchema = z.strictObject({
  /** 지면 전체의 콘셉트 한 문장입니다. 글 채우기가 문체와 강조를 맞출 때 읽습니다. */
  concept: z.string().min(1).max(300),
  profile: z.strictObject({
    intro: z.number().int().min(0).max(400),
    focus: z.number().int().min(0).max(6),
  }),
  sections: z
    .array(
      z.strictObject({
        id,
        include: z.boolean(),
        pattern: z.enum(["project", "about", "skills", "career"]),
        form: z.enum(STRUCTURED_DESIGN_FORMS),
        /** 섹션의 크기입니다. Spec 사례 노드의 scale로 옮겨 그립니다. */
        emphasis: z.enum(STRUCTURED_SCALES),
        // 배경 · 폭과 인용 · 단계 예산은 시각 부품을 더하며 생겼습니다. 그 전에 남긴 생성 기록에는 없습니다.
        surface: z.enum(STRUCTURED_SURFACES).optional(),
        width: z.enum(STRUCTURED_WIDTHS).optional(),
        budget: z.strictObject({
          title: z.number().int().min(8).max(60),
          summary: z.number().int().min(0).max(160),
          body: z.number().int().min(0).max(600),
          details: z.number().int().min(0).max(6),
          metrics: z.number().int().min(0).max(4),
          quote: z.number().int().min(0).max(60).optional(),
          steps: z.number().int().min(0).max(6).optional(),
        }),
        /** 이 섹션에 붙일 제공 이미지의 src입니다. */
        media: z.array(z.string().max(2_000_000)).max(4),
      }),
    )
    .min(1)
    .max(16),
  evidence: z.boolean(),
  career: z.boolean(),
});
export type StructuredDesignPlan = z.infer<typeof StructuredDesignPlanSchema>;

export const StructuredPortfolioSnapshotSchema = z.strictObject({
  version: z.literal(1),
  content: StructuredPortfolioContentSchema,
  spec: StructuredPortfolioSpecSchema,
});
export type StructuredPortfolioSnapshot = z.infer<
  typeof StructuredPortfolioSnapshotSchema
>;
export const EditStructuredPageSchema = z
  .strictObject({
    expectedRevision: z.number().int().nonnegative(),
    spec: StructuredPortfolioSpecSchema.optional(),
    patches: z
      .array(
        z.strictObject({
          path: z
            .string()
            .regex(
              /^\/(?:profile\/(?:name|role|headline|intro)|sections\/[a-zA-Z0-9-]+\/(?:title|summary|body|details\/\d+\/text))$/,
            ),
          value: z.string().max(20_000),
        }),
      )
      .max(32)
      .default([]),
  })
  .refine(
    (value) => !!value.spec || value.patches.length > 0,
    "바꿀 구성이나 문장이 필요합니다.",
  );
export type EditStructuredPage = z.infer<typeof EditStructuredPageSchema>;

export function applyStructuredTextPatches(
  input: StructuredPortfolioContent,
  patches: EditStructuredPage["patches"],
): StructuredPortfolioContent {
  const copy = structuredClone(input);
  const seen = new Set<string>();
  for (const patch of patches) {
    if (seen.has(patch.path))
      throw new Error("같은 문장을 두 번 변경할 수 없습니다.");
    seen.add(patch.path);
    const parts = patch.path.split("/").slice(1);
    if (parts[0] === "profile") {
      const key = parts[1];
      if (!key || !["name", "role", "headline", "intro"].includes(key))
        throw new Error("허용되지 않은 프로필 경로입니다.");
      (copy.profile as Record<string, unknown>)[key] = patch.value;
    } else {
      const section = copy.sections.find((item) => item.id === parts[1]);
      if (!section) throw new Error("편집할 섹션이 없습니다.");
      if (parts[2] === "details") {
        const item = section.details[Number(parts[3])];
        if (!item || parts[4] !== "text")
          throw new Error("편집할 설명이 없습니다.");
        item.text = patch.value;
      } else {
        const key = parts[2];
        if (!key || !["title", "summary", "body"].includes(key))
          throw new Error("허용되지 않은 섹션 경로입니다.");
        (section as Record<string, unknown>)[key] = patch.value;
      }
    }
  }
  return StructuredPortfolioContentSchema.parse(copy);
}
/**
 * 요소 ID와 참조는 입력에서 고정하고 순서와 지면 유형은 모델이 선택합니다.
 *
 * 페이지의 `design`은 모델이 고르지 않습니다. 배치는 고른 디자인 시스템이 정하고, 생성기가
 * 검사 전에 저장 계약의 `design.layout`을 채웁니다. 그래서 이 스키마의 출력은 그대로 저장
 * 계약(`StructuredPortfolioSpec`)이 아닙니다. `groups`가 빈 배열이면 컨테이너를 만들 수 없습니다.
 */
export function structuredModelSchema(
  content: StructuredPortfolioContent,
  choices?: {
    intro: string[];
    section: string[];
    guidance: string[];
    groups?: readonly StructuredGroupType[];
    /** 페이지 짜임새. 첫 화면 구도 · 목차 · 사례 유형의 선택지가 유형마다 다릅니다. */
    archetype?: PortfolioArchetype;
  },
): z.ZodType {
  const archetype = choices?.archetype ?? DEFAULT_PORTFOLIO_ARCHETYPE;
  const hasMedia = content.sections.some((section) => section.media.length);
  const ref = (value: string) =>
    z.strictObject({ $state: z.literal(`/${value}`) });
  const empty = z.array(z.string()).max(0);
  // 글 · 목록형은 사례 행을 같은 모양으로 이어 붙이는 유형이라 지면 변화를 두지 않습니다.
  const stage = archetype === "list" ? {} : stageProps;
  const nodes: Record<string, z.ZodType> = {
    intro: z.strictObject({
      type: z.literal("NameIntro"),
      props: z.strictObject({
        profile: ref("profile"),
        sections: ref("sections"),
        variant:
          archetype === "poster"
            ? z.literal("poster")
            : archetype === "list"
              ? z.literal("sentence")
              : z.enum(hasMedia ? STRUCTURED_INTRO_VARIANTS : ["statement", "split"]),
        ...(choices?.intro.length
          ? { sourceId: z.enum(choices.intro as [string, ...string[]]) }
          : {}),
      }),
      children: empty,
    }),
    // 글 · 목록형은 사례 행 자체가 목록이라 목차를 두지 않습니다.
    ...(archetype === "list"
      ? {}
      : {
          index: z.strictObject({
            type: z.literal("ProjectIndex"),
            props: z.strictObject({
              sections: ref("sections"),
              variant: archetype === "poster" ? z.literal("poster") : z.enum(["rows", "mosaic", "rail", "timeline"]),
            }),
            children: empty,
          }),
        }),
  };
  for (const section of content.sections)
    nodes[`section-${section.id}`] = z.strictObject({
      type: z.enum(
        archetypeCaseTypes(archetype).filter(
          (type) =>
            (section.media.length || (type !== "CaseGallery" && type !== "CaseShowcase")) &&
            (type !== "CaseBeforeAfter" || !!section.metrics?.some((metric) => metric.before)) &&
            (type !== "CaseBars" || comparableMetrics(section.metrics)) &&
            (type !== "CaseFlow" || (section.steps?.length ?? 0) >= 2),
        ) as [string, ...string[]],
      ),
      props: z.strictObject({
        section: ref(`sectionById/${section.id}`),
        ...(choices?.section.length
          ? { sourceId: z.enum(choices.section as [string, ...string[]]) }
          : {}),
        ...stage,
      }),
      children: empty,
    });
  // 수치가 두 개 이상이면 수치 강조 줄을 둘 수 있습니다. 두지 않아도 됩니다.
  const optionalNodes: Record<string, z.ZodType> = {};
  if (archetype !== "list" && content.sections.flatMap((section) => section.metrics ?? []).length >= 2)
    optionalNodes.metrics = z.strictObject({
      type: z.literal("MetricStrip"),
      props: z.strictObject({ sections: ref("sections"), ...stage }),
      children: empty,
    });
  // quote가 있는 섹션은 큰 인용으로 한 번 더 보일 수 있습니다. 섹션 참조의 중복은 도메인 검사가 봅니다.
  const quotable = content.sections.filter((section) => section.quote);
  if (archetype !== "list" && quotable.length)
    for (let index = 1; index <= Math.min(STRUCTURED_MAX_QUOTES, quotable.length); index++)
      optionalNodes[`quote-${index}`] = z.strictObject({
        type: z.literal("PullQuote"),
        props: z.strictObject({
          section: z.strictObject({ $state: z.enum(quotable.map((section) => `/sectionById/${section.id}`) as [string, ...string[]]) }),
          ...stage,
        }),
        children: empty,
      });
  if (content.career.length)
    nodes.career = z.strictObject({
      type: z.literal("CareerTimeline"),
      // 형태는 고르지 않아도 됩니다. 없으면 목록입니다. 형태를 더하기 전에 남긴 설계 출력도 그대로 받습니다.
      props: z.strictObject({ career: ref("career"), variant: z.enum(STRUCTURED_CAREER_VARIANTS).optional() }),
      children: empty,
    });
  if (content.evidence.length)
    nodes.evidence = z.strictObject({
      type: z.literal("EvidenceGrid"),
      props: z.strictObject({ evidence: ref("evidence") }),
      children: empty,
    });
  if (content.contact)
    nodes.contact = z.strictObject({
      type: z.literal("Contact"),
      props: z.strictObject({ contact: ref("contact") }),
      children: empty,
    });
  const nodeIds = [...Object.keys(nodes), ...Object.keys(optionalNodes)] as [string, ...string[]];
  // 소개와 연락처는 페이지의 처음과 끝에만 둡니다. 나머지는 컨테이너에 넣을 수 있습니다.
  const groupable = nodeIds.filter(
    (key) => key !== "intro" && key !== "contact",
  ) as [string, ...string[]];
  // 포스터형 · 글 · 목록형은 섹션을 페이지 폭 그대로 이어 붙이므로 컨테이너를 쓰지 않습니다.
  const groupTypes = archetype === "case-study" ? choices?.groups ?? STRUCTURED_GROUP_TYPES : [];
  const groupIds = Array.from(
    { length: groupTypes.length ? STRUCTURED_MAX_GROUPS : 0 },
    (_, index) => `group-${index + 1}`,
  );
  const group = z.strictObject({
    type: z.enum(groupTypes as [StructuredGroupType, ...StructuredGroupType[]]),
    // type과 variant의 짝은 도메인 검사에서 확인합니다. 공급자 공통 문법을 위해 union을 쓰지 않습니다.
    props: z.strictObject({
      variant: z.enum(STRUCTURED_GROUP_VARIANT_VALUES),
    }),
    children: z.array(z.enum(groupable)).min(1).max(3),
  });
  const page = z.strictObject({
    type: z.literal("PortfolioPage"),
    props: z.strictObject({
      profile: ref("profile"),
      ...(choices?.guidance.length
        ? {
            referenceIds: z
              .array(z.enum(choices.guidance as [string, ...string[]]))
              .max(8),
          }
        : {}),
      motion: z.enum(["none", "subtle", "showcase"]),
      rationale: z.string().min(1).max(400),
    }),
    // 공급자 공통 배열 문법을 사용하고 소개·연락처 위치와 중복·누락은 아래 도메인 검사에서 검증합니다.
    children: z
      .array(z.enum([...nodeIds, ...groupIds] as [string, ...string[]]))
      .min(2)
      .max(nodeIds.length + groupIds.length),
  });
  return z.strictObject({
    root: z.literal("page"),
    elements: z.strictObject({
      page,
      ...nodes,
      ...Object.fromEntries(Object.entries(optionalNodes).map(([key, node]) => [key, node.optional()])),
      ...Object.fromEntries(groupIds.map((key) => [key, group.optional()])),
    }),
  });
}

/** 모델과 직접 편집에 동일한 내용·참조·순서 검사를 적용합니다. */
export function validateStructuredPortfolio(
  raw: unknown,
  input: unknown,
): StructuredPortfolioSnapshot {
  const content = StructuredPortfolioContentSchema.parse(input),
    spec = StructuredPortfolioSpecSchema.parse(raw);
  const root = spec.elements[spec.root];
  if (root?.type !== "PortfolioPage")
    throw new Error("PortfolioPage 루트가 필요합니다.");
  // 페이지 → 컨테이너 → 요소의 한 단계 트리만 허용합니다. 모든 요소는 트리에서 정확히 한 번 나타나야 합니다.
  const visits = new Map<string, number>();
  const visit = (key: string) => visits.set(key, (visits.get(key) ?? 0) + 1);
  const nodes: (StructuredNode | undefined)[] = [];
  let groups = 0;
  for (const key of root.children) {
    visit(key);
    const node = spec.elements[key];
    if (!isStructuredGroup(node)) {
      nodes.push(node);
      continue;
    }
    groups++;
    const [min, max] = STRUCTURED_GROUP_CHILDREN[node.type];
    if (
      !(STRUCTURED_GROUP_VARIANTS[node.type] as readonly string[]).includes(
        node.props.variant,
      )
    )
      throw new Error(
        `${node.type}에 사용할 수 없는 variant입니다: ${node.props.variant}.`,
      );
    if (node.children.length < min || node.children.length > max)
      throw new Error(
        `${node.type}의 자식은 ${min === max ? `${min}개` : `${min}–${max}개`}여야 합니다.`,
      );
    for (const child of node.children) {
      visit(child);
      const inner = spec.elements[child];
      if (
        !inner ||
        isStructuredGroup(inner) ||
        ["PortfolioPage", "NameIntro", "Contact"].includes(inner.type)
      )
        throw new Error(
          `컨테이너 ${key}에 넣을 수 없는 요소입니다: ${child}. 컨테이너에는 사례·목차·경력·근거만 넣습니다.`,
        );
      nodes.push(inner);
    }
  }
  if (
    Object.keys(spec.elements).length > 30 ||
    groups > STRUCTURED_MAX_GROUPS ||
    [...visits.values()].some((count) => count > 1) ||
    Object.keys(spec.elements).some(
      (key) => key !== spec.root && !visits.has(key),
    )
  ) {
    const duplicate = [...visits].flatMap(([key, count]) =>
      count > 1 ? [key] : [],
    );
    const missing = Object.keys(spec.elements).filter(
      (key) => key !== spec.root && !visits.has(key),
    );
    throw new Error(
      `트리의 중복 ID: ${duplicate.join(", ") || "없음"}; 누락 ID: ${missing.join(", ") || "없음"}; 컨테이너 ${groups}개(최대 ${STRUCTURED_MAX_GROUPS}개). 모든 요소를 트리 전체에서 한 번씩 연결해야 합니다.`,
    );
  }
  if (nodes.some((node) => !node || node.type === "PortfolioPage"))
    throw new Error("허용되지 않은 섹션 연결입니다.");
  if (
    spec.elements[root.children[0] ?? ""]?.type !== "NameIntro" ||
    nodes.filter((node) => node?.type === "NameIntro").length !== 1
  )
    throw new Error("이름과 자기 정의를 첫 섹션에 한 번 표시해야 합니다.");
  if (root.props.profile.$state !== "/profile")
    throw new Error("프로필 참조가 올바르지 않습니다.");
  for (const node of nodes)
    if (
      node?.type === "NameIntro" &&
      node.props.sections &&
      node.props.sections.$state !== "/sections"
    )
      throw new Error("첫 화면의 프로젝트 참조가 올바르지 않습니다.");
  const sourceIds = new Set(content.evidence.map((item) => item.id)),
    sections = new Map(
      content.sections.map((section) => [section.id, section]),
    );
  if (
    sections.size !== content.sections.length ||
    sourceIds.size !== content.evidence.length
  )
    throw new Error("입력 식별자가 중복됩니다.");
  for (const section of content.sections)
    if (section.sourceIds.some((key) => !sourceIds.has(key)))
      throw new Error("입력 근거가 누락되었습니다.");
  const seen = new Set<string>();
  const quoted = new Set<string>();
  const counts = new Map<string, number>();
  for (const node of nodes) {
    if (!node) throw new Error("연결된 요소가 없습니다.");
    counts.set(node.type, (counts.get(node.type) ?? 0) + 1);
    if (
      STRUCTURED_CASE_TYPES.includes(
        node.type as (typeof STRUCTURED_CASE_TYPES)[number],
      )
    ) {
      const props = node.props as { section: { $state: string } };
      const key = props.section.$state.replace(/^\/sectionById\//, ""),
        section = sections.get(key);
      if (
        !section ||
        props.section.$state !== `/sectionById/${key}` ||
        seen.has(key)
      )
        throw new Error("사례 참조가 없거나 중복됩니다.");
      if (node.type === "CaseGallery" && !section.media.length)
        throw new Error("갤러리 사례에는 제공 이미지가 필요합니다.");
      if (node.type === "CaseProcess" && section.details.length < 2)
        throw new Error("과정 사례에는 두 개 이상의 설명이 필요합니다.");
      if (node.type === "CaseBeforeAfter" && !section.metrics?.some((metric) => metric.before))
        throw new Error("전후 비교 사례에는 이전 값이 있는 수치가 필요합니다.");
      if (node.type === "CaseBars" && !comparableMetrics(section.metrics))
        throw new Error("막대 차트 사례에는 같은 단위로 시작하는 수치가 두 개 이상 필요합니다.");
      if (node.type === "CaseFlow" && (section.steps?.length ?? 0) < 2)
        throw new Error("과정 흐름 사례에는 두 개 이상의 단계가 필요합니다.");
      if (node.type === "CaseShowcase" && !section.media.length)
        throw new Error("이미지 전시 사례에는 제공 이미지가 필요합니다.");
      seen.add(key);
    } else if (node.type === "PullQuote") {
      const binding = node.props.section.$state;
      const key = binding.replace(/^\/sectionById\//, ""),
        section = sections.get(key);
      if (!section || binding !== `/sectionById/${key}` || quoted.has(key))
        throw new Error("큰 인용의 섹션 참조가 없거나 중복됩니다.");
      if (!section.quote)
        throw new Error("큰 인용에는 그 섹션의 quote가 필요합니다.");
      quoted.add(key);
    } else {
      const fields: Record<string, string> = {
        NameIntro: "profile",
        ProjectIndex: "sections",
        MetricStrip: "sections",
        CareerTimeline: "career",
        EvidenceGrid: "evidence",
        Contact: "contact",
      };
      const field = fields[node.type];
      if (
        !field ||
        (node.props as Record<string, { $state: string }>)[field]?.$state !==
          `/${field}`
      )
        throw new Error("허용되지 않은 데이터 참조입니다.");
    }
  }
  if (seen.size !== sections.size)
    throw new Error("입력 섹션이 누락되었습니다.");
  if (counts.has("MetricStrip") && content.sections.flatMap((section) => section.metrics ?? []).length < 2)
    throw new Error("수치 강조 줄에는 수치가 두 개 이상 필요합니다.");
  if ((counts.get("PullQuote") ?? 0) > STRUCTURED_MAX_QUOTES)
    throw new Error(`큰 인용은 지면에 ${STRUCTURED_MAX_QUOTES}개까지 둡니다.`);
  for (const type of [
    "ProjectIndex",
    "MetricStrip",
    "CareerTimeline",
    "EvidenceGrid",
    "Contact",
  ])
    if ((counts.get(type) ?? 0) > 1)
      throw new Error("보조 섹션을 중복 표시할 수 없습니다.");
  if (content.career.length && counts.get("CareerTimeline") !== 1)
    throw new Error("경력이 누락되었습니다.");
  if (content.evidence.length && counts.get("EvidenceGrid") !== 1)
    throw new Error("근거가 누락되었습니다.");
  if (
    content.contact &&
    (spec.elements[root.children.at(-1) ?? ""]?.type !== "Contact" ||
      counts.get("Contact") !== 1)
  )
    throw new Error("연락처를 마지막에 표시해야 합니다.");
  if (!content.contact && counts.has("Contact"))
    throw new Error("제공되지 않은 연락처를 표시할 수 없습니다.");
  return { version: 1, content, spec };
}

/** 유형과 허용 컨테이너로 Spec 생성 모델에게 보일 컴포넌트 이름을 정합니다. 출력 스키마와 같은 규칙입니다. */
export function archetypeComponents(
  archetype: PortfolioArchetype,
  groups: readonly StructuredGroupType[],
): string[] {
  const allowedGroups = archetype === "case-study" ? groups : [];
  return [
    "PortfolioPage",
    "NameIntro",
    ...(archetype === "list" ? [] : ["ProjectIndex", "MetricStrip", "PullQuote"]),
    ...archetypeCaseTypes(archetype),
    ...allowedGroups,
    "CareerTimeline",
    "EvidenceGrid",
    "Contact",
  ];
}
