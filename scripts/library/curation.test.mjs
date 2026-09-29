import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {applyAcquisitions,validateDetail} from '../../docs/library/acquisition-core.mjs';
import {applyCuration} from '../../docs/library/curation-core.mjs';
import {parseLibraryRoute,libraryRoute,selectItems} from '../../docs/library/catalog-core.mjs';
const read=path=>readFileSync(new URL('../../'+path,import.meta.url));
const json=path=>JSON.parse(read(path));
const base=applyAcquisitions(json('docs/library/catalog.json'),json('docs/library/acquisitions.json'));
const curated=json('docs/library/curation.json');
const data=applyCuration(base,curated);

test('기존 자료·원본 ID·미리보기를 보존하고 보강 코드의 해시와 고지를 연결한다',()=>{
  assert.equal(data.items.length,base.items.length+curated.additions.length);
  for(const original of base.items){
    const item=data.items.find(i=>i.id===original.id);
    assert.deepEqual(item.preview,original.preview);
    assert.equal(item.sourceRevision,original.sourceRevision);
  }
  for(const item of data.items.filter(i=>curated.additions.some(a=>a.id===i.id))){
    const detail=validateDetail(json('docs/'+item.detailPath.slice(2)),item.id);
    assert.equal(detail.visualReview,'not_reviewed');
    assert.equal(detail.sourceRevision,item.sourceRevision);
    assert.ok(detail.materials.some(m=>m.kind==='license'));
    for(const m of detail.materials)assert.equal(createHash('sha256').update(read('docs/'+m.path.slice(2))).digest('hex'),m.sha256);
    assert.equal(item.preview.kind,'text');
  }
});
test('채용·일정·금융 항목이 개인 경력·프로젝트 후보에 섞이지 않는다',()=>{
  for(const name of ['career-1','career-2','career-3','career-4','timeline','portfolio-dashboard','project-management-dashboard']){
    const item=data.items.find(i=>i.sourceSite==='watermelon'&&i.sourceItemId===name);
    assert.deepEqual(item.roles,['supporting-ui']);assert.equal(item.selection,'excluded');
  }
  for(const name of ['status-picker','use-data-state','use-controlled-state'])assert.ok(!data.items.find(i=>i.sourceSite==='watermelon'&&i.sourceItemId===name).roles.includes('outcome'));
});
test('신규 경력·연구·긴 사례의 입력 근거를 보존하고 필터·주소를 복원한다',()=>{
  for(const role of ['experience','education','research','project-detail']){
    const state=parseLibraryRoute('#/library?role='+role);
    const result=selectItems(data,state);
    assert.ok(result.total>0);
    assert.ok(result.items.some(i=>i.roleMethod==='source_review'&&i.curation.inputs.length));
  }
  const state=parseLibraryRoute('#/library/components?selection=shortlisted&role=experience&page=1');
  assert.deepEqual(parseLibraryRoute(libraryRoute(state)),state);
  assert.ok(selectItems(data,state).items.every(i=>i.selection==='shortlisted'&&i.roles.includes('experience')));
  const family=curated.families.find(g=>g.id==='watermelon-hero');
  assert.equal(selectItems(data,parseLibraryRoute('#/library?family=watermelon-hero')).total,family.itemIds.length);
});
test('중복 코드 해시를 다시 계산하고 이름 계열을 구조 중복으로 승격하지 않는다',()=>{
  for(const g of curated.duplicates){
    for(const id of g.itemIds){
      const item=data.items.find(i=>i.id===id);
      const registry=json('docs/library/materials/watermelon/registry/'+item.sourceItemId+'.json');
      // Python json.dumps 기본 구분자와 유니코드 보존 방식에 맞춥니다.
      const serialized='['+registry.files.map(f=>f.content||'').sort().map(s=>JSON.stringify(s)).join(', ')+']';
      assert.equal(createHash('sha256').update(serialized).digest('hex'),g.hash);
    }
  }
  assert.ok(curated.families.every(g=>g.reviewStatus==='structure_unverified'));
});
test('검토 데이터의 누락·중복 ID·위험 URL·잘못된 계열 연결을 거부한다',()=>{
  const missing=structuredClone(curated);missing.updates.pop();assert.throws(()=>applyCuration(base,missing));
  const duplicate=structuredClone(curated);duplicate.updates.push(duplicate.updates[0]);assert.throws(()=>applyCuration(base,duplicate));
  const hostile=structuredClone(curated);hostile.updates.find(u=>u.detailPath).detailPath='./library/items/../../secret.json';assert.throws(()=>applyCuration(base,hostile));
  const badFamily=structuredClone(curated);badFamily.families[0].itemIds.push('unknown');assert.throws(()=>applyCuration(base,badFamily));
});
