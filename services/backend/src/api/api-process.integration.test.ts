import { spawn, type ChildProcess } from "node:child_process";
import { randomUUID } from "node:crypto";
import { connect, createServer, type AddressInfo, type Server, type Socket } from "node:net";
import { fileURLToPath } from "node:url";

import { afterEach, describe, expect, it } from "vitest";

import { createMongoFixture } from "../../test/support/mongodb.js";

const mongoUrl = process.env.TEST_MONGODB_URL;
const redisUrl = process.env.TEST_REDIS_URL;
const describeWithInfrastructure = mongoUrl && redisUrl ? describe : describe.skip;
const backendRoot = fileURLToPath(new URL("../..", import.meta.url));

async function freePort(): Promise<number> {
  const probe = createServer();
  await new Promise<void>((resolve) => probe.listen(0, "127.0.0.1", resolve));
  const { port } = probe.address() as AddressInfo;
  await new Promise((resolve) => probe.close(resolve));
  return port;
}

/** 실제 Mongo 앞의 TCP 중계. 닫아 두면 API 입장에서 Mongo가 내려간 상태와 같다. */
function createOutageProxy(port: number, target: { host: string; port: number }) {
  let server: Server | undefined;
  const sockets = new Set<Socket>();
  return {
    async up() {
      const next = createServer((client) => {
        const upstream = connect(target.port, target.host);
        for (const socket of [client, upstream]) {
          sockets.add(socket);
          socket.once("close", () => sockets.delete(socket));
          socket.on("error", () => { client.destroy(); upstream.destroy(); });
        }
        client.pipe(upstream).pipe(client);
      });
      await new Promise<void>((resolve) => next.listen(port, "127.0.0.1", resolve));
      server = next;
    },
    async down() {
      const current = server;
      server = undefined;
      for (const socket of sockets) socket.destroy();
      if (current) await new Promise((resolve) => current.close(resolve));
    },
  };
}

interface Readiness { status: number; mongodb: string | undefined }

async function readReadiness(apiPort: number): Promise<Readiness | undefined> {
  try {
    const response = await fetch(`http://127.0.0.1:${apiPort}/health/ready`, { signal: AbortSignal.timeout(10_000) });
    const body = await response.json() as { checks?: { mongodb?: string } };
    return { status: response.status, mongodb: body.checks?.mongodb };
  } catch {
    return undefined;
  }
}

async function waitForReadiness(apiPort: number, status: number, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let last: Readiness | undefined;
  while (Date.now() < deadline) {
    last = await readReadiness(apiPort);
    if (last?.status === status) return;
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error(`readiness did not reach ${status}: ${JSON.stringify(last)}`);
}

describeWithInfrastructure("API 프로세스의 Mongo 연결 복구", () => {
  const cleanups: (() => Promise<unknown>)[] = [];

  afterEach(async () => {
    for (const cleanup of cleanups.splice(0).reverse()) await cleanup().catch(() => undefined);
  });

  async function startApi() {
    const fixture = await createMongoFixture("apiboot");
    cleanups.push(() => fixture.dispose());
    const source = new URL(mongoUrl!);
    const proxyPort = await freePort();
    const apiPort = await freePort();
    const proxy = createOutageProxy(proxyPort, { host: source.hostname, port: Number(source.port) });
    cleanups.push(() => proxy.down());
    // 복제 세트 멤버 주소를 찾아가면 중계를 우회한다. 이 시험은 중계 하나만 보게 묶는다.
    const viaProxy = new URL(source);
    viaProxy.host = `127.0.0.1:${proxyPort}`;
    viaProxy.searchParams.delete("replicaSet");
    viaProxy.searchParams.set("directConnection", "true");

    let output = "";
    const child: ChildProcess = spawn(process.execPath, ["--import", "tsx", "src/api/main.ts"], {
      cwd: backendRoot,
      env: {
        PATH: process.env.PATH,
        HOME: process.env.HOME,
        NODE_ENV: "test",
        AI_PROVIDER: "off",
        HOST: "127.0.0.1",
        PORT: String(apiPort),
        MONGODB_URL: viaProxy.toString(),
        MONGODB_DATABASE: fixture.resource.db.databaseName,
        REDIS_URL: redisUrl!,
        QUEUE_PREFIX: `api-${randomUUID().slice(0, 12)}`,
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    child.stdout?.on("data", (chunk) => { output += String(chunk); });
    child.stderr?.on("data", (chunk) => { output += String(chunk); });
    const exited = new Promise<{ code: number | null; signal: NodeJS.Signals | null }>((resolve) => {
      child.once("close", (code, signal) => resolve({ code, signal }));
    });
    cleanups.push(async () => { child.kill("SIGKILL"); await exited; });
    return { apiPort, proxy, child, exited, output: () => output };
  }

  it("Mongo가 내려간 동안 시작해도 Mongo가 돌아오면 준비 상태가 된다", async () => {
    const api = await startApi();

    // 첫 요청이 드라이버의 지연 연결을 실패시킨다. 프로세스는 503으로 답하며 살아 있어야 한다.
    await waitForReadiness(api.apiPort, 503, 30_000).catch((error: unknown) => { throw new Error(`${String(error)}\n${api.output()}`); });
    expect((await readReadiness(api.apiPort))?.mongodb).toBe("down");
    const live = await fetch(`http://127.0.0.1:${api.apiPort}/health/live`);
    expect(live.status).toBe(200);

    await api.proxy.up();
    await waitForReadiness(api.apiPort, 200, 20_000).catch((error: unknown) => { throw new Error(`${String(error)}\n${api.output()}`); });

    // 연결한 뒤의 장애는 드라이버가 복구한다. 같은 프로세스가 다시 준비 상태가 된다.
    await api.proxy.down();
    await waitForReadiness(api.apiPort, 503, 20_000);
    await api.proxy.up();
    await waitForReadiness(api.apiPort, 200, 30_000);
    expect(api.child.exitCode).toBeNull();

    api.child.kill("SIGTERM");
    expect(await api.exited).toEqual({ code: 0, signal: null });
    expect(api.output()).not.toContain(new URL(mongoUrl!).password || "no-password-in-url");
  }, 120_000);

  it("Mongo를 기다리는 중에도 SIGTERM으로 바로 끝난다", async () => {
    const api = await startApi();
    await waitForReadiness(api.apiPort, 503, 30_000);

    const startedAt = Date.now();
    api.child.kill("SIGTERM");
    expect(await api.exited).toEqual({ code: 0, signal: null });
    expect(Date.now() - startedAt).toBeLessThan(10_000);
  }, 60_000);
});
