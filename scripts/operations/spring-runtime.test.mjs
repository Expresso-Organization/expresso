import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { chmod, lstat, mkdtemp, mkdir, readFile, readdir, readlink, rm, symlink, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const toolPath = fileURLToPath(new URL('./spring-runtime.mjs', import.meta.url));
const runtime = await import('./spring-runtime.mjs');
const envText = `SPRING_PROFILES_ACTIVE=operations\nSPRING_PORT=18081\nMONGODB_URL=mongodb://runtime:private-value@127.0.0.1:57017/expresso?authSource=admin&replicaSet=rs0\nMONGODB_DATABASE=expresso\n`;
const artifact = Buffer.from('PK\x03\x04test-built-jar');
const digest = createHash('sha256').update(artifact).digest('hex');

async function workspace(t) {
  const root = await mkdtemp(path.join(tmpdir(), 'expresso-spring-runtime-'));
  t.after(async () => {
    // 읽기 전용 릴리스도 테스트가 만든 자리에서만 정리합니다.
    const releaseRoot = path.join(root, 'releases');
    for (const version of ['first', 'second', 'broken']) await chmod(path.join(releaseRoot, version), 0o755).catch(() => {});
    await rm(root, { recursive: true, force: true });
  });
  return root;
}

function feature(name) {
  assert.equal(typeof runtime[name], 'function', `${name} behavior is not implemented`);
  return runtime[name];
}

async function cli(args) {
  const process = spawn(globalThis.process.execPath, [toolPath, ...args], { stdio: ['ignore', 'pipe', 'pipe'] });
  let stdout = '';
  let stderr = '';
  process.stdout.setEncoding('utf8').on('data', value => { stdout += value; });
  process.stderr.setEncoding('utf8').on('data', value => { stderr += value; });
  const [code] = await once(process, 'close');
  return { code, stdout, stderr };
}

test('environment validation defaults to loopback and disabled preparation', () => {
  const parse = feature('parseEnvironment');
  const validate = feature('validateEnvironment');
  const config = validate(parse(envText));
  assert.deepEqual(config, { bindAddress: '127.0.0.1', port: 18081, writerEnabled: false, integrationEnabled: false });
  assert.throws(() => validate(parse(envText.replace('18081', '0'))), /SPRING_PORT/);
  assert.throws(() => validate(parse(`${envText}SPRING_BIND_ADDRESS=0.0.0.0\n`)), /SPRING_BIND_ADDRESS/);
  assert.throws(() => validate(parse(envText.replace('&replicaSet=rs0', ''))), /MONGODB_URL/);
  assert.throws(() => validate(parse(`${envText}MONGODB_MIGRATE_URL=do-not-print\n`)), /MONGODB_MIGRATE_URL/);
});

test('env files remain data and reject ambiguous or duplicate assignments without exposing values', () => {
  const parse = feature('parseEnvironment');
  const parsed = parse(`${envText}CAREER_WRITER_MOVE_SECRET='literal $(touch forbidden) value'\n`);
  assert.equal(parsed.CAREER_WRITER_MOVE_SECRET, 'literal $(touch forbidden) value');
  assert.throws(() => parse(`${envText}SPRING_PORT=18082\n`), /duplicate.*SPRING_PORT/i);
  assert.throws(() => parse('SECRET=do-not-print\\escaped\n'), error => !error.message.includes('do-not-print'));
  assert.throws(() => parse('export SECRET=do-not-print\n'), error => !error.message.includes('do-not-print'));
});

test('deployment validation rejects incomplete activation and honors a configured replica set', () => {
  const parse = feature('parseEnvironment');
  const validate = feature('validateEnvironment');
  assert.throws(() => validate(parse(`${envText}CAREER_WRITER_ENABLED=true\n`)), /CAREER_WRITER_MOVE_SECRET/i);
  assert.throws(() => validate(parse(`${envText}CAREER_INTEGRATION_ENABLED=true\n`)), /require CAREER_WRITER_ENABLED/i);
  assert.doesNotThrow(() => validate(parse(`${envText.replace('replicaSet=rs0', 'replicaSet=rs_custom')}MONGODB_REPLICA_SET=rs_custom\n`)));
  assert.throws(() => validate(parse(`${envText}MONGODB_REPLICA_SET=rs_custom\n`)), /replicaSet/i);
});
test('unit rendering requires operator values and cannot inject systemd expansion or an existing service', () => {
  const render = feature('renderUnit');
  const values = { java: '/opt/java21/bin/java', releaseRoot: '/srv/spring-releases', envFile: '/etc/expresso/spring.env', serviceUser: 'spring_runtime', serviceName: 'career-runtime' };
  const unit = render(values);
  const directives = Object.fromEntries(unit.split('\n').filter(line => line.includes('=')).map(line => line.split(/=(.*)/s).slice(0, 2)));
  assert.equal(directives.ExecStart, '/opt/java21/bin/java -jar /srv/spring-releases/current/backend-spring.jar --spring.profiles.active=operations');
  assert.equal(directives.EnvironmentFile, '/etc/expresso/spring.env');
  assert.equal(directives.User, 'spring_runtime');
  assert.equal(directives.ProtectHome, 'read-only');
  assert.equal(directives.ProtectSystem, 'strict');
  assert.equal(directives.Environment, undefined);
  for (const value of ['/srv/%n', '/srv/$HOME', '/srv/../other', '/srv/with\nUser=root']) assert.throws(() => render({ ...values, releaseRoot: value }), /releaseRoot/);
  assert.throws(() => render({ ...values, serviceUser: 'root' }), /serviceUser/);
  assert.throws(() => render({ ...values, serviceName: 'expresso-api' }), /serviceName/);
  assert.throws(() => render({ ...values, java: undefined }), /java/);
});

test('staging verifies supplied digest, preserves source and refuses release overwrite', async t => {
  const stage = feature('stageRelease');
  const root = await workspace(t);
  const jar = path.join(root, 'input.jar');
  await writeFile(jar, artifact);
  assert.deepEqual(await stage({ releaseRoot: root, version: 'first', jar, sha256: digest }), { version: 'first', sha256: digest });
  assert.deepEqual(await readFile(path.join(root, 'releases', 'first', 'backend-spring.jar')), artifact);
  assert.equal(await readFile(path.join(root, 'releases', 'first', 'backend-spring.jar.sha256'), 'utf8'), `${digest}  backend-spring.jar\n`);
  assert.deepEqual(await readFile(jar), artifact);
  await assert.rejects(stage({ releaseRoot: root, version: 'first', jar, sha256: digest }), /already exists/i);
  await assert.rejects(stage({ releaseRoot: root, version: '../escape', jar, sha256: digest }), /version/);
  await assert.rejects(stage({ releaseRoot: root, version: 'broken', jar, sha256: '0'.repeat(64) }), /SHA256/);
  await assert.rejects(lstat(path.join(root, 'releases', 'broken')), { code: 'ENOENT' });
  if (process.platform !== 'win32') assert.equal((await lstat(path.join(root, 'releases', 'first', 'backend-spring.jar'))).mode & 0o777, 0o444);
});

test('staging refuses a symlinked release root or source', async t => {
  const stage = feature('stageRelease');
  const root = await workspace(t);
  const real = path.join(root, 'real');
  const alias = path.join(root, 'alias');
  await mkdir(real);
  await symlink(real, alias, process.platform === 'win32' ? 'junction' : 'dir');
  const jar = path.join(root, 'input.jar');
  await writeFile(jar, artifact);
  await assert.rejects(stage({ releaseRoot: alias, version: 'first', jar, sha256: digest }), /symlink/i);
  if (process.platform !== 'win32') {
    const linkedJar = path.join(root, 'linked.jar');
    await symlink(jar, linkedJar);
    await assert.rejects(stage({ releaseRoot: real, version: 'first', jar: linkedJar, sha256: digest }), /symlink/i);
  }
});

test('selection atomically points current to a verified release and reports prior release for rollback', { skip: process.platform !== 'linux' && 'POSIX symlink replacement requires Linux' }, async t => {
  const stage = feature('stageRelease');
  const select = feature('selectRelease');
  const root = await workspace(t);
  const jar = path.join(root, 'input.jar');
  await writeFile(jar, artifact);
  for (const version of ['first', 'second']) await stage({ releaseRoot: root, version, jar, sha256: digest });
  assert.deepEqual(await select({ releaseRoot: root, version: 'first' }), { version: 'first', previousVersion: null });
  assert.equal(await readlink(path.join(root, 'current')), 'releases/first');
  assert.deepEqual(await select({ releaseRoot: root, version: 'second' }), { version: 'second', previousVersion: 'first' });
  assert.equal(await readFile(path.join(root, 'releases', 'first', 'backend-spring.jar.sha256'), 'utf8'), `${digest}  backend-spring.jar\n`);
  assert.deepEqual(await select({ releaseRoot: root, version: 'first' }), { version: 'first', previousVersion: 'second' });
  await rm(path.join(root, 'current'));
  await mkdir(path.join(root, 'current'));
  await assert.rejects(select({ releaseRoot: root, version: 'second' }), /current.*symlink/i);
});

test('selection refuses a modified staged artifact before replacing current', { skip: process.platform !== 'linux' && 'POSIX symlink replacement requires Linux' }, async t => {
  const stage = feature('stageRelease');
  const select = feature('selectRelease');
  const root = await workspace(t);
  const jar = path.join(root, 'input.jar');
  await writeFile(jar, artifact);
  for (const version of ['first', 'second']) await stage({ releaseRoot: root, version, jar, sha256: digest });
  await select({ releaseRoot: root, version: 'first' });
  const target = path.join(root, 'releases', 'second', 'backend-spring.jar');
  await chmod(target, 0o644);
  await writeFile(target, Buffer.from('PK\x03\x04modified'));
  await assert.rejects(select({ releaseRoot: root, version: 'second' }), /SHA256/);
  assert.equal(await readlink(path.join(root, 'current')), 'releases/first');
});

test('readiness polls actual HTTP until MongoDB reports ready', async t => {
  const ready = feature('waitForReady');
  let requests = 0;
  const server = createServer((request, response) => {
    assert.equal(request.url, '/health/ready');
    requests++;
    response.writeHead(requests === 1 ? 503 : 200, { 'content-type': 'application/json' });
    response.end(JSON.stringify(requests === 1 ? { status: 'not_ready', checks: { mongodb: 'down' } } : { status: 'ready', checks: { mongodb: 'up' } }));
  }).listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise(resolve => server.close(resolve)));
  assert.deepEqual(await ready({ port: server.address().port, timeoutMs: 1000, intervalMs: 50 }), { status: 'ready' });
  assert.equal(requests, 2);
});

test('readiness rejects unrelated success responses and times out without disclosing server data', async t => {
  const ready = feature('waitForReady');
  const server = createServer((_, response) => {
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ status: 'ready', secret: 'do-not-print' }));
  }).listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise(resolve => server.close(resolve)));
  await assert.rejects(ready({ port: server.address().port, timeoutMs: 100, intervalMs: 50 }), error => /timeout/i.test(error.message) && !error.message.includes('do-not-print'));
  await assert.rejects(ready({ port: 80, bindAddress: 'example.com', timeoutMs: 100, intervalMs: 50 }), /bindAddress/);
});

test('CLI stages the artifact and rejects missing operator parameters', async t => {
  const root = await workspace(t);
  const jar = path.join(root, 'input.jar');
  await writeFile(jar, artifact);
  const result = await cli(['stage', '--release-root', root, '--version', 'first', '--jar', jar, '--sha256', digest]);
  assert.equal(result.code, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout), { version: 'first', sha256: digest });
  const invalid = await cli(['render-unit', '--service-user', 'root']);
  assert.notEqual(invalid.code, 0);
  assert.match(invalid.stderr, /java/);
  const help = await cli(['--help']);
  assert.equal(help.code, 0, help.stderr);
  assert.match(help.stdout, /select/);
});

test('Java validation executes the configured binary and rejects a non-Java executable', async () => {
  const validateJava = feature('validateJava21');
  await assert.rejects(validateJava(process.execPath), /Java 21/);
  await assert.rejects(validateJava('java'), /absolute/i);
});


test('selection rejects a dangling current release instead of losing rollback history', { skip: process.platform !== 'linux' && 'POSIX symlink replacement requires Linux' }, async t => {
  const stage = feature('stageRelease');
  const select = feature('selectRelease');
  const root = await workspace(t);
  const jar = path.join(root, 'input.jar');
  await writeFile(jar, artifact);
  await stage({ releaseRoot: root, version: 'first', jar, sha256: digest });
  await symlink('releases/missing', path.join(root, 'current'));
  await assert.rejects(select({ releaseRoot: root, version: 'first' }));
  assert.equal(await readlink(path.join(root, 'current')), 'releases/missing');
});

test('unit output never replaces an existing operator file', async t => {
  const root = await workspace(t);
  const output = path.join(root, 'unit.service');
  await writeFile(output, 'operator-owned-content');
  const args = ['render-unit', '--java', '/opt/java21/bin/java', '--release-root', '/srv/releases', '--env-file', '/etc/runtime.env', '--service-user', 'career', '--service-name', 'career-runtime', '--output', output];
  const result = await cli(args);
  assert.notEqual(result.code, 0);
  assert.equal(await readFile(output, 'utf8'), 'operator-owned-content');
});

test('staged artifacts stay readable to the service under a restrictive operator umask', { skip: process.platform === 'win32' && 'POSIX mode bits require Linux' }, async t => {
  const stage = feature('stageRelease');
  const root = await workspace(t);
  const jar = path.join(root, 'input.jar');
  await writeFile(jar, artifact);
  const prior = process.umask(0o077);
  try { await stage({ releaseRoot: root, version: 'first', jar, sha256: digest }); }
  finally { process.umask(prior); }
  assert.equal((await lstat(path.join(root, 'releases'))).mode & 0o777, 0o755);
  assert.equal((await lstat(path.join(root, 'releases', 'first', 'backend-spring.jar.sha256'))).mode & 0o777, 0o444);
});

test('staging refuses a source whose parent directory is a symlink', async t => {
  const stage = feature('stageRelease');
  const root = await workspace(t);
  const real = path.join(root, 'real');
  const alias = path.join(root, 'alias');
  await mkdir(real);
  await symlink(real, alias, process.platform === 'win32' ? 'junction' : 'dir');
  await writeFile(path.join(real, 'input.jar'), artifact);
  await assert.rejects(stage({ releaseRoot: root, version: 'first', jar: path.join(alias, 'input.jar'), sha256: digest }), /symlink/i);
});

test('CLI rejects unsupported env assignments without disclosing credentials', async t => {
  const root = await workspace(t);
  const envFile = path.join(root, 'runtime.env');
  await writeFile(envFile, `${envText}MONGODB_MIGRATE_URL=super-private-credential\n`, { mode: 0o600 });
  const result = await cli(['validate', '--java', process.execPath, '--env-file', envFile]);
  assert.notEqual(result.code, 0);
  assert.match(result.stderr, /MONGODB_MIGRATE_URL/);
  assert.equal(result.stdout.includes('private-value'), false);
  assert.equal(result.stderr.includes('super-private-credential'), false);
});

test('Mongo validation accepts multi-host URIs with matching dotted replica names', () => {
  const parse = feature('parseEnvironment');
  const validate = feature('validateEnvironment');
  const multi = envText.replace('127.0.0.1:57017', 'mongo-a:27017,mongo-b:27018').replace('replicaSet=rs0', 'replicaSet=rs.prod-1') + 'MONGODB_REPLICA_SET=rs.prod-1\n';
  assert.doesNotThrow(() => validate(parse(multi)));
});

test('Mongo validation accepts a matching UTF-8 database', () => {
  const parse = feature('parseEnvironment');
  const validate = feature('validateEnvironment');
  const unicode = envText.replace('/expresso?', '/%ED%8F%AC%ED%8A%B8%ED%8F%B4%EB%A6%AC%EC%98%A4?').replace('MONGODB_DATABASE=expresso', 'MONGODB_DATABASE=포트폴리오');
  assert.doesNotThrow(() => validate(parse(unicode)));
});

test('Mongo validation enforces the database 63-byte limit', () => {
  const parse = feature('parseEnvironment');
  const validate = feature('validateEnvironment');
  assert.throws(() => validate(parse(envText.replace('MONGODB_DATABASE=expresso', `MONGODB_DATABASE=${'a'.repeat(64)}`))), /MONGODB_DATABASE/);
});

test('Mongo validation rejects a URI database that disagrees with runtime database', () => {
  const parse = feature('parseEnvironment');
  const validate = feature('validateEnvironment');
  assert.throws(() => validate(parse(envText.replace('/expresso?', '/other?'))), /database.*match/i);
});

test('Mongo validation rejects a malformed seed port without printing the URI', () => {
  const parse = feature('parseEnvironment');
  const validate = feature('validateEnvironment');
  assert.throws(() => validate(parse(envText.replace('57017', '70000'))), error => /MONGODB_URL/.test(error.message) && !error.message.includes('private-value'));
});



test('readiness accepts a healthy response taking more than one second within the overall timeout', async t => {
  const ready = feature('waitForReady');
  let requests = 0;
  const server = createServer((_, response) => {
    requests++;
    setTimeout(() => {
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ status: 'ready', checks: { mongodb: 'up' } }));
    }, 1100);
  }).listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise(resolve => server.close(resolve)));
  assert.deepEqual(await ready({ port: server.address().port, timeoutMs: 3000, intervalMs: 50 }), { status: 'ready' });
  assert.equal(requests, 1);
});

for (const key of ['SPRING_BIND_ADDRESS', 'MONGODB_REPLICA_SET', 'CAREER_WRITER_ENABLED', 'CAREER_INTEGRATION_ENABLED']) {
  test(`runtime env rejects present empty ${key} instead of applying an absent-value default`, () => {
    const parse = feature('parseEnvironment');
    const validate = feature('validateEnvironment');
    assert.doesNotThrow(() => validate(parse(envText)));
    assert.throws(() => validate(parse(`${envText}${key}=\n`)), new RegExp(key));
  });
}

test('readiness limits a hanging HTTP request to the remaining total timeout', { timeout: 1500 }, async t => {
  const ready = feature('waitForReady');
  const server = createServer(() => {}).listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => {
    server.closeAllConnections();
    return new Promise(resolve => server.close(resolve));
  });
  await assert.rejects(ready({ port: server.address().port, timeoutMs: 100, intervalMs: 50 }), /timeout/i);
});


function bomEnvCases(contents) {
  return [
    ['first line', `\uFEFF${contents}`],
    ['second line', contents.replace('\n', '\n\uFEFF')],
    ['after whitespace', contents.replace('\n', '\n \t\uFEFF')],
    ['before a credential assignment', contents.replace('MONGODB_URL=', '\uFEFFMONGODB_URL=')],
    ['inside a variable name', contents.replace('MONGODB_URL', 'MONGO\uFEFFDB_URL')],
    ['inside an unquoted value', contents.replace('bom-public-password', 'bom-public\uFEFF-password')],
    ['inside a quoted value', contents.replace('bom-public-move-secret-fixture', '"bom-public\uFEFF-move-secret-fixture"')],
    ['after a value', `${contents.trimEnd()}\uFEFF\n`],
    ['inside a comment', `${contents}# public\uFEFF-fixture\n`],
  ];
}

test('CLI rejects BOM anywhere in an env file without disclosure or changing existing files', async t => {
  const root = await workspace(t);
  const envFile = path.join(root, 'runtime.env');
  const installedEnv = path.join(root, 'installed.env');
  const uri = 'mongodb://runtime:bom-public-password@127.0.0.1:57017/expresso?authSource=admin&replicaSet=rs0';
  const moveSecret = 'bom-public-move-secret-fixture';
  const aiSecret = 'bom-public-ai-secret-fixture';
  const interviewSecret = 'bom-public-interview-secret-fixture';
  const contents = envText.replace(/MONGODB_URL=.*\n/, `MONGODB_URL=${uri}\n`)
    + `CAREER_WRITER_MOVE_SECRET=${moveSecret}\nCAREER_INTEGRATION_AI_SECRET=${aiSecret}\nCAREER_INTEGRATION_INTERVIEW_SECRET=${interviewSecret}\n`;
  await writeFile(installedEnv, contents, { mode: 0o600 });
  assert.deepEqual(runtime.validateEnvironment(runtime.parseEnvironment(contents)),
    { bindAddress: '127.0.0.1', port: 18081, writerEnabled: false, integrationEnabled: false });
  for (const [name, input] of bomEnvCases(contents)) {
    await t.test(name, async () => {
      await writeFile(envFile, input, { mode: 0o600 });
      const result = await cli(['validate', '--java', process.execPath, '--env-file', envFile]);
      assert.notEqual(result.code, 0);
      assert.match(result.stderr, /BOM/i);
      for (const fixture of [uri, 'bom-public', 'bom-public-password', moveSecret, aiSecret, interviewSecret]) {
        assert.equal(result.stdout.includes(fixture), false);
        assert.equal(result.stderr.includes(fixture), false);
      }
      assert.equal(await readFile(envFile, 'utf8'), input);
      assert.equal(await readFile(installedEnv, 'utf8'), contents);
    });
  }
});

test('BOM preflight preserves an existing Spring systemd service and keeps fixtures out of its journal', {
  skip: process.platform !== 'linux' || process.env.SPRING_RUNTIME_SYSTEMD_TEST !== '1'
    ? 'requires an explicitly enabled disposable Linux/systemd environment' : false,
  timeout: 90000,
}, async t => {
  assert.equal(process.getuid(), 0, 'disposable systemd verification requires root');
  const java = process.env.SPRING_RUNTIME_TEST_JAVA;
  const jar = process.env.SPRING_RUNTIME_TEST_JAR;
  assert.ok(java && jar, 'disposable verification requires explicit Java 21 and boot JAR paths');
  async function run(binary, args) {
    const child = spawn(binary, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '', stderr = '';
    child.stdout.setEncoding('utf8').on('data', value => { stdout += value; });
    child.stderr.setEncoding('utf8').on('data', value => { stderr += value; });
    const [code] = await once(child, 'close');
    return { code, stdout, stderr };
  }
  const root = await mkdtemp('/opt/expresso-f2-');
  await chmod(root, 0o755);
  const service = path.basename(root).toLowerCase();
  const unitFile = '/etc/systemd/system/' + service + '.service';
  t.after(async () => {
    await run('systemctl', ['stop', service]);
    await rm(unitFile, { force: true });
    await run('systemctl', ['daemon-reload']);
    await chmod(path.join(root, 'releases', 'first'), 0o755).catch(() => {});
    await rm(root, { recursive: true, force: true });
  });
  const listener = createServer().listen(0, '127.0.0.1');
  await once(listener, 'listening');
  const port = listener.address().port;
  await new Promise(resolve => listener.close(resolve));
  const uri = 'mongodb://runtime:bom-public-password@127.0.0.1:1/expresso?authSource=admin&replicaSet=rs0';
  const fixtures = [uri, 'bom-public', 'bom-public-password', 'bom-public-move-secret-fixture',
    'bom-public-ai-secret-fixture', 'bom-public-interview-secret-fixture'];
  const contents = 'SPRING_PROFILES_ACTIVE=operations\nSPRING_PORT=' + port + '\nMONGODB_URL=' + uri
    + '\nMONGODB_DATABASE=expresso\nCAREER_WRITER_ENABLED=false\nCAREER_INTEGRATION_ENABLED=false\n'
    + 'CAREER_WRITER_MOVE_SECRET=bom-public-move-secret-fixture\nCAREER_INTEGRATION_AI_SECRET=bom-public-ai-secret-fixture\n'
    + 'CAREER_INTEGRATION_INTERVIEW_SECRET=bom-public-interview-secret-fixture\n';
  const installedEnv = path.join(root, 'runtime.env');
  const candidateEnv = path.join(root, 'candidate.env');
  const deploymentMarker = path.join(root, 'deployment-started');
  await writeFile(installedEnv, contents, { mode: 0o600 });
  const normal = await cli(['validate', '--java', java, '--env-file', installedEnv]);
  assert.equal(normal.code, 0, normal.stderr);
  assert.equal(JSON.parse(normal.stdout).status, 'valid');
  await runtime.stageRelease({ releaseRoot: root, version: 'first', jar,
    sha256: createHash('sha256').update(await readFile(jar)).digest('hex') });
  await runtime.selectRelease({ releaseRoot: root, version: 'first' });
  const unit = runtime.renderUnit({ java, releaseRoot: root, envFile: installedEnv,
    serviceUser: 'nobody', serviceName: service });
  await writeFile(unitFile, unit, { flag: 'wx', mode: 0o644 });
  assert.equal((await run('systemctl', ['daemon-reload'])).code, 0);
  const start = await run('systemctl', ['start', service]);
  assert.equal(start.code, 0, start.stderr);
  const liveUrl = 'http://127.0.0.1:' + port + '/health/live';
  let live = false;
  for (let attempt = 0; attempt < 100; attempt++) {
    try { live = (await fetch(liveUrl, { signal: AbortSignal.timeout(1000) })).status === 200; } catch {}
    if (live) break;
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  assert.equal(live, true, 'existing Spring service must answer liveness before invalid deployment attempts');
  const before = await run('systemctl', ['show', service, '-p', 'MainPID', '--value']);
  assert.equal(before.code, 0);
  assert.match(before.stdout.trim(), /^[1-9]\d*$/);
  for (const [name, input] of bomEnvCases(contents)) {
    await t.test(name, async () => {
      await writeFile(candidateEnv, input, { mode: 0o600 });
      const rejected = await cli(['validate', '--java', java, '--env-file', candidateEnv]);
      // 검증 성공일 때만 설치·재시작합니다. 실패한 후보는 systemd에 전달하지 않습니다.
      if (rejected.code === 0) {
        await writeFile(deploymentMarker, 'unexpected deployment');
        await writeFile(installedEnv, input);
        await run('systemctl', ['restart', service]);
      }
      assert.notEqual(rejected.code, 0);
      assert.match(rejected.stderr, /BOM/i);
      for (const fixture of fixtures) {
        assert.equal((rejected.stdout + rejected.stderr).includes(fixture), false);
      }
      assert.equal(await readFile(installedEnv, 'utf8'), contents);
      assert.equal(await readFile(candidateEnv, 'utf8'), input);
      assert.equal(await readFile(unitFile, 'utf8'), unit);
      await assert.rejects(lstat(deploymentMarker), { code: 'ENOENT' });
      assert.equal(await readlink(path.join(root, 'current')), 'releases/first');
      const after = await run('systemctl', ['show', service, '-p', 'MainPID', '--value']);
      assert.equal(after.code, 0);
      assert.equal(after.stdout, before.stdout);
      assert.equal((await run('systemctl', ['is-active', service])).stdout.trim(), 'active');
      assert.equal((await fetch(liveUrl, { signal: AbortSignal.timeout(2000) })).status, 200);
    });
  }
  const journal = await run('journalctl', ['-u', service, '--no-pager']);
  assert.equal(journal.code, 0);
  for (const fixture of fixtures) assert.equal(journal.stdout.includes(fixture), false);
});

test('explicit rollback restores a healthy prior release when the current JAR is damaged', { skip: process.platform !== 'linux' && 'POSIX symlink replacement requires Linux' }, async t => {
  const stage = feature('stageRelease');
  const select = feature('selectRelease');
  const root = await workspace(t);
  const jar = path.join(root, 'input.jar');
  await writeFile(jar, artifact);
  for (const version of ['first', 'second']) await stage({ releaseRoot: root, version, jar, sha256: digest });
  await select({ releaseRoot: root, version: 'first' });
  await select({ releaseRoot: root, version: 'second' });
  const damaged = path.join(root, 'releases', 'second', 'backend-spring.jar');
  await chmod(damaged, 0o644);
  await writeFile(damaged, Buffer.from('PK\x03\x04damaged-current'));
  await assert.rejects(select({ releaseRoot: root, version: 'first' }), /SHA256/);
  assert.equal(await readlink(path.join(root, 'current')), 'releases/second');
  const result = await cli(['rollback', '--release-root', root, '--version', 'first']);
  assert.equal(result.code, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout), { version: 'first', previousVersion: 'second' });
  assert.equal(await readlink(path.join(root, 'current')), 'releases/first');
  assert.deepEqual((await readdir(root)).filter(name => name.startsWith('.current-')), []);
});

test('explicit rollback refuses a damaged target before changing current or creating a temporary link', { skip: process.platform !== 'linux' && 'POSIX symlink replacement requires Linux' }, async t => {
  const stage = feature('stageRelease');
  const select = feature('selectRelease');
  const root = await workspace(t);
  const jar = path.join(root, 'input.jar');
  await writeFile(jar, artifact);
  for (const version of ['first', 'second']) await stage({ releaseRoot: root, version, jar, sha256: digest });
  await select({ releaseRoot: root, version: 'second' });
  const damaged = path.join(root, 'releases', 'first', 'backend-spring.jar');
  await chmod(damaged, 0o644);
  await writeFile(damaged, Buffer.from('PK\x03\x04damaged-target'));
  const result = await cli(['rollback', '--release-root', root, '--version', 'first']);
  assert.notEqual(result.code, 0);
  assert.match(result.stderr, /SHA256/);
  assert.equal(await readlink(path.join(root, 'current')), 'releases/second');
  assert.deepEqual((await readdir(root)).filter(name => name.startsWith('.current-')), []);
});

test('explicit rollback refuses malicious or dangling current links before creating a temporary link', { skip: process.platform !== 'linux' && 'POSIX symlink replacement requires Linux' }, async t => {
  const stage = feature('stageRelease');
  const root = await workspace(t);
  const jar = path.join(root, 'input.jar');
  await writeFile(jar, artifact);
  await stage({ releaseRoot: root, version: 'first', jar, sha256: digest });
  for (const currentTarget of [path.join(root, 'releases', 'first'), '../releases/first', 'releases/../first', 'releases/missing']) {
    await symlink(currentTarget, path.join(root, 'current'));
    const result = await cli(['rollback', '--release-root', root, '--version', 'first']);
    assert.notEqual(result.code, 0);
    assert.match(result.stderr, /current|paths and permissions/);
    assert.equal(await readlink(path.join(root, 'current')), currentTarget);
    assert.deepEqual((await readdir(root)).filter(name => name.startsWith('.current-')), []);
    await rm(path.join(root, 'current'));
  }
});

test('explicit rollback refuses symlink release roots and current or target release directories', { skip: process.platform !== 'linux' && 'POSIX symlink replacement requires Linux' }, async t => {
  const stage = feature('stageRelease');
  const root = await workspace(t);
  const jar = path.join(root, 'input.jar');
  await writeFile(jar, artifact);
  for (const version of ['first', 'second']) await stage({ releaseRoot: root, version, jar, sha256: digest });
  const linked = path.join(root, 'releases', 'linked');
  await symlink('first', linked);
  await symlink('releases/linked', path.join(root, 'current'));
  const currentLink = await cli(['rollback', '--release-root', root, '--version', 'second']);
  assert.notEqual(currentLink.code, 0);
  assert.match(currentLink.stderr, /symlink/);
  assert.equal(await readlink(path.join(root, 'current')), 'releases/linked');
  await rm(path.join(root, 'current'));
  await symlink('releases/second', path.join(root, 'current'));
  const targetLink = await cli(['rollback', '--release-root', root, '--version', 'linked']);
  assert.notEqual(targetLink.code, 0);
  assert.match(targetLink.stderr, /symlink/);
  const alias = path.join(root, 'alias');
  await symlink(root, alias);
  const rootLink = await cli(['rollback', '--release-root', alias, '--version', 'first']);
  assert.notEqual(rootLink.code, 0);
  assert.match(rootLink.stderr, /symlink/);
  const traversal = await cli(['rollback', '--release-root', root, '--version', '../first']);
  assert.notEqual(traversal.code, 0);
  assert.match(traversal.stderr, /version/);
  assert.equal(await readlink(path.join(root, 'current')), 'releases/second');
  assert.deepEqual((await readdir(root)).filter(name => name.startsWith('.current-')), []);
});

test('explicit rollback can leave a current release with missing or damaged artifacts', { skip: process.platform !== 'linux' && 'POSIX symlink replacement requires Linux' }, async t => {
  for (const damage of ['missing-jar', 'invalid-manifest', 'missing-manifest']) {
    await t.test(damage, async t => {
      const stage = feature('stageRelease');
      const select = feature('selectRelease');
      const root = await workspace(t);
      const jar = path.join(root, 'input.jar');
      await writeFile(jar, artifact);
      for (const version of ['first', 'second']) await stage({ releaseRoot: root, version, jar, sha256: digest });
      await select({ releaseRoot: root, version: 'second' });
      const currentRelease = path.join(root, 'releases', 'second');
      await chmod(currentRelease, 0o755);
      if (damage === 'invalid-manifest') {
        const manifest = path.join(currentRelease, 'backend-spring.jar.sha256');
        await chmod(manifest, 0o644);
        await writeFile(manifest, 'damaged-current-manifest');
      } else {
        await rm(path.join(currentRelease, damage === 'missing-jar' ? 'backend-spring.jar' : 'backend-spring.jar.sha256'));
      }
      await assert.rejects(select({ releaseRoot: root, version: 'first' }));
      const result = await cli(['rollback', '--release-root', root, '--version', 'first']);
      assert.equal(result.code, 0, result.stderr);
      assert.deepEqual(JSON.parse(result.stdout), { version: 'first', previousVersion: 'second' });
      assert.equal(await readlink(path.join(root, 'current')), 'releases/first');
      assert.deepEqual((await readdir(root)).filter(name => name.startsWith('.current-')), []);
    });
  }
});

test('explicit rollback still refuses symlinked or nonregular artifacts in the current release', { skip: process.platform !== 'linux' && 'POSIX symlink replacement requires Linux' }, async t => {
  for (const [name, kind] of [['backend-spring.jar', 'symlink'], ['backend-spring.jar.sha256', 'symlink'], ['backend-spring.jar', 'directory']]) {
    await t.test(`${name}-${kind}`, async t => {
      const stage = feature('stageRelease');
      const select = feature('selectRelease');
      const root = await workspace(t);
      const jar = path.join(root, 'input.jar');
      await writeFile(jar, artifact);
      for (const version of ['first', 'second']) await stage({ releaseRoot: root, version, jar, sha256: digest });
      await select({ releaseRoot: root, version: 'second' });
      const currentRelease = path.join(root, 'releases', 'second');
      await chmod(currentRelease, 0o755);
      const replaced = path.join(currentRelease, name);
      await rm(replaced);
      if (kind === 'symlink') await symlink(path.join(root, 'releases', 'first', name), replaced);
      else await mkdir(replaced);
      const result = await cli(['rollback', '--release-root', root, '--version', 'first']);
      assert.notEqual(result.code, 0);
      assert.match(result.stderr, /symlink|regular file/);
      assert.equal(await readlink(path.join(root, 'current')), 'releases/second');
      assert.deepEqual((await readdir(root)).filter(name => name.startsWith('.current-')), []);
    });
  }
});
test('explicit cutover activation requires scoped keys without changing disabled defaults',()=>{
 const enabled=runtime.parseEnvironment(`${envText}CAREER_WRITER_ENABLED=true\nCAREER_INTEGRATION_ENABLED=true\nCAREER_PROPERTY_MUTATION_ENABLED=true\nCAREER_WRITER_MOVE_SECRET=${'m'.repeat(32)}\nCAREER_INTEGRATION_AI_SECRET=${'a'.repeat(32)}\nCAREER_INTEGRATION_INTERVIEW_SECRET=${'i'.repeat(32)}\nCAREER_PRODUCT_SERVICE_SECRET=${'p'.repeat(32)}\nCAREER_PROPERTY_MUTATION_SECRET=${'w'.repeat(32)}\n`);
 assert.equal(runtime.validateEnvironment(enabled).writerEnabled,true);assert.equal(runtime.validateEnvironment(enabled).integrationEnabled,true);
 assert.throws(()=>runtime.validateEnvironment({...enabled,CAREER_PRODUCT_SERVICE_SECRET:''}),error=>!error.message.includes('m'.repeat(32)));
 assert.throws(()=>runtime.validateEnvironment({...enabled,CAREER_PROPERTY_MUTATION_SECRET:enabled.CAREER_INTEGRATION_AI_SECRET}));
});