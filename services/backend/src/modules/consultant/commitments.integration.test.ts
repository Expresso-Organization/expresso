import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { CONSULTANT_COMMITMENT_LIMIT } from "@expresso/contracts";
import { createMongoFixture } from "../../../test/support/mongodb.js";
import { MongoIdentityService } from "../identity/index.js";
import { ConsultantCommitments, ConsultantInputError, ConsultantNotFoundError, ConsultantService } from "./index.js";

describe.skipIf(!(process.env.TEST_MONGODB_ADMIN_URL ?? process.env.TEST_MONGODB_URL))("약속과 먼저 연락하기", () => {
  let fixture: Awaited<ReturnType<typeof createMongoFixture>>;
  let commitments: ConsultantCommitments; let consultant: ConsultantService;
  const signup = async () => (await new MongoIdentityService(fixture.resource).signup({ email: `${randomUUID()}@example.com`, password: "correct-horse-battery", displayName: "약속 검증" })).user.id;
  // 서울 2026-11-20 정오. 날짜 계산은 서울 날짜로 한다.
  const day = (offset: number) => new Date(Date.UTC(2026, 10, 20 + offset, 3, 0, 0));
  const deps = (last: Date | null = null) => ({ lastConversationAt: vi.fn(async () => last), notify: vi.fn(async () => undefined) });
  beforeAll(async () => {
    fixture = await createMongoFixture("commitments");
    commitments = new ConsultantCommitments(fixture.resource); consultant = new ConsultantService(fixture.resource);
  }, 60_000);
  afterAll(async () => { await fixture?.dispose(); });

  it("약속은 오늘이나 그 뒤의 날짜로만 잡고, 열린 약속은 20개까지다", async () => {
    const userId = await signup();
    await expect(commitments.create(userId, { title: "지난 날짜", dueOn: "2026-11-19" }, null, day(0))).rejects.toBeInstanceOf(ConsultantInputError);
    const made = await commitments.create(userId, { title: "해커톤 지원서 내기", dueOn: "2026-11-27" }, null, day(0));
    expect(made).toMatchObject({ title: "해커톤 지원서 내기", detail: "", dueOn: "2026-11-27", status: "open", awaiting: false, conversationId: null });
    for (let index = 1; index < CONSULTANT_COMMITMENT_LIMIT; index += 1) await commitments.create(userId, { title: `약속 ${index}`, dueOn: "2026-11-20" }, null, day(0));
    await expect(commitments.create(userId, { title: "넘치는 약속", dueOn: "2026-11-28" }, null, day(0))).rejects.toBeInstanceOf(ConsultantInputError);
    // 날짜가 이른 순서로 읽는다.
    const open = await commitments.open(userId);
    expect(open).toHaveLength(CONSULTANT_COMMITMENT_LIMIT);
    expect(open.at(-1)!.title).toBe("해커톤 지원서 내기");
  });

  it("약속한 날에 한 번 묻고, 답이 없으면 3일 뒤에 한 번 더 묻고 멈춘다. 알림은 하루 한 건이다", async () => {
    const userId = await signup();
    await consultant.setOutreach(userId, true, day(0));
    const first = await commitments.create(userId, { title: "해커톤 지원서 내기", dueOn: "2026-11-21" }, null, day(0));
    await commitments.create(userId, { title: "알고리즘 문제 풀기", dueOn: "2026-11-21" }, null, day(0));
    // 약속한 날 전: 묻지 않는다.
    const mine = (dependencies: ReturnType<typeof deps>) => dependencies.notify.mock.calls.filter(call => (call as unknown[])[0] === userId);
    const before = deps(day(0));
    await commitments.runCheckins(before, day(0));
    expect(mine(before)).toEqual([]);
    expect((await commitments.checkins(userId, day(0))).commitments).toEqual([]);
    // 약속한 날: 두 약속을 묻고 알림은 한 건이다. 같은 날 다시 돌아도 다시 묻거나 알리지 않는다.
    const due = deps(day(0));
    expect(await commitments.runCheckins(due, day(1))).toMatchObject({ failed: 0 });
    expect(mine(due)).toEqual([[userId, expect.any(String), "consultant:2026-11-21", day(1)]]);
    await commitments.runCheckins(due, day(1));
    expect(mine(due)).toHaveLength(1);
    expect((await commitments.checkins(userId, day(1))).commitments.map(item => item.awaiting)).toEqual([true, true]);
    const checks = async () => (await fixture.resource.db.collection("consultant_commitments").find({ userId }).toArray()).map(row => (row.checks as unknown[]).length);
    expect(await checks()).toEqual([1, 1]);
    // 이틀 뒤: 아직 아니다. 3일 뒤: 한 번 더. 그 뒤로는 묻지 않는다.
    await commitments.runCheckins(deps(day(0)), day(3));
    expect(await checks()).toEqual([1, 1]);
    const again = deps(day(0));
    await commitments.runCheckins(again, day(4));
    expect(await checks()).toEqual([2, 2]);
    expect(mine(again)).toHaveLength(1);
    const later = deps(day(0));
    await commitments.runCheckins(later, day(10));
    expect(await checks()).toEqual([2, 2]);
    expect(mine(later)).toEqual([]);
    // 답을 기다리는 약속은 그대로 홈에 남는다.
    expect((await commitments.checkins(userId, day(10))).commitments.map(item => item.id)).toContain(first.id);
  });

  it("먼저 연락하기를 정하지 않았거나 끈 사용자에게는 묻지 않는다", async () => {
    const undecided = await signup(); const off = await signup();
    await consultant.setOutreach(off, false, day(0));
    await commitments.create(undecided, { title: "정하지 않은 사용자의 약속", dueOn: "2026-11-20" }, null, day(0));
    await commitments.create(off, { title: "끈 사용자의 약속", dueOn: "2026-11-20" }, null, day(0));
    const dependencies = deps(day(0));
    await commitments.runCheckins(dependencies, day(0));
    expect(dependencies.notify).not.toHaveBeenCalledWith(undecided, expect.anything(), expect.anything(), expect.anything());
    expect(dependencies.notify).not.toHaveBeenCalledWith(off, expect.anything(), expect.anything(), expect.anything());
    expect(await commitments.checkins(undecided, day(0))).toMatchObject({ outreach: null, commitments: [], quiet: false });
    expect(await commitments.checkins(off, day(0))).toMatchObject({ outreach: false, commitments: [], quiet: false });
  });

  it("확인의 답: 아직이에요는 새 날짜로 미루고, 했어요와 안 하기로 했어요는 닫는다", async () => {
    const userId = await signup(); const other = await signup();
    await consultant.setOutreach(userId, true, day(0));
    const [a, b, c] = await Promise.all(["미룰 약속", "한 약속", "안 하기로 한 약속"].map(title => commitments.create(userId, { title, dueOn: "2026-11-20" }, null, day(0))));
    await commitments.runCheckins(deps(day(0)), day(0));
    expect((await commitments.checkins(userId, day(0))).commitments).toHaveLength(3);
    await expect(commitments.answer(other, a!.id, { answer: "done" }, day(0))).rejects.toBeInstanceOf(ConsultantNotFoundError);
    await expect(commitments.answer(userId, a!.id, { answer: "not_yet", dueOn: "2026-11-19" }, day(0))).rejects.toBeInstanceOf(ConsultantInputError);
    expect(await commitments.answer(userId, a!.id, { answer: "not_yet", dueOn: "2026-11-25" }, day(0))).toMatchObject({ status: "open", dueOn: "2026-11-25", awaiting: false });
    expect(await commitments.answer(userId, b!.id, { answer: "done" }, day(0))).toMatchObject({ status: "done", awaiting: false });
    expect(await commitments.answer(userId, c!.id, { answer: "dropped" }, day(0))).toMatchObject({ status: "dropped", awaiting: false });
    expect((await commitments.checkins(userId, day(0))).commitments).toEqual([]);
    expect((await commitments.open(userId)).map(item => item.title)).toEqual(["미룰 약속"]);
    // 닫힌 약속은 다시 고치지 않는다. 같은 답이 다시 오면 그대로 돌려준다.
    expect(await commitments.answer(userId, b!.id, { answer: "done" }, day(0))).toMatchObject({ status: "done" });
    await expect(commitments.update(userId, b!.id, { dueOn: "2026-12-01" }, day(0))).rejects.toBeInstanceOf(ConsultantInputError);
    // 미룬 약속은 새 날짜에 다시 묻는다.
    await commitments.runCheckins(deps(day(0)), day(4));
    expect((await commitments.checkins(userId, day(4))).commitments).toEqual([]);
    await commitments.runCheckins(deps(day(0)), day(5));
    expect((await commitments.checkins(userId, day(5))).commitments.map(item => item.title)).toEqual(["미룰 약속"]);
  });

  it("대화가 2주 넘게 없으면 한 번 연락하고, 본 뒤에는 2주 뒤에 다시 연락한다", async () => {
    // 확인 작업은 켠 사용자 모두를 돈다. 같은 DB의 다른 사례가 만든 사용자도 함께 세어지므로, 이 사용자의 상태와 알림만 본다.
    const userId = await signup();
    await consultant.setOutreach(userId, true, day(0));
    const quiet = async (at: Date) => (await commitments.checkins(userId, at)).quiet;
    const notifiedFor = (dependencies: ReturnType<typeof deps>) => dependencies.notify.mock.calls.filter(call => (call as unknown[])[0] === userId);
    // 13일째: 아직 아니다. 14일째: 연락하고 알림을 한 건 만든다.
    await commitments.runCheckins(deps(day(0)), day(13));
    expect(await quiet(day(13))).toBe(false);
    const dependencies = deps(day(0));
    await commitments.runCheckins(dependencies, day(14));
    expect(await quiet(day(14))).toBe(true);
    expect(notifiedFor(dependencies)).toEqual([[userId, null, "consultant:2026-12-04", day(14)]]);
    // 아직 보지 않았으면 다시 알리지 않는다.
    const unseen = deps(day(0));
    await commitments.runCheckins(unseen, day(30));
    expect(notifiedFor(unseen)).toEqual([]);
    await commitments.dismissQuiet(userId, day(30));
    expect(await quiet(day(30))).toBe(false);
    // 본 뒤에도 마지막 연락에서 2주가 지나야 다시 연락한다(14일째에 연락 → 28일째부터).
    // 그 사이 대화했으면 그 대화에서 다시 2주를 센다.
    await commitments.runCheckins(deps(day(29)), day(31));
    expect(await quiet(day(31))).toBe(false);
    await commitments.runCheckins(deps(day(0)), day(31));
    expect(await quiet(day(31))).toBe(true);
    // 한 번도 대화하지 않은 사용자는 먼저 연락하기를 정한 날부터 센다.
    const fresh = await signup();
    await consultant.setOutreach(fresh, true, day(20));
    await commitments.runCheckins(deps(null), day(33));
    expect((await commitments.checkins(fresh, day(33))).quiet).toBe(false);
    await commitments.runCheckins(deps(null), day(34));
    expect((await commitments.checkins(fresh, day(34))).quiet).toBe(true);
  });

  it("먼저 연락하기를 끄면 대기 중인 연락이 홈에 보이지 않고, 다시 켜도 하루 한 건을 지키는 날짜는 남는다", async () => {
    const userId = await signup();
    await consultant.setOutreach(userId, true, day(0));
    await commitments.create(userId, { title: "끄기 전의 약속", dueOn: "2026-11-20" }, null, day(0));
    await commitments.runCheckins(deps(day(0)), day(0));
    expect((await consultant.profile(userId)).outreach).toBe(true);
    await consultant.setOutreach(userId, false, day(0));
    expect(await commitments.checkins(userId, day(0))).toMatchObject({ outreach: false, commitments: [] });
    await consultant.setOutreach(userId, true, day(0));
    const dependencies = deps(day(0));
    await commitments.create(userId, { title: "다시 켠 뒤의 약속", dueOn: "2026-11-20" }, null, day(0));
    await commitments.runCheckins(dependencies, day(0));
    expect(dependencies.notify.mock.calls.filter(call => (call as unknown[])[0] === userId)).toEqual([]);
    expect((await commitments.checkins(userId, day(0))).commitments).toHaveLength(2);
  });
});
