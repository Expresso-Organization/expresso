var require=function(name){if(name.startsWith("@radix-ui/react-")&&window.__exModules["radix-ui"]){const key=name.slice(16).split("-").map(s=>s[0].toUpperCase()+s.slice(1)).join("");if(window.__exModules["radix-ui"][key])return window.__exModules["radix-ui"][key];}if(!(name in window.__exModules))throw new Error("Missing module: "+name);return window.__exModules[name]};
(()=>{var S=Object.create;var g=Object.defineProperty;var w=Object.getOwnPropertyDescriptor;var E=Object.getOwnPropertyNames;var R=Object.getPrototypeOf,b=Object.prototype.hasOwnProperty;var s=(e=>typeof require<"u"?require:typeof Proxy<"u"?new Proxy(e,{get:(t,r)=>(typeof require<"u"?require:t)[r]}):e)(function(e){if(typeof require<"u")return require.apply(this,arguments);throw Error('Dynamic require of "'+e+'" is not supported')});var x=(e,t,r,o)=>{if(t&&typeof t=="object"||typeof t=="function")for(let l of E(t))!b.call(e,l)&&l!==r&&g(e,l,{get:()=>t[l],enumerable:!(o=w(t,l))||o.enumerable});return e};var B=(e,t,r)=>(r=e!=null?S(R(e)):{},x(t||!e||!e.__esModule?g(r,"default",{value:e,enumerable:!0}):r,e));var h=B(s("react")),y=s("react-dom/client"),f=s("react-router-dom"),v=s("radix-ui"),n=s("react/jsx-runtime");function C(){return(0,n.jsxs)("article",{className:"template-example",children:[(0,n.jsx)("h1",{children:"\uC790\uACA9\xB7\uBC1C\uAE09 \uAE30\uAD00\xB7\uB9C1\uD06C \xB7 \uC608\uC2DC \uB370\uC774\uD130"}),(0,n.jsx)("div",{dangerouslySetInnerHTML:{__html:`

<ul class="card-text font-weight-light list-group list-group-flush">
  
    <li class="list-group-item">
      
      
        <strong
          ><a href="#" target="_blank">\uC608\uC2DC \uD56D\uBAA9</a></strong
        >
      

      
        - <em>\uC608\uC2DC \uBC1C\uAE09 \uAE30\uAD00</em>
      

      
        (2026)
      
    </li>
  
    <li class="list-group-item">
      
      
        <strong
          ><a href="#" target="_blank">\uC608\uC2DC \uD56D\uBAA9 B</a></strong
        >
      

      
        - <em>\uC608\uC2DC \uBC1C\uAE09 \uAE30\uAD00</em>
      

      
        (2026)
      
    </li>
  
</ul>
`}})]})}function c(e,t=""){document.documentElement.dataset.previewStatus=e,document.documentElement.dataset.previewReason=t;let r="";if(e==="ready"){let o=document.getElementById("demo"),l=o.cloneNode(!0),a=[o,...o.querySelectorAll("*")],u=[l,...l.querySelectorAll("*")];for(let i=0;i<a.length;i++){let p=getComputedStyle(a[i]);if(a[i].style?.length)for(let m of[...a[i].style])m.startsWith("--")||u[i].style.setProperty(m,p.getPropertyValue(m));p.opacity==="0"&&(u[i].style.opacity="1")}r=l.outerHTML}parent.postMessage({type:"expresso-all-preview",id:"al-folio-cv-certificates",status:e,reason:t,html:r},"*")}var d=class extends h.default.Component{state={error:null};static getDerivedStateFromError(t){return{error:String(t)}}componentDidCatch(t,r){c("error",String(t)+" "+r.componentStack)}render(){return this.state.error?(0,n.jsx)("pre",{role:"alert",children:this.state.error}):this.props.children}};window.addEventListener("error",e=>c("error",e.message));window.addEventListener("unhandledrejection",e=>c("error",String(e.reason)));(0,y.createRoot)(document.getElementById("demo")).render((0,n.jsx)(d,{children:(0,n.jsx)(f.MemoryRouter,{children:(0,n.jsx)(v.Tooltip.Provider,{children:(0,n.jsx)(C,{})})})}));setTimeout(()=>{if(document.documentElement.dataset.previewStatus==="error")return;let t=[...document.getElementById("demo").querySelectorAll("*")].some(r=>{let o=r.getBoundingClientRect();return o.width>2&&o.height>2&&(r.textContent.trim()||r.matches("input,textarea,select,button,svg,canvas,img,video,[data-slot=skeleton]"))});c(t?"ready":"empty",t?"":"\uC6D0\uBCF8 \uD45C\uC2DC \uB0B4\uC6A9 \uC5C6\uC74C")},3e3);})();
