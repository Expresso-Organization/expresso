import { randomUUID } from "node:crypto";
import { expect, it, vi } from "vitest";
import { createEvidenceIndexProcessor } from "./evidence-index.js";
it("한 기록과 전체 재색인을 기존 서비스에 위임한다", async () => {
 const service = { sync: vi.fn(async () => ({ indexed: 2, complete: true })), syncRecord: vi.fn(async () => ({ indexed: 1 })) };
 const process = createEvidenceIndexProcessor(service), userId = randomUUID(), recordId = randomUUID();
 await process({ name: "career.evidence.record", data: { userId, recordId } }); expect(service.syncRecord).toHaveBeenCalledWith(userId, recordId);
 await process({ name: "career.evidence.reindex", data: { userId } }); expect(service.sync).toHaveBeenCalledWith(userId);
});
it("잘못된 입력과 삭제 계정은 재시도하지 않는다", async () => {
 const service = { sync: vi.fn(async () => { throw { statusCode: 401 }; }), syncRecord: vi.fn() }, process = createEvidenceIndexProcessor(service);
 await expect(process({ name: "career.evidence.record", data: { userId: randomUUID() } })).rejects.toMatchObject({ name: "UnrecoverableError" });
 await expect(process({ name: "career.evidence.reindex", data: { userId: randomUUID() } })).rejects.toMatchObject({ name: "UnrecoverableError" });
});
it("일시 장애는 기존 지수 재시도·실패 큐로 전달한다", async () => {
 const error = new Error("temporary"), service = { sync: vi.fn(async () => { throw error; }), syncRecord: vi.fn() };
 await expect(createEvidenceIndexProcessor(service)({ name: "career.evidence.reindex", data: { userId: randomUUID() } })).rejects.toBe(error);
});
