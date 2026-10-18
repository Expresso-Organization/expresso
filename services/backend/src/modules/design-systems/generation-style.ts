import {
  TemplateStyleSchema,
  type DesignSystemRevision,
  type TemplateStyle,
} from "@expresso/contracts";

import { catalogEntries } from "./catalog.js";

/** 메모리 카탈로그에서 판을 찾습니다. 없으면 null입니다. */
export function findDesignSystemRevision(
  revisionId: string,
): DesignSystemRevision | null {
  return (
    catalogEntries().find(({ revision }) => revision.revisionId === revisionId)
      ?.revision ?? null
  );
}

/**
 * 템플릿과 연결되지 않은 판(Refero 5종)이 쓰는 템플릿입니다.
 *
 * 스타일 값은 모두 판의 토큰에서 정하므로 템플릿은 생성 문맥의 기본 틀만 맡습니다.
 * 내장 Clarity가 가장 중립적인 틀이라 이 자리에 둡니다.
 */
function fallbackTemplateId(): string {
  const clarity = catalogEntries().find(
    ({ revision }) => revision.code === "clarity",
  )?.revision;
  if (!clarity?.legacyTemplateId)
    throw new Error("내장 Clarity 템플릿 연결이 없습니다.");
  return clarity.legacyTemplateId;
}

/** 글꼴 스택의 일반 글꼴 이름으로 서체 계열을 정합니다. `sans-serif`는 serif로 읽지 않습니다. */
function fontFamilyKind(stack: string): TemplateStyle["font"] {
  const generic = stack
    .toLowerCase()
    .split(",")
    .map((part) => part.trim().replace(/^["']|["']$/g, ""));
  if (generic.includes("monospace")) return "mono";
  if (generic.includes("serif")) return "serif";
  return "sans";
}

/**
 * 디자인 시스템 판을 생성 요청의 템플릿과 스타일 값으로 바꿉니다.
 *
 * 구조화 렌더러가 받는 값(배경·글자·강조 색, 서체 계열, 배치)과 밀도까지만 옮깁니다.
 * 서체 이름·간격·모양 같은 나머지 토큰은 렌더러가 아직 받지 않습니다.
 */
export function generationStyleFor(revision: DesignSystemRevision): {
  templateId: string;
  styleOverrides: TemplateStyle;
} {
  const { colors, typography, composition } = revision.spec;
  return {
    templateId: revision.legacyTemplateId ?? fallbackTemplateId(),
    styleOverrides: TemplateStyleSchema.parse({
      background: colors.canvas.value,
      text: colors.text.value,
      accent: colors.accent.value,
      font: fontFamilyKind(typography.display.fallback),
      density: composition.density,
      structure: composition.layout,
    }),
  };
}
