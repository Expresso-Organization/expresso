import { createHash } from "node:crypto";
import { COLUMN_POLICY, TABLE_ORDER } from "./transform.mjs";

export async function openReadOnlySource(createConnection, uri) {
  const connection = await createConnection({ uri, timezone: "Z", multipleStatements: false });
  await connection.query("set session transaction isolation level repeatable read"); await connection.query("start transaction with consistent snapshot, read only");
  return connection;
}

export async function inspectSource(connection) {
  const database = connection.config.database;
  const [rows] = await connection.execute("select table_name, column_name, column_type, ordinal_position from information_schema.columns where table_schema = ? and table_name in (?,?,?,?) order by table_name, ordinal_position", [database, ...TABLE_ORDER]);
  const tables = Object.fromEntries(TABLE_ORDER.map((table) => [table, []])); for (const item of rows) tables[item.TABLE_NAME ?? item.table_name].push({ name: item.COLUMN_NAME ?? item.column_name, type: item.COLUMN_TYPE ?? item.column_type });
  for (const table of TABLE_ORDER) { const actual = tables[table].map(({ name }) => name); const expected = COLUMN_POLICY[table].stored; const unknown = actual.filter((name) => !expected.includes(name) && !(name in COLUMN_POLICY[table].excluded)); if (unknown.length || expected.some((name) => !actual.includes(name))) throw new Error(`${table} schema differs from the frozen column policy`); }
  const schemaHash = createHash("sha256").update(JSON.stringify(tables)).digest("hex"); return { database, tables, schemaHash };
}

export async function readPage(connection, table, after, limit) {
  if (!TABLE_ORDER.includes(table)) throw new Error("unsupported source table");
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 5_000) throw new Error("invalid import page size");
  // 일부 운영 MySQL 조합은 prepared statement의 LIMIT placeholder를 거부한다.
  // 숫자는 위 범위 검사로 고정하고, 원본 cursor만 placeholder로 전달한다.
  const [rows] = await connection.execute(`select * from \`${table}\` where id > ? order by id limit ${limit}`, [after ?? ""]); return rows;
}
