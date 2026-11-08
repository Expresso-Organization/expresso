import { describe, it, expect } from "vitest";
import { lexical, cosine, fuse, terms, fingerprint } from "./ranking.js";
import { documentChunks, splitText } from "./chunks.js";
describe("검색 순위와 원문", () => {
  it("단어 대소문자와 한글을 비교한다", () => { expect(lexical("Node.js 오류", "Node.js 오류 처리")).toBe(1); expect(terms("Node.js Node.js")).toHaveLength(1); });
  it("서로 다른 표현의 벡터를 키워드와 결합한다", () => { const rows = [{ text: "404 반환", vector: [1, 0] }, { text: "오류 처리", vector: [0, 1] }]; const ranked = fuse(rows, r => lexical("오류", r.text), r => cosine([1, 0], r.vector)); expect(ranked).toHaveLength(2); });
  it("다른 차원과 잘못된 수치는 거절한다", () => { expect(() => cosine([1], [1, 2])).toThrow(); expect(() => cosine([NaN], [1])).toThrow(); });
  it("팀원 역할과 부정 발언을 원문 그대로 보존한다", () => { const text = "팀원이 설계했고 나는 조회 API만 구현했다. Java 경험은 없다."; const rows = documentChunks("테스트", { schemaVersion: 1, type: "doc", content: [{ id: "a5100000-0000-4000-8000-000000000001", type: "paragraph", attrs: {}, text: [{ text }] }] }, {}); expect(rows[1]?.text).toBe(text); expect(rows[1]?.blockId).toBe("a5100000-0000-4000-8000-000000000001"); });
  it("4,000자 뒤의 문단도 검색할 수 있다", () => { const parts = splitText("가".repeat(5000) + "\n\n없는 프로젝트는 404 반환"); expect(parts.some(x => x.includes("404"))).toBe(true); expect(parts.every(x => x.length <= 1800)).toBe(true); });
  it("같은 입력만 같은 서명을 가진다", () => { expect(fingerprint([1, "a"])).toBe(fingerprint([1, "a"])); expect(fingerprint([2, "a"])).not.toBe(fingerprint([1, "a"])); });
});
