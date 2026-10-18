var require=function(name){if(name.startsWith("@radix-ui/react-")&&window.__exModules["radix-ui"]){const key=name.slice(16).split("-").map(s=>s[0].toUpperCase()+s.slice(1)).join("");if(window.__exModules["radix-ui"][key])return window.__exModules["radix-ui"][key];}if(!(name in window.__exModules))throw new Error("Missing module: "+name);return window.__exModules[name]};
(()=>{var b=Object.create;var h=Object.defineProperty;var w=Object.getOwnPropertyDescriptor;var x=Object.getOwnPropertyNames;var S=Object.getPrototypeOf,E=Object.prototype.hasOwnProperty;var d=(e=>typeof require<"u"?require:typeof Proxy<"u"?new Proxy(e,{get:(t,n)=>(typeof require<"u"?require:t)[n]}):e)(function(e){if(typeof require<"u")return require.apply(this,arguments);throw Error('Dynamic require of "'+e+'" is not supported')});var R=(e,t,n,l)=>{if(t&&typeof t=="object"||typeof t=="function")for(let r of x(t))!E.call(e,r)&&r!==n&&h(e,r,{get:()=>t[r],enumerable:!(l=w(t,r))||l.enumerable});return e};var B=(e,t,n)=>(n=e!=null?b(S(e)):{},R(t||!e||!e.__esModule?h(n,"default",{value:e,enumerable:!0}):n,e));var g=B(d("react")),y=d("react-dom/client"),v=d("react-router-dom"),f=d("radix-ui"),o=d("react/jsx-runtime");function C(){return(0,o.jsxs)("article",{className:"template-example",children:[(0,o.jsx)("h1",{children:"\uD14D\uC2A4\uD2B8 \uC911\uC2EC \uB17C\uBB38 \uBAA9\uB85D \xB7 \uC608\uC2DC \uB370\uC774\uD130"}),(0,o.jsx)("div",{dangerouslySetInnerHTML:{__html:`

<ul class="card-text font-weight-light list-group list-group-flush">
  
    <li class="list-group-item">
      <div class="row">
        
        
        

        
          <div class="col-xs-2 col-sm-2 col-md-2 text-center">
            <table class="table-cv">
              <tbody>
                <tr>
                  <td>
                    <span class="badge font-weight-bold danger-color-dark text-uppercase align-middle" style="min-width: 75px">2026</span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <div class="col-xs-10 col-sm-10 col-md-10 mt-2 mt-md-0">
            
              <h6 class="title font-weight-bold ml-1 ml-md-4">
                <a href="#">\uC608\uC2DC \uC5F0\uAD6C: \uAD6C\uC870\uD654\uB41C \uB370\uC774\uD130 \uD45C\uD604</a>
              </h6>
            

            
              <h6 class="ml-1 ml-md-4" style="font-size: 0.95rem">
                <em>\uC608\uC2DC \uD559\uC220\uB300\uD68C</em>
              </h6>
            

            
              <p class="ml-1 ml-md-4">\uC785\uB825\uC758 \uAD6C\uC870\uC640 \uCD9C\uCC98\uB97C \uD568\uAED8 \uD45C\uD604\uD558\uB294 \uC608\uC2DC \uC124\uBA85\uC785\uB2C8\uB2E4.</p>
            
          </div>
        
      </div>
    </li>
  
    <li class="list-group-item">
      <div class="row">
        
        
        

        
          <div class="col-xs-2 col-sm-2 col-md-2 text-center">
            <table class="table-cv">
              <tbody>
                <tr>
                  <td>
                    <span class="badge font-weight-bold danger-color-dark text-uppercase align-middle" style="min-width: 75px">2026</span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <div class="col-xs-10 col-sm-10 col-md-10 mt-2 mt-md-0">
            
              <h6 class="title font-weight-bold ml-1 ml-md-4">
                <a href="#">\uC608\uC2DC \uC5F0\uAD6C B</a>
              </h6>
            

            
              <h6 class="ml-1 ml-md-4" style="font-size: 0.95rem">
                <em>\uC608\uC2DC \uD559\uC220\uB300\uD68C</em>
              </h6>
            

            
              <p class="ml-1 ml-md-4">\uC785\uB825\uC758 \uAD6C\uC870\uC640 \uCD9C\uCC98\uB97C \uD568\uAED8 \uD45C\uD604\uD558\uB294 \uC608\uC2DC \uC124\uBA85\uC785\uB2C8\uB2E4.</p>
            
          </div>
        
      </div>
    </li>
  
</ul>
`}})]})}function a(e,t=""){document.documentElement.dataset.previewStatus=e,document.documentElement.dataset.previewReason=t;let n="";if(e==="ready"){let l=document.getElementById("demo"),r=l.cloneNode(!0),i=[l,...l.querySelectorAll("*")],p=[r,...r.querySelectorAll("*")];for(let s=0;s<i.length;s++){let u=getComputedStyle(i[s]);if(i[s].style?.length)for(let m of[...i[s].style])m.startsWith("--")||p[s].style.setProperty(m,u.getPropertyValue(m));u.opacity==="0"&&(p[s].style.opacity="1")}n=r.outerHTML}parent.postMessage({type:"expresso-all-preview",id:"al-folio-cv-publications",status:e,reason:t,html:n},"*")}var c=class extends g.default.Component{state={error:null};static getDerivedStateFromError(t){return{error:String(t)}}componentDidCatch(t,n){a("error",String(t)+" "+n.componentStack)}render(){return this.state.error?(0,o.jsx)("pre",{role:"alert",children:this.state.error}):this.props.children}};window.addEventListener("error",e=>a("error",e.message));window.addEventListener("unhandledrejection",e=>a("error",String(e.reason)));(0,y.createRoot)(document.getElementById("demo")).render((0,o.jsx)(c,{children:(0,o.jsx)(v.MemoryRouter,{children:(0,o.jsx)(f.Tooltip.Provider,{children:(0,o.jsx)(C,{})})})}));setTimeout(()=>{if(document.documentElement.dataset.previewStatus==="error")return;let t=[...document.getElementById("demo").querySelectorAll("*")].some(n=>{let l=n.getBoundingClientRect();return l.width>2&&l.height>2&&(n.textContent.trim()||n.matches("input,textarea,select,button,svg,canvas,img,video,[data-slot=skeleton]"))});a(t?"ready":"empty",t?"":"\uC6D0\uBCF8 \uD45C\uC2DC \uB0B4\uC6A9 \uC5C6\uC74C")},3e3);})();
