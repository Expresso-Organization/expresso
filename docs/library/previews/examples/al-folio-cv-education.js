var require=function(name){if(name.startsWith("@radix-ui/react-")&&window.__exModules["radix-ui"]){const key=name.slice(16).split("-").map(s=>s[0].toUpperCase()+s.slice(1)).join("");if(window.__exModules["radix-ui"][key])return window.__exModules["radix-ui"][key];}if(!(name in window.__exModules))throw new Error("Missing module: "+name);return window.__exModules[name]};
(()=>{var b=Object.create;var h=Object.defineProperty;var w=Object.getOwnPropertyDescriptor;var x=Object.getOwnPropertyNames;var S=Object.getPrototypeOf,E=Object.prototype.hasOwnProperty;var i=(n=>typeof require<"u"?require:typeof Proxy<"u"?new Proxy(n,{get:(e,t)=>(typeof require<"u"?require:e)[t]}):n)(function(n){if(typeof require<"u")return require.apply(this,arguments);throw Error('Dynamic require of "'+n+'" is not supported')});var R=(n,e,t,o)=>{if(e&&typeof e=="object"||typeof e=="function")for(let s of x(e))!E.call(n,s)&&s!==t&&h(n,s,{get:()=>e[s],enumerable:!(o=w(e,s))||o.enumerable});return n};var C=(n,e,t)=>(t=n!=null?b(S(n)):{},R(e||!n||!n.__esModule?h(t,"default",{value:n,enumerable:!0}):t,n));var g=C(i("react")),y=i("react-dom/client"),f=i("react-router-dom"),v=i("radix-ui"),l=i("react/jsx-runtime");function M(){return(0,l.jsxs)("article",{className:"template-example",children:[(0,l.jsx)("h1",{children:"\uD559\uC704\xB7\uD559\uAD50\xB7\uAD50\uACFC\xB7\uD65C\uB3D9 \uBAA9\uB85D \xB7 \uC608\uC2DC \uB370\uC774\uD130"}),(0,l.jsx)("div",{dangerouslySetInnerHTML:{__html:`

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
          

          
            <h6 class="title font-weight-bold ml-1 ml-md-4">
              <a href="#">
            \uC11D\uC0AC
          </a>
            </h6>
          

          
            <h6 class="ml-1 ml-md-4" style="font-size: 0.95rem">\uC608\uC2DC \uB300\uD559\uAD50</h6>
          

          
            <h6 class="ml-1 ml-md-4" style="font-size: 0.95rem; font-style: italic">\uCEF4\uD4E8\uD130\uACF5\uD559</h6>
          

          
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
          

          
            <h6 class="title font-weight-bold ml-1 ml-md-4">
              <a href="#">
            \uC11D\uC0AC
          </a>
            </h6>
          

          
            <h6 class="ml-1 ml-md-4" style="font-size: 0.95rem">\uC608\uC2DC \uB300\uD559\uAD50</h6>
          

          
            <h6 class="ml-1 ml-md-4" style="font-size: 0.95rem; font-style: italic">\uCEF4\uD4E8\uD130\uACF5\uD559</h6>
          

          
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
`}})]})}function d(n,e=""){document.documentElement.dataset.previewStatus=n,document.documentElement.dataset.previewReason=e;let t="";if(n==="ready"){let o=document.getElementById("demo"),s=o.cloneNode(!0),a=[o,...o.querySelectorAll("*")],p=[s,...s.querySelectorAll("*")];for(let r=0;r<a.length;r++){let u=getComputedStyle(a[r]);if(a[r].style?.length)for(let c of[...a[r].style])c.startsWith("--")||p[r].style.setProperty(c,u.getPropertyValue(c));u.opacity==="0"&&(p[r].style.opacity="1")}t=s.outerHTML}parent.postMessage({type:"expresso-all-preview",id:"al-folio-cv-education",status:n,reason:e,html:t},"*")}var m=class extends g.default.Component{state={error:null};static getDerivedStateFromError(e){return{error:String(e)}}componentDidCatch(e,t){d("error",String(e)+" "+t.componentStack)}render(){return this.state.error?(0,l.jsx)("pre",{role:"alert",children:this.state.error}):this.props.children}};window.addEventListener("error",n=>d("error",n.message));window.addEventListener("unhandledrejection",n=>d("error",String(n.reason)));(0,y.createRoot)(document.getElementById("demo")).render((0,l.jsx)(m,{children:(0,l.jsx)(f.MemoryRouter,{children:(0,l.jsx)(v.Tooltip.Provider,{children:(0,l.jsx)(M,{})})})}));setTimeout(()=>{if(document.documentElement.dataset.previewStatus==="error")return;let e=[...document.getElementById("demo").querySelectorAll("*")].some(t=>{let o=t.getBoundingClientRect();return o.width>2&&o.height>2&&(t.textContent.trim()||t.matches("input,textarea,select,button,svg,canvas,img,video,[data-slot=skeleton]"))});d(e?"ready":"empty",e?"":"\uC6D0\uBCF8 \uD45C\uC2DC \uB0B4\uC6A9 \uC5C6\uC74C")},3e3);})();
