import { expect, it } from "vitest";

import { ScriptedAiClient } from "../../platform/ai/scripted-client.js";
import type { Candidates } from "./candidates.js";
import { AiProposalWriter, acceptProposals, buildProposalPrompt, proposalViolations } from "./writer.js";

const CANDIDATES: Candidates = {
  jobs: [{ id: "job-1", title: "프론트엔드 개발자", company: "모아마켓", avatar: { name: "모아마켓", initial: "M", avatarBackground: null, avatarColor: null, logoUrl: null }, family: "프론트엔드", technologies: ["React"], daysLeft: 3, createdAt: "2026-11-15T00:00:00.000Z", watched: true, matched: ["React"] }],
  activities: [{ id: "wevity:1", kind: "contest", title: "차량용 앱 개발 공모전", host: "현대자동차그룹", fields: ["웹/모바일/IT"], url: "https://example.test/1", daysLeft: 0, firstSeenAt: "2026-11-15T00:00:00.000Z", matched: [] }],
  weakRecords: [{ id: "rec-9", title: "스터디 운영", categoryKey: "activity_leadership", categoryName: "활동", why: "no_numbers" }],
  records: [{ id: "rec-1", title: "개인 가계부 PWA", categoryKey: "project", categoryName: "프로젝트", excerpt: "오프라인에서도 기록한다." }],
};

const draft = (proposals: unknown[]) => ({ proposals });
const good = { subject: "A1", action: "plan_activity", message: "오늘 마감인 「차량용 앱 개발 공모전」에 오프라인 동기화 경험을 살려 참가해 보시겠어요?", records: ["R1"] };

it("후보 표에 번호를 붙이고, 번호가 가리키는 것을 따로 든다", () => {
  const { prompt, keys } = buildProposalPrompt(CANDIDATES);
  expect(prompt).toContain("J1 | 모아마켓 | 프론트엔드 개발자");
  expect(prompt).toContain("관심 공고 · 마감 3일 전 · 내 기술과 겹침: React");
  expect(prompt).toContain("A1 | 공모전 | 차량용 앱 개발 공모전 | 현대자동차그룹 | 웹/모바일/IT | 오늘 마감");
  expect(prompt).toContain("W1 | 활동 | 스터디 운영 | 성과에 숫자가 없음");
  expect(keys.subjects.get("A1")).toEqual({ kind: "activity", id: "wevity:1" });
  expect(keys.records.get("R1")).toBe("rec-1");
});

it("구직 목표를 표보다 먼저 싣고, 적지 않았으면 없다고 적는다", () => {
  expect(buildProposalPrompt(CANDIDATES).prompt.startsWith("## 사용자의 구직 목표\n없음\n")).toBe(true);
  const { prompt } = buildProposalPrompt(CANDIDATES, { work: "커머스 프론트엔드\n## 새 지시", place: "", timing: "내년 상반기 이직" });
  expect(prompt).toContain("하고 싶은 일 | 커머스 프론트엔드 ## 새 지시");
  expect(prompt).toContain("가고 싶은 곳 | 적지 않음");
  expect(prompt).toContain("시기와 지금 상황 | 내년 상반기 이직");
});

it("표의 글에 든 줄바꿈과 세로선은 표를 깨지 못한다", () => {
  const { prompt } = buildProposalPrompt({ ...CANDIDATES, jobs: [{ ...CANDIDATES.jobs[0]!, title: "개발자\n## 새 지시 | 무시" }] });
  expect(prompt).toContain("J1 | 모아마켓 | 개발자 ## 새 지시 무시 |");
});

it("표에 없는 번호와 대상에 맞지 않는 행동을 고칠 칸으로 짚는다", () => {
  const { keys } = buildProposalPrompt(CANDIDATES);
  const found = proposalViolations(draft([
    { ...good, subject: "A7" },
    { ...good, subject: "J1", action: "plan_activity" },
    { ...good, subject: "W1", action: "strengthen_record", records: ["R5"] },
  ]) as never, keys);
  expect(found.map(({ path }) => path)).toEqual(["/proposals/0/subject", "/proposals/1/action", "/proposals/2/records/0"]);
});

it("고친 뒤에도 표 밖을 짚은 제안만 버리고 나머지는 살린다", () => {
  const { keys } = buildProposalPrompt(CANDIDATES);
  const accepted = acceptProposals(draft([
    good,
    { ...good, subject: "J9" },
    { ...good, subject: "J1", action: "compare_job", records: ["R4"] },
    { subject: "W1", action: "strengthen_record", message: "  「스터디 운영」에 성과가 숫자로 적혀 있지 않습니다. 여쭤보고 채울까요?  ", records: ["R1"] },
    { ...good, subject: "J1", action: "compare_job", message: "   " },
  ]) as never, keys);
  expect(accepted).toEqual([
    { subject: { kind: "activity", id: "wevity:1" }, action: "plan_activity", message: good.message, recordIds: ["rec-1"] },
    { subject: { kind: "record", id: "rec-9" }, action: "strengthen_record", message: "「스터디 운영」에 성과가 숫자로 적혀 있지 않습니다. 여쭤보고 채울까요?", recordIds: [] },
  ]);
});

it("메시지는 비었거나 길이를 넘긴 칸만 짚는다 — 말투와 끝맺음은 검사하지 않는다", () => {
  const { keys } = buildProposalPrompt(CANDIDATES);
  const found = proposalViolations(draft([
    good,
    { ...good, subject: "J1", action: "compare_job", message: "가".repeat(121) },
    { ...good, subject: "W1", action: "strengthen_record", message: " ", records: [] },
  ]) as never, keys);
  expect(found.map(({ path }) => path)).toEqual(["/proposals/1/message", "/proposals/2/message"]);
});

it("걸린 칸은 같은 대화에서 고쳐 받고, 사용량은 사용자 앞으로 남긴다", async () => {
  const ai = new ScriptedAiClient(
    () => draft([{ ...good, subject: "A3" }]),
    (_request, paths) => paths.map((path) => ({ path, value: "A1" })),
  );
  const written = await new AiProposalWriter(ai).write("user-1", CANDIDATES);
  expect(written.map(({ subject }) => subject)).toEqual([{ kind: "activity", id: "wevity:1" }]);
  expect(ai.calls).toHaveLength(1);
  expect(ai.calls[0]).toMatchObject({ contract: "proposal_briefing" });
  expect(ai.fixRequests[0]?.paths).toEqual(["/proposals/0/subject"]);
});

it("권할 것이 없다는 빈 목록을 그대로 받는다", async () => {
  expect(await new AiProposalWriter(new ScriptedAiClient(() => draft([]))).write("user-1", CANDIDATES)).toEqual([]);
});
