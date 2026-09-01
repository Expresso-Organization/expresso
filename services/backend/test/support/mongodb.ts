import { randomUUID } from "node:crypto";
import { MongoClient } from "mongodb";
import { migrateMongo } from "@expresso/database";
import { createMongoResource, type MongoResource } from "../../src/platform/mongodb.js";

export async function createMongoFixture(label: string): Promise<{ resource: MongoResource; dispose(): Promise<void> }> {
  const adminUrl = process.env.TEST_MONGODB_ADMIN_URL ?? process.env.TEST_MONGODB_URL;
  if (!adminUrl) throw new Error("TEST_MONGODB_ADMIN_URL or TEST_MONGODB_URL is required");
  const databaseName = `expresso_test_${label.replace(/[^a-z0-9]/gi, "").slice(0, 20)}_${randomUUID().replaceAll("-", "")}`;
  const admin = new MongoClient(adminUrl, { serverSelectionTimeoutMS: 3_000 });
  let resource: MongoResource | undefined;
  let disposal: Promise<void> | undefined;
  const dispose = () => disposal ??= (async () => {
    try { await resource?.close(); }
    finally { try { await admin.db(databaseName).dropDatabase(); } finally { await admin.close(); } }
  })();
  try {
    await migrateMongo({ databaseUrl: adminUrl, databaseName });
    resource = createMongoResource(process.env.TEST_MONGODB_RUNTIME_URL ?? adminUrl, { databaseName });
    return { resource, dispose };
  } catch (error) { await dispose(); throw error; }
}
