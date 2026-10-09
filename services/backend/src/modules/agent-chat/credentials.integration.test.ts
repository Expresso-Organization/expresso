import { randomBytes, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createMongoFixture } from "../../../test/support/mongodb.js";
import { AgentCredentials } from "./credentials.js";
describe.skipIf(!(process.env.TEST_MONGODB_ADMIN_URL ?? process.env.TEST_MONGODB_URL))("개인 API 키 암호화 저장", () => {
  let fixture: Awaited<ReturnType<typeof createMongoFixture>>;
  const encryptionKey = randomBytes(32).toString("hex");
  beforeAll(async () => { fixture = await createMongoFixture("agentcredentials"); }, 60000);
  afterAll(async () => { await fixture?.dispose(); });
  it("평문을 저장하지 않고 재시작 이후 복원하며 다른 계정과 분리한다", async () => {
    const id = randomUUID(); const key = "sk-ant-test-secret-value";
    const store = new AgentCredentials(fixture.resource, encryptionKey);
    await store.save(id, key);
    expect(await store.configured(id)).toBe(true);
    const doc = await fixture.resource.db.collection("agent_credentials").findOne({ _id: id as never });
    expect(JSON.stringify(doc)).not.toContain(key);
    expect(await new AgentCredentials(fixture.resource, encryptionKey).read(id)).toBe(key);
    expect(await store.read(randomUUID())).toBeUndefined();
    await store.save(id, key + "-new"); expect(await store.read(id)).toBe(key + "-new");
    await store.remove(id); expect(await store.configured(id)).toBe(false);
  });
  it("암호문을 다른 사용자에게 복사하거나 키가 다르면 복호화를 거부한다", async () => {
    const id = randomUUID(); const other = randomUUID(); const store = new AgentCredentials(fixture.resource, encryptionKey);
    await store.save(id, "sk-ant-test-secret-value");
    const doc = await fixture.resource.db.collection("agent_credentials").findOne({ _id: id as never });
    await fixture.resource.db.collection("agent_credentials").insertOne({ ...doc, _id: other as never, userId: other });
    await expect(store.read(other)).rejects.toMatchObject({ statusCode: 503 });
    await expect(new AgentCredentials(fixture.resource, randomBytes(32).toString("hex")).read(id)).rejects.toMatchObject({ statusCode: 503 });
  });
});
