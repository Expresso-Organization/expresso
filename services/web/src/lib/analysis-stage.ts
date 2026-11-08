import type { JobAnalysisResult } from "@expresso/contracts";

/**
 * 공고 분석이 지나는 자리를 사람에게 보이는 말.
 *
 * `job_analysis.progress_stage`가 그대로 문장이 된다. 01 공고 분석 대기 화면과
 * 06b 공고 상세의 대조 컨트롤이 같은 진행을 가리키므로 말도 한 곳에서 가져온다.
 */
export const ANALYSIS_STAGE: Record<JobAnalysisResult["analysis"]["stage"], string> = {
  queued: "차례를 기다리는 중",
  extracting: "요건을 뽑는 중",
  validating: "원문과 맞춰 보는 중",
  covering: "내 기록과 대조하는 중",
  done: "분석 끝",
  failed: "분석 실패",
};

/** 막대가 차오르는 정도. 단계 수가 아니라 남은 체감 시간에 맞춘 값이다. */
export const ANALYSIS_PROGRESS: Record<JobAnalysisResult["analysis"]["stage"], number> = {
  queued: 10,
  extracting: 38,
  validating: 66,
  covering: 88,
  done: 100,
  failed: 100,
};
