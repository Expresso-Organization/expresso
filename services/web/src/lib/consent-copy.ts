import type { ConsentScope } from "@expresso/contracts";

/**
 * AI 사용 동의를 사람에게 보이는 말.
 *
 * 무엇이 나가는지를 먼저 쓴다. 켜고 끄는 스위치보다 그 문장이 중요하다.
 * 설정 화면과, 동의가 꺼져 실패한 제작 화면이 같은 이름을 쓴다.
 */
export const CONSENT_COPY: Record<ConsentScope, { title: string; what: string }> = {
  job_posting_analysis: {
    title: "공고 분석",
    what: "붙여 넣은 채용 공고의 원문이 AI 모델로 갑니다.",
  },
  career_records: {
    title: "커리어 기록 사용",
    what: "내가 쓴 기록과 대화 답변이 AI 모델로 갑니다. 끄면 제작이 돌지 않습니다.",
  },
};

/** 설정 화면의 AI 사용 동의 묶음. 실패 안내가 이 자리로 보낸다. */
export const CONSENT_SETTINGS_HREF = "/account#ai-consent";
