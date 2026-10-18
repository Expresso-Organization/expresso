import React from 'react';
import {Card,CardHeader,CardTitle,CardDescription,CardContent,CardFooter} from '@collected/card';
import {AnnotatedText} from '@collected/annotated-text';

// 수집 원본의 입력 계약을 포트폴리오 프로젝트 데이터에 맞춘 조합입니다.
export function AnnotatedHeading({text,highlight}){
  const target=highlight&&text.includes(highlight)?highlight:text.split('\n')[0];
  const at=target?text.indexOf(target):-1;
  if(at<0)return text;
  return <>{text.slice(0,at)}<span className="v-drawn-highlight" data-annotation-mark><AnnotatedText variant="underline" animate={false}>{target}</AnnotatedText></span>{text.slice(at+target.length)}</>;
}

export function OrbitProjectIndex({projects}){
  const id=React.useId(),items=projects.slice(0,5),remaining=projects.slice(5),middle=(items.length-1)/2;
  return <section className="section orbit-index" id="work" aria-labelledby="orbit-title">
    <header className="section-heading" data-reveal="section"><p className="eyebrow">SELECTED WORK / {String(projects.length).padStart(2,'0')}</p><div><h2 id="orbit-title">작업을 펼쳐 살펴보기</h2><p>프로젝트를 선택해 사례와 설계 과정을 확인하세요.</p></div></header>
    <fieldset className="orbit-stage"><legend className="orbit-sr-only">프로젝트 선택</legend>
      <div className="orbit-deck">{items.map((project,index)=><div className="orbit-position" style={{'--orbit-x':`${(index-middle)*160}px`,'--orbit-x-mobile':`${(index-middle)*68}px`,'--orbit-rotate':`${(index-middle)*6}deg`}} key={project.id}>
        <input className="orbit-radio" type="radio" name={id} id={`${id}-${project.id}`} value={project.id} defaultChecked={index===Math.floor(items.length/2)}/>
        <label htmlFor={`${id}-${project.id}`} aria-label={`${project.title} 선택`}><Card className="orbit-card" data-reveal="orbit-card" data-motion-index={index}><CardContent><div className="orbit-cover">{project.image?<img src={project.image} alt={project.imageAlt||`${project.title} 화면`} loading="lazy"/>:<div className="orbit-cover-fallback"><span>{project.category}</span><strong>{project.title}</strong></div>}<span className="orbit-number" aria-hidden="true">0{index+1}</span></div></CardContent><CardHeader><p className="eyebrow">{project.category}</p><CardTitle><h3>{project.title}</h3></CardTitle><CardDescription>{project.summary}</CardDescription></CardHeader><CardFooter>{project.period}</CardFooter></Card></label>
        <a className="orbit-case-link" href={`#case-${project.id}`}>{project.title} 사례 자세히 <span aria-hidden="true">↗</span></a>
      </div>)}</div>
      <p className="orbit-hint">카드를 선택하거나 방향키로 프로젝트를 바꿔 보세요.</p>
    </fieldset>
    {remaining.length>0&&<div className="orbit-more"><h3>다른 프로젝트</h3><ul>{remaining.map(project=><li key={project.id}><a href={`#case-${project.id}`}>{project.title}<span>{project.category}</span><span aria-hidden="true">↗</span></a></li>)}</ul></div>}
  </section>;
}
