"use server";
import { EvidenceSearchInputSchema, EvidenceSearchResponseSchema, SemanticJobInputSchema, SemanticJobResponseSchema, SearchSyncResponseSchema, type EvidenceSearchInput, type SemanticJobInput } from "@expresso/contracts";
import { ApiError, request } from "@/lib/api/client";
import { requireSession } from "@/lib/require-session";
function message(error: unknown) {
  if (error instanceof ApiError && error.status < 500 && typeof error.details?.searchMessage === "string") return error.details.searchMessage;
  if (error instanceof ApiError && error.status === 403) return "검색에 필요한 공고 분석·경력 사용 동의를 확인하세요.";
  if (error instanceof ApiError && error.status === 409) return "자료가 변경됐습니다. 다시 검색하세요.";
  return "검색하지 못했습니다. 설정과 저장 상태를 확인한 뒤 다시 시도하세요.";
}
export async function searchCareerEvidence(input: EvidenceSearchInput) {
  const session = await requireSession();
  try { const response = await request("/v1/career/evidence-search", EvidenceSearchResponseSchema, { method: "POST", body: EvidenceSearchInputSchema.parse(input), accessToken: session.accessToken }); return { ok: true as const, data: response.data }; }
  catch (error) { return { ok: false as const, error: message(error) }; }
}
export async function searchSemanticJobs(input: SemanticJobInput) {
  const session = await requireSession();
  try { const response = await request("/v1/jobs/semantic-search", SemanticJobResponseSchema, { method: "POST", body: SemanticJobInputSchema.parse(input), accessToken: session.accessToken }); return { ok: true as const, data: response.data }; }
  catch (error) { return { ok: false as const, error: message(error) }; }
}
export async function syncEvidenceIndex() {
  const session = await requireSession();
  try { const response = await request("/v1/career/evidence-search/sync", SearchSyncResponseSchema, { method: "POST", body: {}, accessToken: session.accessToken }); return { ok: true as const, data: response.data }; }
  catch (error) { return { ok: false as const, error: message(error) }; }
}
