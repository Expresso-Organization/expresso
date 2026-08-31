import {
  DesignSystemSpecV2Schema,
  PORTFOLIO_STYLE_PRESETS,
  ReferenceLockSchema,
  type DesignSystemSpecV2,
  type PortfolioStylePreset,
  type ReferenceLock,
} from "@expresso/contracts";

/**
 * Design Prompts 기반 스타일 30종을 디자인 시스템 계약으로 확장한다.
 *
 * 프리셋이 가진 것은 지면 · 글자 · 강조 세 색과 서체 갈래, 밀도, 구조뿐이다.
 * 나머지 토큰은 그 세 색에서 계산한다 — 표면은 지면을 글자 쪽으로 조금 섞고,
 * 설명색과 경계는 글자를 지면 쪽으로 섞는다. 그래서 밝은 스타일과 어두운
 * 스타일이 같은 규칙으로 자기 지면에 맞는 단계를 얻는다.
 */

function channels(hex: string): [number, number, number] {
  return [1, 3, 5].map((index) => Number.parseInt(hex.slice(index, index + 2), 16)) as [number, number, number];
}

function toHex(value: number): string {
  return Math.max(0, Math.min(255, Math.round(value))).toString(16).padStart(2, "0");
}

/** `ratio` 만큼 `to` 쪽으로 옮긴 색. 0이면 `from`, 1이면 `to`. */
function mix(from: string, to: string, ratio: number): string {
  const a = channels(from);
  const b = channels(to);
  return `#${a.map((value, index) => toHex(value + (b[index]! - value) * ratio)).join("")}`;
}

function luminance(hex: string): number {
  const [r, g, b] = channels(hex).map((channel) => {
    const value = channel / 255;
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** 강조 위에 올릴 글자색. 흰색과 검정 중 대비가 큰 쪽을 고른다. */
function readableOn(hex: string): string {
  return luminance(hex) > 0.45 ? "#111111" : "#ffffff";
}

const FONTS = {
  sans: { display: "Inter", body: "system-ui", fallback: "sans-serif", character: "산세리프" },
  serif: { display: "Georgia", body: "Georgia", fallback: "serif", character: "세리프" },
  mono: { display: "ui-monospace", body: "ui-monospace", fallback: "monospace", character: "고정폭" },
} as const;

const DENSITY = {
  compact: { elementGap: 10, componentGap: 20, sectionGap: 56, contentWidth: 1180, cardRadius: 4, body: "0.9375rem", display: "3.25rem" },
  comfortable: { elementGap: 14, componentGap: 24, sectionGap: 72, contentWidth: 1080, cardRadius: 10, body: "1rem", display: "4rem" },
  spacious: { elementGap: 16, componentGap: 32, sectionGap: 104, contentWidth: 980, cardRadius: 14, body: "1.0625rem", display: "4.5rem" },
} as const;

const token = (value: string, role: string) => ({ value, role });

/** 지시문을 문장으로 가른다. 프리셋의 prompt 는 모두 `…다.` 로 끝나는 서술문이다. */
function sentences(prompt: string): string[] {
  return prompt.split(/(?<=다\.)\s+/).map((line) => line.trim()).filter(Boolean);
}

/**
 * 문장 전체가 금지로 끝나는지 본다. 절 단위로 가르면 "…가리지 않고 위계를 돕는다"
 * 처럼 지시를 담은 문장이 금지로 잘못 뒤집힌다. 판단은 맺음말에서만 한다.
 */
const PROHIBITION = /(않는다|쓰지 않는다|넣지 않는다|피한다|남발하지 않는다)\.$/;

/** 하지 말라고 맺은 문장. 없는 스타일도 있다. */
function prohibitions(prompt: string): string[] {
  return sentences(prompt).filter((line) => PROHIBITION.test(line));
}

/** 하라고 맺은 문장. 금지 문장의 나머지 전부다. */
function directives(prompt: string): string[] {
  return sentences(prompt).filter((line) => !PROHIBITION.test(line));
}

function createSpec(preset: PortfolioStylePreset): DesignSystemSpecV2 {
  const { background, text, accent, font, density, structure } = preset.style;
  const type = FONTS[font];
  const size = DENSITY[density];
  const dark = preset.mode === "dark";
  const moves = directives(preset.prompt);
  const avoid = prohibitions(preset.prompt);

  return DesignSystemSpecV2Schema.parse({
    version: 2,
    identity: {
      name: preset.name,
      description: preset.description,
      // 시각 방향과 대표 수법은 프리셋이 가진 지시문에서 가져온다. 설명을 되풀이하지 않는다.
      visualThesis: moves[0] ?? preset.description,
      traits: preset.description.split(" · ").map((part) => part.trim()).filter(Boolean).slice(0, 4),
      signatureMoves: moves.slice(0, 4),
    },
    origin: {
      kind: "builtin",
      sourceName: "Expresso",
      sourceUrl: preset.sourceUrl,
      capturedAt: null,
      attribution: "Expresso 기본 스타일",
    },
    colors: {
      canvas: token(background, "페이지 전체 바탕"),
      surface: token(mix(background, text, dark ? 0.06 : 0.04), "기본 섹션과 카드 표면"),
      elevated: token(mix(background, text, dark ? 0.11 : 0.08), "한 단계 올라온 정보 표면"),
      text: token(text, "제목과 본문"),
      muted: token(mix(text, background, 0.42), "설명과 메타데이터"),
      border: token(mix(text, background, dark ? 0.72 : 0.8), "정보 구획의 경계"),
      accent: token(accent, "대표 성과와 현재 상태"),
      action: token(accent, "주요 행동 배경"),
      actionText: token(readableOn(accent), "주요 행동 위 글자"),
      roles: [
        { token: "accent", role: "강조", usage: "대표 성과와 선택 상태" },
        { token: "action", role: "주요 행동", usage: "페이지의 핵심 연락 행동" },
        { token: "muted", role: "보조 정보", usage: "기간, 역할, 설명" },
      ],
    },
    typography: {
      display: { family: type.display, fallback: type.fallback, role: "Hero와 섹션 제목" },
      body: { family: type.body, fallback: type.fallback, role: "사례 설명과 긴 본문" },
      mono: { family: "ui-monospace", fallback: "monospace", role: "수치, 기간, 기술 메타데이터" },
      scale: [
        { name: "body", size: size.body, lineHeight: density === "compact" ? "1.55" : "1.65" },
        { name: "subheading", size: "1.25rem", lineHeight: "1.35" },
        { name: "heading", size: "2rem", lineHeight: "1.2" },
        { name: "display", size: size.display, lineHeight: "1.05" },
      ],
      weights: font === "serif" ? [400, 600] : [400, 500, 700],
      lineHeights: [1.2, 1.65],
      letterSpacing: font === "mono" ? ["0", "0.02em"] : ["0", "-0.02em"],
      measure: density === "spacious" ? "42rem" : "46rem",
    },
    spacing: {
      baseUnit: 4,
      elementGap: size.elementGap,
      componentGap: size.componentGap,
      sectionGap: size.sectionGap,
      contentWidth: size.contentWidth,
    },
    shape: {
      cardRadius: size.cardRadius,
      controlRadius: density === "compact" ? 4 : 8,
      borderWidth: 1,
      shadowStyle: dark ? "none" : density === "spacious" ? "none" : "hairline",
    },
    composition: {
      structure,
      density,
      sectionRhythm: `${size.sectionGap}px 간격으로 섹션을 나눈다`,
      hierarchy: "역할과 대표 성과를 먼저, 근거를 그 아래에 둔다",
      surfaceStrategy: `${background}와 ${mix(background, text, dark ? 0.06 : 0.04)} 표면을 번갈아 쓴다`,
    },
    components: {
      hero: {
        description: preset.description,
        anatomy: ["역할", "대표 성과", "연락 행동"],
        tokens: ["canvas", "text", "accent", "action", "action-text"],
        do: ["첫 화면에서 역할과 대표 성과를 함께 보여준다"],
        dont: ["소개 문구만으로 첫 화면을 채우지 않는다"],
      },
      card: {
        description: "문제, 행동, 결과를 한 경계 안에서 읽는 단위",
        anatomy: ["제목", "맥락", "결과", "근거"],
        tokens: ["surface", "elevated", "border", "text", "muted"],
        do: ["성과와 근거가 같은 시야에 들어오게 한다"],
        dont: ["장식만 있는 빈 카드를 반복하지 않는다"],
      },
      metric: {
        description: "대표 성과를 본문보다 한 단계 크게 보여주는 수치 단위",
        anatomy: ["값", "단위", "비교 기준", "설명"],
        tokens: ["accent", "text", "muted"],
        do: ["수치의 기간과 비교 기준을 함께 적는다"],
        dont: ["맥락 없는 숫자만 크게 놓지 않는다"],
      },
      contact: {
        description: "읽기 흐름의 끝에서 제공하는 한 가지 연락 행동",
        anatomy: ["행동 문구", "연락 수단"],
        tokens: ["action", "action-text"],
        do: ["행동 결과를 알 수 있는 문구를 쓴다"],
        dont: ["같은 위계의 행동을 여러 개 나열하지 않는다"],
      },
    },
    imagery: {
      mode: structure === "dense-grid" ? "evidence-first" : "project-first",
      aspectRatio: "4:3",
      treatment: "대표 프로젝트 이미지를 카드 반경에 맞춰 배치",
      fallback: "이미지가 없으면 성과와 과정이 읽히는 텍스트 사례를 사용",
    },
    motion: {
      personality: "차분한 진입과 상태 변화",
      duration: density === "compact" ? "140ms" : "180ms",
      easing: "ease-out",
      reducedMotion: "움직임을 제거하고 최종 상태를 즉시 표시",
    },
    rules: {
      do: [...moves.slice(0, 4), "역할과 성과를 먼저 읽히게 한다"],
      dont: [...avoid, "근거 없는 수치를 적지 않는다"],
      tokenRoles: [
        { token: "text", role: "핵심 내용", usage: "제목과 본문" },
        { token: "accent", role: "한 가지 강조", usage: "대표 성과와 현재 상태" },
        { token: "action", role: "행동", usage: "연락과 프로젝트 열기" },
      ],
    },
  });
}

function createReferenceLock(preset: PortfolioStylePreset): ReferenceLock {
  const moves = directives(preset.prompt);
  const avoid = prohibitions(preset.prompt);
  return ReferenceLockSchema.parse({
    version: 1,
    primaryDirection: { designSystemCode: preset.code, revision: preset.version },
    fitReasons: preset.description.split(" · ").map((part) => part.trim()).filter(Boolean),
    preserve: moves,
    borrowedDetails: [],
    tokenRoles: [
      { token: "accent", role: "대표 강조", usage: "성과와 현재 상태" },
      { token: "action", role: "주요 행동", usage: "연락 행동" },
    ],
    mediaStrategy: { mode: "project-first", fallback: "텍스트 사례와 수치로 완결" },
    signatureMove: moves[0] ?? preset.description,
    reject: [...avoid, "근거 없는 수치"],
    sources: [],
  });
}

/** 프리셋의 templateId 에서 판 식별자를 만든다. 같은 프리셋은 늘 같은 값을 낸다. */
function revisionId(preset: PortfolioStylePreset): string {
  return preset.templateId.replace(/^d3510000/, "d3510001");
}

export const stylePresetDesignSystems = PORTFOLIO_STYLE_PRESETS.map((preset) => ({
  code: preset.code,
  designSystemId: preset.templateId,
  revisionId: revisionId(preset),
  legacyTemplateId: preset.templateId,
  surface: preset.mode,
  typographyCharacter: FONTS[preset.style.font].character,
  contentFocus: preset.style.structure === "dense-grid" ? "metrics" : "text",
  spec: createSpec(preset),
  referenceLock: createReferenceLock(preset),
}));
