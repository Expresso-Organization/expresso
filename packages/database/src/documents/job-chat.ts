export interface JobChatSessionDoc {
  _id: string;
  userId: string;
  jobPostingId: string;

  // 대화방 생성 요청의 중복 방지
  createRequestId: string;

  title: string;
  createdAt: Date;
  updatedAt: Date;

  // 다음 메시지에 배정할 순서. 최초 값은 1입니다.
  nextSequence: number;

  generationStatus: "idle" | "generating" | "completed" | "failed";
  generationRequestId: string | null;

  // 서버 중단 시 생성 상태를 복구하기 위한 만료 시각
  generationExpiresAt: Date | null;

  // 만료된 작업이 뒤늦게 답변을 저장하는 것을 방지
  generationAttemptId: string | null;
}

export interface JobChatMessageDoc {
  _id: string;
  userId: string;
  sessionId: string;
  requestId: string;
  role: "user" | "assistant";
  content: string;
  sequence: number;
  createdAt: Date;
}