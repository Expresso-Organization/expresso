import { ApiError } from "@/lib/api/client";
import { account } from "@/lib/api/endpoints";
import { readAccessToken } from "@/lib/session";

/**
 * 09 내 데이터 내보내기 — 기록 · 포트폴리오 전체를 JSON 파일로 내려받는다.
 * 계약으로 파싱한 뒤 그대로 넘긴다.
 */
export async function GET(): Promise<Response> {
  const accessToken = await readAccessToken();
  if (!accessToken) return new Response("로그인이 필요합니다", { status: 401 });
  try {
    const { data } = await account.exportData(accessToken);
    const day = data.generatedAt.slice(0, 10);
    return new Response(JSON.stringify(data, null, 2), {
      headers: {
        "content-type": "application/json; charset=utf-8",
        "content-disposition": `attachment; filename="expresso-export-${day}.json"`,
        "cache-control": "no-store",
      },
    });
  } catch (error) {
    if (error instanceof ApiError) return new Response(error.message, { status: error.status });
    throw error;
  }
}
