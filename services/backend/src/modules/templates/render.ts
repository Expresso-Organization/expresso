import { findPortfolioStyle, TemplatePreviewSchema, TemplateStyleSchema } from "@expresso/contracts";

interface RenderSection {
  id: string;
  title: string;
  items: Array<{ pointText: string }>;
}

export interface RenderTemplateInput {
  templateId: string;
  code: string;
  name: string;
  planRequired: "free" | "pro";
  supportedSections: string[];
  style: unknown;
  recommended: boolean;
  recommendationReason: string;
  sections: RenderSection[];
  companyStyle?: Partial<{ background: string; text: string; accent: string }>;
}

function channel(value: number) {
  const normalized = value / 255;
  return normalized <= 0.04045
    ? normalized / 12.92
    : ((normalized + 0.055) / 1.055) ** 2.4;
}

export function contrastRatio(foreground: string, background: string): number {
  const luminance = (hex: string) => {
    const value = hex.slice(1);
    const rgb = [0, 2, 4].map((offset) => Number.parseInt(value.slice(offset, offset + 2), 16));
    return 0.2126 * channel(rgb[0]!) + 0.7152 * channel(rgb[1]!) + 0.0722 * channel(rgb[2]!);
  };
  const first = luminance(foreground);
  const second = luminance(background);
  return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
}

export function ensureReadableStyle(styleValue: unknown) {
  const style = TemplateStyleSchema.parse(styleValue);
  const ratio = contrastRatio(style.text, style.background);
  if (ratio >= 4.5) return { style, contrastRatio: ratio, colorAdjusted: false };
  const blackRatio = contrastRatio("#000000", style.background);
  const whiteRatio = contrastRatio("#ffffff", style.background);
  const text = blackRatio >= whiteRatio ? "#000000" : "#ffffff";
  return {
    style: { ...style, text },
    contrastRatio: Math.max(blackRatio, whiteRatio),
    colorAdjusted: true,
  };
}

export function renderTemplate(input: RenderTemplateInput) {
  if (!input.supportedSections.includes("*")) {
    throw new Error(`template ${input.code} does not support arbitrary recipe sections`);
  }
  const baseStyle = TemplateStyleSchema.parse(input.style);
  const mergedStyle = {
    ...baseStyle,
    ...(input.companyStyle?.background ? { background: input.companyStyle.background } : {}),
    ...(input.companyStyle?.text ? { text: input.companyStyle.text } : {}),
    ...(input.companyStyle?.accent ? { accent: input.companyStyle.accent } : {}),
  };
  const readable = ensureReadableStyle(mergedStyle);
  const preset = findPortfolioStyle(input.code);
  return TemplatePreviewSchema.parse({
    templateId: input.templateId,
    code: input.code,
    name: input.name,
    ...(preset ? {
      description: preset.description,
      designStyle: { mode: preset.mode, sourceUrl: preset.sourceUrl, version: preset.version },
    } : {}),
    planRequired: input.planRequired,
    recommended: input.recommended,
    recommendationReason: input.recommendationReason,
    style: readable.style,
    contrastRatio: readable.contrastRatio,
    colorAdjusted: readable.colorAdjusted,
    sections: input.sections.map((section) => ({
      recipeSectionId: section.id,
      title: section.title,
      state: section.items.length > 0 ? "filled" : "empty",
      content: section.items.map(({ pointText }) => pointText),
    })),
  });
}
