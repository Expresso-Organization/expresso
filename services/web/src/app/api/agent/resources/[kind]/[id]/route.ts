import { AgentResourceDetailSchema, UuidSchema } from "@expresso/contracts";
import { career, jobs, portfolios, page } from "@/lib/api/endpoints";
import { ApiError } from "@/lib/api/client";
import { readAccessToken } from "@/lib/session";
export async function GET(_request: Request, context: { params: Promise<{ kind: string; id: string }> }) {
  const token = await readAccessToken(); if (!token) return new Response(null, { status: 401 });
  const { kind, id } = await context.params;
  if (!UuidSchema.safeParse(id).success) return new Response(null, { status: 400 });
  try {
    if (kind === "jobs") return Response.json(AgentResourceDetailSchema.parse({ kind: "job", data: (await jobs.posting(token, id)).data }));
    if (kind === "records") {
      const [record, document] = await Promise.all([career.record(token, id), career.document(token, id)]);
      return Response.json(AgentResourceDetailSchema.parse({ kind: "record", data: record.data, document }));
    }
    if (kind === "portfolios") {
      const portfolio = (await portfolios.get(token, id)).data;
      let generated = null;
      try { generated = (await page.latest(token, id)).data; } catch (error) { if (!(error instanceof ApiError && error.status === 404)) throw error; }
      return Response.json(AgentResourceDetailSchema.parse({ kind: "portfolio", data: portfolio, page: generated }));
    }
    return new Response(null, { status: 404 });
  } catch (error) { return Response.json({ error: { message: "자료를 불러오지 못했습니다. 권한이나 삭제 여부를 확인해 주세요." } }, { status: error instanceof ApiError ? error.status : 502 }); }
}
