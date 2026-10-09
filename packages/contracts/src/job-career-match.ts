import { z } from "zod";

// 맞춤 분석 실행 요청
// 재시도 시 같은 requestId를 사용합니다.
export const AnalyzeJobCareerMatchSchema = z.strictObject({
  requestId: z.uuid(),
});

export type AnalyzeJobCareerMatch = z.infer<
  typeof AnalyzeJobCareerMatchSchema
>;

// 분석에 사용한 경력의 버전을 기록합니다.
// 경력이 변경된 뒤 이전 분석인지 확인하는 데 사용합니다.
export const JobCareerMatchRecordSnapshotSchema = z.strictObject({
  recordId: z.uuid(),
  version: z.number().int().positive(),
  title: z.string().trim().min(1).max(500),
});

export type JobCareerMatchRecordSnapshot = z.infer<
  typeof JobCareerMatchRecordSnapshotSchema
>;

// AI가 제시한 경력 근거
// quote가 실제 전달된 경력 본문에 있는지는 백엔드에서 검증합니다.
export const JobCareerMatchEvidenceSchema = z.strictObject({
  recordId: z.uuid(),
  quote: z.string().trim().min(1).max(2000),
});

export type JobCareerMatchEvidence = z.infer<
  typeof JobCareerMatchEvidenceSchema
>;

// 공고 요구사항 하나에 대한 비교 결과
export const JobCareerMatchItemSchema = z.strictObject({
  requirement: z.string().trim().min(1).max(300),

  // 공고에 실제로 존재하는 인용문
  jobQuote: z.string().trim().min(1).max(2000),

  kind: z.enum(["must", "nice", "responsibility"]),

  // strong: 직접 관련된 경력 근거가 있음
  // partial: 일부 관련 근거가 있으나 추가 설명이 필요함
  // unconfirmed: 제공한 경력에서 근거를 확인하지 못함
  assessment: z.enum(["strong", "partial", "unconfirmed"]),

  explanation: z.string().trim().min(1).max(2000),

  evidence: z.array(JobCareerMatchEvidenceSchema).max(5),

  // 지원 준비 시 활용·보완할 방법
  recommendation: z.string().trim().min(1).max(2000),
}).superRefine((item, context) => {
  if (
    item.assessment !== "unconfirmed" &&
    item.evidence.length === 0
  ) {
    context.addIssue({
      code: "custom",
      path: ["evidence"],
      message: "강점 또는 부분 일치에는 경력 근거가 필요합니다.",
    });
  }

  if (
    item.assessment === "unconfirmed" &&
    item.evidence.length > 0
  ) {
    context.addIssue({
      code: "custom",
      path: ["evidence"],
      message: "미확인 항목에는 확인된 근거를 넣지 않습니다.",
    });
  }
});

export type JobCareerMatchItem = z.infer<
  typeof JobCareerMatchItemSchema
>;

// AI가 생성할 분석 결과
// ID, 사용자 정보, 생성 시각은 AI가 아닌 서버가 추가합니다.
export const JobCareerMatchAiOutputSchema = z.strictObject({
  summary: z.string().trim().min(1).max(3000),
  items: z.array(JobCareerMatchItemSchema).min(1).max(12),
});

export type JobCareerMatchAiOutput = z.infer<
  typeof JobCareerMatchAiOutputSchema
>;

// 분석에 사용한 입력의 범위와 변경 여부 확인 정보
export const JobCareerMatchInputSnapshotSchema = z.strictObject({
  jobPostingId: z.uuid(),

  // 분석에 사용한 공고 본문의 해시
  jobContentHash: z.string().regex(/^[a-f0-9]{64}$/),

  records: z.array(JobCareerMatchRecordSnapshotSchema).max(50),

  // true면 경력 개수·본문 길이 제한으로 입력 일부가 제외된 상태
  inputTruncated: z.boolean(),
});

export type JobCareerMatchInputSnapshot = z.infer<
  typeof JobCareerMatchInputSnapshotSchema
>;

// 저장하고 화면에 표시할 최종 결과
export const JobCareerMatchResultSchema = z.strictObject({
  id: z.uuid(),
  sessionId: z.uuid(),
  requestId: z.uuid(),
  createdAt: z.iso.datetime(),
  promptVersion: z.number().int().positive(),

  inputFingerprint: z.string().regex(/^[a-f0-9]{64}$/),

  inputSnapshot: JobCareerMatchInputSnapshotSchema,

  summary: z.string().trim().min(1).max(3000),
  items: z.array(JobCareerMatchItemSchema).min(1).max(12),
});

export type JobCareerMatchResult = z.infer<
  typeof JobCareerMatchResultSchema
>;

// 분석 실행 성공 응답
export const AnalyzeJobCareerMatchResponseSchema = z.strictObject({
  data: JobCareerMatchResultSchema,
});

export type AnalyzeJobCareerMatchResponse = z.infer<
  typeof AnalyzeJobCareerMatchResponseSchema
>;

// 대화방의 마지막 분석 조회 응답
// 아직 분석하지 않았다면 data는 null입니다.
export const GetJobCareerMatchResponseSchema = z.strictObject({
  data: JobCareerMatchResultSchema.nullable(),
});

export type GetJobCareerMatchResponse = z.infer<
  typeof GetJobCareerMatchResponseSchema
>;