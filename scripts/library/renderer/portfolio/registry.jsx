import React from 'react';
import {defineRegistry,Renderer,StateProvider,VisibilityProvider,ActionProvider} from '@json-render/react';
import {Card,CardHeader,CardTitle,CardDescription,CardContent,CardFooter} from '@collected/card';
import {Timeline,TimelineItem,TimelineConnectItem} from '@collected/timeline';
import {AnnotatedText} from '@collected/annotated-text';
import {catalog,validatePortfolio} from './catalog.mjs';

function Heading({number,kicker,title,description}){
  return <header className="section-heading"><p className="eyebrow"><span>{number}</span>{kicker}</p><div><h2>{title}</h2>{description&&<p>{description}</p>}</div></header>;
}
function ProjectImage({project}){
  const [failed,setFailed]=React.useState(false);
  return project.image&&!failed?<img src={project.image} alt={project.imageAlt} onError={()=>setFailed(true)} width="960" height="720" loading="lazy"/>:<div className="image-fallback"><span>PROJECT / {project.id.toUpperCase()}</span><strong>{project.title}</strong><p>{project.category}</p></div>;
}
export const {registry}=defineRegistry(catalog,{components:{
  PortfolioPage:({children,props:{profile}})=><div className="portfolio"><a className="skip-link" href="#intro">본문 바로가기</a><div className="fictional-notice">가상 포트폴리오 예제 <span>인물·조직·경력·성과는 시연용으로 작성했습니다.</span></div><header className="page-nav"><a className="wordmark" href="#intro">{profile.monogram}<span> / PORTFOLIO</span></a><nav aria-label="포트폴리오 목차"><a href="#work">프로젝트</a><a href="#career">경력</a><a href="#contact">연락처</a></nav></header><main>{children}</main><footer className="page-footer"><span>{profile.name} · 가상 인물</span><a href="#intro">맨 위로 ↑</a><span>FICTIONAL PORTFOLIO</span></footer></div>,
  Hero:({props:{profile}})=>{
    const parts=profile.headline.split(profile.highlight);
    return <section className="hero" id="intro"><p className="eyebrow">{profile.role} <span> / {profile.name}</span></p><h1>{parts.length===2?<>{parts[0]}<AnnotatedText variant="underline" animate={false} color="text-primary">{profile.highlight}</AnnotatedText>{parts[1]}</>:profile.headline}</h1><div className="hero-bottom"><p>{profile.intro}</p><a className="text-link" href="#work">작업 살펴보기 <span aria-hidden="true">↘</span></a></div><div className="hero-meta"><p>{profile.location}</p><ul aria-label="전문 분야">{profile.focus.map(f=><li key={f}>{f}</li>)}</ul></div></section>;
  },
  ProjectGrid:({props:{projects}})=><section className="section work" id="work"><Heading number="01" kicker="SELECTED WORK" title="생각을 형태로 만든 작업" description="탐색과 기록, 일상의 작은 선택을 다룬 가상 프로젝트입니다."/><div className="project-grid">{projects.map((p,i)=><Card key={p.id} className="project-card"><a className="project-cover" href={`#case-${p.id}`} aria-label={`${p.title} 사례 상세`}><ProjectImage project={p}/><span className="cover-arrow" aria-hidden="true">↗</span></a><CardHeader><p className="eyebrow">{String(i+1).padStart(2,'0')} / {p.category}</p><CardTitle><h3><a href={`#case-${p.id}`}>{p.title}</a></h3></CardTitle><CardDescription>{p.period}</CardDescription></CardHeader><CardContent><p>{p.summary}</p></CardContent><CardFooter><ul className="tags">{p.tags.map(tag=><li key={tag}>{tag}</li>)}</ul></CardFooter></Card>)}</div></section>,
  CaseStudies:({props:{projects}})=><section className="section cases" aria-labelledby="cases-title"><Heading number="02" kicker="BEHIND THE WORK" title={<span id="cases-title">문제부터 설계의 이유까지</span>}/>{projects.map(p=><article className="case" id={`case-${p.id}`} key={p.id}><header><p className="eyebrow">{p.category}</p><h3>{p.title}</h3><p>{p.role}</p><a className="text-link" href="#work">목록으로 ↑</a></header><div className="case-body"><div><h4>문제</h4><p>{p.problem}</p></div><div><h4>담당 작업</h4><p>{p.contribution}</p></div><div><h4>결과</h4><p>{p.outcome}</p></div><ul className="evidence-links">{p.evidenceIds.map((id,i)=><li key={id}><a href={`#${id}`}>설계 근거 {i+1} ↗</a></li>)}</ul></div></article>)}</section>,
  CareerTimeline:({props:{career}})=><section className="section career" id="career"><Heading number="03" kicker="EXPERIENCE" title="경험이 쌓인 방향" description="역할과 담당 작업을 보여주기 위한 가상 경력입니다."/><Timeline className="career-timeline">{career.map(c=><TimelineItem className="career-item" key={c.id}><TimelineConnectItem><span className="timeline-dot"/></TimelineConnectItem><div><p className="eyebrow">{c.period}</p><h3>{c.role}</h3><p className="organization">{c.organization}</p><p>{c.description}</p></div></TimelineItem>)}</Timeline></section>,
  EvidenceList:({props:{evidence}})=><section className="section evidence" id="evidence"><Heading number="04" kicker="NOTES & ARTIFACTS" title="선택의 이유를 남기는 기록" description="자료를 펼치면 각 가상 프로젝트의 설계 내용을 읽을 수 있습니다."/><div className="evidence-grid">{evidence.map(e=><details key={e.id} id={e.id}><summary><span className="eyebrow">{e.kind}</span><strong>{e.title}</strong><span className="artifact-description">{e.summary}</span><span className="detail-sign" aria-hidden="true">+</span></summary><p>{e.body}</p></details>)}</div></section>,
  Contact:({props:{contact}})=><section className="contact" id="contact"><p className="eyebrow">LET’S TALK</p><h2>{contact.heading}</h2><a href={`mailto:${contact.email}`} className="contact-link">{contact.email} <span aria-hidden="true">↗</span></a><p>{contact.description} 연락처는 예시 주소입니다.</p></section>
}});

export function Portfolio({spec,content}){
  const valid=validatePortfolio(spec,content);
  return <StateProvider initialState={valid.content}><VisibilityProvider><ActionProvider handlers={{}}><Renderer spec={valid.spec} registry={registry}/></ActionProvider></VisibilityProvider></StateProvider>;
}
