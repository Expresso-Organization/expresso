import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { TYPES, PAGE_SIZE, validateCatalog, parseLibraryRoute, libraryRoute, selectItems } from '../../docs/library/catalog-core.mjs';
const root = new URL('../../', import.meta.url);
const read = path => readFileSync(new URL(path, root));
const catalog = JSON.parse(read('docs/library/catalog.json'));
const receipts = JSON.parse(read('docs/library/collection-run.json'));

test('공개 목록의 식별자·집계·관계·미확보 상태가 일치한다', () => {
  assert.equal(validateCatalog(catalog), catalog);
  assert.equal(catalog.sources.length, 17);
  const requests = new Set(receipts.requests.map(r=>r.id));
  for (const source of catalog.sources) {
    assert.ok(source.requestIds.every(id=>requests.has(id)));
    if (!source.discoveredCount) assert.ok(source.nextActions.length);
  }
  assert.equal(catalog.items.some(i=>'code' in i || 'prompt' in i || 'html' in i), false);
});
test('항목의 실행 URL과 불일치한 집계를 거부한다', () => {
  const hostile = structuredClone(catalog);
  hostile.items[0].canonicalUrl = 'javascript:alert(1)';
  assert.throws(()=>validateCatalog(hostile));
  const invalid = structuredClone(catalog);
  invalid.sources[0].discoveredCount += 1;
  assert.throws(()=>validateCatalog(invalid));
});
test('한국어·예약 문자·검색·필터·선택을 공유 주소에서 복원한다', () => {
  const state = {type:'components',id:'watermelon-test',source:'watermelon',q:'한글 & hero/?',category:'registry:ui',page:3};
  assert.deepEqual(parseLibraryRoute(libraryRoute(state)),state);
  for (const type of Object.keys(TYPES)) assert.equal(parseLibraryRoute(libraryRoute({...state,type})).type,type);
  assert.equal(parseLibraryRoute('#/library/unknown/%E0%A4%A?page=-2').page,1);
  assert.equal(parseLibraryRoute('#/library/unknown/%E0%A4%A').id,'');
});
test('검색·자료 유형·사이트 필터와 페이지 범위를 함께 적용한다', () => {
  const state = parseLibraryRoute('#/library/icons?source=rune&q=arrow&page=999999');
  const result = selectItems(catalog,state);
  assert.ok(result.total>0);
  assert.equal(result.page,result.pages);
  assert.ok(result.items.length<=PAGE_SIZE);
  assert.ok(result.items.every(i=>i.sourceSite==='rune' && i.artifactKind==='icon'));
  assert.equal(selectItems(catalog,{...state,q:'존재하지않는자료_qa'}).total,0);
  assert.equal(selectItems(catalog,parseLibraryRoute('#/library/pages')).total,0);
});
test('서로 다른 페이지의 카드가 겹치지 않는다', () => {
  const state = parseLibraryRoute('#/library');
  const first = selectItems(catalog,state).items;
  const second = selectItems(catalog,{...state,page:2}).items;
  assert.equal(first.length,PAGE_SIZE);
  assert.equal(second.length,PAGE_SIZE);
  assert.equal(new Set([...first,...second].map(i=>i.id)).size,PAGE_SIZE*2);
});
test('포털에 발행한 토큰은 제품의 토큰 원본과 같다', () => {
  const hash = b=>createHash('sha256').update(b).digest('hex');
  assert.equal(hash(read('docs/library/tokens.css')),hash(read('services/web/src/styles/tokens.css')));
});
