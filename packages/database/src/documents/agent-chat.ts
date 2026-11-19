import type { AgentConversation } from "@expresso/contracts";
export type AgentConversationDoc = Omit<AgentConversation, "id"> & {
  _id: string; userId: string; heartbeatAt: Date;
  /**
   * 이 대화에서 만든 포트폴리오 제작. 공고 분석 ID → 제작 ID다. 응답에는 싣지 않는다.
   * 카드(도구 결과)에도 제작 ID가 있지만 다시 보내기는 마지막 답변의 카드를 지운다 — 대화에 따로 적어 두어야 제작이 하나로 남는다.
   */
  brewIds?: Record<string, string>;
};
