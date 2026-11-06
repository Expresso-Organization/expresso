import { describe, expect, it } from "vitest";

import { markdownPreview } from "./markdown-preview";

describe("markdownPreview", () => {
  it("keeps table cell text and drops the separator row", () => {
    expect(markdownPreview("| 지표 | 값 |\n| --- | :-: |\n| 실패율 | 0% |")).toBe("지표 값 실패율 0%");
  });

  it("removes line-break backslashes, list markers, quotes and headings", () => {
    expect(markdownPreview("## 상황\n야간 배치가\\\n멈췄다\n* 트레이스 삽입\n1. 원인 특정\n> 계측이 먼저")).toBe("상황 야간 배치가 멈췄다 트레이스 삽입 원인 특정 계측이 먼저");
  });

  it("drops images and rules, and keeps link text", () => {
    expect(markdownPreview("![대시보드.png](/v1/media/0d3c)\n***\n[블로그](https://example.com) 글")).toBe("블로그 글");
  });

  it("strips bold, italic, underline, strike and code marks", () => {
    expect(markdownPreview("**굵게** *기울임* _밑줄 대체_ <u>밑줄</u> ~~취소~~ `코드`")).toBe("굵게 기울임 밑줄 대체 밑줄 취소 코드");
  });

  it("leaves words with underscores and escaped symbols readable", () => {
    expect(markdownPreview("nightly_etl 배치 3\\*2 \\# 확인\n- [x] 완료")).toBe("nightly_etl 배치 3*2 # 확인 완료");
  });
});
