import { PAGE_STREAM_STAGES } from "@expresso/contracts";
import { describe, expect, it } from "vitest";

import { PHASE_LABELS } from "./LivePreview";

describe("생성 미리보기 단계 문구", () => {
  it("서버가 보내는 단계마다 화면 문구가 있다 — 청사진 단계(designed)는 채우는 중으로 바로 넘어간다", () => {
    for (const stage of PAGE_STREAM_STAGES.filter((name) => name !== "designed"))
      expect(PHASE_LABELS[stage]).toBeTruthy();
  });

  it("글이 다 흐른 뒤에는 채우는 중이 아니라 검사하는 중이라고 적는다", () => {
    expect(PHASE_LABELS.drafted).not.toBe(PHASE_LABELS.filling);
    expect(PHASE_LABELS.drafted).toContain("맞춰 보는 중");
  });
});
