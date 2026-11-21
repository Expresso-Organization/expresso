import { UuidSchema } from "@expresso/contracts";

import { ApiError } from "@/lib/api/client";
import { brews } from "@/lib/api/endpoints";
import { BrewMaterialsCardResponseSchema, SelectBrewMaterialsSchema, resumePath } from "@/lib/brew-materials-card";
import { readAccessToken } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 제작의 재료 목록 읽기와 고른 목록 저장.
 *
 * 대화의 「재료 고르기」 카드가 부른다. 세션 토큰은 `httpOnly` 쿠키에만 있어 브라우저의 코드가 읽지 못하므로, 여기서
 * 쿠키의 토큰을 붙여 지금의 재료 고르기 화면과 같은 백엔드 API를 부른다. 그래서 두 화면에서 고른 것이 서로 보인다.
 */
const MESSAGES: Record<number, string> = {
  400: "한 번에 10건까지 고를 수 있습니다.",
  404: "이 제작을 찾지 못했습니다.",
  409: "고를 수 없는 기록이 섞여 있습니다.",
};

async function read(token: string, brewId: string, materials = brews.materials(token, brewId).then((response) => response.data)) {
  const [list, brew] = await Promise.all([materials, brews.get(token, brewId).then((response) => response.data)]);
  return BrewMaterialsCardResponseSchema.parse({ data: { materials: list, resumePath: resumePath(brew) } });
}

async function handle(request: Request, context: { params: Promise<{ brewId: string }> }) {
  const token = await readAccessToken();
  if (!token) return Response.json({ error: { message: "로그인이 필요합니다." } }, { status: 401 });
  const { brewId } = await context.params;
  if (!UuidSchema.safeParse(brewId).success) return new Response(null, { status: 404 });
  try {
    if (request.method === "GET") return Response.json(await read(token, brewId));
    const body = SelectBrewMaterialsSchema.safeParse(await request.json().catch(() => null));
    if (!body.success) return Response.json({ error: { message: "입력 내용을 확인해 주세요." } }, { status: 400 });
    // 질문을 만드는 중이거나 재료 단계를 지난 제작은 이 길로 고치지 않는다. 대화에 남은 옛 카드가 다음 단계의 재료를 바꾸지 못하게 한다.
    if (resumePath((await brews.get(token, brewId)).data)) return Response.json({ error: { message: "다음 단계로 넘어간 제작입니다. 고른 기록은 여기서 바꾸지 않습니다." } }, { status: 409 });
    return Response.json(await read(token, brewId, brews.selectMaterials(token, brewId, body.data.recordIds).then((response) => response.data)));
  } catch (error) {
    if (error instanceof ApiError) return Response.json({ error: { message: MESSAGES[error.status] ?? "재료를 불러오지 못했습니다. 다시 시도해 주세요." } }, { status: error.status });
    throw error;
  }
}

export const GET = handle;
export const PUT = handle;
