import type { CareerRecordListItem, JobPostingSummary } from "@expresso/contracts";
import { expect, it } from "vitest";

import { briefingSteps, lacksNumbers } from "./briefing";

const record = (categoryKey: string, bodyMd: string, properties: CareerRecordListItem["properties"] = {}) =>
  ({ id: `${categoryKey}-${bodyMd.length}`, categoryKey, title: "기록", bodyMd, properties, isEmpty: false }) as unknown as CareerRecordListItem;

const base = {
  records: [],
  recordTotal: 3,
  brews: [],
  portfolios: [],
  sites: [],
  watched: [],
  jobTotal: 0,
  contests: [],
  brewHref: () => "/brew/x/materials",
};

it("성과를 적는 분류에서 본문과 성과 속성 어디에도 숫자가 없으면 숫자 없는 기록이다", () => {
  expect(lacksNumbers(record("project", "달력 위젯의 키보드 이동을 고쳤다."))).toBe(true);
  expect(lacksNumbers(record("project", "LCP를 3.8초에서 1.9초로 줄였다."))).toBe(false);
  expect(lacksNumbers(record("activity_leadership", "격주 스터디를 열었다.", { outcome: { type: "text", value: "스터디 30회" } } as never))).toBe(false);
});

it("학력 · 자격 · 스킬처럼 숫자가 없어도 되는 분류는 세지 않는다", () => {
  expect(lacksNumbers(record("skill_tool", "단위 테스트는 Vitest로 쓴다."))).toBe(false);
});

it("기록이 없으면 첫 기록을 남기는 제안 하나가 선다", () => {
  const [records] = briefingSteps({ ...base, recordTotal: 0 });
  expect(records?.findings.map((finding) => finding.id)).toEqual(["first-record"]);
});

it("관심 공고는 7일 안에 마감되는 것만 제안하고, 그 공고를 대화에 연결한다", () => {
  const job = (id: string, daysLeft: number | null) => ({ id, title: `공고 ${id}`, company: { name: "회사" }, daysLeft }) as unknown as JobPostingSummary;
  const steps = briefingSteps({ ...base, watched: [job("a", 3), job("b", 20), job("c", null)] });
  const finding = steps[2]?.findings.find((item) => item.id === "closing-jobs");
  expect(finding?.text).toBe("관심 공고 1건이 7일 안에 마감됩니다");
  expect(finding?.action).toMatchObject({ kind: "chat", context: { kind: "job", id: "a" }, contextLabel: "공고 a" });
});

it("손볼 것이 없으면 제안이 없다", () => {
  expect(briefingSteps(base).flatMap((step) => step.findings)).toEqual([]);
});
