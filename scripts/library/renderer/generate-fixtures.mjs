// 원본 TypeScript 필수 입력으로 초안 데이터를 만들고 브라우저에서 별도로 검증합니다.
import fs from 'node:fs';import path from 'node:path';import ts from 'typescript';import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../..');
const repo=path.join(root,'artifacts/portfolio-library/stage-2/repos/watermelon');
const results=JSON.parse(fs.readFileSync(path.join(root,'docs/library/previews/examples/build-results.json')));
const checked=JSON.parse(fs.readFileSync(path.join(root,'docs/library/previews/examples/verification.json'))).results;
const output=path.join(root,'scripts/library/renderer/auto-fixtures.json');const values=fs.existsSync(output)?JSON.parse(fs.readFileSync(output)):{};
const generated=[];
for(const r of results){
 if(checked[r.id]?.status!=='error'||!r.entry)continue;
 const file=path.join(repo,r.entry);const source=ts.createSourceFile(file,fs.readFileSync(file,'utf8'),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
 const defs=new Map();for(const n of source.statements)if((ts.isInterfaceDeclaration(n)||ts.isTypeAliasDeclaration(n))&&n.name)defs.set(n.name.text,n);
 const stem=r.name.replace(/-base$/,'').replace(/[^a-z0-9]/gi,'').toLowerCase();
 let type=defs.get((r.export||'')+'Props')||[...defs.values()].find(n=>n.name.text.replace(/props$/i,'').toLowerCase()===stem)||[...defs.values()].find(n=>/Props$/.test(n.name.text)&&!/(Context|Item|Row|Label|Trigger|Content|Button|Icon)Props$/.test(n.name.text));
 if(!type)continue;
 function val(t,key,depth=0){
  if(!t||depth>7)return 'null';
  if(ts.isInterfaceDeclaration(t)||ts.isTypeLiteralNode(t)){
   const fields=t.members.filter(m=>ts.isPropertySignature(m)&&m.name&&!m.questionToken).map(m=>JSON.stringify(m.name.getText(source).replace(/["']/g,''))+':'+val(m.type,m.name.getText(source),depth+1));
   return '{'+fields.join(',')+'}';
  }
  if(ts.isTypeAliasDeclaration(t))return val(t.type,key,depth+1);
  if(ts.isParenthesizedTypeNode(t))return val(t.type,key,depth+1);
  if(ts.isUnionTypeNode(t))return val(t.types.find(t=>t.kind!==ts.SyntaxKind.UndefinedKeyword&&t.kind!==ts.SyntaxKind.NullKeyword),key,depth+1);
  if(ts.isIntersectionTypeNode(t))return '{...'+t.types.map(t=>val(t,key,depth+1)).join(',...')+'}';
  if(ts.isLiteralTypeNode(t))return t.literal.getText(source);
  if(ts.isFunctionTypeNode(t))return /icon|render/i.test(key)?'(()=> <span>◆</span>)':'(()=>{})';
  if(ts.isArrayTypeNode(t))return '['+[0,1,2].map(i=>val(t.elementType,key,depth+1).replace(/예제/g,'예제 '+(i+1))).join(',')+']';
  if(ts.isTupleTypeNode(t))return '['+t.elements.map(n=>val(n,key,depth+1)).join(',')+']';
  if(ts.isTypeReferenceNode(t)){
   const name=t.typeName.getText(source);
   if(name==='Date')return 'new Date("2026-09-26T00:00:00Z")';
   if(name==='Array'||name==='ReadonlyArray')return '['+val(t.typeArguments?.[0],key,depth+1)+']';
   if(name==='Record')return '{}';
   if(/ReactNode|ReactElement/.test(name))return JSON.stringify('예제 '+key);
   if(/ComponentType|ElementType|Icon/.test(name))return '(()=> <span>◆</span>)';
   if(defs.has(name))return val(defs.get(name),key,depth+1);
   return '{}';
  }
  if(t.kind===ts.SyntaxKind.StringKeyword){
   const preset=/color/i.test(key)?'#2563eb':/^(href|url|link)$/.test(key)?'#':/email/i.test(key)?'demo@example.com':/date/i.test(key)?'2026-09-26':/month/i.test(key)?'September 2026':/image|avatar|logo|src/i.test(key)?'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="600" height="400"%3E%3Crect width="600" height="400" fill="%23dbeafe"/%3E%3Ctext x="200" y="200" font-size="32" fill="%231e40af"%3EDemo%3C/text%3E%3C/svg%3E':'예제 '+key;
   return JSON.stringify(preset);
  }
  if(t.kind===ts.SyntaxKind.NumberKeyword)return /index/i.test(key)?'0':'24';
  if(t.kind===ts.SyntaxKind.BooleanKeyword)return 'false';
  return 'null';
 }
 const props=val(type,'props');if(props==='{}'||props==='null')continue;
 values[r.name]=`function View(){const C=E[${JSON.stringify(r.export)}];return <C {...${props}}/>}`;generated.push([r.name,type.name.text]);
}
fs.writeFileSync(output,JSON.stringify(values,null,2)+'\n');console.log(generated);
