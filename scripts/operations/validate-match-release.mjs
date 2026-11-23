// 공개 공고 스냅샷과 가상 계정으로 격리한 실제 API·Worker·ONNX 경로를 검사합니다.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { openSync, closeSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { performance } from "node:perf_hooks";
import { setTimeout as delay } from "node:timers/promises";
import { BSON } from "mongodb";
import { migrateMongo } from "../../packages/database/dist/index.js";
import { ModelViewSchema } from "../../packages/contracts/dist/index.js";
import { createMongoResource } from "../../services/backend/dist/platform/mongodb.js";
import { IdentityService } from "../../services/backend/dist/modules/identity/service.js";
import { ConsentService } from "../../services/backend/dist/modules/consent/service.js";
import { MatchModelService } from "../../services/backend/dist/modules/match-model/service.js";

const root = resolve(import.meta.dirname, "../..");
const work = resolve(process.env.MATCH_VALIDATION_DIR ?? "var/validation");
const databaseName = "expresso_match_validation_20261122";
const databaseUrl = process.env.MATCH_VALIDATION_MONGODB_URL ?? "mongodb://127.0.0.1:57177/?replicaSet=rs0&directConnection=true";
// 운영 DB와 포트를 넣어 실행하는 실수를 차단합니다.
const uri = new URL(databaseUrl);
assert(["localhost", "127.0.0.1"].includes(uri.hostname) && uri.port === "57177");
const redisUrl = process.env.MATCH_VALIDATION_REDIS_URL ?? "redis://127.0.0.1:56479";
assert.equal(new URL(redisUrl).port, "56479");
const release = resolve(process.env.MATCH_VALIDATION_RELEASE ?? "var/match-model/current");
const api = "http://127.0.0.1:4497", inference = "http://127.0.0.1:4897";
const password = "isolated-match-validation-2026";
const processes = new Map();
const env = {
  PATH: process.env.PATH, HOME: process.env.HOME, LANG: "C.UTF-8",
  NODE_ENV: "test", HOST: "127.0.0.1", PORT: "4497", LOG_LEVEL: "error",
  MONGODB_URL: databaseUrl, MONGODB_DATABASE: databaseName, REDIS_URL: redisUrl,
  QUEUE_PREFIX: "expresso-match-validation", MATCH_MODEL_URL: inference,
  SCHEDULED_JOBS_ENABLED: "false", AI_PROVIDER: "off", MAIL_PROVIDER: "off",
  AGENT_CHAT_ENABLED: "0", TOKENIZERS_PARALLELISM: "false", OMP_NUM_THREADS: "1", OPENBLAS_NUM_THREADS: "1",
};
const report = { startedAt: new Date().toISOString(), scope: "isolated authenticated HTTP API on full current public posting snapshot; six synthetic profiles; local inference one CPU thread", productionServicesChanged: false, phases: [], concurrency: [], restarts: [] };
await mkdir(work, { recursive: true });
async function save(phase, detail = {}) {
  report.phases.push({ at: new Date().toISOString(), phase, ...detail });
  await writeFile(resolve(work, "report.json"), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ phase, ...detail }));
}
async function until(condition, timeout = 60_000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    if (await condition().catch(() => false)) return;
    await delay(500);
  }
  throw new Error("Validation wait timed out");
}
function start(name, command, args) {
  assert(!processes.has(name));
  const fd = openSync(resolve(work, name + ".log"), "a", 0o600);
  const child = spawn(command, args, { cwd: root, env, stdio: ["ignore", fd, fd] });
  closeSync(fd);
  child.on("error", error => console.error(name, error.message));
  processes.set(name, child);
  return child.pid;
}
async function stop(name) {
  const child = processes.get(name);
  if (!child) return;
  child.kill("SIGTERM");
  await Promise.race([new Promise(resolve => child.once("exit", resolve)), delay(15_000)]);
  if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL");
  processes.delete(name);
}
async function startInference() {
  const command = process.platform === "linux" ? "taskset" : resolve(release, "venv/bin/python");
  const prefix = process.platform === "linux" ? ["-c", "0", "nice", "-n", "19", resolve(release, "venv/bin/python")] : [];
  const pid = start("inference", command, [...prefix, "services/match-inference/server.py", "--bundle", resolve(release, "cpu"), "--threads", "1", "--port", "4897", "--vector-dir", resolve(work, "vectors")]);
  await until(async () => (await fetch(inference + "/health")).ok);
  return pid;
}
async function startApi() {
  const pid = start("api", process.execPath, ["services/backend/dist/api/main.js"]);
  await until(async () => (await fetch(api + "/health/ready")).ok);
  return pid;
}
function startWorker() { return start("worker", process.execPath, ["services/backend/dist/worker/main.js"]); }
async function modelCall(path, body = {}) {
  const response = await fetch(inference + path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(180_000) });
  assert(response.ok, "Inference " + path + " HTTP " + response.status);
  return response.json();
}
let resource;
try {
  await migrateMongo({ databaseUrl, databaseName });
  resource = createMongoResource(databaseUrl, { databaseName });
  await resource.client.connect();
  const db = resource.db;
  const snapshot = BSON.EJSON.parse(await readFile(resolve(work, "public-jobs.json"), "utf8"));
  if (!(await db.collection("job_postings").countDocuments())) {
    await db.collection("companies").insertMany(snapshot.companies);
    await db.collection("job_postings").insertMany(snapshot.jobs);
    if (snapshot.requirements.length) await db.collection("job_posting_requirements").insertMany(snapshot.requirements);
  }
  const rows = (await readFile(resolve(root, "docs/assets/persona-evidence-v1/records.jsonl"), "utf8")).trim().split("\n").map(line => JSON.parse(line));
  const years = { "dummy-data-analyst": 4, "dummy-ml-research": 6, "dummy-newgrad": 0, "dummy-career-switch": 6, dev01: null, "dummy-staff-platform": 12 };
  const identity = new IdentityService(resource, { mailer: { send: async () => ({ id: "isolated-validation" }) } });
  const accounts = [];
  for (const key of [...new Set(rows.map(r => r.accountKey))]) {
    const email = key + "@match-validation.example.test";
    let user = await db.collection("users").findOne({ email });
    if (!user) {
      const signup = await identity.signup({ email, displayName: rows.find(r => r.accountKey === key).displayName, password });
      user = await db.collection("users").findOne({ _id: signup.user.id });
    }
    if (years[key] !== null) await db.collection("users").updateOne({ _id: user._id }, { $set: { profile: { experienceYears: years[key], targetRoles: [], updatedAt: new Date() } } });
    if (!(await db.collection("career_records").countDocuments({ userId: user._id }))) {
      const category = await db.collection("career_categories").findOne({ userId: user._id });
      await db.collection("career_records").insertMany(rows.filter(r => r.accountKey === key).map(r => ({ _id: r.recordId, userId: user._id, categoryId: category._id, title: r.title, bodyMd: r.bodyMd, properties: {}, origin: "manual", status: "organized", version: 1, updatedAt: new Date() })));
    }
    const login = await identity.login({ email, password, persistent: false });
    accounts.push({ key, userId: user._id, token: login.session.accessToken, recordCount: rows.filter(r => r.accountKey === key).length });
  }
  report.data = { capturedAt: snapshot.capturedAt, publicPostings: snapshot.jobs.length, requirements: snapshot.requirements.length, syntheticAccounts: accounts.map(({ key, recordCount }) => ({ key, recordCount })) };
  async function request(account, path, body = {}, method = "POST", headers = {}) {
    const response = await fetch(api + path, { method, headers: { authorization: "Bearer " + account.token, "content-type": "application/json", ...headers }, ...(method === "GET" ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(180_000) });
    const json = await response.json();
    assert(response.ok, path + " HTTP " + response.status + " " + JSON.stringify(json));
    return json.data ?? json;
  }
  const model = new MatchModelService(resource, inference, new ConsentService(resource));
  await save("seeded", { jobs: snapshot.jobs.length, records: rows.length });
  await startInference();
  await startApi();
  startWorker();
  const warmStart = performance.now();
  await until(async () => Boolean(await model.embeddingCheckpoint()), 60 * 60_000);
  report.warm = { seconds: (performance.now() - warmStart) / 1000, ...await modelCall("/v1/vector-stats") };
  await save("warmed", report.warm);
  const baseline = new Map(), selected = new Map();
  for (const account of accounts) {
    const result = ModelViewSchema.parse(await request(account, "/v1/jobs/model/recommendations"));
    assert.equal(result.status, "ok");
    assert.equal(result.examined, snapshot.jobs.length);
    assert.equal(result.jobs.length, 10);
    baseline.set(account.key, result);
    selected.set(account.key, result.jobs[0].jobId);
    const evidence = ModelViewSchema.parse(await request(account, `/v1/jobs/postings/${result.jobs[0].jobId}/model-evidence`));
    assert.equal(evidence.status, "ok");
    const own = new Map((await db.collection("career_records").find({ userId: account.userId }).toArray()).map(r => [r._id, r]));
    let quotes = 0;
    for (const job of evidence.jobs) for (const item of job.evidence) for (const record of item.records) {
      assert(own.has(record.recordId), "Foreign career record");
      if (record.quote) {
        const q = record.quote;
        assert(["title", "bodyMd"].includes(q.source));
        assert.equal(Array.from(own.get(record.recordId)[q.source]).slice(q.start, q.end).join(""), q.text);
        quotes++;
      }
    }
    report["evidence-" + account.key] = { requirements: evidence.jobs[0].evidence.length, quotes };
  }
  const statsBefore = await modelCall("/v1/vector-stats");
  for (const concurrency of [1, 2, 4, 6]) {
    const samples = [];
    for (let repeat = 0; repeat < 12; repeat++) {
      await Promise.all(Array.from({ length: concurrency }, async (_, i) => {
        const account = accounts[(repeat * concurrency + i) % accounts.length];
        const started = performance.now();
        const result = await request(account, "/v1/jobs/model/recommendations");
        assert.deepEqual(result, baseline.get(account.key));
        samples.push((performance.now() - started) / 1000);
      }));
    }
    const sorted = [...samples].sort((a, b) => a - b);
    const row = { concurrency, requests: samples.length, p50: sorted[Math.floor(sorted.length * 0.5)], p95: sorted[Math.ceil(sorted.length * 0.95) - 1], seconds: samples };
    report.concurrency.push(row);
    await save("concurrency", { concurrency, p95: row.p95 });
  }
  assert.equal((await modelCall("/v1/vector-stats")).encoded, statsBefore.encoded);

  // 실제 저장 API와 변경 스트림으로 변경·삭제가 반영되는지 확인합니다.
  const account = accounts[0];
  const record = await db.collection("career_records").findOne({ userId: account.userId });
  const beforeChange = await modelCall("/v1/vector-stats");
  await request(account, `/v1/career/records/${record._id}`, { title: record.title + " 검증 변경" }, "PATCH", { "if-match": `"v${record.version}"` });
  await until(async () => (await modelCall("/v1/vector-stats")).encoded > beforeChange.encoded, 120_000);
  const changed = await modelCall("/v1/vector-stats");
  await request(account, `/v1/career/records/${record._id}`, {}, "DELETE");
  await until(async () => !(await model.embeddingOwners("record/" + record._id)).length);
  const deletedResult = await request(account, `/v1/jobs/postings/${selected.get(account.key)}/model-evidence`);
  assert(deletedResult.jobs.every(j => j.evidence.every(e => e.records.every(r => r.recordId !== record._id))));
  await save("mutation-and-delete", { newEncodings: changed.encoded - beforeChange.encoded, deletedRecordExcluded: true });

  // Worker 중단 중의 변경을 재개 위치부터 처리합니다.
  await stop("worker");
  const offline = await db.collection("career_records").findOne({ userId: accounts[1].userId });
  const beforeOffline = await modelCall("/v1/vector-stats");
  await request(accounts[1], `/v1/career/records/${offline._id}`, { title: offline.title + " 중단 중 변경" }, "PATCH", { "if-match": `"v${offline.version}"` });
  startWorker();
  await until(async () => (await modelCall("/v1/vector-stats")).encoded > beforeOffline.encoded, 120_000);
  await save("offline-change-replayed");

  const stable = new Map();
  for (const a of accounts) stable.set(a.key, await request(a, "/v1/jobs/model/recommendations"));
  for (let cycle = 0; cycle < 3; cycle++) {
    const started = performance.now();
    await stop("worker"); await stop("api"); await stop("inference");
    const inferencePid = await startInference();
    const apiPid = await startApi();
    const workerPid = startWorker();
    const readySeconds = (performance.now() - started) / 1000;
    const first = performance.now();
    await Promise.all(accounts.map(async a => assert.deepEqual(await request(a, "/v1/jobs/model/recommendations"), stable.get(a.key))));
    const stats = await modelCall("/v1/vector-stats");
    assert.equal(stats.encoded, 0);
    report.restarts.push({ inferencePid, apiPid, workerPid, readySeconds, concurrentFirstSeconds: (performance.now() - first) / 1000, ...stats });
    await save("restart", report.restarts.at(-1));
  }

  await stop("inference");
  const failedAt = performance.now();
  const unavailable = await request(accounts[0], "/v1/jobs/model/recommendations");
  assert.equal(unavailable.status, "unavailable");
  report.outage = { seconds: (performance.now() - failedAt) / 1000, status: unavailable.status };
  assert.equal((await request(accounts[0], "/v1/jobs/model/status", {}, "GET")).available, false);
  assert((await fetch(api + "/health/ready")).ok);
  await startInference();
  assert.deepEqual(await request(accounts[0], "/v1/jobs/model/recommendations"), stable.get(accounts[0].key));
  await save("outage-and-recovery", report.outage);
  report.finishedAt = new Date().toISOString();
  report.passed = true;
  await save("complete");
} catch (error) {
  report.passed = false;
  report.error = error.stack;
  await save("failed", { error: error.message });
  process.exitCode = 1;
} finally {
  for (const name of ["worker", "api", "inference"]) await stop(name);
  await resource?.close();
}
