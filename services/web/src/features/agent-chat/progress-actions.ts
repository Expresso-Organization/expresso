"use server";
import { CreateReplanSchema, ProgressResponseSchema, ReplanDecisionSchema, ReplanListResponseSchema, ReplanResponseSchema, UpdateTaskProgressSchema, type CreateReplan, type UpdateTaskProgress } from "@expresso/contracts";
import { z } from "zod";
import { ApiError, request } from "@/lib/api/client";
import { requireSession } from "@/lib/require-session";
function message(error: unknown) {
  if (error instanceof ApiError) {
    if (error.status === 409) return "진행 상태·근거가 변경됐습니다. 목록을 다시 불러오세요. 재계획 초안 생성 후 진행을 수정했다면 새 초안을 만들고, P6가 바뀌었다면 새 P7 계획이 필요합니다.";
    if (error.status === 422) return "미완료 작업이 없거나 새 가용 시간에 작업을 배정할 수 없습니다. 시간·기간을 확인하세요.";
    if (error.status === 400) return "완료 결과 또는 링크, 입력 길이, 시간·기간을 확인하세요.";
    if (error.status === 404) return "계획·작업을 찾을 수 없습니다. 진행 관리 시작 여부를 확인하세요.";
    if (error.status === 401 || error.status === 403) return "로그인과 접근 권한을 확인하세요.";
  }
  return "진행 기록 요청에 실패했습니다. 목록을 불러와 저장 여부를 확인하세요.";
}
function path(conversationId: string, planId: string) { if (!z.uuid().safeParse(conversationId).success || !z.uuid().safeParse(planId).success) throw new Error("invalid IDs"); return `/v1/agent/conversations/${conversationId}/preparation-plans/${planId}/progress`; }
export async function loadPreparationProgress(conversationId: string, planId: string) {
  const session = await requireSession();
  try { const base = path(conversationId, planId); const [progress, replans] = await Promise.all([request(base, ProgressResponseSchema, { accessToken: session.accessToken, cache: "no-store" }), request(`${base}/replans`, ReplanListResponseSchema, { accessToken: session.accessToken, cache: "no-store" })]); return { ok: true as const, progress: progress.data, replans: replans.data }; }
  catch (error) { return { ok: false as const, error: message(error) }; }
}
export async function startPreparationProgress(conversationId: string, planId: string) {
  const session = await requireSession();
  try { const result = await request(path(conversationId, planId), ProgressResponseSchema, { method: "POST", body: {}, accessToken: session.accessToken }); return { ok: true as const, data: result.data }; }
  catch (error) { return { ok: false as const, error: message(error) }; }
}
export async function updatePreparationTask(conversationId: string, planId: string, taskId: string, value: UpdateTaskProgress) {
  const parsed = UpdateTaskProgressSchema.safeParse(value); if (!parsed.success || !z.uuid().safeParse(taskId).success) return { ok: false as const, error: "완료 상태에는 결과 설명이나 http(s) 링크가 필요합니다. 시간은 0 이상의 정수로 입력하세요." };
  const session = await requireSession();
  try { const result = await request(`${path(conversationId, planId)}/tasks/${taskId}`, ProgressResponseSchema, { method: "PATCH", body: parsed.data, accessToken: session.accessToken }); return { ok: true as const, data: result.data }; }
  catch (error) { return { ok: false as const, error: message(error) }; }
}
export async function createPreparationReplan(conversationId: string, planId: string, value: CreateReplan) {
  const parsed = CreateReplanSchema.safeParse(value); if (!parsed.success) return { ok: false as const, error: "주당 시간 1~40, 기간 1~12주와 시작일을 확인하세요." };
  const session = await requireSession();
  try { const result = await request(`${path(conversationId, planId)}/replans`, ReplanResponseSchema, { method: "POST", body: parsed.data, accessToken: session.accessToken }); return { ok: true as const, data: result.data }; }
  catch (error) { return { ok: false as const, error: message(error) }; }
}
export async function decidePreparationReplan(conversationId: string, planId: string, replanId: string, expectedVersion: number, action: "approve" | "reject") {
  const value = ReplanDecisionSchema.safeParse({ expectedVersion }); if (!value.success || !z.uuid().safeParse(replanId).success || !["approve", "reject"].includes(action)) return { ok: false as const, error: "잘못된 재계획 요청입니다." };
  const session = await requireSession();
  try { const result = await request(`${path(conversationId, planId)}/replans/${replanId}/${action}`, ReplanResponseSchema, { method: "POST", body: value.data, accessToken: session.accessToken }); return { ok: true as const, data: result.data }; }
  catch (error) { return { ok: false as const, error: message(error) }; }
}
