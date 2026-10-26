import {
  STRUCTURED_GROUP_TYPES,
  type DesignSystemSpecV2,
  type StructuredGroupType,
} from "@expresso/contracts";

/**
 * 키트 배치의 비율과 폭입니다. 키트 CSS(`kit-styles.ts`)가 이 값으로 규칙을 만들고,
 * Spec 프롬프트가 같은 값으로 배치를 설명합니다. 둘이 따로 숫자를 갖지 않습니다.
 */
export const KIT_LAYOUT = {
  /** 넓은 여백: 섹션 제목 칸과 본문 칸의 비율, 제목 칸 최소 폭(px), 칸 사이 간격(component-gap 배수). */
  wideMargin: { head: 1, body: 2.8, minHead: 150, gap: 2 },
  /** 컨테이너: 칸 사이 간격(component-gap 배수), wide-start · wide-end에서 넓은 칸의 비율. */
  group: { gap: 1.4, wide: 1.7 },
  /** 이 폭(px) 이하의 화면에서는 모든 배치가 한 열로 접힙니다. */
  collapseBelow: 760,
} as const;

export type DesignLayout = {
  kind: DesignSystemSpecV2["composition"]["layout"];
  /** 본문 영역 전체 폭(px). 디자인의 `spacing.contentWidth`입니다. */
  contentWidth: number;
  /** 섹션 제목이 본문 위에 놓이는지, 왼쪽 칸에 놓이는지. */
  head: "top" | "left";
  /** 넓은 여백에서 제목 칸 · 본문 칸 폭(px). 다른 배치에서는 본문 칸이 전체 폭입니다. */
  headWidth: number | null;
  bodyWidth: number;
  /** 모델이 쓸 수 있는 컨테이너. 넓은 여백은 제목 칸이 나란히 놓기 역할을 하므로 비어 있습니다. */
  groups: readonly StructuredGroupType[];
  /** Columns 변형별 두 칸의 폭(px). 컨테이너를 쓸 수 없으면 null입니다. */
  columns: Record<"even" | "wide-start" | "wide-end", readonly [number, number]> | null;
};

/** 고른 디자인 판이 1440px 화면에서 페이지를 어떻게 나누는지 계산합니다. */
export function designLayout(spec: DesignSystemSpecV2): DesignLayout {
  const kind = spec.composition.layout;
  const contentWidth = spec.spacing.contentWidth;
  if (kind === "wide-margin") {
    const { head, body, minHead, gap } = KIT_LAYOUT.wideMargin;
    const free = contentWidth - spec.spacing.componentGap * gap;
    const headWidth = Math.round(Math.max(minHead, (free * head) / (head + body)));
    return { kind, contentWidth, head: "left", headWidth, bodyWidth: Math.round(free - headWidth), groups: [], columns: null };
  }
  const free = contentWidth - spec.spacing.componentGap * KIT_LAYOUT.group.gap;
  const split = (a: number, b: number) =>
    [Math.round((free * a) / (a + b)), Math.round((free * b) / (a + b))] as const;
  return {
    kind,
    contentWidth,
    head: "top",
    headWidth: null,
    bodyWidth: contentWidth,
    groups: STRUCTURED_GROUP_TYPES,
    columns: {
      even: split(1, 1),
      "wide-start": split(KIT_LAYOUT.group.wide, 1),
      "wide-end": split(1, KIT_LAYOUT.group.wide),
    },
  };
}

const KIND_NAME: Record<DesignLayout["kind"], string> = {
  "single-column": "단일 열",
  "dense-grid": "촘촘한 격자",
  "wide-margin": "넓은 여백",
};

/** 배치 계산 결과를 Spec 생성 모델이 읽을 문단으로 씁니다. 수치는 모두 `designLayout`에서 옵니다. */
export function describeDesignLayout(layout: DesignLayout, name: string): string {
  const lines = [
    `고른 디자인은 ${name}이고 배치는 ${KIND_NAME[layout.kind]}입니다. 색·서체·간격은 이 디자인이 정하고, 이 Spec은 구성만 정합니다.`,
  ];
  if (layout.kind === "wide-margin")
    lines.push(
      `넓은 화면에서 모든 섹션의 제목은 왼쪽 칸(약 ${layout.headWidth}px)에, 본문은 오른쪽 칸(약 ${layout.bodyWidth}px)에 놓입니다. 이 왼쪽 칸이 나란히 놓기 역할을 하므로 컨테이너(Columns · Grid · Band)를 쓸 수 없습니다. 사례 안의 그림과 항목표는 본문 칸 안에서 위아래로 이어집니다.`,
    );
  else {
    const c = layout.columns!;
    lines.push(
      `모든 섹션은 폭 약 ${layout.bodyWidth}px 안에서 위에서 아래로 이어지고, 섹션 제목은 본문 위에 놓입니다.`,
      layout.kind === "dense-grid"
        ? "목차(ProjectIndex rows)는 두 칸으로 펼쳐지고, 기술형 사례(CaseTechnical)는 본문과 항목표를 좌우 두 칸으로 나눕니다."
        : "사례 안의 그림과 항목표는 위아래로 이어집니다.",
      `Columns로 나란히 놓으면 두 칸의 폭은 even 약 ${c.even[0]}·${c.even[1]}px, wide-start 약 ${c["wide-start"][0]}·${c["wide-start"][1]}px, wide-end 약 ${c["wide-end"][0]}·${c["wide-end"][1]}px입니다. 컨테이너 안의 사례는 그림과 항목표를 위아래로 쌓습니다.`,
    );
  }
  lines.push(`화면 폭이 ${KIT_LAYOUT.collapseBelow}px 이하이면 모든 배치가 한 열로 접힙니다.`);
  return lines.join("\n");
}
