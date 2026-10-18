var require=function(name){if(name.startsWith("@radix-ui/react-")&&window.__exModules["radix-ui"]){const key=name.slice(16).split("-").map(s=>s[0].toUpperCase()+s.slice(1)).join("");if(window.__exModules["radix-ui"][key])return window.__exModules["radix-ui"][key];}if(!(name in window.__exModules))throw new Error("Missing module: "+name);return window.__exModules[name]};
(()=>{var S=Object.create;var g=Object.defineProperty;var w=Object.getOwnPropertyDescriptor;var E=Object.getOwnPropertyNames;var R=Object.getPrototypeOf,k=Object.prototype.hasOwnProperty;var s=(e=>typeof require<"u"?require:typeof Proxy<"u"?new Proxy(e,{get:(t,n)=>(typeof require<"u"?require:t)[n]}):e)(function(e){if(typeof require<"u")return require.apply(this,arguments);throw Error('Dynamic require of "'+e+'" is not supported')});var P=(e,t,n,o)=>{if(t&&typeof t=="object"||typeof t=="function")for(let i of E(t))!k.call(e,i)&&i!==n&&g(e,i,{get:()=>t[i],enumerable:!(o=w(t,i))||o.enumerable});return e};var x=(e,t,n)=>(n=e!=null?S(R(e)):{},P(t||!e||!e.__esModule?g(n,"default",{value:e,enumerable:!0}):n,e));var y=x(s("react")),h=s("react-dom/client"),v=s("react-router-dom"),f=s("radix-ui"),r=s("react/jsx-runtime");function B(){return(0,r.jsxs)("article",{className:"template-example",children:[(0,r.jsx)("h1",{children:"\uBD84\uC57C\uBCC4 \uAE30\uC220\uACFC \uD0A4\uC6CC\uB4DC \xB7 \uC608\uC2DC \uB370\uC774\uD130"}),(0,r.jsx)("div",{dangerouslySetInnerHTML:{__html:`

<div class="card-text font-weight-light">
  
    <div class="skill-item">
      
      <strong>\uC608\uC2DC \uD56D\uBAA9 (\uC2E4\uBB34 \uD65C\uC6A9):</strong
      >
      
        
          
            React,
          
        
          
            Python,
          
        
          
            \uB370\uC774\uD130 \uBD84\uC11D
          
        
      
    </div>
  
    <div class="skill-item">
      
      <strong>\uC608\uC2DC \uD56D\uBAA9 B (\uC2E4\uBB34 \uD65C\uC6A9):</strong
      >
      
        
          
            React,
          
        
          
            Python,
          
        
          
            \uB370\uC774\uD130 \uBD84\uC11D
          
        
      
    </div>
  
</div>

<style>
  .skill-item {
    padding: 0.5rem 0;
  }
</style>
`}})]})}function a(e,t=""){document.documentElement.dataset.previewStatus=e,document.documentElement.dataset.previewReason=t;let n="";if(e==="ready"){let o=document.getElementById("demo"),i=o.cloneNode(!0),d=[o,...o.querySelectorAll("*")],p=[i,...i.querySelectorAll("*")];for(let l=0;l<d.length;l++){let u=getComputedStyle(d[l]);if(d[l].style?.length)for(let c of[...d[l].style])c.startsWith("--")||p[l].style.setProperty(c,u.getPropertyValue(c));u.opacity==="0"&&(p[l].style.opacity="1")}n=i.outerHTML}parent.postMessage({type:"expresso-all-preview",id:"al-folio-cv-skills",status:e,reason:t,html:n},"*")}var m=class extends y.default.Component{state={error:null};static getDerivedStateFromError(t){return{error:String(t)}}componentDidCatch(t,n){a("error",String(t)+" "+n.componentStack)}render(){return this.state.error?(0,r.jsx)("pre",{role:"alert",children:this.state.error}):this.props.children}};window.addEventListener("error",e=>a("error",e.message));window.addEventListener("unhandledrejection",e=>a("error",String(e.reason)));(0,h.createRoot)(document.getElementById("demo")).render((0,r.jsx)(m,{children:(0,r.jsx)(v.MemoryRouter,{children:(0,r.jsx)(f.Tooltip.Provider,{children:(0,r.jsx)(B,{})})})}));setTimeout(()=>{if(document.documentElement.dataset.previewStatus==="error")return;let t=[...document.getElementById("demo").querySelectorAll("*")].some(n=>{let o=n.getBoundingClientRect();return o.width>2&&o.height>2&&(n.textContent.trim()||n.matches("input,textarea,select,button,svg,canvas,img,video,[data-slot=skeleton]"))});a(t?"ready":"empty",t?"":"\uC6D0\uBCF8 \uD45C\uC2DC \uB0B4\uC6A9 \uC5C6\uC74C")},3e3);})();
