import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {applyAcquisitions} from '../../../docs/library/acquisition-core.mjs';
import {applyCuration} from '../../../docs/library/curation-core.mjs';
import {applyExamples} from '../../../docs/library/examples-core.mjs';
import {applyComponentry} from '../../../docs/library/componentry-core.mjs';
import {itemType} from '../../../docs/library/catalog-core.mjs';
import {sourceMotionSignals} from './source-motion-core.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../..');
const read=name=>JSON.parse(fs.readFileSync(path.join(root,'docs/library',name+'.json')));
let data=applyAcquisitions(read('catalog'),read('acquisitions'));
data=applyCuration(data,read('curation'));
data=applyExamples(data,read('examples'));
data=applyComponentry(data,read('componentry'));

const items=[];
for(const item of data.items.filter(item=>item.artifactKind==='component')){
 const type=itemType(item);
 const base={id:item.id,source:item.sourceSite,name:item.sourceItemId,type,selection:item.curation?.selection||item.selection||'pending',sourceRevision:item.sourceRevision||null};
 if(item.acquisitionStatus!=='source_ready'){
  items.push({...base,status:'awaiting_source',reason:item.acquisitionStatus==='permission_needed'?'rights_review':'access_blocked',strategy:null,previewUrl:null});
  continue;
 }
 if(!item.preview?.liveUrl)throw new Error('실행 예제 누락: '+item.id);
 const {signals,motionClass,primaryFile}=sourceMotionSignals(root,item);
 const strategy=motionClass==='complex_signal'?'preserve_native':'shared_reveal';
 const reduction=motionClass!=='complex_signal'?'supported':signals.reducedMotion?'source_supported':signals.motionLibrary?'host_motion_config':'partial_native';
 items.push({...base,status:'preview_ready',reason:null,strategy,motionClass,reduction,signals,primaryFile,previewUrl:item.preview.liveUrl});
}
items.sort((a,b)=>a.source.localeCompare(b.source)||a.name.localeCompare(b.name));
const count=(key,value)=>items.filter(item=>item[key]===value).length;
const report={schemaVersion:1,scope:'수집한 전체 컴포넌트',strategyDefinitions:{preserve_native:'원본 자체 모션을 유지하고 실행 예제를 다시 불러 재생',shared_reveal:'공통 등장 모션을 적용하고 원본의 조작 전환을 유지'},summary:{total:items.length,previewReady:count('status','preview_ready'),awaitingSource:count('status','awaiting_source'),rightsReview:count('reason','rights_review'),accessBlocked:count('reason','access_blocked'),preserveNative:count('strategy','preserve_native'),sharedReveal:count('strategy','shared_reveal'),hostMotionConfig:count('reduction','host_motion_config'),sourceReducedMotion:count('reduction','source_supported'),partialNativeReduction:count('reduction','partial_native')},caveat:'원본 코드를 기준으로 모션 정책을 배정했습니다. host_motion_config는 이동 효과를 줄이는 실행기이며 기타 원본 효과가 남을 수 있습니다. partial_native 항목은 JavaScript 효과 제어가 검증되지 않았습니다.',items};
const out=path.join(root,'docs/library/previews/component-motion-coverage.json');
fs.writeFileSync(out,JSON.stringify(report,null,2)+'\n');
const index={schemaVersion:1,summary:report.summary,items:items.map(item=>({id:item.id,status:item.status,strategy:item.strategy,reduction:item.reduction||null,reason:item.reason}))};
fs.writeFileSync(path.join(root,'docs/library/previews/motion-policy-index.json'),JSON.stringify(index,null,2)+'\n');
console.log('component motion coverage',report.summary);
