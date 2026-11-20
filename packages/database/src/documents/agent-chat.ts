import type { AgentConversation } from "@expresso/contracts";
export type AgentConversationDoc = Omit<AgentConversation, "id"> & {
  _id: string; userId: string; heartbeatAt: Date;
  /**
   * 이 대화에서 만든 포트폴리오 제작. 공고 분석 ID → 제작 ID다. 응답에는 싣지 않는다.
   * 카드(도구 결과)에도 제작 ID가 있지만 다시 보내기는 마지막 답변의 카드를 지운다 — 대화에 따로 적어 두어야 제작이 하나로 남는다.
   */
  brewIds?: Record<string, string>;
  /**
   * 에이전트가 결과를 알린 공고 분석. 공고 분석 ID → 그 알림을 담은 답변의 ID다. 시작하는 답에서 이미 알렸으면 그 답변의 ID다.
   * 분석 하나에 알림은 한 번이다. 응답에는 싣지 않는다.
   */
  brewAnnounced?: Record<string, string>;
  /**
   * 대화에서 연 인터뷰. 제작 ID → 에이전트가 첫 질문을 한 답변의 ID다. 다시 보내기가 이 답변을 같은 계기로 다시 만든다.
   * 제작 하나에 한 번이다. 응답에는 싣지 않는다.
   */
  brewInterviews?: Record<string, string>;
  /**
   * 인터뷰 답으로 저장한 사용자 메시지. "제작 ID:근거 키" → 메시지 ID다. 답의 글은 이 메시지들의 원문을 대화 순서로 이은 것이고,
   * 같은 근거의 꼬리 답이 오면 앞의 메시지와 합쳐 다시 저장한다(답 저장은 기록 본문을 덮어쓴다). 응답에는 싣지 않는다.
   */
  brewInterviewMessages?: Record<string, string[]>;
};
