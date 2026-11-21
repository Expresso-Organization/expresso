import { UuidSchema } from "@expresso/contracts";

import { brewTitle } from "@/app/(app)/brew/[brewId]/brew-title";
import { waitReading } from "@/app/(app)/brew/[brewId]/design/wait-reading";
import { ApiError } from "@/lib/api/client";
import { brews } from "@/lib/api/endpoints";
import { BrewGenerationCardResponseSchema } from "@/lib/brew-generation-card";
import { readAccessToken } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 대화의 「생성」 카드와 무대가 읽는 제작의 최근 생성.
 *
 * 세션 토큰은 `httpOnly` 쿠키에만 있어 여기서 붙인다. 기다리는 동안의 입력 묶음은 `?reading=1`일 때만 만든다 —
 * 재료 · 구성 · 디자인 목록 · 공고 분석을 읽어 무거우므로 카드가 처음 한 번만 청한다. AI를 부르지 않는다.
 */
export async function GET(request: Request, context: { params: Promise<{ brewId: string }> }) {
  const token = await readAccessToken();
  if (!token) return Response.json({ error: { message: "로그인이 필요합니다." } }, { status: 401 });
  const { brewId } = await context.params;
  if (!UuidSchema.safeParse(brewId).success) return new Response(null, { status: 404 });
  try {
    const brew = (await brews.get(token, brewId)).data;
    const generation = brew.latestGeneration;
    const running = generation?.status === "queued" || generation?.status === "running";
    const recipeJob = brew.latestJob?.type === "recipe" ? brew.latestJob : null;
    const reading = running && new URL(request.url).searchParams.get("reading") === "1" ? await waitReading(token, brew) : null;
    return Response.json(BrewGenerationCardResponseSchema.parse({ data: {
      generation: generation ? { id: generation.id, status: generation.status, createdAt: generation.createdAt, portfolioId: generation.portfolioId ?? (generation.status === "done" ? brew.portfolioId : null), failureCode: generation.failureCode } : null,
      recipePending: running && !brew.recipeId && (recipeJob?.status === "queued" || recipeJob?.status === "running"),
      title: brewTitle(brew) ?? "포트폴리오",
      reading,
    } }));
  } catch (error) {
    if (error instanceof ApiError) return Response.json({ error: { message: error.status === 404 ? "이 제작을 찾지 못했습니다." : "생성 상태를 불러오지 못했습니다. 다시 시도해 주세요." } }, { status: error.status });
    throw error;
  }
}
