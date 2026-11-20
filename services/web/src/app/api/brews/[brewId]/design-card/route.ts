import { UuidSchema } from "@expresso/contracts";

import { failureNote } from "@/app/(app)/brew/[brewId]/design/failure-note";
import { ApiError } from "@/lib/api/client";
import { brews, entitlements } from "@/lib/api/endpoints";
import { BrewDesignCardResponseSchema } from "@/lib/brew-design-card";
import { readAccessToken } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 대화의 「디자인」 카드가 디자인 대화 말고 더 읽는 것 — 구성이 있는지, 만드는 중인지, 실패했는지, 이번 달에 만들 수 있는지.
 *
 * 디자인 화면의 서버 렌더가 읽는 것과 같은 백엔드 경로(`brews.get` · `entitlements.check`)다. 세션 토큰은 `httpOnly` 쿠키에만 있어
 * 여기서 붙인다. AI를 부르지 않는다.
 */
export async function GET(_request: Request, context: { params: Promise<{ brewId: string }> }) {
  const token = await readAccessToken();
  if (!token) return Response.json({ error: { message: "로그인이 필요합니다." } }, { status: 401 });
  const { brewId } = await context.params;
  if (!UuidSchema.safeParse(brewId).success) return new Response(null, { status: 404 });
  try {
    const [brew, quota] = await Promise.all([brews.get(token, brewId).then((response) => response.data), entitlements.check(token, "portfolio.generate").then((response) => response.data)]);
    const recipeJob = brew.latestJob?.type === "recipe" ? brew.latestJob : null;
    return Response.json(BrewDesignCardResponseSchema.parse({ data: {
      recipeId: brew.recipeId,
      recipeBuilding: recipeJob?.status === "queued" || recipeJob?.status === "running",
      recipeFailure: recipeJob?.status === "failed" && !brew.recipeId ? failureNote(recipeJob.failure?.code ?? null, brew.freeTitle !== null) : null,
      generationAllowed: quota.allowed,
      generating: brew.latestGeneration?.status === "queued" || brew.latestGeneration?.status === "running",
    } }));
  } catch (error) {
    if (error instanceof ApiError) return Response.json({ error: { message: error.status === 404 ? "이 제작을 찾지 못했습니다." : "디자인을 불러오지 못했습니다. 다시 시도해 주세요." } }, { status: error.status });
    throw error;
  }
}
