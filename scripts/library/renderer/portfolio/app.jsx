import React from 'react';
import {createRoot} from 'react-dom/client';
import {Portfolio} from './registry.jsx';
import {portfolioSpec} from './catalog.mjs';
import {fixture,scenarios} from './fixtures.mjs';

function App(){
  const initial=new URLSearchParams(location.search).get('scenario');
  const [scenario,setScenario]=React.useState(Object.hasOwn(scenarios,initial)?initial:'standard');
  const [jsonOpen,setJsonOpen]=React.useState(false);
  const data=fixture(scenario);
  function change(value){setScenario(value);const url=new URL(location.href);url.searchParams.set('scenario',value);history.replaceState(null,'',url);}
  return <><div className="preview-toolbar"><a href="../../../Expresso%20개발%20포털.dc.html#/library">← 라이브러리</a><div><label htmlFor="scenario">입력 예제</label><select id="scenario" value={scenario} onChange={e=>change(e.target.value)}>{Object.entries(scenarios).map(([value,label])=><option value={value} key={value}>{label}</option>)}</select></div><button type="button" aria-expanded={jsonOpen} aria-controls="composition-json" onClick={()=>setJsonOpen(!jsonOpen)}>구성 JSON</button><a href={`./${scenario}.static.html`} target="_blank" rel="noopener">정적 페이지 ↗</a><a href={`./${scenario}.static.html`} download>HTML 저장 ↓</a></div>{jsonOpen&&<section className="json-panel" id="composition-json" aria-label="페이지 구성 JSON"><p>이 구성 JSON이 아래 여섯 섹션의 종류와 순서를 정합니다. 본문은 가상 데이터에서 참조합니다.</p><pre>{JSON.stringify(portfolioSpec,null,2)}</pre><a href={`./${scenario}.json`} download>구성·데이터 JSON 저장 ↓</a></section>}<Portfolio key={scenario} spec={portfolioSpec} content={data}/><aside className="preview-sources">조합 예제 · <a href="./generation-schema.json" target="_blank" rel="noopener">구성 계약</a> · <a href="./sources.json" target="_blank" rel="noopener">컴포넌트 출처</a> · <a href="./THIRD-PARTY-NOTICES.txt" target="_blank" rel="noopener">이용 조건</a></aside></>;
}
createRoot(document.getElementById('root')).render(<App/>);
