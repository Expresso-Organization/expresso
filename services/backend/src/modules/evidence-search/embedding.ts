import { createHash } from "node:crypto";
import { z } from "zod";

export interface SearchEmbedding { readonly key: string; embed(texts: string[]): Promise<number[][]> }
const Response = z.object({ data: z.array(z.object({ index: z.number().int().nonnegative(), embedding: z.array(z.number().finite()).min(1).max(4096) })) });
/** 명시적으로 설정한 OpenAI 호환 임베딩 서버만 호출합니다. 채팅 CLI와는 별도입니다. */
export class HttpSearchEmbedding implements SearchEmbedding {
  readonly key: string;
  constructor(private readonly url: string, private readonly model: string, private readonly apiKey?: string) {
    const target = new URL(url);
    if (!["http:", "https:"].includes(target.protocol) || target.username || target.password) throw new Error("임베딩 URL 설정을 확인하세요.");
    this.key = createHash("sha256").update(JSON.stringify([url, model])).digest("hex");
  }
  async embed(texts: string[]) {
    const vectors: number[][] = [];
    for (let offset = 0; offset < texts.length; offset += 16) {
      const batch = texts.slice(offset, offset + 16);
      const response = await fetch(this.url, {
        method: "POST", redirect: "error", signal: AbortSignal.timeout(20_000),
        headers: { "content-type": "application/json", ...(this.apiKey ? { authorization: `Bearer ${this.apiKey}` } : {}) },
        body: JSON.stringify({ model: this.model, input: batch }),
      });
      if (!response.ok) throw new Error("검색 임베딩 서버가 응답하지 않았습니다.");
      const parsed = Response.parse(await response.json());
      const sorted = parsed.data.sort((a, b) => a.index - b.index);
      if (sorted.length !== batch.length || sorted.some((item, i) => item.index !== i)) throw new Error("검색 임베딩 결과 개수가 다릅니다.");
      vectors.push(...sorted.map(item => item.embedding));
    }
    const dimension = vectors[0]?.length;
    if (vectors.some(vector => vector.length !== dimension || !vector.some(x => x !== 0))) throw new Error("검색 임베딩 벡터가 올바르지 않습니다.");
    return vectors;
  }
}
