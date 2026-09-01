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

/** 두 색의 명암비. WCAG 2.1 정의다. */
function contrast(a: string, b: string): number {
  const [high, low] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (high + 0.05) / (low + 0.05);
}

/** WCAG 2.1 본문 최소 대비. */
const BODY_CONTRAST = 4.5;

/**
 * 강조 위에 올릴 글자색. 밝기 임계로 가르지 않고 흑 · 백 각각의 대비를 재서
 * 큰 쪽을 고른다. 임계로 가르면 Luxury 의 금빛(#b09a7a) 처럼 중간 밝기의 면에서
 * 대비 2.71 짜리 흰 글자가 나온다.
 */
function readableOn(hex: string): string {
  return contrast("#111111", hex) >= contrast("#ffffff", hex) ? "#111111" : "#ffffff";
}

/**
 * 설명색. 본문에서 지면 쪽으로 물리되 지면과의 대비가 본문 기준 아래로 내려가지
 * 않는 만큼만 물린다. 고정 비율로 물리면 대비가 낮은 배색에서 설명이 사라진다.
 */
/**
 * 행동 면과 그 위의 글자. 강조색을 그대로 쓰되 글자가 본문 기준에 닿지 않으면
 * 닿을 때까지 반대쪽으로 민다. 강조는 정체성이고 행동은 글자를 얹는 자리라서,
 * 계약이 `accent` 와 `action` 을 다른 역할로 나눠 두었다.
 */
function actionOn(accent: string): { background: string; text: string } {
  const text = readableOn(accent);
  const toward = text === "#ffffff" ? "#000000" : "#ffffff";
  for (let ratio = 0; ratio <= 0.5; ratio += 0.02) {
    const background = mix(accent, toward, ratio);
    if (contrast(text, background) >= BODY_CONTRAST) return { background, text };
  }
  return { background: mix(accent, toward, 0.5), text };
}

function mutedOn(text: string, canvas: string): string {
  for (let ratio = 0.42; ratio > 0; ratio -= 0.02) {
    const value = mix(text, canvas, ratio);
    if (contrast(value, canvas) >= BODY_CONTRAST) return value;
  }
  return text;
}

/** 서체 갈래별 기본값. 아래 표에 없는 스타일이 받는 것이다. */
const FONTS = {
  sans: { display: "Inter", body: "Inter", fallback: "sans-serif", character: "산세리프" },
  serif: { display: "Source Serif 4", body: "Source Serif 4", fallback: "serif", character: "세리프" },
  mono: { display: "JetBrains Mono", body: "JetBrains Mono", fallback: "monospace", character: "고정폭" },
} as const;

/**
 * 스타일별 서체.
 *
 * 서른 종이 세 벌만 쓰면 색만 다른 서른 장이 된다 — Bauhaus 와 Art Deco 와
 * Newsprint 가 같은 글자로 나온다. 이름은 2026-09-01 Google Fonts 목록(1,946
 * 가족)에서 실재와 지원 굵기를 확인했다. 굵기 요청은 `compiler.ts` 의
 * `WEB_FONTS` 가 가족마다 가진 값으로 나간다.
 *
 * 한글 글리프는 이 가족들에 없다. 한글은 갈래별 대체 서체가 받고, 이 표는
 * 제목 · 라틴 견본 · 수치의 인상을 정한다.
 */
const TYPEFACES: Record<string, { display: string; body: string }> = {
  monochrome: { display: "Playfair Display", body: "Source Serif 4" },
  bauhaus: { display: "Archivo Black", body: "Archivo" },
  "modern-dark": { display: "Inter", body: "Inter" },
  newsprint: { display: "Playfair Display", body: "Newsreader" },
  saas: { display: "Inter", body: "Inter" },
  luxury: { display: "Cormorant Garamond", body: "Lora" },
  terminal: { display: "JetBrains Mono", body: "JetBrains Mono" },
  "swiss-minimalist": { display: "Archivo", body: "Archivo" },
  kinetic: { display: "Anton", body: "Archivo" },
  "flat-design": { display: "Poppins", body: "Poppins" },
  "art-deco": { display: "Poiret One", body: "Cormorant Garamond" },
  "material-design": { display: "Roboto", body: "Roboto" },
  "neo-brutalism": { display: "Archivo Black", body: "Space Grotesk" },
  "bold-typography": { display: "Anton", body: "Inter" },
  academia: { display: "EB Garamond", body: "EB Garamond" },
  cyberpunk: { display: "Rajdhani", body: "JetBrains Mono" },
  web3: { display: "Space Grotesk", body: "Space Grotesk" },
  "playful-geometric": { display: "Quicksand", body: "Nunito" },
  "minimal-dark": { display: "Inter", body: "Inter" },
  claymorphism: { display: "Nunito", body: "Nunito" },
  professional: { display: "Source Serif 4", body: "Source Serif 4" },
  botanical: { display: "Cormorant Garamond", body: "Lora" },
  vaporwave: { display: "Orbitron", body: "Space Grotesk" },
  enterprise: { display: "IBM Plex Sans", body: "IBM Plex Sans" },
  sketch: { display: "Caveat", body: "Work Sans" },
  industrial: { display: "Oswald", body: "Chivo" },
  neumorphism: { display: "Manrope", body: "Manrope" },
  organic: { display: "Fraunces", body: "Lora" },
  maximalism: { display: "Abril Fatface", body: "Playfair Display" },
  retro: { display: "Silkscreen", body: "Space Grotesk" },
};

/**
 * 스타일별 한글 서체.
 *
 * 위의 라틴 가족에는 한글 글리프가 없다. 그대로 두면 제목의 라틴 낱말만 그
 * 스타일이고 한글은 사용자 기기의 아무 서체로 나온다 — 문서의 절반이 스타일
 * 바깥에 있는 셈이다. 그래서 대체 사슬에 한글 서체를 끼운다. 브라우저는 라틴
 * 가족에 없는 글자만 여기로 넘긴다.
 *
 * 제목과 본문을 나눈다. Black Han Sans · Gasoek One · Jua · Gaegu 처럼 제목용으로
 * 만든 얼굴로 본문까지 짜면 작은 라벨이 읽히지 않는다.
 *
 * 전부 Google Fonts 의 한글 부분집합 가족 서른여덟 개에서 골랐다(2026-09-01
 * 확인). Google Fonts 수록 조건이 열린 라이선스라 상업적 사용과 임베딩에
 * 제한이 없다.
 */
const KOREAN: Record<string, { display: string; body: string }> = {
  monochrome: { display: "Nanum Myeongjo", body: "Nanum Myeongjo" },
  bauhaus: { display: "Black Han Sans", body: "Noto Sans KR" },
  "modern-dark": { display: "Noto Sans KR", body: "Noto Sans KR" },
  newsprint: { display: "Song Myung", body: "Nanum Myeongjo" },
  saas: { display: "Noto Sans KR", body: "Noto Sans KR" },
  luxury: { display: "Gowun Batang", body: "Gowun Batang" },
  terminal: { display: "Nanum Gothic Coding", body: "Nanum Gothic Coding" },
  "swiss-minimalist": { display: "Gothic A1", body: "Gothic A1" },
  kinetic: { display: "Black Han Sans", body: "Gothic A1" },
  "flat-design": { display: "Gothic A1", body: "Gothic A1" },
  "art-deco": { display: "Diphylleia", body: "Nanum Myeongjo" },
  "material-design": { display: "Noto Sans KR", body: "Noto Sans KR" },
  "neo-brutalism": { display: "Black Han Sans", body: "Gothic A1" },
  "bold-typography": { display: "Gasoek One", body: "Noto Sans KR" },
  academia: { display: "Nanum Myeongjo", body: "Nanum Myeongjo" },
  cyberpunk: { display: "Orbit", body: "Gothic A1" },
  web3: { display: "Gothic A1", body: "Gothic A1" },
  "playful-geometric": { display: "Jua", body: "Gothic A1" },
  "minimal-dark": { display: "Gowun Dodum", body: "Gowun Dodum" },
  claymorphism: { display: "Jua", body: "Gowun Dodum" },
  professional: { display: "Noto Serif KR", body: "Noto Serif KR" },
  botanical: { display: "Gowun Batang", body: "Gowun Batang" },
  vaporwave: { display: "Orbit", body: "Gothic A1" },
  enterprise: { display: "IBM Plex Sans KR", body: "IBM Plex Sans KR" },
  sketch: { display: "Gaegu", body: "Gowun Dodum" },
  industrial: { display: "Do Hyeon", body: "Noto Sans KR" },
  neumorphism: { display: "Gowun Dodum", body: "Gowun Dodum" },
  organic: { display: "Gowun Batang", body: "Gowun Batang" },
  maximalism: { display: "Hahmlet", body: "Hahmlet" },
  retro: { display: "Do Hyeon", body: "Noto Sans KR" },
};

/** 갈래별 한글 기본값. 표에 없는 스타일이 받는다. */
const KOREAN_FALLBACK = {
  sans: { display: "Noto Sans KR", body: "Noto Sans KR" },
  serif: { display: "Noto Serif KR", body: "Noto Serif KR" },
  mono: { display: "Nanum Gothic Coding", body: "Nanum Gothic Coding" },
} as const;

/** 이 스타일이 쓸 서체. 표에 없으면 갈래의 기본값이다. */
function typefaceOf(preset: PortfolioStylePreset) {
  const base = FONTS[preset.style.font];
  const slug = preset.code.replace(/^designprompts-/, "");
  const chosen = TYPEFACES[slug];
  const korean = KOREAN[slug] ?? KOREAN_FALLBACK[preset.style.font];
  return {
    display: chosen?.display ?? base.display,
    body: chosen?.body ?? base.body,
    mono: preset.style.font === "mono" ? "JetBrains Mono" : "ui-monospace",
    // 한글은 라틴 가족 뒤에 온다. 앞에 두면 라틴 글자까지 한글 서체가 그린다.
    // 제목과 본문을 나눈다 — Black Han Sans 로 본문까지 짜면 작은 라벨이 뭉갠다.
    fallback: `${korean.display}, ${base.fallback}`,
    bodyFallback: `${korean.body}, ${base.fallback}`,
    monoFallback: preset.style.font === "mono" ? "Nanum Gothic Coding, monospace" : "monospace",
    character: base.character,
  };
}

const DENSITY = {
  compact: { elementGap: 10, componentGap: 20, sectionGap: 56, contentWidth: 1180, cardRadius: 4, body: "0.9375rem", display: "3.25rem" },
  comfortable: { elementGap: 14, componentGap: 24, sectionGap: 72, contentWidth: 1080, cardRadius: 10, body: "1rem", display: "4rem" },
  spacious: { elementGap: 16, componentGap: 32, sectionGap: 104, contentWidth: 980, cardRadius: 14, body: "1.0625rem", display: "4.5rem" },
} as const;

/**
 * 스타일별 형태.
 *
 * 밀도에서만 뽑으면 Neo Brutalism 과 Claymorphism 이 같은 반경 10 · 경계 1 ·
 * hairline 상자로 나온다. 값은 지어내지 않고 각 프리셋의 지시문에 적힌 문장에서
 * 가져온다 — 뒤의 주석이 그 문장이다. 지시문이 형태를 말하지 않는 스타일은 표에
 * 넣지 않고 밀도 기본값을 쓴다.
 */
const SHAPES: Record<string, {
  cardRadius: number;
  controlRadius: number;
  borderWidth: number;
  shadowStyle: DesignSystemSpecV2["shape"]["shadowStyle"];
}> = {
  // 모서리는 직각이고 그림자는 없다.
  monochrome: { cardRadius: 0, controlRadius: 0, borderWidth: 1, shadowStyle: "none" },
  // 굵은 검정 선을 구성의 기본으로 삼는다 · 흐린 그림자와 유리 효과를 피하고.
  bauhaus: { cardRadius: 0, controlRadius: 0, borderWidth: 2, shadowStyle: "none" },
  // 얇은 반투명 경계를 대표 프로젝트 주변에 제한해서 쓴다.
  "modern-dark": { cardRadius: 12, controlRadius: 8, borderWidth: 1, shadowStyle: "soft" },
  // 모서리와 경계는 직각이며 그림자와 유리 효과는 쓰지 않는다.
  newsprint: { cardRadius: 0, controlRadius: 0, borderWidth: 1, shadowStyle: "none" },
  // 부드러운 라운드와 짧은 상태 전환을 사용한다.
  saas: { cardRadius: 12, controlRadius: 8, borderWidth: 1, shadowStyle: "soft" },
  // 가는 선과 절제된 금빛 표식만 사용하고 버튼·배지를 남발하지 않는다.
  luxury: { cardRadius: 2, controlRadius: 2, borderWidth: 1, shadowStyle: "none" },
  // 테두리가 얇은 터미널 창 · 모서리는 직각이고 그림자는 없다.
  terminal: { cardRadius: 0, controlRadius: 0, borderWidth: 1, shadowStyle: "none" },
  // 모서리는 직각이며 그림자·곡선 장식을 피한다.
  "swiss-minimalist": { cardRadius: 0, controlRadius: 0, borderWidth: 1, shadowStyle: "none" },
  // 그림자·입체 경사·질감·그라데이션 없이 평면으로 구성한다 · 호버는 색과 테두리로.
  "flat-design": { cardRadius: 4, controlRadius: 4, borderWidth: 2, shadowStyle: "none" },
  // 계단형 경계 · 금빛 가는 선.
  "art-deco": { cardRadius: 0, controlRadius: 0, borderWidth: 1, shadowStyle: "none" },
  // 넉넉한 라운드로 친근한 지면 · 그림자는 인터랙션의 역할을 설명할 때만.
  "material-design": { cardRadius: 16, controlRadius: 20, borderWidth: 0, shadowStyle: "layered" },
  // 굵은 검정 경계와 흐림 없는 어긋난 그림자로 면을 분리한다.
  "neo-brutalism": { cardRadius: 0, controlRadius: 0, borderWidth: 3, shadowStyle: "offset" },
  // 주석과 구획선 · 고전 서재.
  academia: { cardRadius: 2, controlRadius: 2, borderWidth: 1, shadowStyle: "none" },
  // 잘린 모서리 · 보조색은 경계나 상태 표식에 제한한다.
  cyberpunk: { cardRadius: 0, controlRadius: 0, borderWidth: 1, shadowStyle: "none" },
  // 얇은 경계의 반투명 면을 겹치고.
  web3: { cardRadius: 12, controlRadius: 8, borderWidth: 1, shadowStyle: "soft" },
  // 흐림 없는 작은 그림자로 스티커 느낌을 낸다.
  "playful-geometric": { cardRadius: 14, controlRadius: 100, borderWidth: 2, shadowStyle: "offset" },
  // 큰 라운드와 여러 겹의 부드러운 바깥·안쪽 그림자로 점토 같은 부피를 표현한다.
  claymorphism: { cardRadius: 24, controlRadius: 20, borderWidth: 0, shadowStyle: "relief" },
  // 정중한 판면 · 절제된 구획.
  professional: { cardRadius: 4, controlRadius: 4, borderWidth: 1, shadowStyle: "hairline" },
  // 식물선 장식은 작게 제한하고.
  botanical: { cardRadius: 12, controlRadius: 12, borderWidth: 1, shadowStyle: "none" },
  // 색 번짐·그라데이션은 제목이나 경계에 제한하고 본문은 단색의 안정된 면에.
  vaporwave: { cardRadius: 4, controlRadius: 4, borderWidth: 1, shadowStyle: "none" },
  // 부드러운 라운드와 은은한 그림자를 사용하되 전체를 같은 카드로 만들지 않는다.
  enterprise: { cardRadius: 8, controlRadius: 6, borderWidth: 1, shadowStyle: "soft" },
  // 종이 위 메모처럼 약간 불규칙한 테두리 · 흐림 없는 그림자를 사용한다.
  sketch: { cardRadius: 6, controlRadius: 6, borderWidth: 1, shadowStyle: "offset" },
  // 빛의 방향을 통일한 경사·안쪽 그림자 · 얇은 경계.
  industrial: { cardRadius: 2, controlRadius: 2, borderWidth: 1, shadowStyle: "inset" },
  // 바탕과 같은 계열의 면에 밝은 그림자와 어두운 그림자를 짝지어 돌출과 음각을 만든다.
  neumorphism: { cardRadius: 18, controlRadius: 14, borderWidth: 0, shadowStyle: "relief" },
  // 섹션 경계를 지나치게 딱딱하게 만들지 않는다 · 자연색 그림자는 낮은 강도로.
  organic: { cardRadius: 20, controlRadius: 16, borderWidth: 0, shadowStyle: "soft" },
  // 다채로운 겹침 · 굵은 테두리와 어긋난 그림자.
  maximalism: { cardRadius: 0, controlRadius: 0, borderWidth: 3, shadowStyle: "offset" },
  // 밝고 어두운 경사 테두리로 고전 데스크톱 창을 표현한다.
  retro: { cardRadius: 0, controlRadius: 0, borderWidth: 2, shadowStyle: "bevel" },
};

/**
 * 스타일별 컴포넌트 설계.
 *
 * 네 축의 조합이 그 스타일의 요소가 어떤 골격으로 서는지 정한다. 값은 각
 * 프리셋의 지시문에서 가져왔고 뒤 주석이 그 문장이다. 표에 없는 스타일은
 * 아무 표식 없는 기본 조합을 받는다.
 */
const KITS: Record<string, DesignSystemSpecV2["componentKit"]> = {
  // 굵기가 다른 가로선과 넓은 여백으로 섹션을 구분한다.
  monochrome: { chrome: "masthead", marker: "rule", emphasis: "underlined", divider: "thick" },
  // 원·사각형·삼각형과 굵은 검정 선을 구성의 기본으로 삼는다.
  bauhaus: { chrome: "plain", marker: "bullet", emphasis: "boxed", divider: "thick" },
  // 메타정보는 작은 고정폭 라벨로 정렬한다.
  "modern-dark": { chrome: "plain", marker: "plain", emphasis: "plain", divider: "hairline" },
  // 신문의 제호 · 가로선과 세로선으로 열의 관계를 보인다.
  newsprint: { chrome: "masthead", marker: "numbered", emphasis: "underlined", divider: "double" },
  // 명료한 정보 위계.
  saas: { chrome: "plain", marker: "plain", emphasis: "plain", divider: "hairline" },
  // 가는 선과 절제된 금빛 표식만 사용한다.
  luxury: { chrome: "frame", marker: "rule", emphasis: "plain", divider: "hairline" },
  // 테두리가 얇은 터미널 창 · 제목 앞에 > 또는 $ 표식 · 정렬된 텍스트 막대.
  terminal: { chrome: "window", marker: "prompt", emphasis: "bar", divider: "dashed" },
  // 일관된 격자와 왼쪽 정렬 · 제목·번호·본문의 위치를 맞춘다.
  "swiss-minimalist": { chrome: "plain", marker: "numbered", emphasis: "oversized", divider: "thick" },
  // 짧은 강점 문장을 포스터처럼 크게 두고 굵은 제목과 빈 면을 교차시킨다.
  kinetic: { chrome: "sticker", marker: "plain", emphasis: "oversized", divider: "none" },
  // 평면 색면 · 호버와 포커스는 색과 테두리로 분명히 표시한다.
  "flat-design": { chrome: "plain", marker: "bullet", emphasis: "boxed", divider: "none" },
  // 계단형 경계 · 부채꼴이나 마름모 표식 · 대칭 기하.
  "art-deco": { chrome: "frame", marker: "rule", emphasis: "plain", divider: "double" },
  // 부드러운 반응 · 그림자는 역할을 설명할 때만.
  "material-design": { chrome: "plain", marker: "plain", emphasis: "plain", divider: "hairline" },
  // 굵은 검정 경계와 흐림 없는 어긋난 그림자로 면을 분리한다.
  "neo-brutalism": { chrome: "sticker", marker: "bracket", emphasis: "boxed", divider: "thick" },
  // 첫 화면의 강점 문장을 가장 큰 시각 요소로 삼는다.
  "bold-typography": { chrome: "plain", marker: "plain", emphasis: "oversized", divider: "none" },
  // 주석과 구획선 · 고전 서재.
  academia: { chrome: "masthead", marker: "numbered", emphasis: "plain", divider: "double" },
  // 기술 라벨 · 잘린 모서리 · 네온 강조.
  cyberpunk: { chrome: "window", marker: "bracket", emphasis: "bar", divider: "dashed" },
  // 어두운 유리 면 · 정밀한 숫자.
  web3: { chrome: "panel", marker: "bracket", emphasis: "bar", divider: "hairline" },
  // 스티커 표식 · 밝은 도형.
  "playful-geometric": { chrome: "sticker", marker: "bullet", emphasis: "boxed", divider: "none" },
  // 차분한 어두운 여백.
  "minimal-dark": { chrome: "plain", marker: "rule", emphasis: "plain", divider: "hairline" },
  // 부드러운 입체 면 · 둥근 제목.
  claymorphism: { chrome: "blob", marker: "plain", emphasis: "plain", divider: "none" },
  // 정중한 판면 · 절제된 구획.
  professional: { chrome: "plain", marker: "numbered", emphasis: "plain", divider: "hairline" },
  // 식물선 장식은 작게 제한한다.
  botanical: { chrome: "blob", marker: "rule", emphasis: "plain", divider: "dotted" },
  // 색 번짐은 제목이나 경계에 제한 · 복고 창.
  vaporwave: { chrome: "window", marker: "bracket", emphasis: "bar", divider: "dashed" },
  // 프로젝트별 역할·기여·성과를 쉽게 찾도록 라벨을 반복한다.
  enterprise: { chrome: "panel", marker: "numbered", emphasis: "boxed", divider: "hairline" },
  // 종이 위 메모처럼 약간 불규칙한 테두리.
  sketch: { chrome: "plain", marker: "bullet", emphasis: "underlined", divider: "dashed" },
  // 얇은 경계와 작은 번호 라벨 · 안쪽 그림자.
  industrial: { chrome: "panel", marker: "numbered", emphasis: "bar", divider: "thick" },
  // 바탕과 같은 계열의 면에 돌출과 음각을 만든다.
  neumorphism: { chrome: "blob", marker: "plain", emphasis: "plain", divider: "none" },
  // 섹션 경계를 지나치게 딱딱하게 만들지 않는다.
  organic: { chrome: "blob", marker: "rule", emphasis: "plain", divider: "dotted" },
  // 다채로운 겹침 · 굵은 테두리와 어긋난 그림자.
  maximalism: { chrome: "sticker", marker: "bracket", emphasis: "oversized", divider: "thick" },
  // 밝고 어두운 경사 테두리로 고전 데스크톱 창을 표현한다.
  retro: { chrome: "window", marker: "bracket", emphasis: "boxed", divider: "thick" },
};

/** 표에 없는 스타일이 받는 조합. 표식 없이 면과 얇은 선만 쓴다. */
const PLAIN_KIT: DesignSystemSpecV2["componentKit"] = {
  chrome: "plain", marker: "plain", emphasis: "plain", divider: "hairline",
};

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
  const type = typefaceOf(preset);
  const size = DENSITY[density];
  const dark = preset.mode === "dark";
  const moves = directives(preset.prompt);
  const avoid = prohibitions(preset.prompt);
  const action = actionOn(accent);
  const slug = preset.code.replace(/^designprompts-/, "");

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
      muted: token(mutedOn(text, background), "설명과 메타데이터"),
      border: token(mix(text, background, dark ? 0.72 : 0.8), "정보 구획의 경계"),
      accent: token(accent, "대표 성과와 현재 상태"),
      action: token(action.background, "주요 행동 배경"),
      actionText: token(action.text, "주요 행동 위 글자"),
      roles: [
        { token: "accent", role: "강조", usage: "대표 성과와 선택 상태" },
        { token: "action", role: "주요 행동", usage: "페이지의 핵심 연락 행동" },
        { token: "muted", role: "보조 정보", usage: "기간, 역할, 설명" },
      ],
    },
    typography: {
      display: { family: type.display, fallback: type.fallback, role: "Hero와 섹션 제목" },
      body: { family: type.body, fallback: type.bodyFallback, role: "사례 설명과 긴 본문" },
      mono: { family: type.mono, fallback: type.monoFallback, role: "수치, 기간, 기술 메타데이터" },
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
    componentKit: KITS[slug] ?? PLAIN_KIT,
    shape: SHAPES[slug] ?? {
      cardRadius: size.cardRadius,
      controlRadius: density === "compact" ? 4 : 8,
      borderWidth: 1,
      shadowStyle: dark ? "none" : density === "spacious" ? "none" : "hairline",
    },
    composition: {
      structure,
      // 프리셋의 structure 가 이미 배치 축의 세 값이다.
      layout: structure,
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
