import { afterEach, expect, it, vi } from "vitest";
import { HttpSearchEmbedding } from "./embedding.js";
afterEach(() => vi.unstubAllGlobals());
it("벡터 결과를 요청 순서로 복원한다", async () => { vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ data: [{ index: 1, embedding: [0, 1] }, { index: 0, embedding: [1, 0] }] })))); expect(await new HttpSearchEmbedding("http://127.0.0.1:8081/v1/embeddings", "test").embed(["a", "b"])).toEqual([[1, 0], [0, 1]]); });
it("중복된 인덱스는 거절한다", async () => { vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ data: [{ index: 0, embedding: [1] }, { index: 0, embedding: [1] }] })))); await expect(new HttpSearchEmbedding("http://localhost/v1/embeddings", "test").embed(["a", "b"])).rejects.toThrow(); });
it("서버 오류를 그대로 데이터로 사용하지 않는다", async () => { vi.stubGlobal("fetch", vi.fn(async () => new Response("bad", { status: 500 }))); await expect(new HttpSearchEmbedding("http://localhost/v1/embeddings", "test").embed(["a"])).rejects.toThrow(); });
it("URL에 인증 정보를 넣지 않는다", () => { expect(() => new HttpSearchEmbedding("https://user:secret@example.com", "test")).toThrow(); });
