// 최종 SQL 제약 목록을 대조해 확정한 MongoDB 저장 타입입니다. API 계약은 contracts에서 가져옵니다.
import type { JsonValue, JsonObject } from "./common.js";

export interface InterviewSessionDoc {
  /** 질문 교체·진행 갱신의 낙관적 잠금 값입니다. */
  version?: number;
  _id: string;
  userId: string;
  brewId: string;
  status: "open" | "paused" | "done";
  questionCount: number;
  transcriptUrl?: string | null;
  inputIdempotencyKey?: string | null;
  currentOrder: number;
  answeredCount: number;
  pausedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface QuestionDoc {
  _id: string;
  userId: string;
  interviewSessionId: string;
  requirementId?: string | null;
  replacedFromId?: string | null;
  orderNo: number;
  text: string;
  skipped: boolean;
  basis: JsonObject;
  active: boolean;
  variant: number;
  createdAt: Date;
  rationale?: string | null;
}

export interface AnswerDoc {
  /** 정리 작업이 덮어써도 되는 기록 version입니다. */
  recordVersion?: number;
  _id: string;
  userId: string;
  questionId: string;
  inputType: "text" | "voice";
  transcript: string;
  createdRecordId?: string | null;
  inputIdempotencyKey?: string | null;
  requestHash?: string | null;
  version: number;
  updatedAt: Date;
}

export interface AnswerRecordChangeDoc {
  _id: string;
  userId: string;
  answerId: string;
  recordId: string;
  changeType: "created" | "strengthened";
  changedFields: JsonValue[];
  sourceQuote: string;
  createdAt: Date;
}
