import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {applyAcquisitions} from '../../../docs/library/acquisition-core.mjs';
import {applyCuration} from '../../../docs/library/curation-core.mjs';
import {applyExamples} from '../../../docs/library/examples-core.mjs';
import {applyComponentry} from '../../../docs/library/componentry-core.mjs';
import {itemType} from '../../../docs/library/catalog-core.mjs';
import {componentMotions} from './portfolio/v1/motion-catalog.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../..');
const read=name=>JSON.parse(fs.readFileSync(path.join(root,'docs/library',name+'.json')));
const local=value=>path.join(root,'docs',value.startsWith('./')?value.slice(2):value);
let data=applyAcquisitions(read('catalog'),read('acquisitions'));
data=applyCuration(data,read('curation'));
data=applyExamples(data,read('examples'));
data=applyComponentry(data,read('componentry'));
const supported=new Map(componentMotions.filter(item=>item.sourceItemId).map(item=>[item.sourceItemId,item.id]));
const signals={motionLibrary:/from ['"](?:motion\/react|framer-motion)['"]|require\(['"](?:motion\/react|framer-motion)/,gsap:/from ['"]gsap(?:\/[^'"]*)?['"]|\bgsap\.(?:to|from|timeline|set)/,scroll:/useScroll|ScrollTrigger|IntersectionObserver|whileInView|inView\(|onScroll|scrollYProgress/,waapi:/\.animate\s*\(/,keyframes:/@keyframes|animation\s*:/,transition:/transition(?:-[a-z-]+)?\s*:|\btransition-(?:all|colors|transform|opacity)|\bduration-\d+\b/,hover:/hover:|group-hover:|onMouseEnter|onPointerEnter/,canvas:/<canvas|WebGL|three(?:\/|['"])|ogl/,continuous:/requestAnimationFrame|setInterval|useFrame\(|animate\s*\(\s*\{|repeat\s*:\s*Infinity/,reducedMotion:/prefers-reduced-motion|useReducedMotion|matchMedia\(['"]\(prefers-reduced-motion/};
const rows=[];
for(const item of data.items.filter(item=>item.artifactKind==='component'&&item.acquisitionStatus==='source_ready'&&['sections','content-elements'].includes(itemType(item)))){
 const detail=JSON.parse(fs.readFileSync(local(item.detailPath)));
 let files=[];
 for(const material of detail.materials||[]){
  if(material.kind!=='registry_source')continue;
  const source=JSON.parse(fs.readFileSync(local(material.path)));
  if(Array.isArray(source.files))files.push(...source.files.filter(file=>file.content&&/\.(tsx?|jsx?|css)$/.test(file.path)));
 }
 const exact=files.filter(file=>file.path===item.sourceItemId||file.path.split('/').at(-1).replace(/\.(tsx?|jsx?|css)$/,'')===item.sourceItemId);
 if(exact.length)files=exact;else if(files.length>1)files=files.slice(0,1);
 if(!files.length)throw new Error('원본 파일 없음: '+item.id);
 const code=files.map(file=>file.content).join('\n');
 const detected=Object.fromEntries(Object.entries(signals).map(([key,pattern])=>[key,pattern.test(code)]));
 const complex=['motionLibrary','gsap','scroll','waapi','keyframes','canvas','continuous'].some(key=>detected[key]);
 const motionClass=complex?'complex_signal':detected.transition||detected.hover?'transition_or_hover':'no_signal';
 const selection=item.curation?.selection||item.selection||'pending';
 if(selection==='shortlisted'&&!supported.has(item.id))throw new Error('생성 모션 목록에 없는 선별 항목: '+item.id);
 rows.push({id:item.id,source:item.sourceSite,name:item.sourceItemId,type:itemType(item),roles:item.roles,selection,motionClass,motionSupport:supported.get(item.id)||null,signals:detected,sourceRevision:item.sourceRevision,primaryFile:files[0].path});
}
rows.sort((a,b)=>a.source.localeCompare(b.source)||a.name.localeCompare(b.name));
const count=(key,value)=>rows.filter(row=>row[key]===value).length;
const report={schemaVersion:1,method:'primary_registry_file_static_pattern',scope:'코드 확보 섹션·콘텐츠 요소',summary:{total:rows.length,sections:count('type','sections'),contentElements:count('type','content-elements'),shortlisted:count('selection','shortlisted'),reference:count('selection','reference'),excluded:count('selection','excluded'),pending:count('selection','pending'),complexSignal:count('motionClass','complex_signal'),transitionOrHover:count('motionClass','transition_or_hover'),noSignal:count('motionClass','no_signal')},caveat:'코드의 문자열 신호와 수집 분류를 계산한 결과입니다. 실제 재생 품질과 제품 적합성은 생성 조합의 브라우저 검증으로 판정합니다.',items:rows};
const output=path.join(root,'docs/library/previews/portfolio/source-motion-audit.json');
fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n');
console.log('source motion audit',report.summary);
