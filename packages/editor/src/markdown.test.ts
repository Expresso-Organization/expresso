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

  it("keeps HTML-like text as plain text and preserves unknown blocks", () => {
    // 글은 텍스트로만 그려지므로 원문 그대로 남깁니다. 이스케이프하면 `R&D`가 `R&amp;D`로 저장됩니다(2026-11-02 감사 H6).
    expect(careerDocumentToMarkdown(markdownToCareerDocument("<script>alert(1)</script>"))).toBe("<script>alert(1)</script>");
    expect(careerDocumentToMarkdown(markdownToCareerDocument("R&D 예산 <30%"))).toBe("R&D 예산 <30%");
    const unknown = { id: crypto.randomUUID(), type: "futureWidget", attrs: { version: 2 }, text: [{ text: "future" }] };
    const source = `\`\`\`expresso-block\n${JSON.stringify(unknown)}\n\`\`\``;
    expect(careerDocumentToMarkdown(markdownToCareerDocument(source))).toBe(source);
  });

  it("reads task list check marks into item state instead of item text", () => {
    const [list] = markdownToCareerDocument("- [x] 완료\n- [ ] 남음").content;
    expect(list?.type).toBe("taskList");
    expect(list?.content?.map((item) => [item.text?.map((span) => span.text).join(""), item.attrs["checked"]])).toEqual([["완료", true], ["남음", false]]);
  });

  it("round trips deterministic generated documents", () => {
    for (let index = 0; index < 100; index += 1) {
      const source = `## 항목 ${index}\n\n문장 ${index}\n둘째 줄`;
      expect(careerDocumentToMarkdown(markdownToCareerDocument(source))).toBe(source);
    }
  });
});
