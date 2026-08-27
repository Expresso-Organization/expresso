import type { TemplatePreview, TemplateStyle } from "@expresso/contracts";

export type DesignModeFilter = "all" | "light" | "dark";
export type DesignFontFilter = "all" | TemplateStyle["font"];

function previewMode(preview: TemplatePreview): "light" | "dark" {
  if (preview.designStyle) return preview.designStyle.mode;
  // 기존·사용자 정의 템플릿은 배경의 상대 휘도로 분류합니다.
  const rgb = [1, 3, 5].map((offset) => {
    const value = Number.parseInt(preview.style.background.slice(offset, offset + 2), 16) / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * rgb[0]! + 0.7152 * rgb[1]! + 0.0722 * rgb[2]! > 0.179 ? "light" : "dark";
}

export function filterDesignPreviews(
  previews: TemplatePreview[], mode: DesignModeFilter, font: DesignFontFilter,
): TemplatePreview[] {
  return previews.filter((preview) =>
    (mode === "all" || previewMode(preview) === mode)
    && (font === "all" || preview.style.font === font),
  );
}
