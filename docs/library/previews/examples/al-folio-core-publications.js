var require=function(name){if(name.startsWith("@radix-ui/react-")&&window.__exModules["radix-ui"]){const key=name.slice(16).split("-").map(s=>s[0].toUpperCase()+s.slice(1)).join("");if(window.__exModules["radix-ui"][key])return window.__exModules["radix-ui"][key];}if(!(name in window.__exModules))throw new Error("Missing module: "+name);return window.__exModules[name]};
(()=>{var f=Object.create;var v=Object.defineProperty;var S=Object.getOwnPropertyDescriptor;var w=Object.getOwnPropertyNames;var E=Object.getPrototypeOf,k=Object.prototype.hasOwnProperty;var d=(e=>typeof require<"u"?require:typeof Proxy<"u"?new Proxy(e,{get:(t,n)=>(typeof require<"u"?require:t)[n]}):e)(function(e){if(typeof require<"u")return require.apply(this,arguments);throw Error('Dynamic require of "'+e+'" is not supported')});var T=(e,t,n,o)=>{if(t&&typeof t=="object"||typeof t=="function")for(let s of w(t))!k.call(e,s)&&s!==n&&v(e,s,{get:()=>t[s],enumerable:!(o=S(t,s))||o.enumerable});return e};var A=(e,t,n)=>(n=e!=null?f(E(e)):{},T(t||!e||!e.__esModule?v(n,"default",{value:e,enumerable:!0}):n,e));var h=A(d("react")),y=d("react-dom/client"),b=d("react-router-dom"),g=d("radix-ui"),r=d("react/jsx-runtime");function B(){return(0,r.jsxs)("article",{className:"template-example",children:[(0,r.jsx)("h1",{children:"\uC800\uC790\xB7\uBC1C\uD45C\uCC98\xB7\uCD08\uB85D\xB7\uB17C\uBB38 \uB9C1\uD06C \xB7 \uC608\uC2DC \uB370\uC774\uD130"}),(0,r.jsx)("div",{dangerouslySetInnerHTML:{__html:`<div class="row">
  

  <!-- Entry bib key -->
  <div id="demo-study" class="col-sm-10">
    <!-- Title -->
    <div class="title">\uC608\uC2DC \uC5F0\uAD6C: \uAD6C\uC870\uD654\uB41C \uB370\uC774\uD130 \uD45C\uD604</div>
    <!-- Author -->
    <div class="author">
      

      
      Demo
            Author
      
    </div>

    <!-- Journal/Book title and date -->
    
    
    
      
    
    
    
    
    
      
    
    
    
    
    
    
    <div class="periodical">
      <em>\uC608\uC2DC \uD559\uC220\uB300\uD68C</em>,  2026
    </div>
    <div class="periodical">
      
    </div>

    <!-- Links/Buttons -->
    <div class="links">
      
      
        <a class="abstract btn btn-sm z-depth-0" role="button">Abs</a>
      
      
        <a href="https://doi.org/10.example/demo" class="btn btn-sm z-depth-0" role="button">DOI</a>
      
      
      
      
      
        
          <a href="/assets/html/#" class="btn btn-sm z-depth-0" role="button">HTML</a>
        
      
      
      
      
      
      
      
      
      
    </div>
    

    

    
      <!-- Hidden abstract block -->
      <div class="abstract hidden">
        <p>\uC608\uC2DC \uC5F0\uAD6C\uC758 \uBAA9\uC801\xB7\uC811\uADFC\xB7\uACB0\uACFC\uB97C \uC124\uBA85\uD558\uB294 \uCD08\uB85D\uC785\uB2C8\uB2E4.</p>
      </div>
    

    

    
  </div>
</div>
`}})]})}function a(e,t=""){document.documentElement.dataset.previewStatus=e,document.documentElement.dataset.previewReason=t;let n="";if(e==="ready"){let o=document.getElementById("demo"),s=o.cloneNode(!0),l=[o,...o.querySelectorAll("*")],p=[s,...s.querySelectorAll("*")];for(let i=0;i<l.length;i++){let u=getComputedStyle(l[i]);if(l[i].style?.length)for(let c of[...l[i].style])c.startsWith("--")||p[i].style.setProperty(c,u.getPropertyValue(c));u.opacity==="0"&&(p[i].style.opacity="1")}n=s.outerHTML}parent.postMessage({type:"expresso-all-preview",id:"al-folio-core-publications",status:e,reason:t,html:n},"*")}var m=class extends h.default.Component{state={error:null};static getDerivedStateFromError(t){return{error:String(t)}}componentDidCatch(t,n){a("error",String(t)+" "+n.componentStack)}render(){return this.state.error?(0,r.jsx)("pre",{role:"alert",children:this.state.error}):this.props.children}};window.addEventListener("error",e=>a("error",e.message));window.addEventListener("unhandledrejection",e=>a("error",String(e.reason)));(0,y.createRoot)(document.getElementById("demo")).render((0,r.jsx)(m,{children:(0,r.jsx)(b.MemoryRouter,{children:(0,r.jsx)(g.Tooltip.Provider,{children:(0,r.jsx)(B,{})})})}));setTimeout(()=>{if(document.documentElement.dataset.previewStatus==="error")return;let t=[...document.getElementById("demo").querySelectorAll("*")].some(n=>{let o=n.getBoundingClientRect();return o.width>2&&o.height>2&&(n.textContent.trim()||n.matches("input,textarea,select,button,svg,canvas,img,video,[data-slot=skeleton]"))});a(t?"ready":"empty",t?"":"\uC6D0\uBCF8 \uD45C\uC2DC \uB0B4\uC6A9 \uC5C6\uC74C")},3e3);})();
