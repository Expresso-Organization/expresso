// @vitest-environment jsdom

import { createEmptyCareerDocument, markdownToCareerDocument } from "@expresso/editor";
import { describe, expect, it, vi } from "vitest";

// 브라우저 번들에서 `node:crypto`는 crypto-browserify로 바뀌고, 거기에는 randomUUID가 없다.
// vitest는 Node 위에서 돌아 진짜 `node:crypto`가 보이므로, 그 상황을 직접 만들어 둔다.
vi.mock("node:crypto", () => ({ default: {} }));

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe("editor document helpers in the browser", () => {
  it("creates an empty document for the offline fallback", () => {
    const document = createEmptyCareerDocument();
    expect(document.content).toHaveLength(1);
    expect(document.content[0]?.id).toMatch(UUID);
  });

  it("converts markdown into blocks with fresh ids", () => {
    const document = markdownToCareerDocument("# 제목\n\n본문\n\n- 하나\n- 둘");
    const ids = document.content.map((block) => block.id);
    expect(ids.length).toBeGreaterThan(0);
    for (const id of ids) expect(id).toMatch(UUID);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
