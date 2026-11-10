import { afterEach, expect, it, vi } from "vitest";
import { HttpSearchEmbedding } from "./embedding.js";
afterEach(() => vi.unstubAllGlobals());
it("벡터 결과를 요청 순서로 복원한다", async () => { vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ data: [{ index: 1, embedding: [0, 1] }, { index: 0, embedding: [1, 0] }] })))); expect(await new HttpSearchEmbedding("http://127.0.0.1:8081/v1/embeddings", "test").embed(["a", "b"])).toEqual([[1, 0], [0, 1]]); });
it("중복된 인덱스는 거절한다", async () => { vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ data: [{ index: 0, embedding: [1] }, { index: 0, embedding: [1] }] })))); await expect(new HttpSearchEmbedding("http://localhost/v1/embeddings", "test").embed(["a", "b"])).rejects.toThrow(); });
it("서버 오류를 그대로 데이터로 사용하지 않는다", async () => { vi.stubGlobal("fetch", vi.fn(async () => new Response("bad", { status: 500 }))); await expect(new HttpSearchEmbedding("http://localhost/v1/embeddings", "test").embed(["a"])).rejects.toThrow(); });
it("URL에 인증 정보를 넣지 않는다", () => { expect(() => new HttpSearchEmbedding("https://user:secret@example.com", "test")).toThrow(); });

it("공급자에 보내는 개인정보를 가리고 원본 문자열은 보존한다", async () => {
 const fetcher = vi.fn(async () => new Response(JSON.stringify({ data: [{ index: 0, embedding: [1] }] })));
 vi.stubGlobal("fetch", fetcher);
 const source = "Node.js API dev@example.com 010-1234-5678 https://example.com/private?token=secret";
 await new HttpSearchEmbedding("http://localhost/v1/embeddings", "test").embed([source]);
 const payload = JSON.parse((fetcher.mock.calls as unknown as [string, RequestInit][])[0]![1].body as string);
 expect(payload.input[0]).toContain("Node.js API"); expect(payload.input[0]).not.toContain("example.com"); expect(payload.input[0]).not.toContain("010-1234"); expect(source).toContain("dev@example.com");
});
