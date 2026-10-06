import test from 'node:test';
import assert from 'node:assert/strict';
import {planSchema,compilePlan,defaultPlan,validatePlan,candidates,selectedComponents,bentoComponents} from './catalog.mjs';
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
test('이름 아래 자기 정의를 줄바꿈 없는 한 문장으로 제한한다',()=>{
 const content=fixture();
 for(const headline of ['복잡한 정보를\n명료하게.','복잡한 정보를 명료하게','정보를 설계합니다. 화면도 만듭니다.']){
  const invalid=structuredClone(content);invalid.profile.headline=headline;
  assert.throws(()=>defaultPlan(invalid),/한 문장/);
 }
 const vague=structuredClone(content);vague.profile.headline='흩어진 단서를 다음 선택으로 잇습니다.';
 assert.throws(()=>defaultPlan(vague),/직무와 전문 분야/);
 const tooLong=structuredClone(content);tooLong.profile.headline='정보 구조와 인터랙션을 설계해 복잡한 자료를 읽기 쉬운 서비스로 만드는 프로덕트 디자이너입니다.';
 assert.throws(()=>defaultPlan(tooLong),/더 짧게/);
 assert.ok(defaultPlan(content));
});

test('모션은 허용된 프리셋만 받고 이전 계획은 움직임 없이 해석한다',()=>{
  const data=fixture(),plan=defaultPlan(data,'gallery','subtle');
  assert.deepEqual(compilePlan(plan,data).spec.elements.page.props.motion,{preset:'subtle'});
  for(const motion of [{preset:'unknown'},{preset:'showcase',duration:9000},{code:'alert(1)'}])assert.throws(()=>validatePlan({...plan,motion},data));
  delete plan.motion;assert.deepEqual(validatePlan(plan,data).plan.motion,{preset:'none'});
});
test('선별 컴포넌트 선택은 허용된 이름만 받고 프로젝트 원문을 유지한다',()=>{
 const data=fixture('many'),plan=defaultPlan(data,'gallery','showcase',selectedComponents);
 const compiled=compilePlan(plan,data);
 assert.equal(compiled.spec.elements.work.type,'OrbitProjectIndex');
 assert.equal(compiled.spec.elements.intro.props.annotation,'drawn');
 assert.equal(compiled.spec.elements.intro.props.reveal,'lines');
 assert.equal(compiled.spec.elements.career.type,'CareerRibbon');
 assert.equal(compiled.spec.elements.evidence.type,'EvidencePreviews');
 assert.equal(compiled.spec.elements.contact.type,'ContactCard');
 assert.deepEqual(compiled.state.projects,data.projects);
 assert.deepEqual(compiled.motionSupport.filter(c=>c.sourceItemId).map(c=>c.id),['orbit','career-ribbon','evidence-previews','contact-card','annotation','headline-lines']);
 assert.equal(compilePlan(defaultPlan(data,'gallery','showcase',bentoComponents),data).spec.elements.work.type,'BentoProjectIndex');
 for(const components of [{projectIndex:'made-up',heroAnnotation:'drawn'},{projectIndex:'orbit',heroAnnotation:'script'},{projectIndex:'orbit',heroAnnotation:'drawn',rawHtml:'<h1>x</h1>'}])assert.throws(()=>validatePlan({...plan,components},data));
});
test('라이브러리 구도와 색·서체·배치를 독립적으로 조합해 원문을 유지한다',()=>{
 const data=fixture('many'),plan=defaultPlan(data,'featured','showcase');
 plan.design={palette:'midnight',typography:'display',layout:'studio'};
 plan.components.heroStyle='spotlight';
 plan.components.projectIndex='mosaic';
 const result=compilePlan(plan,data);
 assert.equal(result.spec.elements.intro.type,'SpotlightHero');
 assert.equal(result.spec.elements.work.type,'MosaicProjectIndex');
 assert.deepEqual(result.spec.elements.page.props.design,plan.design);
 assert.deepEqual(result.state.projects,data.projects);
 assert.deepEqual(result.motionSupport.filter(item=>['spotlight-hero','mosaic'].includes(item.id)).map(item=>item.id),['spotlight-hero','mosaic']);
 plan.components.heroStyle='gradient';
 assert.equal(compilePlan(plan,data).spec.elements.intro.type,'GradientHero');
 for(const design of [{...plan.design,palette:'invented'},{...plan.design,code:'body{}'}])assert.throws(()=>validatePlan({...plan,design},data));
});
