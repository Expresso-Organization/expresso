import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(new URL('../../services/web/package.json',import.meta.url));
const {JSDOM}=require('jsdom');

test('DC 원본 템플릿은 비워 두고 실제 포털에 장착된 뒤에만 자료를 요청한다',async()=>{
 const dom=new JSDOM('<x-dc><expresso-library route="{{ libraryRoute }}"></expresso-library></x-dc><div id="dc-root"></div>',{url:'http://localhost/'});
 const keys=['HTMLElement','customElements','document','fetch'];
 const before=new Map(keys.map(k=>[k,globalThis[k]]));let requests=0;
 try{
  for(const k of keys.slice(0,3))globalThis[k]=dom.window[k];
  globalThis.fetch=()=>{requests++;return new Promise(()=>{});};
  await import('../../docs/library/portal-library.mjs');
  const template=dom.window.document.querySelector('x-dc expresso-library');
  assert.equal(template.innerHTML,'');assert.equal(requests,0);
  template.setAttribute('route','#/library');assert.equal(template.innerHTML,'');
  const mounted=dom.window.document.createElement('expresso-library');
  mounted.setAttribute('route','#/library');dom.window.document.getElementById('dc-root').append(mounted);
  assert.match(mounted.textContent,/불러오는 중/);assert.equal(requests,4);
  assert.equal(template.innerHTML,'');
 }finally{dom.window.close();for(const k of keys)globalThis[k]=before.get(k);}
});
