import type {
  MetricCatalogEntry,
  MetricKey,
  Widget,
  WidgetSpan,
  WidgetVisualization,
} from "@expresso/contracts";

import type { EntitlementCapability } from "@expresso/contracts";

/**
 * 07b 지표 라이브러리.
 *
 * **못 쓰는 지표를 목록에서 지우지 않는다.** 지우면 "이 도구는 그걸 못 본다"는
 * 사실이 아무 데도 남지 않아 같은 질문이 계속 돌아온다. 대신 왜 없는지를 한 줄로
 * 적는다 — 요금제가 막는 것과 우리가 아예 세고 있지 않은 것은 다른 이야기다.
 *
 * 화면 정의서 07b의 목록을 그대로 옮기되, 근거가 없는 칸은 `not_collected`로
 * 내리고 이유를 적었다. 지도에 없는 길을 그려 놓는 것보다 낫다.
 */

interface Definition {
  key: MetricKey;
  group: MetricCatalogEntry["group"];
  label: string;
  description: string;
  visualizations: WidgetVisualization[];
  defaultSpan: WidgetSpan;
  /** 요금제가 막는 지표. */
  capability?: EntitlementCapability;
  /** 우리가 세고 있지 않다면 왜 그런지. 있으면 `not_collected`다. */
  missing?: string;
}

const DEFINITIONS: Definition[] = [
  {
    key: "visits", group: "방문",
    label: "방문", description: "기간 내 전체 방문 · 소유자 제외",
    visualizations: ["number", "spark"], defaultSpan: 3,
  },
  {
    key: "visits_trend", group: "방문",
    label: "방문 추이", description: "날짜별 방문과 완독",
    visualizations: ["line"], defaultSpan: 8,
  },
  {
    key: "referrers", group: "방문",
    label: "유입 경로", description: "어디서 왔나 · origin까지만",
    visualizations: ["donut", "list"], defaultSpan: 4,
  },
  {
    key: "unique_visitors", group: "방문",
    label: "순 방문자", description: "중복 제거 · 세션 기준",
    visualizations: ["number"], defaultSpan: 3,
    missing: "집계는 하루 단위라 날짜를 더하면 같은 사람을 여러 번 셉니다.",
  },
  {
    key: "returning_rate", group: "방문",
    label: "재방문율", description: "두 번 이상 온 사람 비율",
    visualizations: ["number"], defaultSpan: 3,
    missing: "방문자를 날짜 너머로 잇지 않습니다 — 세션 해시는 하루마다 다릅니다(§9).",
  },
  {
    key: "region_device", group: "방문",
    label: "지역 · 기기", description: "수도권 / 모바일 비중",
    visualizations: ["donut"], defaultSpan: 4,
    missing: "지역도 기기도 수집하지 않습니다(§9 최소 수집).",
  },

  {
    key: "avg_dwell_ms", group: "참여",
    label: "평균 체류", description: "섹션 체류 합 ÷ 방문",
    visualizations: ["number"], defaultSpan: 3,
  },
  {
    key: "completion_rate", group: "참여",
    label: "끝까지 읽은 비율", description: "완독 ÷ 방문",
    visualizations: ["number"], defaultSpan: 3,
  },
  {
    key: "section_dwell", group: "참여",
    label: "섹션별 체류", description: "어느 섹션을 오래 봤나",
    visualizations: ["bar", "list"], defaultSpan: 4,
  },
  {
    key: "exit_points", group: "참여",
    label: "이탈 지점", description: "읽기를 멈춘 위치",
    visualizations: ["bar"], defaultSpan: 4,
    missing: "공개 사이트가 이탈을 아직 보내지 않습니다 — 자리는 있고 채우는 쪽이 없습니다.",
  },

  {
    key: "contact_clicks", group: "전환",
    label: "연락처 클릭", description: "메일 · 전화 · 링크드인",
    visualizations: ["number", "spark"], defaultSpan: 3,
  },
  {
    key: "file_downloads", group: "전환",
    label: "이력서 내려받기", description: "파일 내려받기 수",
    visualizations: ["number", "spark"], defaultSpan: 3,
  },
  {
    key: "link_clicks", group: "전환",
    label: "외부 링크 클릭", description: "깃허브 · 블로그 등",
    visualizations: ["number", "spark"], defaultSpan: 3,
  },
  {
    key: "inquiry_mail", group: "전환",
    label: "문의 메일 수신", description: "폼 · 메일 회신",
    visualizations: ["number"], defaultSpan: 3,
    missing: "메일을 받는 경로가 아직 없습니다.",
  },

  {
    key: "org_domains", group: "채용담당자",
    label: "기업 도메인 방문", description: "회사 네트워크 접속만 · 개인 식별 안 함",
    visualizations: ["list"], defaultSpan: 4,
    capability: "analytics.organization_domains",
  },
  {
    key: "org_returning", group: "채용담당자",
    label: "채용담당자 재방문율", description: "같은 회사가 두 번 이상",
    visualizations: ["number"], defaultSpan: 3,
    capability: "analytics.returning_visitors",
    missing: "방문자를 날짜 너머로 잇지 않아 같은 회사의 재방문을 셀 수 없습니다.",
  },

  {
    key: "insight", group: "해설",
    label: "BARISTA'S READ", description: "이 기간에 무슨 일이 있었는지 두 문장",
    visualizations: ["note"], defaultSpan: 4,
  },
];

const BY_KEY = new Map(DEFINITIONS.map((definition) => [definition.key, definition]));

/**
 * 지금 이 사용자에게 이 지표가 무엇인가.
 *
 * 세고 있지 않은 것이 먼저다 — 요금제를 올려도 없는 값은 없다. PRO를 팔면서
 * 없는 것을 팔 수는 없다.
 */
export function metricCatalog(allows: (capability: EntitlementCapability) => boolean): MetricCatalogEntry[] {
  return DEFINITIONS.map((definition) => {
    const [availability, reason] = definition.missing
      ? (["not_collected", definition.missing] as const)
      : definition.capability && !allows(definition.capability)
        ? (["plan_required", "PRO에서 볼 수 있습니다."] as const)
        : (["ready", null] as const);
    return {
      key: definition.key,
      group: definition.group,
      label: definition.label,
      description: definition.description,
      availability,
      reason,
      visualizations: definition.visualizations,
      defaultVisualization: definition.visualizations[0] as WidgetVisualization,
      defaultSpan: definition.defaultSpan,
    };
  });
}

/** 그 지표가 그 그림을 낼 수 있는가. 없는 짝은 저장하지 않는다. */
export function supports(key: MetricKey, visualization: WidgetVisualization): boolean {
  return BY_KEY.get(key)?.visualizations.includes(visualization) ?? false;
}

export function metricDefaults(key: MetricKey): { visualization: WidgetVisualization; span: WidgetSpan } {
  const definition = BY_KEY.get(key);
  return {
    visualization: (definition?.visualizations[0] ?? "number") as WidgetVisualization,
    span: definition?.defaultSpan ?? 3,
  };
}

export function metricIsCollected(key: MetricKey): boolean {
  return BY_KEY.get(key)?.missing === undefined;
}

/**
 * 기본 지면 — 화면 정의서 07이 그리는 그대로.
 *
 * DB에 없다. 사용자가 편집을 시작하는 순간 이 목록이 그대로 굳고, 그 위에서
 * 고친다. 아무것도 안 한 사람의 계정에 위젯 아홉 줄을 미리 심어 둘 이유가 없다.
 */
export const DEFAULT_LAYOUT: Omit<Widget, "id">[] = [
  { metricKey: "visits", visualization: "number", span: 3, compareTo: "prev_period", order: 0 },
  { metricKey: "avg_dwell_ms", visualization: "number", span: 3, compareTo: "prev_period", order: 1 },
  { metricKey: "completion_rate", visualization: "number", span: 3, compareTo: "prev_period", order: 2 },
  { metricKey: "contact_clicks", visualization: "number", span: 3, compareTo: "prev_period", order: 3 },
  { metricKey: "visits_trend", visualization: "line", span: 8, compareTo: null, order: 4 },
  { metricKey: "insight", visualization: "note", span: 4, compareTo: null, order: 5 },
  { metricKey: "section_dwell", visualization: "bar", span: 4, compareTo: null, order: 6 },
  { metricKey: "referrers", visualization: "donut", span: 4, compareTo: null, order: 7 },
  { metricKey: "org_domains", visualization: "list", span: 4, compareTo: null, order: 8 },
];
