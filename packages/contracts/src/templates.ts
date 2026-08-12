import { z } from "zod";

import { UuidSchema } from "./common.js";

/**
 * 지면의 골격.
 *
 * 팔레트와 서체만으로는 지면이 정해지지 않는다 — 같은 색 같은 서체로도 슬라이드
 * 띠와 2단 격자가 나온다. 실행 사이에 가장 크게 흔들리는 축이라 **사용자가 미리
 * 고르는 값**에 넣었다(0047).
 */
export const TEMPLATE_STRUCTURES = ["single-column", "dense-grid", "wide-margin"] as const;
export const TemplateStructureSchema = z.enum(TEMPLATE_STRUCTURES);
export type TemplateStructure = z.infer<typeof TemplateStructureSchema>;

export const TemplateStyleSchema = z.strictObject({
  background: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  text: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  accent: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  font: z.enum(["sans", "serif"]),
  density: z.enum(["compact", "comfortable", "spacious"]),
  // 옛 행에는 없을 수 있다. 0047이 채우지만 계약이 먼저 무너지지는 않게 한다.
  structure: TemplateStructureSchema.default("single-column"),
});

/**
 * 템플릿 위에 덮어쓸 축만 담는다.
 *
 * 통째로 새 문법을 받지 않는 이유는, 안 적은 축이 템플릿을 계속 따라가야 하기
 * 때문이다 — 그래야 템플릿을 고칠 때 손대지 않은 축이 함께 움직인다.
 */
export const TemplateStyleOverrideSchema = TemplateStyleSchema.partial();
export type TemplateStyleOverride = z.infer<typeof TemplateStyleOverrideSchema>;

/** 템플릿의 문법에 조정을 얹는다. 이 결과가 생성기로 간다. */
export function composeTemplateStyle(
  base: unknown,
  overrides: unknown,
): TemplateStyle | null {
  const parsedBase = TemplateStyleSchema.safeParse(base);
  if (!parsedBase.success) return null;
  const parsedOverrides = TemplateStyleOverrideSchema.safeParse(overrides ?? {});
  // 조정이 깨졌으면 **무시하고 템플릿을 쓴다.** 반쯤 적용된 문법으로 뽑으면
  // 사용자가 고른 것과 다른 지면이 나오고, 왜인지 알 길이 없다.
  const patch = parsedOverrides.success ? parsedOverrides.data : {};
  // `partial()`은 안 적은 축을 `undefined`로 들고 있다. 그대로 펼치면 템플릿 값을
  // undefined로 덮어써서, 조정하지 않은 축까지 사라진다.
  const present = Object.fromEntries(
    Object.entries(patch).filter(([, value]) => value !== undefined),
  );
  return { ...parsedBase.data, ...present };
}

export const TemplatePreviewSchema = z.strictObject({
  templateId: UuidSchema,
  code: z.string().min(1).max(100),
  name: z.string().min(1).max(200),
  planRequired: z.enum(["free", "pro"]),
  recommended: z.boolean(),
  recommendationReason: z.string().min(1).max(500),
  style: TemplateStyleSchema,
  contrastRatio: z.number().min(4.5),
  colorAdjusted: z.boolean(),
  sections: z.array(z.strictObject({
    recipeSectionId: UuidSchema,
    title: z.string().max(300),
    state: z.enum(["filled", "empty"]),
    content: z.array(z.string().max(5_000)),
  })).min(1),
});

export const TemplatePreviewsSchema = z.strictObject({
  recipeId: UuidSchema,
  previews: z.array(TemplatePreviewSchema).min(1),
});

export const TemplatePreviewsResponseSchema = z.strictObject({
  data: TemplatePreviewsSchema,
});

export type TemplateStyle = z.infer<typeof TemplateStyleSchema>;
export type TemplatePreview = z.infer<typeof TemplatePreviewSchema>;
export type TemplatePreviews = z.infer<typeof TemplatePreviewsSchema>;
