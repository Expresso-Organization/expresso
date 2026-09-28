// 같은 실행기를 React 미리보기와 단일 HTML에서 사용합니다.
export const motionPresets={none:'없음',subtle:'차분하게',showcase:'쇼케이스'};
export const defaultMotion=recipe=>recipe==='gallery'?'showcase':'subtle';
export function variantFile(recipe,scenario,preset=defaultMotion(recipe)){return `${recipe}-${scenario}${preset===defaultMotion(recipe)?'':'-'+preset}`;}
const settings={subtle:{duration:420,distance:12,stagger:55},showcase:{duration:650,distance:28,stagger:85}};
const heroOrder={'hero-label':0,'hero-title':1,'hero-backdrop':2,'hero-visual':3,'hero-note':4,'hero-intro':3,'hero-meta':4};
export function mountPortfolioMotion(root){
  const media=window.matchMedia('(prefers-reduced-motion: reduce)');
  let stop=()=>{},disposed=false;
  const cueSelectors=[['.career .section-heading','section'],['.career-item','card'],['.v-evidence .section-heading','section'],['.v-evidence-group','card'],['.contact','section']];
  for(const [selector,cue] of cueSelectors)root.querySelectorAll(selector).forEach((el,i)=>{el.dataset.reveal=cue;el.dataset.motionIndex=String(i);});
  function start(){
    stop();if(disposed)return;
    const requested=root.dataset.motionPreset,config=settings[requested];
    const enabled=!!config&&!media.matches&&typeof IntersectionObserver==='function'&&typeof Element.prototype.animate==='function';
    root.dataset.motionEffective=enabled?requested:'none';
    const animations=new Map(),pending=new Set();let observer=null,ended=false;
    const targets=()=>[...root.querySelectorAll('[data-reveal]')].filter(el=>el.getClientRects().length&&el.getBoundingClientRect().height>0);
    function finish(el){observer?.unobserve(el);pending.delete(el);el.dataset.motionState='shown';const a=animations.get(el);animations.delete(el);a?.cancel();}
    function show(el,delay=0,interaction=false){
      if(ended)return;
      if(!enabled||root.dataset.inputMode==='keyboard'){finish(el);return;}
      observer?.unobserve(el);pending.delete(el);animations.get(el)?.cancel();
      const cue=el.dataset.reveal,base=getComputedStyle(el).transform,transform=base==='none'?'':base;
      const distance=interaction?8:cue==='hero-note'?config.distance*1.3:config.distance;
      const from={opacity:0,transform:`translateY(${distance}px) ${transform}`.trim()};
      if(!interaction&&requested==='showcase'&&cue==='hero-visual')from.transform=`translateY(${distance}px) scale(.96) ${transform}`.trim();
      el.dataset.motionState='entering';
      try{
        const a=el.animate([from,{opacity:1,transform:base}],{duration:interaction?220:config.duration,delay,easing:'cubic-bezier(.22,1,.36,1)',fill:'both'});
        animations.set(el,a);
        a.finished.then(()=>{if(!ended&&animations.get(el)===a)finish(el);},()=>{if(!ended&&animations.get(el)===a)finish(el);});
      }catch{finish(el);}
    }
    const revealAncestors=target=>{if(!(target instanceof Element))return;for(const el of root.querySelectorAll('[data-reveal]'))if(el===target||el.contains(target)||target.contains(el))finish(el);};
    const focus=e=>revealAncestors(e.target);
    const key=e=>{if(['Tab','ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Enter',' '].includes(e.key)){root.dataset.inputMode='keyboard';for(const el of [...animations.keys()])finish(el);}};
    const pointer=()=>{root.dataset.inputMode='pointer';};
    const hash=()=>{let target;try{target=document.getElementById(decodeURIComponent(location.hash.slice(1)));}catch{}if(target&&root.contains(target))revealAncestors(target);};
    const change=e=>{
      if(!(e.target instanceof Element)||!e.target.closest('.showcase-selection'))return;
      root.querySelectorAll('.showcase-panel').forEach(panel=>{if(!panel.getClientRects().length)return;panel.querySelectorAll('[data-reveal]').forEach(el=>{if(root.dataset.inputMode==='keyboard')finish(el);else show(el,0,true);});});
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
  function replay(){root.dataset.inputMode='pointer';window.scrollTo({top:0,behavior:'instant'});start();}
  root.addEventListener('portfolio-motion-replay',replay);media.addEventListener('change',start);start();
  return ()=>{disposed=true;stop();root.removeEventListener('portfolio-motion-replay',replay);media.removeEventListener('change',start);delete root.dataset.motionEffective;delete root.dataset.inputMode;};
}
