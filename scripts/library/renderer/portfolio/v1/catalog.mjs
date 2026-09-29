import {z} from 'zod';
import {motionSupportFor} from './motion-catalog.mjs';
import {defaultMotion} from './motion.mjs';
import {defineCatalog} from '@json-render/core';
import {schema} from '@json-render/react/schema';
import {contentSchema as baseContent,projectSchema as baseProject} from '../catalog.mjs';

const id=z.string().regex(/^[a-z][a-z0-9-]{0,63}$/);
export const caseVariants={media:'이미지 중심',process:'과정 중심',text:'본문 중심'};
export const recipes={featured:'에디토리얼 · 대표 사례',gallery:'포스터 · 갤러리'};
// 구성안은 색·서체·히어로·섹션 리듬을 함께 결정하는 검증된 디자인 단위입니다.
export const designDirections={featured:'editorial',gallery:'poster'};
export const evidenceVariants={grouped:'프로젝트별 펼치기',expanded:'내용 펼쳐 보기'};
export const componentChoices={default:'기본 조합',selected:'카드 펼침 · 확장',bento:'벤토 · 확장'};
export const defaultComponents=Object.freeze({projectIndex:'default',heroAnnotation:'off',heroReveal:'block',careerStyle:'default',evidenceStyle:'default',contactStyle:'default'});
export const selectedComponents=Object.freeze({...defaultComponents,projectIndex:'orbit',heroAnnotation:'drawn',heroReveal:'lines',careerStyle:'ribbon',evidenceStyle:'preview',contactStyle:'card'});
export const bentoComponents=Object.freeze({...selectedComponents,projectIndex:'bento'});
const field=z.enum(['problem','contribution','outcome']);
const showcaseSchema=z.strictObject({kind:z.enum(['map','network','wayfinding']),label:z.string(),brand:z.string().trim().min(1).max(24).optional(),subtitle:z.string(),items:z.array(z.tuple([z.string(),z.string(),z.string()])).length(3)});
const projectSchema=baseProject.extend({process:z.array(field).max(3).default([]),showcase:showcaseSchema.nullable().default(null)});
export const contentSchema=baseContent.extend({projects:z.array(projectSchema).min(1).max(8)});
export const planSchema=z.strictObject({version:z.literal(1),recipe:z.enum(['featured','gallery']),cases:z.array(z.strictObject({projectId:id,variant:z.enum(['media','process','text'])})).min(1).max(8),evidence:z.enum(['grouped','expanded']),motion:z.strictObject({preset:z.enum(['none','subtle','showcase'])}).default({preset:'none'}),components:z.strictObject({projectIndex:z.enum(['default','orbit','bento']),heroAnnotation:z.enum(['off','drawn']),heroReveal:z.enum(['block','lines']).default('block'),careerStyle:z.enum(['default','ribbon']).default('default'),evidenceStyle:z.enum(['default','preview']).default('default'),contactStyle:z.enum(['default','card']).default('default')}).default(defaultComponents)});

export function candidates(project){
  return ['text',...(project.image?['media']:[]),...(project.process.length===3?['process']:[])];
}
export function validateContent(input){
  const content=contentSchema.parse(input);
  const ids=[...content.projects,...content.career,...content.evidence].map(x=>x.id);
  if(new Set(ids).size!==ids.length)throw new Error('콘텐츠 식별자가 중복됩니다.');
  const anchors=['intro','work','career','evidence','contact',...content.projects.map(p=>'case-'+p.id),...content.evidence.map(e=>e.id)];
  if(new Set(anchors).size!==anchors.length)throw new Error('화면 앵커가 중복됩니다.');
  const evidenceIds=new Set(content.evidence.map(e=>e.id));
  for(const p of content.projects){
    if(p.process.length&&(p.process.length!==3||new Set(p.process).size!==3))throw new Error('과정은 문제·기여·결과를 각각 참조해야 합니다.');
    if(new Set(p.evidenceIds).size!==p.evidenceIds.length||p.evidenceIds.some(e=>!evidenceIds.has(e)))throw new Error('근거 참조가 올바르지 않습니다.');
  }
  return content;
}
export function defaultPlan(input,recipe='featured',preset=defaultMotion(recipe),components=defaultComponents){
  const content=validateContent(input);
  const preferred=recipe==='featured'?['media','process','text']:['text','media','process'];
  return planSchema.parse({version:1,recipe,motion:{preset},components,evidence:recipe==='featured'?'grouped':'expanded',cases:content.projects.map((p,i)=>{
    const allowed=candidates(p),wanted=preferred[i%preferred.length];
    return {projectId:p.id,variant:allowed.includes(wanted)?wanted:allowed.includes('process')?'process':'text'};
  })});
}
export function validatePlan(plan,input){
  const content=validateContent(input),parsed=planSchema.parse(plan),byId=new Map(content.projects.map(p=>[p.id,p]));
  const seen=new Set();
  for(const entry of parsed.cases){
    const project=byId.get(entry.projectId);
    if(!project||seen.has(entry.projectId))throw new Error('프로젝트 참조가 없거나 중복됩니다.');
    if(!candidates(project).includes(entry.variant))throw new Error('콘텐츠가 지원하지 않는 표현입니다: '+entry.projectId+' / '+entry.variant);
    seen.add(entry.projectId);
  }
  if(seen.size!==content.projects.length)throw new Error('선택한 프로젝트가 누락되었습니다.');
  return {plan:parsed,content};
}
const projectView=projectSchema.extend({artifacts:z.array(baseContent.shape.evidence.element)});
const groupSchema=z.object({id:z.string(),title:z.string(),projectIds:z.array(id),items:z.array(baseContent.shape.evidence.element)});
export const catalog=defineCatalog(schema,{components:{
  PortfolioPage:{props:z.object({profile:baseContent.shape.profile,recipe:z.enum(['featured','gallery']),motion:z.object({preset:z.enum(['none','subtle','showcase'])})}),slots:['default'],description:'구성안에 연결된 디자인 방향을 적용합니다.'},
  Hero:{props:z.object({profile:baseContent.shape.profile,projects:z.array(projectSchema),recipe:z.enum(['featured','gallery']),annotation:z.enum(['off','drawn']),reveal:z.enum(['block','lines'])}),description:'역할과 핵심 소개'},
  HeadlineLines:{props:z.object({text:z.string(),highlight:z.string(),annotation:z.enum(['off','drawn'])}),description:'소개 제목을 원문 줄 순서대로 드러냅니다.'},
  AnnotatedHeading:{props:z.object({text:z.string(),highlight:z.string()}),description:'선별한 Annotated Text로 핵심 문구에 표시를 그립니다.'},
  ProjectShowcase:{props:z.object({projects:z.array(projectSchema),recipe:z.enum(['featured','gallery'])}),description:'프로젝트 보드의 방향 전환과 시제품 선택'},
  ProjectIndex:{props:z.object({projects:z.array(projectSchema),variant:z.enum(['list','gallery'])}),description:'목록형 또는 이미지 갤러리'},
  OrbitProjectIndex:{props:z.object({projects:z.array(projectSchema)}),description:'선별한 Orbit Card Stack의 프로젝트 탐색 표현'},
  BentoProjectIndex:{props:z.object({projects:z.array(projectSchema)}),description:'선별한 Bento 섹션의 프로젝트 크기·순서 표현'},
  ProjectCaseStudy:{props:z.object({project:projectView,variant:z.enum(['media','process','text']),ordinal:z.number().int().min(1).max(8)}),description:'프로젝트별 이미지·과정·본문 중심 표현. 본문은 참조 데이터 그대로 사용합니다.'},
  CareerTimeline:{props:z.object({career:baseContent.shape.career}),description:'기간과 역할의 타임라인'},
  CareerRibbon:{props:z.object({career:baseContent.shape.career}),description:'기간·역할·연결선을 나누어 표시하는 경력 리본'},
  EvidenceCollection:{props:z.object({groups:z.array(groupSchema),variant:z.enum(['grouped','expanded'])}),description:'프로젝트별 자료 또는 펼친 구조화 자료. 같은 근거는 한 번만 표시합니다.'},
  EvidencePreviews:{props:z.object({groups:z.array(groupSchema)}),description:'근거 제목과 요약을 먼저 보여주고 본문을 펼칩니다.'},
  Contact:{props:z.object({contact:baseContent.shape.contact}),description:'연락처와 마무리'},
  ContactCard:{props:z.object({contact:baseContent.shape.contact}),description:'한 개의 실제 연락 수단을 강조하는 마무리 카드'}
},actions:{}});

export function compilePlan(plan,input){
  const valid=validatePlan(plan,input),content=valid.content;
  const projects=valid.plan.cases.map(c=>content.projects.find(p=>p.id===c.projectId));
  const projectById=Object.fromEntries(projects.map(p=>[p.id,{...p,artifacts:p.evidenceIds.map(id=>content.evidence.find(e=>e.id===id))}]));
  // 같은 근거를 여러 프로젝트가 인용해도 DOM 앵커는 한 번만 만듭니다.
  const owners=new Map(content.evidence.map(e=>[e.id,projects.filter(p=>p.evidenceIds.includes(e.id))]));
  const groups=projects.map(p=>({id:'group-project-'+p.id,title:p.title,projectIds:[p.id],items:content.evidence.filter(e=>owners.get(e.id).length===1&&owners.get(e.id)[0].id===p.id)})).filter(g=>g.items.length);
  const shared=content.evidence.filter(e=>owners.get(e.id).length>1),other=content.evidence.filter(e=>!owners.get(e.id).length);
  if(shared.length)groups.push({id:'group-shared',title:'함께 쓰인 근거',projectIds:[],items:shared});
  if(other.length)groups.push({id:'group-other',title:'추가 자료',projectIds:[],items:other});
  const state={...content,projects,projectById,evidenceGroups:groups};
  const binding=key=>({$state:'/'+key});
  const cases=valid.plan.cases.map(c=>'case-'+c.projectId);
  const ending=valid.plan.recipe==='featured'?['career','evidence']:['evidence','career'];
  const spec={root:'page',elements:{
    page:{type:'PortfolioPage',props:{profile:binding('profile'),recipe:valid.plan.recipe,motion:valid.plan.motion},children:['intro','work',...cases,...ending,'contact']},
    intro:{type:'Hero',props:{profile:binding('profile'),projects:binding('projects'),recipe:valid.plan.recipe,annotation:valid.plan.components.heroAnnotation,reveal:valid.plan.components.heroReveal},children:[]},
    work:valid.plan.components.projectIndex==='orbit'?{type:'OrbitProjectIndex',props:{projects:binding('projects')},children:[]}:valid.plan.components.projectIndex==='bento'?{type:'BentoProjectIndex',props:{projects:binding('projects')},children:[]}:{type:'ProjectIndex',props:{projects:binding('projects'),variant:valid.plan.recipe==='featured'?'list':'gallery'},children:[]},
    career:{type:valid.plan.components.careerStyle==='ribbon'?'CareerRibbon':'CareerTimeline',props:{career:binding('career')},children:[]},
    evidence:valid.plan.components.evidenceStyle==='preview'?{type:'EvidencePreviews',props:{groups:binding('evidenceGroups')},children:[]}:{type:'EvidenceCollection',props:{groups:binding('evidenceGroups'),variant:valid.plan.evidence},children:[]},
    contact:{type:valid.plan.components.contactStyle==='card'?'ContactCard':'Contact',props:{contact:binding('contact')},children:[]}
  }};
  valid.plan.cases.forEach((c,i)=>{spec.elements['case-'+c.projectId]={type:'ProjectCaseStudy',props:{project:binding('projectById/'+c.projectId),variant:c.variant,ordinal:i+1},children:[]};});
  if(!catalog.validate(spec).success)throw new Error('카탈로그와 구성 결과가 맞지 않습니다.');
  return {plan:valid.plan,content,state,spec,motionSupport:motionSupportFor([...Object.values(spec.elements).map(e=>e.type),...(valid.plan.components.heroAnnotation==='drawn'?['AnnotatedHeading']:[]),...(valid.plan.components.heroReveal==='lines'?['HeadlineLines']:[])],valid.plan.motion.preset)};
}
