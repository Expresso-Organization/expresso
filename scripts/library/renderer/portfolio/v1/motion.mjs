import {componentMotions} from './motion-catalog.mjs';
// 같은 실행기를 React 미리보기와 단일 HTML에서 사용합니다.
export const motionPresets={none:'없음',subtle:'차분하게',showcase:'쇼케이스'};
export const defaultMotion=recipe=>recipe==='gallery'?'showcase':'subtle';
export function variantFile(recipe,scenario,preset=defaultMotion(recipe),componentSet='default'){return `${recipe}-${scenario}${preset===defaultMotion(recipe)?'':'-'+preset}${componentSet==='selected'?'-selected':''}`;}
const settings={subtle:{duration:420,distance:12,stagger:55},showcase:{duration:650,distance:28,stagger:85}};
const heroOrder={'hero-label':0,'hero-title':1,'hero-backdrop':2,'hero-visual':3,'hero-note':4,'hero-intro':3,'hero-meta':4};
export function mountPortfolioMotion(root,{replayScroll=true}={}){
  const media=window.matchMedia('(prefers-reduced-motion: reduce)');
  let stop=()=>{},disposed=false;
  for(const entry of componentMotions)for(const {selector,cue} of entry.bindings)root.querySelectorAll(selector).forEach((el,i)=>{el.dataset.reveal=cue;el.dataset.motionIndex=String(i);});
  function start(){
    stop();if(disposed)return;
    const requested=root.dataset.motionPreset,config=settings[requested];
    const enabled=!!config&&!media.matches&&typeof IntersectionObserver==='function'&&typeof Element.prototype.animate==='function';
    root.dataset.motionEffective=enabled?requested:'none';
    const animations=new Map(),pending=new Set();let observer=null,ended=false;
    const targets=()=>[...root.querySelectorAll('[data-reveal]')].filter(el=>el.getClientRects().length&&el.getBoundingClientRect().height>0);
    function finish(el){observer?.unobserve(el);pending.delete(el);el.dataset.motionState='shown';const a=animations.get(el);animations.delete(el);a?.cancel();}
    function show(el,delay=0,interaction=false,direction=0){
      if(ended)return;
      if(!enabled||root.dataset.inputMode==='keyboard'){finish(el);return;}
      observer?.unobserve(el);pending.delete(el);animations.get(el)?.cancel();
      const cue=el.dataset.reveal,base=getComputedStyle(el).transform,transform=base==='none'?'':base;
      if(!interaction)delay+=({'timeline-node':0,'timeline-line':70,'timeline-copy':110}[cue]||0);
      const distance=interaction?8:cue==='hero-note'?config.distance*1.3:config.distance;
      const from={opacity:0,transform:`translateY(${distance}px) ${transform}`.trim()};
      if(!interaction&&requested==='showcase'&&cue==='hero-visual')from.transform=`translateY(${distance}px) scale(.96) ${transform}`.trim();
      if(cue==='timeline-node')from.transform=`scale(.55) ${transform}`.trim();
      if(cue==='timeline-line'){from.transform=`${transform} scaleY(0)`.trim();from.transformOrigin='50% 0%';}
      if(cue==='timeline-copy')from.transform=`translateX(${requested==='showcase'?18:8}px) ${transform}`.trim();
      if(interaction&&direction&&cue==='hero-visual')from.transform=`translateX(${direction*32}px) rotate(${direction*2}deg) ${transform}`.trim();
      if(cue==='annotation')delay+=config.duration*.65+(Number(el.dataset.motionIndex)||0)*110;
      el.dataset.motionState='entering';
      try{
        const mark=el.getAttribute('data-annotation-drawing');
        const opacity=Number(el.getAttribute('opacity')??1);
        const frames=cue==='annotation'?(mark==='reveal'?[{clipPath:'inset(0 100% 0 0)'},{clipPath:'inset(0 0% 0 0)'}]:[{strokeDasharray:'1',strokeDashoffset:'1',opacity:0},{strokeDasharray:'1',strokeDashoffset:'0',opacity}]):[from,{opacity:1,transform:base,...(cue==='timeline-line'?{transformOrigin:'50% 0%'}:{})}];
        const a=el.animate(frames,{id:interaction?'component:stack':cue==='annotation'?'component:annotation':cue.startsWith('timeline-')?'component:'+cue:'entrance:'+cue,duration:interaction?220:config.duration,delay,easing:'cubic-bezier(.22,1,.36,1)',fill:'both'});
        animations.set(el,a);
        a.finished.then(()=>{if(!ended&&animations.get(el)===a)finish(el);},()=>{if(!ended&&animations.get(el)===a)finish(el);});
      }catch{finish(el);}
    }
    const revealAncestors=target=>{if(!(target instanceof Element))return;for(const el of root.querySelectorAll('[data-reveal]'))if(el===target||el.contains(target)||target.contains(el))finish(el);};
    const focus=e=>revealAncestors(e.target);
    const key=e=>{if(['Tab','ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Enter',' '].includes(e.key)){root.dataset.inputMode='keyboard';for(const el of [...animations.keys()])finish(el);}};
    const pointer=()=>{root.dataset.inputMode='pointer';};
    const hash=()=>{let target;try{target=document.getElementById(decodeURIComponent(location.hash.slice(1)));}catch{}if(target&&root.contains(target))revealAncestors(target);};
    const indices=new WeakMap();
    root.querySelectorAll('.project-showcase').forEach(deck=>indices.set(deck,Number(deck.querySelector('.showcase-selection input:checked')?.value)||0));
    const change=e=>{
      if(!(e.target instanceof Element)||!e.target.closest('.showcase-selection'))return;
      const deck=e.target.closest('.project-showcase'),index=Number(e.target.value),direction=Math.sign(index-(indices.get(deck)||0));indices.set(deck,index);
      deck.querySelectorAll('[data-reveal]').forEach(el=>{if(animations.has(el))finish(el);});
      deck.querySelectorAll('.showcase-panel').forEach(panel=>{if(!panel.getClientRects().length)return;panel.querySelectorAll('[data-reveal]').forEach(el=>{if(root.dataset.inputMode==='keyboard')finish(el);else show(el,el.dataset.reveal==='hero-note'?45:0,true,direction);});});
    };
    function cleanup(){
      ended=true;observer?.disconnect();for(const a of animations.values())a.cancel();animations.clear();pending.clear();
      root.querySelectorAll('[data-motion-state]').forEach(el=>delete el.dataset.motionState);
      root.removeEventListener('focusin',focus);root.removeEventListener('keydown',key);root.removeEventListener('pointerdown',pointer);root.removeEventListener('change',change);window.removeEventListener('hashchange',hash);
    }
    stop=cleanup;
    if(!enabled)return;
    try{
      observer=new IntersectionObserver(entries=>{for(const entry of entries)if(entry.isIntersecting){const el=entry.target;show(el,Math.min(Number(el.dataset.motionIndex)||0,3)*config.stagger);}}, {threshold:0,rootMargin:'0px 0px -24px 0px'});
      root.addEventListener('focusin',focus);root.addEventListener('keydown',key);root.addEventListener('pointerdown',pointer);root.addEventListener('change',change);window.addEventListener('hashchange',hash);
      for(const el of targets()){
        const rect=el.getBoundingClientRect(),cue=el.dataset.reveal;
        if(rect.bottom<=0){finish(el);continue;}
        if(rect.top<innerHeight-24){show(el,cue in heroOrder?heroOrder[cue]*config.stagger:Math.min(Number(el.dataset.motionIndex)||0,3)*config.stagger);}
        else{observer.observe(el);pending.add(el);el.dataset.motionState='pending';}
      }
      hash();
    }catch{cleanup();root.dataset.motionEffective='none';}
  }
  function replay(){root.dataset.inputMode='pointer';if(replayScroll)window.scrollTo({top:0,behavior:'instant'});start();}
  root.addEventListener('portfolio-motion-replay',replay);media.addEventListener('change',start);start();
  return ()=>{disposed=true;stop();root.removeEventListener('portfolio-motion-replay',replay);media.removeEventListener('change',start);delete root.dataset.motionEffective;delete root.dataset.inputMode;};
}
