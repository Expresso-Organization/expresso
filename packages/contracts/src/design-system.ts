import { z } from "zod";
import { TimestampSchema, UuidSchema } from "./common.js";

const HexColorSchema = z.string().regex(/^#[0-9a-fA-F]{6}$/);
const TextSchema = z.string().trim().min(1).max(500);
const TokenNameSchema = z.string().regex(/^[a-z][a-z0-9-]{0,63}$/);
const HttpUrlSchema = z
  .string()
  .url()
  .refine(
    (value) => ["http:", "https:"].includes(new URL(value).protocol),
    "Only http(s) URLs are allowed",
  );

/** 문서 컴파일러가 CSS에 직접 넣을 수 있는 제한된 길이 값. */
const CssLengthSchema = z
  .string()
  .regex(/^(?:0|-?\d+(?:\.\d+)?(?:px|rem|em|ch|vw|vh|%))$/);
const UnitlessLineHeightSchema = z.string().regex(/^\d+(?:\.\d+)?$/);
const LetterSpacingSchema = z
  .string()
  .regex(/^(?:0|-?\d+(?:\.\d+)?(?:px|rem|em))$/);
const FontStackSchema = z
  .string()
  .trim()
  .min(1)
  .max(100)
  .regex(/^[A-Za-z0-9 ,-]+$/);

export const ColorTokenSchema = z.strictObject({
  value: HexColorSchema,
  role: TextSchema,
});
export type ColorToken = z.infer<typeof ColorTokenSchema>;

export const TokenRoleSchema = z.strictObject({
  token: TokenNameSchema,
  role: TextSchema,
  usage: TextSchema,
});
export type TokenRole = z.infer<typeof TokenRoleSchema>;

export const FontTokenSchema = z.strictObject({
  family: FontStackSchema,
  fallback: FontStackSchema,
  role: TextSchema,
});
export type FontToken = z.infer<typeof FontTokenSchema>;

export const TypeStepSchema = z.strictObject({
  name: TokenNameSchema,
  size: CssLengthSchema,
  lineHeight: UnitlessLineHeightSchema,
});
export type TypeStep = z.infer<typeof TypeStepSchema>;

export const ComponentRuleSchema = z.strictObject({
  description: TextSchema,
  anatomy: z.array(TextSchema).min(1).max(12),
  tokens: z.array(TokenNameSchema).min(1).max(20),
  do: z.array(TextSchema).min(1).max(20),
  dont: z.array(TextSchema).min(1).max(20),
});
export type ComponentRule = z.infer<typeof ComponentRuleSchema>;

export const ImageryRuleSchema = z.strictObject({
  mode: TextSchema,
  aspectRatio: TextSchema,
  treatment: TextSchema,
  fallback: TextSchema,
});
export type ImageryRule = z.infer<typeof ImageryRuleSchema>;

export const MotionRuleSchema = z.strictObject({
  personality: TextSchema,
  duration: z.string().regex(/^\d+(?:\.\d+)?(?:ms|s)$/),
  easing: z.enum(["linear", "ease", "ease-in", "ease-out", "ease-in-out"]),
  reducedMotion: TextSchema,
});
export type MotionRule = z.infer<typeof MotionRuleSchema>;

export const DesignReferenceSourceSchema = z.strictObject({
  name: TextSchema,
  url: HttpUrlSchema.nullable(),
  capturedAt: z.iso.datetime({ offset: true }).nullable(),
  signal: TextSchema,
  attribution: TextSchema.nullable(),
});
export type DesignReferenceSource = z.infer<typeof DesignReferenceSourceSchema>;

export const ReferenceLockSchema = z.strictObject({
  version: z.literal(1),
  primaryDirection: z.strictObject({
    designSystemCode: TokenNameSchema,
    revision: z.number().int().positive(),
  }),
  fitReasons: z.array(TextSchema).min(1).max(20),
  preserve: z.array(TextSchema).min(1).max(30),
  borrowedDetails: z.array(TextSchema).max(30),
  tokenRoles: z.array(TokenRoleSchema).min(1).max(30),
  mediaStrategy: z.strictObject({
    mode: TextSchema,
    fallback: TextSchema,
  }),
  signatureMove: TextSchema,
  reject: z.array(TextSchema).max(30),
  sources: z.array(DesignReferenceSourceSchema).max(20),
});
export type ReferenceLock = z.infer<typeof ReferenceLockSchema>;

export const DesignSystemSpecV2Schema = z.strictObject({
  version: z.literal(2),
  identity: z.strictObject({
    name: TextSchema,
    description: TextSchema,
    visualThesis: TextSchema,
    traits: z.array(TextSchema).min(1).max(20),
    signatureMoves: z.array(TextSchema).min(1).max(20),
  }),
  origin: z.strictObject({
    kind: z.enum(["builtin", "reference", "generated", "website"]),
    sourceName: TextSchema.nullable(),
    sourceUrl: HttpUrlSchema.nullable(),
    capturedAt: z.iso.datetime({ offset: true }).nullable(),
    attribution: TextSchema.nullable(),
  }),
  colors: z.strictObject({
    canvas: ColorTokenSchema,
    surface: ColorTokenSchema,
    elevated: ColorTokenSchema,
    text: ColorTokenSchema,
    muted: ColorTokenSchema,
    border: ColorTokenSchema,
    accent: ColorTokenSchema,
    action: ColorTokenSchema,
    actionText: ColorTokenSchema,
    roles: z.array(TokenRoleSchema).min(1).max(30),
  }),
  typography: z.strictObject({
    display: FontTokenSchema,
    body: FontTokenSchema,
    mono: FontTokenSchema,
    scale: z.array(TypeStepSchema).min(1).max(12),
    weights: z.array(z.number().int().min(100).max(900)).min(1).max(9),
    lineHeights: z.array(z.number().positive().max(4)).min(1).max(12),
    letterSpacing: z.array(LetterSpacingSchema).min(1).max(12),
    measure: CssLengthSchema,
  }),
  spacing: z.strictObject({
    baseUnit: z.number().positive().max(32),
    elementGap: z.number().positive().max(160),
    componentGap: z.number().positive().max(240),
    sectionGap: z.number().positive().max(320),
    contentWidth: z.number().positive().max(2400),
  }),
  shape: z.strictObject({
    cardRadius: z.number().nonnegative().max(100),
    controlRadius: z.number().nonnegative().max(100),
    borderWidth: z.number().nonnegative().max(12),
    shadowStyle: z.enum(["none", "hairline", "soft", "layered"]),
  }),
  composition: z.strictObject({
    structure: TextSchema,
    density: z.enum(["compact", "comfortable", "spacious"]),
    sectionRhythm: TextSchema,
    hierarchy: TextSchema,
    surfaceStrategy: TextSchema,
  }),
  components: z
    .record(TokenNameSchema, ComponentRuleSchema)
    .refine(
      (components) => Object.keys(components).length > 0,
      "At least one component is required",
    )
    .refine(
      (components) => Object.keys(components).length <= 50,
      "Too many components",
    ),
  imagery: ImageryRuleSchema,
  motion: MotionRuleSchema,
  rules: z.strictObject({
    do: z.array(TextSchema).min(1).max(50),
    dont: z.array(TextSchema).min(1).max(50),
    tokenRoles: z.array(TokenRoleSchema).min(1).max(30),
  }),
});
export type DesignSystemSpecV2 = z.infer<typeof DesignSystemSpecV2Schema>;

export const DesignDocumentSectionSchema = z.strictObject({
  id: TokenNameSchema,
  title: TextSchema,
  body: z.array(z.string().min(1).max(2_000)).min(1).max(200),
});
export type DesignDocumentSection = z.infer<typeof DesignDocumentSectionSchema>;

export const DesignSampleEntrySchema = z.strictObject({
  kind: z.enum([
    "hero",
    "case-study",
    "long-body",
    "metric",
    "before-after",
    "image",
    "no-image",
    "tags",
    "quote",
    "link-contact",
    "footer",
  ]),
  label: TextSchema,
  value: TextSchema,
});
export type DesignSampleEntry = z.infer<typeof DesignSampleEntrySchema>;

export const DesignDocumentModelSchema = z.strictObject({
  version: z.literal(2),
  spec: DesignSystemSpecV2Schema,
  referenceLock: ReferenceLockSchema.nullable(),
  sections: z.array(DesignDocumentSectionSchema).length(11),
  sampleEntries: z.array(DesignSampleEntrySchema).length(11),
});
export type DesignDocumentModel = z.infer<typeof DesignDocumentModelSchema>;

export const DesignStyleOverridesSchema = z.strictObject({
  density: z.enum(["compact", "comfortable", "spacious"]).optional(),
  brightness: z.enum(["light", "dark"]).optional(),
  accentStrength: z.enum(["subtle", "balanced", "strong"]).optional(),
  imageIntensity: z.enum(["none", "supporting", "prominent"]).optional(),
  companyColorMode: z.enum(["off", "adapt"]).optional(),
});
export type DesignStyleOverrides = z.infer<typeof DesignStyleOverridesSchema>;

export const DesignSystemCatalogItemSchema = z.strictObject({
  designSystemId: z.uuid(),
  revisionId: z.uuid(),
  code: TokenNameSchema,
  name: TextSchema,
  description: TextSchema,
  origin: DesignSystemSpecV2Schema.shape.origin,
  traits: z.array(TextSchema),
  signatureMove: TextSchema,
  fitReasons: z.array(TextSchema),
  recommended: z.boolean(),
  surface: z.enum(["light", "dark"]),
  density: z.enum(["compact", "comfortable", "spacious"]),
  typographyCharacter: TextSchema,
  contentFocus: z.enum(["image", "metrics", "text"]),
  moods: z.array(TextSchema),
  roles: z.array(TextSchema),
  previewHtml: z.string(),
  markdownSha256: z.string().regex(/^[0-9a-f]{64}$/),
  legacyTemplateId: UuidSchema.nullable(),
});
export const DesignSystemCatalogListSchema = z.strictObject({
  items: z.array(DesignSystemCatalogItemSchema),
});
export const DesignSystemRevisionSchema = z.strictObject({
  designSystemId: z.uuid(),
  revisionId: z.uuid(),
  code: TokenNameSchema,
  spec: DesignSystemSpecV2Schema,
  referenceLock: ReferenceLockSchema,
  designMarkdown: z.string(),
  designHtml: z.string(),
  markdownSha256: z.string().regex(/^[0-9a-f]{64}$/),
  htmlSha256: z.string().regex(/^[0-9a-f]{64}$/),
  contentHash: z.string().regex(/^[0-9a-f]{64}$/),
  legacyTemplateId: UuidSchema.nullable(),
});
export const SaveDesignSelectionSchema = z.strictObject({
  revisionId: z.uuid(),
  overrides: DesignStyleOverridesSchema.optional(),
});
export const DesignSelectionSchema = z.strictObject({
  designSystemRevisionId: z.uuid(),
  referenceLock: ReferenceLockSchema,
  styleOverrides: DesignStyleOverridesSchema,
  selectedAt: TimestampSchema,
});
export const DesignSystemCatalogResponseSchema = z.strictObject({
  data: DesignSystemCatalogListSchema,
});
export const DesignSystemRevisionResponseSchema = z.strictObject({
  data: DesignSystemRevisionSchema,
});
export const DesignSelectionResponseSchema = z.strictObject({
  data: DesignSelectionSchema,
});
export type DesignSystemCatalogItem = z.infer<
  typeof DesignSystemCatalogItemSchema
>;
export type DesignSystemRevision = z.infer<typeof DesignSystemRevisionSchema>;
export type SaveDesignSelection = z.infer<typeof SaveDesignSelectionSchema>;
export type DesignSelection = z.infer<typeof DesignSelectionSchema>;
