import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";

import { afterEach, describe, expect, it } from "vitest";

import { createReliableQueue } from "../platform/queue.js";

const redisUrl = process.env.TEST_REDIS_URL;
const describeWithRedis = redisUrl ? describe : describe.skip;
const backendRoot = fileURLToPath(new URL("../..", import.meta.url));

interface WorkerExit { code: number | null; signal: NodeJS.Signals | null; output: string }

/** 끝나지 않으면 강제로 끊고 실패로 돌려준다 — 2026-11-04 장애가 바로 이 모양이었다. */
function runWorker(environment: NodeJS.ProcessEnv, timeoutMs: number): Promise<WorkerExit> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ["--import", "tsx", "src/worker/main.ts"], {
      cwd: backendRoot,
      env: { PATH: process.env.PATH, HOME: process.env.HOME, ...environment },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let output = "";
    child.stdout.on("data", (chunk) => { output += String(chunk); });
    child.stderr.on("data", (chunk) => { output += String(chunk); });
    const timer = setTimeout(() => child.kill("SIGKILL"), timeoutMs);
    child.once("error", reject);
    child.once("close", (code, signal) => {
      clearTimeout(timer);
      resolve({ code, signal, output });
    });
  });
}

describeWithRedis("Worker 프로세스 수명", () => {
  const cleanups: (() => Promise<void>)[] = [];

  afterEach(async () => {
    await Promise.allSettled(cleanups.splice(0).map((cleanup) => cleanup()));
  });

  it("Mongo에 닿지 못하면 잡을 받지 않고 종료 코드 1로 끝난다", async () => {
    const prefix = `exit-${randomUUID().slice(0, 12)}`;
    const jobs = createReliableQueue<Record<string, unknown>>("domain-jobs", redisUrl!, prefix);
    cleanups.push(async () => {
      await jobs.queue.obliterate({ force: true });
      await jobs.deadLetterQueue.obliterate({ force: true });
      await jobs.close();
    });
    const waiting = await jobs.queue.add("job.normalize", { jobAnalysisId: "kept" });

    const result = await runWorker({
      NODE_ENV: "test",
      AI_PROVIDER: "off",
      SCHEDULED_JOBS_ENABLED: "false",
      MONGODB_URL: "mongodb://probe:secret-value@127.0.0.1:1/expresso?directConnection=true",
      MONGODB_DATABASE: "expresso",
      REDIS_URL: redisUrl!,
      QUEUE_PREFIX: prefix,
    }, 45_000);

    expect(result.signal, result.output).toBeNull();
    expect(result.code, result.output).toBe(1);
    expect(result.output).toContain("worker.fatal");
    expect(result.output).toContain("MongoServerSelectionError");
    expect(result.output).not.toContain("secret-value");
    const kept = await jobs.queue.getJob(waiting.id!);
    expect(await kept?.getState()).toBe("waiting");
    expect(kept?.attemptsMade).toBe(0);
    expect(await jobs.deadLetterQueue.count()).toBe(0);
  }, 60_000);
});
