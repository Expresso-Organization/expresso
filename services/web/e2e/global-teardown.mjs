import { promisify } from "node:util";
import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";

const run = promisify(execFile);

export default async function globalTeardown() {
  if (process.env.CAREER_E2E_KEEP_DATABASE === "1") return;
  const database = process.env.CAREER_E2E_DATABASE;
  const url = process.env.CAREER_E2E_MONGODB_URL;
  if (!database || !/^expresso_career_editor_e2e_[0-9]+$/.test(database) || !url) throw new Error("refusing to clean an unrecognized career editor E2E database");
  const root = fileURLToPath(new URL("../../..", import.meta.url));
  const script = "import {MongoClient} from 'mongodb'; void(async()=>{const database=process.env.CAREER_E2E_DATABASE;if(!database||!/^expresso_career_editor_e2e_[0-9]+$/.test(database))throw new Error('unsafe E2E database');const client=new MongoClient(process.env.CAREER_E2E_MONGODB_URL);await client.connect();try{await client.db(database).dropDatabase()}finally{await client.close()}})()";
  await run("pnpm", ["--filter", "@expresso/backend", "exec", "tsx", "-e", script], { cwd: root, env: process.env });
}
