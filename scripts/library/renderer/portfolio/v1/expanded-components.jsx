import React from 'react';
import {Card,CardContent,CardHeader,CardTitle,CardDescription,CardFooter} from '@collected/card';
import {AnnotatedHeading} from './selected-components.jsx';

// 원본 제목을 바꾸지 않고 줄별 등장 순서를 제어합니다.
export function HeadlineLines({text,highlight,annotation}){
  const lines=text.split('\n');
  const target=highlight&&text.includes(highlight)?lines.findIndex(line=>line.includes(highlight)):0;
  return lines.map((line,index)=><span className="v-headline-line" data-reveal="hero-line" data-motion-index={index} key={index}>
    {annotation==='drawn'&&index===target?<AnnotatedHeading text={line} highlight={highlight}/>:line}
  </span>);
}

export function BentoProjectIndex({projects}){
  return <section className="section bento-index" id="work" aria-labelledby="bento-title">
    <header className="section-heading" data-reveal="section"><p className="eyebrow">SELECTED WORK / {String(projects.length).padStart(2,'0')}</p><div><h2 id="bento-title">작업의 장면들</h2><p>화면과 설계 과정을 프로젝트별로 살펴보세요.</p></div></header>
    <div className="bento-project-grid">{projects.map((project,index)=><Card className="bento-project" key={project.id} data-reveal="card" data-motion-index={index}>
      <CardContent><a className="bento-project-cover" href={`#case-${project.id}`} aria-label={`${project.title} 사례 상세`}>{project.image?<img src={project.image} alt={project.imageAlt||`${project.title} 화면`} loading="lazy"/>:<span className="bento-project-fallback"><strong>{project.title}</strong><small>{project.category}</small></span>}<span className="bento-project-arrow" aria-hidden="true">↗</span></a></CardContent>
      <CardHeader><p className="eyebrow">{String(index+1).padStart(2,'0')} / {project.category}</p><CardTitle><h3><a href={`#case-${project.id}`}>{project.title}</a></h3></CardTitle><CardDescription>{project.summary}</CardDescription></CardHeader>
      <CardFooter><span>{project.period}</span><a href={`#case-${project.id}`}>사례 보기 ↗</a></CardFooter>
    </Card>)}</div>
  </section>;
}

export function CareerRibbon({career}){
  return <section className="section career-ribbon" id="career" aria-labelledby="career-ribbon-title">
    <header className="section-heading" data-reveal="section"><p className="eyebrow">EXPERIENCE</p><div><h2 id="career-ribbon-title">경험이 쌓인 방향</h2><p>기간과 역할, 맡은 작업을 따라 읽어 보세요.</p></div></header>
    <ol className="career-ribbon-list">{career.map((item,index)=><li className="career-ribbon-item" key={item.id}>
      <span className="career-ribbon-count" data-reveal="timeline-node" data-motion-index={index} aria-hidden="true">{String(index+1).padStart(2,'0')}</span>
      <span className="career-ribbon-line" data-reveal="timeline-line" data-motion-index={index} aria-hidden="true"/>
      <div className="career-ribbon-copy" data-reveal="timeline-copy" data-motion-index={index}><p className="eyebrow">{item.period}</p><h3>{item.role}</h3><p className="career-ribbon-organization">{item.organization}</p><p>{item.description}</p></div>
    </li>)}</ol>
  </section>;
}

export function EvidencePreviews({groups}){
  return <section className="section evidence-previews" id="evidence" aria-labelledby="evidence-previews-title">
    <header className="section-heading" data-reveal="section"><p className="eyebrow">NOTES & ARTIFACTS</p><div><h2 id="evidence-previews-title">선택의 근거</h2><p>자료를 펼쳐 프로젝트의 판단과 과정을 읽어 보세요.</p></div></header>
    <div className="evidence-preview-groups">{groups.map(group=><div className="evidence-preview-group" key={group.id}>
      <h3>{group.projectIds.length===1?<a href={`#case-${group.projectIds[0]}`}>{group.title} ↗</a>:group.title}</h3>
      <div className="evidence-preview-grid">{group.items.map((item,index)=><details className="evidence-preview-card" id={item.id} key={item.id} data-reveal="card" data-motion-index={index}>
        <summary><span className="evidence-preview-sign" aria-hidden="true">{String(index+1).padStart(2,'0')}</span><span className="evidence-preview-text"><small>{item.kind}</small><strong>{item.title}</strong><span>{item.summary}</span></span><span className="evidence-preview-toggle" aria-hidden="true">＋</span></summary><div className="evidence-preview-body"><p>{item.body}</p></div>
      </details>)}</div>
    </div>)}</div>
  </section>;
}

export function ContactCard({contact}){
  return <section className="contact contact-card-section" id="contact" aria-labelledby="contact-card-title"><p className="eyebrow" data-reveal="section">LET’S TALK</p>
    <div className="contact-card" data-reveal="card"><div className="contact-card-copy"><h2 id="contact-card-title">{contact.heading}</h2><p>{contact.description} 연락처는 예시 주소입니다.</p></div><a className="contact-card-link" href={`mailto:${contact.email}`}><span>이메일로 이야기하기</span><strong>{contact.email}</strong><span aria-hidden="true">↗</span></a></div>
  </section>;
}
