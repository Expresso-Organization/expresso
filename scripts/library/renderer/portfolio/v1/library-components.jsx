import React from 'react';
import {Card,CardContent,CardHeader} from '@collected/card';
import {AnnotatedHeading} from './selected-components.jsx';
import {HeadlineLines} from './expanded-components.jsx';

function Title({profile,annotation,reveal}){
  return <><h1 data-reveal="hero-title">{profile.name}</h1><p className="library-identity" aria-label={reveal==='lines'?profile.headline:undefined} data-reveal={reveal==='lines'?undefined:'hero-definition'}>
    {reveal==='lines'?<HeadlineLines text={profile.headline} highlight={profile.highlight} annotation={annotation}/>:annotation==='drawn'?<AnnotatedHeading text={profile.headline} highlight={profile.highlight}/>:profile.headline}
  </p></>;
}

function ProjectImage({project}){
  return project?.image?<img src={project.image} alt={project.imageAlt||`${project.title} 화면`} loading="eager"/>:<span className="library-image-fallback">{project?.title}</span>;
}

// Componentry gradient-hero-01: 중앙 정렬, 중첩된 빛, 두 개의 행동 경로를 실제 데이터로 바꿉니다.
export function GradientHero({profile,projects,annotation,reveal}){
  const first=projects[0];
  return <section className="hero library-hero gradient-hero" id="intro">
    <div className="gradient-light" aria-hidden="true"/>
    <div className="gradient-hero-content"><p className="gradient-pill" data-reveal="hero-label">{profile.role} · {profile.location}</p>
      <Title profile={profile} annotation={annotation} reveal={reveal}/>
      <p className="gradient-intro" data-reveal="hero-intro">{profile.intro}</p>
      <div className="gradient-actions" data-reveal="hero-meta"><a href="#work">프로젝트 보기 ↗</a><a href="#contact">연락하기 ↗</a></div>
      <ul className="gradient-focus" aria-label="전문 분야">{profile.focus.map(item=><li key={item}>{item}</li>)}</ul>
      {first&&<a className="gradient-feature" href={`#case-${first.id}`} data-reveal="hero-visual"><span className="gradient-feature-image"><ProjectImage project={first}/></span><span className="gradient-feature-copy"><small>FEATURED PROJECT · {first.category}</small><strong>{first.title}</strong><span>{first.summary}</span><em>사례 보기 ↗</em></span></a>}
    </div>
  </section>;
}

// Watermelon hero-40: 밝은 광원과 제목의 순차 등장을 외부 이미지 없이 재구성합니다.
export function SpotlightHero({profile,projects,annotation,reveal}){
  const first=projects[0];
  return <section className="hero library-hero spotlight-hero" id="intro"><div className="spotlight-glow" aria-hidden="true"/>
    <div className="spotlight-top" data-reveal="hero-label"><span>PORTFOLIO / {profile.role}</span><span>{profile.location}</span></div>
    <div className="spotlight-body"><div className="spotlight-copy"><p className="eyebrow" data-reveal="hero-label">SELECTED WORK / {String(projects.length).padStart(2,'0')}</p>
      <Title profile={profile} annotation={annotation} reveal={reveal}/>
      <p data-reveal="hero-intro">{profile.intro}</p><a href="#work" className="spotlight-action" data-reveal="hero-meta">작업 살펴보기 <span aria-hidden="true">↗</span></a>
      <ul className="spotlight-focus" aria-label="전문 분야">{profile.focus.map(item=><li key={item}>{item}</li>)}</ul>
    </div>{first&&<a className="spotlight-feature" href={`#case-${first.id}`} data-reveal="hero-visual"><span className="spotlight-image"><ProjectImage project={first}/></span><span className="spotlight-feature-caption"><small>01 / {first.category}</small><strong>{first.title}</strong><span>사례 보기 ↗</span></span></a>}</div>
  </section>;
}

// Watermelon bento-2: 비대칭 타일의 크기·리듬을 프로젝트 개수에 맞춰 반복합니다.
export function MosaicProjectIndex({projects}){
  return <section className="section mosaic-index" id="work" aria-labelledby="mosaic-title"><header className="section-heading" data-reveal="section"><p className="eyebrow">SELECTED WORK / {String(projects.length).padStart(2,'0')}</p><div><h2 id="mosaic-title">프로젝트 아카이브</h2><p>화면, 맡은 일, 설계 과정을 사례별로 살펴보세요.</p></div></header>
    <div className="mosaic-grid">{projects.map((project,index)=><Card className="mosaic-card" key={project.id} data-reveal="card" data-motion-index={index}>
      <CardContent><a className="mosaic-image" href={`#case-${project.id}`} aria-label={`${project.title} 사례 자세히`}><ProjectImage project={project}/><span aria-hidden="true">↗</span></a></CardContent>
      <CardHeader><div className="mosaic-copy"><p>{String(index+1).padStart(2,'0')} / {project.category} · {project.period}</p><h3><a href={`#case-${project.id}`}>{project.title}</a></h3><p>{project.summary}</p><span>{project.role}</span></div></CardHeader>
    </Card>)}</div>
  </section>;
}
