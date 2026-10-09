import { z } from "zod";
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
  details: z
    .array(z.strictObject({ label: z.string().min(1).max(100), text }))
    .max(12),
  media: z.array(StructuredMediaSchema).max(8),
  sourceIds: z.array(id).max(30),
});
export const StructuredPortfolioContentSchema = z.strictObject({
  version: z.literal(1),
  profile: z
    .strictObject({
      name: z.string().min(1).max(200),
      role: z.string().min(1).max(200),
      headline: z.string().min(1).max(160),
      intro: text,
      focus: z.array(z.string().max(100)).max(8),
    })
    .superRefine((value, context) => {
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
          message: "이름 아래 소개는 짧은 한 문장이어야 합니다.",
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
export type StructuredPortfolioContent = z.infer<
  typeof StructuredPortfolioContentSchema
>;
export type StructuredSection = z.infer<typeof StructuredSectionSchema>;
export const StructuredDesignSchema = z.strictObject({
  layout: z.enum(["editorial", "gallery", "dossier", "library"]),
  palette: z.enum(["ivory", "cobalt", "graphite", "sage", "burgundy"]),
  font: z.enum(["serif", "sans", "mono"]),
});
export const STRUCTURED_CASE_TYPES = [
  "CaseEssay",
  "CaseGallery",
  "CaseTechnical",
  "CaseProcess",
  "ContentPanel",
] as const;
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
const leaf = <T extends string, P extends z.ZodType>(type: T, props: P) =>
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
    }),
    children: z.array(id).min(2).max(24),
  }),
  leaf(
    "NameIntro",
    z.strictObject({
      profile: binding,
      sections: binding.optional(),
      sourceId: id.optional(),
    }),
  ),
  leaf(
    "ProjectIndex",
    z.strictObject({
      sections: binding,
      variant: z.enum(["rows", "mosaic", "rail"]),
    }),
  ),
  ...STRUCTURED_CASE_TYPES.map((type) =>
    leaf(type, z.strictObject({ section: binding, sourceId: id.optional() })),
  ),
  leaf("CareerTimeline", z.strictObject({ career: binding })),
  leaf("EvidenceGrid", z.strictObject({ evidence: binding })),
  leaf("Contact", z.strictObject({ contact: binding })),
  ...STRUCTURED_GROUP_TYPES.map((type) =>
    z.strictObject({
      type: z.literal(type),
      props: z.strictObject({
        variant: z.enum(STRUCTURED_GROUP_VARIANTS[type]),
      }),
      children: z.array(id).min(1).max(3),
    }),
  ),
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
// 요소 ID와 참조는 입력에서 고정하고 순서와 지면 유형은 모델이 선택합니다.
export function structuredModelSchema(
  content: StructuredPortfolioContent,
  choices?: {
    intro: string[];
    section: string[];
    guidance: string[];
    layout?: z.infer<typeof StructuredDesignSchema>["layout"];
  },
): z.ZodType<StructuredPortfolioSpec> {
  const ref = (value: string) =>
    z.strictObject({ $state: z.literal(`/${value}`) });
  const empty = z.array(z.string()).max(0);
  const nodes: Record<string, z.ZodType> = {
    intro: z.strictObject({
      type: z.literal("NameIntro"),
      props: z.strictObject({
        profile: ref("profile"),
        sections: ref("sections"),
        ...(choices?.intro.length
          ? { sourceId: z.enum(choices.intro as [string, ...string[]]) }
          : {}),
      }),
      children: empty,
    }),
    index: z.strictObject({
      type: z.literal("ProjectIndex"),
      props: z.strictObject({
        sections: ref("sections"),
        variant: z.enum(["rows", "mosaic", "rail"]),
      }),
      children: empty,
    }),
  };
  for (const section of content.sections)
    nodes[`section-${section.id}`] = z.strictObject({
      type: z.enum(
        section.media.length
          ? STRUCTURED_CASE_TYPES
          : ["CaseEssay", "CaseTechnical", "CaseProcess", "ContentPanel"],
      ),
      props: z.strictObject({
        section: ref(`sectionById/${section.id}`),
        ...(choices?.section.length
          ? { sourceId: z.enum(choices.section as [string, ...string[]]) }
          : {}),
      }),
      children: empty,
    });
  if (content.career.length)
    nodes.career = z.strictObject({
      type: z.literal("CareerTimeline"),
      props: z.strictObject({ career: ref("career") }),
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
  const nodeIds = Object.keys(nodes) as [string, ...string[]];
  // 소개와 연락처는 페이지의 처음과 끝에만 둡니다. 나머지는 컨테이너에 넣을 수 있습니다.
  const groupable = nodeIds.filter(
    (key) => key !== "intro" && key !== "contact",
  ) as [string, ...string[]];
  const groupIds = Array.from(
    { length: STRUCTURED_MAX_GROUPS },
    (_, index) => `group-${index + 1}`,
  );
  const group = z.strictObject({
    type: z.enum(STRUCTURED_GROUP_TYPES),
    // type과 variant의 짝은 도메인 검사에서 확인합니다. 공급자 공통 문법을 위해 union을 쓰지 않습니다.
    props: z.strictObject({
      variant: z.enum([
        ...new Set(Object.values(STRUCTURED_GROUP_VARIANTS).flat()),
      ] as [string, ...string[]]),
    }),
    children: z.array(z.enum(groupable)).min(1).max(3),
  });
  const page = z.strictObject({
    type: z.literal("PortfolioPage"),
    props: z.strictObject({
      profile: ref("profile"),
      design: choices?.layout
        ? StructuredDesignSchema.extend({ layout: z.literal(choices.layout) })
        : StructuredDesignSchema,
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
      .max(nodeIds.length + STRUCTURED_MAX_GROUPS),
  });
  return z.strictObject({
    root: z.literal("page"),
    elements: z.strictObject({
      page,
      ...nodes,
      ...Object.fromEntries(groupIds.map((key) => [key, group.optional()])),
    }),
  }) as z.ZodType<StructuredPortfolioSpec>;
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
      seen.add(key);
    } else {
      const fields: Record<string, string> = {
        NameIntro: "profile",
        ProjectIndex: "sections",
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
  for (const type of [
    "ProjectIndex",
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
