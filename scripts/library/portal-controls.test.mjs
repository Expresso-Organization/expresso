import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=name=>JSON.parse(readFileSync(new URL('../../docs/library/'+name+'.json',import.meta.url)));

test('상단 검색 인덱스는 수집·보강 목록의 모든 항목을 유일하게 포함한다',()=>{
 const index=read('portal-search-index'),base=read('catalog'),acquired=read('acquisitions'),curated=read('curation');
 const sourceItems=[...base.items,...acquired.additions,...curated.additions];
 assert.equal(index.schemaVersion,1);
 assert.equal(index.catalogRunId,base.runId);
 assert.equal(index.curationRunId,curated.runId);
 assert.equal(index.entries.length,sourceItems.length);
 const keyed=new Map(index.entries.map(item=>[item.id,item]));
 assert.equal(keyed.size,sourceItems.length);
 for(const item of sourceItems){
  const entry=keyed.get(item.id);
  assert.ok(entry,item.id);
  assert.equal(entry.title,item.title);
  assert.equal(entry.identifier,item.sourceItemId);
  assert.equal(typeof entry.source,'string');
 }
});

test('변경 알림은 고유한 기록과 내부 이동 주소만 제공한다',()=>{
 const feed=read('portal-changes');
 assert.equal(feed.schemaVersion,1);
 assert.ok(feed.items.length>0);
 assert.equal(new Set(feed.items.map(item=>item.id)).size,feed.items.length);
 for(const item of feed.items){
  assert.match(item.date,/^\d{4}-\d{2}-\d{2}$/);
  assert.ok(item.title.trim());assert.ok(item.summary.trim());
  assert.match(item.href,/^#\/(?:docs|library(?:\/|$)|doc\/)/);
 }
});
