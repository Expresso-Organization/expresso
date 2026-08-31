import {
  DesignSystemSpecV2Schema,
  ReferenceLockSchema,
  type DesignSystemSpecV2,
  type ReferenceLock,
} from "@expresso/contracts";

interface BuiltinConfig {
  code: "clarity" | "signal" | "editorial";
  name: string;
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
  displayFont: string;
  bodyFont: string;
  bodyFallback: string;
  /** 라틴 가족에 없는 한글을 받는 서체. Google Fonts 한글 부분집합 가족이다. */
  koreanFont: string;
  density: "compact" | "comfortable" | "spacious";
  structure: string;
  sectionGap: number;
  contentWidth: number;
  cardRadius: number;
  shadowStyle: "none" | "hairline" | "soft" | "layered";
  hierarchy: string;
  surfaceStrategy: string;
  imageryMode: string;
  imageryTreatment: string;
  signatureMove: string;
}

const token = (value: string, role: string) => ({ value, role });

function createSpec(config: BuiltinConfig): DesignSystemSpecV2 {
  return DesignSystemSpecV2Schema.parse({
    version: 2,
    identity: {
      name: config.name,
      description: config.description,
      visualThesis: config.visualThesis,
      traits: config.traits,
      signatureMoves: config.signatureMoves,
    },
    origin: {
      kind: "builtin",
      sourceName: "Expresso",
      sourceUrl: null,
      capturedAt: null,
      attribution: "Expresso 기본 디자인",
    },
    colors: {
      canvas: token(config.colors.canvas, "페이지 전체 바탕"),
      surface: token(config.colors.surface, "기본 섹션과 카드 표면"),
      elevated: token(config.colors.elevated, "한 단계 올라온 정보 표면"),
      text: token(config.colors.text, "제목과 본문"),
      muted: token(config.colors.muted, "설명과 메타데이터"),
      border: token(config.colors.border, "정보 구획의 경계"),
      accent: token(config.colors.accent, "대표 성과와 현재 상태"),
      action: token(config.colors.action, "주요 행동 배경"),
      actionText: token(config.colors.actionText, "주요 행동 위 글자"),
      roles: [
        { token: "accent", role: "강조", usage: "대표 성과와 선택 상태" },
        { token: "action", role: "주요 행동", usage: "페이지의 핵심 연락 행동" },
        { token: "muted", role: "보조 정보", usage: "기간, 역할, 설명" },
      ],
    },
    typography: {
      display: {
        family: config.displayFont,
        // 라틴 가족 뒤에 한글 서체를 둔다. 그래야 제목의 한글도 이 디자인이 그린다.
        fallback: config.code === "editorial" ? "Nanum Myeongjo, serif" : `${config.koreanFont}, system-ui`,
        role: "Hero와 섹션 제목",
      },
      body: {
        family: config.bodyFont,
        fallback: `${config.koreanFont}, ${config.bodyFallback}`,
        role: "사례 설명과 긴 본문",
      },
      mono: {
        family: "ui-monospace",
        fallback: "monospace",
        role: "수치, 기간, 기술 메타데이터",
      },
      scale: [
        { name: "body", size: "1rem", lineHeight: "1.65" },
        { name: "eyebrow", size: "0.8rem", lineHeight: "1.4" },
        { name: "heading", size: config.code === "signal" ? "1.8rem" : "2rem", lineHeight: "1.2" },
        { name: "display", size: config.code === "editorial" ? "4.5rem" : "4rem", lineHeight: "1.05" },
      ],
      weights: config.code === "editorial" ? [400, 600] : [400, 500, 700],
      lineHeights: config.code === "signal" ? [1.2, 1.5] : [1.2, 1.65],
      letterSpacing: config.code === "signal" ? ["0", "0.04em"] : ["0", "-0.02em"],
      measure: config.code === "editorial" ? "42rem" : "46rem",
    },
    spacing: {
      baseUnit: 4,
      elementGap: config.density === "compact" ? 10 : 14,
      componentGap: config.density === "spacious" ? 32 : 24,
      sectionGap: config.sectionGap,
      contentWidth: config.contentWidth,
    },
    shape: {
      cardRadius: config.cardRadius,
      controlRadius: config.code === "signal" ? 4 : 8,
      borderWidth: 1,
      shadowStyle: config.shadowStyle,
    },
    composition: {
      structure: config.structure,
      density: config.density,
      sectionRhythm: config.code === "signal"
        ? "짧은 정보 묶음과 정밀한 구획을 반복"
        : config.code === "editorial"
          ? "긴 사례 사이에 넓은 정적 여백을 배치"
          : "하나의 읽기 흐름에 일정한 섹션 간격을 적용",
      hierarchy: config.hierarchy,
      surfaceStrategy: config.surfaceStrategy,
    },
    components: {
      hero: {
        description: config.signatureMove,
        anatomy: ["역할", "대표 성과", "연락 행동"],
        tokens: ["canvas", "text", "accent", "action", "action-text"],
        do: ["첫 화면에서 역할과 대표 성과를 함께 보여준다"],
        dont: ["소개 문구만으로 첫 화면을 채우지 않는다"],
      },
      card: {
        description: config.code === "editorial"
          ? "긴 사례와 아티팩트를 여백으로 묶는 단위"
          : "문제, 행동, 결과를 한 경계 안에서 읽는 단위",
        anatomy: ["제목", "맥락", "결과", "근거"],
        tokens: ["surface", "elevated", "border", "text", "muted"],
        do: ["성과와 근거가 같은 시야에 들어오게 한다"],
        dont: ["장식만 있는 빈 카드를 반복하지 않는다"],
      },
      metric: {
        description: config.code === "signal"
          ? "고정폭 숫자와 비교 기준을 함께 제시하는 수치 단위"
          : "대표 성과를 본문보다 한 단계 크게 보여주는 수치 단위",
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
      mode: config.imageryMode,
      aspectRatio: "4:3",
      treatment: config.imageryTreatment,
      fallback: "이미지가 없으면 성과와 과정이 읽히는 텍스트 사례를 사용",
    },
    motion: {
      personality: config.code === "signal" ? "정확하고 짧은 상태 변화" : "차분한 진입과 상태 변화",
      duration: config.code === "signal" ? "140ms" : "180ms",
      easing: "ease-out",
      reducedMotion: "움직임을 제거하고 최종 상태를 즉시 표시",
    },
    rules: {
      do: [
        "선언된 토큰 역할로 색과 서체를 사용한다",
        config.code === "signal" ? "수치에 비교 기준을 붙인다" : "역할과 성과를 먼저 읽히게 한다",
      ],
      dont: [
        "장식용 그러데이션을 사용하지 않는다",
        "외부 자산과 식별 가능한 원본 카피를 가져오지 않는다",
      ],
      tokenRoles: [
        { token: "text", role: "핵심 내용", usage: "제목과 본문" },
        { token: "accent", role: "한 가지 강조", usage: "대표 성과와 현재 상태" },
        { token: "action", role: "행동", usage: "연락과 프로젝트 열기" },
      ],
    },
  });
}

function createReferenceLock(config: BuiltinConfig): ReferenceLock {
  return ReferenceLockSchema.parse({
    version: 1,
    primaryDirection: { designSystemCode: config.code, revision: 1 },
    fitReasons: [config.description],
    preserve: [config.visualThesis, ...config.signatureMoves],
    borrowedDetails: [],
    tokenRoles: [
      { token: "accent", role: "대표 강조", usage: "성과와 현재 상태" },
      { token: "action", role: "주요 행동", usage: "연락 행동" },
    ],
    mediaStrategy: {
      mode: config.imageryMode,
      fallback: "텍스트 사례와 수치로 완결",
    },
    signatureMove: config.signatureMove,
    reject: ["장식용 그러데이션", "외부 식별 자산", "근거 없는 수치"],
    sources: [],
  });
}

function createBuiltin(config: BuiltinConfig) {
  return {
    code: config.code,
    spec: createSpec(config),
    referenceLock: createReferenceLock(config),
  } as const;
}

export const builtinDesignSystems = {
  clarity: createBuiltin({
    code: "clarity",
    name: "Clarity",
    description: "빠른 검토에서 역할, 대표 성과, 근거가 한 흐름으로 읽히는 기본 디자인",
    visualThesis: "한 줄기의 읽기 흐름으로 역할과 성과를 분명하게 연결",
    traits: ["명료함", "안정된 리듬", "성과 우선"],
    signatureMoves: ["Hero에서 역할과 대표 성과를 한 문장으로 연결", "얕은 표면과 부드러운 경계"],
    colors: {
      canvas: "#ffffff", surface: "#f7f8fa", elevated: "#eef2f7",
      text: "#17202a", muted: "#5f6b78", border: "#d6dde6",
      accent: "#2563eb", action: "#2563eb", actionText: "#ffffff",
    },
    displayFont: "Inter", bodyFont: "system-ui", bodyFallback: "sans-serif",
    koreanFont: "Noto Sans KR",
    density: "comfortable", structure: "single-column", sectionGap: 72,
    contentWidth: 1080, cardRadius: 12, shadowStyle: "soft",
    hierarchy: "역할, 대표 성과, 상세 근거 순서",
    surfaceStrategy: "밝은 바탕 위에 얕은 카드 표면",
    imageryMode: "project-artifacts-optional", imageryTreatment: "얇은 경계와 자연 비율",
    signatureMove: "첫 화면부터 마지막 연락 행동까지 끊기지 않는 단일 읽기 흐름",
  }),
  signal: createBuiltin({
    code: "signal",
    name: "Signal",
    description: "기술, 데이터, 운영 성과의 수치와 비교 기준을 정밀하게 보여주는 디자인",
    visualThesis: "어두운 기술 지면에서 수치, 경계, 고정폭 메타데이터를 선명하게 분리",
    traits: ["정밀함", "높은 정보 밀도", "수치 중심"],
    signatureMoves: ["고정폭 메타데이터와 청록색 수치 강조", "얇은 선으로 나눈 증거 격자"],
    colors: {
      canvas: "#0b1220", surface: "#111c2e", elevated: "#18263b",
      text: "#f2f6fb", muted: "#a6b4c7", border: "#29405f",
      accent: "#22d3ee", action: "#22d3ee", actionText: "#07111f",
    },
    displayFont: "Inter", bodyFont: "system-ui", bodyFallback: "sans-serif",
    koreanFont: "IBM Plex Sans KR",
    density: "compact", structure: "evidence-grid", sectionGap: 56,
    contentWidth: 1180, cardRadius: 4, shadowStyle: "hairline",
    hierarchy: "대표 수치, 비교 기준, 기술 근거 순서",
    surfaceStrategy: "어두운 표면 단계를 얇은 선으로 구분",
    imageryMode: "data-and-architecture-first", imageryTreatment: "도표와 아키텍처를 경계 안에 정렬",
    signatureMove: "청록 수치와 고정폭 메타데이터가 이끄는 증거 격자",
  }),
  editorial: createBuiltin({
    code: "editorial",
    name: "Editorial",
    description: "연구, 디자인, 집필 작업의 긴 사례와 프로젝트 이미지를 넓은 여백에 담는 디자인",
    visualThesis: "따뜻한 지면과 세리프 제목, 긴 호흡의 사례로 판단 과정을 드러냄",
    traits: ["넓은 여백", "긴 사례", "프로젝트 이미지"],
    signatureMoves: ["세리프 제목과 좁은 본문 폭", "사례 사이를 구분하는 넓은 정적 여백"],
    colors: {
      canvas: "#fbfaf7", surface: "#f4f0e9", elevated: "#ebe4da",
      text: "#29251f", muted: "#766d63", border: "#d8cfc2",
      accent: "#9a5b3a", action: "#9a5b3a", actionText: "#ffffff",
    },
    displayFont: "Georgia", bodyFont: "Georgia", bodyFallback: "serif",
    koreanFont: "Nanum Myeongjo",
    density: "spacious", structure: "wide-margin", sectionGap: 104,
    contentWidth: 980, cardRadius: 8, shadowStyle: "none",
    hierarchy: "프로젝트 제목, 긴 사례, 인용과 아티팩트 순서",
    surfaceStrategy: "테두리보다 여백과 따뜻한 표면 차이로 구분",
    imageryMode: "project-artifacts-first", imageryTreatment: "넓은 지면에 자연 비율로 배치",
    signatureMove: "세리프 제목과 넓은 여백이 만드는 긴 사례의 호흡",
  }),
} as const;

export type BuiltinDesignSystem =
  (typeof builtinDesignSystems)[keyof typeof builtinDesignSystems];
