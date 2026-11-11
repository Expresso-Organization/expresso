import { describe, expect, it } from "vitest";

import { QUEUE_NAMES, queueNameFor } from "./queue-routing.js";

describe("작업 줄 고르기", () => {
  it("생성 · 다듬기 · 커리어는 자기 줄에 서고 나머지는 일반 줄에 선다", () => {
    expect(queueNameFor("portfolio.generate")).toBe(QUEUE_NAMES.generation);
    expect(queueNameFor("page.refine")).toBe(QUEUE_NAMES.refine);
    expect(queueNameFor("career.computation")).toBe(QUEUE_NAMES.career);
    for (const name of ["job.normalize", "interview.draft", "recipe.draft", "scheduled.execute"]) {
      expect(queueNameFor(name)).toBe(QUEUE_NAMES.domain);
    }
  });
});

it("색인 복구는 짧은 커리어 작업과 줄을 분리한다", () => {
 expect(queueNameFor("career.evidence.record")).toBe(QUEUE_NAMES.search);
 expect(queueNameFor("career.evidence.reindex")).toBe(QUEUE_NAMES.search);
 expect(queueNameFor("career.document.project")).toBe(QUEUE_NAMES.career);
});
