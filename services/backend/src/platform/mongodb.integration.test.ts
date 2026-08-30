import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

import { createMongoResource, type MongoResource } from "./mongodb.js";
import { createMongoFixture } from "../../test/support/mongodb.js";
import { migrateMongo } from "@expresso/database";

const mongoUrl = process.env.TEST_MONGODB_URL ?? (
  process.env.TEST_DATABASE_URL?.startsWith("mongodb")
    ? process.env.TEST_DATABASE_URL
    : undefined
);
const standaloneUrl = process.env.TEST_MONGODB_STANDALONE_URL;
const describeWithInfrastructure = mongoUrl ? describe : describe.skip;
const describeWithStandalone = standaloneUrl ? describe : describe.skip;
const restartContainer = process.env.TEST_MONGODB_RESTART_CONTAINER;
const executeFile = promisify(execFile);

describe("MongoDB bootstrap", () => {
  it("mongosh 인증 응답과 기존 replica set 상태를 처리하며 재실행한다", () => {
    let role: unknown;
    const users = new Map<string, unknown>();
    const applicationDb = {
      getRole: () => role,
      createRole: (value: unknown) => { role = value; },
      getUser: (name: string) => users.get(name),
      createUser: (value: { user: string }) => users.set(value.user, value),
      updateUser: (name: string, value: unknown) => users.set(name, value),
    };
    const context = () => ({
      process: { env: {
        MONGO_INITDB_ROOT_USERNAME: "admin", MONGO_INITDB_ROOT_PASSWORD: "test",
        MONGO_RUNTIME_USERNAME: "runtime", MONGO_RUNTIME_PASSWORD: "test",
        MONGO_MIGRATION_USERNAME: "migrator", MONGO_MIGRATION_PASSWORD: "test",
      } },
      db: { getSiblingDB: (name: string) => name === "admin" ? {
        auth: () => ({ ok: 1 }), runCommand: () => ({ ok: 1, setName: "rs0", isWritablePrimary: true }),
      } : applicationDb },
      rs: {
        status: () => ({ ok: 1, set: "rs0", members: [{ name: "localhost:57017", stateStr: "PRIMARY" }] }),
        conf: () => ({ _id: "rs0", members: [{ _id: 0, host: "localhost:57017" }] }),
        initiate: () => { throw new Error("기존 replica set을 다시 초기화하면 안 됩니다"); },
      },
      print: () => {},
      sleep: () => { throw new Error("primary가 이미 준비되어 있습니다"); },
    });
    const script = readFileSync(new URL("../../../../infra/mongodb/init-replica-set.js", import.meta.url), "utf8");
    runInNewContext(script, context());
    runInNewContext(script, context());
    expect([...users.keys()].sort()).toEqual(["migrator", "runtime"]);
  });
});

describe("MongoDB resource construction", () => {
  it("초기 요청 burst에서 연결 생성을 직렬화하지 않는다", async () => {
    const resource = createMongoResource("mongodb://127.0.0.1:1/unused");
    try {
      expect(resource.client.options.maxConnecting).toBe(16);
    } finally {
      await resource.close();
    }
  });
  it("생성 시 연결 실패를 던지지 않고 준비 검사로 보고한다", async () => {
    const resource = createMongoResource("mongodb://127.0.0.1:1/unused");
    try {
      await expect(resource.readinessCheck.run()).rejects.toThrow();
    } finally {
      await resource.close();
    }
  }, 10_000);
});

describeWithInfrastructure("MongoDB resource integration", () => {
  it("공용 fixture는 서로 다른 DB를 만들고 소유한 DB만 정리한다", async () => {
    const first = await createMongoFixture("fixture");
    const second = await createMongoFixture("fixture");
    try {
      expect(first.resource.db.databaseName).not.toBe(second.resource.db.databaseName);
      expect(first.resource.db.databaseName).toMatch(/^expresso_test_fixture_[a-f0-9]{32}$/);
      await first.dispose();
      expect(await second.resource.db.collection("plans").countDocuments()).toBe(3);
      await second.resource.readinessCheck.run();
    } finally { await first.dispose(); await second.dispose(); }
  }, 60_000);
  let resource: MongoResource | undefined;
  const databaseName = `expresso_test_t01_${randomUUID().replaceAll("-", "")}`;

  beforeAll(async () => {
    // 입력 URI의 DB에는 쓰지 않고 테스트 관리 계정으로 임의 DB만 생성합니다.
    await migrateMongo({ databaseUrl: mongoUrl!, databaseName });
    resource = createMongoResource(mongoUrl!, { databaseName });
    await resource.readinessCheck.run();
    await resource.db.createCollection("probe");
  }, 60_000);

  afterAll(async () => {
    if (!resource) return;
    try {
      if (!/^expresso_test_t01_[a-f0-9]{32}$/.test(databaseName) || resource.db.databaseName !== databaseName) {
        throw new Error("테스트에서 생성한 DB만 삭제할 수 있습니다");
      }
      await resource.db.dropDatabase();
    } finally {
      await resource.close();
    }
  }, 10_000);

  it("취소한 트랜잭션의 문서를 남기지 않는다", async () => {
    const session = resource!.client.startSession();
    try {
      await expect(session.withTransaction(async () => {
        await resource!.db.collection("probe").insertOne({ value: 1 }, { session });
        throw new Error("abort-probe");
      })).rejects.toThrow("abort-probe");
      expect(await resource!.db.collection("probe").countDocuments()).toBe(0);
    } finally {
      await session.endSession();
    }
  });

  it("잘못된 인증 정보는 준비 상태가 되지 않는다", async () => {
    const invalid = new URL(mongoUrl!);
    invalid.username = "invalid-expresso-user";
    invalid.password = "invalid-expresso-password";
    const resourceWithInvalidCredentials = createMongoResource(invalid.toString());
    try {
      await expect(
        resourceWithInvalidCredentials.readinessCheck.run(),
      ).rejects.toThrow();
    } finally {
      await resourceWithInvalidCredentials.close();
    }
  }, 10_000);

  (restartContainer ? it : it.skip)("테스트 mongod 프로세스를 재시작해도 문서를 보존한다", async () => {
    // 명시적으로 지정한 로컬 테스트 Compose 컨테이너만 재시작합니다.
    const uri = new URL(mongoUrl!);
    expect(["127.0.0.1", "localhost"]).toContain(uri.hostname);
    expect(uri.port).toBe("57017");
    const { stdout } = await executeFile("docker", ["inspect", restartContainer!], { timeout: 10_000 });
    const [container] = JSON.parse(stdout);
    const project = container.Config.Labels["com.docker.compose.project"] as string;
    expect(project).toMatch(/^expresso-mongodb-(t01|test-[a-z0-9-]+)$/);
    expect(container.Config.Labels["com.docker.compose.service"]).toBe("mongodb");
    expect(container.NetworkSettings.Ports["57017/tcp"]).toContainEqual({ HostIp: "127.0.0.1", HostPort: "57017" });
    await resource!.db.collection("probe").insertOne({ value: "persisted" }, { writeConcern: { w: "majority" } });
    await executeFile("docker", ["restart", restartContainer!], { timeout: 20_000 });
    const deadline = Date.now() + 20_000;
    while (true) {
      try { await resource!.readinessCheck.run(); break; } catch (error) {
        if (Date.now() >= deadline) throw error;
        await new Promise((resolve) => setTimeout(resolve, 250));
      }
    }
    expect(await resource!.db.collection("probe").findOne({ value: "persisted" })).not.toBeNull();
  }, 60_000);
});

describeWithStandalone("MongoDB standalone negative integration", () => {
  it("standalone 서버는 rs0 primary로 보고되지 않는다", async () => {
    const resource = createMongoResource(standaloneUrl!);
    try {
      await expect(resource.readinessCheck.run()).rejects.toThrow(
        "MongoDB primary is unavailable",
      );
    } finally {
      await resource.close();
    }
  }, 10_000);
});
