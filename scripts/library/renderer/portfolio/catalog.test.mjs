import test from 'node:test';
import assert from 'node:assert/strict';
import {portfolioSpec,validatePortfolio} from './catalog.mjs';
import {fixture,scenarios} from './fixtures.mjs';
test('가상 입력 네 종류를 동일한 참조 JSON에 결합한다',()=>{
  for(const key of Object.keys(scenarios))assert.equal(validatePortfolio(portfolioSpec,fixture(key)).content.fictional,true);
  assert.equal(fixture('many').projects.length,8);
  assert.ok(fixture('no-images').projects.every(p=>p.image===null));
});
test('잘못된 구조, 등록되지 않은 부품, 임의 입력과 참조를 차단한다',()=>{
  const edits=[s=>s.elements.page.children.push('page'),s=>s.elements.intro.type='RawHtml',s=>s.elements.intro.props.profile={$state:'/secret'},s=>s.elements.orphan={type:'Hero',props:{}},s=>s.elements.page.children.pop(),s=>s.elements.projects.props.html='<script>1</script>',s=>s.elements.intro.on={click:{action:'fetch'}}];
  for(const edit of edits){const spec=structuredClone(portfolioSpec);edit(spec);assert.throws(()=>validatePortfolio(spec,fixture()));}
});
test('가상 표시, 예제 연락처, 안전한 자산과 유효한 근거를 요구한다',()=>{
  const edits=[d=>d.fictional=false,d=>d.contact.email='person@real.test',d=>d.projects[0].image='javascript:alert(1)',d=>d.projects[0].evidenceIds=['missing'],d=>d.projects[1].id=d.projects[0].id,d=>d.evidence[0].id='intro',d=>d.projects[0].title='긴 제목'.repeat(100)];
  for(const edit of edits){const data=fixture();edit(data);assert.throws(()=>validatePortfolio(portfolioSpec,data));}
});
test('섹션의 순서 변경은 콘텐츠를 바꾸지 않는다',()=>{
  const spec=structuredClone(portfolioSpec),data=fixture();
  spec.elements.page.children=['intro','career','projects','cases','evidence','contact'];
  assert.deepEqual(validatePortfolio(spec,data).content,data);
});
