import {
  ApiErrorResponseSchema, CareerBusinessRecordResponseSchema, CareerWriterCreateSchema, CareerWriterPatchSchema,
  CareerWriterIfMatchSchema, CareerWriterMoveSchema, CareerWriterRelationSchema, CareerWriterMovePreviewInputSchema,
  CareerWriterMovePreviewResponseSchema, IdempotencyKeySchema, UuidSchema,
  type CareerWriterCreate, type CareerWriterPatch, type CareerWriterMove, type CareerWriterRelation,
} from "@expresso/contracts";

export class SpringCareerCommandError extends Error {
  constructor(readonly status: number, readonly response: ReturnType<typeof ApiErrorResponseSchema.parse>) {
    super(response.error.message);
  }
}
type Transport = (url: string, init: RequestInit) => Promise<Response>;

// B2가 명시적으로 등록할 command port입니다. 현재 서비스·라우트에서 가져오지 않습니다.
export function createSpringCareerCommandFacade(baseUrl: string, transport: Transport = (url, init) => fetch(url, init)) {
  const base = new URL(baseUrl);
  if (!["http:", "https:"].includes(base.protocol) || base.username || base.password || base.search || base.hash) throw new Error("invalid Spring command base URL");
  const records = `${base.toString().replace(/\/$/, "")}/v1/career/records`;
  const etag = (version: number) => CareerWriterIfMatchSchema.parse(`"v${version}"`);
  const resource = (id: string) => `${records}/${encodeURIComponent(UuidSchema.parse(id))}`;
  async function request(token: string, method: string, url: string, input?: unknown, headers: Record<string, string> = {}) {
    if (!/^exps_[A-Za-z0-9_-]{43}$/.test(token)) throw new Error("opaque session token required");
    const response = await transport(url, {
      method, headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...headers },
      ...(input === undefined ? {} : { body: JSON.stringify(input) }), signal: AbortSignal.timeout(30_000),
    });
    const body: unknown = await response.json();
    if (!response.ok) throw new SpringCareerCommandError(response.status, ApiErrorResponseSchema.parse(body));
    return { response, body };
  }
  async function record(token: string, method: string, url: string, input?: unknown, headers?: Record<string, string>) {
    const result = await request(token, method, url, input, headers);
    const body = CareerBusinessRecordResponseSchema.parse(result.body);
    if (result.response.headers.get("ETag") !== etag(body.data.version)) throw new Error("Spring response ETag/version mismatch");
    return body;
  }
  return {
    create: (token: string, key: string, input: CareerWriterCreate) => record(token, "POST", records, CareerWriterCreateSchema.parse(input), { "Idempotency-Key": IdempotencyKeySchema.parse(key) }),
    patch: (token: string, id: string, version: number, input: CareerWriterPatch) => record(token, "PATCH", resource(id), CareerWriterPatchSchema.parse(input), { "If-Match": etag(version) }),
    trash: (token: string, id: string, version: number) => record(token, "DELETE", resource(id), undefined, { "If-Match": etag(version) }),
    restore: (token: string, id: string, version: number) => record(token, "POST", `${resource(id)}/restore`, undefined, { "If-Match": etag(version) }),
    move: (token: string, id: string, version: number, input: CareerWriterMove) => record(token, "POST", `${resource(id)}/move`, CareerWriterMoveSchema.parse(input), { "If-Match": etag(version) }),
    relation: (token: string, id: string, version: number, input: CareerWriterRelation) => record(token, "PUT", `${resource(id)}/relations`, CareerWriterRelationSchema.parse(input), { "If-Match": etag(version) }),
    async previewMove(token: string, id: string, version: number, targetCategoryId: string) {
      const result = await request(token, "POST", `${resource(id)}/move/preview`, CareerWriterMovePreviewInputSchema.parse({ targetCategoryId }), { "If-Match": etag(version) });
      return CareerWriterMovePreviewResponseSchema.parse(result.body);
    },
  };
}
