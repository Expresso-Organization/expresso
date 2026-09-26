// 라이브러리의 탐색 필드만 추려 포털 상단 검색에 제공합니다.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const at=name=>JSON.parse(fs.readFileSync(path.join(root,'docs/library',name+'.json'),'utf8'));
const base=at('catalog'),acquisitions=at('acquisitions'),curation=at('curation');
const sources=new Map([...base.sources,...acquisitions.sources,...curation.sources].map(s=>[s.id,s.name]));
const items=[...base.items,...acquisitions.additions,...curation.additions];
const ids=new Set();
const entries=items.map(item=>{
  if(ids.has(item.id)||!sources.has(item.sourceSite))throw Error('중복 ID 또는 출처 누락: '+item.id);
  ids.add(item.id);
  return {id:item.id,title:item.title,source:sources.get(item.sourceSite),kind:item.artifactKind,identifier:item.sourceItemId};
});
fs.writeFileSync(path.join(root,'docs/library/portal-search-index.json'),JSON.stringify({schemaVersion:1,catalogRunId:base.runId,curationRunId:curation.runId,entries})+'\n');
console.log('portal search',entries.length);
