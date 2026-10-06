import type { JobCareerMatchResult } from "@expresso/contracts";

export interface JobCareerMatchDoc {
  _id: string;
  userId: string;
  sessionId: string;
  requestId: string;

  status: "running" | "completed" | "failed";

  // 실제 AI 입력과 프롬프트 버전을 포함한 해시
  inputFingerprint: string;
  promptVersion: number;

  // 재시도 작업을 구분하고 오래된 작업의 저장을 막습니다.
  attemptId: string | null;
  expiresAt: Date | null;

  // 완료 시에만 결과를 저장합니다.
  result: JobCareerMatchResult | null;

  // 원본 오류나 개인정보 대신 간단한 오류 코드만 저장합니다.
  failureCode: string | null;

  createdAt: Date;
  updatedAt: Date;
}