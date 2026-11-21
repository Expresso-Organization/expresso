import { UuidSchema } from "@expresso/contracts";

import { ApiError } from "@/lib/api/client";
import { brews, interview } from "@/lib/api/endpoints";
import { BrewInterviewCardResponseSchema, interviewCard } from "@/lib/brew-interview-card";
import { readAccessToken } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 대화의 「AI 대화」 카드가 읽는 근거와 답한 질문.
 *
 * 세션 토큰은 `httpOnly` 쿠키에만 있어 브라우저의 코드가 읽지 못하므로, 여기서 쿠키의 토큰을 붙여 지금의 AI 대화 화면과 같은
 * 백엔드 API(제작 상태 · 질문 근거 · 인터뷰 세션)를 부른다. AI를 부르지 않는다.
 */
export async function GET(_request: Request, context: { params: Promise<{ brewId: string }> }) {
  const token = await readAccessToken();
  if (!token) return Response.json({ error: { message: "로그인이 필요합니다." } }, { status: 401 });
  const { brewId } = await context.params;
  if (!UuidSchema.safeParse(brewId).success) return new Response(null, { status: 404 });
  try {
    const [brew, bases] = await Promise.all([brews.get(token, brewId).then((response) => response.data), brews.interviewBases(token, brewId).then((response) => response.data.bases)]);
    const session = brew.interviewSessionId ? (await interview.session(token, brew.interviewSessionId)).data : null;
    return Response.json(BrewInterviewCardResponseSchema.parse({ data: interviewCard(brew, bases, session) }));
  } catch (error) {
    if (error instanceof ApiError) return Response.json({ error: { message: error.status === 404 ? "이 제작을 찾지 못했습니다." : "AI 대화를 불러오지 못했습니다. 다시 시도해 주세요." } }, { status: error.status });
    throw error;
  }
}
