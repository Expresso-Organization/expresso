import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {motionBridgeTag} from './renderer/source-motion-core.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const read=file=>JSON.parse(fs.readFileSync(path.join(root,file)));
const report=read('docs/library/previews/component-motion-coverage.json');

test('전체 컴포넌트 모션 정책은 확보 상태와 정확히 일치한다',()=>{
 const ids=new Set(report.items.map(item=>item.id));
 assert.equal(ids.size,report.items.length);
 assert.equal(report.items.length,report.summary.total);
 assert.equal(report.items.filter(item=>item.status==='preview_ready').length,report.summary.previewReady);
 assert.equal(report.items.filter(item=>item.status==='awaiting_source').length,report.summary.awaitingSource);
 assert.equal(report.summary.previewReady+report.summary.awaitingSource,report.summary.total);
 assert.equal(report.items.filter(item=>item.strategy==='preserve_native').length,report.summary.preserveNative);
 assert.equal(report.items.filter(item=>item.strategy==='shared_reveal').length,report.summary.sharedReveal);
 const index=read('docs/library/previews/motion-policy-index.json');
 assert.deepEqual(index.summary,report.summary);
 assert.equal(index.items.length,report.items.length);
 for(const item of report.items){
  const policy=index.items.find(entry=>entry.id===item.id);
  assert.ok(policy,item.id);
  assert.equal(policy.status,item.status,item.id);
  assert.equal(policy.strategy,item.strategy,item.id);
  if(item.status==='awaiting_source'){
   assert.equal(item.previewUrl,null,item.id);
   assert.ok(['rights_review','access_blocked'].includes(item.reason),item.id);
  }else{
   assert.ok(['preserve_native','shared_reveal'].includes(item.strategy),item.id);
   assert.ok(['supported','source_supported','host_motion_config','partial_native'].includes(item.reduction),item.id);
  }
 }
});

test('실행 가능한 모든 원본 예제에 모션 브리지가 한 번씩 설치되어 있다',()=>{
 const previewRoot=path.join(root,'docs/library/previews');
 const bridge=fs.readFileSync(path.join(previewRoot,'motion-bridge.js'));
 const source=fs.readFileSync(path.join(root,'scripts/library/renderer/motion-bridge.js'));
 assert.deepEqual(bridge,source);
 const manifest=read('docs/library/previews/motion-bridge-installation.json');
 assert.equal(manifest.installed,report.summary.previewReady);
 assert.equal(manifest.awaitingSource,report.summary.awaitingSource);
 assert.equal(manifest.bridgeSha256,createHash('sha256').update(bridge).digest('hex'));
 for(const item of report.items.filter(item=>item.status==='preview_ready')){
  const file=path.join(root,'docs',item.previewUrl.slice(2));
  const html=fs.readFileSync(file,'utf8');
  const tag=motionBridgeTag(root,item.id);
  assert.equal(html.split(tag).length-1,1,item.id);
  assert.equal((html.match(/data-expresso-motion=/g)||[]).length,1,item.id);
  assert.ok(html.indexOf('vendor.js')<html.indexOf(tag),item.id);
 }
});

test('흔한 UI 문구는 Canvas 및 WebGL 모션으로 오분류하지 않는다',()=>{
 const auth=report.items.find(item=>item.source==='watermelon'&&item.name==='auth-02');
 assert.ok(auth);
 assert.equal(auth.signals.canvas,false);
 assert.equal(auth.strategy,'shared_reveal');
});
