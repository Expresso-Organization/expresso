import test from 'node:test';
import assert from 'node:assert/strict';
import {componentMotions,motionSupportFor} from './motion-catalog.mjs';
import {compilePlan,defaultPlan,selectedComponents,bentoComponents} from './catalog.mjs';
import {fixture} from './fixtures.mjs';
test('생성에 사용하는 모든 컴포넌트와 내부 전시의 모션 지원을 연결한다',()=>{
 const content=fixture(),compiled=compilePlan(defaultPlan(content),content);
 assert.equal(componentMotions.length,17);
 assert.equal(new Set(componentMotions.map(c=>c.id)).size,17);
 assert.deepEqual(componentMotions.filter(c=>['gradient-hero','spotlight-hero','mosaic'].includes(c.id)).map(c=>c.sourceItemId),['componentry-gradient-hero-01','watermelon-90f22f5a2c5f6a52','watermelon-cdd2cb9bdb3a432e']);
 assert.equal(compiled.motionSupport.length,7);
 const selected=compilePlan(defaultPlan(content,'gallery','showcase',selectedComponents),content);
 assert.equal(selected.spec.elements.work.type,'OrbitProjectIndex');
 assert.equal(selected.motionSupport.length,9);
 assert.equal(compilePlan(defaultPlan(content,'gallery','showcase',bentoComponents),content).motionSupport.length,9);
 assert.deepEqual(selected.motionSupport.filter(c=>c.sourceItemId).map(c=>c.id),['orbit','career-ribbon','evidence-previews','contact-card','annotation','headline-lines']);
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
