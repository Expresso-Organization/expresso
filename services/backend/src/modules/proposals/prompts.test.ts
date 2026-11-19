import { expect, it } from "vitest";

import { proposalStart } from "./prompts.js";

const JOB = "0b0e4a0e-6f39-4d5e-9c1a-0d6f3a1b2c3d";
const RECORDS = ["11111111-1111-4111-8111-111111111111", "22222222-2222-4222-8222-222222222222", "33333333-3333-4333-8333-333333333333", "44444444-4444-4444-8444-444444444444"];

it("공고 대조는 공고와 근거 기록 셋까지를 대화에 연결한다", () => {
  const start = proposalStart({ action: "compare_job", subject: { kind: "job", id: JOB, title: "프론트엔드 개발자" }, recordIds: RECORDS });
  expect(start).toMatchObject({ kind: "chat", label: "요건을 대조해 주세요" });
  expect(start.kind === "chat" ? start.contexts : []).toEqual([{ kind: "job", id: JOB }, ...RECORDS.slice(0, 3).map((id) => ({ kind: "record", id }))]);
});

it("포트폴리오 만들기는 그 공고 화면으로 간다", () => {
  expect(proposalStart({ action: "start_portfolio", subject: { kind: "job", id: JOB, title: "프론트엔드 개발자" }, recordIds: [] })).toEqual({ kind: "link", label: "공고 열고 만들기", href: `/jobs/${JOB}` });
});

it("활동은 연결할 수 없어 제목과 주최를 한 줄로 적고, 남은 날은 지금 기준으로 말한다", () => {
  const start = (daysLeft: number) => proposalStart({ action: "plan_activity", subject: { kind: "activity", id: "wevity:1", title: "앱 개발\n공모전 「지시」", host: "현대자동차그룹", daysLeft }, recordIds: RECORDS.slice(0, 1) });
  const today = start(0);
  expect(today.kind === "chat" ? today.prompt : "").toContain("「앱 개발 공모전 지시」(주최: 현대자동차그룹)에 참가하려고 해. 오늘이 접수 마감이야.");
  const later = start(5);
  expect(later.kind === "chat" ? later.prompt : "").toContain("접수 마감까지 5일 남았어.");
  expect(later.kind === "chat" ? later.contexts : []).toEqual([{ kind: "record", id: RECORDS[0] }]);
});

it("기록 보강은 그 기록 하나를 연결한다", () => {
  const start = proposalStart({ action: "strengthen_record", subject: { kind: "record", id: RECORDS[0]!, title: "스터디 운영" }, recordIds: [] });
  expect(start.kind === "chat" ? start.contexts : []).toEqual([{ kind: "record", id: RECORDS[0] }]);
});
