import {z} from 'zod';
import {isDeepStrictEqual} from 'node:util';
import {catalog,compilePlan,validatePlan,candidates,designSchema} from './catalog.mjs';

const id=z.string().regex(/^[a-z][a-z0-9-]{0,63}$/);
const ref=field=>z.strictObject({$state:z.literal('/'+field)});
const empty=z.array(z.never()).max(0);
const leaf=(type,props)=>z.strictObject({type:z.literal(type),props:z.strictObject(props),children:empty});
export function modelSpecSchemaFor(input,{requireDesign=false,selection=null}={}){
 const caseNodes=Object.fromEntries(input.projects.map(project=>['case-'+project.id,leaf('ProjectCaseStudy',{project:ref('projectById/'+project.id),variant:z.enum(candidates(project)),ordinal:z.number().int().min(1).max(input.projects.length)})]));
 const introType={classic:'Hero',gradient:'GradientHero',spotlight:'SpotlightHero'}[selection?.heroStyle];
 const introSchema=type=>leaf(type,{profile:ref('profile'),projects:ref('projects'),recipe:selection?z.literal(selection.recipe):z.enum(['featured','gallery']),layout:selection?z.literal(selection.design.layout):z.enum(['editorial','poster','studio']).optional(),annotation:z.enum(['off','drawn']),reveal:z.enum(['block','lines'])});
 const workSchemas=[leaf('ProjectIndex',{projects:ref('projects'),variant:z.enum(['list','gallery'])}),leaf('OrbitProjectIndex',{projects:ref('projects')}),leaf('BentoProjectIndex',{projects:ref('projects')}),leaf('MosaicProjectIndex',{projects:ref('projects')})];
 return z.strictObject({root:z.literal('page'),elements:z.strictObject({
  page:z.strictObject({type:z.literal('PortfolioPage'),props:z.strictObject({profile:ref('profile'),recipe:selection?z.literal(selection.recipe):z.enum(['featured','gallery']),design:selection?z.strictObject({palette:z.literal(selection.design.palette),typography:z.literal(selection.design.typography),layout:z.literal(selection.design.layout)}):requireDesign?designSchema:designSchema.optional(),motion:z.strictObject({preset:z.enum(['none','subtle','showcase'])})}),children:selection?z.tuple([z.literal('intro'),z.literal('work'),...input.projects.map(project=>z.literal('case-'+project.id)),z.literal('career'),z.literal('evidence'),z.literal('contact')]):z.array(id).length(input.projects.length+5)}),
  intro:selection?introSchema(introType):z.union(['Hero','GradientHero','SpotlightHero'].map(introSchema)),
  work:selection?workSchemas[['default','orbit','bento','mosaic'].indexOf(selection.projectIndex)]:z.union(workSchemas),
  ...caseNodes,
  career:z.union([leaf('CareerTimeline',{career:ref('career')}),leaf('CareerRibbon',{career:ref('career')})]),
  evidence:z.union([leaf('EvidenceCollection',{groups:ref('evidenceGroups'),variant:z.enum(['grouped','expanded'])}),leaf('EvidencePreviews',{groups:ref('evidenceGroups')})]),
  contact:z.union([leaf('Contact',{contact:ref('contact')}),leaf('ContactCard',{contact:ref('contact')})])
 })});
}
const binding=field=>({$state:'/'+field});
const same=(actual,expected)=>isDeepStrictEqual(actual,expected);
const requireProps=(node,expected)=>{if(!same(node.props,expected))throw new Error(`${node.type}의 데이터 연결이 허용 범위와 다릅니다.`);};

export function validateModelSpec(raw,input){
 const spec=modelSpecSchemaFor(input).parse(raw);
 if(spec.root!=='page'||spec.elements.page?.type!=='PortfolioPage')throw new Error('PortfolioPage 루트가 필요합니다.');
 if(!catalog.validate(spec).success)throw new Error('json-render Catalog 계약에 맞지 않습니다.');
 const page=spec.elements.page;
 const children=page.children;
 if(children.length!==input.projects.length+5||new Set(children).size!==children.length||Object.keys(spec.elements).length!==children.length+1)throw new Error('섹션의 개수·중복·연결 관계가 맞지 않습니다.');
 if(children[0]!=='intro'||children[1]!=='work'||children.at(-1)!=='contact')throw new Error('소개·목록·연락처의 위치가 맞지 않습니다.');
 if(children.slice(2,-1).some(key=>key!=='career'&&key!=='evidence'&&!key.startsWith('case-')))throw new Error('등록되지 않은 섹션이 있습니다.');
 if(children.slice(-3,-1).sort().join(',')!=='career,evidence')throw new Error('경력과 근거 섹션이 누락되었습니다.');
 if(Object.keys(spec.elements).some(key=>key!=='page'&&!children.includes(key)))throw new Error('연결되지 않은 요소가 있습니다.');
 for(const key of children)if(spec.elements[key]?.children.length)throw new Error('섹션 안의 임의 요소는 허용하지 않습니다.');

 const recipe=page.props.recipe,motion=page.props.motion,design=page.props.design;
 if(!['featured','gallery'].includes(recipe)||!['none','subtle','showcase'].includes(motion?.preset))throw new Error('디자인 또는 모션 선택이 올바르지 않습니다.');
 requireProps(page,{profile:binding('profile'),recipe,...(design?{design}:{}),motion:{preset:motion.preset}});
 const intro=spec.elements.intro;
 const heroStyle=({Hero:'classic',GradientHero:'gradient',SpotlightHero:'spotlight'})[intro?.type];
 if(!heroStyle)throw new Error('소개 컴포넌트가 필요합니다.');
 const annotation=intro.props.annotation,reveal=intro.props.reveal;
 if(!['off','drawn'].includes(annotation)||!['block','lines'].includes(reveal))throw new Error('소개 표현이 올바르지 않습니다.');
 if(intro.props.layout&&intro.props.layout!==(design||{layout:recipe==='gallery'?'poster':'editorial'}).layout)throw new Error('소개 배치와 페이지 디자인이 일치하지 않습니다.');
 requireProps(intro,{profile:binding('profile'),projects:binding('projects'),recipe,...(intro.props.layout?{layout:intro.props.layout}:{}),annotation,reveal});

 const work=spec.elements.work;
 const projectIndex=({ProjectIndex:'default',OrbitProjectIndex:'orbit',BentoProjectIndex:'bento',MosaicProjectIndex:'mosaic'})[work?.type];
 if(!projectIndex)throw new Error('프로젝트 목록 표현이 올바르지 않습니다.');
 if(projectIndex==='default'){
  if(!['list','gallery'].includes(work.props.variant))throw new Error('프로젝트 목록 변형이 올바르지 않습니다.');
  requireProps(work,{projects:binding('projects'),variant:work.props.variant});
 }else requireProps(work,{projects:binding('projects')});

 const career=spec.elements.career,careerStyle=({CareerTimeline:'default',CareerRibbon:'ribbon'})[career?.type];
 const evidence=spec.elements.evidence,evidenceStyle=({EvidenceCollection:'default',EvidencePreviews:'preview'})[evidence?.type];
 const contact=spec.elements.contact,contactStyle=({Contact:'default',ContactCard:'card'})[contact?.type];
 if(!careerStyle||!evidenceStyle||!contactStyle)throw new Error('경력·근거·연락처 표현이 올바르지 않습니다.');
 requireProps(career,{career:binding('career')});
 if(evidenceStyle==='default'){
  if(!['grouped','expanded'].includes(evidence.props.variant))throw new Error('근거 표현이 올바르지 않습니다.');
  requireProps(evidence,{groups:binding('evidenceGroups'),variant:evidence.props.variant});
 }else requireProps(evidence,{groups:binding('evidenceGroups')});
 requireProps(contact,{contact:binding('contact')});

 const caseKeys=children.slice(2,-3);
 if(caseKeys.length!==input.projects.length)throw new Error('프로젝트 사례가 누락되었습니다.');
 const byId=new Map(input.projects.map(project=>[project.id,project]));
 const cases=caseKeys.map((key,index)=>{
  if(!key.startsWith('case-'))throw new Error('프로젝트 사례의 순서가 맞지 않습니다.');
  const projectId=key.slice(5),project=byId.get(projectId),item=spec.elements[key];
  if(!project||item?.type!=='ProjectCaseStudy'||!candidates(project).includes(item.props.variant))throw new Error('사례의 프로젝트 또는 표현이 올바르지 않습니다.');
  requireProps(item,{project:binding('projectById/'+projectId),variant:item.props.variant,ordinal:index+1});
  return {projectId,variant:item.props.variant};
 });
 const plan=validatePlan({version:1,recipe,...(design?{design}:{}),cases,evidence:evidenceStyle==='default'?evidence.props.variant:'expanded',motion:{preset:motion.preset},components:{projectIndex,heroStyle,heroAnnotation:annotation,heroReveal:reveal,careerStyle,evidenceStyle,contactStyle}},input).plan;
 return {spec,plan,state:compilePlan(plan,input).state};
}
