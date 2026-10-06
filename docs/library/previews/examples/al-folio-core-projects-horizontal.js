var require=function(name){if(name.startsWith("@radix-ui/react-")&&window.__exModules["radix-ui"]){const key=name.slice(16).split("-").map(s=>s[0].toUpperCase()+s.slice(1)).join("");if(window.__exModules["radix-ui"][key])return window.__exModules["radix-ui"][key];}if(!(name in window.__exModules))throw new Error("Missing module: "+name);return window.__exModules[name]};
(()=>{var w=Object.create;var v=Object.defineProperty;var S=Object.getOwnPropertyDescriptor;var E=Object.getOwnPropertyNames;var b=Object.getPrototypeOf,R=Object.prototype.hasOwnProperty;var s=(e=>typeof require<"u"?require:typeof Proxy<"u"?new Proxy(e,{get:(t,r)=>(typeof require<"u"?require:t)[r]}):e)(function(e){if(typeof require<"u")return require.apply(this,arguments);throw Error('Dynamic require of "'+e+'" is not supported')});var x=(e,t,r,n)=>{if(t&&typeof t=="object"||typeof t=="function")for(let i of E(t))!R.call(e,i)&&i!==r&&v(e,i,{get:()=>t[i],enumerable:!(n=S(t,i))||n.enumerable});return e};var C=(e,t,r)=>(r=e!=null?w(b(e)):{},x(t||!e||!e.__esModule?v(r,"default",{value:e,enumerable:!0}):r,e));var h=C(s("react")),y=s("react-dom/client"),g=s("react-router-dom"),f=s("radix-ui"),o=s("react/jsx-runtime");function M(){return(0,o.jsxs)("article",{className:"template-example",children:[(0,o.jsx)("h1",{children:"\uC774\uBBF8\uC9C0\uC640 \uC694\uC57D\uC744 \uB098\uB780\uD788 \uBC30\uCE58\uD55C \uD504\uB85C\uC81D\uD2B8 \xB7 \uC608\uC2DC \uB370\uC774\uD130"}),(0,o.jsx)("div",{dangerouslySetInnerHTML:{__html:`<div class="col mb-4">
  <a href="#">
    <div class="card h-100 hoverable">
      <div class="row no-gutters">
        
        <div class="col-md-12">
          <div class="card-body">
            <h3 class="card-title">\uC774\uBBF8\uC9C0 \uC5C6\uB294 \uC608\uC2DC \uD504\uB85C\uC81D\uD2B8</h3>
            <p class="card-text">\uD504\uB85C\uC81D\uD2B8\uC758 \uBAA9\uD45C\uC640 \uB2F4\uB2F9 \uBC94\uC704\uB97C \uAC04\uB2E8\uD788 \uC124\uBA85\uD569\uB2C8\uB2E4.</p>
            <div class="row ml-1 mr-1 p-0">
              
            </div>
          </div>
        </div>
      </div>
    </div>
  </a>
</div>
`}})]})}function a(e,t=""){document.documentElement.dataset.previewStatus=e,document.documentElement.dataset.previewReason=t;let r="";if(e==="ready"){let n=document.getElementById("demo"),i=n.cloneNode(!0),d=[n,...n.querySelectorAll("*")],p=[i,...i.querySelectorAll("*")];for(let l=0;l<d.length;l++){let u=getComputedStyle(d[l]);if(d[l].style?.length)for(let c of[...d[l].style])c.startsWith("--")||p[l].style.setProperty(c,u.getPropertyValue(c));u.opacity==="0"&&(p[l].style.opacity="1")}r=i.outerHTML}parent.postMessage({type:"expresso-all-preview",id:"al-folio-core-projects-horizontal",status:e,reason:t,html:r},"*")}var m=class extends h.default.Component{state={error:null};static getDerivedStateFromError(t){return{error:String(t)}}componentDidCatch(t,r){a("error",String(t)+" "+r.componentStack)}render(){return this.state.error?(0,o.jsx)("pre",{role:"alert",children:this.state.error}):this.props.children}};window.addEventListener("error",e=>a("error",e.message));window.addEventListener("unhandledrejection",e=>a("error",String(e.reason)));(0,y.createRoot)(document.getElementById("demo")).render((0,o.jsx)(m,{children:(0,o.jsx)(g.MemoryRouter,{children:(0,o.jsx)(f.Tooltip.Provider,{children:(0,o.jsx)(M,{})})})}));setTimeout(()=>{if(document.documentElement.dataset.previewStatus==="error")return;let t=[...document.getElementById("demo").querySelectorAll("*")].some(r=>{let n=r.getBoundingClientRect();return n.width>2&&n.height>2&&(r.textContent.trim()||r.matches("input,textarea,select,button,svg,canvas,img,video,[data-slot=skeleton]"))});a(t?"ready":"empty",t?"":"\uC6D0\uBCF8 \uD45C\uC2DC \uB0B4\uC6A9 \uC5C6\uC74C")},3e3);})();
