var require=function(name){if(name.startsWith("@radix-ui/react-")&&window.__exModules["radix-ui"]){const key=name.slice(16).split("-").map(s=>s[0].toUpperCase()+s.slice(1)).join("");if(window.__exModules["radix-ui"][key])return window.__exModules["radix-ui"][key];}if(!(name in window.__exModules))throw new Error("Missing module: "+name);return window.__exModules[name]};
(()=>{var S=Object.create;var u=Object.defineProperty;var w=Object.getOwnPropertyDescriptor;var b=Object.getOwnPropertyNames;var E=Object.getPrototypeOf,C=Object.prototype.hasOwnProperty;var a=(e=>typeof require<"u"?require:typeof Proxy<"u"?new Proxy(e,{get:(t,r)=>(typeof require<"u"?require:t)[r]}):e)(function(e){if(typeof require<"u")return require.apply(this,arguments);throw Error('Dynamic require of "'+e+'" is not supported')});var R=(e,t,r,o)=>{if(t&&typeof t=="object"||typeof t=="function")for(let d of b(t))!C.call(e,d)&&d!==r&&u(e,d,{get:()=>t[d],enumerable:!(o=w(t,d))||o.enumerable});return e};var M=(e,t,r)=>(r=e!=null?S(E(e)):{},R(t||!e||!e.__esModule?u(r,"default",{value:e,enumerable:!0}):r,e));var y=M(a("react")),g=a("react-dom/client"),f=a("react-router-dom"),v=a("radix-ui"),n=a("react/jsx-runtime");function T(){return(0,n.jsxs)("article",{className:"template-example",children:[(0,n.jsx)("h1",{children:"\uBAA9\uCC28\xB7\uC778\uC6A9\uC774 \uC788\uB294 \uAE34 \uBCF8\uBB38 \xB7 \uC608\uC2DC \uB370\uC774\uD130"}),(0,n.jsx)("div",{dangerouslySetInnerHTML:{__html:`






<div class="post">
  <header class="post-header">
    <h1 class="post-title">\uC608\uC2DC \uC5F0\uAD6C\uC640 \uD504\uB85C\uC81D\uD2B8 \uC0AC\uB840</h1>
    <p class="post-meta">
      Created on September 26, 2026
      
      
      
      
    </p>
    <p class="post-tags">
      
        <i class="fa-solid fa-calendar fa-sm"></i> 2026
      
      

      
    </p>
  </header>

  <article class="post-content">
    
    <div id="markdown-content">
      <h2 id="problem">\uBB38\uC81C\uC640 \uBAA9\uD45C</h2><p>\uC0AC\uC6A9\uC790\uAC00 \uC790\uB8CC\uC758 \uCD9C\uCC98\uC640 \uCC98\uB9AC \uACB0\uACFC\uB97C \uD55C \uD654\uBA74\uC5D0\uC11C \uD655\uC778\uD560 \uC218 \uC788\uB3C4\uB85D \uAD6C\uC131\uD55C \uC608\uC2DC \uC0AC\uB840\uC785\uB2C8\uB2E4.</p><h2 id="approach">\uC811\uADFC\uACFC \uAC1C\uC778 \uAE30\uC5EC</h2><p>\uC785\uB825 \uB370\uC774\uD130\uB97C \uC815\uB9AC\uD558\uACE0 \uAC80\uC0C9\xB7\uAC80\uD1A0 \uD654\uBA74\uC744 \uAD6C\uD604\uD588\uC2B5\uB2C8\uB2E4. \uC2E4\uC81C \uACBD\uB825\uC774\uB098 \uC131\uACFC\uB97C \uC8FC\uC7A5\uD558\uB294 \uB0B4\uC6A9\uC774 \uC544\uB2D9\uB2C8\uB2E4.</p><h2 id="result">\uACB0\uACFC \xB7 \uC608\uC2DC \uC218\uCE58</h2><table><thead><tr><th>\uC870\uAC74</th><th>\uCC98\uB9AC \uC2DC\uAC04</th></tr></thead><tbody><tr><td>\uAE30\uC900</td><td>120 ms</td></tr><tr><td>\uBE44\uAD50</td><td>85 ms</td></tr></tbody></table><h2 id="references">\uAD00\uB828 \uC790\uB8CC</h2><p>\uC608\uC2DC \uBB38\uD5CC A \xB7 \uC2E4\uD5D8 \uC124\uACC4\uC640 \uD3C9\uAC00 \uBC29\uBC95</p>
    </div>
  </article>

  

  

  

  
</div>
`}})]})}function i(e,t=""){document.documentElement.dataset.previewStatus=e,document.documentElement.dataset.previewReason=t;let r="";if(e==="ready"){let o=document.getElementById("demo"),d=o.cloneNode(!0),l=[o,...o.querySelectorAll("*")],m=[d,...d.querySelectorAll("*")];for(let s=0;s<l.length;s++){let h=getComputedStyle(l[s]);if(l[s].style?.length)for(let c of[...l[s].style])c.startsWith("--")||m[s].style.setProperty(c,h.getPropertyValue(c));h.opacity==="0"&&(m[s].style.opacity="1")}r=d.outerHTML}parent.postMessage({type:"expresso-all-preview",id:"al-folio-core-article",status:e,reason:t,html:r},"*")}var p=class extends y.default.Component{state={error:null};static getDerivedStateFromError(t){return{error:String(t)}}componentDidCatch(t,r){i("error",String(t)+" "+r.componentStack)}render(){return this.state.error?(0,n.jsx)("pre",{role:"alert",children:this.state.error}):this.props.children}};window.addEventListener("error",e=>i("error",e.message));window.addEventListener("unhandledrejection",e=>i("error",String(e.reason)));(0,g.createRoot)(document.getElementById("demo")).render((0,n.jsx)(p,{children:(0,n.jsx)(f.MemoryRouter,{children:(0,n.jsx)(v.Tooltip.Provider,{children:(0,n.jsx)(T,{})})})}));setTimeout(()=>{if(document.documentElement.dataset.previewStatus==="error")return;let t=[...document.getElementById("demo").querySelectorAll("*")].some(r=>{let o=r.getBoundingClientRect();return o.width>2&&o.height>2&&(r.textContent.trim()||r.matches("input,textarea,select,button,svg,canvas,img,video,[data-slot=skeleton]"))});i(t?"ready":"empty",t?"":"\uC6D0\uBCF8 \uD45C\uC2DC \uB0B4\uC6A9 \uC5C6\uC74C")},3e3);})();
