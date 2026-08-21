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
      text += `(${value.values.map(() => "?").join(", ")})`;
      params.push(...value.values.map(bind));
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
  end(): Promise<void>;
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
  const [rows] = await runner.query(text, params);
  return Array.isArray(rows) ? rows : [];
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
    supportBigNumbers: true,
    bigNumberStrings: false,
  });

  const sql = makeTag((text, params) => run(pool, text, params), {
    async begin<T>(fn: (tx: SqlTag) => Promise<T>): Promise<T> {
      const connection = await pool.getConnection();
      try {
        await connection.beginTransaction();
        const tx = makeTag((text, params) => run(connection, text, params), {
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
