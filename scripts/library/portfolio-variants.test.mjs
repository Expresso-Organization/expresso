import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const root=new URL('../../',import.meta.url),folder='docs/library/previews/portfolio/';
const read=p=>readFileSync(new URL(p,root));
const json=p=>JSON.parse(read(p));
test('두 구성안의 화면·콘텐츠·정적 출력 검증과 현재 파일 해시가 일치한다',()=>{
  const report=json(folder+'variants-verification.json');
  assert.equal(report.results.length,24);assert.equal(new Set(report.results.map(r=>`${r.recipe}/${r.scenario}/${r.width}`)).size,24);
  assert.ok(report.results.every(r=>r.status==='passed'&&r.staticParity&&r.preservedFields>=65));
  assert.ok(Object.values(report.checks).every(Boolean));
  for(const [name,hash] of Object.entries(report.artifactHashes))assert.equal(createHash('sha256').update(read(folder+name)).digest('hex'),hash,name);
  for(const source of json(folder+'variants-sources.json').sources)assert.equal(createHash('sha256').update(read(source.path)).digest('hex'),source.sha256,source.path);
});
test('동일 입력으로 구조가 다른 두 지면을 만들고 정적 파일에 고지를 보존한다',()=>{
  const featured=json(folder+'featured-standard.json'),gallery=json(folder+'gallery-standard.json');
  assert.deepEqual(featured.content,gallery.content);assert.notDeepEqual(featured.plan.cases,gallery.plan.cases);
  assert.notDeepEqual(featured.spec.elements.page.children,gallery.spec.elements.page.children);
  for(const recipe of ['featured','gallery'])for(const scenario of ['standard','long','no-images','many']){
    const html=read(folder+recipe+'-'+scenario+'.static.html').toString();assert.doesNotMatch(html,/src="https?:/);assert.match(html,/<script data-portfolio-motion>/);assert.match(html,/THIRD-PARTY NOTICES/);assert.match(html,/가상 포트폴리오/);
  }
});

test('두 방향의 서체·첫 화면·글자 대비와 독립 HTML 서체를 검증한다',()=>{
  const report=json(folder+'variants-verification.json');
  for(const row of report.results){
    assert.ok(row.design.minimumContrast>=4.5);
    assert.equal(row.design.posterName,row.recipe==='gallery');
    if(row.recipe==='featured')assert.equal(row.design.fontLoaded,true);
  }
  const a=report.results.find(r=>r.recipe==='featured').design,b=report.results.find(r=>r.recipe==='gallery').design;
  assert.notEqual(a.font,b.font);assert.notEqual(a.weight,b.weight);assert.notEqual(a.heroBackground,b.heroBackground);
  assert.match(read(folder+'featured-standard.static.html').toString(),/data:font\/woff;base64,/);
  assert.doesNotMatch(read(folder+'gallery-standard.static.html').toString(),/data:font\/woff;base64,/);
});

test('가상 시제품 입력과 정적 조작 마크업을 두 방향에 보존한다',()=>{
  for(const recipe of ['featured','gallery']){
    const data=json(folder+recipe+'-standard.json');
    assert.deepEqual(data.content.projects.map(p=>p.showcase.kind),['map','network','wayfinding']);
    const html=read(folder+recipe+'-standard.static.html').toString();
    assert.match(html,/첫 화면 프로젝트 전시/);assert.match(html,/type="radio"/);assert.match(html,/가상 시제품/);
    assert.equal([...html.matchAll(/<script\b/g)].length,1);
  }
  const checks=json(folder+'variants-verification.json').checks;
  for(const key of ['projectSwitcher','sceneKeyboard','sceneIsolation','staticSceneControls'])assert.equal(checks[key],true);
});

test('모션별 내보내기는 선택 JSON과 허용한 실행 코드의 해시를 보존한다',()=>{
  const manifest=json(folder+'variants-sources.json');assert.equal(manifest.variants.length,24);
  for(const variant of manifest.variants){
    const data=json(folder+variant.file+'.json'),html=read(folder+variant.file+'.static.html').toString();
    assert.equal(data.plan.motion.preset,variant.motion);
    const scripts=[...html.matchAll(/<script data-portfolio-motion>([\s\S]*?)<\/script>/g)];
    assert.equal(scripts.length,variant.motion==='none'?0:1);
    if(scripts.length){
      const hash=createHash('sha256').update(scripts[0][1]).digest('base64');
      assert.equal(hash,manifest.motionRuntime.sha256);assert.ok(html.includes(`script-src 'sha256-${hash}'`));
    }
  }
});

test('모션 프리셋과 정적 출력의 실행 검증이 현재 산출물과 일치한다',()=>{
  const report=json(folder+'motion-verification.json');
  assert.equal(report.results.length,12);
  assert.equal(new Set(report.results.map(r=>`${r.recipe}/${r.preset}/${r.width}`)).size,12);
  assert.ok(report.results.every(r=>r.download&&r.staticRuntime));
  assert.ok(Object.values(report.checks).every(Boolean));
  for(const [file,hash] of Object.entries(report.artifactHashes))assert.equal(createHash('sha256').update(read(folder+file)).digest('hex'),hash,file);
});

test('컴포넌트 모션 지원 목록과 실행 검증이 현재 산출물을 가리킨다',()=>{
 const catalog=json(folder+'component-motion-catalog.json'),report=json(folder+'motion-library-verification.json');
 assert.equal(catalog.components.length,7);assert.equal(report.results.length,28);
 assert.equal(new Set(report.results.map(r=>`${r.component}/${r.recipe}/${r.width}`)).size,28);
 assert.ok(report.results.every(r=>r.status==='passed'));assert.ok(Object.values(report.checks).every(Boolean));
 for(const [name,hash] of Object.entries(report.artifactHashes))assert.equal(createHash('sha256').update(read(folder+name)).digest('hex'),hash,name);
 const plan=json(folder+'gallery-standard.json');assert.deepEqual([...plan.motionSupport].sort(),catalog.components.map(c=>c.id).sort());
});
