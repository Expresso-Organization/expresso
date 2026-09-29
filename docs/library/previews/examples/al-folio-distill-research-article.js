var require=function(name){if(name.startsWith("@radix-ui/react-")&&window.__exModules["radix-ui"]){const key=name.slice(16).split("-").map(s=>s[0].toUpperCase()+s.slice(1)).join("");if(window.__exModules["radix-ui"][key])return window.__exModules["radix-ui"][key];}if(!(name in window.__exModules))throw new Error("Missing module: "+name);return window.__exModules[name]};
(()=>{var b=Object.create;var u=Object.defineProperty;var S=Object.getOwnPropertyDescriptor;var w=Object.getOwnPropertyNames;var E=Object.getPrototypeOf,x=Object.prototype.hasOwnProperty;var a=(t=>typeof require<"u"?require:typeof Proxy<"u"?new Proxy(t,{get:(e,n)=>(typeof require<"u"?require:e)[n]}):t)(function(t){if(typeof require<"u")return require.apply(this,arguments);throw Error('Dynamic require of "'+t+'" is not supported')});var C=(t,e,n,o)=>{if(e&&typeof e=="object"||typeof e=="function")for(let i of w(e))!x.call(t,i)&&i!==n&&u(t,i,{get:()=>e[i],enumerable:!(o=S(e,i))||o.enumerable});return t};var R=(t,e,n)=>(n=t!=null?b(E(t)):{},C(e||!t||!t.__esModule?u(n,"default",{value:t,enumerable:!0}):n,t));var y=R(a("react")),v=a("react-dom/client"),f=a("react-router-dom"),g=a("radix-ui"),r=a("react/jsx-runtime");function M(){return(0,r.jsxs)("article",{className:"template-example",children:[(0,r.jsx)("h1",{children:"\uC5F0\uAD6C \uC0C1\uC138\xB7\uBAA9\uCC28\xB7\uCC38\uACE0\uBB38\uD5CC \uAD6C\uC131 \xB7 \uC608\uC2DC \uB370\uC774\uD130"}),(0,r.jsx)("div",{dangerouslySetInnerHTML:{__html:`

  

  <d-front-matter>
    
  </d-front-matter>

  
    <!-- Header -->
    

    <!-- Content -->
    <div class="post distill">
      <d-title>
        <h1>\uC608\uC2DC \uC5F0\uAD6C\uC640 \uD504\uB85C\uC81D\uD2B8 \uC0AC\uB840</h1>
        <p>\uC81C\uBAA9\xB7\uBAA9\uCC28\xB7\uBCF8\uBB38\xB7\uADFC\uAC70\uC758 \uBC30\uCE58\uB97C \uD655\uC778\uD558\uB294 \uB370\uBAA8\uC785\uB2C8\uB2E4.</p>
      </d-title>
      
        <d-byline></d-byline>
      

      <d-article>
        
          <d-contents>
            <nav class="l-text figcaption">
              <h3>Contents</h3>
              
                <div>
                  <a href="#problem">problem</a>
                </div>
                
              
                <div>
                  <a href="#approach">approach</a>
                </div>
                
              
                <div>
                  <a href="#result">result</a>
                </div>
                
              
            </nav>
          </d-contents>

        

        <h2 id="problem">\uBB38\uC81C\uC640 \uBAA9\uD45C</h2><p>\uC0AC\uC6A9\uC790\uAC00 \uC790\uB8CC\uC758 \uCD9C\uCC98\uC640 \uCC98\uB9AC \uACB0\uACFC\uB97C \uD55C \uD654\uBA74\uC5D0\uC11C \uD655\uC778\uD560 \uC218 \uC788\uB3C4\uB85D \uAD6C\uC131\uD55C \uC608\uC2DC \uC0AC\uB840\uC785\uB2C8\uB2E4.</p><h2 id="approach">\uC811\uADFC\uACFC \uAC1C\uC778 \uAE30\uC5EC</h2><p>\uC785\uB825 \uB370\uC774\uD130\uB97C \uC815\uB9AC\uD558\uACE0 \uAC80\uC0C9\xB7\uAC80\uD1A0 \uD654\uBA74\uC744 \uAD6C\uD604\uD588\uC2B5\uB2C8\uB2E4. \uC2E4\uC81C \uACBD\uB825\uC774\uB098 \uC131\uACFC\uB97C \uC8FC\uC7A5\uD558\uB294 \uB0B4\uC6A9\uC774 \uC544\uB2D9\uB2C8\uB2E4.</p><h2 id="result">\uACB0\uACFC \xB7 \uC608\uC2DC \uC218\uCE58</h2><table><thead><tr><th>\uC870\uAC74</th><th>\uCC98\uB9AC \uC2DC\uAC04</th></tr></thead><tbody><tr><td>\uAE30\uC900</td><td>120 ms</td></tr><tr><td>\uBE44\uAD50</td><td>85 ms</td></tr></tbody></table><h2 id="references">\uAD00\uB828 \uC790\uB8CC</h2><p>\uC608\uC2DC \uBB38\uD5CC A \xB7 \uC2E4\uD5D8 \uC124\uACC4\uC640 \uD3C9\uAC00 \uBC29\uBC95</p>
      </d-article>

      <d-appendix>
        <d-footnote-list></d-footnote-list>
        <d-citation-list></d-citation-list>
      </d-appendix>

      <d-bibliography src="/assets/bibliography/"></d-bibliography>

      <d-article>
        
        <br>
        <br>
        
      </d-article>
    </div>

    <!-- Footer -->
    

    <!-- JavaScripts -->
    
  

`}})]})}function s(t,e=""){document.documentElement.dataset.previewStatus=t,document.documentElement.dataset.previewReason=e;let n="";if(t==="ready"){let o=document.getElementById("demo"),i=o.cloneNode(!0),l=[o,...o.querySelectorAll("*")],m=[i,...i.querySelectorAll("*")];for(let d=0;d<l.length;d++){let h=getComputedStyle(l[d]);if(l[d].style?.length)for(let c of[...l[d].style])c.startsWith("--")||m[d].style.setProperty(c,h.getPropertyValue(c));h.opacity==="0"&&(m[d].style.opacity="1")}n=i.outerHTML}parent.postMessage({type:"expresso-all-preview",id:"al-folio-distill-research-article",status:t,reason:e,html:n},"*")}var p=class extends y.default.Component{state={error:null};static getDerivedStateFromError(e){return{error:String(e)}}componentDidCatch(e,n){s("error",String(e)+" "+n.componentStack)}render(){return this.state.error?(0,r.jsx)("pre",{role:"alert",children:this.state.error}):this.props.children}};window.addEventListener("error",t=>s("error",t.message));window.addEventListener("unhandledrejection",t=>s("error",String(t.reason)));(0,v.createRoot)(document.getElementById("demo")).render((0,r.jsx)(p,{children:(0,r.jsx)(f.MemoryRouter,{children:(0,r.jsx)(g.Tooltip.Provider,{children:(0,r.jsx)(M,{})})})}));setTimeout(()=>{if(document.documentElement.dataset.previewStatus==="error")return;let e=[...document.getElementById("demo").querySelectorAll("*")].some(n=>{let o=n.getBoundingClientRect();return o.width>2&&o.height>2&&(n.textContent.trim()||n.matches("input,textarea,select,button,svg,canvas,img,video,[data-slot=skeleton]"))});s(e?"ready":"empty",e?"":"\uC6D0\uBCF8 \uD45C\uC2DC \uB0B4\uC6A9 \uC5C6\uC74C")},3e3);})();
