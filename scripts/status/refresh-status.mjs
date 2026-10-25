// 진행 현황 대시보드(docs/status/status.json)의 기준일 · 기준 커밋 · 열린 PR 목록을 다시 받습니다.
// 판정(완료 · 부분 · API만 · 미구현)은 사람이 그 파일에서 직접 고칩니다 — 여기서 바꾸지 않습니다.
//
//   node scripts/status/refresh-status.mjs
//
// 필요한 것: origin 이 붙은 git, 로그인한 gh(GitHub CLI).
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const file = path.join(root, 'docs/status/status.json');
const run = (cmd, args) => execFileSync(cmd, args, {cwd: root, encoding: 'utf8'}).trim();

const status = JSON.parse(fs.readFileSync(file, 'utf8'));

run('git', ['fetch', '--quiet', 'origin', 'main']);
const commit = run('git', ['rev-parse', '--short=8', 'origin/main']);

const repo = run('gh', ['repo', 'view', '--json', 'nameWithOwner', '--jq', '.nameWithOwner']);
const open = JSON.parse(run('gh', ['pr', 'list', '--repo', repo, '--state', 'open', '--limit', '200',
  '--json', 'number,title,author,updatedAt']));

// 이미 있던 PR 은 사람이 붙인 범위 분류를 그대로 두고, 새 PR 만 「미분류」로 넣습니다.
const groupOf = new Map(status.prs.map(p => [p.number, p.group]));
const order = [...new Set(status.prs.map(p => p.group))];
const prs = open.map(p => ({
  number: p.number,
  group: groupOf.get(p.number) ?? '미분류',
  title: p.title.replace(/^[a-z]+: /i, ''),
  author: p.author.login,
  updated: p.updatedAt.slice(0, 10),
}));
const rank = g => (order.includes(g) ? order.indexOf(g) : order.length);
prs.sort((a, b) => rank(a.group) - rank(b.group) || b.number - a.number);

const today = new Date();
const pad = n => String(n).padStart(2, '0');
const asOf = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`;

const closed = status.prs.filter(p => !open.some(o => o.number === p.number)).map(p => p.number);
const added = prs.filter(p => !groupOf.has(p.number)).map(p => p.number);

fs.writeFileSync(file, JSON.stringify({...status, asOf, commit, prs}, null, 2) + '\n');
console.log(`asOf ${asOf} · main ${commit} · 열린 PR ${prs.length}개`);
if (added.length) console.log(`새 PR(미분류): ${added.map(n => '#' + n).join(' ')}`);
if (closed.length) console.log(`목록에서 빠진 PR: ${closed.map(n => '#' + n).join(' ')}`);
