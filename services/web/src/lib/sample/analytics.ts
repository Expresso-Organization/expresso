/**
 * 07b 지표 라이브러리와 07c 위젯 설정이 쓰는 예시 데이터.
 *
 * 07 본화면은 `GET /v1/portfolios/:id/analytics/dashboard`로 옮겨 갔다. 여기
 * 남은 것은 **위젯 CRUD API가 없어서** 아직 실데이터로 못 가는 두 드로어뿐이다
 * (`docs/API_GAPS.md`).
 */

// ── 07b 지표 라이브러리 ───────────────────────────────────────────────

export const METRIC_LIBRARY = [
  {
    group: "방문",
    metrics: [
      { name: "방문 수", state: "used" as const },
      { name: "순 방문자", state: "new" as const },
      { name: "재방문율", state: "pro" as const },
      { name: "유입 경로", state: "used" as const },
    ],
  },
  {
    group: "참여",
    metrics: [
      { name: "평균 체류", state: "used" as const },
      { name: "섹션별 체류", state: "used" as const },
      { name: "스크롤 깊이", state: "new" as const },
      { name: "이탈 지점", state: "new" as const },
    ],
  },
  {
    group: "전환",
    metrics: [
      { name: "연락처 클릭", state: "used" as const },
      { name: "이력서 내려받기", state: "new" as const },
      { name: "외부 링크 클릭", state: "new" as const },
    ],
  },
  {
    group: "채용담당자",
    metrics: [
      { name: "기업 도메인 방문", state: "pro" as const },
      { name: "기업별 체류", state: "pro" as const },
    ],
  },
] as const;

// ── 07c 위젯 설정 ─────────────────────────────────────────────────────

export const VISUALIZATIONS = [
  { id: "number", label: "숫자", icon: "number-square-one" },
  { id: "spark", label: "스파크", icon: "chart-line" },
  { id: "bar", label: "막대", icon: "chart-bar" },
  { id: "line", label: "선", icon: "chart-line-up" },
  { id: "donut", label: "도넛", icon: "chart-donut" },
  { id: "table", label: "표", icon: "table" },
] as const;

export const SPANS = [
  { id: "3", label: "1/4" },
  { id: "4", label: "1/3" },
  { id: "8", label: "2/3" },
  { id: "12", label: "전체" },
] as const;
