import { describe, expect, it } from "vitest";

import { findStacks, resolveStack, toChips } from "./stacks";

/** 칩이 된 것만 [슬러그, 원문] 으로 뽑는다. */
function chips(text: string): [string, string][] {
  return (toChips(text) ?? [])
    .filter((node) => node.type === "element")
    .map((node) => [
      String(node.properties?.["dataStack"]),
      node.children.map((child) => (child.type === "text" ? child.value : "")).join(""),
    ]);
}

describe("본문 속 스택 이름", () => {
  it("나열을 통째로 집는다", () => {
    expect(chips("TypeScript, Go, Java, Kotlin, Python, Ruby 경험")).toEqual([
      ["typescript", "TypeScript"],
      ["go", "Go"],
      ["java", "Java"],
      ["kotlin", "Kotlin"],
      ["python", "Python"],
      ["ruby", "Ruby"],
    ]);
  });

  it("칩이 아닌 글자는 그대로 남는다", () => {
    const nodes = toChips("Java와 Kotlin");
    expect(nodes?.map((node) => (node.type === "text" ? node.value : "«칩»"))).toEqual([
      "«칩»",
      "와 ",
      "«칩»",
    ]);
  });

  it("걸릴 것이 없으면 손대지 않는다", () => {
    expect(toChips("사용자 경험을 함께 만듭니다")).toBeNull();
  });

  // 이름이 다른 이름 안에 들어 있는 경우들. 여기가 무너지면 JavaScript 자리에
  // Java 로고가 붙는다.
  it("긴 이름이 짧은 이름을 이긴다", () => {
    expect(chips("JavaScript/TypeScript")).toEqual([
      ["javascript", "JavaScript"],
      ["typescript", "TypeScript"],
    ]);
    expect(chips("Django로 만든 서비스")).toEqual([["django", "Django"]]);
    expect(chips("Node.js와 Next.js")).toEqual([
      ["node", "Node.js"],
      ["next", "Next.js"],
    ]);
    expect(chips("Spring Boot 기반")).toEqual([["spring", "Spring Boot"]]);
  });

  it("뒤에 붙은 판 번호는 이름을 깨지 않는다", () => {
    expect(chips("Java17 이상")).toEqual([["java", "Java"]]);
  });

  it("원문 표기를 그대로 둔다", () => {
    expect(chips("Golang 경험자")).toEqual([["go", "Golang"]]);
    expect(chips("k8s 운영")).toEqual([["kubernetes", "k8s"]]);
  });

  // Go는 영어 단어이기도 하다. 실제로 모아 둔 공고에 "Go Further Together"가 있다.
  describe("Go", () => {
    it("나열 · 조사 · 접속사 곁에서는 언어다", () => {
      expect(chips("Python, Java, or Go.")).toContainEqual(["go", "Go"]);
      expect(chips("Go, gRPC, MySQL")).toContainEqual(["go", "Go"]);
      expect(chips("Go를 활용해본 경험이 있으신 분")).toContainEqual(["go", "Go"]);
      expect(chips("Go 또는 Java에 능숙하신 분")).toContainEqual(["go", "Go"]);
      expect(chips("Node.js/Python/Kotlin/Go 중 하나 이상")).toContainEqual(["go", "Go"]);
      expect(chips("Go")).toEqual([["go", "Go"]]);
      expect(chips("Go or Python")).toContainEqual(["go", "Go"]);
    });

    it("영어 낱말이 뒤따르면 동사다", () => {
      expect(chips("Go Further Together: 우리는")).toEqual([]);
      expect(chips("Go to our careers page")).toEqual([]);
    });

    it("소문자는 언제나 동사다", () => {
      expect(chips("we go fast")).toEqual([]);
    });
  });
});

// 상단 속성 줄이 쓰는 쪽. 본문과 달리 겹치는 것을 접는다.
describe("공고가 말하는 스택", () => {
  it("처음 나온 차례로 한 번씩만 센다", () => {
    expect(findStacks("Python으로 만들고 Kafka로 흘린다. Python 경험 5년, Kafka 운영."))
      .toEqual([
        { slug: "python", text: "Python" },
        { slug: "kafka", text: "Kafka" },
      ]);
  });

  it("다르게 적힌 같은 것은 한 줄이다", () => {
    expect(findStacks("Golang 경험자. Go로 서버를 씁니다.")).toEqual([
      { slug: "go", text: "Golang" },
    ]);
  });

  it("분석이 준 슬러그를 아는 이름으로 되돌린다", () => {
    expect(resolveStack("postgresql")).toBe("postgres");
    expect(resolveStack("node.js")).toBe("node");
    expect(resolveStack("SPRING BOOT")).toBe("spring");
    expect(resolveStack("우리가 모르는 것")).toBeNull();
  });
});
