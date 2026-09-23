import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {validateCatalog,parseLibraryRoute,libraryRoute,selectItems} from '../../docs/library/catalog-core.mjs';
import {applyAcquisitions,validPreview,validateDetail} from '../../docs/library/acquisition-core.mjs';
const root=new URL('../../',import.meta.url);
const read=path=>readFileSync(new URL(path,root));
const json=path=>JSON.parse(read(path));
const base=json('docs/library/catalog.json');const acquired=json('docs/library/acquisitions.json');

test('상세 대상 전체에 결과와 자료 파일을 연결한다',()=>{
 const merged=applyAcquisitions(validateCatalog(base),acquired);
 assert.equal(merged.items.length,base.items.length+6);
 let materials=0;const previews=new Set();
 for(const item of merged.items){
  const detail=validateDetail(json('docs/'+item.detailPath.slice(2)),item.id);
  assert.equal(item.acquisitionStatus,detail.acquisitionStatus);
  for(const file of detail.materials){const body=read('docs/'+file.path.slice(2));assert.equal(createHash('sha256').update(body).digest('hex'),file.sha256);materials++;}
  if(item.preview?.kind.startsWith('local_')){assert.ok(existsSync(new URL('docs/'+item.preview.url.slice(2),root)));previews.add(item.preview.url);}
  if(item.preview?.liveUrl){assert.ok(existsSync(new URL('docs/'+item.preview.liveUrl.slice(2),root)));assert.equal(detail.renderCheck.status,'ready');}
 }
 assert.ok(materials>2000);assert.ok(previews.size>1000);
});
test('정적 카드는 스크립트 실행 없이 원본 렌더링을 표시한다',()=>{
 const verified=json('docs/library/previews/watermelon/verification.json');assert.equal(Object.keys(verified.results).length,120);
 for(const [name,result] of Object.entries(verified.results)){
  assert.equal(result.status,'ready');const html=read(`docs/library/previews/watermelon/${name}.static.html`).toString();
  assert.doesNotMatch(html,/<script\b/i);assert.match(html,/Content-Security-Policy/);
  assert.equal(createHash('sha256').update(html).digest('hex'),result.snapshotSha256);
 }
});
test('표시 URL과 소스 경로의 실행·상위 폴더 접근을 거부한다',()=>{
 assert.equal(validPreview({kind:'remote_image',label:'x',url:'javascript:alert(1)',sourceUrl:'https://example.com'}),false);
 assert.equal(validPreview({kind:'local_frame',label:'x',url:'./library/previews/../../private.html',sourceUrl:'https://example.com',width:1280,height:880}),false);
 assert.equal(validPreview({kind:'remote_image',label:'x',url:'https://example.com/x.png',thumbnailUrl:'data:text/html,x',sourceUrl:'https://example.com'}),false);
 const bad=structuredClone(acquired);bad.items[0].id='missing-item';assert.throws(()=>applyAcquisitions(base,bad));
});
test('역할·확보 상태·검색을 공유 주소와 목록에서 함께 복원한다',()=>{
 const merged=applyAcquisitions(base,acquired);const state=parseLibraryRoute('#/library/components?source=watermelon&role=hero&availability=preview');
 assert.deepEqual(parseLibraryRoute(libraryRoute(state)),state);
 const results=selectItems(merged,state);assert.ok(results.total>30);assert.ok(results.items.every(i=>i.preview && i.roles.includes('hero')));
 const prompts=selectItems(merged,parseLibraryRoute('#/library/prompts?source=expresso'));assert.equal(prompts.total,6);
});
