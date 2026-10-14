#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { constants, readFileSync } from 'node:fs';
import { chmod, lstat, mkdir, open, readFile, readlink, rename, symlink, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';

const environmentKeys = new Set([
  'SPRING_PROFILES_ACTIVE', 'SPRING_BIND_ADDRESS', 'SPRING_PORT', 'MONGODB_URL',
  'MONGODB_DATABASE', 'MONGODB_REPLICA_SET', 'CAREER_WRITER_ENABLED',
  'CAREER_INTEGRATION_ENABLED', 'CAREER_WRITER_MOVE_SECRET',
  'CAREER_INTEGRATION_AI_SECRET', 'CAREER_INTEGRATION_INTERVIEW_SECRET',
]);

// systemd와 함께 읽을 수 있는 단순한 대입만 허용하고 셸로 실행하지 않습니다.
export function parseEnvironment(text) {
  if (text.includes('\uFEFF')) throw new Error('UTF-8 BOM is not supported in env files');
  const result = Object.create(null);
  for (const [index, source] of text.split(/\r?\n/).entries()) {
    const line = source.trim();
    if (!line || line.startsWith('#')) continue;
    const match = /^([A-Z][A-Z0-9_]*)=(.*)$/.exec(line);
    if (!match) throw new Error(`Invalid env assignment at line ${index + 1}`);
    const [, key, raw] = match;
    if (Object.hasOwn(result, key)) throw new Error(`Duplicate env key ${key}`);
    let value = raw;
    if (raw.startsWith('"') || raw.startsWith("'")) {
      const quote = raw[0];
      if (!raw.endsWith(quote) || raw.length < 2) throw new Error(`Invalid env quoting for ${key}`);
      value = raw.slice(1, -1);
      if (value.includes(quote)) throw new Error(`Invalid env quoting for ${key}`);
    } else if (/[\s'"\\]/.test(value)) {
      throw new Error(`Use a whole quoted env value for ${key}`);
    }
    if (/[\\\x00-\x1f\x7f]/.test(value)) throw new Error(`Unsupported env characters for ${key}`);
    result[key] = value;
  }
  return result;
}

function required(value, name) {
  if (typeof value !== 'string' || !value) throw new Error(`${name} is required`);
  return value;
}

function boundedInteger(value, name, minimum, maximum) {
  const text = String(value ?? '');
  if (!/^\d+$/.test(text)) throw new Error(`${name} must be an integer in ${minimum}..${maximum}`);
  const number = Number(text);
  if (!Number.isSafeInteger(number) || number < minimum || number > maximum) throw new Error(`${name} must be an integer in ${minimum}..${maximum}`);
  return number;
}

function loopback(value, name) {
  if (value !== '127.0.0.1' && value !== '::1') throw new Error(`${name} must be 127.0.0.1 or ::1`);
  return value;
}

export function validateEnvironment(env) {
  for (const key of Object.keys(env)) if (!environmentKeys.has(key)) throw new Error(`Unsupported Spring runtime env key ${key}`);
  if (env.SPRING_PROFILES_ACTIVE !== 'operations') throw new Error('SPRING_PROFILES_ACTIVE must be operations');
  const bindAddress = loopback(env.SPRING_BIND_ADDRESS ?? '127.0.0.1', 'SPRING_BIND_ADDRESS');
  const port = boundedInteger(env.SPRING_PORT, 'SPRING_PORT', 1, 65535);
  const database = required(env.MONGODB_DATABASE, 'MONGODB_DATABASE');
  if (/[ /\\."$\x00]/.test(database) || !database.trim() || Buffer.byteLength(database, 'utf8') > 63) throw new Error('MONGODB_DATABASE must be a valid name of at most 63 UTF-8 bytes');
  const replicaSet = env.MONGODB_REPLICA_SET ?? 'rs0';
  if (!/^[A-Za-z0-9_.-]+$/.test(replicaSet)) throw new Error('MONGODB_REPLICA_SET contains unsupported characters');
  let mongo;
  try {
    const uri = required(env.MONGODB_URL, 'MONGODB_URL');
    const match = /^(mongodb(?:\+srv)?):\/\/([^/?#]+)(\/[^?#]*)?(?:\?([^#]*))?$/.exec(uri);
    if (!match || /\s/.test(uri)) throw new Error();
    const [, scheme, authority, databasePath = '/', query = ''] = match;
    const authParts = authority.split('@');
    if (authParts.length > 2) throw new Error();
    if (authParts.length === 2) decodeURIComponent(authParts[0]);
    const seeds = authParts.at(-1).split(',');
    if (scheme === 'mongodb+srv' && (seeds.length !== 1 || /:\d+$/.test(seeds[0]))) throw new Error();
    for (const seed of seeds) {
      const host = new URL(`http://${seed}`);
      if (!seed || !host.hostname || host.username || host.password || host.pathname !== '/' || host.search || host.hash || host.port === '0') throw new Error();
    }
    mongo = { database: decodeURIComponent(databasePath.slice(1)), query: new URLSearchParams(query) };
  } catch { throw new Error('MONGODB_URL must be a valid MongoDB URI'); }
  if (mongo.query.getAll('replicaSet').length !== 1 || mongo.query.get('replicaSet') !== replicaSet) throw new Error('MONGODB_URL must name the configured replicaSet');
  if (mongo.database && mongo.database !== database) throw new Error('Mongo URI database must match MONGODB_DATABASE');
  for (const key of ['CAREER_WRITER_ENABLED', 'CAREER_INTEGRATION_ENABLED']) {
    if ((env[key] ?? 'false') !== 'false') throw new Error(`${key} must be false for this deployment preparation`);
  }
  return { bindAddress, port, writerEnabled: false, integrationEnabled: false };
}

function absolute(value, name) {
  required(value, name);
  if (!path.isAbsolute(value) || value.split(/[\\/]/).includes('..')) throw new Error(`${name} must be an absolute path without traversal`);
  return path.normalize(value);
}

// 유닛 파일의 %·$ 확장과 줄 삽입을 막기 위해 서버 경로의 문자를 제한합니다.
function unitPath(value, name) {
  required(value, name);
  if (!/^\/[A-Za-z0-9_./-]+$/.test(value) || value.split('/').some(segment => segment === '..' || segment === '.')) throw new Error(`${name} must be a simple absolute Linux path`);
  const normalized = path.posix.normalize(value);
  if (normalized === '/') throw new Error(`${name} cannot be the filesystem root`);
  return normalized.replace(/\/$/, '');
}

export function renderUnit(values) {
  const java = unitPath(values.java, 'java');
  const releaseRoot = unitPath(values.releaseRoot, 'releaseRoot');
  const envFile = unitPath(values.envFile, 'envFile');
  const serviceUser = required(values.serviceUser, 'serviceUser');
  if (!/^[a-z_][a-z0-9_-]{0,31}$/.test(serviceUser) || serviceUser === 'root') throw new Error('serviceUser must be an unprivileged Linux account');
  const serviceName = required(values.serviceName, 'serviceName');
  if (!/^[a-z][a-z0-9-]{0,63}$/.test(serviceName) || ['expresso-api', 'expresso-web', 'expresso-worker'].includes(serviceName)) throw new Error('serviceName must be a separate simple unit name without .service');
  const template = readFileSync(new URL('../../infra/systemd/expresso-career-spring.service.template', import.meta.url), 'utf8');
  const parameters = { JAVA: java, RELEASE_ROOT: releaseRoot, ENV_FILE: envFile, SERVICE_USER: serviceUser, SERVICE_NAME: serviceName };
  return template.replace(/@@([A-Z_]+)@@/g, (_, key) => parameters[key]);
}

async function directoryWithoutSymlinks(value, name) {
  const normalized = absolute(value, name);
  if (normalized === path.parse(normalized).root) throw new Error(`${name} cannot be the filesystem root`);
  const parsed = path.parse(normalized);
  let current = parsed.root;
  for (const component of normalized.slice(parsed.root.length).split(path.sep).filter(Boolean)) {
    current = path.join(current, component);
    const info = await lstat(current);
    if (info.isSymbolicLink()) throw new Error(`${name} cannot contain symlink directories`);
    if (!info.isDirectory()) throw new Error(`${name} must be a directory`);
  }
  return normalized;
}

async function regularFile(value, name) {
  const normalized = absolute(value, name);
  await directoryWithoutSymlinks(path.dirname(normalized), name + ' parent');
  const info = await lstat(normalized);
  if (info.isSymbolicLink()) throw new Error(`${name} cannot be a symlink`);
  if (!info.isFile()) throw new Error(`${name} must be a regular file`);
  return { normalized, info };
}

export async function validateJava21(java) {
  const executable = absolute(java, 'java');
  return new Promise((resolve, reject) => {
    const child = spawn(executable, ['-version'], { shell: false, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let output = '';
    let excessive = false;
    const timer = setTimeout(() => { child.kill(); reject(new Error('Java 21 version probe timed out')); }, 5000);
    const collect = chunk => {
      output += chunk.toString();
      if (output.length > 16384) { excessive = true; child.kill(); }
    };
    child.stdout.on('data', collect);
    child.stderr.on('data', collect);
    child.on('error', () => { clearTimeout(timer); reject(new Error('Cannot execute configured Java 21 binary')); });
    child.on('close', code => {
      clearTimeout(timer);
      if (code !== 0 || excessive || !/(?:openjdk|java) version "21(?:[.\-+"])/.test(output)) reject(new Error('Configured executable must be Java 21'));
      else resolve({ javaMajor: 21 });
    });
  });
}

function releaseVersion(value) {
  required(value, 'version');
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/.test(value) || value.includes('..')) throw new Error('version must be a simple release identifier');
  return value;
}

async function openRegularFile(file, name) {
  await regularFile(file, name);
  const handle = await open(file, constants.O_RDONLY | (constants.O_NOFOLLOW || 0));
  if (!(await handle.stat()).isFile()) { await handle.close(); throw new Error(`${name} must be a regular file`); }
  return handle;
}

async function hashHandle(handle) {
  const hash = createHash('sha256');
  const stream = handle.createReadStream({ autoClose: false, start: 0 });
  for await (const chunk of stream) hash.update(chunk);
  return hash.digest('hex');
}

export async function stageRelease({ releaseRoot, version, jar, sha256 }) {
  const root = await directoryWithoutSymlinks(releaseRoot, 'releaseRoot');
  releaseVersion(version);
  if (!/^[a-fA-F0-9]{64}$/.test(sha256 || '')) throw new Error('sha256 must be an explicit SHA256 digest');
  const input = await openRegularFile(absolute(jar, 'jar'), 'jar');
  try {
    const header = Buffer.alloc(4);
    await input.read(header, 0, 4, 0);
    if (!header.equals(Buffer.from([0x50, 0x4b, 0x03, 0x04]))) throw new Error('jar must have a JAR archive header');
    const digest = await hashHandle(input);
    if (digest !== sha256.toLowerCase()) throw new Error('JAR SHA256 does not match the supplied digest');
    const releases = path.join(root, 'releases');
    try {
      await mkdir(releases, { mode: 0o755 });
      await chmod(releases, 0o755);
    } catch (error) { if (error.code !== 'EEXIST') throw error; }
    await directoryWithoutSymlinks(releases, 'releases');
    const target = path.join(releases, version);
    await mkdir(target, { mode: 0o755 }).catch(error => {
      if (error.code === 'EEXIST') throw new Error('Release version already exists; choose a new version');
      throw error;
    });
    // 배포자가 고른 버전은 덮어쓰지 않습니다. 실패한 부분 릴리스도 자동 삭제하지 않습니다.
    const destination = await open(path.join(target, 'backend-spring.jar'), 'wx', 0o644);
    try {
      const stream = input.createReadStream({ autoClose: false, start: 0 });
      let offset = 0;
      for await (const chunk of stream) {
        let written = 0;
        while (written < chunk.length) {
          const result = await destination.write(chunk, written, chunk.length - written, offset + written);
          written += result.bytesWritten;
        }
        offset += chunk.length;
      }
      await destination.sync();
    } finally { await destination.close(); }
    const copied = await openRegularFile(path.join(target, 'backend-spring.jar'), 'staged jar');
    try { if (await hashHandle(copied) !== digest) throw new Error('Staged JAR SHA256 verification failed'); }
    finally { await copied.close(); }
    await writeFile(path.join(target, 'backend-spring.jar.sha256'), `${digest}  backend-spring.jar\n`, { flag: 'wx', mode: 0o444 });
    await chmod(path.join(target, 'backend-spring.jar.sha256'), 0o444);
    await chmod(path.join(target, 'backend-spring.jar'), 0o444);
    await chmod(target, 0o555);
    return { version, sha256: digest };
  } finally { await input.close(); }
}

async function verifyRelease(root, version) {
  const target = await directoryWithoutSymlinks(path.join(root, 'releases', releaseVersion(version)), 'release');
  const manifest = path.join(target, 'backend-spring.jar.sha256');
  await regularFile(manifest, 'SHA256 manifest');
  const recorded = await readFile(manifest, 'utf8');
  const match = /^([a-f0-9]{64})  backend-spring\.jar\n$/.exec(recorded);
  if (!match) throw new Error('Invalid release SHA256 manifest');
  const jar = await openRegularFile(path.join(target, 'backend-spring.jar'), 'release jar');
  try { if (await hashHandle(jar) !== match[1]) throw new Error('Release JAR SHA256 verification failed'); }
  finally { await jar.close(); }
}

async function verifyCurrentReleasePaths(root, version) {
  const target = await directoryWithoutSymlinks(path.join(root, 'releases', releaseVersion(version)), 'current release');
  for (const name of ['backend-spring.jar', 'backend-spring.jar.sha256']) {
    try { await regularFile(path.join(target, name), `current ${name}`); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
}

// 서비스 재시작은 사람이 수행합니다. 이 명령은 검증된 current 링크만 원자적으로 바꿉니다.
async function replaceCurrentRelease({ releaseRoot, version }, rollback) {
  if (process.platform !== 'linux') throw new Error(rollback ? 'rollback requires Linux POSIX atomic symlink replacement' : 'select requires Linux POSIX atomic symlink replacement');
  const root = await directoryWithoutSymlinks(releaseRoot, 'releaseRoot');
  await verifyRelease(root, version);
  const current = path.join(root, 'current');
  let previousVersion = null;
  let currentInfo;
  try { currentInfo = await lstat(current); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  if (currentInfo) {
    if (!currentInfo.isSymbolicLink()) throw new Error('current must be a release symlink');
    const previous = await readlink(current);
    const match = /^releases\/([A-Za-z0-9][A-Za-z0-9._-]{0,79})$/.exec(previous);
    if (!match) throw new Error('current must be a relative release symlink');
    previousVersion = releaseVersion(match[1]);
    if (rollback) await verifyCurrentReleasePaths(root, previousVersion);
    else await verifyRelease(root, previousVersion);
  }
  const temporary = path.join(root, `.current-${randomUUID()}`);
  try {
    await symlink(`releases/${version}`, temporary);
    await rename(temporary, current);
  } finally { await unlink(temporary).catch(error => { if (error.code !== 'ENOENT') throw error; }); }
  return { version, previousVersion };
}

export async function selectRelease(values) {
  return replaceCurrentRelease(values, false);
}

// 명시적인 rollback만 손상된 current에서 빠져나옵니다. 대상은 항상 SHA256을 검증합니다.
export async function rollbackRelease(values) {
  return replaceCurrentRelease(values, true);
}

export async function waitForReady({ port, bindAddress = '127.0.0.1', timeoutMs = 60000, intervalMs = 1000 }) {
  const number = boundedInteger(port, 'port', 1, 65535);
  const bind = loopback(bindAddress, 'bindAddress');
  const timeout = boundedInteger(timeoutMs, 'timeoutMs', 50, 300000);
  const interval = boundedInteger(intervalMs, 'intervalMs', 50, 10000);
  const deadline = performance.now() + timeout;
  const hostname = bind === '::1' ? '[::1]' : bind;
  while (performance.now() < deadline) {
    try {
      const response = await fetch(`http://${hostname}:${number}/health/ready`, { redirect: 'error', signal: AbortSignal.timeout(Math.max(1, Math.ceil(deadline - performance.now()))) });
      const body = await response.text();
      if (response.status === 200 && body.length <= 8192) {
        const status = JSON.parse(body);
        if (status.status === 'ready' && status.checks?.mongodb === 'up') return { status: 'ready' };
      }
    } catch { /* 준비 실패의 응답 본문과 내부 오류를 운영 로그에 남기지 않습니다. */ }
    const remaining = deadline - performance.now();
    if (remaining > 0) await delay(Math.min(interval, remaining));
  }
  throw new Error('Spring readiness timeout');
}

const usage = `Usage: node scripts/operations/spring-runtime.mjs <command> [options]
  render-unit --java /absolute/java --release-root /absolute/releases --env-file /absolute/runtime.env
              --service-user <unprivileged-user> --service-name <separate-unit-name> [--output /absolute/unit]
  validate --java /absolute/java --env-file /absolute/runtime.env
  stage --release-root /absolute/releases --version <new-version> --jar /absolute/built.jar --sha256 <digest>
  select --release-root /absolute/releases --version <staged-version>
  rollback --release-root /absolute/releases --version <verified-prior-version>
  ready --port <explicit-port> [--bind-address 127.0.0.1|::1] [--timeout-ms 60000] [--interval-ms 1000]

The release root must already exist. stage never overwrites a version.
select and rollback change only current on Linux and report previousVersion.
rollback verifies its target while allowing damaged current artifacts; path and symlink checks remain.
Restart the explicitly chosen systemd service manually, then run ready.
Writer/integration must remain false. No shell, Git, migrations or service actions are executed.
`;

function options(args, allowed) {
  const parsed = {};
  for (let index = 0; index < args.length; index += 2) {
    const flag = args[index];
    if (!allowed.has(flag) || Object.hasOwn(parsed, flag) || !args[index + 1] || args[index + 1].startsWith('--')) throw new Error('Unknown, duplicate or missing CLI option');
    parsed[flag] = args[index + 1];
  }
  return parsed;
}

async function main(args) {
  const [command, ...rest] = args;
  if (command === '--help' || command === 'help') { process.stdout.write(usage); return; }
  const flags = {
    'render-unit': ['--java', '--release-root', '--env-file', '--service-user', '--service-name', '--output'],
    validate: ['--java', '--env-file'], stage: ['--release-root', '--version', '--jar', '--sha256'],
    select: ['--release-root', '--version'], rollback: ['--release-root', '--version'], ready: ['--port', '--bind-address', '--timeout-ms', '--interval-ms'],
  };
  if (!Object.hasOwn(flags, command)) throw new Error('Choose render-unit, validate, stage, select, rollback or ready; use --help');
  const values = options(rest, new Set(flags[command]));
  const releaseRoot = values['--release-root'];
  let result;
  if (command === 'render-unit') {
    const unit = renderUnit({ java: values['--java'], releaseRoot, envFile: values['--env-file'], serviceUser: values['--service-user'], serviceName: values['--service-name'] });
    if (values['--output']) {
      const output = absolute(values['--output'], 'output');
      await writeFile(output, unit, { flag: 'wx', mode: 0o644 });
      result = { unit: 'rendered' };
    } else { process.stdout.write(unit); return; }
  } else if (command === 'validate') {
    const env = await regularFile(values['--env-file'], 'envFile');
    if (process.platform !== 'win32' && (env.info.mode & 0o077) !== 0) throw new Error('envFile must not be group/world accessible (use 0600)');
    const config = validateEnvironment(parseEnvironment(await readFile(env.normalized, 'utf8')));
    result = { status: 'valid', ...config, ...await validateJava21(values['--java']) };
  } else if (command === 'stage') {
    result = await stageRelease({ releaseRoot, version: values['--version'], jar: values['--jar'], sha256: values['--sha256'] });
  } else if (command === 'select') {
    result = await selectRelease({ releaseRoot, version: values['--version'] });
  } else if (command === 'rollback') {
    result = await rollbackRelease({ releaseRoot, version: values['--version'] });
  } else {
    result = await waitForReady({ port: values['--port'], bindAddress: values['--bind-address'], timeoutMs: values['--timeout-ms'], intervalMs: values['--interval-ms'] });
  }
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).catch(error => {
    // 운영자의 설정값과 서버 오류 원문을 출력하지 않습니다.
    const safe = error instanceof Error && !error.code ? error.message : 'Operation failed; verify explicit paths and permissions';
    process.stderr.write(`${safe}\n`);
    process.exitCode = 1;
  });
}
