import type { EntitlementCapability, UsageTokens } from "@expresso/contracts";

/**
 * AI 계약 코드 → 사용자가 아는 기능 이름.
 *
 * 표에 없는 코드는 코드 그대로 선다. 새 계약이 생겨도 화면이 깨지지 않고, 빠진
 * 이름이 눈에 띈다.
 */
const CONTRACT_LABEL: Record<string, string> = {
  agent_chat: "에이전트 채팅",
  job_analysis: "공고 분석",
  job_facts: "공고 정보 읽기",
  search_interpret: "검색어 해석",
  question_draft: "인터뷰 질문",
  record_cleanup: "기록 정리",
  recipe_draft: "레시피 작성",
  generation: "문장 작성",
  layout_draft: "레이아웃 설계",
  page_generation: "지면 생성",
  page_review: "지면 다듬기",
  page_design: "지면 설계",
  page_fill: "설계도 칸 채우기",
  partial_edit: "부분 수정",
  style_remix: "스타일 바꾸기",
  insight_note: "방문 분석 해설",
};

export function contractLabel(contract: string): string {
  return CONTRACT_LABEL[contract] ?? contract;
}

/**
 * 크레딧에 들어가는 토큰 종류. 쌓는 순서이자 범례 순서다.
 *
 * 차트 계열 색은 이 순서로 `--ex-chart-1`부터 붙는다. 캐시 생성 토큰은 크레딧에
 * 넣지 않으므로 여기에도 없다(`BILLABLE_TOKEN_FIELDS`).
 */
export const TOKEN_KINDS: readonly { key: keyof UsageTokens; label: string }[] = [
  { key: "inputTokens", label: "입력" },
  { key: "outputTokens", label: "출력" },
  { key: "cacheReadTokens", label: "캐시 읽기" },
];

/**
 * 요금제 카드의 기능 줄.
 *
 * 서버가 실제로 막고 여는 기능만 적는다. 집행하지 않는 기능을 카드에 쓰면 카드가
 * 거짓말을 한다.
 */
export const CAPABILITY_LABEL: Partial<Record<EntitlementCapability, string>> = {
  "brew.cowork": "Cowork 모드",
  "analytics.organization_domains": "기업 도메인 방문 분석",
  "analytics.returning_visitors": "재방문 분석",
  "export.document": "이력서 파일 공유",
};
