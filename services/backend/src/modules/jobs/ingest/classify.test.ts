import { describe, expect, it } from "vitest";

import { classifyFamily, isOpening } from "./classify.js";

describe("직군 분류", () => {
  it("한글 낱말이 실제로 발화한다", () => {
    // JS의 `\w`는 ASCII라 한글 앞뒤에 단어 경계가 서지 않는다.
    // `\b(보안)\b` 로 적어 두면 "보안"조차 걸리지 않는다 — 규칙에 적혀 있어도
    // 한 번도 발화하지 않던 자리다.
    expect(/\b(보안)\b/.test("보안")).toBe(false);

    expect(classifyFamily("보안 엔지니어", null)).toBe("보안");
    expect(classifyFamily("정보보안 담당자", null)).toBe("보안");
    expect(classifyFamily("인프라 엔지니어", null)).toBe("인프라 · 플랫폼");
    expect(classifyFamily("QA 엔지니어", null)).toBe("QA");
  });

  it("닫는 경계 때문에 놓치던 영문을 잡는다", () => {
    // `\b(data analy)\b` 는 뒤에 `s` 가 오면 경계가 서지 않아 못 잡았다.
    expect(/\b(data analy)\b/i.test("Data Analyst")).toBe(false);
    expect(classifyFamily("Data Analyst", null)).toBe("데이터");
    expect(classifyFamily("Senior Data Analyst (Logistics)", null)).toBe("데이터");
  });

  it("한국 개발 현장의 직무명을 읽는다", () => {
    expect(classifyFamily("[Onetake Studio] 신작 프로젝트 클라이언트 프로그래머", "Game Engineering"))
      .toBe("개발 그 외");
    expect(classifyFamily("서버 프로그래머", null)).toBe("백엔드");
    expect(classifyFamily("프론트앤드 퍼블리셔", null)).toBe("프론트엔드");
    expect(classifyFamily("웹 개발자(java)", null)).toBe("개발 그 외");
    expect(classifyFamily("자율주행 AI 엔지니어 (R&D)", null)).toBe("ML · AI");
    expect(classifyFamily("DBA (Database Administrator)", null)).toBe("인프라 · 플랫폼");
    expect(classifyFamily("MLOps Engineer", null)).toBe("ML · AI");
  });

  it("개발 낱말이 들어간 다른 직무는 들이지 않는다", () => {
    // `프로그래머` 를 들이면서 따라 들어오던 것들.
    expect(classifyFamily("가공프로그래머(5축) 경력자", null)).toBeNull();
    expect(classifyFamily("설비보전 엔지니어", null)).toBeNull();
    expect(classifyFamily("Sales Engineer", null)).toBeNull();
    expect(classifyFamily("Solutions Engineer", null)).toBeNull();
    // 영업인데 "인프라"가 들어간다. `인프라` 뒤에 오는 말로 좁혔다.
    expect(classifyFamily("인프라세일즈팀 리드", null)).toBeNull();
  });

  it("읽히지 않으면 null이다 — 짐작해서 붙이지 않는다", () => {
    expect(classifyFamily("콘텐츠 마케터", "마케팅")).toBeNull();
    expect(classifyFamily("재무회계 담당자", "재무")).toBeNull();
    expect(classifyFamily("아티스트의전", null)).toBeNull();
  });

  it("지원할 수 있는 자리가 아니면 거른다", () => {
    // 한영을 섞어 쓰고, 팀 이름에만 적어 두기도 한다.
    expect(isOpening({ title: "[네오위즈] 인재 Pool", team: null, location: null })).toBe(false);
    expect(isOpening({ title: "아트 프리랜서", team: "Talent Pool", location: null })).toBe(false);
    expect(isOpening({ title: "인재풀 등록", team: null, location: null })).toBe(false);
    expect(isOpening({ title: "백엔드 개발자", team: "zz-Evergreen Requisition", location: null })).toBe(false);
    expect(isOpening({ title: "백엔드 개발자", team: "Platform", location: null })).toBe(true);
  });
});
