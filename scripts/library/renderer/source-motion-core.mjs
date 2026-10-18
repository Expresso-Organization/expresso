import fs from 'node:fs';
import path from 'node:path';

const patterns={motionLibrary:/from ['"](?:motion\/react|framer-motion)['"]|require\(['"](?:motion\/react|framer-motion)/,gsap:/from ['"]gsap(?:\/[^'"]*)?['"]|\bgsap\.(?:to|from|timeline|set)/,scroll:/useScroll|ScrollTrigger|IntersectionObserver|whileInView|inView\(|onScroll|scrollYProgress/,waapi:/\.animate\s*\(/,keyframes:/@keyframes|animation\s*:/,transition:/transition(?:-[a-z-]+)?\s*:|\btransition-(?:all|colors|transform|opacity)|\bduration-\d+\b/,hover:/hover:|group-hover:|onMouseEnter|onPointerEnter/,canvas:/<canvas\b|\bWebGL\b|\bthree(?:\/|['"])|\bogl\b/,continuous:/requestAnimationFrame|setInterval|useFrame\(|animate\s*\(\s*\{|repeat\s*:\s*Infinity/,reducedMotion:/prefers-reduced-motion|useReducedMotion|matchMedia\(['"]\(prefers-reduced-motion/};
const local=(root,value)=>path.join(root,'docs',value.startsWith('./')?value.slice(2):value);

export function sourceMotionSignals(root,item){
 const detail=JSON.parse(fs.readFileSync(local(root,item.detailPath)));
 let files=[];
 for(const material of detail.materials||[]){
  if(material.kind!=='registry_source')continue;
  const source=JSON.parse(fs.readFileSync(local(root,material.path)));
  if(Array.isArray(source.files))files.push(...source.files.filter(file=>file.content&&/\.(tsx?|jsx?|css)$/.test(file.path)));
 }
 const exact=files.filter(file=>file.path===item.sourceItemId||file.path.split('/').at(-1).replace(/\.(tsx?|jsx?|css)$/,'')===item.sourceItemId);
 if(exact.length)files=exact;else if(files.length>1)files=files.slice(0,1);
 if(!files.length)throw new Error('원본 파일 없음: '+item.id);
 const code=files.map(file=>file.content).join('\n');
 const signals=Object.fromEntries(Object.entries(patterns).map(([key,pattern])=>[key,pattern.test(code)]));
 const complex=['motionLibrary','gsap','scroll','waapi','keyframes','canvas','continuous'].some(key=>signals[key]);
 const motionClass=complex?'complex_signal':signals.transition||signals.hover?'transition_or_hover':'no_signal';
 return {signals,motionClass,primaryFile:files[0].path};
}

let coverageCache;
export function motionBridgeTag(root,id){
 coverageCache ||=new Map(JSON.parse(fs.readFileSync(path.join(root,'docs/library/previews/component-motion-coverage.json'))).items.map(item=>[item.id,item]));
 const item=coverageCache.get(id);
 if(!item||item.status!=='preview_ready')throw new Error('모션 브리지 대상이 아닌 항목: '+id);
 return `<script src="../motion-bridge.js" data-expresso-motion="${item.id}" data-motion-policy="${item.strategy}"></script>`;
}
