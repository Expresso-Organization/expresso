import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import test from "node:test";

import {
  ProcessSupervisor,
  resolveCareerEnvironment,
} from "./dev-career.mjs";

const localRuntimeUrl = "mongodb://runtime-user:runtime-pass@127.0.0.1:57017/expresso?authSource=expresso&replicaSet=rs0";

test("runtime 환경만으로 infra와 Spring 환경을 한 출처로 맞춘다", () => {
  const resolved = resolveCareerEnvironment({
    fileEnvironment: {
      HOST: "127.0.0.1",
      PORT: "4000",
      MONGODB_URL: localRuntimeUrl,
      MONGODB_DATABASE: "expresso",
      REDIS_URL: "redis://127.0.0.1:56379",
    },
    processEnvironment: {
      CAREER_MOVE_PREVIEW_SECRET: "s".repeat(32),
      CAREER_SCHEMA_PREVIEW_SECRET: "p".repeat(32),
    },
    createSecret: () => "unused",
  });

  assert.equal(resolved.infraEnvironment.EXPRESSO_MONGODB_RUNTIME_USERNAME, "runtime-user");
  assert.equal(resolved.infraEnvironment.EXPRESSO_MONGODB_RUNTIME_PASSWORD, "runtime-pass");
  assert.equal(resolved.springEnvironment.MONGODB_URL, localRuntimeUrl);
  assert.equal(resolved.springEnvironment.SERVER_PORT, "4100");
  assert.equal(resolved.springEnvironment.CAREER_MOVE_PREVIEW_SECRET, "s".repeat(32));
  assert.equal(resolved.springEnvironment.CAREER_SCHEMA_PREVIEW_SECRET, "p".repeat(32));
  assert.deepEqual(resolved.notices, []);
});

test("process env가 .env보다 우선하고 누락된 Spring secret들은 각각 임시 생성한다", () => {
  const overriddenRuntimeUrl = "mongodb://override-user:override-pass@localhost:57017/expresso?authSource=expresso&replicaSet=rs0";
  const generatedSecrets = [
    "generated-move-secret-that-is-long-enough",
    "generated-schema-secret-that-is-long-enough",
  ];
  const resolved = resolveCareerEnvironment({
    fileEnvironment: {
      HOST: "127.0.0.1",
      PORT: "4000",
      MONGODB_URL: localRuntimeUrl,
      MONGODB_DATABASE: "expresso",
      REDIS_URL: "redis://127.0.0.1:56379",
    },
    processEnvironment: { MONGODB_URL: overriddenRuntimeUrl },
    createSecret: () => generatedSecrets.shift(),
  });

  assert.equal(resolved.backendEnvironment.MONGODB_URL, overriddenRuntimeUrl);
  assert.equal(resolved.infraEnvironment.EXPRESSO_MONGODB_RUNTIME_USERNAME, "override-user");
  assert.equal(resolved.springEnvironment.CAREER_MOVE_PREVIEW_SECRET, "generated-move-secret-that-is-long-enough");
  assert.equal(resolved.springEnvironment.CAREER_SCHEMA_PREVIEW_SECRET, "generated-schema-secret-that-is-long-enough");
  assert.equal(resolved.notices.length, 2);
});

class FakeChild extends EventEmitter {
  constructor(pid) {
    super();
    this.pid = pid;
    this.exitCode = null;
    this.signalCode = null;
  }
}

test("한 child 실패 시 나머지 process tree까지 한 번씩 정리한다", async () => {
  const children = [
    { name: "fastify", child: new FakeChild(101) },
    { name: "spring", child: new FakeChild(102) },
    { name: "web", child: new FakeChild(103) },
  ];
  const terminated = [];
  const supervisor = new ProcessSupervisor({
    terminateTree: async (child) => {
      terminated.push(child.pid);
      child.exitCode = 0;
      child.emit("close", 0, null);
    },
  });

  const completion = supervisor.watch(children);
  children[1].child.exitCode = 7;
  children[1].child.emit("close", 7, null);

  assert.equal(await completion, 7);
  assert.deepEqual(terminated.sort(), [101, 102, 103]);
});

test("사용자 종료도 모든 process tree를 정리하고 130으로 끝난다", async () => {
  const children = [
    { name: "fastify", child: new FakeChild(201) },
    { name: "spring", child: new FakeChild(202) },
    { name: "web", child: new FakeChild(203) },
  ];
  const terminated = [];
  const supervisor = new ProcessSupervisor({
    terminateTree: async (child) => {
      terminated.push(child.pid);
      child.exitCode = 0;
      child.emit("close", 0, null);
    },
  });

  const completion = supervisor.watch(children);
  await supervisor.stop(130);

  assert.equal(await completion, 130);
  assert.deepEqual(terminated.sort(), [201, 202, 203]);
});
