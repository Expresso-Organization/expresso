import React from 'react';
import {defineRegistry,Renderer,StateProvider,VisibilityProvider,ActionProvider} from '@json-render/react';
import {registry as original} from '../registry.jsx';
import {catalog,compilePlan,designDirections} from './catalog.mjs';
import {mountPortfolioMotion} from './motion.mjs';
import {ProjectShowcase,VisualProjectIndex,CaseVisual} from './showcase.jsx';

// 수집 코드가 연결된 기존 소개·카드·경력·연락처 구현을 그대로 재사용합니다.
function Existing({name,props,children}){const View=original[name];return <View element={{type:name,props}}>{children}</View>;}
function Page({props,children}){
  const ref=React.useRef(null);
  React.useLayoutEffect(()=>mountPortfolioMotion(ref.current),[props.motion.preset]);
  return <div ref={ref} className="variant-shell" data-recipe={props.recipe} data-design={designDirections[props.recipe]} data-motion-preset={props.motion.preset}><Existing name="PortfolioPage" props={{profile:props.profile}}>{children}</Existing></div>;
}
function Hero({profile,projects,recipe}){
  const poster=recipe==='gallery';
  return <section className={'hero v-hero-'+designDirections[recipe]} id="intro">
    <div className="v-hero-masthead"><p className="eyebrow">{profile.role}</p><span>{poster?'SELECTED WORK / PORTFOLIO':'DESIGN JOURNAL / PORTFOLIO'}</span></div>
    <div className="visual-hero-main"><div className="visual-hero-copy">
      {poster?<p className="v-poster-name" data-reveal="hero-label">{profile.name}<span aria-hidden="true">↘</span></p>:<p className="v-editorial-byline" data-reveal="hero-label">{profile.name}의 포트폴리오</p>}
      <h1 data-reveal="hero-title">{profile.headline}</h1>
    </div><ProjectShowcase projects={projects} recipe={recipe}/><div className="hero-bottom" data-reveal="hero-intro"><p>{profile.intro}</p><a className="text-link" href="#work">작업 살펴보기 <span aria-hidden="true">↘</span></a></div></div>
    <div className="hero-meta" data-reveal="hero-meta"><p>{profile.location}</p><ul aria-label="전문 분야">{profile.focus.map(f=><li key={f}>{f}</li>)}</ul></div>
  </section>;
}
const fieldLabels={problem:'문제 정의',contribution:'담당 작업',outcome:'결과와 한계'};
function CaseHeading({project,ordinal}){return <header className="v-case-heading" data-reveal="section"><p className="eyebrow">CASE {String(ordinal).padStart(2,'0')} / {project.category}</p><h2>{project.title}</h2><p className="v-case-summary">{project.summary}</p><dl className="v-case-meta"><div><dt>역할</dt><dd>{project.role}</dd></div><div><dt>기간</dt><dd>{project.period}</dd></div></dl><ul className="tags">{project.tags.map(t=><li key={t}>{t}</li>)}</ul></header>;}
function Facts({project}){return <div className="v-case-facts">{['problem','contribution','outcome'].map(field=><div className="v-fact" key={field} data-source={`projects/${project.id}/${field}`}><h3>{fieldLabels[field]}</h3><p>{project[field]}</p></div>)}</div>;}
function Sources({project}){return <footer className="v-case-sources"><span className="eyebrow">관련 자료</span><ul>{project.artifacts.map(e=><li key={e.id}><a href={`#${e.id}`}>{e.title} <span aria-hidden="true">↗</span></a></li>)}</ul><a className="v-back" href="#work">목록으로 ↑</a></footer>;}
function CaseStudy({project,variant,ordinal}){
  return <article id={`case-${project.id}`} className={'section v-case v-case-'+variant} data-case-id={project.id} data-variant={variant}>
    <CaseHeading project={project} ordinal={ordinal}/>
    {variant==='media'&&<figure className="v-case-visual"><CaseVisual project={project}/><figcaption>{project.imageAlt}</figcaption></figure>}
    {variant!=='media'&&<CaseVisual project={project}/>}
    {variant==='process'?<ol className="v-process-steps" aria-label={`${project.title} 설계 과정`}>{project.process.map((field,i)=><li key={field} data-reveal="step" data-motion-index={i} data-source={`projects/${project.id}/${field}`}><span className="v-step-number" aria-hidden="true">{String(i+1).padStart(2,'0')}</span><h3>{fieldLabels[field]}</h3><p>{project[field]}</p></li>)}</ol>:<Facts project={project}/>}
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
  PortfolioPage:({props,children})=><Page props={props}>{children}</Page>,
  Hero:({props})=><Hero {...props}/>,
  ProjectShowcase:({props})=><ProjectShowcase {...props}/>,
  ProjectIndex:({props})=><VisualProjectIndex {...props}/>,
  ProjectCaseStudy:({props})=><CaseStudy {...props}/>,
  CareerTimeline:({props})=><Existing name="CareerTimeline" props={props}/>,
  EvidenceCollection:({props})=><Evidence {...props}/>,
  Contact:({props})=><Existing name="Contact" props={props}/>
}});
export function Portfolio({plan,content}){
  const compiled=compilePlan(plan,content);
  return <StateProvider key={JSON.stringify([plan,content])} initialState={compiled.state}><VisibilityProvider><ActionProvider handlers={{}}><Renderer spec={compiled.spec} registry={registry}/></ActionProvider></VisibilityProvider></StateProvider>;
}

// 라이브러리도 생성 페이지와 동일한 카탈로그·Registry를 사용합니다.
export function MotionComponentPreview({component,plan,content}){
  const compiled=compilePlan(plan,content),ref=React.useRef(null);
  React.useLayoutEffect(()=>mountPortfolioMotion(ref.current,{replayScroll:false}),[component,plan.motion.preset,plan.recipe]);
  let node=Object.values(compiled.spec.elements).find(el=>el.type===component);
  if(component==='ProjectShowcase')node={type:component,props:{projects:compiled.state.projects,recipe:plan.recipe},children:[]};
  if(!node)throw new Error('등록되지 않은 미리보기 컴포넌트: '+component);
  const spec={root:'sample',elements:{sample:node}};
  return <div ref={ref} className="variant-shell motion-component-preview" data-recipe={plan.recipe} data-design={designDirections[plan.recipe]} data-motion-preset={plan.motion.preset} onClick={event=>{
    const link=event.target.closest('a[href^="#"]');if(link){event.preventDefault();location.href=`./index.html?recipe=${plan.recipe}&motion=${plan.motion.preset}${link.getAttribute('href')}`;}
  }}><StateProvider initialState={compiled.state}><VisibilityProvider><ActionProvider handlers={{}}><Renderer spec={spec} registry={registry}/></ActionProvider></VisibilityProvider></StateProvider></div>;
}
