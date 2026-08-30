import { randomUUID } from "node:crypto";

import { mongoCollections } from "@expresso/database";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createMongoFixture } from "../../test/support/mongodb.js";
import { inTransaction } from "./mongo-transaction.js";
import { deleteSnapshotPayload, readSnapshot, writeSnapshot } from "./snapshot-payload.js";

describe.skipIf(!process.env.TEST_MONGODB_URL)("MongoDB snapshot payload", () => {
  let fixture: Awaited<ReturnType<typeof createMongoFixture>>;
  beforeAll(async () => { fixture = await createMongoFixture("snapshot-payload"); }, 60_000);
  afterAll(async () => { await fixture?.dispose(); });

  it("keeps small snapshots inline", async () => {
    const value = { text: "작은 본문", nested: { count: 1 } };
    const ref = await inTransaction(fixture.resource, (tx) => writeSnapshot(tx, randomUUID(), value));
    expect(ref).toEqual({ kind: "inline", value });
    expect(await readSnapshot(fixture.resource, ref)).toEqual(value);
  });

  it("restores a multilingual large snapshot byte-for-byte", async () => {
    const userId = randomUUID(); const value = { text: "가🙂a".repeat(2_000_000) };
    const ref = await inTransaction(fixture.resource, (tx) => writeSnapshot(tx, userId, value));
    expect(ref.kind).toBe("chunks");
    expect(await readSnapshot(fixture.resource, ref)).toEqual(value);
    await inTransaction(fixture.resource, (tx) => deleteSnapshotPayload(tx, userId, ref));
    expect(await mongoCollections(fixture.resource.db).snapshotChunks.countDocuments({ userId })).toBe(0);
  }, 30_000);

  it("never returns partial content for a missing or corrupted chunk", async () => {
    const userId = randomUUID(); const value = { text: "다국어🙂".repeat(1_500_000) };
    const missing = await inTransaction(fixture.resource, (tx) => writeSnapshot(tx, userId, value));
    if (missing.kind !== "chunks") throw new Error("chunk fixture is too small");
    const chunks = mongoCollections(fixture.resource.db).snapshotChunks;
    await chunks.deleteOne({ payloadId: missing.payloadId, part: 1 });
    await expect(readSnapshot(fixture.resource, missing)).rejects.toThrow("incomplete");

    const corrupt = await inTransaction(fixture.resource, (tx) => writeSnapshot(tx, userId, value));
    if (corrupt.kind !== "chunks") throw new Error("chunk fixture is too small");
    await chunks.updateOne({ payloadId: corrupt.payloadId, part: 0 }, { $set: { sha256: "0".repeat(64) } });
    await expect(readSnapshot(fixture.resource, corrupt)).rejects.toThrow("checksum");
  }, 30_000);

  it("rolls every chunk back when the surrounding transaction fails", async () => {
    const userId = randomUUID();
    await expect(inTransaction(fixture.resource, async (tx) => {
      await writeSnapshot(tx, userId, { text: "가".repeat(3_000_000) });
      throw new Error("injected failure");
    })).rejects.toThrow("injected failure");
    expect(await mongoCollections(fixture.resource.db).snapshotChunks.countDocuments({ userId })).toBe(0);
  });
});
