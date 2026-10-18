var require=function(name){if(!(name in window.__exModules))throw new Error("실행 모듈 누락: "+name);return window.__exModules[name]};
(()=>{var N=Object.create;var _=Object.defineProperty;var S=Object.getOwnPropertyDescriptor;var z=Object.getOwnPropertyNames;var E=Object.getPrototypeOf,C=Object.prototype.hasOwnProperty;var l=(e=>typeof require<"u"?require:typeof Proxy<"u"?new Proxy(e,{get:(r,a)=>(typeof require<"u"?require:r)[a]}):e)(function(e){if(typeof require<"u")return require.apply(this,arguments);throw Error('Dynamic require of "'+e+'" is not supported')});var L=(e,r,a,o)=>{if(r&&typeof r=="object"||typeof r=="function")for(let s of z(r))!C.call(e,s)&&s!==a&&_(e,s,{get:()=>r[s],enumerable:!(o=S(r,s))||o.enumerable});return e};var P=(e,r,a)=>(a=e!=null?N(E(e)):{},L(r||!e||!e.__esModule?_(a,"default",{value:e,enumerable:!0}):a,e));var w=P(l("react")),k=l("react-dom/client");var d=l("react"),g=l("lucide-react"),t=l("react/jsx-runtime"),T=[{name:"Starter",monthlyPrice:0,yearlyPrice:0,description:"For personal projects and ideas taking their first shape.",features:["3 active projects","Unlimited collaborators","Core analytics","Community support","7-day version history","Standard integrations"],includesLabel:"Starter includes",cta:"Start for free"},{name:"Studio",monthlyPrice:32,yearlyPrice:307,description:"For small teams building and shipping every week.",features:["Unlimited projects","Custom domains","Advanced analytics","Priority support","Unlimited version history","Team permissions"],includesLabel:"Everything in Starter, plus",cta:"Choose Studio",featured:!0},{name:"Scale",monthlyPrice:96,yearlyPrice:922,description:"For growing organizations that need control and support.",features:["Everything in Studio","Single sign-on","Audit logs","Dedicated onboarding","Custom data retention","Enterprise integrations"],includesLabel:"Everything in Studio, plus",cta:"Choose Scale"}];function b(e,r,a){if(!a){let o=e.style.transition;e.style.transition="none",e.style.transform=`translateX(${r.offsetLeft}px)`,e.style.width=`${r.offsetWidth}px`,e.offsetWidth,e.style.transition=o;return}e.style.transform=`translateX(${r.offsetLeft}px)`,e.style.width=`${r.offsetWidth}px`}function x(){let[e,r]=(0,d.useState)("monthly"),a=(0,d.useRef)(null),o=(0,d.useRef)(null),s=(0,d.useRef)(null),h=(0,d.useRef)([]),v=(0,d.useRef)(!1);return(0,d.useLayoutEffect)(()=>{let i=a.current,c=o.current;if(!i||!c)return;b(i,c,!1);let n=()=>{let p=s.current?.getAttribute("aria-selected")==="true"?s.current:o.current;i&&p&&b(i,p,!1)};return window.addEventListener("resize",n),()=>window.removeEventListener("resize",n)},[]),(0,d.useEffect)(()=>{if(!v.current){v.current=!0;return}let i=a.current,c=e==="monthly"?o.current:s.current;i&&c&&b(i,c,!0),h.current.forEach(n=>{n&&(n.classList.remove("is-animating"),n.offsetHeight,n.classList.add("is-animating"))})},[e]),(0,t.jsxs)("section",{className:"pricing-02 relative min-h-screen overflow-hidden bg-white px-4 py-20 text-[#172033] transition-colors duration-300 dark:bg-[#101010] dark:text-white sm:px-6 lg:px-8 lg:py-28",children:[(0,t.jsx)("style",{children:`
        .pricing-02 {
          --digit-dur: 500ms;
          --digit-distance: 8px;
          --digit-stagger: 70ms;
          --digit-blur: 2px;
          --digit-ease: cubic-bezier(0.34, 1.45, 0.64, 1);
          --digit-dir-x: 0;
          --digit-dir-y: 1;
          --tabs-dur: 250ms;
          --tabs-ease: cubic-bezier(0.22, 1, 0.36, 1);
          --tabs-text-muted: rgba(71, 85, 105, 0.82);
          --tabs-text-hover: #334155;
          --tabs-text-active: #ffffff;
          --tabs-bar-bg: #ffffff;
          --tabs-pill-bg: #172033;
        }

        .dark .pricing-02 {
          --tabs-text-muted: rgba(161, 161, 170, 0.76);
          --tabs-text-hover: #f4f4f5;
          --tabs-text-active: #18181b;
          --tabs-bar-bg: #1a1a1a;
          --tabs-pill-bg: #f4f4f5;
        }

        @keyframes t-digit-pop-in {
          0% {
            transform: translate(
              calc(var(--digit-distance) * var(--digit-dir-x)),
              calc(var(--digit-distance) * var(--digit-dir-y))
            );
            opacity: 0;
            filter: blur(var(--digit-blur));
          }
          100% {
            transform: translate(0, 0);
            opacity: 1;
            filter: blur(0);
          }
        }

        .t-digit-group {
          display: inline-flex;
          align-items: baseline;
        }
        .t-digit {
          display: inline-block;
          will-change: transform, opacity, filter;
        }
        .t-digit-group.is-animating .t-digit {
          animation: t-digit-pop-in var(--digit-dur) var(--digit-ease) both;
        }
        .t-digit-group.is-animating .t-digit[data-stagger="1"] {
          animation-delay: var(--digit-stagger);
        }
        .t-digit-group.is-animating .t-digit[data-stagger="2"] {
          animation-delay: calc(var(--digit-stagger) * 2);
        }

        .t-tabs {
          position: relative;
          display: inline-flex;
          align-items: center;
          gap: 3px;
          padding: 3px;
          border-radius: 48px;
          background: var(--tabs-bar-bg);
        }
        .t-tab {
          position: relative;
          appearance: none;
          border: 0;
          background: transparent;
          height: 30px;
          padding: 4px 12px;
          color: var(--tabs-text-muted);
          cursor: pointer;
          border-radius: 48px;
          z-index: 1;
          transition: color var(--tabs-dur) var(--tabs-ease);
        }
        .t-tab:not([aria-selected="true"]):hover {
          color: var(--tabs-text-hover);
        }
        .t-tab[aria-selected="true"] {
          color: var(--tabs-text-active);
        }

        .t-tabs-pill {
          position: absolute;
          top: 3px;
          left: 0;
          height: 30px;
          width: 0;
          background: var(--tabs-pill-bg);
          border-radius: 48px;
          transform: translateX(0);
          transition:
            transform var(--tabs-dur) var(--tabs-ease),
            width var(--tabs-dur) var(--tabs-ease);
          will-change: transform, width;
          z-index: 0;
          pointer-events: none;
        }

        @media (prefers-reduced-motion: reduce) {
          .t-digit-group .t-digit {
            animation: none !important;
          }
          .t-tabs-pill,
          .t-tab {
            transition: none !important;
          }
        }
      `}),(0,t.jsxs)("div",{className:"mx-auto max-w-6xl",children:[(0,t.jsxs)("div",{className:"grid gap-6 md:grid-cols-12 md:items-end",children:[(0,t.jsxs)("div",{className:"md:col-span-6",children:[(0,t.jsx)("p",{className:"text-xs font-medium uppercase tracking-[0.18em] text-slate-400 dark:text-zinc-500",children:"Simple pricing"}),(0,t.jsxs)("h2",{className:"mt-4 max-w-xl text-4xl font-medium leading-[1.02] tracking-[-0.045em] sm:text-5xl",children:["Start small.",(0,t.jsx)("br",{}),"Keep room to grow."]})]}),(0,t.jsxs)("div",{className:"md:col-span-4 md:col-start-9",children:[(0,t.jsx)("p",{className:"max-w-md text-sm leading-6 text-slate-500 dark:text-zinc-400",children:"Straightforward monthly plans with every essential included. Upgrade, downgrade, or cancel whenever you like."}),(0,t.jsxs)("div",{className:"t-tabs mt-5 border border-slate-200 text-xs shadow-sm dark:border-zinc-700 dark:shadow-none",role:"tablist","aria-label":"Billing cycle",children:[(0,t.jsx)("span",{ref:a,className:"t-tabs-pill","aria-hidden":"true"}),(0,t.jsx)("button",{ref:o,type:"button",role:"tab","aria-selected":e==="monthly",className:`t-tab font-medium ${e==="monthly"?"text-white dark:text-zinc-950":""}`,onClick:()=>r("monthly"),children:"Monthly"}),(0,t.jsx)("button",{ref:s,type:"button",role:"tab","aria-selected":e==="yearly",className:`t-tab font-medium ${e==="yearly"?"text-white dark:text-zinc-950":""}`,onClick:()=>r("yearly"),children:"Yearly \xB7 save 20%"})]})]})]}),(0,t.jsx)("div",{className:"relative mt-12 grid gap-3 lg:grid-cols-3",children:T.map((i,c)=>(0,t.jsxs)("article",{className:"group relative isolate flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white/70 p-2 shadow-[0_18px_55px_-46px_rgba(15,23,42,0.35)] transition-[border-color,box-shadow] duration-500 ease-out hover:border-slate-300 hover:shadow-[0_24px_70px_-50px_rgba(15,23,42,0.52)] dark:border-white/[0.08] dark:bg-[#151515] dark:shadow-[0_18px_55px_-46px_rgba(0,0,0,0.95)] dark:hover:border-white/[0.15] dark:hover:shadow-[0_24px_70px_-48px_rgba(0,0,0,1)] lg:min-h-[640px]",children:[(0,t.jsx)("div",{"aria-hidden":"true",className:"pointer-events-none absolute inset-x-0 top-0 z-0 h-72 bg-[radial-gradient(ellipse_at_50%_-20%,rgba(148,163,184,0.16),transparent_66%)] opacity-0 transition-opacity duration-500 ease-out group-hover:opacity-100 dark:bg-[radial-gradient(ellipse_at_50%_-20%,rgba(255,255,255,0.09),transparent_64%)]"}),(0,t.jsxs)("div",{className:`relative z-10 flex min-h-[248px] flex-col rounded-xl p-5 shadow-[0_0_0_1px_rgba(0,0,0,0.06),inset_0_8px_18px_-20px_rgba(15,23,42,0.45),inset_0_-8px_18px_-22px_rgba(15,23,42,0.4)] transition-[background-color,box-shadow] duration-500 ease-out group-hover:shadow-[0_0_0_1px_rgba(0,0,0,0.075),inset_0_8px_18px_-20px_rgba(15,23,42,0.45),inset_0_-8px_18px_-22px_rgba(15,23,42,0.4)] dark:shadow-[0_0_0_1px_rgba(255,255,255,0.085),inset_0_8px_18px_-20px_rgba(255,255,255,0.45),inset_0_-8px_18px_-22px_rgba(255,255,255,0.4)] dark:group-hover:shadow-[0_0_0_1px_rgba(255,255,255,0.105),inset_0_8px_18px_-20px_rgba(255,255,255,0.45),inset_0_-8px_18px_-22px_rgba(255,255,255,0.4)] ${i.featured?"bg-[radial-gradient(circle_at_50%_0%,#eef2f7_0%,#ffffff_62%)] dark:bg-[radial-gradient(circle_at_50%_0%,#292929_0%,#1a1a1a_62%)]":"bg-white dark:bg-[#1a1a1a]"}`,children:[(0,t.jsxs)("div",{children:[(0,t.jsx)("p",{className:"text-base font-medium",children:i.name}),(0,t.jsx)("p",{className:"mt-2 min-h-12 max-w-xs text-sm leading-6 text-slate-500 dark:text-zinc-400",children:i.description})]}),(0,t.jsxs)("div",{className:"mt-4 flex min-h-10 items-end gap-1.5",children:[(0,t.jsx)("span",{ref:n=>{h.current[c]=n},className:"t-digit-group text-4xl font-medium leading-none tracking-[-0.045em]",style:{"--digit-dir-y":e==="yearly"?1:-1},children:`$${e==="monthly"?i.monthlyPrice:i.yearlyPrice}`.split("").map((n,p,y)=>(0,t.jsx)("span",{className:"t-digit","data-stagger":p===y.length-2?"1":p===y.length-1?"2":void 0,children:n},`${e}-${p}-${n}`))}),(0,t.jsxs)("span",{className:"pb-1 text-sm text-slate-400 dark:text-zinc-500",children:["/ ",e==="monthly"?"month":"year"]})]}),(0,t.jsxs)("a",{href:"#",className:`mt-auto flex h-10 items-center justify-between rounded-lg px-4 text-sm font-medium transition-[background-color,color,transform] duration-300 active:scale-[0.99] ${i.featured?"bg-[#172033] text-white hover:bg-slate-700 dark:bg-zinc-100 dark:text-zinc-950 dark:hover:bg-white":"border border-slate-200 bg-white text-[#172033] hover:border-slate-300 hover:bg-slate-50 dark:border-white/[0.1] dark:bg-transparent dark:text-zinc-100 dark:hover:border-white/[0.16] dark:hover:bg-white/[0.04]"}`,children:[i.cta,(0,t.jsx)(g.ArrowRight,{className:"size-4 transition-transform duration-300 group-hover:translate-x-0.5"})]})]}),(0,t.jsxs)("div",{className:"relative z-10 flex flex-1 flex-col px-4 pb-5 pt-8 sm:px-5",children:[(0,t.jsx)("p",{className:"text-[11px] font-medium uppercase tracking-[0.15em] text-slate-400 dark:text-zinc-500",children:i.includesLabel}),(0,t.jsx)("ul",{className:"mt-5 space-y-4",children:i.features.map(n=>(0,t.jsxs)("li",{className:"flex items-center gap-2.5 text-sm text-slate-600 dark:text-zinc-300",children:[(0,t.jsx)("span",{className:"flex size-5 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-300",children:(0,t.jsx)(g.Check,{className:"size-3"})}),n]},n))})]})]},i.name))}),(0,t.jsxs)("div",{className:"mt-5 flex flex-col gap-2 text-xs text-slate-400 dark:text-zinc-600 sm:flex-row sm:items-center sm:justify-between",children:[(0,t.jsx)("p",{children:"No credit card required for Starter."}),(0,t.jsx)("p",{children:"Prices exclude applicable taxes."})]})]})]})}var m=l("react/jsx-runtime"),R=x;function B(){return(0,m.jsx)(R,{})}function u(e,r=""){document.documentElement.dataset.previewStatus=e,document.documentElement.dataset.previewReason=r,parent.postMessage({type:"expresso-componentry-preview",id:"componentry-pricing-02",status:e,reason:r},"*")}var f=class extends w.default.Component{state={error:null};static getDerivedStateFromError(r){return{error:String(r)}}componentDidCatch(r){u("error",String(r))}render(){return this.state.error?(0,m.jsx)("pre",{role:"alert",children:this.state.error}):this.props.children}};window.addEventListener("error",e=>u("error",e.message));window.addEventListener("unhandledrejection",e=>u("error",String(e.reason)));(0,k.createRoot)(document.getElementById("demo")).render((0,m.jsx)(f,{children:(0,m.jsx)(B,{})}));setTimeout(()=>{if(document.documentElement.dataset.previewStatus==="error")return;let r=[...document.getElementById("demo").querySelectorAll("*")].some(a=>{let o=a.getBoundingClientRect(),s=getComputedStyle(a);return o.width>2&&o.height>2&&(a.textContent.trim()||a.matches("input,textarea,select,button,svg,canvas,img,video")||s.backgroundImage!=="none"||s.backgroundColor!=="rgba(0, 0, 0, 0)"&&s.backgroundColor!=="transparent")});u(r?"ready":"empty",r?"":"\uCEF4\uD3EC\uB10C\uD2B8\uC758 \uD45C\uC2DC \uB0B4\uC6A9\uC774 \uC5C6\uC2B5\uB2C8\uB2E4.")},3500);})();
