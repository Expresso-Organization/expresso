import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {motionBridgeTag} from './source-motion-core.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../..');
const previews=path.join(root,'docs/library/previews');
const report=JSON.parse(fs.readFileSync(path.join(previews,'component-motion-coverage.json')));
const bridgeSource=path.join(root,'scripts/library/renderer/motion-bridge.js');
const bridge=fs.readFileSync(bridgeSource);
fs.writeFileSync(path.join(previews,'motion-bridge.js'),bridge);
const marker=/<script src="\.\.\/motion-bridge\.js" data-expresso-motion="[a-z0-9-]+" data-motion-policy="[a-z_]+"><\/script>/g;
const vendor=/<script src="(?:\.\.\/watermelon\/)?vendor\.js"><\/script>/;
let installed=0,changed=0;
for(const item of report.items.filter(item=>item.status==='preview_ready')){
 if(!/^\.\/library\/previews\/(?:watermelon|examples|componentry)\/[a-z0-9-]+\.html$/.test(item.previewUrl))throw new Error('예제 주소 확인 필요: '+item.id);
 const file=path.join(root,'docs',item.previewUrl.slice(2));
 const prior=fs.readFileSync(file,'utf8');
 const clean=prior.replace(marker,'');
 if(!vendor.test(clean))throw new Error('vendor 스크립트 확인 필요: '+item.id);
 const next=clean.replace(vendor,match=>match+motionBridgeTag(root,item.id));
 if((next.match(/data-expresso-motion=/g)||[]).length!==1)throw new Error('브리지 중복: '+item.id);
 if(next!==prior){fs.writeFileSync(file,next);changed++;}
 installed++;
}
const manifest={schemaVersion:1,total:report.summary.total,installed,changed,awaitingSource:report.summary.awaitingSource,bridgeSha256:createHash('sha256').update(bridge).digest('hex')};
fs.writeFileSync(path.join(previews,'motion-bridge-installation.json'),JSON.stringify(manifest,null,2)+'\n');
console.log('motion bridge',manifest);
