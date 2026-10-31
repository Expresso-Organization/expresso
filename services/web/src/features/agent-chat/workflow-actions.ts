"use server";
import { z } from "zod";
import { WorkflowInputSchema, WorkflowReviewInputSchema, WorkflowResponseSchema, WorkflowListResponseSchema, WorkflowOptionsResponseSchema, type WorkflowInput, type WorkflowReviewInput, AnalyzedJobPostingResponseSchema, ReanalysisRequestResultSchema, } from "@expresso/contracts";
import { ApiError, request } from "@/lib/api/client";
import { requireSession } from "@/lib/require-session";
function path(conversationId: string) { return `/v1/agent/conversations/${z.uuid().parse(conversationId)}/workflows`; }
function errorMessage(error: unknown) { return error instanceof ApiError && error.status < 500 ? error.message : "작업 계획을 처리하지 못했습니다. 다시 불러와 저장 상태를 확인하세요."; }
export async function loadCareerWorkflows(conversationId: string) {
 const session = await requireSession();
 try { const base = path(conversationId); const [runs, options] = await Promise.all([request(base, WorkflowListResponseSchema, { accessToken: session.accessToken, cache: "no-store" }), request(`${base}/options`, WorkflowOptionsResponseSchema, { accessToken: session.accessToken, cache: "no-store" })]); return { ok: true as const, runs: runs.data, options: options.data }; }
 catch(error) { return { ok: false as const, error: errorMessage(error) }; }
}
export async function createCareerWorkflow(conversationId: string, value: WorkflowInput) {
 const session = await requireSession();
 try { const body = WorkflowInputSchema.parse(value); const response = await request(path(conversationId), WorkflowResponseSchema, { method: "POST", body, accessToken: session.accessToken }); return { ok: true as const, data: response.data }; }
 catch(error) { return { ok: false as const, error: errorMessage(error) }; }
}
export async function reviewCareerWorkflow(conversationId: string, id: string, value: WorkflowReviewInput) {
 const session = await requireSession();
 try { const body = WorkflowReviewInputSchema.parse(value); const response = await request(`${path(conversationId)}/${z.uuid().parse(id)}/review`, WorkflowResponseSchema, { method: "POST", body, accessToken: session.accessToken }); return { ok: true as const, data: response.data }; }
 catch(error) { return { ok: false as const, error: errorMessage(error) }; }
}
export async function decideCareerWorkflow(conversationId: string, id: string, expectedVersion: number, action: "advance" | "cancel") {
 const session = await requireSession();
 try { if (!["advance","cancel"].includes(action)) throw new Error("invalid action"); const response = await request(`${path(conversationId)}/${z.uuid().parse(id)}/${action}`, WorkflowResponseSchema, { method: "POST", body: { expectedVersion }, accessToken: session.accessToken }); return { ok: true as const, data: response.data }; }
 catch(error) { return { ok: false as const, error: errorMessage(error) }; }
}
export async function retryFailedPostingAnalysis(jobId: string) {
  const session = await requireSession();
  try { const postingId = z.uuid().parse(jobId);
    // 기존 분석을 조회하거나, 없으면 최초 분석을 요청합니다.
    const response = await request(
      `/v1/jobs/postings/${postingId}/analyses`,
      AnalyzedJobPostingResponseSchema,
      {
        method: "POST",
        accessToken: session.accessToken,
      },
    );
    const analysis = response.data;
    if (analysis.status === "done") {
      return {
        ok: true as const,
        message:
          "공고 분석이 완료됐습니다. 제작 재료 준비를 다시 누르세요.",
      };
    }
    if (analysis.status !== "failed") {
      return {
        ok: true as const,
        message:
          "공고 분석이 대기 또는 실행 중입니다. 완료 후 제작 재료 준비를 다시 누르세요.",
      };
    }
    await request(
      `/v1/job-analyses/${analysis.jobAnalysisId}/reanalyze`,
      z.object({
        data: ReanalysisRequestResultSchema,
      }),
      {
        method: "POST",
        accessToken: session.accessToken,
      },
    );
    return {
      ok: true as const,
      message:
        "실패한 공고 분석을 다시 요청했습니다. Worker 처리 후 제작 재료 준비를 다시 누르세요.",
    };
  } catch (error) {
    return {
      ok: false as const,
      error: errorMessage(error),
    };
  }
}