import { describe, expect, it } from "vitest";
import { careerDocumentToMarkdown, markdownToCareerDocument } from "./markdown.js";

const corpus = [
  "# 제목\n\n한국어 본문과 [링크](https://example.com)",
  "- 첫째\n  - 중첩\n- 셋째",
  "1. 하나\n2. 둘\n\n- [x] 완료\n- [ ] 남음",
  "```ts\nconst value = 1;\n```",
  "| 이름 | 값 |\n| --- | ---: |\n| A | 1 |",
  "![대체 텍스트](media:asset-1)\n\n[첨부](file:file-1)",
  "> [evidence:record-1#block-2] 검증된 근거",
];

describe("career Markdown conversion", () => {
  it.each(corpus)("preserves the fixed corpus", (source) => {
    expect(careerDocumentToMarkdown(markdownToCareerDocument(source))).toBe(source);
  });

  it("escapes unsupported HTML and preserves unknown blocks", () => {
    expect(careerDocumentToMarkdown(markdownToCareerDocument("<script>alert(1)</script>"))).toBe("&lt;script&gt;alert(1)&lt;/script&gt;");
    const unknown = { id: crypto.randomUUID(), type: "futureWidget", attrs: { version: 2 }, text: [{ text: "future" }] };
    const source = `\`\`\`expresso-block\n${JSON.stringify(unknown)}\n\`\`\``;
    expect(careerDocumentToMarkdown(markdownToCareerDocument(source))).toBe(source);
  });

  it("round trips deterministic generated documents", () => {
    for (let index = 0; index < 100; index += 1) {
      const source = `## 항목 ${index}\n\n문장 ${index}\n둘째 줄`;
      expect(careerDocumentToMarkdown(markdownToCareerDocument(source))).toBe(source);
    }
  });
});
