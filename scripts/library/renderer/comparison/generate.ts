import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {ClaudeCodeAiClient} from '../../../../services/backend/src/platform/ai/claude-code.js';
import {AiPageGenerator,type PageGenerationContext} from '../../../../services/backend/src/modules/page/generator.js';
import type {AiClient,AiCallSpec,AiCallOptions} from '../../../../services/backend/src/platform/ai/client.js';
import {type z} from 'zod';
import {fixture} from '../portfolio/fixtures.mjs';
import {generationSchema,validatePortfolio,catalog} from '../portfolio/catalog.mjs';

// 실제 호출은 명시적인 실행 플래그가 있을 때만 수행합니다. 재실행은 저장 결과를 보존합니다.
if(!process.argv.includes('--generate'))throw new Error('실제 모델 호출: --generate [--mode=free|structured]');
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../../..');
const out=path.join(root,'docs/library/previews/comparison');
fs.mkdirSync(out,{recursive:true});
const mode=process.argv.find(v=>v.startsWith('--mode='))?.slice(7)||'all';
if(!['all','free','structured'].includes(mode))throw new Error('지원하지 않는 비교 방식입니다.');
const content=fixture('standard');
const sharedBrief=[
  '한국어 프로덕트 디자이너의 가상 포트폴리오를 만듭니다. 모든 인물·조직·경력·프로젝트·성과는 시연용입니다.',
  '목표: 처음 방문한 사람이 역할, 프로젝트 문제와 기여, 경력, 근거 자료, 연락처를 읽고 탐색할 수 있는 완성 페이지.',
  '시각 방향: 차분한 편집형. 배경 #f7f6f1, 본문 #1c302e, 강조 #24654d. 넓은 여백과 명확한 글자 위계.',
  '서체: Apple SD Gothic Neo, Malgun Gothic, system-ui, sans-serif. 별도 폰트 다운로드를 사용하지 않습니다.',
  '가상 데이터 표시를 눈에 보이게 유지합니다. 출처에 없는 성과 수치나 회사·프로젝트를 추가하지 않습니다.',
  '제목·이름·조직·기간·역할·연락처·근거 자료를 보존합니다. 설명 문장은 의미를 유지하며 정리할 수 있습니다.',
  '휴대폰 390px, 태블릿 768px, 데스크톱 1440px에서 읽히고, 키보드 포커스와 모션 감소를 지원합니다.',
  '목차, 프로젝트 상세, 근거 자료를 실제 앵커나 네이티브 details로 연결합니다. JavaScript가 없는 문서에서도 읽을 수 있어야 합니다.'
].join('\n');
const inputHash=createHash('sha256').update(JSON.stringify({content,sharedBrief})).digest('hex');
const inputFile=path.join(out,'input.json');
if(fs.existsSync(inputFile)&&JSON.parse(fs.readFileSync(inputFile,'utf8')).inputHash!==inputHash)throw new Error('이전 입력과 다릅니다. 새 비교 디렉터리가 필요합니다.');
fs.writeFileSync(inputFile,JSON.stringify({inputHash,content,sharedBrief,design:'editorial',callsPerMethod:1},null,2)+'\n');

const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'expresso-comparison-'));
const binary=execFileSync('which',['claude'],{encoding:'utf8'}).trim();
const quote=(s:string)=>"'"+s.replaceAll("'","'\\''")+"'";
const wrapper=path.join(tmp,'claude-generation-only');
// 기존 프로바이더를 재사용하며 도구·설정 자동 로드·세션 저장을 양쪽 호출에서 동일하게 제한합니다.
fs.writeFileSync(wrapper,`#!/bin/sh\nexec ${quote(binary)} --tools '' --setting-sources '' --no-session-persistence "$@"\n`,{mode:0o700});
const client=new ClaudeCodeAiClient({cliPath:wrapper,timeoutMs:600000,models:{page_generation:'opus'}});
class TracedClient implements AiClient{
  constructor(private label:string){}
  async complete<T>(spec:AiCallSpec,schema:z.ZodType<T>,options:AiCallOptions={}){
    fs.writeFileSync(path.join(out,`${this.label}-request.json`),JSON.stringify({inputHash,spec},null,2)+'\n');
    return client.complete(spec,schema,options);
  }
}
async function run(label:string,operation:()=>Promise<unknown>){
  const file=path.join(out,label+'-result.json');
  if(fs.existsSync(file)){console.log(label+' 저장된 결과 유지');return;}
  const started=new Date().toISOString();
  console.log(label+' 실제 생성 시작');
  const timer=setInterval(()=>console.log(label+' 생성 대기 중'),30000);
  try{
    const result=await operation();
    fs.writeFileSync(file,JSON.stringify({inputHash,started,finished:new Date().toISOString(),result},null,2)+'\n');
    console.log(label+' 생성 완료');
  }catch(error){
    fs.writeFileSync(path.join(out,label+'-failure.json'),JSON.stringify({inputHash,started,error:String(error)},null,2)+'\n');throw error;
  }finally{clearInterval(timer);}
}
try{
  if(mode==='all'||mode==='free')await run('free',async()=>{
    const media=content.projects.map((p:any)=>({src:'/v1/media/'+path.basename(p.image),srcSet:'',alt:p.imageAlt,width:960,height:720}));
    const context:PageGenerationContext={portfolioPlan:null,jobTitle:null,company:null,useKit:false,
      style:{name:'가상 포트폴리오 편집형',description:sharedBrief,toneTags:['차분한','편집형'],background:'#f7f6f1',text:'#1c302e',accent:'#24654d',font:'sans',density:'comfortable',structure:'wide-margin',composition:'asymmetric-editorial',typography:'editorial',geometry:'ruled-sections',motion:'minimal',interaction:'evidence-exploration',imagery:'project-artifacts-first',antiPatterns:['출처에 없는 성과','모든 내용을 동일한 카드에 배치','본문 잘라내기']},
      sections:[['소개','profile'],['프로젝트 목록','projects'],['사례 상세','projects'],['경력','career'],['근거 자료','evidence'],['연락처','contact']].map(([title,key])=>({title:title!,purpose:`${title} 내용을 명확하게 전달`,goal:'입력 정보와 연결을 보존',points:[JSON.stringify(content[key!])],targetLength:600})),
      evidence:[{label:'시연용 가상 포트폴리오 전체 데이터',text:JSON.stringify(content,null,2)}],media,
      instruction:sharedBrief+'\n이미지는 위의 /v1/media/ 주소를 그대로 사용합니다. HTML/CSS를 자유롭게 설계하되 모든 내용을 읽을 수 있게 유지합니다.'
    };
    fs.writeFileSync(path.join(out,'free-context.json'),JSON.stringify(context,null,2)+'\n');
    return new AiPageGenerator(new TracedClient('free')).generate(context);
  });
  if(mode==='all'||mode==='structured')await run('structured',async()=>{
    const result=await new TracedClient('structured').complete({contract:'page_generation',promptVersion:1,
      system:'제공된 섹션 카탈로그를 사용하는 포트폴리오 구성자입니다. JSON Schema에 맞는 spec을 반환합니다. 콘텐츠는 $state 경로로 참조합니다. 각 섹션은 한 번씩 사용하고, 모든 자식은 실제 존재하는 식별자를 가리켜야 합니다.',
      prompt:sharedBrief+'\n\n가상 콘텐츠:\n'+JSON.stringify(content,null,2)+'\n\n카탈로그:\n'+Object.entries(catalog.data.components).map(([type,entry]:any)=>type+': '+entry.description).join('\n')+'\n\n현재 구현은 하나의 편집형 테마와 섹션별 고정 배치를 제공합니다. 페이지 루트 하나 아래에 여섯 섹션의 순서를 선택하세요. root.props.profile은 {$state:"/profile"}입니다. 나머지는 Hero.profile=/profile, ProjectGrid.projects=/projects, CaseStudies.projects=/projects, CareerTimeline.career=/career, EvidenceList.evidence=/evidence, Contact.contact=/contact입니다. 모든 leaf의 children은 []입니다. 본문이나 CSS를 생성하지 않습니다.'
    },generationSchema);
    validatePortfolio(result.data,content);
    return result;
  });
}finally{fs.rmSync(tmp,{recursive:true,force:true});}
