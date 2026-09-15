import { ListCareerRecordsQuerySchema, ListJobPostingsQuerySchema, ListPortfoliosQuerySchema } from "@expresso/contracts";
import { career, jobs, portfolios } from "@/lib/api/endpoints";
import { ApiError } from "@/lib/api/client";
import { readAccessToken } from "@/lib/session";

export async function GET(request: Request, context: { params: Promise<{ kind: string }> }) {
  const token = await readAccessToken();
  if (!token) return Response.json({ error: { message: "로그인이 필요합니다." } }, { status: 401 });
  const { kind } = await context.params;
  const query = Object.fromEntries(new URL(request.url).searchParams);
  try {
    if (kind === "records") {
      const parsed = ListCareerRecordsQuerySchema.safeParse(query);
      if (!parsed.success) return new Response(null, { status: 400 });
      return Response.json(await career.records(token, parsed.data));
    }
    if (kind === "jobs") {
      const parsed = ListJobPostingsQuerySchema.safeParse(query);
      if (!parsed.success) return new Response(null, { status: 400 });
      return Response.json(await jobs.postings(token, parsed.data));
    }
    if (kind === "portfolios") {
      const parsed = ListPortfoliosQuerySchema.safeParse(query);
      if (!parsed.success) return new Response(null, { status: 400 });
      return Response.json(await portfolios.list(token, parsed.data));
    }
    return new Response(null, { status: 404 });
  } catch (error) {
    return Response.json({ error: { message: "목록을 불러오지 못했습니다. 다시 시도해 주세요." } }, { status: error instanceof ApiError ? error.status : 502 });
  }
}
