import { randomBytes } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseEnv } from "node:util";
import { spawn } from "node:child_process";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const backendDirectory = resolve(repositoryRoot, "services/backend");
const springDirectory = resolve(repositoryRoot, "services/backend-spring");
const localHosts = new Set(["127.0.0.1", "localhost", "[::1]"]);

function required(environment, key) {
  const value = environment[key]?.trim();
  if (!value) throw new Error(`${key} is required for local Career development`);
  return value;
}

function parseLocalMongoUrl(value, key) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${key} must be a valid MongoDB URL`);
  }
  const databaseName = url.pathname.replace(/^\//, "");
  if (url.protocol !== "mongodb:" || !localHosts.has(url.hostname) || url.port !== "57017"
      || databaseName !== "expresso" || url.searchParams.get("authSource") !== "expresso"
      || url.searchParams.get("replicaSet") !== "rs0") {
    throw new Error(`${key} must target the local expresso MongoDB on port 57017 with authSource=expresso and replicaSet=rs0`);
  }
  if (!url.username || !url.password) {
    throw new Error(`${key} must contain a local MongoDB username and password`);
  }
  return {
    url: value,
    username: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
  };
}

function validateLocalRedisUrl(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error("REDIS_URL must be a valid Redis URL");
  }
  if (url.protocol !== "redis:" || !localHosts.has(url.hostname) || url.port !== "56379") {
    throw new Error("REDIS_URL must target local Redis on port 56379");
  }
}

function resolvePreviewSecret(environment, key, createSecret, notices) {
  const configured = environment[key]?.trim() ?? "";
  if (configured && configured.length < 32) {
    throw new Error(`${key} must be at least 32 characters`);
  }
  if (configured) return configured;
  notices.push(`${key}이 없어 이번 실행에만 유효한 로컬 값을 생성했습니다.`);
  return createSecret();
}

export function resolveCareerEnvironment({
  fileEnvironment,
  processEnvironment,
  createSecret = () => randomBytes(32).toString("hex"),
}) {
  const effective = { ...fileEnvironment, ...processEnvironment };
  const runtime = parseLocalMongoUrl(required(effective, "MONGODB_URL"), "MONGODB_URL");
  if ((effective.MONGODB_DATABASE ?? "expresso") !== "expresso") {
    throw new Error("MONGODB_DATABASE must be expresso for local Career development");
  }
  if ((effective.HOST ?? "127.0.0.1") !== "127.0.0.1" || (effective.PORT ?? "4000") !== "4000") {
    throw new Error("Fastify must use 127.0.0.1:4000 for local Career development");
  }
  validateLocalRedisUrl(required(effective, "REDIS_URL"));

  const notices = [];
  const movePreviewSecret = resolvePreviewSecret(effective, "CAREER_MOVE_PREVIEW_SECRET", createSecret, notices);
  const schemaPreviewSecret = resolvePreviewSecret(effective, "CAREER_SCHEMA_PREVIEW_SECRET", createSecret, notices);

  const commonEnvironment = {
    ...effective,
    HOST: "127.0.0.1",
    PORT: "4000",
    MONGODB_DATABASE: "expresso",
    MONGODB_URL: runtime.url,
    REDIS_URL: required(effective, "REDIS_URL"),
  };
  return {
    backendEnvironment: commonEnvironment,
    springEnvironment: {
      ...processEnvironment,
      MONGODB_URL: runtime.url,
      SERVER_PORT: "4100",
      CAREER_MOVE_PREVIEW_SECRET: movePreviewSecret,
      CAREER_SCHEMA_PREVIEW_SECRET: schemaPreviewSecret,
    },
    webEnvironment: { ...processEnvironment },
    infraEnvironment: {
      ...processEnvironment,
      EXPRESSO_MONGODB_DATABASE: "expresso",
      EXPRESSO_MONGODB_RUNTIME_USERNAME: runtime.username,
      EXPRESSO_MONGODB_RUNTIME_PASSWORD: runtime.password,
      EXPRESSO_REDIS_PORT: "56379",
    },
    notices,
  };
}

function prefixLines(stream, name, target) {
  let remainder = "";
  stream.setEncoding("utf8");
  stream.on("data", (chunk) => {
    const lines = (remainder + chunk).split(/\r?\n/);
    remainder = lines.pop() ?? "";
    for (const line of lines) target.write(`[${name}] ${line}\n`);
  });
  stream.on("end", () => {
    if (remainder) target.write(`[${name}] ${remainder}\n`);
  });
}

function pnpmCommand(args) {
  const pnpmEntry = process.env.npm_execpath;
  if (pnpmEntry && /\.(?:c?js|mjs)$/i.test(pnpmEntry)) {
    return { command: process.execPath, args: [pnpmEntry, ...args] };
  }
  if (process.platform === "win32") {
    return { command: process.env.ComSpec ?? "cmd.exe", args: ["/d", "/s", "/c", `pnpm ${args.join(" ")}`] };
  }
  return { command: "pnpm", args };
}

function springCommand() {
  if (process.platform === "win32") {
    return { command: process.env.ComSpec ?? "cmd.exe", args: ["/d", "/s", "/c", "gradlew.bat bootRun"] };
  }
  return { command: "./gradlew", args: ["bootRun"] };
}

function startChild({ name, command, args, cwd, environment }) {
  const child = spawn(command, args, {
    cwd,
    env: environment,
    detached: true,
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });
  prefixLines(child.stdout, name, process.stdout);
  prefixLines(child.stderr, name, process.stderr);
  return { name, child };
}

function waitForExit(child) {
  if (child.exitCode !== null || child.signalCode !== null) return Promise.resolve();
  return new Promise((resolveExit) => child.once("close", resolveExit));
}

export async function terminateProcessTree(child) {
  if (!child?.pid || child.exitCode !== null || child.signalCode !== null) return;
  if (process.platform === "win32") {
    const killer = spawn("taskkill.exe", ["/pid", String(child.pid), "/t", "/f"], {
      detached: true,
      stdio: "ignore",
      windowsHide: true,
    });
    await new Promise((resolveKill) => killer.once("close", resolveKill));
    await waitForExit(child);
    return;
  }
  try {
    process.kill(-child.pid, "SIGTERM");
  } catch (error) {
    if (error.code !== "ESRCH") throw error;
    return;
  }
  await Promise.race([
    waitForExit(child),
    new Promise((resolveWait) => setTimeout(resolveWait, 3_000)),
  ]);
  if (child.exitCode === null && child.signalCode === null) {
    try {
      process.kill(-child.pid, "SIGKILL");
    } catch (error) {
      if (error.code !== "ESRCH") throw error;
    }
    await waitForExit(child);
  }
}

export class ProcessSupervisor {
  constructor({ terminateTree = terminateProcessTree } = {}) {
    this.terminateTree = terminateTree;
    this.children = [];
    this.stopping = null;
    this.resolveCompletion = null;
    this.completion = null;
  }

  watch(children) {
    this.children = children;
    this.completion = new Promise((resolveCompletion) => {
      this.resolveCompletion = resolveCompletion;
    });
    for (const { name, child } of children) {
      child.once("error", (error) => {
        process.stderr.write(`[${name}] 시작 실패: ${error.message}\n`);
        void this.stop(1);
      });
      child.once("close", (code, signal) => {
        if (this.stopping) return;
        const exitCode = Number.isInteger(code) ? code : 1;
        process.stderr.write(`[career] ${name} 종료 (${signal ?? exitCode}); 나머지 프로세스를 정리합니다.\n`);
        void this.stop(exitCode);
      });
    }
    return this.completion;
  }

  stop(exitCode) {
    if (this.stopping) return this.stopping;
    // 종료 중 발생하는 child close가 stop을 재진입하지 않도록 먼저 상태를 잠급니다.
    this.stopping = Promise.resolve(exitCode);
    this.stopping = Promise.allSettled(this.children.map(({ child }) => this.terminateTree(child)))
      .then(() => {
        this.resolveCompletion?.(exitCode);
        return exitCode;
      });
    return this.stopping;
  }
}

async function runOneShot({ name, command, args, cwd, environment, setActiveSupervisor }) {
  const descriptor = startChild({ name, command, args, cwd, environment });
  const supervisor = new ProcessSupervisor();
  setActiveSupervisor(supervisor);
  const exitCode = await supervisor.watch([descriptor]);
  return exitCode;
}

function loadBackendEnvironment() {
  const personalPath = resolve(backendDirectory, ".env");
  const sourcePath = existsSync(personalPath) ? personalPath : resolve(backendDirectory, ".env.example");
  return {
    environment: parseEnv(readFileSync(sourcePath, "utf8")),
    usingExample: sourcePath.endsWith(".env.example"),
  };
}

export async function main() {
  if (Number(process.versions.node.split(".")[0]) < 24) {
    throw new Error("pnpm dev:career requires Node.js 24 or newer");
  }
  const loaded = loadBackendEnvironment();
  const environment = resolveCareerEnvironment({
    fileEnvironment: loaded.environment,
    processEnvironment: process.env,
  });
  if (loaded.usingExample) {
    process.stdout.write("[career] services/backend/.env가 없어 .env.example의 로컬 기본값을 사용합니다.\n");
  }
  for (const notice of environment.notices) process.stdout.write(`[career] ${notice}\n`);

  let activeSupervisor;
  let interrupted = false;
  const stopForSignal = () => {
    if (interrupted) return;
    interrupted = true;
    process.stdout.write("[career] 종료 신호를 받아 개발 프로세스를 정리합니다. Docker infra는 유지합니다.\n");
    void activeSupervisor?.stop(130);
  };
  process.once("SIGINT", stopForSignal);
  process.once("SIGTERM", stopForSignal);
  const setActiveSupervisor = (value) => { activeSupervisor = value; };

  const infra = pnpmCommand(["infra:up"]);
  const infraExitCode = await runOneShot({ name: "infra", ...infra, cwd: repositoryRoot, environment: environment.infraEnvironment, setActiveSupervisor });
  if (interrupted) return 130;
  if (infraExitCode !== 0) throw new Error(`infra failed with exit code ${infraExitCode}`);

  const backend = pnpmCommand(["dev:backend"]);
  const web = pnpmCommand(["dev:web"]);
  const spring = springCommand();
  const descriptors = [
    startChild({ name: "fastify", ...backend, cwd: repositoryRoot, environment: environment.backendEnvironment }),
    startChild({ name: "spring", ...spring, cwd: springDirectory, environment: environment.springEnvironment }),
    startChild({ name: "web", ...web, cwd: repositoryRoot, environment: environment.webEnvironment }),
  ];
  activeSupervisor = new ProcessSupervisor();
  const childExitCode = await activeSupervisor.watch(descriptors);
  process.removeListener("SIGINT", stopForSignal);
  process.removeListener("SIGTERM", stopForSignal);
  if (interrupted) return 130;
  return childExitCode === 0 ? 1 : childExitCode;
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : "";
if (invokedPath === fileURLToPath(import.meta.url)) {
  main().then((exitCode) => {
    process.exitCode = exitCode;
  }).catch((error) => {
    process.stderr.write(`[career] ${error.message}\n`);
    process.exitCode = 1;
  });
}
