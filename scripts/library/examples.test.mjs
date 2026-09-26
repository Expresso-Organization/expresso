import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {applyAcquisitions,validPreview} from '../../docs/library/acquisition-core.mjs';
import {applyCuration} from '../../docs/library/curation-core.mjs';
import {applyExamples} from '../../docs/library/examples-core.mjs';
import {parseLibraryRoute,selectItems} from '../../docs/library/catalog-core.mjs';
const file=p=>new URL('../../'+p,import.meta.url),read=p=>readFileSync(file(p)),json=p=>JSON.parse(read(p));
const base=applyCuration(applyAcquisitions(json('docs/library/catalog.json'),json('docs/library/acquisitions.json')),json('docs/library/curation.json'));
const examples=json('docs/library/examples.json'),data=applyExamples(base,examples);

test('확보한 Watermelon 코드와 보강 항목 모두에 검증된 실행 예제를 연결한다',()=>{
 const targets=data.items.filter(i=>i.sourceSite==='watermelon'&&i.acquisitionStatus==='source_ready'||['magic-portfolio','shadcn-timeline','al-folio-core','al-folio-cv','al-folio-distill'].includes(i.sourceSite));
 assert.equal(targets.length,1090);
 for(const i of targets){assert.equal(i.preview.kind,'local_frame',i.id);assert.ok(i.preview.liveUrl,i.id);assert.ok(existsSync(file('docs/'+i.preview.liveUrl.slice(2))));}
 assert.equal(data.items.length,base.items.length);
 assert.equal(data.items.filter(i=>!i.preview&&i.acquisitionStatus==='source_ready').length,0);
 assert.equal(selectItems(data,parseLibraryRoute('#/library?availability=example')).total,1090);
});
test('추가 예제 전체의 정적 카드 해시와 실행 결과·원본 문맥을 확인한다',()=>{
 const builds=json('docs/library/previews/examples/build-results.json');
 assert.equal(builds.length,970);
 for(const row of examples.items.filter(i=>i.example)){
  assert.equal(row.renderCheck.status,'ready');
  const raw=read('docs/'+row.preview.url.slice(2));
  assert.equal(createHash('sha256').update(raw).digest('hex'),row.renderCheck.snapshotSha256,row.id);
  assert.doesNotMatch(raw.toString(),/<script\b/i);
  assert.match(raw.toString(),/default-src 'none'/);
  assert.ok(row.example.entry);
 }
 const liquid=data.items.find(i=>i.id==='al-folio-cv-experience');assert.equal(liquid.execution.example.mode,'liquid_template_fixture');
 const adapter=data.items.find(i=>i.id==='magic-portfolio-article');assert.equal(adapter.execution.example.mode,'layout_adapter');
 assert.ok(adapter.execution.example.notes.length);
});
test('참고 영상은 공식 포스터와 함께 연결하고 권한 대기 자료를 실행 예제로 꾸미지 않는다',()=>{
 const videos=selectItems(data,parseLibraryRoute('#/library?availability=video')).items;
 assert.equal(data.items.filter(i=>i.preview?.kind==='remote_video').length,2135);
 for(const i of videos){assert.ok(i.preview.sourceUrl);assert.ok(i.preview.poster);assert.ok(i.preview.url.startsWith('https://'));assert.equal(i.execution,undefined);}
 for(const original of base.items.filter(i=>['permission_needed','access_blocked'].includes(i.acquisitionStatus))){
  const now=data.items.find(i=>i.id===original.id);assert.equal(now.acquisitionStatus,original.acquisitionStatus);assert.deepEqual(now.preview,original.preview);
 }
});
test('중복 ID·위험 영상 주소·미검증 실행 예제를 거부한다',()=>{
 const duplicate=structuredClone(examples);duplicate.items.push(duplicate.items[0]);assert.throws(()=>applyExamples(base,duplicate));
 const failed=structuredClone(examples);failed.items.find(i=>i.example).renderCheck.status='error';assert.throws(()=>applyExamples(base,failed));
 assert.equal(validPreview({kind:'remote_video',sourceUrl:'https://example.com',url:'javascript:alert(1)',poster:'https://example.com/a.jpg'}),false);
 assert.equal(validPreview({kind:'remote_video',sourceUrl:'https://example.com',url:'https://example.com/a.mp4',poster:'data:text/html,x'}),false);
});

test('기존 참고 자료는 세 유형에 중복·누락 없이 나뉘고 실행 필터도 유지한다',async()=>{
 const {itemType}=await import('../../docs/library/catalog-core.mjs');
 const referenceIds=data.items.filter(i=>i.artifactKind==='reference').map(i=>i.id).sort();
 const groups=['design-references','templates','tools'];
 const combined=data.items.filter(i=>groups.includes(itemType(i))).map(i=>i.id).sort();
 assert.deepEqual(combined,referenceIds);
 const counts=groups.map(type=>selectItems(data,parseLibraryRoute('#/library/'+type)).total);
 assert.deepEqual(counts,[4454,12,69]);
 assert.deepEqual(groups.map(type=>selectItems(data,parseLibraryRoute('#/library/'+type+'?availability=example')).total),[0,12,7]);
 const legacy=selectItems(data,parseLibraryRoute('#/library/references?availability=example'));
 assert.equal(legacy.total,19);
 assert.equal(legacy.items.every(i=>i.artifactKind==='reference'),true);
});
test('분리한 유형과 이전 상세 주소에서 검색·페이지·선택을 보존한다',async()=>{
 const {libraryRoute}=await import('../../docs/library/catalog-core.mjs');
 const item=data.items.find(i=>i.sourceSite==='al-folio-cv');
 for(const type of ['templates','tools','design-references','references']){
  const state=parseLibraryRoute(`#/library/${type}/${item.id}?availability=example&q=경력&page=2`);
  assert.equal(state.type,type);assert.equal(state.id,item.id);
  assert.deepEqual(parseLibraryRoute(libraryRoute(state)),state);
 }
});
