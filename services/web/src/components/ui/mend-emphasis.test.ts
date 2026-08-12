import { describe, expect, it } from "vitest";

import { mendEmphasis } from "./mend-emphasis";

/**
 * 본문 조각은 전부 모아 둔 공고 168건에서 그대로 가져왔다.
 *
 * 이 함수가 위험한 이유는 **원문을 고치기 때문**이다. 그래서 시험의 절반이
 * "손대지 말아야 할 것에 손대지 않는가"다.
 */

describe("붙어 있는 강조 두 개", () => {
  it("이음매를 걷어내고 굵기를 살린다", () => {
    expect(mendEmphasis("-   **전형****절차**")).toBe("-   **전형절차**");
    expect(mendEmphasis("-   **참고****사항**")).toBe("-   **참고사항**");
  });

  it("한국어와 상관없다 — 규칙은 별표 개수를 센다", () => {
    expect(mendEmphasis("**abc****def**")).toBe("**abcdef**");
  });

  it("문장 부호가 뒤에 와도 편다", () => {
    expect(mendEmphasis("**Job Overview****:**")).toBe("**Job Overview:**");
  });

  it("양옆이 공백이면 이음매가 아니다", () => {
    expect(mendEmphasis("앞 **** 뒤")).toBe("앞 **** 뒤");
  });
});

describe("줄바꿈에 걸린 별표", () => {
  it("닫는 별표를 앞 줄로 당긴다 — 앞 줄 끝 공백까지 걷는다", () => {
    expect(mendEmphasis("**Remuneration  \n**  \n")).toBe("**Remuneration**\n\n");
  });

  it("밀려난 별표 뒤에 글이 이어 붙어 있어도 당긴다", () => {
    expect(mendEmphasis("**\\[AI Research 본부 비전\\]  \n**크래프톤 AI Research 본부는")).toBe(
      "**\\[AI Research 본부 비전\\]**\n크래프톤 AI Research 본부는",
    );
  });

  it("앞 줄의 강조가 이미 닫혔으면 당기지 않는다", () => {
    const two = "앞 줄에 **강조** 있음\n**다음 줄도 강조**";
    expect(mendEmphasis(two)).toBe(two);
  });

  it("각주 별표가 붙은 줄을 열려 있다고 읽지 않는다", () => {
    const note = "\\*해당 절차는 변동될 수 있습니다\n**자격 요건**";
    expect(mendEmphasis(note)).toBe(note);
  });

  it("여는 별표를 다음 줄로 당긴다", () => {
    expect(mendEmphasis("**  \n자격 요건**")).toBe("**자격 요건**");
  });

  it("줄 앞의 블록 표시는 그대로 둔다", () => {
    expect(mendEmphasis("### **  \n우리 팀을 소개합니다.**")).toBe(
      "### **우리 팀을 소개합니다.**",
    );
  });

  it("멀쩡한 목록의 두 줄을 붙이지 않는다", () => {
    const list = "-   **자격 요건**\n-   **경력**";
    expect(mendEmphasis(list)).toBe(list);
  });

  it("앞 줄에 짝이 없으면 닫는 별표를 당기지 않는다", () => {
    const text = "그냥 문장\n**\n";
    expect(mendEmphasis(text)).toBe(text);
  });
});

describe("손대지 않는 것", () => {
  it("출처가 이스케이프한 각주 별표는 그대로 둔다", () => {
    const note = "-   \\*해당 절차는 각 포지션에 따라 변동이 있을 수 있습니다.";
    expect(mendEmphasis(note)).toBe(note);
  });

  it("멀쩡한 강조는 건드리지 않는다", () => {
    const body = "**전형 절차 및** **안내** **사항**\n\n-   **7년 이상의 개발 경력**";
    expect(mendEmphasis(body)).toBe(body);
  });

  it("굵게·기울임(별표 세 개)은 짝이 맞는다 — 건드릴 것이 없다", () => {
    expect(mendEmphasis("***Skills:***")).toBe("***Skills:***");
  });
});

describe("불변식 — 별표와 공백 말고는 아무것도 바뀌지 않는다", () => {
  /**
   * 이 함수가 할 수 있는 최악은 **공고의 글자를 바꾸는 것**이다. 규칙이
   * 정규식이라 앞으로 새 공고에서 엉뚱하게 걸릴 수 있는데, 그때도 글자만은
   * 남아야 한다. 별표와 공백을 걷어낸 나머지가 같으면 그게 지켜진 것이다.
   */
  const bodies = [
    "-   **전형****절차**\n    -   서류전형 (리크루터 폰 스크리닝) - 전화면접 - 최종 합격",
    "**  \n자격 요건**\n\n-   컴퓨터 과학, 정보 시스템 또는 관련 분야 학사 학위 소지자",
    "**Remuneration  \n**  \n\nMonthly salary of more than NT$ 40,000",
    "### **  \n우리 팀(프로젝트)을 소개합니다.**",
    "**Privacy Notice****​**\n\n-   Your personal information will be collected.",
    "한국과 일본 시장을 모두 다루며, \\*\\*서로 다른 데이터 환경\\*\\*하는 경험을 합니다.",
    "-   \\*해당 전형은 포지션에 따라 변동될 수 있습니다.\n-   서류 전형 > \\*과제 전형",
  ];

  const bare = (value: string) => value.replace(/[*\s]/g, "");

  for (const [index, body] of bodies.entries()) {
    it(`${index + 1}번 본문의 글자가 그대로다`, () => {
      expect(bare(mendEmphasis(body))).toBe(bare(body));
    });
  }
});
