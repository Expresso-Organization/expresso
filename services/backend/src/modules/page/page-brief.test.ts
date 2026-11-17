import { describe, expect, it } from "vitest";

import { ScriptedAiClient } from "../../platform/ai/scripted-client.js";
import type { PageGenerationContext } from "./generator.js";
import { briefPrompt, briefRequest, briefViolations, refinePageBrief, type PageBrief } from "./page-brief.js";

const context: PageGenerationContext = {
  userId: null,
  author: { name: "윤하린" },
  portfolioPlan: null,
  sections: [
    { id: "s-perf", title: "성능 개선", purpose: "수치로 보인다", goal: "", points: ["LCP"], targetLength: 300, sourceIds: ["r1"] },
    { id: "s-about", title: "소개", purpose: "누구인지", goal: "", points: [], targetLength: 200 },
  ],
  evidence: [{ id: "r1", label: "대시보드 성능", text: "2025.03 — 2025.08. LCP를 4.2초에서 1.9초로 줄였다. 번들은 420KB가 됐다. 배포는 3일에서 반나절로 줄었다." }],
  media: [{ src: "/v1/media/a1", srcSet: "", alt: "대시보드", width: 800, height: 600 }],
  jobTitle: null,
  company: null,
};

const brief = (): PageBrief => ({
  role: "프론트엔드 개발자",
  headline: "느린 화면을 재서 고치는 프론트엔드 개발자입니다.",
  intro: "",
  focus: ["성능"],
  subject: "대시보드, 번들 크기, LCP",
  lead: [{ sectionId: "s-perf", what: "LCP 4.2초 → 1.9초" }],
  sections: [
    { id: "s-perf", title: "성능 개선", claim: "첫 화면이 4.2초 걸리던 대시보드", body: "LCP를 1.9초로 줄였다.", period: "2025.03 — 2025.08", metrics: [{ label: "LCP", value: "1.9초", before: "4.2초" }], media: ["/v1/media/a1"] },
    { id: "s-about", title: "소개", claim: "재서 고친다", body: "" },
  ],
  career: [],
  evidence: [{ id: "r1", title: "대시보드 성능", kind: "기록", summary: "LCP 개선" }],
});

describe("자료 정리본 검사", () => {
  it("섹션을 모두 한 번씩 담고 숫자가 출처에 있으면 걸리지 않는다", () => {
    expect(briefViolations(brief(), context)).toEqual([]);
  });

  it("출처에 적힌 낱말 수치(반나절)는 숫자가 아니어도 받는다", () => {
    const value = brief();
    value.sections[0]!.metrics = [{ label: "배포", value: "반나절", before: "3일" }];
    expect(briefViolations(value, context)).toEqual([]);
  });

  it("빠진 섹션과 두 번 적은 섹션을 한 칸으로 알린다", () => {
    const value = brief();
    value.sections[1] = { ...value.sections[0]! };
    const [violation] = briefViolations(value, context);
    expect(violation?.path).toBe("/sections");
    expect(violation?.problem).toContain("빠진 섹션: s-about");
    expect(violation?.problem).toContain("두 번 적은 섹션: s-perf");
  });

  it("출처에 없는 숫자 · 이전 값 · 기간 · 그림 주소를 그 칸의 경로로 알린다", () => {
    const value = brief();
    value.sections[0]!.metrics = [{ label: "LCP", value: "1.9초", before: "5.5초" }, { label: "가입", value: "1.9초", before: "420KB" }];
    value.sections[0]!.period = "2024.01 — 2025.08";
    value.sections[0]!.body = "전환율이 37% 올랐다.";
    value.sections[0]!.media = ["/v1/media/zz"];
    const paths = briefViolations(value, context).map((violation) => violation.path);
    expect(paths).toContain("/sections/0/metrics");
    expect(paths).toContain("/sections/0/period");
    expect(paths).toContain("/sections/0/body");
    expect(paths).toContain("/sections/0/media");
  });

  it("출처에 없는 근거 ID를 알린다", () => {
    const value = brief();
    value.evidence.push({ id: "r9", title: "없는 자료", kind: "", summary: "" });
    expect(briefViolations(value, context).map((violation) => violation.path)).toEqual(["/evidence"]);
  });
});

describe("정제 호출", () => {
  it("요청에 섹션 ID · 출처 ID · 그림 주소를 싣는다", () => {
    const request = briefRequest(context);
    expect(request).toContain("### s-perf — 성능 개선");
    expect(request).toContain("### [r1] 대시보드 성능");
    expect(request).toContain("/v1/media/a1");
  });

  it("걸린 칸만 같은 대화에서 고쳐 받는다 — 전체를 다시 요청하지 않는다", async () => {
    const first = brief();
    first.sections[0]!.metrics = [{ label: "LCP", value: "1.9초", before: "5.5초" }];
    const ai = new ScriptedAiClient(
      () => first,
      (_request, paths) => paths.map((path) => ({ path, value: [{ label: "LCP", value: "1.9초", before: "4.2초" }] })),
    );
    const { brief: result } = await refinePageBrief(ai, context, 1);
    expect(ai.calls).toHaveLength(1);
    expect(ai.calls[0]?.contract).toBe("page_fill");
    expect(ai.fixRequests.map((request) => request.paths)).toEqual([["/sections/0/metrics"]]);
    expect(result.sections[0]?.metrics?.[0]?.before).toBe("4.2초");
  });
});

describe("정리본을 지면 요청으로 펴기", () => {
  it("주장 · 전후 수치 · 그림 · 근거를 글로 적는다", () => {
    const text = briefPrompt(brief()).join("\n");
    expect(text).toContain("#### 1. 성능 개선 (2025.03 — 2025.08)");
    expect(text).toContain("주장: 첫 화면이 4.2초 걸리던 대시보드");
    expect(text).toContain("- 수치 · LCP: 4.2초 → 1.9초");
    expect(text).toContain("- 그림: `/v1/media/a1`");
    expect(text).toContain("### 근거 자료");
    expect(text).not.toContain("### 경력");
  });
});
