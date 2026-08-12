import postgres from "postgres";

import type { ReadinessCheck } from "../modules/system/readiness.js";

export interface PostgresResource {
  sql: postgres.Sql;
  readinessCheck: ReadinessCheck;
  close(): Promise<void>;
}

export function createPostgresResource(databaseUrl: string): PostgresResource {
  const sql = postgres(databaseUrl, {
    max: 10,
    connect_timeout: 5,
    idle_timeout: 20,
  });

  return {
    sql,
    readinessCheck: {
      name: "postgres",
      async run() {
        await sql`select 1`;
      },
    },
    async close() {
      await sql.end({ timeout: 5 });
    },
  };
}
