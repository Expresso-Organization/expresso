import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {validateCatalog,selectItems,parseLibraryRoute} from '../../docs/library/catalog-core.mjs';
import {applyAcquisitions,validateDetail} from '../../docs/library/acquisition-core.mjs';
import {applyCuration} from '../../docs/library/curation-core.mjs';
import {applyExamples} from '../../docs/library/examples-core.mjs';
import {applyComponentry} from '../../docs/library/componentry-core.mjs';

const root=new URL('../../',import.meta.url);
const read=path=>readFileSync(new URL(path,root));
const json=path=>JSON.parse(read(path));
const feed=json('docs/library/componentry.json');
const base=applyExamples(applyCuration(applyAcquisitions(
  validateCatalog(json('docs/library/catalog.json')),
  json('docs/library/acquisitions.json')),
  json('docs/library/curation.json')),
  json('docs/library/examples.json'));

test('Componentry 53개 UI와 3개 블록의 고정 소스·시연 자료를 연결한다',()=>{
  const merged=applyComponentry(base,feed);
  assert.equal(merged.items.length,base.items.length+56);
  assert.equal(merged.sources.at(-1).id,'componentry');
  assert.deepEqual(feed.stats,{items:56,components:53,blocks:3,officialVideos:36,unavailableVideos:13,textPreviews:20});
  assert.equal(selectItems(merged,parseLibraryRoute('#/library/all?source=componentry')).total,56);
  const items=merged.items.filter(item=>item.sourceSite==='componentry');
  for(const item of items){
    assert.equal(item.selection,'pending');
    assert.equal(item.integrationStatus,'not_started');
    assert.equal(item.execution,undefined);
    const detail=validateDetail(json('docs/'+item.detailPath.slice(2)),item.id);
    assert.equal(detail.sourceRevision,item.sourceRevision);
    assert.equal(detail.visualReview,'not_reviewed');
    for(const material of detail.materials){
      assert.equal(createHash('sha256').update(read('docs/'+material.path.slice(2))).digest('hex'),material.sha256);
    }
  }
  for(const name of ['flipping-word-swap','image-trail','layered-stack','liquid-glass-carousel']){
    assert.equal(items.find(item=>item.sourceItemId===name)?.rightsStatus,'unreviewed');
  }
});

test('누락 항목과 위험한 미리보기 주소를 거부한다',()=>{
  const missing=structuredClone(feed);missing.updates.pop();
  assert.throws(()=>applyComponentry(base,missing));
  const unsafe=structuredClone(feed);unsafe.updates[0].preview={kind:'remote_video',url:'javascript:alert(1)',poster:'https://example.com/x.png',sourceUrl:'https://example.com',label:'x'};
  assert.throws(()=>applyComponentry(base,unsafe));
});
