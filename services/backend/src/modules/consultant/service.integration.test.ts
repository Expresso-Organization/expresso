import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { CONSULTANT_PREFERENCE_LIMIT } from "@expresso/contracts";
import { createMongoFixture } from "../../../test/support/mongodb.js";
import { MongoIdentityService } from "../identity/index.js";
import { ConsultantLimitError, ConsultantService } from "./index.js";

describe.skipIf(!(process.env.TEST_MONGODB_ADMIN_URL ?? process.env.TEST_MONGODB_URL))("컨설턴트 프로필", () => {
  let fixture: Awaited<ReturnType<typeof createMongoFixture>>;
  let userId: string; let other: string;
  let service: ConsultantService;
  beforeAll(async () => {
    fixture = await createMongoFixture("consultant");
    const identity = new MongoIdentityService(fixture.resource);
    userId = (await identity.signup({ email: `${randomUUID()}@example.com`, password: "correct-horse-battery", displayName: "기억 검증" })).user.id;
    other = (await identity.signup({ email: `${randomUUID()}@example.com`, password: "correct-horse-battery", displayName: "다른 사용자" })).user.id;
    service = new ConsultantService(fixture.resource);
  }, 60_000);
  afterAll(async () => { await fixture?.dispose(); });

  it("아직 적은 것이 없는 사용자의 프로필은 비어 있고, 읽기만으로는 문서가 생기지 않는다", async () => {
    expect(await service.profile(userId)).toEqual({ stage: null, stageSource: null, stageUpdatedAt: null, preferences: [], outreach: null });
    expect(await fixture.resource.db.collection("consultant_profiles").countDocuments({ userId })).toBe(0);
  });
  it("에이전트가 단계와 조건을 적고, 같은 글의 조건과 같은 단계는 다시 적지 않는다", async () => {
    const first = await service.applyUpdate(userId, { stage: "preparing", remember: [{ kind: "avoid", text: "야근이 잦은 곳" }, { kind: "prefer", text: "재택이 되는 곳" }] });
    expect(first.changed).toEqual({ stage: "preparing", remembered: 2, forgotten: 0 });
    expect(first.profile).toMatchObject({ stage: "preparing", stageSource: "agent" });
    expect(first.profile.preferences.map(item => [item.kind, item.text, item.source])).toEqual([["avoid", "야근이 잦은 곳", "chat"], ["prefer", "재택이 되는 곳", "chat"]]);
    const again = await service.applyUpdate(userId, { stage: "preparing", remember: [{ kind: "avoid", text: " 야근이  잦은 곳 " }, { kind: "prefer", text: "야근이 잦은 곳" }] });
    // 글이 같아도 종류가 다르면 다른 조건이다.
    expect(again.changed).toEqual({ stage: null, remembered: 1, forgotten: 0 });
    expect(again.profile.preferences).toHaveLength(3);
  });
  it("거둔 조건을 지우고, 사용자가 직접 고른 단계는 사용자가 정한 것으로 남는다", async () => {
    const before = await service.profile(userId);
    const target = before.preferences[0]!;
    const forgotten = await service.applyUpdate(userId, { forget: [target.id, randomUUID()] });
    expect(forgotten.changed).toEqual({ stage: null, remembered: 0, forgotten: 1 });
    expect(forgotten.profile.preferences.some(item => item.id === target.id)).toBe(false);
    const staged = await service.setStage(userId, "applying", "user");
    expect(staged).toMatchObject({ stage: "applying", stageSource: "user" });
    const removed = await service.removePreference(userId, staged.preferences[0]!.id);
    expect(removed.preferences).toHaveLength(staged.preferences.length - 1);
  });
  it("조건은 30개까지 기억하고, 넘는 갱신은 아무것도 바꾸지 않는다", async () => {
    const current = (await service.profile(userId)).preferences.length;
    const room = CONSULTANT_PREFERENCE_LIMIT - current;
    for (let filled = 0; filled < room; filled += 5) await service.applyUpdate(userId, { remember: Array.from({ length: Math.min(5, room - filled) }, (_, index) => ({ kind: "prefer" as const, text: `조건 ${filled + index}` })) });
    expect((await service.profile(userId)).preferences).toHaveLength(CONSULTANT_PREFERENCE_LIMIT);
    await expect(service.applyUpdate(userId, { stage: "exploring", remember: [{ kind: "avoid", text: "넘치는 조건" }] })).rejects.toBeInstanceOf(ConsultantLimitError);
    const after = await service.profile(userId);
    expect(after.preferences).toHaveLength(CONSULTANT_PREFERENCE_LIMIT);
    expect(after.stage).toBe("applying");
    // 하나를 거두면서 하나를 더하는 갱신은 한도 안이다.
    const swapped = await service.applyUpdate(userId, { forget: [after.preferences[0]!.id], remember: [{ kind: "avoid", text: "넘치는 조건" }] });
    expect(swapped.changed).toMatchObject({ remembered: 1, forgotten: 1 });
  });
  it("남의 프로필에 닿지 않는다", async () => {
    const mine = await service.profile(userId);
    await service.removePreference(other, mine.preferences[0]!.id);
    await service.setStage(other, "exploring", "user");
    expect((await service.profile(userId)).preferences).toHaveLength(mine.preferences.length);
    expect((await service.profile(userId)).stage).toBe("applying");
    expect(await service.profile(other)).toMatchObject({ stage: "exploring", preferences: [] });
  });
});
