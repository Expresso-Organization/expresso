import {
  DesignSystemSpecV2Schema,
  ReferenceLockSchema,
  type DesignSystemSpecV2,
  type ReferenceLock,
} from "@expresso/contracts";

import { builtinDesignSystems } from "./builtins.js";

const CAPTURED_AT = "2026-08-31T08:20:00+09:00";

interface ReferoStyleDefinition {
  code:
    | "refero-apple"
    | "refero-mercury-alpine"
    | "refero-linear-midnight"
    | "refero-elevenlabs-cream"
    | "refero-stripe-ledger";
  name: string;
  sourceName: string;
  referoStyleUrl: string;
  originalUrl: string;
  base: DesignSystemSpecV2;
  description: string;
  visualThesis: string;
  traits: string[];
  signatureMoves: string[];
  colors: {
    canvas: string;
    surface: string;
    elevated: string;
    text: string;
    muted: string;
    border: string;
    accent: string;
    action: string;
    actionText: string;
  };
  typography: {
    display: string;
    body: string;
    mono: string;
    /** 라틴 가족에 없는 한글을 받는 서체. Google Fonts 한글 부분집합 가족이다. */
    korean: string;
    scale: Array<{ name: string; size: string; lineHeight: string }>;
    weights: number[];
    lineHeights: number[];
    letterSpacing: string[];
    measure: string;
  };
  spacing: {
    elementGap: number;
    componentGap: number;
    sectionGap: number;
    contentWidth: number;
  };
  shape: {
    cardRadius: number;
    controlRadius: number;
    borderWidth: number;
    shadowStyle: "none" | "hairline" | "soft" | "layered";
  };
  composition: {
    structure: string;
    layout: "single-column" | "dense-grid" | "wide-margin";
    density: "compact" | "comfortable" | "spacious";
    sectionRhythm: string;
    hierarchy: string;
    surfaceStrategy: string;
  };
  imagery: {
    mode: string;
    treatment: string;
    fallback: string;
  };
  motionPersonality: string;
  fitReasons: string[];
  observedSignals: string[];
  preserve: string[];
  reject: string[];
  revision?: number;
}

const token = (value: string, role: string) => ({ value, role });

function createSpec(definition: ReferoStyleDefinition): DesignSystemSpecV2 {
  const base = structuredClone(definition.base);
  return DesignSystemSpecV2Schema.parse({
    ...base,
    identity: {
      name: definition.name,
      description: definition.description,
      visualThesis: definition.visualThesis,
      traits: definition.traits,
      signatureMoves: definition.signatureMoves,
    },
    origin: {
      kind: "reference",
      sourceName: `Refero Styles · ${definition.sourceName}`,
      sourceUrl: definition.referoStyleUrl,
      capturedAt: CAPTURED_AT,
      attribution: "Refero Styles 공개 DESIGN.md를 Expresso 계약으로 변환한 비공식 참고",
    },
    colors: {
      canvas: token(definition.colors.canvas, "페이지 전체 바탕"),
      surface: token(definition.colors.surface, "기본 콘텐츠 표면"),
      elevated: token(definition.colors.elevated, "한 단계 올라온 정보 표면"),
      text: token(definition.colors.text, "제목과 본문"),
      muted: token(definition.colors.muted, "설명과 메타데이터"),
      border: token(definition.colors.border, "정보 구획의 경계"),
      accent: token(definition.colors.accent, "대표 강조"),
      action: token(definition.colors.action, "주요 행동 배경"),
      actionText: token(definition.colors.actionText, "주요 행동 위 글자"),
      roles: [
        { token: "accent", role: "대표 강조", usage: "대표 성과와 현재 상태" },
        { token: "action", role: "주요 행동", usage: "연락과 프로젝트 열기" },
        { token: "muted", role: "보조 정보", usage: "기간, 역할, 설명" },
      ],
    },
    typography: {
      display: {
        family: definition.typography.display,
        // 라틴 가족 뒤에 한글 서체를 둔다. 그래야 제목의 한글도 이 디자인이 그린다.
        fallback: `${definition.typography.korean}, system-ui`,
        role: "Hero와 섹션 제목",
      },
      body: {
        family: definition.typography.body,
        fallback: `${definition.typography.korean}, sans-serif`,
        role: "사례 설명과 긴 본문",
      },
      mono: {
        family: definition.typography.mono,
        fallback: "monospace",
        role: "수치, 기간, 기술 메타데이터",
      },
      scale: definition.typography.scale,
      weights: definition.typography.weights,
      lineHeights: definition.typography.lineHeights,
      letterSpacing: definition.typography.letterSpacing,
      measure: definition.typography.measure,
    },
    spacing: {
      baseUnit: 4,
      elementGap: definition.spacing.elementGap,
      componentGap: definition.spacing.componentGap,
      sectionGap: definition.spacing.sectionGap,
      contentWidth: definition.spacing.contentWidth,
    },
    shape: definition.shape,
    composition: definition.composition,
    imagery: {
      ...base.imagery,
      mode: definition.imagery.mode,
      treatment: definition.imagery.treatment,
      fallback: definition.imagery.fallback,
    },
    motion: {
      ...base.motion,
      personality: definition.motionPersonality,
    },
    rules: {
      ...base.rules,
      do: [
        ...definition.preserve,
        "Refero에서 관찰한 시스템을 Expresso 콘텐츠와 토큰 역할로 다시 구성한다",
      ],
      dont: [...definition.reject],
    },
  });
}

function createReferenceLock(definition: ReferoStyleDefinition): ReferenceLock {
  return ReferenceLockSchema.parse({
    version: 1,
    primaryDirection: {
      designSystemCode: definition.code,
      revision: definition.revision ?? 1,
    },
    fitReasons: definition.fitReasons,
    preserve: definition.preserve,
    borrowedDetails: definition.observedSignals,
    tokenRoles: [
      { token: "accent", role: "대표 강조", usage: "대표 성과와 현재 상태" },
      { token: "action", role: "주요 행동", usage: "연락 행동" },
    ],
    mediaStrategy: {
      mode: definition.imagery.mode,
      fallback: definition.imagery.fallback,
    },
    signatureMove: definition.signatureMoves[0],
    reject: definition.reject,
    sources: [
      {
        name: `Refero Styles · ${definition.sourceName}`,
        url: definition.referoStyleUrl,
        capturedAt: CAPTURED_AT,
        signal: definition.observedSignals.join(" · "),
        attribution: "Refero Styles 공개 DESIGN.md",
      },
      {
        name: `${definition.sourceName} 원본 웹사이트`,
        url: definition.originalUrl,
        capturedAt: CAPTURED_AT,
        signal: "Refero Styles가 분석한 원본 사이트",
        attribution: `${definition.sourceName} 공식 웹사이트`,
      },
    ],
  });
}

function createReferoStyle(definition: ReferoStyleDefinition) {
  return {
    code: definition.code,
    spec: createSpec(definition),
    referenceLock: createReferenceLock(definition),
  } as const;
}

export const referoDesignSystems = {
  apple: createReferoStyle({
    code: "refero-apple",
    name: "Apple",
    sourceName: "Apple (España)",
    revision: 2,
    referoStyleUrl: "https://styles.refero.design/style/c9cabb96-32fa-4896-837a-f2497ce1c856",
    originalUrl: "https://www.apple.com/macbook-neo",
    base: builtinDesignSystems.editorial.spec,
    description: "거대한 제목, 넓은 흰 여백, 제품 이미지에만 남기는 색으로 한 프로젝트를 집중시키는 방향",
    visualThesis: "흰 지면에 큰 제목을 띄우고 파란 행동 하나와 프로젝트 이미지로 색을 제한",
    traits: ["이미지 중심", "넓은 여백", "거대한 제목", "절제된"],
    signatureMoves: ["80–96px 제목이 떠 있는 흰 지면", "흰색과 #f5f5f7 섹션의 교차"],
    colors: {
      canvas: "#ffffff", surface: "#f5f5f7", elevated: "#fafafc",
      text: "#1d1d1f", muted: "#707070", border: "#d6d6d6",
      accent: "#0066cc", action: "#0071e3", actionText: "#ffffff",
    },
    typography: {
      display: "Inter", body: "Inter", mono: "ui-monospace",
      korean: "Noto Sans KR",
      scale: [
        { name: "body", size: "1.0625rem", lineHeight: "1.47" },
        { name: "subheading", size: "2rem", lineHeight: "1.13" },
        { name: "heading", size: "3.5rem", lineHeight: "1.07" },
        { name: "display", size: "6rem", lineHeight: "1.04" },
      ],
      weights: [400, 600, 700], lineHeights: [1.04, 1.07, 1.47],
      letterSpacing: ["-0.022em", "-0.015em", "0"], measure: "42rem",
    },
    spacing: { elementGap: 10, componentGap: 28, sectionGap: 120, contentWidth: 1200 },
    shape: { cardRadius: 28, controlRadius: 100, borderWidth: 1, shadowStyle: "none" },
    composition: {
      structure: "product-white-space", layout: "wide-margin", density: "spacious",
      sectionRhythm: "흰색과 옅은 회색의 큰 섹션을 100–120px 간격으로 교차",
      hierarchy: "거대한 제목, 프로젝트 이미지, 짧은 설명 순서",
      surfaceStrategy: "경계선 대신 #ffffff와 #f5f5f7 표면 교차",
    },
    imagery: {
      mode: "project-hero-first",
      treatment: "대표 프로젝트 이미지를 큰 비율과 28px 반경으로 배치",
      fallback: "이미지가 없으면 큰 제목과 짧은 사례 하나로 집중",
    },
    motionPersonality: "정적인 여백 사이에서 집중 대상을 천천히 전환",
    fitReasons: ["완성도 높은 대표 프로젝트와 시각 결과물을 크게 보여주기 좋습니다."],
    observedSignals: ["80–96px display", "#ffffff/#f5f5f7 교차", "28px 카드", "#0071e3 CTA"],
    preserve: ["큰 제목과 넓은 정적 여백", "제품 이미지에 색을 맡기는 전략", "한 섹션 한 메시지"],
    reject: ["장식용 그러데이션", "카드 그림자", "여러 강조색", "촘촘한 본문"],
  }),
  mercury: createReferoStyle({
    code: "refero-mercury-alpine",
    name: "Mercury Alpine",
    sourceName: "Mercury — Alpine banking at blue hour",
    referoStyleUrl: "https://styles.refero.design/style/3172cd4d-118a-4a16-a259-6b634d32322e",
    originalUrl: "https://mercury.com/",
    base: builtinDesignSystems.signal.spec,
    description: "어두운 온닉스 지면, 조용한 그래파이트 카드, 코발트 행동 하나로 리더십 사례를 묵직하게 보여주는 방향",
    visualThesis: "거의 단색인 밤 지면에서 아이보리 글과 코발트 행동만 또렷하게 남김",
    traits: ["어두운 지면", "프리미엄", "조용한", "사진 중심"],
    signatureMoves: ["#171721 지면 위의 #1e1e2a 카드", "코발트 행동 하나만 남기는 색 절제"],
    colors: {
      canvas: "#171721", surface: "#1e1e2a", elevated: "#272735",
      text: "#ededf3", muted: "#c3c3cc", border: "#70707d",
      accent: "#5266eb", action: "#5266eb", actionText: "#ffffff",
    },
    typography: {
      display: "Inter", body: "Inter", mono: "ui-monospace",
      korean: "Noto Sans KR",
      scale: [
        { name: "body", size: "1rem", lineHeight: "1.5" },
        { name: "subheading", size: "1.3125rem", lineHeight: "1.35" },
        { name: "heading", size: "2.625rem", lineHeight: "1.15" },
        { name: "display", size: "4.0625rem", lineHeight: "1.1" },
      ],
      weights: [400, 500], lineHeights: [1.1, 1.15, 1.5],
      letterSpacing: ["-0.02em", "0"], measure: "44rem",
    },
    spacing: { elementGap: 12, componentGap: 24, sectionGap: 96, contentWidth: 1160 },
    shape: { cardRadius: 12, controlRadius: 100, borderWidth: 1, shadowStyle: "none" },
    composition: {
      structure: "midnight-gallery", layout: "wide-margin", density: "comfortable",
      sectionRhythm: "큰 사진과 조용한 그래파이트 카드가 긴 호흡으로 교차",
      hierarchy: "대표 장면, 핵심 판단, 세부 근거 순서",
      surfaceStrategy: "온닉스 바탕과 한 단계 밝은 그래파이트 카드",
    },
    imagery: {
      mode: "cinematic-project-first",
      treatment: "대표 프로젝트 이미지를 어두운 전체 폭 장면으로 사용",
      fallback: "이미지가 없으면 짧은 리더십 서사와 코발트 행동으로 완결",
    },
    motionPersonality: "느리고 조용한 화면 전환과 짧은 코발트 상태 변화",
    fitReasons: ["리더십·전략·핀테크 작업을 차분하고 고급스럽게 설명하기 좋습니다."],
    observedSignals: ["#171721 canvas", "#1e1e2a cards", "#5266eb CTA", "12px cards", "pill controls"],
    preserve: ["어두운 단색 지면", "코발트 행동 하나", "평평한 12px 카드", "사진이 여는 첫 장면"],
    reject: ["다중 강조색", "과한 그림자", "밝은 카드 혼합", "소란스러운 모션"],
  }),
  linear: createReferoStyle({
    code: "refero-linear-midnight",
    name: "Linear Midnight",
    sourceName: "Linear — Midnight precision instrument",
    referoStyleUrl: "https://styles.refero.design/style/90ce5883-bb24-4466-93f7-801cd617b0d1",
    originalUrl: "https://linear.app/",
    base: builtinDesignSystems.signal.spec,
    description: "거의 검은 표면, 0.5px 경계, 산성 라임 행동으로 개발·제품 작업을 정밀하게 배열하는 방향",
    visualThesis: "#08090a 지면과 머리카락 같은 경계 위에 라임 행동만 기능적으로 사용",
    traits: ["기술적", "정밀한", "촘촘한", "장식 없는"],
    signatureMoves: ["0.5px 경계가 만드는 정밀한 기하", "#e4f222 행동 하나가 비추는 어두운 지면"],
    colors: {
      canvas: "#08090a", surface: "#0f1011", elevated: "#161718",
      text: "#e5e5e6", muted: "#8a8f98", border: "#23252a",
      accent: "#e4f222", action: "#e4f222", actionText: "#08090a",
    },
    typography: {
      display: "Inter", body: "Inter", mono: "ui-monospace",
      korean: "Gothic A1",
      scale: [
        { name: "body", size: "0.9375rem", lineHeight: "1.5" },
        { name: "subheading", size: "1.25rem", lineHeight: "1.3" },
        { name: "heading", size: "2.25rem", lineHeight: "1.12" },
        { name: "display", size: "4rem", lineHeight: "1.05" },
      ],
      weights: [400, 500], lineHeights: [1.05, 1.12, 1.5],
      letterSpacing: ["-0.022em", "0"], measure: "46rem",
    },
    spacing: { elementGap: 8, componentGap: 12, sectionGap: 64, contentWidth: 1180 },
    shape: { cardRadius: 6, controlRadius: 6, borderWidth: 0.5, shadowStyle: "none" },
    composition: {
      structure: "precision-instrument", layout: "dense-grid", density: "compact",
      sectionRhythm: "8–12px 내부 간격의 정밀한 정보 구획을 반복",
      hierarchy: "현재 상태, 핵심 수치, 기술 근거 순서",
      surfaceStrategy: "#08090a/#0f1011/#161718 표면을 0.5px 선으로 구분",
    },
    imagery: {
      mode: "interface-evidence-first",
      treatment: "제품 화면과 기술 아티팩트만 시각 질감으로 사용",
      fallback: "이미지가 없으면 상태·수치·기술 근거 격자로 완결",
    },
    motionPersonality: "짧고 정밀한 상태 전환",
    fitReasons: ["개발·제품·운영 작업의 상태와 기술 근거를 빠르게 훑기 좋습니다."],
    observedSignals: ["#08090a canvas", "#e4f222 action", "0.5px borders", "6/12px radii", "compact 8–12px padding"],
    preserve: ["거의 검은 표면 단계", "0.5px 정밀 경계", "라임 행동의 희소성", "낮은 글자 굵기"],
    reject: ["장식용 그림", "두꺼운 그림자", "굵은 제목 남용", "라임색 장식"],
  }),
  elevenLabs: createReferoStyle({
    code: "refero-elevenlabs-cream",
    name: "ElevenLabs Cream",
    sourceName: "ElevenLabs — Warm cream editorial",
    referoStyleUrl: "https://styles.refero.design/style/031056ff-7af1-46db-8daa-115f731c5d26",
    originalUrl: "https://elevenlabs.io/",
    base: builtinDesignSystems.editorial.spec,
    description: "달걀 껍질 같은 웜 화이트, 가는 제목, 타우프 카드로 연구·창작 사례를 조용하게 보여주는 방향",
    visualThesis: "따뜻한 종이 지면과 검은 잉크 위에 제품 순간에만 보라와 주황을 점화",
    traits: ["에디토리얼", "따뜻한", "가는 제목", "기술적"],
    signatureMoves: ["#fdfcfc 종이와 #f5f3f1 타우프 표면", "제품 시각에만 남기는 보라·주황 불꽃"],
    colors: {
      canvas: "#fdfcfc", surface: "#f5f3f1", elevated: "#ebe8e4",
      text: "#000000", muted: "#777169", border: "#ebe8e4",
      accent: "#0447ff", action: "#000000", actionText: "#ffffff",
    },
    typography: {
      display: "Inter", body: "Inter", mono: "ui-monospace",
      korean: "Gowun Batang",
      scale: [
        { name: "body", size: "1rem", lineHeight: "1.5" },
        { name: "body-lg", size: "1.25rem", lineHeight: "1.35" },
        { name: "heading", size: "2.25rem", lineHeight: "1.17" },
        { name: "display", size: "3rem", lineHeight: "1.08" },
      ],
      weights: [300, 400, 500], lineHeights: [1.08, 1.17, 1.5],
      letterSpacing: ["-0.02em", "0"], measure: "42rem",
    },
    spacing: { elementGap: 12, componentGap: 24, sectionGap: 88, contentWidth: 1120 },
    shape: { cardRadius: 20, controlRadius: 100, borderWidth: 1, shadowStyle: "hairline" },
    composition: {
      structure: "warm-editorial-studio", layout: "single-column", density: "comfortable",
      sectionRhythm: "웜 화이트와 타우프 표면을 긴 문장과 제품 순간 사이에 교차",
      hierarchy: "가는 제목, 긴 사례, 제품 시각 순서",
      surfaceStrategy: "웜 화이트와 타우프의 한 단계 차이, 1px 경계",
    },
    imagery: {
      mode: "product-moments-only",
      treatment: "보라와 주황은 제품 시각 안에서만 사용",
      fallback: "이미지가 없으면 따뜻한 종이 지면과 긴 사례로 완결",
    },
    motionPersonality: "조용하고 짧은 제품 상태 변화",
    fitReasons: ["연구·창작·AI 제품의 긴 사례와 기술 설명을 따뜻하게 보여주기 좋습니다."],
    observedSignals: ["#fdfcfc canvas", "#f5f3f1 surfaces", "#0447ff/#ff4704 visual sparks", "20px cards", "pill buttons"],
    preserve: ["웜 화이트 종이 질감", "가는 제목", "20px 카드", "색은 제품 시각 안에만 사용"],
    reject: ["보라색 UI 장식", "차가운 회색 지면", "강한 그림자", "굵은 제목"],
  }),
  stripe: createReferoStyle({
    code: "refero-stripe-ledger",
    name: "Stripe Ledger",
    sourceName: "Stripe — Indigo-ink ledger on frosted glass",
    referoStyleUrl: "https://styles.refero.design/style/48e5de76-05d5-4c4e-a269-c7c245b291ec",
    originalUrl: "https://stripe.com/",
    base: builtinDesignSystems.clarity.spec,
    description: "쿨 화이트 지면, 딥 네이비 글, 인디고 행동으로 수치와 시스템 근거를 레저처럼 정리하는 방향",
    visualThesis: "그림자 없는 옅은 표면 단계 위에 네이비 정보와 인디고 행동만 선명하게 배치",
    traits: ["수치 중심", "기술적", "정돈된", "인디고"],
    signatureMoves: ["#061b31 정보와 #533afd 행동의 대비", "그림자 없이 표면 농도로 만드는 깊이"],
    colors: {
      canvas: "#ffffff", surface: "#f8fafd", elevated: "#e5edf5",
      text: "#061b31", muted: "#50617a", border: "#d6d9fc",
      accent: "#7389ff", action: "#533afd", actionText: "#ffffff",
    },
    typography: {
      display: "Inter", body: "Inter", mono: "ui-monospace",
      korean: "Noto Sans KR",
      scale: [
        { name: "body", size: "1rem", lineHeight: "1.55" },
        { name: "subheading", size: "1.5rem", lineHeight: "1.3" },
        { name: "heading", size: "2.5rem", lineHeight: "1.12" },
        { name: "display", size: "3.5rem", lineHeight: "1.05" },
      ],
      weights: [300, 400, 500], lineHeights: [1.05, 1.12, 1.55],
      letterSpacing: ["-0.025em", "0"], measure: "46rem",
    },
    spacing: { elementGap: 12, componentGap: 24, sectionGap: 96, contentWidth: 1200 },
    shape: { cardRadius: 4, controlRadius: 4, borderWidth: 1, shadowStyle: "none" },
    composition: {
      structure: "frosted-ledger", layout: "dense-grid", density: "comfortable",
      sectionRhythm: "큰 주장, 신뢰 수치, 시스템 사례를 넓은 간격으로 반복",
      hierarchy: "핵심 주장, 수치, 시스템 근거 순서",
      surfaceStrategy: "흰색에서 #f8fafd와 #e5edf5로 이어지는 표면 농도",
    },
    imagery: {
      mode: "metrics-and-systems-first",
      treatment: "수치와 시스템 도식을 옅은 표면 안에 정렬",
      fallback: "이미지가 없으면 신뢰 수치와 기술 근거로 완결",
    },
    motionPersonality: "정보 순서를 안내하는 짧고 절제된 전환",
    fitReasons: ["플랫폼·데이터·비즈니스 성과를 수치와 시스템 근거로 설명하기 좋습니다."],
    observedSignals: ["#061b31 ink", "#533afd action", "4px controls", "no shadows", "white/#f8fafd/#e5edf5 surfaces"],
    preserve: ["딥 네이비 정보 위계", "인디고 행동", "4px 컨트롤", "표면 농도로 만드는 깊이"],
    reject: ["그림자", "과한 색상", "큰 라운드 카드", "장식용 인디고"],
  }),
} as const;
