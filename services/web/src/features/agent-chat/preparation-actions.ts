"use server";
import { ApprovePreparationSchema, CreatePreparationSchema, PreparationListResponseSchema, PreparationResponseSchema, type ApprovePreparation, type CreatePreparation } from "@expresso/contracts";
import { z } from "zod";
import { ApiError, request } from "@/lib/api/client";
import { requireSession } from "@/lib/require-session";
function message(error: unknown) {
  if (error instanceof ApiError) {
    if (error.status === 409) return "입력·계획이 변경됐습니다. 최신 P3/P6와 후보 목록을 확인한 뒤 새 요청으로 진행하세요.";
    if (error.status === 422) return "선택한 항목이 가용 시간에 들어가지 않습니다. 항목을 줄이거나 주당 시간·기간을 늘려 주세요.";
    if (error.status === 404) return "대화 또는 계획을 찾을 수 없습니다.";
    if (error.status === 401 || error.status === 403) return "로그인과 접근 권한을 확인해 주세요.";
    if (error.status === 400) return "선택 항목·기간·계획 수정 내용을 확인해 주세요.";
  }
  return "준비 계획 요청에 실패했습니다. 저장 목록을 먼저 확인해 주세요.";
}
export async function loadPreparationPlans(conversationId: string) {
  const id = z.uuid().safeParse(conversationId); if (!id.success) return { ok: false as const, error: "잘못된 대화 ID입니다." };
  const session = await requireSession();
  try { const result = await request(`/v1/agent/conversations/${id.data}/preparation-plans`, PreparationListResponseSchema, { accessToken: session.accessToken, cache: "no-store" }); return { ok: true as const, ...result }; }
  catch (error) { return { ok: false as const, error: message(error) }; }
}
export async function createPreparationPlan(conversationId: string, input: CreatePreparation) {
  const id = z.uuid().safeParse(conversationId); const value = CreatePreparationSchema.safeParse(input);
  if (!id.success || !value.success) return { ok: false as const, error: "공고 Gap 1~10개, 주당 시간 1~40시간, 기간 1~12주, 시작일을 확인하세요." };
  const session = await requireSession();
  try { const result = await request(`/v1/agent/conversations/${id.data}/preparation-plans`, PreparationResponseSchema, { method: "POST", body: value.data, accessToken: session.accessToken, cache: "no-store" }); return { ok: true as const, data: result.data }; }
  catch (error) { return { ok: false as const, error: message(error) }; }
}
export async function approvePreparationPlan(conversationId: string, planId: string, input: ApprovePreparation) {
  const id = z.uuid().safeParse(conversationId); const plan = z.uuid().safeParse(planId); const value = ApprovePreparationSchema.safeParse(input);
  if (!id.success || !plan.success || !value.success) return { ok: false as const, error: "계획 제목·작업·산출물을 확인하세요." };
  const session = await requireSession();
  try { const result = await request(`/v1/agent/conversations/${id.data}/preparation-plans/${plan.data}/approve`, PreparationResponseSchema, { method: "POST", body: value.data, accessToken: session.accessToken, cache: "no-store" }); return { ok: true as const, data: result.data }; }
  catch (error) { return { ok: false as const, error: message(error) }; }
}
export async function rejectPreparationPlan(conversationId: string, planId: string, expectedVersion: number) {
  if (!z.uuid().safeParse(conversationId).success || !z.uuid().safeParse(planId).success || !Number.isSafeInteger(expectedVersion) || expectedVersion < 1) return { ok: false as const, error: "잘못된 계획 요청입니다." };
  const session = await requireSession();
  try { const result = await request(`/v1/agent/conversations/${conversationId}/preparation-plans/${planId}/reject`, PreparationResponseSchema, { method: "POST", body: { expectedVersion }, accessToken: session.accessToken, cache: "no-store" }); return { ok: true as const, data: result.data }; }
  catch (error) { return { ok: false as const, error: message(error) }; }
}
