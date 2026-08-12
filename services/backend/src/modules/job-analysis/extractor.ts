import type { JobAnalysisExtraction } from "@expresso/contracts";

/**
 * 요건 추출 포트.
 *
 * 구현은 **AI 계약 하나뿐이다.** 규칙 기반 폴백을 두지 않는다 — 문장을 잘라
 * 앞의 둘을 `must`로 찍는 식으로는 회사 비전 문구와 마크다운 헤딩이 그대로
 * "필수 요건"으로 올라온다. 화면은 그걸 "이 공고가 요구하는 것"이라 부르고
 * 재료 순위까지 그 기준으로 매겨지므로, **틀린 요건은 틀린 포트폴리오가 된다.**
 *
 * 수집기가 같은 자리에서 이미 같은 선택을 해 뒀다(`AiFactsReader` — AI가 꺼져
 * 있으면 본문을 아예 읽지 않는다). 정확도가 조용히 갈리는 두 경로를 두지 않는다.
 */
export interface RequirementExtractor {
  extract(source: string): Promise<JobAnalysisExtraction>;
}

export class RequirementExtractorUnavailableError extends Error {
  constructor() {
    super("requirement extractor is unavailable: AI provider is off");
    this.name = "RequirementExtractorUnavailableError";
  }
}

/**
 * AI가 꺼져 있을 때 그 자리에 서는 것.
 *
 * 흉내 내지 않고 **그 자리에서 멈춘다.** 분석은 `EXTRACTOR_UNAVAILABLE`로
 * 실패하고, 화면은 아직 읽지 못했다고 말한다. 지어낸 요건으로 다음 단계를
 * 진행시키는 것보다 멈추는 편이 낫다.
 */
export class UnavailableRequirementExtractor implements RequirementExtractor {
  async extract(): Promise<never> {
    throw new RequirementExtractorUnavailableError();
  }
}
