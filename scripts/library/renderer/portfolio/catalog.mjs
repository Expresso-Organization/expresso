import {z} from 'zod';
import {defineCatalog} from '@json-render/core';
import {schema} from '@json-render/react/schema';

const text=z.string().trim().min(1).max(2400);
const short=z.string().trim().min(1).max(80);
const title=z.string().trim().min(1).max(180);
const id=z.string().regex(/^[a-z][a-z0-9-]{0,63}$/);
const image=z.string().regex(/^\.\/assets\/portfolio-[a-z-]+\.svg$/).nullable();
export const projectSchema=z.strictObject({id,title,category:short,summary:text.max(800),image,imageAlt:title,role:short,period:short,tags:z.array(short.max(40)).min(1).max(8),problem:text,contribution:text,outcome:text,evidenceIds:z.array(id).max(6)});
export const contentSchema=z.strictObject({
  fictional:z.literal(true),
  profile:z.strictObject({name:short,monogram:z.string().min(1).max(5),role:short,headline:text.max(240),highlight:z.string().min(1).max(10),intro:text.max(800),location:short,focus:z.array(short.max(40)).max(5)}),
  projects:z.array(projectSchema).min(1).max(8),
  career:z.array(z.strictObject({id,period:text,organization:text,role:text,description:text})).min(1).max(8),
  evidence:z.array(z.strictObject({id,title:text,kind:text,summary:text,body:text})).min(1).max(12),
  contact:z.strictObject({heading:text,description:text,email:z.string().email().refine(v=>v.endsWith('@example.com'),'예제 전용 연락처가 필요합니다.')})
});

export const catalog=defineCatalog(schema,{
  components:{
    PortfolioPage:{props:z.strictObject({profile:contentSchema.shape.profile}),slots:['default'],description:'전체 페이지. Hero, ProjectGrid, CaseStudies, CareerTimeline, EvidenceList, Contact를 순서대로 배치합니다.'},
    Hero:{props:z.strictObject({profile:contentSchema.shape.profile}),description:'짧은 소개와 역할. 강조 구절은 10자 이내입니다.'},
    ProjectGrid:{props:z.strictObject({projects:contentSchema.shape.projects}),description:'프로젝트 목록. 이미지가 없어도 제목과 설명을 유지합니다.'},
    CaseStudies:{props:z.strictObject({projects:contentSchema.shape.projects}),description:'프로젝트별 문제, 담당 작업, 결과, 근거를 표시합니다.'},
    CareerTimeline:{props:z.strictObject({career:contentSchema.shape.career}),description:'기간, 조직, 역할, 담당 작업의 경력 목록입니다.'},
    EvidenceList:{props:z.strictObject({evidence:contentSchema.shape.evidence}),description:'프로젝트 주장에 연결된 자료의 내용을 펼쳐 읽습니다.'},
    Contact:{props:z.strictObject({contact:contentSchema.shape.contact}),description:'연락처와 마무리 문구입니다.'}
  },actions:{}
});
const bindings={Hero:'profile',ProjectGrid:'projects',CaseStudies:'projects',CareerTimeline:'career',EvidenceList:'evidence',Contact:'contact'};
export const generationSchema=z.strictObject({root:id,elements:z.record(id,z.discriminatedUnion('type',[
  z.strictObject({type:z.literal('PortfolioPage'),props:z.strictObject({profile:z.strictObject({$state:z.literal('/profile')})}),children:z.array(id).length(6)}),
  ...Object.entries(bindings).map(([type,field])=>z.strictObject({type:z.literal(type),props:z.strictObject({[field]:z.strictObject({$state:z.literal(`/${field}`)})}),children:z.array(id).length(0)}))
]))});
export const portfolioSpec={root:'page',elements:{
  page:{type:'PortfolioPage',props:{profile:{$state:'/profile'}},children:['intro','projects','cases','career','evidence','contact']},
  intro:{type:'Hero',props:{profile:{$state:'/profile'}},children:[]},
  projects:{type:'ProjectGrid',props:{projects:{$state:'/projects'}},children:[]},
  cases:{type:'CaseStudies',props:{projects:{$state:'/projects'}},children:[]},
  career:{type:'CareerTimeline',props:{career:{$state:'/career'}},children:[]},
  evidence:{type:'EvidenceList',props:{evidence:{$state:'/evidence'}},children:[]},
  contact:{type:'Contact',props:{contact:{$state:'/contact'}},children:[]}
}};

// 이 실험은 한 단계의 섹션 트리만 허용합니다. 임의 코드·액션·데이터 경로는 받지 않습니다.
export function validatePortfolio(spec,input){
  const content=contentSchema.parse(input);
  const result=catalog.validate(spec);
  if(!result.success)throw new Error('카탈로그 계약에 맞지 않는 페이지입니다.');
  const parsed=generationSchema.parse(spec);
  const root=parsed.elements[parsed.root];
  if(root?.type!=='PortfolioPage'||!root.children?.length)throw new Error('페이지 루트가 필요합니다.');
  const seen=new Set([parsed.root]),types=new Set();
  for(const child of root.children){
    if(seen.has(child))throw new Error('섹션 식별자가 중복되거나 순환합니다.');
    seen.add(child);
    const section=parsed.elements[child];
    const field=section&&bindings[section.type];
    if(!field||types.has(section.type)||section.children?.length)throw new Error('등록된 섹션을 한 번씩 배치해야 합니다.');
    types.add(section.type);
    if(Object.keys(section.props).length!==1||JSON.stringify(section.props[field])!==JSON.stringify({$state:`/${field}`}))throw new Error('허용된 콘텐츠 참조만 사용할 수 있습니다.');
  }
  if(seen.size!==Object.keys(parsed.elements).length||types.size!==Object.keys(bindings).length)throw new Error('연결되지 않거나 누락된 섹션이 있습니다.');
  const allIds=[...content.projects.map(p=>p.id),...content.career.map(c=>c.id),...content.evidence.map(e=>e.id)];
  if(new Set(allIds).size!==allIds.length)throw new Error('콘텐츠 식별자가 중복됩니다.');
  const evidenceIds=new Set(content.evidence.map(e=>e.id));
  const domIds=['intro','work','cases-title','career','evidence','contact',...content.projects.map(p=>`case-${p.id}`),...evidenceIds];
  if(new Set(domIds).size!==domIds.length)throw new Error('화면 앵커 식별자가 중복됩니다.');
  for(const project of content.projects)for(const ref of project.evidenceIds)if(!evidenceIds.has(ref))throw new Error('연결할 근거 자료가 없습니다.');
  return {spec:parsed,content};
}
