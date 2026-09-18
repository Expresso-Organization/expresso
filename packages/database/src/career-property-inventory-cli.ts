import { MongoClient, ReadConcern } from "mongodb";

import { inspectCareerPropertyMigration } from "./career-property-inventory.js";

const databaseUrl = process.env.MONGODB_INVENTORY_URL ?? process.env.MONGODB_URL;
if (!databaseUrl) throw new Error("MONGODB_INVENTORY_URL 또는 MONGODB_URL이 필요합니다");

const client = new MongoClient(databaseUrl, { serverSelectionTimeoutMS: 3_000 });
try {
  await client.connect();
  const report = await inspectCareerPropertyMigration(client.db(process.env.MONGODB_DATABASE, { readConcern: new ReadConcern("majority") }));
  console.info(JSON.stringify(report, null, 2));
  if (!report.canMigrate) process.exitCode = 2;
} finally {
  await client.close();
}
