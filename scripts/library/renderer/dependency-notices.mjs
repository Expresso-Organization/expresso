// 예제에 사용한 설치 패키지의 고지를 함께 보존합니다.
import fs from 'node:fs';import path from 'node:path';import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../..');
const store=path.join(root,'scripts/library/renderer/node_modules/.pnpm'),seen=new Set(),blocks=[];
for(const directory of fs.readdirSync(store,{withFileTypes:true})){
 if(!directory.isDirectory())continue;const modules=path.join(store,directory.name,'node_modules');if(!fs.existsSync(modules))continue;
 const candidates=[];for(const entry of fs.readdirSync(modules)){const p=path.join(modules,entry);if(entry.startsWith('@'))for(const name of fs.readdirSync(p))candidates.push(path.join(p,name));else candidates.push(p);}
 for(const p of candidates){try{const pkg=JSON.parse(fs.readFileSync(path.join(p,'package.json'))),key=pkg.name+'@'+pkg.version;if(seen.has(key))continue;seen.add(key);const notices=fs.readdirSync(p).filter(n=>/^(license|notice|copying)(\.|$)/i.test(n)&&fs.statSync(path.join(p,n)).isFile());if(notices.length)blocks.push(key+'\n'+notices.map(n=>fs.readFileSync(path.join(p,n),'utf8')).join('\n'));}catch{}}
}
fs.writeFileSync(path.join(root,'docs/library/previews/examples/dependency-licenses.txt'),blocks.sort().join('\n\n'+'='.repeat(70)+'\n'));
console.log('notice packages',blocks.length);
