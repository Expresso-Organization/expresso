import { describe, expect, it } from "vitest";

import { EDITOR_SCRIPT } from "./EditablePagePreview";

describe("편집 미리보기 스크립트", () => {
  // 문자열로 iframe에 들어가므로 타입 검사가 문법을 보지 못한다. 깨지면 지면을 눌러도 아무 일이 없다.
  it("자바스크립트로 읽힌다", () => {
    expect(() => new Function(EDITOR_SCRIPT)).not.toThrow();
  });

  it("요소 키 선택자를 따옴표가 맞는 모양으로 만든다", () => {
    for (const line of EDITOR_SCRIPT.split("\n").filter((text) => text.includes("querySelector(")))
      expect(line).not.toMatch(/="" \+/);
  });
});
