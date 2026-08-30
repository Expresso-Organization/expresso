import { migrateMongo as migrate } from "./mongo-migrate.js";

const databaseUrl = process.env.MONGODB_MIGRATE_URL;

if (!databaseUrl) {
  throw new Error("MONGODB_MIGRATE_URL is required");
}

const result = await migrate({
  databaseUrl,
  ...(process.env.MONGODB_DATABASE ? { databaseName: process.env.MONGODB_DATABASE } : {}),
});

for (const version of result.applied) {
  console.info(`applied ${version}`);
}

