import { z } from "zod";

// 사용자 질문과 AI 답변의 길이 제한
export const JOB_CHAT_USER_CONTENT_MAX = 4000;
export const JOB_CHAT_ASSISTANT_CONTENT_MAX = 12000;

// 대화방 생성 요청
// 같은 requestId로 재요청하면 같은 대화방을 반환하도록 구현할 예정입니다.
export const CreateJobChatSessionSchema = z.strictObject({
  jobPostingId: z.uuid(),
  requestId: z.uuid(),
});

export type CreateJobChatSession = z.infer<
  typeof CreateJobChatSessionSchema
>;

// 대화방 정보
// API에서는 Date 객체 대신 ISO 형식 문자열을 사용합니다.
export const JobChatSessionSchema = z.strictObject({
  id: z.uuid(),
  jobPostingId: z.uuid(),
  title: z.string().trim().min(1).max(200),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

export type JobChatSession = z.infer<
  typeof JobChatSessionSchema
>;

// 저장된 사용자 메시지
const JobChatUserMessageSchema = z.strictObject({
  id: z.uuid(),
  sessionId: z.uuid(),
  requestId: z.uuid(),
  role: z.literal("user"),
  content: z.string().trim().min(1).max(JOB_CHAT_USER_CONTENT_MAX),
  sequence: z.number().int().positive(),
  createdAt: z.iso.datetime(),
});

// 저장된 AI 메시지
const JobChatAssistantMessageSchema = z.strictObject({
  id: z.uuid(),
  sessionId: z.uuid(),
  requestId: z.uuid(),
  role: z.literal("assistant"),
  content: z.string().trim().min(1).max(JOB_CHAT_ASSISTANT_CONTENT_MAX),
  sequence: z.number().int().positive(),
  createdAt: z.iso.datetime(),
});

// role에 따라 서로 다른 길이 제한을 적용합니다.
export const JobChatMessageSchema = z.discriminatedUnion("role", [
  JobChatUserMessageSchema,
  JobChatAssistantMessageSchema,
]);

export type JobChatMessage = z.infer<
  typeof JobChatMessageSchema
>;

// 이번에 전송할 사용자 질문
// 이전 대화는 백엔드가 DB에서 읽습니다.
export const SendJobChatMessageSchema = z.strictObject({
  requestId: z.uuid(),
  content: z.string().trim().min(1).max(JOB_CHAT_USER_CONTENT_MAX),
});

export type SendJobChatMessage = z.infer<
  typeof SendJobChatMessageSchema
>;

// 가장 최근 요청의 처리 상태
// idle: 아직 질문 없음
// generating: 답변 생성 중
// completed: 답변 저장 완료
// failed: 생성 실패, 재시도 가능
export const JobChatGenerationSchema = z.discriminatedUnion("status", [
  z.strictObject({
    status: z.literal("idle"),
  }),
  z.strictObject({
    status: z.literal("generating"),
    requestId: z.uuid(),
  }),
  z.strictObject({
    status: z.literal("completed"),
    requestId: z.uuid(),
  }),
  z.strictObject({
    status: z.literal("failed"),
    requestId: z.uuid(),
  }),
]);

export type JobChatGeneration = z.infer<
  typeof JobChatGenerationSchema
>;

// 최근 대화 목록 조회 조건
export const ListJobChatSessionsQuerySchema = z.strictObject({
  limit: z.coerce.number().int().min(1).max(50).default(20),
  cursor: z.string().min(1).max(512).optional(),
});

export type ListJobChatSessionsQuery = z.infer<
  typeof ListJobChatSessionsQuerySchema
>;

// 메시지 조회 조건
// 최초 조회: 최신 메시지
// beforeSequence 지정: 해당 순서보다 이전 메시지
export const ListJobChatMessagesQuerySchema = z.strictObject({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  beforeSequence: z.coerce.number().int().positive().optional(),
});

export type ListJobChatMessagesQuery = z.infer<
  typeof ListJobChatMessagesQuerySchema
>;

// 대화방 생성 응답
export const CreateJobChatSessionResponseSchema = z.strictObject({
  data: JobChatSessionSchema,
});

export type CreateJobChatSessionResponse = z.infer<
  typeof CreateJobChatSessionResponseSchema
>;

// 최근 대화 목록 응답
export const ListJobChatSessionsResponseSchema = z.strictObject({
  data: z.strictObject({
    sessions: z.array(JobChatSessionSchema).max(50),
    nextCursor: z.string().min(1).max(512).nullable(),
  }),
});

export type ListJobChatSessionsResponse = z.infer<
  typeof ListJobChatSessionsResponseSchema
>;

// 대화방 상세 조회 응답
// messages는 오래된 것부터 최신 순서로 반환합니다.
// nextBeforeSequence가 null이면 더 이전 메시지가 없습니다.
export const GetJobChatSessionResponseSchema = z.strictObject({
  data: z.strictObject({
    session: JobChatSessionSchema,
    messages: z.array(JobChatMessageSchema).max(100),
    generation: JobChatGenerationSchema,
    nextBeforeSequence: z.number().int().positive().nullable(),
  }),
});

export type GetJobChatSessionResponse = z.infer<
  typeof GetJobChatSessionResponseSchema
>;

// 질문 전송 성공 응답
export const SendJobChatMessageResponseSchema = z.strictObject({
  data: z.strictObject({
    session: JobChatSessionSchema,
    userMessage: JobChatUserMessageSchema,
    assistantMessage: JobChatAssistantMessageSchema,
  }),
});

export type SendJobChatMessageResponse = z.infer<
  typeof SendJobChatMessageResponseSchema
>;