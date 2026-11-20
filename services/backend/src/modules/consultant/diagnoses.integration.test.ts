import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { GoalDemand } from "@expresso/contracts";
import { createMongoFixture } from "../../../test/support/mongodb.js";
import { ConsultantDiagnoses, ConsultantInputError } from "./index.js";

describe.skipIf(!(process.env.TEST_MONGODB_ADMIN_URL ?? process.env.TEST_MONGODB_URL))("진단의 저장", () => {
  let fixture: Awaited<ReturnType<typeof createMongoFixture>>;
  let diagnoses: ConsultantDiagnoses;
  const at = (minute: number) => new Date(Date.UTC(2026, 10, 20, 3, minute, 0));
  const item = (id: string, label: string, count: number) => ({ id, kind: "technology" as const, label, count });
  const demand = (overrides: Partial<GoalDemand> = {}): GoalDemand => ({ work: "백엔드 개발자", family: "백엔드", basis: "family", focus: null, level: null, sampleSize: 66, companyCount: 15, interestedCount: 0, small: false, items: [item("technology:java", "Java", 45), item("technology:kafka", "Kafka", 39)], ...overrides });
  const evidence = [{ recordId: randomUUID(), quote: "Java로 결제 API를 만들었다", recordTitle: "결제 서버" }];
  beforeAll(async () => { fixture = await createMongoFixture("diagnoses"); diagnoses = new ConsultantDiagnoses(fixture.resource); }, 60_000);
  afterAll(async () => { await fixture?.dispose(); });

  it("집계를 저장하면 모든 항목이 미확인이고, 대조는 적은 항목만 고친다", async () => {
    const userId = randomUUID();
    expect(await diagnoses.current(userId)).toBeNull();
    await expect(diagnoses.assess(userId, "요약", [{ itemId: "technology:java", status: "confirmed", evidence, note: "" }])).rejects.toBeInstanceOf(ConsultantInputError);
    const saved = await diagnoses.saveDemand(userId, demand(), at(0));
    expect(saved).toMatchObject({ sampleSize: 66, companyCount: 15, summary: "", assessedAt: null, stale: null });
    expect(saved.items.map(row => [row.id, row.status])).toEqual([["technology:java", "unconfirmed"], ["technology:kafka", "unconfirmed"]]);
    const assessed = await diagnoses.assess(userId, "백엔드 공고 66건 기준", [{ itemId: "technology:java", status: "confirmed", evidence, note: "결제 서버에서 확인" }], at(1));
    expect(assessed.items).toEqual([{ ...item("technology:java", "Java", 45), status: "confirmed", evidence, note: "결제 서버에서 확인" }, { ...item("technology:kafka", "Kafka", 39), status: "unconfirmed", evidence: [], note: "" }]);
    expect(assessed).toMatchObject({ summary: "백엔드 공고 66건 기준", assessedAt: at(1).toISOString() });
    await expect(diagnoses.assess(userId, "요약", [{ itemId: "technology:rust", status: "gap", evidence: [], note: "" }], at(2))).rejects.toThrow(/집계에 없는 항목/);
    // 남의 진단은 읽히지 않는다.
    expect(await diagnoses.current(randomUUID())).toBeNull();
  });
  it("같은 목표로 다시 집계하면 같은 항목의 상태 · 근거를 이어받고, 목표가 바뀌면 이어받지 않는다", async () => {
    const userId = randomUUID();
    await diagnoses.saveDemand(userId, demand(), at(0));
    await diagnoses.assess(userId, "요약", [{ itemId: "technology:java", status: "confirmed", evidence, note: "" }, { itemId: "technology:kafka", status: "gap", evidence: [], note: "해 본 적 없음" }], at(1));
    const again = await diagnoses.saveDemand(userId, demand({ sampleSize: 70, items: [item("technology:kafka", "Kafka", 41), item("technology:redis", "Redis", 30)] }), at(5));
    expect(again.items.map(row => [row.id, row.count, row.status, row.note])).toEqual([["technology:kafka", 41, "gap", "해 본 적 없음"], ["technology:redis", 30, "unconfirmed", ""]]);
    expect(again).toMatchObject({ sampleSize: 70, summary: "요약", assessedAt: at(1).toISOString() });
    const changed = await diagnoses.saveDemand(userId, demand({ work: "데이터 엔지니어", family: "데이터", items: [item("technology:kafka", "Kafka", 12)] }), at(6));
    expect(changed.items).toEqual([{ ...item("technology:kafka", "Kafka", 12), status: "unconfirmed", evidence: [], note: "" }]);
    expect(changed).toMatchObject({ summary: "", assessedAt: null });
  });
  it("다시 진단이 필요한지는 지금의 목표와 기록에 견주어 낸다", async () => {
    const userId = randomUUID();
    await diagnoses.saveDemand(userId, demand(), at(0));
    await diagnoses.assess(userId, "요약", [{ itemId: "technology:java", status: "confirmed", evidence, note: "" }], at(10));
    expect((await diagnoses.current(userId, { work: " 백엔드  개발자 ", recordsChangedAt: at(5) }))!.stale).toBeNull();
    expect((await diagnoses.current(userId, { work: "백엔드 개발자", recordsChangedAt: at(11) }))!.stale).toBe("records");
    expect((await diagnoses.current(userId, { work: "데이터 엔지니어", recordsChangedAt: at(11) }))!.stale).toBe("goal");
    expect((await diagnoses.current(userId, { work: null, recordsChangedAt: null }))!.stale).toBe("goal");
    // 견줄 것을 주지 않으면 판단하지 않는다.
    expect((await diagnoses.current(userId))!.stale).toBeNull();
  });
});
