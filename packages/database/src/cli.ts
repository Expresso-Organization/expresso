import { migrate } from "./migrate.js";

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_URL is required");
}

const result = await migrate({
  databaseUrl,
  ...(process.env.MIGRATIONS_DIR
    ? { migrationsDirectory: process.env.MIGRATIONS_DIR }
    : {}),
});

for (const filename of result.applied) {
  console.info(`applied ${filename}`);
}
for (const filename of result.existing) {
  console.info(`already applied ${filename}`);
}

