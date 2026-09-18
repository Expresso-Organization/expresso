import { MongoClient, ReadConcern } from "mongodb";

import { reconcileCareerProperties } from "./career-property-reconciliation.js";

const databaseUrl = process.env.MONGODB_RECONCILIATION_URL ?? process.env.MONGODB_URL;
if (!databaseUrl) throw new Error("MONGODB_RECONCILIATION_URL 또는 MONGODB_URL이 필요합니다");

const client = new MongoClient(databaseUrl, { serverSelectionTimeoutMS: 3_000 });
try {
  await client.connect();
  const report = await reconcileCareerProperties(
    client.db(process.env.MONGODB_DATABASE, { readConcern: new ReadConcern("majority") }),
  );
  console.info(JSON.stringify(report, null, 2));
  if (!report.canCutover) process.exitCode = 2;
} finally {
  await client.close();
}
