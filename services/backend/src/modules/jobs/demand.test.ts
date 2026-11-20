import { describe, expect, it } from "vitest";
import { countDemand, demandHits, goalFamily, type DemandPosting } from "./demand.js";

const posting = (descriptionRaw: string, extra: Partial<DemandPosting> = {}): DemandPosting => ({ title: "Backend Engineer", descriptionRaw, experienceMinYears: null, ...extra });
const ids = (text: string, extra: Partial<DemandPosting> = {}) => [...demandHits(posting(text, extra))].sort();

describe("요건 사전", () => {
  it("기술 이름은 낱말로만 찾는다 — 다른 낱말 안에 든 것은 세지 않는다", () => {
    expect(ids("JavaScript와 MySQL을 씁니다")).toEqual(["technology:javascript", "technology:mysql"]);
    expect(ids("Java, SQL 경험")).toEqual(["technology:java", "technology:sql"]);
    expect(ids("We value trust and scalable systems. Take a rest.")).toEqual([]);
    expect(ids("C++ 또는 C# 경험, Node.js 서버")).toEqual(["technology:c#", "technology:c++", "technology:node.js"]);
    expect(ids("쿠버네티스(k8s) 운영")).toEqual(["technology:kubernetes"]);
  });
  it("Go는 golang이거나 기술 나열 속에 있을 때만 센다", () => {
    expect(ids("We go above and beyond. Go to market strategy.")).toEqual([]);
    expect(ids("Golang 서버 개발")).toEqual(["technology:go"]);
    expect(ids("Java, Go, Python 중 하나 이상")).toEqual(["technology:go", "technology:java", "technology:python"]);
    expect(ids("Go 언어로 작성한 서비스")).toEqual(["technology:go"]);
  });
  it("경험과 자격은 한국어 표현과 영어 표현을 함께 찾는다", () => {
    expect(ids("대용량 트래픽 처리 경험, 코드 리뷰 문화")).toEqual(["experience:code-review", "experience:scale"]);
    expect(ids("Experience with large-scale distributed systems and code review")).toEqual(["experience:code-review", "experience:distributed", "experience:scale"]);
    expect(ids("컴퓨터공학 전공 또는 이에 준하는 학사 학위")).toEqual(["qualification:bachelor", "qualification:cs-major"]);
    expect(ids("Bachelor's degree in Computer Science. Fluent in English.")).toEqual(["qualification:bachelor", "qualification:cs-major", "qualification:english"]);
  });
  it("경력 연차는 구간으로 센다. 연차를 모르는 공고는 세지 않는다", () => {
    expect(ids("본문", { experienceMinYears: 0 })).toEqual(["career:0"]);
    expect(ids("본문", { experienceMinYears: 3 })).toEqual(["career:3-4"]);
    expect(ids("본문", { experienceMinYears: 12 })).toEqual(["career:8"]);
    expect(ids("본문", { experienceMinYears: null })).toEqual([]);
  });
  it("정리된 기술 키워드가 있으면 원문에서 찾은 것과 합친다. 한 공고는 한 항목을 한 번만 센다", () => {
    expect(ids("Kafka를 씁니다. kafka, KAFKA.", { technologies: ["Kafka", "Redis"] })).toEqual(["technology:kafka", "technology:redis"]);
  });
});

describe("요건 세기", () => {
  it("표본의 10% 이상(적어도 2건)에 나온 항목만 자주 나온 순서로 낸다", () => {
    const postings = [...Array.from({ length: 12 }, () => posting("Java와 Kafka")), ...Array.from({ length: 6 }, () => posting("Java와 Redis")), posting("Rust"), posting("Scala")];
    expect(countDemand(postings)).toEqual([
      { id: "technology:java", kind: "technology", label: "Java", count: 18 },
      { id: "technology:kafka", kind: "technology", label: "Kafka", count: 12 },
      { id: "technology:redis", kind: "technology", label: "Redis", count: 6 },
    ]);
  });
  it("표본이 5건보다 적으면 한 건에 나온 것도 낸다", () => {
    expect(countDemand([posting("Rust"), posting("Scala")]).map(item => item.id)).toEqual(["technology:scala", "technology:rust"]);
  });
  it("한 종류가 목록을 다 차지하지 않는다 — 기술은 7개, 경력 연차는 1개까지다", () => {
    const text = "TypeScript JavaScript Python Java Kotlin Scala Rust Redis Kafka 코드 리뷰 대용량";
    const items = countDemand([...Array.from({ length: 6 }, () => posting(text, { experienceMinYears: 3 })), ...Array.from({ length: 4 }, () => posting(text, { experienceMinYears: 6 }))]);
    expect(items.filter(item => item.kind === "technology")).toHaveLength(7);
    expect(items.filter(item => item.kind === "career")).toEqual([{ id: "career:3-4", kind: "career", label: "경력 3~4년 이상", count: 6 }]);
    expect(items.filter(item => item.kind === "experience").map(item => item.id).sort()).toEqual(["experience:code-review", "experience:scale"]);
  });
});

describe("목표의 직군", () => {
  it("공고에 직군을 매긴 규칙을 쓰고, 그 규칙이 놓치는 목표의 말은 따로 받는다", () => {
    expect(goalFamily("백엔드 개발자")).toBe("백엔드");
    expect(goalFamily("Frontend Engineer")).toBe("프론트엔드");
    expect(goalFamily("데이터 엔지니어")).toBe("데이터");
    expect(goalFamily("ML 엔지니어")).toBe("ML · AI");
    expect(goalFamily("AI 서비스 개발")).toBe("ML · AI");
    expect(goalFamily("iOS 개발자")).toBe("모바일");
    expect(goalFamily("서버 개발")).toBe("백엔드");
    expect(goalFamily("게임 클라이언트 프로그래머")).toBe("개발 그 외");
    expect(goalFamily("마케터")).toBeNull();
    expect(goalFamily("PM")).toBeNull();
  });
});
