import test from 'node:test';
import assert from 'node:assert/strict';
import {planSchema,compilePlan,defaultPlan,validatePlan,candidates} from './catalog.mjs';
import {fixture,scenarios} from './fixtures.mjs';

test('두 구성안과 네 입력에서 각 프로젝트를 한 번씩 연결하고 원문을 보존한다',()=>{
  for(const scenario of Object.keys(scenarios))for(const recipe of ['featured','gallery']){
    const content=fixture(scenario),result=compilePlan(defaultPlan(content,recipe),content);
    assert.equal(result.plan.cases.length,content.projects.length);
    assert.equal(result.spec.elements.page.children.length,content.projects.length+5);
    for(const p of content.projects){
      const view=result.state.projectById[p.id];
      for(const key of Object.keys(p))assert.deepEqual(view[key],p[key]);
      assert.deepEqual(view.artifacts.map(e=>e.id),p.evidenceIds);
    }
    assert.deepEqual(result.state.evidenceGroups.flatMap(g=>g.items.map(e=>e.id)).sort(),content.evidence.map(e=>e.id).sort());
  }
});
test('표현 후보는 이미지와 과정 데이터의 유무에 맞춰 좁힌다',()=>{
  const data=fixture('no-images');
  assert.deepEqual(candidates(data.projects[0]),['text']);
  assert.deepEqual(candidates(data.projects[1]),['text','process']);
  const plan=defaultPlan(data);plan.cases[0].variant='media';assert.throws(()=>validatePlan(plan,data));
  plan.cases[0].variant='process';assert.throws(()=>validatePlan(plan,data));
});
test('짧은 구성 JSON은 알 수 없는 부품·입력·본문 덮어쓰기를 거부한다',()=>{
  const data=fixture(),base=defaultPlan(data);
  for(const edit of [p=>p.cases.pop(),p=>p.cases[0].projectId='missing',p=>p.cases[1].projectId=p.cases[0].projectId,p=>p.cases[0].variant='raw-html',p=>p.css='body{}',p=>p.cases[0].text='원문 교체']){
    const p=structuredClone(base);edit(p);assert.throws(()=>validatePlan(p,data));
  }
  assert.ok(planSchema.safeParse(base).success);
});
test('프로젝트 순서를 바꿔도 ID 참조와 내용 연결이 유지된다',()=>{
  const data=fixture(),plan=defaultPlan(data);plan.cases.reverse();
  const result=compilePlan(plan,data);
  assert.equal(result.spec.elements['case-moa'].props.project.$state,'/projectById/moa');
  assert.equal(result.state.projects[0].id,'ongil');
  assert.equal(result.state.projectById.moa.problem,data.projects[0].problem);
});
test('공유 근거는 중복 앵커 없이 한 번만 표시한다',()=>{
  const data=fixture();data.projects[0].id='shared';data.projects[1].evidenceIds.push('moa-flow');
  const result=compilePlan(defaultPlan(data),data);
  assert.equal(result.state.evidenceGroups.flatMap(g=>g.items).filter(e=>e.id==='moa-flow').length,1);
  assert.ok(result.state.evidenceGroups.some(g=>g.id==='group-shared'));
  assert.equal(new Set(result.state.evidenceGroups.map(g=>g.id)).size,result.state.evidenceGroups.length);
});
test('앵커 충돌, 유실된 근거, 불완전한 과정 참조를 거부한다',()=>{
  for(const edit of [d=>d.projects[0].evidenceIds=['missing'],d=>d.evidence[0].id='intro',d=>d.projects[1].process=['problem'],d=>d.projects[1].process=['problem','problem','outcome']]){
    const data=fixture();edit(data);assert.throws(()=>defaultPlan(data));
  }
});

test('모션은 허용된 프리셋만 받고 이전 계획은 움직임 없이 해석한다',()=>{
  const data=fixture(),plan=defaultPlan(data,'gallery','subtle');
  assert.deepEqual(compilePlan(plan,data).spec.elements.page.props.motion,{preset:'subtle'});
  for(const motion of [{preset:'unknown'},{preset:'showcase',duration:9000},{code:'alert(1)'}])assert.throws(()=>validatePlan({...plan,motion},data));
  delete plan.motion;assert.deepEqual(validatePlan(plan,data).plan.motion,{preset:'none'});
});
