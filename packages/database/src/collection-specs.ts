import { readFile } from "node:fs/promises";
import type { Document, IndexDescription } from "mongodb";

export interface MongoCollectionSpec {
  name: string;
  validator: Document;
  indexes: IndexDescription[];
}

/** 버전이 고정된 명세이며 서비스 시작 시 실행하지 않습니다. */
export async function loadCollectionSpecs(): Promise<MongoCollectionSpec[]> {
  return JSON.parse(await readFile(new URL("./mongodb-migrations/0001/schema.json", import.meta.url), "utf8"));
}
