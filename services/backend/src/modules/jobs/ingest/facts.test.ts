import { describe, expect, it } from "vitest";

import { verifyFacts } from "./facts.js";

/**
 * 검증기 시험.
 *
 * 모델이 무엇을 잘 읽는지는 여기서 시험할 수 없다 — 그건 프롬프트의 일이고,
 * 픽스처가 회귀를 잡는다. 여기서 시험하는 것은 **모델이 틀렸을 때 우리가
 * 막는가**다. 그래서 입력이 전부 적대적 응답이다.
 *
 * 본문 문장은 모아 둔 공고 162건에서 그대로 가져왔다.
 */

const BODY = `**자격 요건**

-   Backend 개발 경력 최소 6년 이상
-   10+ years of software development experience

**Type of work model**

-   Hybrid

The base pay for this position ranges from $174,00/year to $299,000/year.

**Salary Ranges:**

Region A: $200,000—$386,400 USD
Region C: $170,000—$343,000 USD`;

const NONE = { salary: null, experience: null, workType: null };

describe("모델이 제대로 읽었을 때", () => {
  it("통과시킨다", () => {
    expect(verifyFacts(BODY, {
      ...NONE,
      experience: { value: "6년 이상", quote: "Backend 개발 경력 최소 6년 이상" },
    }).experienceNote).toBe("6년 이상");
  });

  it("영어를 한국어로 옮긴 값도 통과한다 — 숫자가 인용 안에 있으면 된다", () => {
    expect(verifyFacts(BODY, {
      ...NONE,
      experience: { value: "10년 이상", quote: "10+ years of software development experience" },
    }).experienceNote).toBe("10년 이상");
  });

  it("강조 표시를 뺀 인용은 봐 준다 — 별표는 공고가 쓴 글자가 아니다", () => {
    const body = "-   **7년 이상의 소프트웨어 개발 경력** 또는 그에 준하는 실력";
    expect(verifyFacts(body, {
      ...NONE,
      experience: { value: "7년 이상", quote: "7년 이상의 소프트웨어 개발 경력 또는 그에 준하는 실력" },
    }).experienceNote).toBe("7년 이상");
  });

  it("숫자가 없는 값은 인용만 맞으면 된다", () => {
    expect(verifyFacts(BODY, {
      ...NONE,
      workType: { value: "하이브리드", quote: "**Type of work model**\n\n-   Hybrid" },
    }).workType).toBe("하이브리드");
  });

  it("지역별 구간은 두 숫자가 다 인용 안에 있어야 통과한다", () => {
    const quote = "Region A: $200,000—$386,400 USD\nRegion C: $170,000—$343,000 USD";
    expect(verifyFacts(BODY, {
      ...NONE,
      salary: { value: "$170,000–$386,400 (지역별)", quote },
    }).salaryNote).toBe("$170,000–$386,400 (지역별)");
  });
});

describe("모델이 지어냈을 때", () => {
  it("원문에 없는 인용은 버린다", () => {
    expect(verifyFacts(BODY, {
      ...NONE,
      salary: { value: "$150,000–$200,000", quote: "연봉은 1억 5천만원부터 시작합니다" },
    }).salaryNote).toBeNull();
  });

  it("인용은 진짜인데 값의 숫자를 고쳤으면 버린다", () => {
    // 공고가 0을 빠뜨린 자리다. 모델이 $174,000으로 "고쳐" 주는 바로 그 경우.
    expect(verifyFacts(BODY, {
      ...NONE,
      salary: {
        value: "$174,000–$299,000",
        quote: "The base pay for this position ranges from $174,00/year to $299,000/year.",
      },
    }).salaryNote).toBeNull();
  });

  it("인용에 없는 쪽 숫자를 끌어다 붙이면 버린다", () => {
    // Region A만 인용해 놓고 Region C의 바닥을 값에 쓴 경우.
    expect(verifyFacts(BODY, {
      ...NONE,
      salary: { value: "$170,000–$386,400", quote: "Region A: $200,000—$386,400 USD" },
    }).salaryNote).toBeNull();
  });

  it("인용을 다듬으면 버린다 — 원문과 한 글자라도 다르면 안 된다", () => {
    expect(verifyFacts(BODY, {
      ...NONE,
      experience: { value: "6년 이상", quote: "Backend 개발 경력 최소 6년이상" },
    }).experienceNote).toBeNull();
  });

  it("빈 값은 없는 것으로 본다", () => {
    expect(verifyFacts(BODY, {
      ...NONE,
      workType: { value: "   ", quote: "-   Hybrid" },
    }).workType).toBeNull();
  });

  it("한 항목이 걸려도 나머지는 산다", () => {
    const result = verifyFacts(BODY, {
      salary: { value: "$174,000–$299,000", quote: "ranges from $174,00/year to $299,000/year" },
      experience: { value: "6년 이상", quote: "Backend 개발 경력 최소 6년 이상" },
      workType: { value: "하이브리드", quote: "-   Hybrid" },
    });
    expect(result).toEqual({
      salaryNote: null,
      experienceNote: "6년 이상",
      workType: "하이브리드",
    });
  });
});

describe("모델이 아무것도 못 찾았을 때", () => {
  it("셋 다 null이다", () => {
    expect(verifyFacts(BODY, NONE)).toEqual({
      salaryNote: null,
      experienceNote: null,
      workType: null,
    });
  });
});
