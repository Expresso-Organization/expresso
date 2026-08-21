import { randomUUID } from "node:crypto";

import { createPool, type Pool, type PoolConnection } from "mysql2/promise";

import type { ReadinessCheck } from "../modules/system/readiness.js";

/**
 * postgres.js 와 같은 모양으로 부르는 MySQL 태그드 템플릿.
 *
 * 질의 자리가 오백 곳이 넘어 호출 형태까지 바꾸면 옮길 것이 두 배가 됩니다.
 * 그래서 `sql<Row[]>` · `sql.begin` · `sql.unsafe` 세 가지 모양을 그대로 두고,
 * 안에서 mysql2 로 실행합니다. 자리마다 고칠 것은 SQL 문법뿐입니다.
 *
 * 조각을 끼워 넣는 것도 postgres.js 와 같습니다 —
 * `sql\`select ... ${scope}\`` 처럼 다른 `sql\`\`` 결과를 값 자리에 두면
 * 그 문장과 매개변수가 함께 펼쳐집니다.
 */

export type Row = Record<string, unknown>;

type Exec = (text: string, params: unknown[]) => Promise<unknown>;

const rawMark = Symbol("raw");
const listMark = Symbol("list");
const jsonMark = Symbol("json");

/** JSON 열에 넣는 값. postgres.js 의 JSONValue 자리입니다. */
export type JSONValue = unknown;

interface RawFragment {
  [rawMark]: true;
  text: string;
  params: unknown[];
}

interface ListValue {
  [listMark]: true;
  values: unknown[];
}

interface JsonValue {
  [jsonMark]: true;
  value: unknown;
}

const isoTimestamp = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:?\d{2})$/;

/** 값을 mysql2 가 받을 수 있는 꼴로 바꿉니다. 객체와 배열은 JSON 열에 들어갑니다. */
function bind(value: unknown): unknown {
  if (typeof value === "object" && value !== null && jsonMark in value) {
    // sql.json(...) 으로 감싼 값은 문자열이든 수든 JSON 으로 넣습니다.
    return JSON.stringify((value as JsonValue).value ?? null);
  }
  if (value === undefined) return null;
  if (value === null) return null;
  if (value instanceof Date) return value;
  if (Buffer.isBuffer(value)) return value;
  // ISO 8601 문자열은 MySQL 이 그대로 받지 않는다 — 시각으로 바꿔 넘긴다.
  if (typeof value === "string" && isoTimestamp.test(value)) {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  if (typeof value === "object") return JSON.stringify(value);
  return value;
}

class Query<T> implements PromiseLike<T> {
  readonly text: string;
  readonly params: unknown[];
  private readonly exec: Exec;

  constructor(text: string, params: unknown[], exec: Exec) {
    this.text = text;
    this.params = params;
    this.exec = exec;
  }

  then<R1 = T, R2 = never>(
    onfulfilled?: ((value: T) => R1 | PromiseLike<R1>) | null,
    onrejected?: ((reason: unknown) => R2 | PromiseLike<R2>) | null,
  ): PromiseLike<R1 | R2> {
    return this.exec(this.text, this.params).then(
      onfulfilled as (value: unknown) => R1,
      onrejected,
    );
  }

  catch<R = never>(
    onrejected?: ((reason: unknown) => R | PromiseLike<R>) | null,
  ): Promise<T | R> {
    return Promise.resolve(this as PromiseLike<T>).catch(onrejected);
  }

  finally(onfinally?: (() => void) | null): Promise<T> {
    return Promise.resolve(this as PromiseLike<T>).finally(onfinally);
  }
}

function isQuery(value: unknown): value is Query<unknown> {
  return value instanceof Query;
}

function isRaw(value: unknown): value is RawFragment {
  return typeof value === "object" && value !== null && rawMark in value;
}

function isList(value: unknown): value is ListValue {
  return typeof value === "object" && value !== null && listMark in value;
}

function build(
  strings: TemplateStringsArray,
  values: unknown[],
): { text: string; params: unknown[] } {
  let text = strings[0] ?? "";
  const params: unknown[] = [];

  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (isQuery(value)) {
      text += value.text;
      params.push(...value.params);
    } else if (isRaw(value)) {
      text += value.text;
      params.push(...value.params);
    } else if (isList(value)) {
      // 빈 목록은 () 가 되어 문법이 깨진다. 아무것도 맞지 않는 값을 하나 둔다.
      if (value.values.length === 0) {
        text += "(null)";
      } else {
        text += `(${value.values.map(() => "?").join(", ")})`;
        params.push(...value.values.map(bind));
      }
    } else {
      text += "?";
      params.push(bind(value));
    }
    text += strings[index + 1] ?? "";
  }

  return { text, params };
}

export interface SqlTag {
  <T = Row[]>(strings: TemplateStringsArray, ...values: unknown[]): Query<T>;
  /** `in ${sql(ids)}` 처럼 목록을 펼칩니다. */
  (values: unknown[]): ListValue;
  /** 트랜잭션 하나를 열고, 콜백이 끝나면 커밋합니다. 던지면 되돌립니다. */
  begin<T>(fn: (tx: SqlTag) => Promise<T>): Promise<T>;
  /**
   * 문장을 그대로 보냅니다. 값 자리에 두면 그 자리에 글자 그대로 들어가고,
   * await 하면 실행됩니다. `$1` 자리 표시는 `?` 로 바꿔 씁니다.
   */
  unsafe<T = Row[]>(text: string, params?: unknown[]): RawFragment & PromiseLike<T>;
  /** 값을 JSON 으로 넣습니다. 객체는 감싸지 않아도 JSON 으로 갑니다. */
  json(value: unknown): JsonValue;
  /** PostgreSQL 배열 열이 JSON 배열이 되었습니다 — 같은 자리에 그대로 씁니다. */
  array(values: readonly unknown[]): JsonValue;
  end(options?: { timeout?: number }): Promise<void>;
}

function makeTag(exec: Exec, extra: Partial<SqlTag> = {}): SqlTag {
  const tag = ((first: TemplateStringsArray | unknown[], ...values: unknown[]) => {
    if (Array.isArray(first) && !("raw" in first)) {
      return { [listMark]: true, values: first } as ListValue;
    }
    const { text, params } = build(first as TemplateStringsArray, values);
    return new Query(text, params, exec);
  }) as SqlTag;

  tag.unsafe = ((text: string, params: unknown[] = []) => {
    const normalized = text.replace(/\$(\d+)/g, "?");
    const fragment = {
      [rawMark]: true,
      text: normalized,
      params: params.map(bind),
      then(onfulfilled: (value: unknown) => unknown, onrejected?: (reason: unknown) => unknown) {
        return exec(normalized, params.map(bind)).then(onfulfilled, onrejected);
      },
    };
    return fragment as ReturnType<SqlTag["unsafe"]>;
  }) as SqlTag["unsafe"];

  tag.json = (value: unknown) => ({ [jsonMark]: true, value }) as JsonValue;
  tag.array = (values: readonly unknown[]) =>
    ({ [jsonMark]: true, value: [...values] }) as JsonValue;

  Object.assign(tag, extra);
  return tag;
}

async function run(
  runner: Pool | PoolConnection,
  text: string,
  params: unknown[],
): Promise<unknown> {
  try {
    const [rows] = await runner.query(text, params);
    return Array.isArray(rows) ? rows : [];
  } catch (error) {
    if (process.env.EXPRESSO_SQL_TRACE === "1") {
      console.error("SQL 실패:", String((error as Error).message).slice(0, 160), "|", text.replace(/\s+/g, " ").slice(0, 200));
    }
    throw error;
  }
}

/**
 * MySQL 에는 RETURNING 이 없습니다. 쓰기 한 문장이 쓰기와 재조회 두 문장이 되는데,
 * 이 나눔을 자리마다 손으로 적으면 오백 곳에 흩어집니다. 그래서 여기 한 곳에 둡니다.
 *
 * 다루는 꼴은 셋입니다 — 한 행 insert · update · delete. 그 밖의 꼴(여러 행 insert,
 * on duplicate key update 와 함께 쓴 returning)은 뜻이 갈리므로 오류를 냅니다.
 * 부르는 쪽에서 두 문장으로 적어야 합니다.
 */
const returningPattern = /\s+returning\s+([\s\S]+?)\s*;?\s*$/i;

/** 따옴표 안의 물음표는 자리 표시가 아닙니다. */
function countPlaceholders(text: string): number {
  let count = 0;
  let quote: string | null = null;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (quote) {
      if (ch === "\\") i += 1;
      else if (ch === quote) quote = null;
      continue;
    }
    if (ch === "'" || ch === '"' || ch === "`") quote = ch;
    else if (ch === "?") count += 1;
  }
  return count;
}

function findKeyword(text: string, keyword: string): number {
  const pattern = new RegExp(`^\\s${keyword}\\s`, "i");
  let quote: string | null = null;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (quote) {
      if (ch === "\\") i += 1;
      else if (ch === quote) quote = null;
      continue;
    }
    if (ch === "'" || ch === '"' || ch === "`") { quote = ch; continue; }
    if (pattern.test(text.slice(i, i + keyword.length + 2))) return i;
  }
  return -1;
}

function splitTopLevel(text: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let quote: string | null = null;
  let start = 0;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (quote) {
      if (ch === "\\") i += 1;
      else if (ch === quote) quote = null;
      continue;
    }
    if (ch === "'" || ch === '"' || ch === "`") quote = ch;
    else if (ch === "(") depth += 1;
    else if (ch === ")") depth -= 1;
    else if (ch === "," && depth === 0) {
      parts.push(text.slice(start, i));
      start = i + 1;
    }
  }
  parts.push(text.slice(start));
  return parts;
}

function closingParen(text: string, open: number): number {
  let depth = 0;
  let quote: string | null = null;
  for (let i = open; i < text.length; i += 1) {
    const ch = text[i];
    if (quote) {
      if (ch === "\\") i += 1;
      else if (ch === quote) quote = null;
      continue;
    }
    if (ch === "'" || ch === '"' || ch === "`") quote = ch;
    else if (ch === "(") depth += 1;
    else if (ch === ")") { depth -= 1; if (depth === 0) return i; }
  }
  return -1;
}

const unsupported = (why: string, statement = ""): never => {
  const head = statement.replace(/\s+/g, " ").trim().slice(0, 160);
  throw new Error(
    `MySQL 에서는 이 returning 을 옮기지 못합니다 — ${why}. 쓰기와 재조회를 나눠 적으십시오.${head ? ` [${head}]` : ""}`,
  );
};

async function execReturning(
  runner: Pool | PoolConnection,
  text: string,
  params: unknown[],
): Promise<unknown> {
  const match = returningPattern.exec(text);
  if (!match) return run(runner, text, params);

  const body = text.slice(0, match.index);
  const columns = (match[1] ?? "").trim();

  if (/^\s*insert/i.test(body)) {
    if (/on\s+duplicate\s+key/i.test(body)) {
      unsupported("insert 가 on duplicate key update 와 함께 있습니다", body);
    }
    const head = /^\s*insert\s+(?:ignore\s+)?into\s+(`?[a-z_][a-z0-9_]*`?)\s*\(([^)]*)\)\s*values\s*\(/i.exec(body);
    if (!head) unsupported("insert 의 열 목록과 values 를 읽지 못했습니다", body);
    const table = head![1] ?? "";
    const cols = (head![2] ?? "").split(",").map((c) => c.trim().replace(/`/g, ""));
    const open = head!.index + head![0].length - 1;
    const close = closingParen(body, open);
    if (close < 0) unsupported("values 괄호가 닫히지 않았습니다", body);
    if (/\)\s*,\s*\(/.test(body.slice(close))) unsupported("여러 행을 한 번에 넣고 있습니다", body);

    const before = countPlaceholders(body.slice(0, open));
    const exprs = splitTopLevel(body.slice(open + 1, close));
    if (exprs.length !== cols.length) unsupported("열 수와 값 수가 다릅니다", body);

    const idAt = cols.indexOf("id");
    let statement = body;
    let bound = params;
    let id: unknown;
    if (idAt >= 0) {
      // id 앞에 놓인 값 중 자리 표시가 몇 개인지 세어 그 자리의 매개변수를 집는다
      const expr = (exprs[idAt] ?? "").trim();
      if (expr === "?") {
        id = params[before + countPlaceholders(exprs.slice(0, idAt).join(","))];
      } else if (/^'[^']*'$/.test(expr)) {
        id = expr.slice(1, -1);
      } else {
        unsupported("id 값을 읽지 못했습니다", body);
      }
    } else {
      id = randomUUID();
      statement =
        body.slice(0, head!.index) +
        head![0].replace(/\(([^)]*)\)\s*values\s*\($/i, (_m, list: string) => `(id, ${list}) values (?, `) +
        body.slice(head!.index + head![0].length);
      bound = [...params.slice(0, before), id, ...params.slice(before)];
    }
    await run(runner, statement, bound);
    // insert ignore 로 걸러졌으면 그 id 가 없다 — 빈 결과가 그대로 답이다.
    return run(runner, `select ${columns} from ${table} where id = ?`, [id]);
  }

  if (/^\s*update/i.test(body)) {
    const head = /^\s*update\s+(`?[a-z_][a-z0-9_]*`?)\s/i.exec(body);
    if (!head) unsupported("update 의 표 이름을 읽지 못했습니다", body);
    const table = head![1] ?? "";
    const whereAt = findKeyword(body, "where");
    const where = whereAt < 0 ? "" : body.slice(whereAt);
    const whereParams = whereAt < 0 ? [] : params.slice(countPlaceholders(body.slice(0, whereAt)));
    const targets = (await run(runner, `select id from ${table} ${where}`, whereParams)) as Row[];
    await run(runner, body, params);
    if (targets.length === 0) return [];
    const ids = targets.map((row) => row.id);
    const marks = ids.map(() => "?").join(", ");
    return run(runner, `select ${columns} from ${table} where id in (${marks})`, ids);
  }

  if (/^\s*delete/i.test(body)) {
    const head = /^\s*delete\s+from\s+(`?[a-z_][a-z0-9_]*`?)\s*/i.exec(body);
    if (!head) unsupported("delete 의 표 이름을 읽지 못했습니다", body);
    const table = head![1] ?? "";
    const whereAt = findKeyword(body, "where");
    const where = whereAt < 0 ? "" : body.slice(whereAt);
    const rows = await run(runner, `select ${columns} from ${table} ${where}`, params);
    await run(runner, body, params);
    return rows;
  }

  return unsupported("insert · update · delete 가 아닙니다", body);
}


export interface MysqlResource {
  sql: SqlTag;
  readinessCheck: ReadinessCheck;
  close(): Promise<void>;
}

export function createMysqlResource(databaseUrl: string): MysqlResource {
  const pool = createPool({
    uri: databaseUrl,
    connectionLimit: 10,
    connectTimeout: 5_000,
    idleTimeout: 20_000,
    // 시각은 어디서나 UTC 로 오갑니다.
    timezone: "Z",
    // 소수점 자리가 있는 수를 문자열이 아니라 수로 받습니다.
    decimalNumbers: true,
    // MySQL 의 boolean 은 tinyint(1) 이라 0 · 1 로 옵니다. 계약은 참 · 거짓을
    // 받으므로 여기서 되돌립니다 — PostgreSQL 이 주던 것과 같은 값이 됩니다.
    typeCast(field, next) {
      if (field.type === "TINY" && field.length === 1) {
        const value = field.string();
        return value === null ? null : value === "1";
      }
      return next();
    },
    supportBigNumbers: true,
    bigNumberStrings: false,
  });

  const sql = makeTag((text, params) => execReturning(pool, text, params), {
    async begin<T>(fn: (tx: SqlTag) => Promise<T>): Promise<T> {
      const connection = await pool.getConnection();
      try {
        await connection.beginTransaction();
        const tx = makeTag((text, params) => execReturning(connection, text, params), {
          begin: (nested) => nested(tx),
          end: async () => {},
        });
        const result = await fn(tx);
        await connection.commit();
        return result;
      } catch (error) {
        try {
          await connection.rollback();
        } catch {
          // 되돌리기가 실패해도 원래 오류를 그대로 올립니다.
        }
        throw error;
      } finally {
        // PostgreSQL 의 자문 잠금은 트랜잭션이 끝나면 풀렸다. MySQL 의 get_lock 은
        // 세션에 붙어 있어, 연결을 풀에 돌려주기 전에 여기서 푼다.
        try {
          await connection.query("do release_all_locks()");
        } catch {
          // 잠금 해제가 실패해도 연결은 돌려준다.
        }
        connection.release();
      }
    },
    end: async () => {
      await pool.end();
    },
  });

  return {
    sql,
    readinessCheck: {
      name: "mysql",
      async run() {
        await sql`select 1`;
      },
    },
    async close() {
      await pool.end();
    },
  };
}
