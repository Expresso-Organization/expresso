import { randomUUID } from "node:crypto";
import { hostname } from "node:os";
import type { Db } from "mongodb";
import type { MigrationLockDoc } from "./documents/operations.js";

export class MigrationLeaseUnavailable extends Error {
  constructor() { super("Migration lease exists; expiry alone does not permit takeover"); }
}

export async function acquireMigrationLease(db: Db, durationMs = 60_000): Promise<MigrationLockDoc> {
  const lease: MigrationLockDoc = { _id: "schema", owner: `${hostname()}:${process.pid}`, token: randomUUID(), expiresAt: new Date(Date.now() + durationMs) };
  try {
    await db.collection<MigrationLockDoc>("migration_locks").insertOne(lease);
  } catch (error) {
    if ((error as { code?: number }).code === 11000) throw new MigrationLeaseUnavailable();
    throw error;
  }
  return lease;
}

export async function renewMigrationLease(db: Db, token: string): Promise<void> {
  const result = await db.collection<MigrationLockDoc>("migration_locks").updateOne(
    { _id: "schema", token }, { $set: { expiresAt: new Date(Date.now() + 60_000) } },
  );
  if (result.matchedCount !== 1) throw new Error("Migration lease ownership lost");
}

export async function releaseMigrationLease(db: Db, token: string): Promise<void> {
  const result = await db.collection<MigrationLockDoc>("migration_locks").deleteOne({ _id: "schema", token });
  if (result.deletedCount !== 1) throw new Error("Migration lease ownership lost");
}

/** 운영자가 이전 프로세스와 서버의 미완료 명령 종료를 확인한 뒤에만 호출합니다. DDL에는 fencing이 없습니다. */
export async function recoverMigrationLease(
  db: Db, expectedToken: string,
  confirmation: { executionStopped: boolean; pendingCommandsTerminated: boolean },
): Promise<void> {
  if (!confirmation.executionStopped || !confirmation.pendingCommandsTerminated) {
    throw new Error("Recovery requires verified termination of execution and pending commands");
  }
  await releaseMigrationLease(db, expectedToken);
}
