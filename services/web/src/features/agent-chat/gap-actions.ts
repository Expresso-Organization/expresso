"use server";
import { AnalyzeCareerGapSchema, CareerGapResponseSchema, GetCareerGapResponseSchema, type AnalyzeCareerGap } from "@expresso/contracts";
import { z } from "zod";
import { ApiError, request } from "@/lib/api/client";
import { requireSession } from "@/lib/require-session";
function message(error: unknown) {
  if (error instanceof ApiError) {
    if (error.status === 403) return "AI 사용과 경력·공고 분석 동의를 확인해 주세요.";
    if (error.status === 404) return "대화 또는 공고를 찾을 수 없습니다.";
    if (error.status === 409) return "입력이 변경됐거나 분석이 실행 중입니다. P3를 다시 분석하고 새 Gap 분석을 요청하거나 저장 결과를 불러오세요.";
    if (error.status === 422) return "공고 하나를 연결하고 P3 분석을 완료해 주세요. 선택 답변의 길이나 인용 근거 검증도 확인해 주세요.";
    if (error.status === 400) return "이 대화에 저장된 사용자 경험 답변만 선택해 주세요.";
    if (error.status === 503) return "AI 분석 서비스를 사용할 수 없습니다.";
  }
  return "Gap 분석에 실패했습니다. 저장된 결과를 확인한 뒤 재시도해 주세요.";
}
export async function loadCareerGap(conversationId: string) {
  const id = z.uuid().safeParse(conversationId);
  if (!id.success) return { ok: false as const, error: "잘못된 대화 ID입니다." };
  const session = await requireSession();
  try {
    const result = await request(`/v1/agent/conversations/${id.data}/career-gap`, GetCareerGapResponseSchema, { accessToken: session.accessToken, cache: "no-store" });
    return { ok: true as const, ...result };
  } catch (error) { return { ok: false as const, error: message(error) }; }
}
export async function analyzeCareerGap(conversationId: string, input: AnalyzeCareerGap) {
  const id = z.uuid().safeParse(conversationId);
  const parsed = AnalyzeCareerGapSchema.safeParse(input);
  if (!id.success || !parsed.success) return { ok: false as const, error: "잘못된 분석 요청입니다." };
  const session = await requireSession();
  try {
    const result = await request(`/v1/agent/conversations/${id.data}/career-gap`, CareerGapResponseSchema, { method: "POST", body: parsed.data, accessToken: session.accessToken, cache: "no-store" });
    return { ok: true as const, data: result.data };
  } catch (error) { return { ok: false as const, error: message(error) }; }
}
