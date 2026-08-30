import { existsSync, readFileSync } from "node:fs";
import { spawn } from "node:child_process";
import { dirname, join, resolve } from "node:path";

const args = process.argv.slice(2);
const mongoFlag = args[0] === "--mongo";
const vitestFilters = mongoFlag ? args.slice(1) : args;
const testEnvironment = { ...process.env };

testEnvironment.TEST_MONGODB_URL ??=
  "mongodb://admin:expresso-admin@127.0.0.1:57017/expresso_test?authSource=admin&replicaSet=rs0";
delete testEnvironment.TEST_DATABASE_URL;
testEnvironment.TEST_REDIS_URL ??= "redis://127.0.0.1:56379";

const testFiles = vitestFilters.length > 0 ? vitestFilters : ["integration.test.ts"];

function pnpmInvocation(pnpmArgs) {
  const npmExecPath = process.env.npm_execpath;
  if (npmExecPath && !npmExecPath.endsWith(".cmd") && !npmExecPath.endsWith(".ps1")) {
    return { command: process.execPath, args: [npmExecPath, ...pnpmArgs] };
  }

  const nodeDirectory = dirname(process.execPath);
  const pathEntries = (process.env.PATH ?? "").split(process.platform === "win32" ? ";" : ":");
  const candidates = [
    join(nodeDirectory, "..", "node_modules", "pnpm", "bin", "pnpm.cjs"),
    join(nodeDirectory, "..", "node_modules", "pnpm", "bin", "pnpm.mjs"),
    ...pathEntries.flatMap((entry) => [
      join(entry, "pnpm.cjs"),
      join(entry, "pnpm.mjs"),
    ]),
  ];
  const commandShims = [
    ...(npmExecPath?.endsWith(".cmd") ? [npmExecPath] : []),
    ...pathEntries.map((entry) => join(entry, "pnpm.cmd")),
  ];
  for (const shim of commandShims) {
    if (!existsSync(shim)) continue;
    const shimText = readFileSync(shim, "utf8");
    const match = shimText.match(/"[^\"]*node(?:\.exe)?"\s+"([^\"]+pnpm\.(?:cjs|mjs))"/i);
    if (match?.[1]) {
      candidates.push(resolve(dirname(shim), match[1].replace(/^%~dp0/i, "")));
    }
  }
  const pnpmScript = candidates.find((candidate) => existsSync(candidate));
  if (pnpmScript) {
    return { command: process.execPath, args: [pnpmScript, ...pnpmArgs] };
  }
  // POSIX의 실행 가능한 shim은 셸 없이 직접 실행할 수 있습니다.
  if (process.platform !== "win32") return { command: "pnpm", args: pnpmArgs };
  throw new Error("pnpm JavaScript entrypoint could not be located");
}

function runPnpm(pnpmArgs) {
  const invocation = pnpmInvocation(pnpmArgs);
  return new Promise((resolve, reject) => {
    const child = spawn(invocation.command, invocation.args, {
      cwd: process.cwd(),
      env: testEnvironment,
      stdio: "inherit",
      shell: false,
    });
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (signal) {
        resolve(1);
      } else {
        resolve(code ?? 1);
      }
    });
  });
}

for (const command of [
  ["--filter", "@expresso/contracts", "build"],
  ["--filter", "@expresso/database", "build"],
  ["--filter", "@expresso/backend", "exec", "vitest", "run", ...testFiles],
]) {
  const exitCode = await runPnpm(command);
  if (exitCode !== 0) process.exit(exitCode);
}
