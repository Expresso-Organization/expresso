import React from 'react';
import {createRoot} from 'react-dom/client';
import {Portfolio} from './registry.jsx';
import {defaultPlan,recipes,caseVariants,evidenceVariants} from './catalog.mjs';
import {motionPresets,defaultMotion,variantFile} from './motion.mjs';
import {fixture,scenarios} from './fixtures.mjs';

function App(){
  const query=new URLSearchParams(location.search);
  const [recipe,setRecipe]=React.useState(Object.hasOwn(recipes,query.get('recipe'))?query.get('recipe'):'featured');
  const [scenario,setScenario]=React.useState(Object.hasOwn(scenarios,query.get('scenario'))?query.get('scenario'):'standard');
  const [motion,setMotion]=React.useState(Object.hasOwn(motionPresets,query.get('motion'))?query.get('motion'):defaultMotion(recipe));
  const [reduced,setReduced]=React.useState(()=>matchMedia('(prefers-reduced-motion: reduce)').matches);
  React.useEffect(()=>{const media=matchMedia('(prefers-reduced-motion: reduce)'),update=()=>setReduced(media.matches);media.addEventListener('change',update);return ()=>media.removeEventListener('change',update);},[]);
  const [showPlan,setShowPlan]=React.useState(false);
  const content=fixture(scenario),plan=defaultPlan(content,recipe,motion),file=variantFile(recipe,scenario,motion);
  function update(key,value){
    const url=new URL(location.href);
    if(key==='recipe'){setRecipe(value);setMotion(defaultMotion(value));url.searchParams.delete('motion');}
    else if(key==='motion')setMotion(value);else setScenario(value);
    url.searchParams.set(key,value);history.replaceState(null,'',url);
  }
  return <><div className="preview-toolbar"><a href="../../../Expresso%20개발%20포털.dc.html#/library">← 라이브러리</a><div><label htmlFor="recipe">디자인 방향</label><select id="recipe" value={recipe} onChange={e=>update('recipe',e.target.value)}>{Object.entries(recipes).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></div><div><label htmlFor="scenario">입력 예제</label><select id="scenario" value={scenario} onChange={e=>update('scenario',e.target.value)}>{Object.entries(scenarios).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></div><div><label htmlFor="motion">모션</label><select id="motion" value={motion} onChange={e=>update('motion',e.target.value)}>{Object.entries(motionPresets).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></div><button type="button" disabled={motion==='none'||reduced} onClick={()=>document.querySelector('.variant-shell')?.dispatchEvent(new Event('portfolio-motion-replay'))}>다시 재생</button>{reduced&&<span className="motion-status" role="status">시스템 모션 감소 적용 중</span>}<button type="button" aria-expanded={showPlan} aria-controls="composition-json" onClick={()=>setShowPlan(!showPlan)}>구성 JSON</button><a href={`./${file}.static.html`} target="_blank" rel="noopener">정적 페이지 ↗</a><a href={`./${file}.static.html`} download>HTML 저장 ↓</a></div>{showPlan&&<section id="composition-json" className="json-panel" aria-label="구성 JSON"><p>디자인 방향에 따라 색·서체·첫 화면·프로젝트 배치가 함께 바뀝니다. 같은 가상 콘텐츠를 유지하며 프로젝트별 표현과 근거 표시를 지정합니다.</p><pre>{JSON.stringify(plan,null,2)}</pre><ul>{plan.cases.map(c=><li key={c.projectId}>{content.projects.find(p=>p.id===c.projectId).title} · {caseVariants[c.variant]}</li>)}<li>근거 자료 · {evidenceVariants[plan.evidence]}</li></ul><a href={`./${file}.json`} download>구성·데이터·spec 저장 ↓</a></section>}<Portfolio key={file} plan={plan} content={content}/><aside className="preview-sources">가상 데이터 조합 예제 · <a href="./variants-plan-schema.json" target="_blank" rel="noopener">구성 계약</a> · <a href="./variants-sources.json" target="_blank" rel="noopener">구현 출처</a> · <a href="./baseline.html">초기 구성</a> · <a href="../../../portfolio-generation-comparison.html">자유 생성과 비교</a></aside></>;
}
createRoot(document.getElementById('root')).render(<App/>);
