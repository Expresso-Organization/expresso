import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const root=new URL('../../',import.meta.url);
const read=file=>readFileSync(new URL(file,root));
const folder='docs/library/previews/portfolio/';
test('배포 산출물과 원본 해시가 브라우저 검증 당시와 일치한다',()=>{
  const report=JSON.parse(read(folder+'verification.json'));
  assert.equal(report.results.length,12);
  assert.ok(report.results.every(r=>r.status==='passed'&&r.staticContentParity));
  assert.ok(Object.values(report.checks).every(Boolean));
  for(const [file,hash] of Object.entries(report.artifactHashes))assert.equal(createHash('sha256').update(read(folder+file)).digest('hex'),hash,file);
  const sources=JSON.parse(read(folder+'sources.json'));
  for(const source of sources.sources)assert.equal(createHash('sha256').update(read(source.material)).digest('hex'),source.sha256,source.id);
});
test('다운로드 HTML은 스크립트·외부 자산 없이 콘텐츠와 고지를 보존한다',()=>{
  for(const scenario of ['standard','long','no-images','many']){
    const html=read(folder+scenario+'.static.html').toString();
    assert.doesNotMatch(html,/<script\b|src="https?:|href="\.\/.*\.css/);
    assert.match(html,/가상 포트폴리오 예제/);assert.match(html,/THIRD-PARTY NOTICES/);assert.match(html,/MIT License/);
  }
});
