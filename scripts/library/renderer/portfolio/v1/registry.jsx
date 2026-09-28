import React from 'react';
import {defineRegistry,Renderer,StateProvider,VisibilityProvider,ActionProvider} from '@json-render/react';
import {registry as original} from '../registry.jsx';
import {catalog,compilePlan} from './catalog.mjs';

// 수집 코드가 연결된 기존 소개·카드·경력·연락처 구현을 그대로 재사용합니다.
function Existing({name,props,children}){const View=original[name];return <View element={{type:name,props}}>{children}</View>;}
function Image({project}){
  const [failed,setFailed]=React.useState(false);
  return project.image&&!failed?<img src={project.image} alt={project.imageAlt} width="960" height="720" loading="lazy" onError={()=>setFailed(true)}/>:<div className="image-fallback" role="img" aria-label={`${project.title} 이미지 대신 제목 표시`}><span>PROJECT / {project.id.toUpperCase()}</span><strong>{project.title}</strong><p>{project.category}</p></div>;
}
const fieldLabels={problem:'문제 정의',contribution:'담당 작업',outcome:'결과와 한계'};
function CaseHeading({project,ordinal}){return <header className="v-case-heading"><p className="eyebrow">CASE {String(ordinal).padStart(2,'0')} / {project.category}</p><h2>{project.title}</h2><p className="v-case-summary">{project.summary}</p><dl className="v-case-meta"><div><dt>역할</dt><dd>{project.role}</dd></div><div><dt>기간</dt><dd>{project.period}</dd></div></dl><ul className="tags">{project.tags.map(t=><li key={t}>{t}</li>)}</ul></header>;}
function Facts({project}){return <div className="v-case-facts">{['problem','contribution','outcome'].map(field=><div className="v-fact" key={field} data-source={`projects/${project.id}/${field}`}><h3>{fieldLabels[field]}</h3><p>{project[field]}</p></div>)}</div>;}
function Sources({project}){return <footer className="v-case-sources"><span className="eyebrow">관련 자료</span><ul>{project.artifacts.map(e=><li key={e.id}><a href={`#${e.id}`}>{e.title} <span aria-hidden="true">↗</span></a></li>)}</ul><a className="v-back" href="#work">목록으로 ↑</a></footer>;}
function CaseStudy({project,variant,ordinal}){
  return <article id={`case-${project.id}`} className={'section v-case v-case-'+variant} data-case-id={project.id} data-variant={variant}>
    <CaseHeading project={project} ordinal={ordinal}/>
    {variant==='media'&&<figure className="v-case-visual"><Image project={project}/><figcaption>{project.imageAlt}</figcaption></figure>}
    {variant==='process'?<ol className="v-process-steps" aria-label={`${project.title} 설계 과정`}>{project.process.map((field,i)=><li key={field} data-source={`projects/${project.id}/${field}`}><span className="v-step-number" aria-hidden="true">{String(i+1).padStart(2,'0')}</span><h3>{fieldLabels[field]}</h3><p>{project[field]}</p></li>)}</ol>:<Facts project={project}/>}
    <Sources project={project}/>
  </article>;
}
function EvidenceBody({item}){
  const boundary=item.body.indexOf('. ');
  if(item.body.includes(' → ')&&boundary>0){
    const steps=item.body.slice(0,boundary).split(' → '),rest=item.body.slice(boundary+2);
    return <div className="v-artifact-body" data-evidence-body={item.id}><ol className="v-evidence-steps">{steps.map((step,i)=><li key={i}>{step}</li>)}</ol><p>{rest}</p></div>;
  }
  return <div className="v-artifact-body" data-evidence-body={item.id}><p>{item.body}</p></div>;
}
function Evidence({groups,variant}){
  return <section className={'section v-evidence v-evidence-'+variant} id="evidence"><header className="section-heading"><p className="eyebrow">NOTES & ARTIFACTS</p><div><h2>설계를 설명하는 근거</h2><p>각 프로젝트의 판단과 과정을 기록한 가상 자료입니다.</p></div></header><div className="v-evidence-groups">{groups.map(group=><div className="v-evidence-group" key={group.id}><h3 className="v-group-title">{group.projectIds.length===1?<a href={`#case-${group.projectIds[0]}`}>{group.title} ↗</a>:group.title}</h3><div className="v-artifacts">{group.items.map(e=>variant==='grouped'?<details className="v-artifact" id={e.id} key={e.id}><summary><span className="eyebrow">{e.kind}</span><strong>{e.title}</strong><span>{e.summary}</span><span className="v-disclosure-sign" aria-hidden="true">+</span></summary><EvidenceBody item={e}/></details>:<article className="v-artifact" id={e.id} key={e.id}><header><span className="eyebrow">{e.kind}</span><h4>{e.title}</h4><p>{e.summary}</p></header><EvidenceBody item={e}/></article>)}</div></div>)}</div></section>;
}
export const {registry}=defineRegistry(catalog,{components:{
  PortfolioPage:({props,children})=><div className="variant-shell" data-recipe={props.recipe}><Existing name="PortfolioPage" props={{profile:props.profile}}>{children}</Existing></div>,
  Hero:({props})=><Existing name="Hero" props={props}/>,
  ProjectIndex:({props:{projects,variant}})=>variant==='gallery'?<div className="v-gallery-index"><Existing name="ProjectGrid" props={{projects}}/></div>:<section className="section v-project-index" id="work"><header className="section-heading"><p className="eyebrow">SELECTED WORK</p><div><h2>프로젝트 인덱스</h2><p>대표 사례의 화면과 설계 과정을 이어서 살펴보세요.</p></div></header><ol>{projects.map((p,i)=><li key={p.id}><span className="v-index-number" aria-hidden="true">{String(i+1).padStart(2,'0')}</span><div><h3><a href={`#case-${p.id}`}>{p.title} <span aria-hidden="true">↘</span></a></h3><p>{p.category}</p></div><div className="v-index-meta"><span>{p.period}</span><p>{p.role}</p></div></li>)}</ol></section>,
  ProjectCaseStudy:({props})=><CaseStudy {...props}/>,
  CareerTimeline:({props})=><Existing name="CareerTimeline" props={props}/>,
  EvidenceCollection:({props})=><Evidence {...props}/>,
  Contact:({props})=><Existing name="Contact" props={props}/>
}});
export function Portfolio({plan,content}){
  const compiled=compilePlan(plan,content);
  return <StateProvider key={JSON.stringify([plan,content])} initialState={compiled.state}><VisibilityProvider><ActionProvider handlers={{}}><Renderer spec={compiled.spec} registry={registry}/></ActionProvider></VisibilityProvider></StateProvider>;
}
