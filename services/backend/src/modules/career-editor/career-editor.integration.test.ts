import { createHash, randomUUID } from "node:crypto";

import { encodeDocumentAsYUpdate } from "@expresso/editor";
import { mongoCollections } from "@expresso/database";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createMongoFixture } from "../../../test/support/mongodb.js";
import { CareerDocumentService } from "./service.js";

describe.skipIf(!(process.env.TEST_MONGODB_ADMIN_URL ?? process.env.TEST_MONGODB_URL))(
  "career document replica-set integration",
  () => {
    let fixture: Awaited<ReturnType<typeof createMongoFixture>>;
    let service: CareerDocumentService;
    let userId: string;
    let recordId: string;

    beforeAll(async () => {
      fixture = await createMongoFixture("career-editor");
      service = new CareerDocumentService(fixture.resource, "integration-signing-secret");
      userId = randomUUID();
      recordId = randomUUID();
      const category = await mongoCollections(fixture.resource.db).careerCategories.findOne({ isSystem: true });
      await mongoCollections(fixture.resource.db).careerRecords.insertOne({
        _id: recordId, userId, categoryId: category!._id, title: "원본", status: "draft",
        origin: "manual", properties: {}, bodyMd: "# 원본\n\n본문", version: 1,
        updatedAt: new Date(), deletedAt: null,
      });
    }, 60_000);

    afterAll(async () => { await fixture?.dispose(); });

    it("persists one concurrent update, replays duplicates, compacts, and restores", async () => {
      const initial = await service.bootstrap(userId, recordId);
      const collections = mongoCollections(fixture.resource.db);
      const initialSnapshot = await collections.careerDocumentSnapshots.findOne({ recordId });
      expect(initialSnapshot?.checksum).toMatch(/^[a-f0-9]{64}$/);
      await service.createRevision({
        id: randomUUID(), userId, recordId, actor: "user", summary: "초기 상태",
        beforeVersion: 0, afterVersion: 0, snapshotId: initialSnapshot!._id,
        createdAt: new Date().toISOString(),
      });

      const nextDocument = structuredClone(initial.document);
      nextDocument.content[0]!.text = [{ text: "변경" }];
      const baseUpdate = encodeDocumentAsYUpdate(initial.document);
      const update = encodeDocumentAsYUpdate(nextDocument, [baseUpdate]);
      const makeInput = (clientId: string) => ({
        recordId, clientId, clientSequence: 1, expectedSequence: 0,
        updateBase64: Buffer.from(update).toString("base64"),
        checksum: createHash("sha256").update(update).digest("hex"),
      });
      const firstInput = makeInput(randomUUID());
      const secondInput = makeInput(randomUUID());
      const results = await Promise.allSettled([
        service.appendUpdate(userId, firstInput),
        service.appendUpdate(userId, secondInput),
      ]);
      expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
      expect(results.find((result) => result.status === "rejected")).toMatchObject({ reason: { statusCode: 409 } });
      const fulfilled = results.find((result) => result.status === "fulfilled");
      if (!fulfilled || fulfilled.status !== "fulfilled") throw new Error("accepted update is missing");
      const acceptedInput = results[0]?.status === "fulfilled" ? firstInput : secondInput;
      expect(await service.appendUpdate(userId, acceptedInput)).toEqual(fulfilled.value);
      expect(await collections.careerDocumentUpdates.countDocuments({ recordId })).toBe(1);

      const compacted = await service.compact(recordId, 1) as { snapshotId: string };
      expect((await collections.careerDocumentSnapshots.findOne({ _id: compacted.snapshotId }))?.checksum).toMatch(/^[a-f0-9]{64}$/);
      expect(await collections.careerDocumentUpdates.countDocuments({ recordId, compactedAt: { $ne: null } })).toBe(1);

      const revision = (await service.listRevisions(userId, recordId)).find((item) => item.summary === "초기 상태")!;
      const restored = await service.restoreRevision(userId, revision.id, 1);
      expect(restored.documentVersion).toBe(2);
      expect(restored.document.content[0]?.text?.[0]?.text).toBe("원본");
      await expect(service.bootstrap(randomUUID(), recordId)).rejects.toMatchObject({ statusCode: 404 });
    }, 30_000);
  },
);
