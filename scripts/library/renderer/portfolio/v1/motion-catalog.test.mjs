import test from 'node:test';
import assert from 'node:assert/strict';
import {componentMotions,motionSupportFor} from './motion-catalog.mjs';
import {compilePlan,defaultPlan} from './catalog.mjs';
import {fixture} from './fixtures.mjs';
test('생성에 사용하는 모든 컴포넌트와 내부 전시의 모션 지원을 연결한다',()=>{
 const content=fixture(),compiled=compilePlan(defaultPlan(content),content);
 assert.equal(componentMotions.length,9);
 assert.equal(new Set(componentMotions.map(c=>c.id)).size,9);
 assert.equal(compiled.motionSupport.length,7);
 const selected=compilePlan(defaultPlan(content,'gallery','showcase',{projectIndex:'orbit',heroAnnotation:'drawn'}),content);
 assert.equal(selected.spec.elements.work.type,'OrbitProjectIndex');
 assert.deepEqual(selected.motionSupport.filter(c=>c.sourceItemId).map(c=>c.id),['orbit','annotation']);
 assert.ok(compiled.motionSupport.some(c=>c.component==='ProjectShowcase'));
 for(const preset of ['none','subtle','showcase'])assert.equal(motionSupportFor(['Hero'],preset).length,2);
});
test('미등록 컴포넌트와 지원하지 않는 모션을 생성 후보로 통과시키지 않는다',()=>{
 assert.throws(()=>motionSupportFor(['Unregistered'],'showcase'));
 assert.throws(()=>motionSupportFor(['Hero'],'arbitrary-animation'));
});
test('타임라인 고유 모션은 노드·선·본문을 분리하고 부모에 중첩하지 않는다',()=>{
 const timeline=componentMotions.find(c=>c.id==='timeline');
 assert.deepEqual(timeline.bindings.map(b=>b.cue),['section','timeline-node','timeline-line','timeline-copy']);
 assert.ok(!timeline.bindings.some(b=>b.selector==='.career-item'));
});
