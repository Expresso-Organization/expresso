// 원본 컴포넌트 코드를 바꾸지 않고 실행 예제의 모션 선택을 연결합니다.
(() => {
  const script=document.currentScript;
  const id=script?.dataset.expressoMotion;
  if(!id)return;
  const strategy=script.dataset.motionPolicy;
  const requested=new URLSearchParams(location.search).get('exMotion');
  const mode=['none','subtle','showcase'].includes(requested)?requested:'original';
  const html=document.documentElement;
  html.dataset.exMotionMode=mode;
  html.dataset.exMotionStrategy=strategy;
  const nativeMatchMedia=window.matchMedia.bind(window);
  const systemReduced=nativeMatchMedia('(prefers-reduced-motion: reduce)').matches;
  window.__expressoMotionMode=mode;

  if(mode==='none'){
    const reducedQuery=query=>/prefers-reduced-motion\s*:\s*reduce/.test(query);
    window.matchMedia=query=>{
      if(!reducedQuery(query))return nativeMatchMedia(query);
      return {media:query,matches:true,onchange:null,addEventListener(){},removeEventListener(){},addListener(){},removeListener(){},dispatchEvent(){return true;}};
    };
    const style=document.createElement('style');
    style.dataset.exMotionReset='';
    style.textContent='html[data-ex-motion-mode="none"] *,html[data-ex-motion-mode="none"] *::before,html[data-ex-motion-mode="none"] *::after{animation-duration:0s!important;animation-delay:0s!important;animation-iteration-count:1!important;transition-duration:0s!important;transition-delay:0s!important;scroll-behavior:auto!important}';
    document.head.append(style);
    if(typeof Element.prototype.animate==='function'){
      const animate=Element.prototype.animate;
      Element.prototype.animate=function(keyframes,options){
        const timing=typeof options==='number'?{duration:0}:({...options,duration:0,delay:0,iterations:1});
        return animate.call(this,keyframes,timing);
      };
    }
    // vendor.js 뒤에서 실행되므로 원본 예제의 React root 생성만 감쌉니다.
    const modules=window.__exModules;
    const client=modules?.['react-dom/client'];
    const react=modules?.react;
    const motion=modules?.['motion/react']||modules?.['framer-motion'];
    if(client?.createRoot&&react?.createElement&&motion?.MotionConfig){
      modules['react-dom/client']={...client,createRoot(...args){
        const root=client.createRoot(...args);
        return {render(element){root.render(react.createElement(motion.MotionConfig,{reducedMotion:'always',transition:{duration:0}},element));},unmount(){root.unmount();}};
      }};
      html.dataset.exMotionReact='wrapped';
    }
  }

  const report=state=>{
    html.dataset.exMotionState=state;
    if(parent!==window)parent.postMessage({type:'expresso-motion-preview',id,mode,strategy,state},'*');
  };
  if(mode==='original'||mode==='none'||strategy==='preserve_native'||systemReduced){report('ready');return;}
  const root=document.getElementById('demo')||document.getElementById('root');
  if(!root){report('ready');return;}
  let done=false;
  const observer=new MutationObserver(reveal);
  const animateTarget=(target,frames,options)=>target.animate(frames,{...options,fill:'backwards'}).finished.catch(()=>{});
  function choreography(){
    const showcase=mode==='showcase';
    const duration=showcase?640:420;
    const ease='cubic-bezier(.22,1,.36,1)';
    const animations=[animateTarget(root,[{opacity:0,transform:`translateY(${showcase?24:10}px)`},{opacity:1,transform:'none'}],{id:'expresso:shared-reveal',duration,easing:ease})];
    if(showcase){
      const candidates=[...root.querySelectorAll('h1,h2,h3,article,section,[class*="card"],img,button,a')];
      const targets=[];
      for(const element of candidates){
        if(targets.length===8)break;
        if(!element.getClientRects().length||targets.some(parent=>parent.contains(element)))continue;
        targets.push(element);
      }
      targets.forEach((element,index)=>animations.push(animateTarget(element,[{opacity:0,transform:'translateY(14px)'},{opacity:1,transform:'none'}],{id:`expresso:stagger-${index}`,duration:500,delay:100+index*65,easing:ease})));
    }
    Promise.all(animations).then(()=>report('ready'));
  }
  function reveal(){
    if(done||!root.firstElementChild)return;
    done=true;observer.disconnect();
    if(typeof root.animate==='function')choreography();
    else report('ready');
  }
  observer.observe(root,{childList:true});
  reveal();
  setTimeout(()=>{if(!done){observer.disconnect();report('ready');}},5000);
})();
