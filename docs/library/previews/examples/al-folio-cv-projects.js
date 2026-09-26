var require=function(name){if(name.startsWith("@radix-ui/react-")&&window.__exModules["radix-ui"]){const key=name.slice(16).split("-").map(s=>s[0].toUpperCase()+s.slice(1)).join("");if(window.__exModules["radix-ui"][key])return window.__exModules["radix-ui"][key];}if(!(name in window.__exModules))throw new Error("Missing module: "+name);return window.__exModules[name]};
(()=>{var b=Object.create;var g=Object.defineProperty;var w=Object.getOwnPropertyDescriptor;var x=Object.getOwnPropertyNames;var S=Object.getPrototypeOf,E=Object.prototype.hasOwnProperty;var a=(n=>typeof require<"u"?require:typeof Proxy<"u"?new Proxy(n,{get:(t,e)=>(typeof require<"u"?require:t)[e]}):n)(function(n){if(typeof require<"u")return require.apply(this,arguments);throw Error('Dynamic require of "'+n+'" is not supported')});var k=(n,t,e,o)=>{if(t&&typeof t=="object"||typeof t=="function")for(let r of x(t))!E.call(n,r)&&r!==e&&g(n,r,{get:()=>t[r],enumerable:!(o=w(t,r))||o.enumerable});return n};var R=(n,t,e)=>(e=n!=null?b(S(n)):{},k(t||!n||!n.__esModule?g(e,"default",{value:n,enumerable:!0}):e,n));var h=R(a("react")),v=a("react-dom/client"),y=a("react-router-dom"),f=a("radix-ui"),l=a("react/jsx-runtime");function B(){return(0,l.jsxs)("article",{className:"template-example",children:[(0,l.jsx)("h1",{children:"\uC774\uBBF8\uC9C0 \uC5C6\uB294 \uD504\uB85C\uC81D\uD2B8 \uBAA9\uB85D \xB7 \uC608\uC2DC \uB370\uC774\uD130"}),(0,l.jsx)("div",{dangerouslySetInnerHTML:{__html:`

<ul class="card-text font-weight-light list-group list-group-flush">
  
    <li class="list-group-item">
      
      
      
      
      
      
      
      

      
        
        
        
        
      

      

      
        <div class="row">
          <div class="col-xs-2 col-sm-2 col-md-2 text-center date-column">
            <table class="table-cv">
              <tbody>
                <tr>
                  <td>
                    <span class="badge font-weight-bold danger-color-dark text-uppercase align-middle" style="min-width: 75px">2024 - 2026</span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <div class="col-xs-10 col-sm-10 col-md-10 mt-2 mt-md-0">
        
          <h6 class="title font-weight-bold">
            <a href="#" target="_blank">\uC608\uC2DC \uD56D\uBAA9</a>
          </h6>
        

        
          <p>\uC785\uB825\uC758 \uAD6C\uC870\uC640 \uCD9C\uCC98\uB97C \uD568\uAED8 \uD45C\uD604\uD558\uB294 \uC608\uC2DC \uC124\uBA85\uC785\uB2C8\uB2E4.</p>
        

        
          <ul class="items">
            
              <li>
                <span class="item">\uB370\uC774\uD130 \uCC98\uB9AC\uC640 \uD654\uBA74 \uAD6C\uD604</span>
              </li>
            
              <li>
                <span class="item">\uD14C\uC2A4\uD2B8 \uBC0F \uACB0\uACFC \uBB38\uC11C\uD654</span>
              </li>
            
          </ul>
        
      </div>
        </div>
      
    </li>
  
    <li class="list-group-item">
      
      
      
      
      
      
      
      

      
        
        
        
        
      

      

      
        <div class="row">
          <div class="col-xs-2 col-sm-2 col-md-2 text-center date-column">
            <table class="table-cv">
              <tbody>
                <tr>
                  <td>
                    <span class="badge font-weight-bold danger-color-dark text-uppercase align-middle" style="min-width: 75px">2022 - 2023</span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <div class="col-xs-10 col-sm-10 col-md-10 mt-2 mt-md-0">
        
          <h6 class="title font-weight-bold">
            <a href="#" target="_blank">\uC608\uC2DC \uD56D\uBAA9 B</a>
          </h6>
        

        
          <p>\uC785\uB825\uC758 \uAD6C\uC870\uC640 \uCD9C\uCC98\uB97C \uD568\uAED8 \uD45C\uD604\uD558\uB294 \uC608\uC2DC \uC124\uBA85\uC785\uB2C8\uB2E4.</p>
        

        
          <ul class="items">
            
              <li>
                <span class="item">\uB370\uC774\uD130 \uCC98\uB9AC\uC640 \uD654\uBA74 \uAD6C\uD604</span>
              </li>
            
              <li>
                <span class="item">\uD14C\uC2A4\uD2B8 \uBC0F \uACB0\uACFC \uBB38\uC11C\uD654</span>
              </li>
            
          </ul>
        
      </div>
        </div>
      
    </li>
  
</ul>
`}})]})}function d(n,t=""){document.documentElement.dataset.previewStatus=n,document.documentElement.dataset.previewReason=t;let e="";if(n==="ready"){let o=document.getElementById("demo"),r=o.cloneNode(!0),i=[o,...o.querySelectorAll("*")],p=[r,...r.querySelectorAll("*")];for(let s=0;s<i.length;s++){let u=getComputedStyle(i[s]);if(i[s].style?.length)for(let c of[...i[s].style])c.startsWith("--")||p[s].style.setProperty(c,u.getPropertyValue(c));u.opacity==="0"&&(p[s].style.opacity="1")}e=r.outerHTML}parent.postMessage({type:"expresso-all-preview",id:"al-folio-cv-projects",status:n,reason:t,html:e},"*")}var m=class extends h.default.Component{state={error:null};static getDerivedStateFromError(t){return{error:String(t)}}componentDidCatch(t,e){d("error",String(t)+" "+e.componentStack)}render(){return this.state.error?(0,l.jsx)("pre",{role:"alert",children:this.state.error}):this.props.children}};window.addEventListener("error",n=>d("error",n.message));window.addEventListener("unhandledrejection",n=>d("error",String(n.reason)));(0,v.createRoot)(document.getElementById("demo")).render((0,l.jsx)(m,{children:(0,l.jsx)(y.MemoryRouter,{children:(0,l.jsx)(f.Tooltip.Provider,{children:(0,l.jsx)(B,{})})})}));setTimeout(()=>{if(document.documentElement.dataset.previewStatus==="error")return;let t=[...document.getElementById("demo").querySelectorAll("*")].some(e=>{let o=e.getBoundingClientRect();return o.width>2&&o.height>2&&(e.textContent.trim()||e.matches("input,textarea,select,button,svg,canvas,img,video,[data-slot=skeleton]"))});d(t?"ready":"empty",t?"":"\uC6D0\uBCF8 \uD45C\uC2DC \uB0B4\uC6A9 \uC5C6\uC74C")},3e3);})();
