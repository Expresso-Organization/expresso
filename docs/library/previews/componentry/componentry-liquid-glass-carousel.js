var require=function(name){if(!(name in window.__exModules))throw new Error("실행 모듈 누락: "+name);return window.__exModules[name]};
(()=>{var Dp=Object.create;var vh=Object.defineProperty;var Lp=Object.getOwnPropertyDescriptor;var Np=Object.getOwnPropertyNames;var Fp=Object.getPrototypeOf,Up=Object.prototype.hasOwnProperty;var Wn=(r=>typeof require<"u"?require:typeof Proxy<"u"?new Proxy(r,{get:(e,t)=>(typeof require<"u"?require:e)[t]}):r)(function(r){if(typeof require<"u")return require.apply(this,arguments);throw Error('Dynamic require of "'+r+'" is not supported')});var Op=(r,e,t,n)=>{if(e&&typeof e=="object"||typeof e=="function")for(let i of Np(e))!Up.call(r,i)&&i!==t&&vh(r,i,{get:()=>e[i],enumerable:!(n=Lp(e,i))||n.enumerable});return r};var yh=(r,e,t)=>(t=r!=null?Dp(Fp(r)):{},Op(e||!r||!r.__esModule?vh(t,"default",{value:r,enumerable:!0}):t,r));var Rp=yh(Wn("react")),Pp=Wn("react-dom/client");function hi(r){if(r===void 0)throw new ReferenceError("this hasn't been initialised - super() hasn't been called");return r}function Rh(r,e){r.prototype=Object.create(e.prototype),r.prototype.constructor=r,r.__proto__=e}var hn={autoSleep:120,force3D:"auto",nullTargetWarn:1,units:{lineHeight:""}},Wr={duration:.5,overwrite:!1,delay:0},yc,Vt,_t,Cn=1e8,ft=1/Cn,uc=Math.PI*2,Bp=uc/4,kp=0,Ph=Math.sqrt,zp=Math.cos,Vp=Math.sin,Ct=function(e){return typeof e=="string"},bt=function(e){return typeof e=="function"},fi=function(e){return typeof e=="number"},Wa=function(e){return typeof e>"u"},Yn=function(e){return typeof e=="object"},un=function(e){return e!==!1},bc=function(){return typeof window<"u"},Fa=function(e){return bt(e)||Ct(e)},Ih=typeof ArrayBuffer=="function"&&ArrayBuffer.isView||function(){},Wt=Array.isArray,Gp=/random\([^)]+\)/g,Hp=/,\s*/g,bh=/(?:-?\.?\d|\.)+/gi,Mc=/[-+=.]*\d+[.e\-+]*\d*[e\-+]*\d*/g,fr=/[-+=.]*\d+[.e-]*\d*[a-z%]*/g,ic=/[-+=.]*\d+\.?\d*(?:e-|e\+)?\d*/gi,Sc=/[+-]=-?[.\d]+/,Wp=/[^,'"\[\]\s]+/gi,Xp=/^[+\-=e\s\d]*\d+[.\d]*([a-z]*|%)\s*$/i,vt,Xn,hc,wc,xn={},ka={},Dh,Lh=function(e){return(ka=Xr(e,xn))&&Xt},Xa=function(e,t){return console.warn("Invalid property",e,"set to",t,"Missing plugin? gsap.registerPlugin()")},Xs=function(e,t){return!t&&console.warn(e)},Nh=function(e,t){return e&&(xn[e]=t)&&ka&&(ka[e]=t)||xn},qs=function(){return 0},qp={suppressEvents:!0,isStart:!0,kill:!1},Ua={suppressEvents:!0,kill:!1},Yp={suppressEvents:!0},Tc={},Li=[],dc={},Fh,ln={},rc={},Mh=30,Oa=[],Ac="",Ec=function(e){var t=e[0],n,i;if(Yn(t)||bt(t)||(e=[e]),!(n=(t._gsap||{}).harness)){for(i=Oa.length;i--&&!Oa[i].targetTest(t););n=Oa[i]}for(i=e.length;i--;)e[i]&&(e[i]._gsap||(e[i]._gsap=new Ic(e[i],n)))||e.splice(i,1);return e},Ni=function(e){return e._gsap||Ec(Rn(e))[0]._gsap},Cc=function(e,t,n){return(n=e[t])&&bt(n)?e[t]():Wa(n)&&e.getAttribute&&e.getAttribute(t)||n},jt=function(e,t){return(e=e.split(",")).forEach(t)||e},Mt=function(e){return Math.round(e*1e5)/1e5||0},xt=function(e){return Math.round(e*1e7)/1e7||0},pr=function(e,t){var n=t.charAt(0),i=parseFloat(t.substr(2));return e=parseFloat(e),n==="+"?e+i:n==="-"?e-i:n==="*"?e*i:e/i},Zp=function(e,t){for(var n=t.length,i=0;e.indexOf(t[i])<0&&++i<n;);return i<n},za=function(){var e=Li.length,t=Li.slice(0),n,i;for(dc={},Li.length=0,n=0;n<e;n++)i=t[n],i&&i._lazy&&(i.render(i._lazy[0],i._lazy[1],!0)._lazy=0)},Rc=function(e){return!!(e._initted||e._startAt||e.add)},Uh=function(e,t,n,i){Li.length&&!Vt&&za(),e.render(t,n,i||!!(Vt&&t<0&&Rc(e))),Li.length&&!Vt&&za()},Oh=function(e){var t=parseFloat(e);return(t||t===0)&&(e+"").match(Wp).length<2?t:Ct(e)?e.trim():e},Bh=function(e){return e},vn=function(e,t){for(var n in t)n in e||(e[n]=t[n]);return e},Jp=function(e){return function(t,n){for(var i in n)i in t||i==="duration"&&e||i==="ease"||(t[i]=n[i])}},Xr=function(e,t){for(var n in t)e[n]=t[n];return e},Sh=function r(e,t){for(var n in t)n!=="__proto__"&&n!=="constructor"&&n!=="prototype"&&(e[n]=Yn(t[n])?r(e[n]||(e[n]={}),t[n]):t[n]);return e},Va=function(e,t){var n={},i;for(i in e)i in t||(n[i]=e[i]);return n},Gs=function(e){var t=e.parent||vt,n=e.keyframes?Jp(Wt(e.keyframes)):vn;if(un(e.inherit))for(;t;)n(e,t.vars.defaults),t=t.parent||t._dp;return e},$p=function(e,t){for(var n=e.length,i=n===t.length;i&&n--&&e[n]===t[n];);return n<0},kh=function(e,t,n,i,s){n===void 0&&(n="_first"),i===void 0&&(i="_last");var a=e[i],o;if(s)for(o=t[s];a&&a[s]>o;)a=a._prev;return a?(t._next=a._next,a._next=t):(t._next=e[n],e[n]=t),t._next?t._next._prev=t:e[i]=t,t._prev=a,t.parent=t._dp=e,t},qa=function(e,t,n,i){n===void 0&&(n="_first"),i===void 0&&(i="_last");var s=t._prev,a=t._next;s?s._next=a:e[n]===t&&(e[n]=a),a?a._prev=s:e[i]===t&&(e[i]=s),t._next=t._prev=t.parent=null},Fi=function(e,t){e.parent&&(!t||e.parent.autoRemoveChildren)&&e.parent.remove&&e.parent.remove(e),e._act=0},ur=function(e,t){if(e&&(!t||t._end>e._dur||t._start<0))for(var n=e;n;)n._dirty=1,n=n.parent;return e},Kp=function(e){for(var t=e.parent;t&&t.parent;)t._dirty=1,t.totalDuration(),t=t.parent;return e},fc=function(e,t,n,i){return e._startAt&&(Vt?e._startAt.revert(Ua):e.vars.immediateRender&&!e.vars.autoRevert||e._startAt.render(t,!0,i))},Qp=function r(e){return!e||e._ts&&r(e.parent)},wh=function(e){return e._repeat?qr(e._tTime,e=e.duration()+e._rDelay)*e:0},qr=function(e,t){var n=Math.floor(e=xt(e/t));return e&&n===e?n-1:n},Ga=function(e,t){return(e-t._start)*t._ts+(t._ts>=0?0:t._dirty?t.totalDuration():t._tDur)},Ya=function(e){return e._end=xt(e._start+(e._tDur/Math.abs(e._ts||e._rts||ft)||0))},Za=function(e,t){var n=e._dp;return n&&n.smoothChildTiming&&e._ts&&(e._start=xt(n._time-(e._ts>0?t/e._ts:((e._dirty?e.totalDuration():e._tDur)-t)/-e._ts)),Ya(e),n._dirty||ur(n,e)),e},zh=function(e,t){var n;if((t._time||!t._dur&&t._initted||t._start<e._time&&(t._dur||!t.add))&&(n=Ga(e.rawTime(),t),(!t._dur||Js(0,t.totalDuration(),n)-t._tTime>ft)&&t.render(n,!0)),ur(e,t)._dp&&e._initted&&e._time>=e._dur&&e._ts){if(e._dur<e.duration())for(n=e;n._dp;)n.rawTime()>=0&&n.totalTime(n._tTime),n=n._dp;e._zTime=-ft}},qn=function(e,t,n,i){return t.parent&&Fi(t),t._start=xt((fi(n)?n:n||e!==vt?En(e,n,t):e._time)+t._delay),t._end=xt(t._start+(t.totalDuration()/Math.abs(t.timeScale())||0)),kh(e,t,"_first","_last",e._sort?"_start":0),pc(t)||(e._recent=t),i||zh(e,t),e._ts<0&&Za(e,e._tTime),e},Vh=function(e,t){return(xn.ScrollTrigger||Xa("scrollTrigger",t))&&xn.ScrollTrigger.create(t,e)},Gh=function(e,t,n,i,s){if(Nc(e,t,s),!e._initted)return 1;if(!n&&e._pt&&!Vt&&(e._dur&&e.vars.lazy!==!1||!e._dur&&e.vars.lazy)&&Fh!==cn.frame)return Li.push(e),e._lazy=[s,i],1},jp=function r(e){var t=e.parent;return t&&t._ts&&t._initted&&!t._lock&&(t.rawTime()<0||r(t))},pc=function(e){var t=e.data;return t==="isFromStart"||t==="isStart"},em=function(e,t,n,i){var s=e.ratio,a=t<0||!t&&(!e._start&&jp(e)&&!(!e._initted&&pc(e))||(e._ts<0||e._dp._ts<0)&&!pc(e))?0:1,o=e._rDelay,c=0,l,u,h;if(o&&e._repeat&&(c=Js(0,e._tDur,t),u=qr(c,o),e._yoyo&&u&1&&(a=1-a),u!==qr(e._tTime,o)&&(s=1-a,e.vars.repeatRefresh&&e._initted&&e.invalidate())),a!==s||Vt||i||e._zTime===ft||!t&&e._zTime){if(!e._initted&&Gh(e,t,i,n,c))return;for(h=e._zTime,e._zTime=t||(n?ft:0),n||(n=t&&!h),e.ratio=a,e._from&&(a=1-a),e._time=0,e._tTime=c,l=e._pt;l;)l.r(a,l.d),l=l._next;t<0&&fc(e,t,n,!0),e._onUpdate&&!n&&_n(e,"onUpdate"),c&&e._repeat&&!n&&e.parent&&_n(e,"onRepeat"),(t>=e._tDur||t<0)&&e.ratio===a&&(a&&Fi(e,1),!n&&!Vt&&(_n(e,a?"onComplete":"onReverseComplete",!0),e._prom&&e._prom()))}else e._zTime||(e._zTime=t)},tm=function(e,t,n){var i;if(n>t)for(i=e._first;i&&i._start<=n;){if(i.data==="isPause"&&i._start>t)return i;i=i._next}else for(i=e._last;i&&i._start>=n;){if(i.data==="isPause"&&i._start<t)return i;i=i._prev}},Yr=function(e,t,n,i){var s=e._repeat,a=xt(t)||0,o=e._tTime/e._tDur;return o&&!i&&(e._time*=a/e._dur),e._dur=a,e._tDur=s?s<0?1e10:xt(a*(s+1)+e._rDelay*s):a,o>0&&!i&&Za(e,e._tTime=e._tDur*o),e.parent&&Ya(e),n||ur(e.parent,e),e},Th=function(e){return e instanceof zt?ur(e):Yr(e,e._dur)},nm={_start:0,endTime:qs,totalDuration:qs},En=function r(e,t,n){var i=e.labels,s=e._recent||nm,a=e.duration()>=Cn?s.endTime(!1):e._dur,o,c,l;return Ct(t)&&(isNaN(t)||t in i)?(c=t.charAt(0),l=t.substr(-1)==="%",o=t.indexOf("="),c==="<"||c===">"?(o>=0&&(t=t.replace(/=/,"")),(c==="<"?s._start:s.endTime(s._repeat>=0))+(parseFloat(t.substr(1))||0)*(l?(o<0?s:n).totalDuration()/100:1)):o<0?(t in i||(i[t]=a),i[t]):(c=parseFloat(t.charAt(o-1)+t.substr(o+1)),l&&n&&(c=c/100*(Wt(n)?n[0]:n).totalDuration()),o>1?r(e,t.substr(0,o-1),n)+c:a+c)):t==null?a:+t},Hs=function(e,t,n){var i=fi(t[1]),s=(i?2:1)+(e<2?0:1),a=t[s],o,c;if(i&&(a.duration=t[1]),a.parent=n,e){for(o=a,c=n;c&&!("immediateRender"in o);)o=c.vars.defaults||{},c=un(c.vars.inherit)&&c.parent;a.immediateRender=un(o.immediateRender),e<2?a.runBackwards=1:a.startAt=t[s-1]}return new wt(t[0],a,t[s+1])},Ui=function(e,t){return e||e===0?t(e):t},Js=function(e,t,n){return n<e?e:n>t?t:n},Gt=function(e,t){return!Ct(e)||!(t=Xp.exec(e))?"":t[1]},im=function(e,t,n){return Ui(n,function(i){return Js(e,t,i)})},mc=[].slice,Hh=function(e,t){return e&&Yn(e)&&"length"in e&&(!t&&!e.length||e.length-1 in e&&Yn(e[0]))&&!e.nodeType&&e!==Xn},rm=function(e,t,n){return n===void 0&&(n=[]),e.forEach(function(i){var s;return Ct(i)&&!t||Hh(i,1)?(s=n).push.apply(s,Rn(i)):n.push(i)})||n},Rn=function(e,t,n){return _t&&!t&&_t.selector?_t.selector(e):Ct(e)&&!n&&(hc||!Zr())?mc.call((t||wc).querySelectorAll(e),0):Wt(e)?rm(e,n):Hh(e)?mc.call(e,0):e?[e]:[]},gc=function(e){return e=Rn(e)[0]||Xs("Invalid scope")||{},function(t){var n=e.current||e.nativeElement||e;return Rn(t,n.querySelectorAll?n:n===e?Xs("Invalid scope")||wc.createElement("div"):e)}},Wh=function(e){return e.sort(function(){return .5-Math.random()})},Xh=function(e){if(bt(e))return e;var t=Yn(e)?e:{each:e},n=hr(t.ease),i=t.from||0,s=parseFloat(t.base)||0,a={},o=i>0&&i<1,c=isNaN(i)||o,l=t.axis,u=i,h=i;return Ct(i)?u=h={center:.5,edges:.5,end:1}[i]||0:!o&&c&&(u=i[0],h=i[1]),function(d,f,_){var g=(_||t).length,m=a[g],p,y,w,S,M,A,E,R,x;if(!m){if(x=t.grid==="auto"?0:(t.grid||[1,Cn])[1],!x){for(E=-Cn;E<(E=_[x++].getBoundingClientRect().left)&&x<g;);x<g&&x--}for(m=a[g]=[],p=c?Math.min(x,g)*u-.5:i%x,y=x===Cn?0:c?g*h/x-.5:i/x|0,E=0,R=Cn,A=0;A<g;A++)w=A%x-p,S=y-(A/x|0),m[A]=M=l?Math.abs(l==="y"?S:w):Ph(w*w+S*S),M>E&&(E=M),M<R&&(R=M);i==="random"&&Wh(m),m.max=E-R,m.min=R,m.v=g=(parseFloat(t.amount)||parseFloat(t.each)*(x>g?g-1:l?l==="y"?g/x:x:Math.max(x,g/x))||0)*(i==="edges"?-1:1),m.b=g<0?s-g:s,m.u=Gt(t.amount||t.each)||0,n=n&&g<0?ed(n):n}return g=(m[d]-m.min)/m.max||0,xt(m.b+(n?n(g):g)*m.v)+m.u}},_c=function(e){var t=Math.pow(10,((e+"").split(".")[1]||"").length);return function(n){var i=xt(Math.round(parseFloat(n)/e)*e*t);return(i-i%1)/t+(fi(n)?0:Gt(n))}},qh=function(e,t){var n=Wt(e),i,s;return!n&&Yn(e)&&(i=n=e.radius||Cn,e.values?(e=Rn(e.values),(s=!fi(e[0]))&&(i*=i)):e=_c(e.increment)),Ui(t,n?bt(e)?function(a){return s=e(a),Math.abs(s-a)<=i?s:a}:function(a){for(var o=parseFloat(s?a.x:a),c=parseFloat(s?a.y:0),l=Cn,u=0,h=e.length,d,f;h--;)s?(d=e[h].x-o,f=e[h].y-c,d=d*d+f*f):d=Math.abs(e[h]-o),d<l&&(l=d,u=h);return u=!i||l<=i?e[u]:a,s||u===a||fi(a)?u:u+Gt(a)}:_c(e))},Yh=function(e,t,n,i){return Ui(Wt(e)?!t:n===!0?!!(n=0):!i,function(){return Wt(e)?e[~~(Math.random()*e.length)]:(n=n||1e-5)&&(i=n<1?Math.pow(10,(n+"").length-2):1)&&Math.floor(Math.round((e-n/2+Math.random()*(t-e+n*.99))/n)*n*i)/i})},sm=function(){for(var e=arguments.length,t=new Array(e),n=0;n<e;n++)t[n]=arguments[n];return function(i){return t.reduce(function(s,a){return a(s)},i)}},am=function(e,t){return function(n){return e(parseFloat(n))+(t||Gt(n))}},om=function(e,t,n){return Jh(e,t,0,1,n)},Zh=function(e,t,n){return Ui(n,function(i){return e[~~t(i)]})},lm=function r(e,t,n){var i=t-e;return Wt(e)?Zh(e,r(0,e.length),t):Ui(n,function(s){return(i+(s-e)%i)%i+e})},cm=function r(e,t,n){var i=t-e,s=i*2;return Wt(e)?Zh(e,r(0,e.length-1),t):Ui(n,function(a){return a=(s+(a-e)%s)%s||0,e+(a>i?s-a:a)})},Jr=function(e){return e.replace(Gp,function(t){var n=t.indexOf("[")+1,i=t.substring(n||7,n?t.indexOf("]"):t.length-1).split(Hp);return Yh(n?i:+i[0],n?0:+i[1],+i[2]||1e-5)})},Jh=function(e,t,n,i,s){var a=t-e,o=i-n;return Ui(s,function(c){return n+((c-e)/a*o||0)})},um=function r(e,t,n,i){var s=isNaN(e+t)?0:function(f){return(1-f)*e+f*t};if(!s){var a=Ct(e),o={},c,l,u,h,d;if(n===!0&&(i=1)&&(n=null),a)e={p:e},t={p:t};else if(Wt(e)&&!Wt(t)){for(u=[],h=e.length,d=h-2,l=1;l<h;l++)u.push(r(e[l-1],e[l]));h--,s=function(_){_*=h;var g=Math.min(d,~~_);return u[g](_-g)},n=t}else i||(e=Xr(Wt(e)?[]:{},e));if(!u){for(c in t)Dc.call(o,e,c,"get",t[c]);s=function(_){return Oc(_,o)||(a?e.p:e)}}}return Ui(n,s)},Ah=function(e,t,n){var i=e.labels,s=Cn,a,o,c;for(a in i)o=i[a]-t,o<0==!!n&&o&&s>(o=Math.abs(o))&&(c=a,s=o);return c},_n=function(e,t,n){var i=e.vars,s=i[t],a=_t,o=e._ctx,c,l,u;if(s)return c=i[t+"Params"],l=i.callbackScope||e,n&&Li.length&&za(),o&&(_t=o),u=c?s.apply(l,c):s.call(l),_t=a,u},zs=function(e){return Fi(e),e.scrollTrigger&&e.scrollTrigger.kill(!!Vt),e.progress()<1&&_n(e,"onInterrupt"),e},Hr,$h=[],Kh=function(e){if(e)if(e=!e.name&&e.default||e,bc()||e.headless){var t=e.name,n=bt(e),i=t&&!n&&e.init?function(){this._props=[]}:e,s={init:qs,render:Oc,add:Dc,kill:Am,modifier:Tm,rawVars:0},a={targetTest:0,get:0,getSetter:Ja,aliases:{},register:0};if(Zr(),e!==i){if(ln[t])return;vn(i,vn(Va(e,s),a)),Xr(i.prototype,Xr(s,Va(e,a))),ln[i.prop=t]=i,e.targetTest&&(Oa.push(i),Tc[t]=1),t=(t==="css"?"CSS":t.charAt(0).toUpperCase()+t.substr(1))+"Plugin"}Nh(t,i),e.register&&e.register(Xt,i,en)}else $h.push(e)},dt=255,Vs={aqua:[0,dt,dt],lime:[0,dt,0],silver:[192,192,192],black:[0,0,0],maroon:[128,0,0],teal:[0,128,128],blue:[0,0,dt],navy:[0,0,128],white:[dt,dt,dt],olive:[128,128,0],yellow:[dt,dt,0],orange:[dt,165,0],gray:[128,128,128],purple:[128,0,128],green:[0,128,0],red:[dt,0,0],pink:[dt,192,203],cyan:[0,dt,dt],transparent:[dt,dt,dt,0]},sc=function(e,t,n){return e+=e<0?1:e>1?-1:0,(e*6<1?t+(n-t)*e*6:e<.5?n:e*3<2?t+(n-t)*(2/3-e)*6:t)*dt+.5|0},Qh=function(e,t,n){var i=e?fi(e)?[e>>16,e>>8&dt,e&dt]:0:Vs.black,s,a,o,c,l,u,h,d,f,_;if(!i){if(e.substr(-1)===","&&(e=e.substr(0,e.length-1)),Vs[e])i=Vs[e];else if(e.charAt(0)==="#"){if(e.length<6&&(s=e.charAt(1),a=e.charAt(2),o=e.charAt(3),e="#"+s+s+a+a+o+o+(e.length===5?e.charAt(4)+e.charAt(4):"")),e.length===9)return i=parseInt(e.substr(1,6),16),[i>>16,i>>8&dt,i&dt,parseInt(e.substr(7),16)/255];e=parseInt(e.substr(1),16),i=[e>>16,e>>8&dt,e&dt]}else if(e.substr(0,3)==="hsl"){if(i=_=e.match(bh),!t)c=+i[0]%360/360,l=+i[1]/100,u=+i[2]/100,a=u<=.5?u*(l+1):u+l-u*l,s=u*2-a,i.length>3&&(i[3]*=1),i[0]=sc(c+1/3,s,a),i[1]=sc(c,s,a),i[2]=sc(c-1/3,s,a);else if(~e.indexOf("="))return i=e.match(Mc),n&&i.length<4&&(i[3]=1),i}else i=e.match(bh)||Vs.transparent;i=i.map(Number)}return t&&!_&&(s=i[0]/dt,a=i[1]/dt,o=i[2]/dt,h=Math.max(s,a,o),d=Math.min(s,a,o),u=(h+d)/2,h===d?c=l=0:(f=h-d,l=u>.5?f/(2-h-d):f/(h+d),c=h===s?(a-o)/f+(a<o?6:0):h===a?(o-s)/f+2:(s-a)/f+4,c*=60),i[0]=~~(c+.5),i[1]=~~(l*100+.5),i[2]=~~(u*100+.5)),n&&i.length<4&&(i[3]=1),i},jh=function(e){var t=[],n=[],i=-1;return e.split(di).forEach(function(s){var a=s.match(fr)||[];t.push.apply(t,a),n.push(i+=a.length+1)}),t.c=n,t},Eh=function(e,t,n){var i="",s=(e+i).match(di),a=t?"hsla(":"rgba(",o=0,c,l,u,h;if(!s)return e;if(s=s.map(function(d){return(d=Qh(d,t,1))&&a+(t?d[0]+","+d[1]+"%,"+d[2]+"%,"+d[3]:d.join(","))+")"}),n&&(u=jh(e),c=n.c,c.join(i)!==u.c.join(i)))for(l=e.replace(di,"1").split(fr),h=l.length-1;o<h;o++)i+=l[o]+(~c.indexOf(o)?s.shift()||a+"0,0,0,0)":(u.length?u:s.length?s:n).shift());if(!l)for(l=e.split(di),h=l.length-1;o<h;o++)i+=l[o]+s[o];return i+l[h]},di=(function(){var r="(?:\\b(?:(?:rgb|rgba|hsl|hsla)\\(.+?\\))|\\B#(?:[0-9a-f]{3,4}){1,2}\\b",e;for(e in Vs)r+="|"+e+"\\b";return new RegExp(r+")","gi")})(),hm=/hsl[a]?\(/,Pc=function(e){var t=e.join(" "),n;if(di.lastIndex=0,di.test(t))return n=hm.test(t),e[1]=Eh(e[1],n),e[0]=Eh(e[0],n,jh(e[1])),!0},Ys,cn=(function(){var r=Date.now,e=500,t=33,n=r(),i=n,s=1e3/240,a=s,o=[],c,l,u,h,d,f,_=function g(m){var p=r()-i,y=m===!0,w,S,M,A;if((p>e||p<0)&&(n+=p-t),i+=p,M=i-n,w=M-a,(w>0||y)&&(A=++h.frame,d=M-h.time*1e3,h.time=M=M/1e3,a+=w+(w>=s?4:s-w),S=1),y||(c=l(g)),S)for(f=0;f<o.length;f++)o[f](M,d,A,m)};return h={time:0,frame:0,tick:function(){_(!0)},deltaRatio:function(m){return d/(1e3/(m||60))},wake:function(){Dh&&(!hc&&bc()&&(Xn=hc=window,wc=Xn.document||{},xn.gsap=Xt,(Xn.gsapVersions||(Xn.gsapVersions=[])).push(Xt.version),Lh(ka||Xn.GreenSockGlobals||!Xn.gsap&&Xn||{}),$h.forEach(Kh)),u=typeof requestAnimationFrame<"u"&&requestAnimationFrame,c&&h.sleep(),l=u||function(m){return setTimeout(m,a-h.time*1e3+1|0)},Ys=1,_(2))},sleep:function(){(u?cancelAnimationFrame:clearTimeout)(c),Ys=0,l=qs},lagSmoothing:function(m,p){e=m||1/0,t=Math.min(p||33,e)},fps:function(m){s=1e3/(m||240),a=h.time*1e3+s},add:function(m,p,y){var w=p?function(S,M,A,E){m(S,M,A,E),h.remove(w)}:m;return h.remove(m),o[y?"unshift":"push"](w),Zr(),w},remove:function(m,p){~(p=o.indexOf(m))&&o.splice(p,1)&&f>=p&&f--},_listeners:o},h})(),Zr=function(){return!Ys&&cn.wake()},Qe={},dm=/^[\d.\-M][\d.\-,\s]/,fm=/["']/g,pm=function(e){for(var t={},n=e.substr(1,e.length-3).split(":"),i=n[0],s=1,a=n.length,o,c,l;s<a;s++)c=n[s],o=s!==a-1?c.lastIndexOf(","):c.length,l=c.substr(0,o),t[i]=isNaN(l)?l.replace(fm,"").trim():+l,i=c.substr(o+1).trim();return t},mm=function(e){var t=e.indexOf("(")+1,n=e.indexOf(")"),i=e.indexOf("(",t);return e.substring(t,~i&&i<n?e.indexOf(")",n+1):n)},gm=function(e){var t=(e+"").split("("),n=Qe[t[0]];return n&&t.length>1&&n.config?n.config.apply(null,~e.indexOf("{")?[pm(t[1])]:mm(e).split(",").map(Oh)):Qe._CE&&dm.test(e)?Qe._CE("",e):n},ed=function(e){return function(t){return 1-e(1-t)}},td=function r(e,t){for(var n=e._first,i;n;)n instanceof zt?r(n,t):n.vars.yoyoEase&&(!n._yoyo||!n._repeat)&&n._yoyo!==t&&(n.timeline?r(n.timeline,t):(i=n._ease,n._ease=n._yEase,n._yEase=i,n._yoyo=t)),n=n._next},hr=function(e,t){return e&&(bt(e)?e:Qe[e]||gm(e))||t},mr=function(e,t,n,i){n===void 0&&(n=function(c){return 1-t(1-c)}),i===void 0&&(i=function(c){return c<.5?t(c*2)/2:1-t((1-c)*2)/2});var s={easeIn:t,easeOut:n,easeInOut:i},a;return jt(e,function(o){Qe[o]=xn[o]=s,Qe[a=o.toLowerCase()]=n;for(var c in s)Qe[a+(c==="easeIn"?".in":c==="easeOut"?".out":".inOut")]=Qe[o+"."+c]=s[c]}),s},nd=function(e){return function(t){return t<.5?(1-e(1-t*2))/2:.5+e((t-.5)*2)/2}},ac=function r(e,t,n){var i=t>=1?t:1,s=(n||(e?.3:.45))/(t<1?t:1),a=s/uc*(Math.asin(1/i)||0),o=function(u){return u===1?1:i*Math.pow(2,-10*u)*Vp((u-a)*s)+1},c=e==="out"?o:e==="in"?function(l){return 1-o(1-l)}:nd(o);return s=uc/s,c.config=function(l,u){return r(e,l,u)},c},oc=function r(e,t){t===void 0&&(t=1.70158);var n=function(a){return a?--a*a*((t+1)*a+t)+1:0},i=e==="out"?n:e==="in"?function(s){return 1-n(1-s)}:nd(n);return i.config=function(s){return r(e,s)},i};jt("Linear,Quad,Cubic,Quart,Quint,Strong",function(r,e){var t=e<5?e+1:e;mr(r+",Power"+(t-1),e?function(n){return Math.pow(n,t)}:function(n){return n},function(n){return 1-Math.pow(1-n,t)},function(n){return n<.5?Math.pow(n*2,t)/2:1-Math.pow((1-n)*2,t)/2})});Qe.Linear.easeNone=Qe.none=Qe.Linear.easeIn;mr("Elastic",ac("in"),ac("out"),ac());(function(r,e){var t=1/e,n=2*t,i=2.5*t,s=function(o){return o<t?r*o*o:o<n?r*Math.pow(o-1.5/e,2)+.75:o<i?r*(o-=2.25/e)*o+.9375:r*Math.pow(o-2.625/e,2)+.984375};mr("Bounce",function(a){return 1-s(1-a)},s)})(7.5625,2.75);mr("Expo",function(r){return Math.pow(2,10*(r-1))*r+r*r*r*r*r*r*(1-r)});mr("Circ",function(r){return-(Ph(1-r*r)-1)});mr("Sine",function(r){return r===1?1:-zp(r*Bp)+1});mr("Back",oc("in"),oc("out"),oc());Qe.SteppedEase=Qe.steps=xn.SteppedEase={config:function(e,t){e===void 0&&(e=1);var n=1/e,i=e+(t?0:1),s=t?1:0,a=1-ft;return function(o){return((i*Js(0,a,o)|0)+s)*n}}};Wr.ease=Qe["quad.out"];jt("onComplete,onUpdate,onStart,onRepeat,onReverseComplete,onInterrupt",function(r){return Ac+=r+","+r+"Params,"});var Ic=function(e,t){this.id=kp++,e._gsap=this,this.target=e,this.harness=t,this.get=t?t.get:Cc,this.set=t?t.getSetter:Ja},Zs=(function(){function r(t){this.vars=t,this._delay=+t.delay||0,(this._repeat=t.repeat===1/0?-2:t.repeat||0)&&(this._rDelay=t.repeatDelay||0,this._yoyo=!!t.yoyo||!!t.yoyoEase),this._ts=1,Yr(this,+t.duration,1,1),this.data=t.data,_t&&(this._ctx=_t,_t.data.push(this)),Ys||cn.wake()}var e=r.prototype;return e.delay=function(n){return n||n===0?(this.parent&&this.parent.smoothChildTiming&&this.startTime(this._start+n-this._delay),this._delay=n,this):this._delay},e.duration=function(n){return arguments.length?this.totalDuration(this._repeat>0?n+(n+this._rDelay)*this._repeat:n):this.totalDuration()&&this._dur},e.totalDuration=function(n){return arguments.length?(this._dirty=0,Yr(this,this._repeat<0?n:(n-this._repeat*this._rDelay)/(this._repeat+1))):this._tDur},e.totalTime=function(n,i){if(Zr(),!arguments.length)return this._tTime;var s=this._dp;if(s&&s.smoothChildTiming&&this._ts){for(Za(this,n),!s._dp||s.parent||zh(s,this);s&&s.parent;)s.parent._time!==s._start+(s._ts>=0?s._tTime/s._ts:(s.totalDuration()-s._tTime)/-s._ts)&&s.totalTime(s._tTime,!0),s=s.parent;!this.parent&&this._dp.autoRemoveChildren&&(this._ts>0&&n<this._tDur||this._ts<0&&n>0||!this._tDur&&!n)&&qn(this._dp,this,this._start-this._delay)}return(this._tTime!==n||!this._dur&&!i||this._initted&&Math.abs(this._zTime)===ft||!this._initted&&this._dur&&n||!n&&!this._initted&&(this.add||this._ptLookup))&&(this._ts||(this._pTime=n),Uh(this,n,i)),this},e.time=function(n,i){return arguments.length?this.totalTime(Math.min(this.totalDuration(),n+wh(this))%(this._dur+this._rDelay)||(n?this._dur:0),i):this._time},e.totalProgress=function(n,i){return arguments.length?this.totalTime(this.totalDuration()*n,i):this.totalDuration()?Math.min(1,this._tTime/this._tDur):this.rawTime()>=0&&this._initted?1:0},e.progress=function(n,i){return arguments.length?this.totalTime(this.duration()*(this._yoyo&&!(this.iteration()&1)?1-n:n)+wh(this),i):this.duration()?Math.min(1,this._time/this._dur):this.rawTime()>0?1:0},e.iteration=function(n,i){var s=this.duration()+this._rDelay;return arguments.length?this.totalTime(this._time+(n-1)*s,i):this._repeat?qr(this._tTime,s)+1:1},e.timeScale=function(n,i){if(!arguments.length)return this._rts===-ft?0:this._rts;if(this._rts===n)return this;var s=this.parent&&this._ts?Ga(this.parent._time,this):this._tTime;return this._rts=+n||0,this._ts=this._ps||n===-ft?0:this._rts,this.totalTime(Js(-Math.abs(this._delay),this.totalDuration(),s),i!==!1),Ya(this),Kp(this)},e.paused=function(n){return arguments.length?(this._ps!==n&&(this._ps=n,n?(this._pTime=this._tTime||Math.max(-this._delay,this.rawTime()),this._ts=this._act=0):(Zr(),this._ts=this._rts,this.totalTime(this.parent&&!this.parent.smoothChildTiming?this.rawTime():this._tTime||this._pTime,this.progress()===1&&Math.abs(this._zTime)!==ft&&(this._tTime-=ft)))),this):this._ps},e.startTime=function(n){if(arguments.length){this._start=xt(n);var i=this.parent||this._dp;return i&&(i._sort||!this.parent)&&qn(i,this,this._start-this._delay),this}return this._start},e.endTime=function(n){return this._start+(un(n)?this.totalDuration():this.duration())/Math.abs(this._ts||1)},e.rawTime=function(n){var i=this.parent||this._dp;return i?n&&(!this._ts||this._repeat&&this._time&&this.totalProgress()<1)?this._tTime%(this._dur+this._rDelay):this._ts?Ga(i.rawTime(n),this):this._tTime:this._tTime},e.revert=function(n){n===void 0&&(n=Yp);var i=Vt;return Vt=n,Rc(this)&&(this.timeline&&this.timeline.revert(n),this.totalTime(-.01,n.suppressEvents)),this.data!=="nested"&&n.kill!==!1&&this.kill(),Vt=i,this},e.globalTime=function(n){for(var i=this,s=arguments.length?n:i.rawTime();i;)s=i._start+s/(Math.abs(i._ts)||1),i=i._dp;return!this.parent&&this._sat?this._sat.globalTime(n):s},e.repeat=function(n){return arguments.length?(this._repeat=n===1/0?-2:n,Th(this)):this._repeat===-2?1/0:this._repeat},e.repeatDelay=function(n){if(arguments.length){var i=this._time;return this._rDelay=n,Th(this),i?this.time(i):this}return this._rDelay},e.yoyo=function(n){return arguments.length?(this._yoyo=n,this):this._yoyo},e.seek=function(n,i){return this.totalTime(En(this,n),un(i))},e.restart=function(n,i){return this.play().totalTime(n?-this._delay:0,un(i)),this._dur||(this._zTime=-ft),this},e.play=function(n,i){return n!=null&&this.seek(n,i),this.reversed(!1).paused(!1)},e.reverse=function(n,i){return n!=null&&this.seek(n||this.totalDuration(),i),this.reversed(!0).paused(!1)},e.pause=function(n,i){return n!=null&&this.seek(n,i),this.paused(!0)},e.resume=function(){return this.paused(!1)},e.reversed=function(n){return arguments.length?(!!n!==this.reversed()&&this.timeScale(-this._rts||(n?-ft:0)),this):this._rts<0},e.invalidate=function(){return this._initted=this._act=0,this._zTime=-ft,this},e.isActive=function(){var n=this.parent||this._dp,i=this._start,s;return!!(!n||this._ts&&this._initted&&n.isActive()&&(s=n.rawTime(!0))>=i&&s<this.endTime(!0)-ft)},e.eventCallback=function(n,i,s){var a=this.vars;return arguments.length>1?(i?(a[n]=i,s&&(a[n+"Params"]=s),n==="onUpdate"&&(this._onUpdate=i)):delete a[n],this):a[n]},e.then=function(n){var i=this,s=i._prom;return new Promise(function(a){var o=bt(n)?n:Bh,c=function(){var u=i.then;i.then=null,s&&s(),bt(o)&&(o=o(i))&&(o.then||o===i)&&(i.then=u),a(o),i.then=u};i._initted&&i.totalProgress()===1&&i._ts>=0||!i._tTime&&i._ts<0?c():i._prom=c})},e.kill=function(){zs(this)},r})();vn(Zs.prototype,{_time:0,_start:0,_end:0,_tTime:0,_tDur:0,_dirty:0,_repeat:0,_yoyo:!1,parent:null,_initted:!1,_rDelay:0,_ts:1,_dp:0,ratio:0,_zTime:-ft,_prom:0,_ps:!1,_rts:1});var zt=(function(r){Rh(e,r);function e(n,i){var s;return n===void 0&&(n={}),s=r.call(this,n)||this,s.labels={},s.smoothChildTiming=!!n.smoothChildTiming,s.autoRemoveChildren=!!n.autoRemoveChildren,s._sort=un(n.sortChildren),vt&&qn(n.parent||vt,hi(s),i),n.reversed&&s.reverse(),n.paused&&s.paused(!0),n.scrollTrigger&&Vh(hi(s),n.scrollTrigger),s}var t=e.prototype;return t.to=function(i,s,a){return Hs(0,arguments,this),this},t.from=function(i,s,a){return Hs(1,arguments,this),this},t.fromTo=function(i,s,a,o){return Hs(2,arguments,this),this},t.set=function(i,s,a){return s.duration=0,s.parent=this,Gs(s).repeatDelay||(s.repeat=0),s.immediateRender=!!s.immediateRender,new wt(i,s,En(this,a),1),this},t.call=function(i,s,a){return qn(this,wt.delayedCall(0,i,s),a)},t.staggerTo=function(i,s,a,o,c,l,u){return a.duration=s,a.stagger=a.stagger||o,a.onComplete=l,a.onCompleteParams=u,a.parent=this,new wt(i,a,En(this,c)),this},t.staggerFrom=function(i,s,a,o,c,l,u){return a.runBackwards=1,Gs(a).immediateRender=un(a.immediateRender),this.staggerTo(i,s,a,o,c,l,u)},t.staggerFromTo=function(i,s,a,o,c,l,u,h){return o.startAt=a,Gs(o).immediateRender=un(o.immediateRender),this.staggerTo(i,s,o,c,l,u,h)},t.render=function(i,s,a){var o=this._time,c=this._dirty?this.totalDuration():this._tDur,l=this._dur,u=i<=0?0:xt(i),h=this._zTime<0!=i<0&&(this._initted||!l),d,f,_,g,m,p,y,w,S,M,A,E;if(this!==vt&&u>c&&i>=0&&(u=c),u!==this._tTime||a||h){if(o!==this._time&&l&&(u+=this._time-o,i+=this._time-o),d=u,S=this._start,w=this._ts,p=!w,h&&(l||(o=this._zTime),(i||!s)&&(this._zTime=i)),this._repeat){if(A=this._yoyo,m=l+this._rDelay,this._repeat<-1&&i<0)return this.totalTime(m*100+i,s,a);if(d=xt(u%m),u===c?(g=this._repeat,d=l):(M=xt(u/m),g=~~M,g&&g===M&&(d=l,g--),d>l&&(d=l)),M=qr(this._tTime,m),!o&&this._tTime&&M!==g&&this._tTime-M*m-this._dur<=0&&(M=g),A&&g&1&&(d=l-d,E=1),g!==M&&!this._lock){var R=A&&M&1,x=R===(A&&g&1);if(g<M&&(R=!R),o=R?0:u%l?l:u,this._lock=1,this.render(o||(E?0:xt(g*m)),s,!l)._lock=0,this._tTime=u,!s&&this.parent&&_n(this,"onRepeat"),this.vars.repeatRefresh&&!E&&(this.invalidate()._lock=1,M=g),o&&o!==this._time||p!==!this._ts||this.vars.onRepeat&&!this.parent&&!this._act)return this;if(l=this._dur,c=this._tDur,x&&(this._lock=2,o=R?l:-1e-4,this.render(o,!0),this.vars.repeatRefresh&&!E&&this.invalidate()),this._lock=0,!this._ts&&!p)return this;td(this,E)}}if(this._hasPause&&!this._forcing&&this._lock<2&&(y=tm(this,xt(o),xt(d)),y&&(u-=d-(d=y._start))),this._tTime=u,this._time=d,this._act=!w,this._initted||(this._onUpdate=this.vars.onUpdate,this._initted=1,this._zTime=i,o=0),!o&&u&&l&&!s&&!M&&(_n(this,"onStart"),this._tTime!==u))return this;if(d>=o&&i>=0)for(f=this._first;f;){if(_=f._next,(f._act||d>=f._start)&&f._ts&&y!==f){if(f.parent!==this)return this.render(i,s,a);if(f.render(f._ts>0?(d-f._start)*f._ts:(f._dirty?f.totalDuration():f._tDur)+(d-f._start)*f._ts,s,a),d!==this._time||!this._ts&&!p){y=0,_&&(u+=this._zTime=-ft);break}}f=_}else{f=this._last;for(var T=i<0?i:d;f;){if(_=f._prev,(f._act||T<=f._end)&&f._ts&&y!==f){if(f.parent!==this)return this.render(i,s,a);if(f.render(f._ts>0?(T-f._start)*f._ts:(f._dirty?f.totalDuration():f._tDur)+(T-f._start)*f._ts,s,a||Vt&&Rc(f)),d!==this._time||!this._ts&&!p){y=0,_&&(u+=this._zTime=T?-ft:ft);break}}f=_}}if(y&&!s&&(this.pause(),y.render(d>=o?0:-ft)._zTime=d>=o?1:-1,this._ts))return this._start=S,Ya(this),this.render(i,s,a);this._onUpdate&&!s&&_n(this,"onUpdate",!0),(u===c&&this._tTime>=this.totalDuration()||!u&&o)&&(S===this._start||Math.abs(w)!==Math.abs(this._ts))&&(this._lock||((i||!l)&&(u===c&&this._ts>0||!u&&this._ts<0)&&Fi(this,1),!s&&!(i<0&&!o)&&(u||o||!c)&&(_n(this,u===c&&i>=0?"onComplete":"onReverseComplete",!0),this._prom&&!(u<c&&this.timeScale()>0)&&this._prom())))}return this},t.add=function(i,s){var a=this;if(fi(s)||(s=En(this,s,i)),!(i instanceof Zs)){if(Wt(i))return i.forEach(function(o){return a.add(o,s)}),this;if(Ct(i))return this.addLabel(i,s);if(bt(i))i=wt.delayedCall(0,i);else return this}return this!==i?qn(this,i,s):this},t.getChildren=function(i,s,a,o){i===void 0&&(i=!0),s===void 0&&(s=!0),a===void 0&&(a=!0),o===void 0&&(o=-Cn);for(var c=[],l=this._first;l;)l._start>=o&&(l instanceof wt?s&&c.push(l):(a&&c.push(l),i&&c.push.apply(c,l.getChildren(!0,s,a)))),l=l._next;return c},t.getById=function(i){for(var s=this.getChildren(1,1,1),a=s.length;a--;)if(s[a].vars.id===i)return s[a]},t.remove=function(i){return Ct(i)?this.removeLabel(i):bt(i)?this.killTweensOf(i):(i.parent===this&&qa(this,i),i===this._recent&&(this._recent=this._last),ur(this))},t.totalTime=function(i,s){return arguments.length?(this._forcing=1,!this._dp&&this._ts&&(this._start=xt(cn.time-(this._ts>0?i/this._ts:(this.totalDuration()-i)/-this._ts))),r.prototype.totalTime.call(this,i,s),this._forcing=0,this):this._tTime},t.addLabel=function(i,s){return this.labels[i]=En(this,s),this},t.removeLabel=function(i){return delete this.labels[i],this},t.addPause=function(i,s,a){var o=wt.delayedCall(0,s||qs,a);return o.data="isPause",this._hasPause=1,qn(this,o,En(this,i))},t.removePause=function(i){var s=this._first;for(i=En(this,i);s;)s._start===i&&s.data==="isPause"&&Fi(s),s=s._next},t.killTweensOf=function(i,s,a){for(var o=this.getTweensOf(i,a),c=o.length;c--;)Di!==o[c]&&o[c].kill(i,s);return this},t.getTweensOf=function(i,s){for(var a=[],o=Rn(i),c=this._first,l=fi(s),u;c;)c instanceof wt?Zp(c._targets,o)&&(l?(!Di||c._initted&&c._ts)&&c.globalTime(0)<=s&&c.globalTime(c.totalDuration())>s:!s||c.isActive())&&a.push(c):(u=c.getTweensOf(o,s)).length&&a.push.apply(a,u),c=c._next;return a},t.tweenTo=function(i,s){s=s||{};var a=this,o=En(a,i),c=s,l=c.startAt,u=c.onStart,h=c.onStartParams,d=c.immediateRender,f,_=wt.to(a,vn({ease:s.ease||"none",lazy:!1,immediateRender:!1,time:o,overwrite:"auto",duration:s.duration||Math.abs((o-(l&&"time"in l?l.time:a._time))/a.timeScale())||ft,onStart:function(){if(a.pause(),!f){var m=s.duration||Math.abs((o-(l&&"time"in l?l.time:a._time))/a.timeScale());_._dur!==m&&Yr(_,m,0,1).render(_._time,!0,!0),f=1}u&&u.apply(_,h||[])}},s));return d?_.render(0):_},t.tweenFromTo=function(i,s,a){return this.tweenTo(s,vn({startAt:{time:En(this,i)}},a))},t.recent=function(){return this._recent},t.nextLabel=function(i){return i===void 0&&(i=this._time),Ah(this,En(this,i))},t.previousLabel=function(i){return i===void 0&&(i=this._time),Ah(this,En(this,i),1)},t.currentLabel=function(i){return arguments.length?this.seek(i,!0):this.previousLabel(this._time+ft)},t.shiftChildren=function(i,s,a){a===void 0&&(a=0);var o=this._first,c=this.labels,l;for(i=xt(i);o;)o._start>=a&&(o._start+=i,o._end+=i),o=o._next;if(s)for(l in c)c[l]>=a&&(c[l]+=i);return ur(this)},t.invalidate=function(i){var s=this._first;for(this._lock=0;s;)s.invalidate(i),s=s._next;return r.prototype.invalidate.call(this,i)},t.clear=function(i){i===void 0&&(i=!0);for(var s=this._first,a;s;)a=s._next,this.remove(s),s=a;return this._dp&&(this._time=this._tTime=this._pTime=0),i&&(this.labels={}),ur(this)},t.totalDuration=function(i){var s=0,a=this,o=a._last,c=Cn,l,u,h;if(arguments.length)return a.timeScale((a._repeat<0?a.duration():a.totalDuration())/(a.reversed()?-i:i));if(a._dirty){for(h=a.parent;o;)l=o._prev,o._dirty&&o.totalDuration(),u=o._start,u>c&&a._sort&&o._ts&&!a._lock?(a._lock=1,qn(a,o,u-o._delay,1)._lock=0):c=u,u<0&&o._ts&&(s-=u,(!h&&!a._dp||h&&h.smoothChildTiming)&&(a._start+=xt(u/a._ts),a._time-=u,a._tTime-=u),a.shiftChildren(-u,!1,-1/0),c=0),o._end>s&&o._ts&&(s=o._end),o=l;Yr(a,a===vt&&a._time>s?a._time:s,1,1),a._dirty=0}return a._tDur},e.updateRoot=function(i){if(vt._ts&&(Uh(vt,Ga(i,vt)),Fh=cn.frame),cn.frame>=Mh){Mh+=hn.autoSleep||120;var s=vt._first;if((!s||!s._ts)&&hn.autoSleep&&cn._listeners.length<2){for(;s&&!s._ts;)s=s._next;s||cn.sleep()}}},e})(Zs);vn(zt.prototype,{_lock:0,_hasPause:0,_forcing:0});var _m=function(e,t,n,i,s,a,o){var c=new en(this._pt,e,t,0,1,Uc,null,s),l=0,u=0,h,d,f,_,g,m,p,y;for(c.b=n,c.e=i,n+="",i+="",(p=~i.indexOf("random("))&&(i=Jr(i)),a&&(y=[n,i],a(y,e,t),n=y[0],i=y[1]),d=n.match(ic)||[];h=ic.exec(i);)_=h[0],g=i.substring(l,h.index),f?f=(f+1)%5:g.substr(-5)==="rgba("&&(f=1),_!==d[u++]&&(m=parseFloat(d[u-1])||0,c._pt={_next:c._pt,p:g||u===1?g:",",s:m,c:_.charAt(1)==="="?pr(m,_)-m:parseFloat(_)-m,m:f&&f<4?Math.round:0},l=ic.lastIndex);return c.c=l<i.length?i.substring(l,i.length):"",c.fp=o,(Sc.test(i)||p)&&(c.e=0),this._pt=c,c},Dc=function(e,t,n,i,s,a,o,c,l,u){bt(i)&&(i=i(s||0,e,a));var h=e[t],d=n!=="get"?n:bt(h)?l?e[t.indexOf("set")||!bt(e["get"+t.substr(3)])?t:"get"+t.substr(3)](l):e[t]():h,f=bt(h)?l?Mm:sd:Fc,_;if(Ct(i)&&(~i.indexOf("random(")&&(i=Jr(i)),i.charAt(1)==="="&&(_=pr(d,i)+(Gt(d)||0),(_||_===0)&&(i=_))),!u||d!==i||xc)return!isNaN(d*i)&&i!==""?(_=new en(this._pt,e,t,+d||0,i-(d||0),typeof h=="boolean"?wm:ad,0,f),l&&(_.fp=l),o&&_.modifier(o,this,e),this._pt=_):(!h&&!(t in e)&&Xa(t,i),_m.call(this,e,t,d,i,f,c||hn.stringFilter,l))},xm=function(e,t,n,i,s){if(bt(e)&&(e=Ws(e,s,t,n,i)),!Yn(e)||e.style&&e.nodeType||Wt(e)||Ih(e))return Ct(e)?Ws(e,s,t,n,i):e;var a={},o;for(o in e)a[o]=Ws(e[o],s,t,n,i);return a},Lc=function(e,t,n,i,s,a){var o,c,l,u;if(ln[e]&&(o=new ln[e]).init(s,o.rawVars?t[e]:xm(t[e],i,s,a,n),n,i,a)!==!1&&(n._pt=c=new en(n._pt,s,e,0,1,o.render,o,0,o.priority),n!==Hr))for(l=n._ptLookup[n._targets.indexOf(s)],u=o._props.length;u--;)l[o._props[u]]=c;return o},Di,xc,Nc=function r(e,t,n){var i=e.vars,s=i.ease,a=i.startAt,o=i.immediateRender,c=i.lazy,l=i.onUpdate,u=i.runBackwards,h=i.yoyoEase,d=i.keyframes,f=i.autoRevert,_=e._dur,g=e._startAt,m=e._targets,p=e.parent,y=p&&p.data==="nested"?p.vars.targets:m,w=e._overwrite==="auto"&&!yc,S=e.timeline,M,A,E,R,x,T,I,B,N,k,V,O,z;if(S&&(!d||!s)&&(s="none"),e._ease=hr(s,Wr.ease),e._yEase=h?ed(hr(h===!0?s:h,Wr.ease)):0,h&&e._yoyo&&!e._repeat&&(h=e._yEase,e._yEase=e._ease,e._ease=h),e._from=!S&&!!i.runBackwards,!S||d&&!i.stagger){if(B=m[0]?Ni(m[0]).harness:0,O=B&&i[B.prop],M=Va(i,Tc),g&&(g._zTime<0&&g.progress(1),t<0&&u&&o&&!f?g.render(-1,!0):g.revert(u&&_?Ua:qp),g._lazy=0),a){if(Fi(e._startAt=wt.set(m,vn({data:"isStart",overwrite:!1,parent:p,immediateRender:!0,lazy:!g&&un(c),startAt:null,delay:0,onUpdate:l&&function(){return _n(e,"onUpdate")},stagger:0},a))),e._startAt._dp=0,e._startAt._sat=e,t<0&&(Vt||!o&&!f)&&e._startAt.revert(Ua),o&&_&&t<=0&&n<=0){t&&(e._zTime=t);return}}else if(u&&_&&!g){if(t&&(o=!1),E=vn({overwrite:!1,data:"isFromStart",lazy:o&&!g&&un(c),immediateRender:o,stagger:0,parent:p},M),O&&(E[B.prop]=O),Fi(e._startAt=wt.set(m,E)),e._startAt._dp=0,e._startAt._sat=e,t<0&&(Vt?e._startAt.revert(Ua):e._startAt.render(-1,!0)),e._zTime=t,!o)r(e._startAt,ft,ft);else if(!t)return}for(e._pt=e._ptCache=0,c=_&&un(c)||c&&!_,A=0;A<m.length;A++){if(x=m[A],I=x._gsap||Ec(m)[A]._gsap,e._ptLookup[A]=k={},dc[I.id]&&Li.length&&za(),V=y===m?A:y.indexOf(x),B&&(N=new B).init(x,O||M,e,V,y)!==!1&&(e._pt=R=new en(e._pt,x,N.name,0,1,N.render,N,0,N.priority),N._props.forEach(function($){k[$]=R}),N.priority&&(T=1)),!B||O)for(E in M)ln[E]&&(N=Lc(E,M,e,V,x,y))?N.priority&&(T=1):k[E]=R=Dc.call(e,x,E,"get",M[E],V,y,0,i.stringFilter);e._op&&e._op[A]&&e.kill(x,e._op[A]),w&&e._pt&&(Di=e,vt.killTweensOf(x,k,e.globalTime(t)),z=!e.parent,Di=0),e._pt&&c&&(dc[I.id]=1)}T&&Bc(e),e._onInit&&e._onInit(e)}e._onUpdate=l,e._initted=(!e._op||e._pt)&&!z,d&&t<=0&&S.render(Cn,!0,!0)},vm=function(e,t,n,i,s,a,o,c){var l=(e._pt&&e._ptCache||(e._ptCache={}))[t],u,h,d,f;if(!l)for(l=e._ptCache[t]=[],d=e._ptLookup,f=e._targets.length;f--;){if(u=d[f][t],u&&u.d&&u.d._pt)for(u=u.d._pt;u&&u.p!==t&&u.fp!==t;)u=u._next;if(!u)return xc=1,e.vars[t]="+=0",Nc(e,o),xc=0,c?Xs(t+" not eligible for reset"):1;l.push(u)}for(f=l.length;f--;)h=l[f],u=h._pt||h,u.s=(i||i===0)&&!s?i:u.s+(i||0)+a*u.c,u.c=n-u.s,h.e&&(h.e=Mt(n)+Gt(h.e)),h.b&&(h.b=u.s+Gt(h.b))},ym=function(e,t){var n=e[0]?Ni(e[0]).harness:0,i=n&&n.aliases,s,a,o,c;if(!i)return t;s=Xr({},t);for(a in i)if(a in s)for(c=i[a].split(","),o=c.length;o--;)s[c[o]]=s[a];return s},bm=function(e,t,n,i){var s=t.ease||i||"power1.inOut",a,o;if(Wt(t))o=n[e]||(n[e]=[]),t.forEach(function(c,l){return o.push({t:l/(t.length-1)*100,v:c,e:s})});else for(a in t)o=n[a]||(n[a]=[]),a==="ease"||o.push({t:parseFloat(e),v:t[a],e:s})},Ws=function(e,t,n,i,s){return bt(e)?e.call(t,n,i,s):Ct(e)&&~e.indexOf("random(")?Jr(e):e},id=Ac+"repeat,repeatDelay,yoyo,repeatRefresh,yoyoEase,autoRevert",rd={};jt(id+",id,stagger,delay,duration,paused,scrollTrigger",function(r){return rd[r]=1});var wt=(function(r){Rh(e,r);function e(n,i,s,a){var o;typeof i=="number"&&(s.duration=i,i=s,s=null),o=r.call(this,a?i:Gs(i))||this;var c=o.vars,l=c.duration,u=c.delay,h=c.immediateRender,d=c.stagger,f=c.overwrite,_=c.keyframes,g=c.defaults,m=c.scrollTrigger,p=c.yoyoEase,y=i.parent||vt,w=(Wt(n)||Ih(n)?fi(n[0]):"length"in i)?[n]:Rn(n),S,M,A,E,R,x,T,I;if(o._targets=w.length?Ec(w):Xs("GSAP target "+n+" not found. https://gsap.com",!hn.nullTargetWarn)||[],o._ptLookup=[],o._overwrite=f,_||d||Fa(l)||Fa(u)){if(i=o.vars,S=o.timeline=new zt({data:"nested",defaults:g||{},targets:y&&y.data==="nested"?y.vars.targets:w}),S.kill(),S.parent=S._dp=hi(o),S._start=0,d||Fa(l)||Fa(u)){if(E=w.length,T=d&&Xh(d),Yn(d))for(R in d)~id.indexOf(R)&&(I||(I={}),I[R]=d[R]);for(M=0;M<E;M++)A=Va(i,rd),A.stagger=0,p&&(A.yoyoEase=p),I&&Xr(A,I),x=w[M],A.duration=+Ws(l,hi(o),M,x,w),A.delay=(+Ws(u,hi(o),M,x,w)||0)-o._delay,!d&&E===1&&A.delay&&(o._delay=u=A.delay,o._start+=u,A.delay=0),S.to(x,A,T?T(M,x,w):0),S._ease=Qe.none;S.duration()?l=u=0:o.timeline=0}else if(_){Gs(vn(S.vars.defaults,{ease:"none"})),S._ease=hr(_.ease||i.ease||"none");var B=0,N,k,V;if(Wt(_))_.forEach(function(O){return S.to(w,O,">")}),S.duration();else{A={};for(R in _)R==="ease"||R==="easeEach"||bm(R,_[R],A,_.easeEach);for(R in A)for(N=A[R].sort(function(O,z){return O.t-z.t}),B=0,M=0;M<N.length;M++)k=N[M],V={ease:k.e,duration:(k.t-(M?N[M-1].t:0))/100*l},V[R]=k.v,S.to(w,V,B),B+=V.duration;S.duration()<l&&S.to({},{duration:l-S.duration()})}}l||o.duration(l=S.duration())}else o.timeline=0;return f===!0&&!yc&&(Di=hi(o),vt.killTweensOf(w),Di=0),qn(y,hi(o),s),i.reversed&&o.reverse(),i.paused&&o.paused(!0),(h||!l&&!_&&o._start===xt(y._time)&&un(h)&&Qp(hi(o))&&y.data!=="nested")&&(o._tTime=-ft,o.render(Math.max(0,-u)||0)),m&&Vh(hi(o),m),o}var t=e.prototype;return t.render=function(i,s,a){var o=this._time,c=this._tDur,l=this._dur,u=i<0,h=i>c-ft&&!u?c:i<ft?0:i,d,f,_,g,m,p,y,w,S;if(!l)em(this,i,s,a);else if(h!==this._tTime||!i||a||!this._initted&&this._tTime||this._startAt&&this._zTime<0!==u||this._lazy){if(d=h,w=this.timeline,this._repeat){if(g=l+this._rDelay,this._repeat<-1&&u)return this.totalTime(g*100+i,s,a);if(d=xt(h%g),h===c?(_=this._repeat,d=l):(m=xt(h/g),_=~~m,_&&_===m?(d=l,_--):d>l&&(d=l)),p=this._yoyo&&_&1,p&&(S=this._yEase,d=l-d),m=qr(this._tTime,g),d===o&&!a&&this._initted&&_===m)return this._tTime=h,this;_!==m&&(w&&this._yEase&&td(w,p),this.vars.repeatRefresh&&!p&&!this._lock&&d!==g&&this._initted&&(this._lock=a=1,this.render(xt(g*_),!0).invalidate()._lock=0))}if(!this._initted){if(Gh(this,u?i:d,a,s,h))return this._tTime=0,this;if(o!==this._time&&!(a&&this.vars.repeatRefresh&&_!==m))return this;if(l!==this._dur)return this.render(i,s,a)}if(this._tTime=h,this._time=d,!this._act&&this._ts&&(this._act=1,this._lazy=0),this.ratio=y=(S||this._ease)(d/l),this._from&&(this.ratio=y=1-y),!o&&h&&!s&&!m&&(_n(this,"onStart"),this._tTime!==h))return this;for(f=this._pt;f;)f.r(y,f.d),f=f._next;w&&w.render(i<0?i:w._dur*w._ease(d/this._dur),s,a)||this._startAt&&(this._zTime=i),this._onUpdate&&!s&&(u&&fc(this,i,s,a),_n(this,"onUpdate")),this._repeat&&_!==m&&this.vars.onRepeat&&!s&&this.parent&&_n(this,"onRepeat"),(h===this._tDur||!h)&&this._tTime===h&&(u&&!this._onUpdate&&fc(this,i,!0,!0),(i||!l)&&(h===this._tDur&&this._ts>0||!h&&this._ts<0)&&Fi(this,1),!s&&!(u&&!o)&&(h||o||p)&&(_n(this,h===c?"onComplete":"onReverseComplete",!0),this._prom&&!(h<c&&this.timeScale()>0)&&this._prom()))}return this},t.targets=function(){return this._targets},t.invalidate=function(i){return(!i||!this.vars.runBackwards)&&(this._startAt=0),this._pt=this._op=this._onUpdate=this._lazy=this.ratio=0,this._ptLookup=[],this.timeline&&this.timeline.invalidate(i),r.prototype.invalidate.call(this,i)},t.resetTo=function(i,s,a,o,c){Ys||cn.wake(),this._ts||this.play();var l=Math.min(this._dur,(this._dp._time-this._start)*this._ts),u;return this._initted||Nc(this,l),u=this._ease(l/this._dur),vm(this,i,s,a,o,u,l,c)?this.resetTo(i,s,a,o,1):(Za(this,0),this.parent||kh(this._dp,this,"_first","_last",this._dp._sort?"_start":0),this.render(0))},t.kill=function(i,s){if(s===void 0&&(s="all"),!i&&(!s||s==="all"))return this._lazy=this._pt=0,this.parent?zs(this):this.scrollTrigger&&this.scrollTrigger.kill(!!Vt),this;if(this.timeline){var a=this.timeline.totalDuration();return this.timeline.killTweensOf(i,s,Di&&Di.vars.overwrite!==!0)._first||zs(this),this.parent&&a!==this.timeline.totalDuration()&&Yr(this,this._dur*this.timeline._tDur/a,0,1),this}var o=this._targets,c=i?Rn(i):o,l=this._ptLookup,u=this._pt,h,d,f,_,g,m,p;if((!s||s==="all")&&$p(o,c))return s==="all"&&(this._pt=0),zs(this);for(h=this._op=this._op||[],s!=="all"&&(Ct(s)&&(g={},jt(s,function(y){return g[y]=1}),s=g),s=ym(o,s)),p=o.length;p--;)if(~c.indexOf(o[p])){d=l[p],s==="all"?(h[p]=s,_=d,f={}):(f=h[p]=h[p]||{},_=s);for(g in _)m=d&&d[g],m&&((!("kill"in m.d)||m.d.kill(g)===!0)&&qa(this,m,"_pt"),delete d[g]),f!=="all"&&(f[g]=1)}return this._initted&&!this._pt&&u&&zs(this),this},e.to=function(i,s){return new e(i,s,arguments[2])},e.from=function(i,s){return Hs(1,arguments)},e.delayedCall=function(i,s,a,o){return new e(s,0,{immediateRender:!1,lazy:!1,overwrite:!1,delay:i,onComplete:s,onReverseComplete:s,onCompleteParams:a,onReverseCompleteParams:a,callbackScope:o})},e.fromTo=function(i,s,a){return Hs(2,arguments)},e.set=function(i,s){return s.duration=0,s.repeatDelay||(s.repeat=0),new e(i,s)},e.killTweensOf=function(i,s,a){return vt.killTweensOf(i,s,a)},e})(Zs);vn(wt.prototype,{_targets:[],_lazy:0,_startAt:0,_op:0,_onInit:0});jt("staggerTo,staggerFrom,staggerFromTo",function(r){wt[r]=function(){var e=new zt,t=mc.call(arguments,0);return t.splice(r==="staggerFromTo"?5:4,0,0),e[r].apply(e,t)}});var Fc=function(e,t,n){return e[t]=n},sd=function(e,t,n){return e[t](n)},Mm=function(e,t,n,i){return e[t](i.fp,n)},Sm=function(e,t,n){return e.setAttribute(t,n)},Ja=function(e,t){return bt(e[t])?sd:Wa(e[t])&&e.setAttribute?Sm:Fc},ad=function(e,t){return t.set(t.t,t.p,Math.round((t.s+t.c*e)*1e6)/1e6,t)},wm=function(e,t){return t.set(t.t,t.p,!!(t.s+t.c*e),t)},Uc=function(e,t){var n=t._pt,i="";if(!e&&t.b)i=t.b;else if(e===1&&t.e)i=t.e;else{for(;n;)i=n.p+(n.m?n.m(n.s+n.c*e):Math.round((n.s+n.c*e)*1e4)/1e4)+i,n=n._next;i+=t.c}t.set(t.t,t.p,i,t)},Oc=function(e,t){for(var n=t._pt;n;)n.r(e,n.d),n=n._next},Tm=function(e,t,n,i){for(var s=this._pt,a;s;)a=s._next,s.p===i&&s.modifier(e,t,n),s=a},Am=function(e){for(var t=this._pt,n,i;t;)i=t._next,t.p===e&&!t.op||t.op===e?qa(this,t,"_pt"):t.dep||(n=1),t=i;return!n},Em=function(e,t,n,i){i.mSet(e,t,i.m.call(i.tween,n,i.mt),i)},Bc=function(e){for(var t=e._pt,n,i,s,a;t;){for(n=t._next,i=s;i&&i.pr>t.pr;)i=i._next;(t._prev=i?i._prev:a)?t._prev._next=t:s=t,(t._next=i)?i._prev=t:a=t,t=n}e._pt=s},en=(function(){function r(t,n,i,s,a,o,c,l,u){this.t=n,this.s=s,this.c=a,this.p=i,this.r=o||ad,this.d=c||this,this.set=l||Fc,this.pr=u||0,this._next=t,t&&(t._prev=this)}var e=r.prototype;return e.modifier=function(n,i,s){this.mSet=this.mSet||this.set,this.set=Em,this.m=n,this.mt=s,this.tween=i},r})();jt(Ac+"parent,duration,ease,delay,overwrite,runBackwards,startAt,yoyo,immediateRender,repeat,repeatDelay,data,paused,reversed,lazy,callbackScope,stringFilter,id,yoyoEase,stagger,inherit,repeatRefresh,keyframes,autoRevert,scrollTrigger",function(r){return Tc[r]=1});xn.TweenMax=xn.TweenLite=wt;xn.TimelineLite=xn.TimelineMax=zt;vt=new zt({sortChildren:!1,defaults:Wr,autoRemoveChildren:!0,id:"root",smoothChildTiming:!0});hn.stringFilter=Pc;var dr=[],Ba={},Cm=[],Ch=0,Rm=0,lc=function(e){return(Ba[e]||Cm).map(function(t){return t()})},vc=function(){var e=Date.now(),t=[];e-Ch>2&&(lc("matchMediaInit"),dr.forEach(function(n){var i=n.queries,s=n.conditions,a,o,c,l;for(o in i)a=Xn.matchMedia(i[o]).matches,a&&(c=1),a!==s[o]&&(s[o]=a,l=1);l&&(n.revert(),c&&t.push(n))}),lc("matchMediaRevert"),t.forEach(function(n){return n.onMatch(n,function(i){return n.add(null,i)})}),Ch=e,lc("matchMedia"))},od=(function(){function r(t,n){this.selector=n&&gc(n),this.data=[],this._r=[],this.isReverted=!1,this.id=Rm++,t&&this.add(t)}var e=r.prototype;return e.add=function(n,i,s){bt(n)&&(s=i,i=n,n=bt);var a=this,o=function(){var l=_t,u=a.selector,h;return l&&l!==a&&l.data.push(a),s&&(a.selector=gc(s)),_t=a,h=i.apply(a,arguments),bt(h)&&a._r.push(h),_t=l,a.selector=u,a.isReverted=!1,h};return a.last=o,n===bt?o(a,function(c){return a.add(null,c)}):n?a[n]=o:o},e.ignore=function(n){var i=_t;_t=null,n(this),_t=i},e.getTweens=function(){var n=[];return this.data.forEach(function(i){return i instanceof r?n.push.apply(n,i.getTweens()):i instanceof wt&&!(i.parent&&i.parent.data==="nested")&&n.push(i)}),n},e.clear=function(){this._r.length=this.data.length=0},e.kill=function(n,i){var s=this;if(n?(function(){for(var o=s.getTweens(),c=s.data.length,l;c--;)l=s.data[c],l.data==="isFlip"&&(l.revert(),l.getChildren(!0,!0,!1).forEach(function(u){return o.splice(o.indexOf(u),1)}));for(o.map(function(u){return{g:u._dur||u._delay||u._sat&&!u._sat.vars.immediateRender?u.globalTime(0):-1/0,t:u}}).sort(function(u,h){return h.g-u.g||-1/0}).forEach(function(u){return u.t.revert(n)}),c=s.data.length;c--;)l=s.data[c],l instanceof zt?l.data!=="nested"&&(l.scrollTrigger&&l.scrollTrigger.revert(),l.kill()):!(l instanceof wt)&&l.revert&&l.revert(n);s._r.forEach(function(u){return u(n,s)}),s.isReverted=!0})():this.data.forEach(function(o){return o.kill&&o.kill()}),this.clear(),i)for(var a=dr.length;a--;)dr[a].id===this.id&&dr.splice(a,1)},e.revert=function(n){this.kill(n||{})},r})(),Pm=(function(){function r(t){this.contexts=[],this.scope=t,_t&&_t.data.push(this)}var e=r.prototype;return e.add=function(n,i,s){Yn(n)||(n={matches:n});var a=new od(0,s||this.scope),o=a.conditions={},c,l,u;_t&&!a.selector&&(a.selector=_t.selector),this.contexts.push(a),i=a.add("onMatch",i),a.queries=n;for(l in n)l==="all"?u=1:(c=Xn.matchMedia(n[l]),c&&(dr.indexOf(a)<0&&dr.push(a),(o[l]=c.matches)&&(u=1),c.addListener?c.addListener(vc):c.addEventListener("change",vc)));return u&&i(a,function(h){return a.add(null,h)}),this},e.revert=function(n){this.kill(n||{})},e.kill=function(n){this.contexts.forEach(function(i){return i.kill(n,!0)})},r})(),Ha={registerPlugin:function(){for(var e=arguments.length,t=new Array(e),n=0;n<e;n++)t[n]=arguments[n];t.forEach(function(i){return Kh(i)})},timeline:function(e){return new zt(e)},getTweensOf:function(e,t){return vt.getTweensOf(e,t)},getProperty:function(e,t,n,i){Ct(e)&&(e=Rn(e)[0]);var s=Ni(e||{}).get,a=n?Bh:Oh;return n==="native"&&(n=""),e&&(t?a((ln[t]&&ln[t].get||s)(e,t,n,i)):function(o,c,l){return a((ln[o]&&ln[o].get||s)(e,o,c,l))})},quickSetter:function(e,t,n){if(e=Rn(e),e.length>1){var i=e.map(function(u){return Xt.quickSetter(u,t,n)}),s=i.length;return function(u){for(var h=s;h--;)i[h](u)}}e=e[0]||{};var a=ln[t],o=Ni(e),c=o.harness&&(o.harness.aliases||{})[t]||t,l=a?function(u){var h=new a;Hr._pt=0,h.init(e,n?u+n:u,Hr,0,[e]),h.render(1,h),Hr._pt&&Oc(1,Hr)}:o.set(e,c);return a?l:function(u){return l(e,c,n?u+n:u,o,1)}},quickTo:function(e,t,n){var i,s=Xt.to(e,vn((i={},i[t]="+=0.1",i.paused=!0,i.stagger=0,i),n||{})),a=function(c,l,u){return s.resetTo(t,c,l,u)};return a.tween=s,a},isTweening:function(e){return vt.getTweensOf(e,!0).length>0},defaults:function(e){return e&&e.ease&&(e.ease=hr(e.ease,Wr.ease)),Sh(Wr,e||{})},config:function(e){return Sh(hn,e||{})},registerEffect:function(e){var t=e.name,n=e.effect,i=e.plugins,s=e.defaults,a=e.extendTimeline;(i||"").split(",").forEach(function(o){return o&&!ln[o]&&!xn[o]&&Xs(t+" effect requires "+o+" plugin.")}),rc[t]=function(o,c,l){return n(Rn(o),vn(c||{},s),l)},a&&(zt.prototype[t]=function(o,c,l){return this.add(rc[t](o,Yn(c)?c:(l=c)&&{},this),l)})},registerEase:function(e,t){Qe[e]=hr(t)},parseEase:function(e,t){return arguments.length?hr(e,t):Qe},getById:function(e){return vt.getById(e)},exportRoot:function(e,t){e===void 0&&(e={});var n=new zt(e),i,s;for(n.smoothChildTiming=un(e.smoothChildTiming),vt.remove(n),n._dp=0,n._time=n._tTime=vt._time,i=vt._first;i;)s=i._next,(t||!(!i._dur&&i instanceof wt&&i.vars.onComplete===i._targets[0]))&&qn(n,i,i._start-i._delay),i=s;return qn(vt,n,0),n},context:function(e,t){return e?new od(e,t):_t},matchMedia:function(e){return new Pm(e)},matchMediaRefresh:function(){return dr.forEach(function(e){var t=e.conditions,n,i;for(i in t)t[i]&&(t[i]=!1,n=1);n&&e.revert()})||vc()},addEventListener:function(e,t){var n=Ba[e]||(Ba[e]=[]);~n.indexOf(t)||n.push(t)},removeEventListener:function(e,t){var n=Ba[e],i=n&&n.indexOf(t);i>=0&&n.splice(i,1)},utils:{wrap:lm,wrapYoyo:cm,distribute:Xh,random:Yh,snap:qh,normalize:om,getUnit:Gt,clamp:im,splitColor:Qh,toArray:Rn,selector:gc,mapRange:Jh,pipe:sm,unitize:am,interpolate:um,shuffle:Wh},install:Lh,effects:rc,ticker:cn,updateRoot:zt.updateRoot,plugins:ln,globalTimeline:vt,core:{PropTween:en,globals:Nh,Tween:wt,Timeline:zt,Animation:Zs,getCache:Ni,_removeLinkedListItem:qa,reverting:function(){return Vt},context:function(e){return e&&_t&&(_t.data.push(e),e._ctx=_t),_t},suppressOverwrites:function(e){return yc=e}}};jt("to,from,fromTo,delayedCall,set,killTweensOf",function(r){return Ha[r]=wt[r]});cn.add(zt.updateRoot);Hr=Ha.to({},{duration:0});var Im=function(e,t){for(var n=e._pt;n&&n.p!==t&&n.op!==t&&n.fp!==t;)n=n._next;return n},Dm=function(e,t){var n=e._targets,i,s,a;for(i in t)for(s=n.length;s--;)a=e._ptLookup[s][i],a&&(a=a.d)&&(a._pt&&(a=Im(a,i)),a&&a.modifier&&a.modifier(t[i],e,n[s],i))},cc=function(e,t){return{name:e,headless:1,rawVars:1,init:function(i,s,a){a._onInit=function(o){var c,l;if(Ct(s)&&(c={},jt(s,function(u){return c[u]=1}),s=c),t){c={};for(l in s)c[l]=t(s[l]);s=c}Dm(o,s)}}}},Xt=Ha.registerPlugin({name:"attr",init:function(e,t,n,i,s){var a,o,c;this.tween=n;for(a in t)c=e.getAttribute(a)||"",o=this.add(e,"setAttribute",(c||0)+"",t[a],i,s,0,0,a),o.op=a,o.b=c,this._props.push(a)},render:function(e,t){for(var n=t._pt;n;)Vt?n.set(n.t,n.p,n.b,n):n.r(e,n.d),n=n._next}},{name:"endArray",headless:1,init:function(e,t){for(var n=t.length;n--;)this.add(e,n,e[n]||0,t[n],0,0,0,0,0,1)}},cc("roundProps",_c),cc("modifiers"),cc("snap",qh))||Ha;wt.version=zt.version=Xt.version="3.14.2";Dh=1;bc()&&Zr();var Lm=Qe.Power0,Nm=Qe.Power1,Fm=Qe.Power2,Um=Qe.Power3,Om=Qe.Power4,Bm=Qe.Linear,km=Qe.Quad,zm=Qe.Cubic,Vm=Qe.Quart,Gm=Qe.Quint,Hm=Qe.Strong,Wm=Qe.Elastic,Xm=Qe.Back,qm=Qe.SteppedEase,Ym=Qe.Bounce,Zm=Qe.Sine,Jm=Qe.Expo,$m=Qe.Circ;var ld,Oi,Kr,Wc,vr,Km,cd,Xc,Qm=function(){return typeof window<"u"},mi={},xr=180/Math.PI,Qr=Math.PI/180,$r=Math.atan2,ud=1e8,qc=/([A-Z])/g,jm=/(left|right|width|margin|padding|x)/i,eg=/[\s,\(]\S/,Zn={autoAlpha:"opacity,visibility",scale:"scaleX,scaleY",alpha:"opacity"},zc=function(e,t){return t.set(t.t,t.p,Math.round((t.s+t.c*e)*1e4)/1e4+t.u,t)},tg=function(e,t){return t.set(t.t,t.p,e===1?t.e:Math.round((t.s+t.c*e)*1e4)/1e4+t.u,t)},ng=function(e,t){return t.set(t.t,t.p,e?Math.round((t.s+t.c*e)*1e4)/1e4+t.u:t.b,t)},ig=function(e,t){return t.set(t.t,t.p,e===1?t.e:e?Math.round((t.s+t.c*e)*1e4)/1e4+t.u:t.b,t)},rg=function(e,t){var n=t.s+t.c*e;t.set(t.t,t.p,~~(n+(n<0?-.5:.5))+t.u,t)},xd=function(e,t){return t.set(t.t,t.p,e?t.e:t.b,t)},vd=function(e,t){return t.set(t.t,t.p,e!==1?t.b:t.e,t)},sg=function(e,t,n){return e.style[t]=n},ag=function(e,t,n){return e.style.setProperty(t,n)},og=function(e,t,n){return e._gsap[t]=n},lg=function(e,t,n){return e._gsap.scaleX=e._gsap.scaleY=n},cg=function(e,t,n,i,s){var a=e._gsap;a.scaleX=a.scaleY=n,a.renderTransform(s,a)},ug=function(e,t,n,i,s){var a=e._gsap;a[t]=n,a.renderTransform(s,a)},yt="transform",dn=yt+"Origin",hg=function r(e,t){var n=this,i=this.target,s=i.style,a=i._gsap;if(e in mi&&s){if(this.tfm=this.tfm||{},e!=="transform")e=Zn[e]||e,~e.indexOf(",")?e.split(",").forEach(function(o){return n.tfm[o]=pi(i,o)}):this.tfm[e]=a.x?a[e]:pi(i,e),e===dn&&(this.tfm.zOrigin=a.zOrigin);else return Zn.transform.split(",").forEach(function(o){return r.call(n,o,t)});if(this.props.indexOf(yt)>=0)return;a.svg&&(this.svgo=i.getAttribute("data-svg-origin"),this.props.push(dn,t,"")),e=yt}(s||t)&&this.props.push(e,t,s[e])},yd=function(e){e.translate&&(e.removeProperty("translate"),e.removeProperty("scale"),e.removeProperty("rotate"))},dg=function(){var e=this.props,t=this.target,n=t.style,i=t._gsap,s,a;for(s=0;s<e.length;s+=3)e[s+1]?e[s+1]===2?t[e[s]](e[s+2]):t[e[s]]=e[s+2]:e[s+2]?n[e[s]]=e[s+2]:n.removeProperty(e[s].substr(0,2)==="--"?e[s]:e[s].replace(qc,"-$1").toLowerCase());if(this.tfm){for(a in this.tfm)i[a]=this.tfm[a];i.svg&&(i.renderTransform(),t.setAttribute("data-svg-origin",this.svgo||"")),s=Xc(),(!s||!s.isStart)&&!n[yt]&&(yd(n),i.zOrigin&&n[dn]&&(n[dn]+=" "+i.zOrigin+"px",i.zOrigin=0,i.renderTransform()),i.uncache=1)}},bd=function(e,t){var n={target:e,props:[],revert:dg,save:hg};return e._gsap||Xt.core.getCache(e),t&&e.style&&e.nodeType&&t.split(",").forEach(function(i){return n.save(i)}),n},Md,Vc=function(e,t){var n=Oi.createElementNS?Oi.createElementNS((t||"http://www.w3.org/1999/xhtml").replace(/^https/,"http"),e):Oi.createElement(e);return n&&n.style?n:Oi.createElement(e)},yn=function r(e,t,n){var i=getComputedStyle(e);return i[t]||i.getPropertyValue(t.replace(qc,"-$1").toLowerCase())||i.getPropertyValue(t)||!n&&r(e,jr(t)||t,1)||""},hd="O,Moz,ms,Ms,Webkit".split(","),jr=function(e,t,n){var i=t||vr,s=i.style,a=5;if(e in s&&!n)return e;for(e=e.charAt(0).toUpperCase()+e.substr(1);a--&&!(hd[a]+e in s););return a<0?null:(a===3?"ms":a>=0?hd[a]:"")+e},Gc=function(){Qm()&&window.document&&(ld=window,Oi=ld.document,Kr=Oi.documentElement,vr=Vc("div")||{style:{}},Km=Vc("div"),yt=jr(yt),dn=yt+"Origin",vr.style.cssText="border-width:0;line-height:0;position:absolute;padding:0",Md=!!jr("perspective"),Xc=Xt.core.reverting,Wc=1)},dd=function(e){var t=e.ownerSVGElement,n=Vc("svg",t&&t.getAttribute("xmlns")||"http://www.w3.org/2000/svg"),i=e.cloneNode(!0),s;i.style.display="block",n.appendChild(i),Kr.appendChild(n);try{s=i.getBBox()}catch{}return n.removeChild(i),Kr.removeChild(n),s},fd=function(e,t){for(var n=t.length;n--;)if(e.hasAttribute(t[n]))return e.getAttribute(t[n])},Sd=function(e){var t,n;try{t=e.getBBox()}catch{t=dd(e),n=1}return t&&(t.width||t.height)||n||(t=dd(e)),t&&!t.width&&!t.x&&!t.y?{x:+fd(e,["x","cx","x1"])||0,y:+fd(e,["y","cy","y1"])||0,width:0,height:0}:t},wd=function(e){return!!(e.getCTM&&(!e.parentNode||e.ownerSVGElement)&&Sd(e))},ki=function(e,t){if(t){var n=e.style,i;t in mi&&t!==dn&&(t=yt),n.removeProperty?(i=t.substr(0,2),(i==="ms"||t.substr(0,6)==="webkit")&&(t="-"+t),n.removeProperty(i==="--"?t:t.replace(qc,"-$1").toLowerCase())):n.removeAttribute(t)}},Bi=function(e,t,n,i,s,a){var o=new en(e._pt,t,n,0,1,a?vd:xd);return e._pt=o,o.b=i,o.e=s,e._props.push(n),o},pd={deg:1,rad:1,turn:1},fg={grid:1,flex:1},zi=function r(e,t,n,i){var s=parseFloat(n)||0,a=(n+"").trim().substr((s+"").length)||"px",o=vr.style,c=jm.test(t),l=e.tagName.toLowerCase()==="svg",u=(l?"client":"offset")+(c?"Width":"Height"),h=100,d=i==="px",f=i==="%",_,g,m,p;if(i===a||!s||pd[i]||pd[a])return s;if(a!=="px"&&!d&&(s=r(e,t,n,"px")),p=e.getCTM&&wd(e),(f||a==="%")&&(mi[t]||~t.indexOf("adius")))return _=p?e.getBBox()[c?"width":"height"]:e[u],Mt(f?s/_*h:s/100*_);if(o[c?"width":"height"]=h+(d?a:i),g=i!=="rem"&&~t.indexOf("adius")||i==="em"&&e.appendChild&&!l?e:e.parentNode,p&&(g=(e.ownerSVGElement||{}).parentNode),(!g||g===Oi||!g.appendChild)&&(g=Oi.body),m=g._gsap,m&&f&&m.width&&c&&m.time===cn.time&&!m.uncache)return Mt(s/m.width*h);if(f&&(t==="height"||t==="width")){var y=e.style[t];e.style[t]=h+i,_=e[u],y?e.style[t]=y:ki(e,t)}else(f||a==="%")&&!fg[yn(g,"display")]&&(o.position=yn(e,"position")),g===e&&(o.position="static"),g.appendChild(vr),_=vr[u],g.removeChild(vr),o.position="absolute";return c&&f&&(m=Ni(g),m.time=cn.time,m.width=g[u]),Mt(d?_*s/h:_&&s?h/_*s:0)},pi=function(e,t,n,i){var s;return Wc||Gc(),t in Zn&&t!=="transform"&&(t=Zn[t],~t.indexOf(",")&&(t=t.split(",")[0])),mi[t]&&t!=="transform"?(s=Qs(e,i),s=t!=="transformOrigin"?s[t]:s.svg?s.origin:Ka(yn(e,dn))+" "+s.zOrigin+"px"):(s=e.style[t],(!s||s==="auto"||i||~(s+"").indexOf("calc("))&&(s=$a[t]&&$a[t](e,t,n)||yn(e,t)||Cc(e,t)||(t==="opacity"?1:0))),n&&!~(s+"").trim().indexOf(" ")?zi(e,t,s,n)+n:s},pg=function(e,t,n,i){if(!n||n==="none"){var s=jr(t,e,1),a=s&&yn(e,s,1);a&&a!==n?(t=s,n=a):t==="borderColor"&&(n=yn(e,"borderTopColor"))}var o=new en(this._pt,e.style,t,0,1,Uc),c=0,l=0,u,h,d,f,_,g,m,p,y,w,S,M;if(o.b=n,o.e=i,n+="",i+="",i.substring(0,6)==="var(--"&&(i=yn(e,i.substring(4,i.indexOf(")")))),i==="auto"&&(g=e.style[t],e.style[t]=i,i=yn(e,t)||i,g?e.style[t]=g:ki(e,t)),u=[n,i],Pc(u),n=u[0],i=u[1],d=n.match(fr)||[],M=i.match(fr)||[],M.length){for(;h=fr.exec(i);)m=h[0],y=i.substring(c,h.index),_?_=(_+1)%5:(y.substr(-5)==="rgba("||y.substr(-5)==="hsla(")&&(_=1),m!==(g=d[l++]||"")&&(f=parseFloat(g)||0,S=g.substr((f+"").length),m.charAt(1)==="="&&(m=pr(f,m)+S),p=parseFloat(m),w=m.substr((p+"").length),c=fr.lastIndex-w.length,w||(w=w||hn.units[t]||S,c===i.length&&(i+=w,o.e+=w)),S!==w&&(f=zi(e,t,g,w)||0),o._pt={_next:o._pt,p:y||l===1?y:",",s:f,c:p-f,m:_&&_<4||t==="zIndex"?Math.round:0});o.c=c<i.length?i.substring(c,i.length):""}else o.r=t==="display"&&i==="none"?vd:xd;return Sc.test(i)&&(o.e=0),this._pt=o,o},md={top:"0%",bottom:"100%",left:"0%",right:"100%",center:"50%"},mg=function(e){var t=e.split(" "),n=t[0],i=t[1]||"50%";return(n==="top"||n==="bottom"||i==="left"||i==="right")&&(e=n,n=i,i=e),t[0]=md[n]||n,t[1]=md[i]||i,t.join(" ")},gg=function(e,t){if(t.tween&&t.tween._time===t.tween._dur){var n=t.t,i=n.style,s=t.u,a=n._gsap,o,c,l;if(s==="all"||s===!0)i.cssText="",c=1;else for(s=s.split(","),l=s.length;--l>-1;)o=s[l],mi[o]&&(c=1,o=o==="transformOrigin"?dn:yt),ki(n,o);c&&(ki(n,yt),a&&(a.svg&&n.removeAttribute("transform"),i.scale=i.rotate=i.translate="none",Qs(n,1),a.uncache=1,yd(i)))}},$a={clearProps:function(e,t,n,i,s){if(s.data!=="isFromStart"){var a=e._pt=new en(e._pt,t,n,0,0,gg);return a.u=i,a.pr=-10,a.tween=s,e._props.push(n),1}}},Ks=[1,0,0,1,0,0],Td={},Ad=function(e){return e==="matrix(1, 0, 0, 1, 0, 0)"||e==="none"||!e},gd=function(e){var t=yn(e,yt);return Ad(t)?Ks:t.substr(7).match(Mc).map(Mt)},Yc=function(e,t){var n=e._gsap||Ni(e),i=e.style,s=gd(e),a,o,c,l;return n.svg&&e.getAttribute("transform")?(c=e.transform.baseVal.consolidate().matrix,s=[c.a,c.b,c.c,c.d,c.e,c.f],s.join(",")==="1,0,0,1,0,0"?Ks:s):(s===Ks&&!e.offsetParent&&e!==Kr&&!n.svg&&(c=i.display,i.display="block",a=e.parentNode,(!a||!e.offsetParent&&!e.getBoundingClientRect().width)&&(l=1,o=e.nextElementSibling,Kr.appendChild(e)),s=gd(e),c?i.display=c:ki(e,"display"),l&&(o?a.insertBefore(e,o):a?a.appendChild(e):Kr.removeChild(e))),t&&s.length>6?[s[0],s[1],s[4],s[5],s[12],s[13]]:s)},Hc=function(e,t,n,i,s,a){var o=e._gsap,c=s||Yc(e,!0),l=o.xOrigin||0,u=o.yOrigin||0,h=o.xOffset||0,d=o.yOffset||0,f=c[0],_=c[1],g=c[2],m=c[3],p=c[4],y=c[5],w=t.split(" "),S=parseFloat(w[0])||0,M=parseFloat(w[1])||0,A,E,R,x;n?c!==Ks&&(E=f*m-_*g)&&(R=S*(m/E)+M*(-g/E)+(g*y-m*p)/E,x=S*(-_/E)+M*(f/E)-(f*y-_*p)/E,S=R,M=x):(A=Sd(e),S=A.x+(~w[0].indexOf("%")?S/100*A.width:S),M=A.y+(~(w[1]||w[0]).indexOf("%")?M/100*A.height:M)),i||i!==!1&&o.smooth?(p=S-l,y=M-u,o.xOffset=h+(p*f+y*g)-p,o.yOffset=d+(p*_+y*m)-y):o.xOffset=o.yOffset=0,o.xOrigin=S,o.yOrigin=M,o.smooth=!!i,o.origin=t,o.originIsAbsolute=!!n,e.style[dn]="0px 0px",a&&(Bi(a,o,"xOrigin",l,S),Bi(a,o,"yOrigin",u,M),Bi(a,o,"xOffset",h,o.xOffset),Bi(a,o,"yOffset",d,o.yOffset)),e.setAttribute("data-svg-origin",S+" "+M)},Qs=function(e,t){var n=e._gsap||new Ic(e);if("x"in n&&!t&&!n.uncache)return n;var i=e.style,s=n.scaleX<0,a="px",o="deg",c=getComputedStyle(e),l=yn(e,dn)||"0",u,h,d,f,_,g,m,p,y,w,S,M,A,E,R,x,T,I,B,N,k,V,O,z,$,ce,q,ie,Re,Ue,ke,Oe;return u=h=d=g=m=p=y=w=S=0,f=_=1,n.svg=!!(e.getCTM&&wd(e)),c.translate&&((c.translate!=="none"||c.scale!=="none"||c.rotate!=="none")&&(i[yt]=(c.translate!=="none"?"translate3d("+(c.translate+" 0 0").split(" ").slice(0,3).join(", ")+") ":"")+(c.rotate!=="none"?"rotate("+c.rotate+") ":"")+(c.scale!=="none"?"scale("+c.scale.split(" ").join(",")+") ":"")+(c[yt]!=="none"?c[yt]:"")),i.scale=i.rotate=i.translate="none"),E=Yc(e,n.svg),n.svg&&(n.uncache?($=e.getBBox(),l=n.xOrigin-$.x+"px "+(n.yOrigin-$.y)+"px",z=""):z=!t&&e.getAttribute("data-svg-origin"),Hc(e,z||l,!!z||n.originIsAbsolute,n.smooth!==!1,E)),M=n.xOrigin||0,A=n.yOrigin||0,E!==Ks&&(I=E[0],B=E[1],N=E[2],k=E[3],u=V=E[4],h=O=E[5],E.length===6?(f=Math.sqrt(I*I+B*B),_=Math.sqrt(k*k+N*N),g=I||B?$r(B,I)*xr:0,y=N||k?$r(N,k)*xr+g:0,y&&(_*=Math.abs(Math.cos(y*Qr))),n.svg&&(u-=M-(M*I+A*N),h-=A-(M*B+A*k))):(Oe=E[6],Ue=E[7],q=E[8],ie=E[9],Re=E[10],ke=E[11],u=E[12],h=E[13],d=E[14],R=$r(Oe,Re),m=R*xr,R&&(x=Math.cos(-R),T=Math.sin(-R),z=V*x+q*T,$=O*x+ie*T,ce=Oe*x+Re*T,q=V*-T+q*x,ie=O*-T+ie*x,Re=Oe*-T+Re*x,ke=Ue*-T+ke*x,V=z,O=$,Oe=ce),R=$r(-N,Re),p=R*xr,R&&(x=Math.cos(-R),T=Math.sin(-R),z=I*x-q*T,$=B*x-ie*T,ce=N*x-Re*T,ke=k*T+ke*x,I=z,B=$,N=ce),R=$r(B,I),g=R*xr,R&&(x=Math.cos(R),T=Math.sin(R),z=I*x+B*T,$=V*x+O*T,B=B*x-I*T,O=O*x-V*T,I=z,V=$),m&&Math.abs(m)+Math.abs(g)>359.9&&(m=g=0,p=180-p),f=Mt(Math.sqrt(I*I+B*B+N*N)),_=Mt(Math.sqrt(O*O+Oe*Oe)),R=$r(V,O),y=Math.abs(R)>2e-4?R*xr:0,S=ke?1/(ke<0?-ke:ke):0),n.svg&&(z=e.getAttribute("transform"),n.forceCSS=e.setAttribute("transform","")||!Ad(yn(e,yt)),z&&e.setAttribute("transform",z))),Math.abs(y)>90&&Math.abs(y)<270&&(s?(f*=-1,y+=g<=0?180:-180,g+=g<=0?180:-180):(_*=-1,y+=y<=0?180:-180)),t=t||n.uncache,n.x=u-((n.xPercent=u&&(!t&&n.xPercent||(Math.round(e.offsetWidth/2)===Math.round(-u)?-50:0)))?e.offsetWidth*n.xPercent/100:0)+a,n.y=h-((n.yPercent=h&&(!t&&n.yPercent||(Math.round(e.offsetHeight/2)===Math.round(-h)?-50:0)))?e.offsetHeight*n.yPercent/100:0)+a,n.z=d+a,n.scaleX=Mt(f),n.scaleY=Mt(_),n.rotation=Mt(g)+o,n.rotationX=Mt(m)+o,n.rotationY=Mt(p)+o,n.skewX=y+o,n.skewY=w+o,n.transformPerspective=S+a,(n.zOrigin=parseFloat(l.split(" ")[2])||!t&&n.zOrigin||0)&&(i[dn]=Ka(l)),n.xOffset=n.yOffset=0,n.force3D=hn.force3D,n.renderTransform=n.svg?xg:Md?Ed:_g,n.uncache=0,n},Ka=function(e){return(e=e.split(" "))[0]+" "+e[1]},kc=function(e,t,n){var i=Gt(t);return Mt(parseFloat(t)+parseFloat(zi(e,"x",n+"px",i)))+i},_g=function(e,t){t.z="0px",t.rotationY=t.rotationX="0deg",t.force3D=0,Ed(e,t)},gr="0deg",$s="0px",_r=") ",Ed=function(e,t){var n=t||this,i=n.xPercent,s=n.yPercent,a=n.x,o=n.y,c=n.z,l=n.rotation,u=n.rotationY,h=n.rotationX,d=n.skewX,f=n.skewY,_=n.scaleX,g=n.scaleY,m=n.transformPerspective,p=n.force3D,y=n.target,w=n.zOrigin,S="",M=p==="auto"&&e&&e!==1||p===!0;if(w&&(h!==gr||u!==gr)){var A=parseFloat(u)*Qr,E=Math.sin(A),R=Math.cos(A),x;A=parseFloat(h)*Qr,x=Math.cos(A),a=kc(y,a,E*x*-w),o=kc(y,o,-Math.sin(A)*-w),c=kc(y,c,R*x*-w+w)}m!==$s&&(S+="perspective("+m+_r),(i||s)&&(S+="translate("+i+"%, "+s+"%) "),(M||a!==$s||o!==$s||c!==$s)&&(S+=c!==$s||M?"translate3d("+a+", "+o+", "+c+") ":"translate("+a+", "+o+_r),l!==gr&&(S+="rotate("+l+_r),u!==gr&&(S+="rotateY("+u+_r),h!==gr&&(S+="rotateX("+h+_r),(d!==gr||f!==gr)&&(S+="skew("+d+", "+f+_r),(_!==1||g!==1)&&(S+="scale("+_+", "+g+_r),y.style[yt]=S||"translate(0, 0)"},xg=function(e,t){var n=t||this,i=n.xPercent,s=n.yPercent,a=n.x,o=n.y,c=n.rotation,l=n.skewX,u=n.skewY,h=n.scaleX,d=n.scaleY,f=n.target,_=n.xOrigin,g=n.yOrigin,m=n.xOffset,p=n.yOffset,y=n.forceCSS,w=parseFloat(a),S=parseFloat(o),M,A,E,R,x;c=parseFloat(c),l=parseFloat(l),u=parseFloat(u),u&&(u=parseFloat(u),l+=u,c+=u),c||l?(c*=Qr,l*=Qr,M=Math.cos(c)*h,A=Math.sin(c)*h,E=Math.sin(c-l)*-d,R=Math.cos(c-l)*d,l&&(u*=Qr,x=Math.tan(l-u),x=Math.sqrt(1+x*x),E*=x,R*=x,u&&(x=Math.tan(u),x=Math.sqrt(1+x*x),M*=x,A*=x)),M=Mt(M),A=Mt(A),E=Mt(E),R=Mt(R)):(M=h,R=d,A=E=0),(w&&!~(a+"").indexOf("px")||S&&!~(o+"").indexOf("px"))&&(w=zi(f,"x",a,"px"),S=zi(f,"y",o,"px")),(_||g||m||p)&&(w=Mt(w+_-(_*M+g*E)+m),S=Mt(S+g-(_*A+g*R)+p)),(i||s)&&(x=f.getBBox(),w=Mt(w+i/100*x.width),S=Mt(S+s/100*x.height)),x="matrix("+M+","+A+","+E+","+R+","+w+","+S+")",f.setAttribute("transform",x),y&&(f.style[yt]=x)},vg=function(e,t,n,i,s){var a=360,o=Ct(s),c=parseFloat(s)*(o&&~s.indexOf("rad")?xr:1),l=c-i,u=i+l+"deg",h,d;return o&&(h=s.split("_")[1],h==="short"&&(l%=a,l!==l%(a/2)&&(l+=l<0?a:-a)),h==="cw"&&l<0?l=(l+a*ud)%a-~~(l/a)*a:h==="ccw"&&l>0&&(l=(l-a*ud)%a-~~(l/a)*a)),e._pt=d=new en(e._pt,t,n,i,l,tg),d.e=u,d.u="deg",e._props.push(n),d},_d=function(e,t){for(var n in t)e[n]=t[n];return e},yg=function(e,t,n){var i=_d({},n._gsap),s="perspective,force3D,transformOrigin,svgOrigin",a=n.style,o,c,l,u,h,d,f,_;i.svg?(l=n.getAttribute("transform"),n.setAttribute("transform",""),a[yt]=t,o=Qs(n,1),ki(n,yt),n.setAttribute("transform",l)):(l=getComputedStyle(n)[yt],a[yt]=t,o=Qs(n,1),a[yt]=l);for(c in mi)l=i[c],u=o[c],l!==u&&s.indexOf(c)<0&&(f=Gt(l),_=Gt(u),h=f!==_?zi(n,c,l,_):parseFloat(l),d=parseFloat(u),e._pt=new en(e._pt,o,c,h,d-h,zc),e._pt.u=_||0,e._props.push(c));_d(o,i)};jt("padding,margin,Width,Radius",function(r,e){var t="Top",n="Right",i="Bottom",s="Left",a=(e<3?[t,n,i,s]:[t+s,t+n,i+n,i+s]).map(function(o){return e<2?r+o:"border"+o+r});$a[e>1?"border"+r:r]=function(o,c,l,u,h){var d,f;if(arguments.length<4)return d=a.map(function(_){return pi(o,_,l)}),f=d.join(" "),f.split(d[0]).length===5?d[0]:f;d=(u+"").split(" "),f={},a.forEach(function(_,g){return f[_]=d[g]=d[g]||d[(g-1)/2|0]}),o.init(c,f,h)}});var Zc={name:"css",register:Gc,targetTest:function(e){return e.style&&e.nodeType},init:function(e,t,n,i,s){var a=this._props,o=e.style,c=n.vars.startAt,l,u,h,d,f,_,g,m,p,y,w,S,M,A,E,R,x;Wc||Gc(),this.styles=this.styles||bd(e),R=this.styles.props,this.tween=n;for(g in t)if(g!=="autoRound"&&(u=t[g],!(ln[g]&&Lc(g,t,n,i,e,s)))){if(f=typeof u,_=$a[g],f==="function"&&(u=u.call(n,i,e,s),f=typeof u),f==="string"&&~u.indexOf("random(")&&(u=Jr(u)),_)_(this,e,g,u,n)&&(E=1);else if(g.substr(0,2)==="--")l=(getComputedStyle(e).getPropertyValue(g)+"").trim(),u+="",di.lastIndex=0,di.test(l)||(m=Gt(l),p=Gt(u),p?m!==p&&(l=zi(e,g,l,p)+p):m&&(u+=m)),this.add(o,"setProperty",l,u,i,s,0,0,g),a.push(g),R.push(g,0,o[g]);else if(f!=="undefined"){if(c&&g in c?(l=typeof c[g]=="function"?c[g].call(n,i,e,s):c[g],Ct(l)&&~l.indexOf("random(")&&(l=Jr(l)),Gt(l+"")||l==="auto"||(l+=hn.units[g]||Gt(pi(e,g))||""),(l+"").charAt(1)==="="&&(l=pi(e,g))):l=pi(e,g),d=parseFloat(l),y=f==="string"&&u.charAt(1)==="="&&u.substr(0,2),y&&(u=u.substr(2)),h=parseFloat(u),g in Zn&&(g==="autoAlpha"&&(d===1&&pi(e,"visibility")==="hidden"&&h&&(d=0),R.push("visibility",0,o.visibility),Bi(this,o,"visibility",d?"inherit":"hidden",h?"inherit":"hidden",!h)),g!=="scale"&&g!=="transform"&&(g=Zn[g],~g.indexOf(",")&&(g=g.split(",")[0]))),w=g in mi,w){if(this.styles.save(g),x=u,f==="string"&&u.substring(0,6)==="var(--"){if(u=yn(e,u.substring(4,u.indexOf(")"))),u.substring(0,5)==="calc("){var T=e.style.perspective;e.style.perspective=u,u=yn(e,"perspective"),T?e.style.perspective=T:ki(e,"perspective")}h=parseFloat(u)}if(S||(M=e._gsap,M.renderTransform&&!t.parseTransform||Qs(e,t.parseTransform),A=t.smoothOrigin!==!1&&M.smooth,S=this._pt=new en(this._pt,o,yt,0,1,M.renderTransform,M,0,-1),S.dep=1),g==="scale")this._pt=new en(this._pt,M,"scaleY",M.scaleY,(y?pr(M.scaleY,y+h):h)-M.scaleY||0,zc),this._pt.u=0,a.push("scaleY",g),g+="X";else if(g==="transformOrigin"){R.push(dn,0,o[dn]),u=mg(u),M.svg?Hc(e,u,0,A,0,this):(p=parseFloat(u.split(" ")[2])||0,p!==M.zOrigin&&Bi(this,M,"zOrigin",M.zOrigin,p),Bi(this,o,g,Ka(l),Ka(u)));continue}else if(g==="svgOrigin"){Hc(e,u,1,A,0,this);continue}else if(g in Td){vg(this,M,g,d,y?pr(d,y+u):u);continue}else if(g==="smoothOrigin"){Bi(this,M,"smooth",M.smooth,u);continue}else if(g==="force3D"){M[g]=u;continue}else if(g==="transform"){yg(this,u,e);continue}}else g in o||(g=jr(g)||g);if(w||(h||h===0)&&(d||d===0)&&!eg.test(u)&&g in o)m=(l+"").substr((d+"").length),h||(h=0),p=Gt(u)||(g in hn.units?hn.units[g]:m),m!==p&&(d=zi(e,g,l,p)),this._pt=new en(this._pt,w?M:o,g,d,(y?pr(d,y+h):h)-d,!w&&(p==="px"||g==="zIndex")&&t.autoRound!==!1?rg:zc),this._pt.u=p||0,w&&x!==u?(this._pt.b=l,this._pt.e=x,this._pt.r=ig):m!==p&&p!=="%"&&(this._pt.b=l,this._pt.r=ng);else if(g in o)pg.call(this,e,g,l,y?y+u:u);else if(g in e)this.add(e,g,l||e[g],y?y+u:u,i,s);else if(g!=="parseTransform"){Xa(g,u);continue}w||(g in o?R.push(g,0,o[g]):typeof e[g]=="function"?R.push(g,2,e[g]()):R.push(g,1,l||e[g])),a.push(g)}}E&&Bc(this)},render:function(e,t){if(t.tween._time||!Xc())for(var n=t._pt;n;)n.r(e,n.d),n=n._next;else t.styles.revert()},get:pi,aliases:Zn,getSetter:function(e,t,n){var i=Zn[t];return i&&i.indexOf(",")<0&&(t=i),t in mi&&t!==dn&&(e._gsap.x||pi(e,"x"))?n&&cd===n?t==="scale"?lg:og:(cd=n||{})&&(t==="scale"?cg:ug):e.style&&!Wa(e.style[t])?sg:~t.indexOf("-")?ag:Ja(e,t)},core:{_removeProperty:ki,_getMatrix:Yc}};Xt.utils.checkPrefix=jr;Xt.core.getStyleSaver=bd;(function(r,e,t,n){var i=jt(r+","+e+","+t,function(s){mi[s]=1});jt(e,function(s){hn.units[s]="deg",Td[s]=1}),Zn[i[13]]=r+","+e,jt(n,function(s){var a=s.split(":");Zn[a[1]]=i[a[0]]})})("x,y,z,scale,scaleX,scaleY,xPercent,yPercent","rotation,rotationX,rotationY,skewX,skewY","transform,transformOrigin,svgOrigin,force3D,smoothOrigin,transformPerspective","0:translateX,1:translateY,2:translateZ,8:rotate,8:rotationZ,8:rotateZ,9:rotateX,10:rotateY");jt("x,y,z,top,right,bottom,left,width,height,fontSize,padding,margin,perspective",function(r){hn.units[r]="px"});Xt.registerPlugin(Zc);var Ft=Xt.registerPlugin(Zc)||Xt,Kb=Ft.core.Tween;var Et=Wn("react");var Xd=0,wu=1,qd=2;var xa=1,Yd=2,Ss=3,Mi=0,on=1,ei=2,ti=0,Ar=1,Tu=2,Au=3,Eu=4,Zd=5,Zi=100,Jd=101,$d=102,Kd=103,Qd=104,jd=200,ef=201,tf=202,nf=203,vo=204,yo=205,rf=206,sf=207,af=208,of=209,lf=210,cf=211,uf=212,hf=213,df=214,Xo=0,qo=1,Yo=2,Er=3,Zo=4,Jo=5,$o=6,Ko=7,Cu=0,ff=1,pf=2,zn=0,Ru=1,Pu=2,Iu=3,Du=4,Lu=5,Nu=6,Fu=7;var Uu=300,tr=301,Dr=302,Qo=303,jo=304,va=306,bo=1e3,$n=1001,Mo=1002,Ot=1003,mf=1004;var ya=1005;var Rt=1006,el=1007;var ni=1008;var Tn=1009,Ou=1010,Bu=1011,ws=1012,tl=1013,Vn=1014,Gn=1015,ii=1016,nl=1017,il=1018,Ts=1020,ku=35902,zu=35899,Vu=1021,Gu=1022,Ln=1023,Kn=1026,nr=1027,Hu=1028,rl=1029,Lr=1030,sl=1031;var al=1033,ba=33776,Ma=33777,Sa=33778,wa=33779,ol=35840,ll=35841,cl=35842,ul=35843,hl=36196,dl=37492,fl=37496,pl=37488,ml=37489,gl=37490,_l=37491,xl=37808,vl=37809,yl=37810,bl=37811,Ml=37812,Sl=37813,wl=37814,Tl=37815,Al=37816,El=37817,Cl=37818,Rl=37819,Pl=37820,Il=37821,Dl=36492,Ll=36494,Nl=36495,Fl=36283,Ul=36284,Ol=36285,Bl=36286;var ra=2300,So=2301,_o=2302,xu=2400,vu=2401,yu=2402;var gf=3200;var _f=0,xf=1,Ti="",tn="srgb",Cr="srgb-linear",sa="linear",ct="srgb";var wr=7680;var bu=519,vf=512,yf=513,bf=514,kl=515,Mf=516,Sf=517,zl=518,wf=519,Mu=35044;var Wu="300 es",kn=2e3,aa=2001;function Xu(r){for(let e=r.length-1;e>=0;--e)if(r[e]>=65535)return!0;return!1}function bg(r){return ArrayBuffer.isView(r)&&!(r instanceof DataView)}function ps(r){return document.createElementNS("http://www.w3.org/1999/xhtml",r)}function Tf(){let r=ps("canvas");return r.style.display="block",r}var Cd={},ms=null;function qu(...r){let e="THREE."+r.shift();ms?ms("log",e,...r):console.log(e,...r)}function Ve(...r){let e="THREE."+r.shift();ms?ms("warn",e,...r):console.warn(e,...r)}function Be(...r){let e="THREE."+r.shift();ms?ms("error",e,...r):console.error(e,...r)}function gs(...r){let e=r.join(" ");e in Cd||(Cd[e]=!0,Ve(...r))}function Af(r,e,t){return new Promise(function(n,i){function s(){switch(r.clientWaitSync(e,r.SYNC_FLUSH_COMMANDS_BIT,0)){case r.WAIT_FAILED:i();break;case r.TIMEOUT_EXPIRED:setTimeout(s,t);break;default:n()}}setTimeout(s,t)})}var Si=class{addEventListener(e,t){this._listeners===void 0&&(this._listeners={});let n=this._listeners;n[e]===void 0&&(n[e]=[]),n[e].indexOf(t)===-1&&n[e].push(t)}hasEventListener(e,t){let n=this._listeners;return n===void 0?!1:n[e]!==void 0&&n[e].indexOf(t)!==-1}removeEventListener(e,t){let n=this._listeners;if(n===void 0)return;let i=n[e];if(i!==void 0){let s=i.indexOf(t);s!==-1&&i.splice(s,1)}}dispatchEvent(e){let t=this._listeners;if(t===void 0)return;let n=t[e.type];if(n!==void 0){e.target=this;let i=n.slice(0);for(let s=0,a=i.length;s<a;s++)i[s].call(this,e);e.target=null}}},qt=["00","01","02","03","04","05","06","07","08","09","0a","0b","0c","0d","0e","0f","10","11","12","13","14","15","16","17","18","19","1a","1b","1c","1d","1e","1f","20","21","22","23","24","25","26","27","28","29","2a","2b","2c","2d","2e","2f","30","31","32","33","34","35","36","37","38","39","3a","3b","3c","3d","3e","3f","40","41","42","43","44","45","46","47","48","49","4a","4b","4c","4d","4e","4f","50","51","52","53","54","55","56","57","58","59","5a","5b","5c","5d","5e","5f","60","61","62","63","64","65","66","67","68","69","6a","6b","6c","6d","6e","6f","70","71","72","73","74","75","76","77","78","79","7a","7b","7c","7d","7e","7f","80","81","82","83","84","85","86","87","88","89","8a","8b","8c","8d","8e","8f","90","91","92","93","94","95","96","97","98","99","9a","9b","9c","9d","9e","9f","a0","a1","a2","a3","a4","a5","a6","a7","a8","a9","aa","ab","ac","ad","ae","af","b0","b1","b2","b3","b4","b5","b6","b7","b8","b9","ba","bb","bc","bd","be","bf","c0","c1","c2","c3","c4","c5","c6","c7","c8","c9","ca","cb","cc","cd","ce","cf","d0","d1","d2","d3","d4","d5","d6","d7","d8","d9","da","db","dc","dd","de","df","e0","e1","e2","e3","e4","e5","e6","e7","e8","e9","ea","eb","ec","ed","ee","ef","f0","f1","f2","f3","f4","f5","f6","f7","f8","f9","fa","fb","fc","fd","fe","ff"];var Jc=Math.PI/180,wo=180/Math.PI;function Ta(){let r=Math.random()*4294967295|0,e=Math.random()*4294967295|0,t=Math.random()*4294967295|0,n=Math.random()*4294967295|0;return(qt[r&255]+qt[r>>8&255]+qt[r>>16&255]+qt[r>>24&255]+"-"+qt[e&255]+qt[e>>8&255]+"-"+qt[e>>16&15|64]+qt[e>>24&255]+"-"+qt[t&63|128]+qt[t>>8&255]+"-"+qt[t>>16&255]+qt[t>>24&255]+qt[n&255]+qt[n>>8&255]+qt[n>>16&255]+qt[n>>24&255]).toLowerCase()}function je(r,e,t){return Math.max(e,Math.min(t,r))}function Mg(r,e){return(r%e+e)%e}function $c(r,e,t){return(1-t)*r+t*e}function js(r,e){switch(e.constructor){case Float32Array:return r;case Uint32Array:return r/4294967295;case Uint16Array:return r/65535;case Uint8Array:return r/255;case Int32Array:return Math.max(r/2147483647,-1);case Int16Array:return Math.max(r/32767,-1);case Int8Array:return Math.max(r/127,-1);default:throw new Error("Invalid component type.")}}function fn(r,e){switch(e.constructor){case Float32Array:return r;case Uint32Array:return Math.round(r*4294967295);case Uint16Array:return Math.round(r*65535);case Uint8Array:return Math.round(r*255);case Int32Array:return Math.round(r*2147483647);case Int16Array:return Math.round(r*32767);case Int8Array:return Math.round(r*127);default:throw new Error("Invalid component type.")}}var st=class r{constructor(e=0,t=0){r.prototype.isVector2=!0,this.x=e,this.y=t}get width(){return this.x}set width(e){this.x=e}get height(){return this.y}set height(e){this.y=e}set(e,t){return this.x=e,this.y=t,this}setScalar(e){return this.x=e,this.y=e,this}setX(e){return this.x=e,this}setY(e){return this.y=e,this}setComponent(e,t){switch(e){case 0:this.x=t;break;case 1:this.y=t;break;default:throw new Error("index is out of range: "+e)}return this}getComponent(e){switch(e){case 0:return this.x;case 1:return this.y;default:throw new Error("index is out of range: "+e)}}clone(){return new this.constructor(this.x,this.y)}copy(e){return this.x=e.x,this.y=e.y,this}add(e){return this.x+=e.x,this.y+=e.y,this}addScalar(e){return this.x+=e,this.y+=e,this}addVectors(e,t){return this.x=e.x+t.x,this.y=e.y+t.y,this}addScaledVector(e,t){return this.x+=e.x*t,this.y+=e.y*t,this}sub(e){return this.x-=e.x,this.y-=e.y,this}subScalar(e){return this.x-=e,this.y-=e,this}subVectors(e,t){return this.x=e.x-t.x,this.y=e.y-t.y,this}multiply(e){return this.x*=e.x,this.y*=e.y,this}multiplyScalar(e){return this.x*=e,this.y*=e,this}divide(e){return this.x/=e.x,this.y/=e.y,this}divideScalar(e){return this.multiplyScalar(1/e)}applyMatrix3(e){let t=this.x,n=this.y,i=e.elements;return this.x=i[0]*t+i[3]*n+i[6],this.y=i[1]*t+i[4]*n+i[7],this}min(e){return this.x=Math.min(this.x,e.x),this.y=Math.min(this.y,e.y),this}max(e){return this.x=Math.max(this.x,e.x),this.y=Math.max(this.y,e.y),this}clamp(e,t){return this.x=je(this.x,e.x,t.x),this.y=je(this.y,e.y,t.y),this}clampScalar(e,t){return this.x=je(this.x,e,t),this.y=je(this.y,e,t),this}clampLength(e,t){let n=this.length();return this.divideScalar(n||1).multiplyScalar(je(n,e,t))}floor(){return this.x=Math.floor(this.x),this.y=Math.floor(this.y),this}ceil(){return this.x=Math.ceil(this.x),this.y=Math.ceil(this.y),this}round(){return this.x=Math.round(this.x),this.y=Math.round(this.y),this}roundToZero(){return this.x=Math.trunc(this.x),this.y=Math.trunc(this.y),this}negate(){return this.x=-this.x,this.y=-this.y,this}dot(e){return this.x*e.x+this.y*e.y}cross(e){return this.x*e.y-this.y*e.x}lengthSq(){return this.x*this.x+this.y*this.y}length(){return Math.sqrt(this.x*this.x+this.y*this.y)}manhattanLength(){return Math.abs(this.x)+Math.abs(this.y)}normalize(){return this.divideScalar(this.length()||1)}angle(){return Math.atan2(-this.y,-this.x)+Math.PI}angleTo(e){let t=Math.sqrt(this.lengthSq()*e.lengthSq());if(t===0)return Math.PI/2;let n=this.dot(e)/t;return Math.acos(je(n,-1,1))}distanceTo(e){return Math.sqrt(this.distanceToSquared(e))}distanceToSquared(e){let t=this.x-e.x,n=this.y-e.y;return t*t+n*n}manhattanDistanceTo(e){return Math.abs(this.x-e.x)+Math.abs(this.y-e.y)}setLength(e){return this.normalize().multiplyScalar(e)}lerp(e,t){return this.x+=(e.x-this.x)*t,this.y+=(e.y-this.y)*t,this}lerpVectors(e,t,n){return this.x=e.x+(t.x-e.x)*n,this.y=e.y+(t.y-e.y)*n,this}equals(e){return e.x===this.x&&e.y===this.y}fromArray(e,t=0){return this.x=e[t],this.y=e[t+1],this}toArray(e=[],t=0){return e[t]=this.x,e[t+1]=this.y,e}fromBufferAttribute(e,t){return this.x=e.getX(t),this.y=e.getY(t),this}rotateAround(e,t){let n=Math.cos(t),i=Math.sin(t),s=this.x-e.x,a=this.y-e.y;return this.x=s*n-a*i+e.x,this.y=s*i+a*n+e.y,this}random(){return this.x=Math.random(),this.y=Math.random(),this}*[Symbol.iterator](){yield this.x,yield this.y}},wi=class{constructor(e=0,t=0,n=0,i=1){this.isQuaternion=!0,this._x=e,this._y=t,this._z=n,this._w=i}static slerpFlat(e,t,n,i,s,a,o){let c=n[i+0],l=n[i+1],u=n[i+2],h=n[i+3],d=s[a+0],f=s[a+1],_=s[a+2],g=s[a+3];if(o<=0){e[t+0]=c,e[t+1]=l,e[t+2]=u,e[t+3]=h;return}if(o>=1){e[t+0]=d,e[t+1]=f,e[t+2]=_,e[t+3]=g;return}if(h!==g||c!==d||l!==f||u!==_){let m=c*d+l*f+u*_+h*g;m<0&&(d=-d,f=-f,_=-_,g=-g,m=-m);let p=1-o;if(m<.9995){let y=Math.acos(m),w=Math.sin(y);p=Math.sin(p*y)/w,o=Math.sin(o*y)/w,c=c*p+d*o,l=l*p+f*o,u=u*p+_*o,h=h*p+g*o}else{c=c*p+d*o,l=l*p+f*o,u=u*p+_*o,h=h*p+g*o;let y=1/Math.sqrt(c*c+l*l+u*u+h*h);c*=y,l*=y,u*=y,h*=y}}e[t]=c,e[t+1]=l,e[t+2]=u,e[t+3]=h}static multiplyQuaternionsFlat(e,t,n,i,s,a){let o=n[i],c=n[i+1],l=n[i+2],u=n[i+3],h=s[a],d=s[a+1],f=s[a+2],_=s[a+3];return e[t]=o*_+u*h+c*f-l*d,e[t+1]=c*_+u*d+l*h-o*f,e[t+2]=l*_+u*f+o*d-c*h,e[t+3]=u*_-o*h-c*d-l*f,e}get x(){return this._x}set x(e){this._x=e,this._onChangeCallback()}get y(){return this._y}set y(e){this._y=e,this._onChangeCallback()}get z(){return this._z}set z(e){this._z=e,this._onChangeCallback()}get w(){return this._w}set w(e){this._w=e,this._onChangeCallback()}set(e,t,n,i){return this._x=e,this._y=t,this._z=n,this._w=i,this._onChangeCallback(),this}clone(){return new this.constructor(this._x,this._y,this._z,this._w)}copy(e){return this._x=e.x,this._y=e.y,this._z=e.z,this._w=e.w,this._onChangeCallback(),this}setFromEuler(e,t=!0){let n=e._x,i=e._y,s=e._z,a=e._order,o=Math.cos,c=Math.sin,l=o(n/2),u=o(i/2),h=o(s/2),d=c(n/2),f=c(i/2),_=c(s/2);switch(a){case"XYZ":this._x=d*u*h+l*f*_,this._y=l*f*h-d*u*_,this._z=l*u*_+d*f*h,this._w=l*u*h-d*f*_;break;case"YXZ":this._x=d*u*h+l*f*_,this._y=l*f*h-d*u*_,this._z=l*u*_-d*f*h,this._w=l*u*h+d*f*_;break;case"ZXY":this._x=d*u*h-l*f*_,this._y=l*f*h+d*u*_,this._z=l*u*_+d*f*h,this._w=l*u*h-d*f*_;break;case"ZYX":this._x=d*u*h-l*f*_,this._y=l*f*h+d*u*_,this._z=l*u*_-d*f*h,this._w=l*u*h+d*f*_;break;case"YZX":this._x=d*u*h+l*f*_,this._y=l*f*h+d*u*_,this._z=l*u*_-d*f*h,this._w=l*u*h-d*f*_;break;case"XZY":this._x=d*u*h-l*f*_,this._y=l*f*h-d*u*_,this._z=l*u*_+d*f*h,this._w=l*u*h+d*f*_;break;default:Ve("Quaternion: .setFromEuler() encountered an unknown order: "+a)}return t===!0&&this._onChangeCallback(),this}setFromAxisAngle(e,t){let n=t/2,i=Math.sin(n);return this._x=e.x*i,this._y=e.y*i,this._z=e.z*i,this._w=Math.cos(n),this._onChangeCallback(),this}setFromRotationMatrix(e){let t=e.elements,n=t[0],i=t[4],s=t[8],a=t[1],o=t[5],c=t[9],l=t[2],u=t[6],h=t[10],d=n+o+h;if(d>0){let f=.5/Math.sqrt(d+1);this._w=.25/f,this._x=(u-c)*f,this._y=(s-l)*f,this._z=(a-i)*f}else if(n>o&&n>h){let f=2*Math.sqrt(1+n-o-h);this._w=(u-c)/f,this._x=.25*f,this._y=(i+a)/f,this._z=(s+l)/f}else if(o>h){let f=2*Math.sqrt(1+o-n-h);this._w=(s-l)/f,this._x=(i+a)/f,this._y=.25*f,this._z=(c+u)/f}else{let f=2*Math.sqrt(1+h-n-o);this._w=(a-i)/f,this._x=(s+l)/f,this._y=(c+u)/f,this._z=.25*f}return this._onChangeCallback(),this}setFromUnitVectors(e,t){let n=e.dot(t)+1;return n<1e-8?(n=0,Math.abs(e.x)>Math.abs(e.z)?(this._x=-e.y,this._y=e.x,this._z=0,this._w=n):(this._x=0,this._y=-e.z,this._z=e.y,this._w=n)):(this._x=e.y*t.z-e.z*t.y,this._y=e.z*t.x-e.x*t.z,this._z=e.x*t.y-e.y*t.x,this._w=n),this.normalize()}angleTo(e){return 2*Math.acos(Math.abs(je(this.dot(e),-1,1)))}rotateTowards(e,t){let n=this.angleTo(e);if(n===0)return this;let i=Math.min(1,t/n);return this.slerp(e,i),this}identity(){return this.set(0,0,0,1)}invert(){return this.conjugate()}conjugate(){return this._x*=-1,this._y*=-1,this._z*=-1,this._onChangeCallback(),this}dot(e){return this._x*e._x+this._y*e._y+this._z*e._z+this._w*e._w}lengthSq(){return this._x*this._x+this._y*this._y+this._z*this._z+this._w*this._w}length(){return Math.sqrt(this._x*this._x+this._y*this._y+this._z*this._z+this._w*this._w)}normalize(){let e=this.length();return e===0?(this._x=0,this._y=0,this._z=0,this._w=1):(e=1/e,this._x=this._x*e,this._y=this._y*e,this._z=this._z*e,this._w=this._w*e),this._onChangeCallback(),this}multiply(e){return this.multiplyQuaternions(this,e)}premultiply(e){return this.multiplyQuaternions(e,this)}multiplyQuaternions(e,t){let n=e._x,i=e._y,s=e._z,a=e._w,o=t._x,c=t._y,l=t._z,u=t._w;return this._x=n*u+a*o+i*l-s*c,this._y=i*u+a*c+s*o-n*l,this._z=s*u+a*l+n*c-i*o,this._w=a*u-n*o-i*c-s*l,this._onChangeCallback(),this}slerp(e,t){if(t<=0)return this;if(t>=1)return this.copy(e);let n=e._x,i=e._y,s=e._z,a=e._w,o=this.dot(e);o<0&&(n=-n,i=-i,s=-s,a=-a,o=-o);let c=1-t;if(o<.9995){let l=Math.acos(o),u=Math.sin(l);c=Math.sin(c*l)/u,t=Math.sin(t*l)/u,this._x=this._x*c+n*t,this._y=this._y*c+i*t,this._z=this._z*c+s*t,this._w=this._w*c+a*t,this._onChangeCallback()}else this._x=this._x*c+n*t,this._y=this._y*c+i*t,this._z=this._z*c+s*t,this._w=this._w*c+a*t,this.normalize();return this}slerpQuaternions(e,t,n){return this.copy(e).slerp(t,n)}random(){let e=2*Math.PI*Math.random(),t=2*Math.PI*Math.random(),n=Math.random(),i=Math.sqrt(1-n),s=Math.sqrt(n);return this.set(i*Math.sin(e),i*Math.cos(e),s*Math.sin(t),s*Math.cos(t))}equals(e){return e._x===this._x&&e._y===this._y&&e._z===this._z&&e._w===this._w}fromArray(e,t=0){return this._x=e[t],this._y=e[t+1],this._z=e[t+2],this._w=e[t+3],this._onChangeCallback(),this}toArray(e=[],t=0){return e[t]=this._x,e[t+1]=this._y,e[t+2]=this._z,e[t+3]=this._w,e}fromBufferAttribute(e,t){return this._x=e.getX(t),this._y=e.getY(t),this._z=e.getZ(t),this._w=e.getW(t),this._onChangeCallback(),this}toJSON(){return this.toArray()}_onChange(e){return this._onChangeCallback=e,this}_onChangeCallback(){}*[Symbol.iterator](){yield this._x,yield this._y,yield this._z,yield this._w}},W=class r{constructor(e=0,t=0,n=0){r.prototype.isVector3=!0,this.x=e,this.y=t,this.z=n}set(e,t,n){return n===void 0&&(n=this.z),this.x=e,this.y=t,this.z=n,this}setScalar(e){return this.x=e,this.y=e,this.z=e,this}setX(e){return this.x=e,this}setY(e){return this.y=e,this}setZ(e){return this.z=e,this}setComponent(e,t){switch(e){case 0:this.x=t;break;case 1:this.y=t;break;case 2:this.z=t;break;default:throw new Error("index is out of range: "+e)}return this}getComponent(e){switch(e){case 0:return this.x;case 1:return this.y;case 2:return this.z;default:throw new Error("index is out of range: "+e)}}clone(){return new this.constructor(this.x,this.y,this.z)}copy(e){return this.x=e.x,this.y=e.y,this.z=e.z,this}add(e){return this.x+=e.x,this.y+=e.y,this.z+=e.z,this}addScalar(e){return this.x+=e,this.y+=e,this.z+=e,this}addVectors(e,t){return this.x=e.x+t.x,this.y=e.y+t.y,this.z=e.z+t.z,this}addScaledVector(e,t){return this.x+=e.x*t,this.y+=e.y*t,this.z+=e.z*t,this}sub(e){return this.x-=e.x,this.y-=e.y,this.z-=e.z,this}subScalar(e){return this.x-=e,this.y-=e,this.z-=e,this}subVectors(e,t){return this.x=e.x-t.x,this.y=e.y-t.y,this.z=e.z-t.z,this}multiply(e){return this.x*=e.x,this.y*=e.y,this.z*=e.z,this}multiplyScalar(e){return this.x*=e,this.y*=e,this.z*=e,this}multiplyVectors(e,t){return this.x=e.x*t.x,this.y=e.y*t.y,this.z=e.z*t.z,this}applyEuler(e){return this.applyQuaternion(Rd.setFromEuler(e))}applyAxisAngle(e,t){return this.applyQuaternion(Rd.setFromAxisAngle(e,t))}applyMatrix3(e){let t=this.x,n=this.y,i=this.z,s=e.elements;return this.x=s[0]*t+s[3]*n+s[6]*i,this.y=s[1]*t+s[4]*n+s[7]*i,this.z=s[2]*t+s[5]*n+s[8]*i,this}applyNormalMatrix(e){return this.applyMatrix3(e).normalize()}applyMatrix4(e){let t=this.x,n=this.y,i=this.z,s=e.elements,a=1/(s[3]*t+s[7]*n+s[11]*i+s[15]);return this.x=(s[0]*t+s[4]*n+s[8]*i+s[12])*a,this.y=(s[1]*t+s[5]*n+s[9]*i+s[13])*a,this.z=(s[2]*t+s[6]*n+s[10]*i+s[14])*a,this}applyQuaternion(e){let t=this.x,n=this.y,i=this.z,s=e.x,a=e.y,o=e.z,c=e.w,l=2*(a*i-o*n),u=2*(o*t-s*i),h=2*(s*n-a*t);return this.x=t+c*l+a*h-o*u,this.y=n+c*u+o*l-s*h,this.z=i+c*h+s*u-a*l,this}project(e){return this.applyMatrix4(e.matrixWorldInverse).applyMatrix4(e.projectionMatrix)}unproject(e){return this.applyMatrix4(e.projectionMatrixInverse).applyMatrix4(e.matrixWorld)}transformDirection(e){let t=this.x,n=this.y,i=this.z,s=e.elements;return this.x=s[0]*t+s[4]*n+s[8]*i,this.y=s[1]*t+s[5]*n+s[9]*i,this.z=s[2]*t+s[6]*n+s[10]*i,this.normalize()}divide(e){return this.x/=e.x,this.y/=e.y,this.z/=e.z,this}divideScalar(e){return this.multiplyScalar(1/e)}min(e){return this.x=Math.min(this.x,e.x),this.y=Math.min(this.y,e.y),this.z=Math.min(this.z,e.z),this}max(e){return this.x=Math.max(this.x,e.x),this.y=Math.max(this.y,e.y),this.z=Math.max(this.z,e.z),this}clamp(e,t){return this.x=je(this.x,e.x,t.x),this.y=je(this.y,e.y,t.y),this.z=je(this.z,e.z,t.z),this}clampScalar(e,t){return this.x=je(this.x,e,t),this.y=je(this.y,e,t),this.z=je(this.z,e,t),this}clampLength(e,t){let n=this.length();return this.divideScalar(n||1).multiplyScalar(je(n,e,t))}floor(){return this.x=Math.floor(this.x),this.y=Math.floor(this.y),this.z=Math.floor(this.z),this}ceil(){return this.x=Math.ceil(this.x),this.y=Math.ceil(this.y),this.z=Math.ceil(this.z),this}round(){return this.x=Math.round(this.x),this.y=Math.round(this.y),this.z=Math.round(this.z),this}roundToZero(){return this.x=Math.trunc(this.x),this.y=Math.trunc(this.y),this.z=Math.trunc(this.z),this}negate(){return this.x=-this.x,this.y=-this.y,this.z=-this.z,this}dot(e){return this.x*e.x+this.y*e.y+this.z*e.z}lengthSq(){return this.x*this.x+this.y*this.y+this.z*this.z}length(){return Math.sqrt(this.x*this.x+this.y*this.y+this.z*this.z)}manhattanLength(){return Math.abs(this.x)+Math.abs(this.y)+Math.abs(this.z)}normalize(){return this.divideScalar(this.length()||1)}setLength(e){return this.normalize().multiplyScalar(e)}lerp(e,t){return this.x+=(e.x-this.x)*t,this.y+=(e.y-this.y)*t,this.z+=(e.z-this.z)*t,this}lerpVectors(e,t,n){return this.x=e.x+(t.x-e.x)*n,this.y=e.y+(t.y-e.y)*n,this.z=e.z+(t.z-e.z)*n,this}cross(e){return this.crossVectors(this,e)}crossVectors(e,t){let n=e.x,i=e.y,s=e.z,a=t.x,o=t.y,c=t.z;return this.x=i*c-s*o,this.y=s*a-n*c,this.z=n*o-i*a,this}projectOnVector(e){let t=e.lengthSq();if(t===0)return this.set(0,0,0);let n=e.dot(this)/t;return this.copy(e).multiplyScalar(n)}projectOnPlane(e){return Kc.copy(this).projectOnVector(e),this.sub(Kc)}reflect(e){return this.sub(Kc.copy(e).multiplyScalar(2*this.dot(e)))}angleTo(e){let t=Math.sqrt(this.lengthSq()*e.lengthSq());if(t===0)return Math.PI/2;let n=this.dot(e)/t;return Math.acos(je(n,-1,1))}distanceTo(e){return Math.sqrt(this.distanceToSquared(e))}distanceToSquared(e){let t=this.x-e.x,n=this.y-e.y,i=this.z-e.z;return t*t+n*n+i*i}manhattanDistanceTo(e){return Math.abs(this.x-e.x)+Math.abs(this.y-e.y)+Math.abs(this.z-e.z)}setFromSpherical(e){return this.setFromSphericalCoords(e.radius,e.phi,e.theta)}setFromSphericalCoords(e,t,n){let i=Math.sin(t)*e;return this.x=i*Math.sin(n),this.y=Math.cos(t)*e,this.z=i*Math.cos(n),this}setFromCylindrical(e){return this.setFromCylindricalCoords(e.radius,e.theta,e.y)}setFromCylindricalCoords(e,t,n){return this.x=e*Math.sin(t),this.y=n,this.z=e*Math.cos(t),this}setFromMatrixPosition(e){let t=e.elements;return this.x=t[12],this.y=t[13],this.z=t[14],this}setFromMatrixScale(e){let t=this.setFromMatrixColumn(e,0).length(),n=this.setFromMatrixColumn(e,1).length(),i=this.setFromMatrixColumn(e,2).length();return this.x=t,this.y=n,this.z=i,this}setFromMatrixColumn(e,t){return this.fromArray(e.elements,t*4)}setFromMatrix3Column(e,t){return this.fromArray(e.elements,t*3)}setFromEuler(e){return this.x=e._x,this.y=e._y,this.z=e._z,this}setFromColor(e){return this.x=e.r,this.y=e.g,this.z=e.b,this}equals(e){return e.x===this.x&&e.y===this.y&&e.z===this.z}fromArray(e,t=0){return this.x=e[t],this.y=e[t+1],this.z=e[t+2],this}toArray(e=[],t=0){return e[t]=this.x,e[t+1]=this.y,e[t+2]=this.z,e}fromBufferAttribute(e,t){return this.x=e.getX(t),this.y=e.getY(t),this.z=e.getZ(t),this}random(){return this.x=Math.random(),this.y=Math.random(),this.z=Math.random(),this}randomDirection(){let e=Math.random()*Math.PI*2,t=Math.random()*2-1,n=Math.sqrt(1-t*t);return this.x=n*Math.cos(e),this.y=t,this.z=n*Math.sin(e),this}*[Symbol.iterator](){yield this.x,yield this.y,yield this.z}},Kc=new W,Rd=new wi,He=class r{constructor(e,t,n,i,s,a,o,c,l){r.prototype.isMatrix3=!0,this.elements=[1,0,0,0,1,0,0,0,1],e!==void 0&&this.set(e,t,n,i,s,a,o,c,l)}set(e,t,n,i,s,a,o,c,l){let u=this.elements;return u[0]=e,u[1]=i,u[2]=o,u[3]=t,u[4]=s,u[5]=c,u[6]=n,u[7]=a,u[8]=l,this}identity(){return this.set(1,0,0,0,1,0,0,0,1),this}copy(e){let t=this.elements,n=e.elements;return t[0]=n[0],t[1]=n[1],t[2]=n[2],t[3]=n[3],t[4]=n[4],t[5]=n[5],t[6]=n[6],t[7]=n[7],t[8]=n[8],this}extractBasis(e,t,n){return e.setFromMatrix3Column(this,0),t.setFromMatrix3Column(this,1),n.setFromMatrix3Column(this,2),this}setFromMatrix4(e){let t=e.elements;return this.set(t[0],t[4],t[8],t[1],t[5],t[9],t[2],t[6],t[10]),this}multiply(e){return this.multiplyMatrices(this,e)}premultiply(e){return this.multiplyMatrices(e,this)}multiplyMatrices(e,t){let n=e.elements,i=t.elements,s=this.elements,a=n[0],o=n[3],c=n[6],l=n[1],u=n[4],h=n[7],d=n[2],f=n[5],_=n[8],g=i[0],m=i[3],p=i[6],y=i[1],w=i[4],S=i[7],M=i[2],A=i[5],E=i[8];return s[0]=a*g+o*y+c*M,s[3]=a*m+o*w+c*A,s[6]=a*p+o*S+c*E,s[1]=l*g+u*y+h*M,s[4]=l*m+u*w+h*A,s[7]=l*p+u*S+h*E,s[2]=d*g+f*y+_*M,s[5]=d*m+f*w+_*A,s[8]=d*p+f*S+_*E,this}multiplyScalar(e){let t=this.elements;return t[0]*=e,t[3]*=e,t[6]*=e,t[1]*=e,t[4]*=e,t[7]*=e,t[2]*=e,t[5]*=e,t[8]*=e,this}determinant(){let e=this.elements,t=e[0],n=e[1],i=e[2],s=e[3],a=e[4],o=e[5],c=e[6],l=e[7],u=e[8];return t*a*u-t*o*l-n*s*u+n*o*c+i*s*l-i*a*c}invert(){let e=this.elements,t=e[0],n=e[1],i=e[2],s=e[3],a=e[4],o=e[5],c=e[6],l=e[7],u=e[8],h=u*a-o*l,d=o*c-u*s,f=l*s-a*c,_=t*h+n*d+i*f;if(_===0)return this.set(0,0,0,0,0,0,0,0,0);let g=1/_;return e[0]=h*g,e[1]=(i*l-u*n)*g,e[2]=(o*n-i*a)*g,e[3]=d*g,e[4]=(u*t-i*c)*g,e[5]=(i*s-o*t)*g,e[6]=f*g,e[7]=(n*c-l*t)*g,e[8]=(a*t-n*s)*g,this}transpose(){let e,t=this.elements;return e=t[1],t[1]=t[3],t[3]=e,e=t[2],t[2]=t[6],t[6]=e,e=t[5],t[5]=t[7],t[7]=e,this}getNormalMatrix(e){return this.setFromMatrix4(e).invert().transpose()}transposeIntoArray(e){let t=this.elements;return e[0]=t[0],e[1]=t[3],e[2]=t[6],e[3]=t[1],e[4]=t[4],e[5]=t[7],e[6]=t[2],e[7]=t[5],e[8]=t[8],this}setUvTransform(e,t,n,i,s,a,o){let c=Math.cos(s),l=Math.sin(s);return this.set(n*c,n*l,-n*(c*a+l*o)+a+e,-i*l,i*c,-i*(-l*a+c*o)+o+t,0,0,1),this}scale(e,t){return this.premultiply(Qc.makeScale(e,t)),this}rotate(e){return this.premultiply(Qc.makeRotation(-e)),this}translate(e,t){return this.premultiply(Qc.makeTranslation(e,t)),this}makeTranslation(e,t){return e.isVector2?this.set(1,0,e.x,0,1,e.y,0,0,1):this.set(1,0,e,0,1,t,0,0,1),this}makeRotation(e){let t=Math.cos(e),n=Math.sin(e);return this.set(t,-n,0,n,t,0,0,0,1),this}makeScale(e,t){return this.set(e,0,0,0,t,0,0,0,1),this}equals(e){let t=this.elements,n=e.elements;for(let i=0;i<9;i++)if(t[i]!==n[i])return!1;return!0}fromArray(e,t=0){for(let n=0;n<9;n++)this.elements[n]=e[n+t];return this}toArray(e=[],t=0){let n=this.elements;return e[t]=n[0],e[t+1]=n[1],e[t+2]=n[2],e[t+3]=n[3],e[t+4]=n[4],e[t+5]=n[5],e[t+6]=n[6],e[t+7]=n[7],e[t+8]=n[8],e}clone(){return new this.constructor().fromArray(this.elements)}},Qc=new He,Pd=new He().set(.4123908,.3575843,.1804808,.212639,.7151687,.0721923,.0193308,.1191948,.9505322),Id=new He().set(3.2409699,-1.5373832,-.4986108,-.9692436,1.8759675,.0415551,.0556301,-.203977,1.0569715);function Sg(){let r={enabled:!0,workingColorSpace:Cr,spaces:{},convert:function(i,s,a){return this.enabled===!1||s===a||!s||!a||(this.spaces[s].transfer===ct&&(i.r=bi(i.r),i.g=bi(i.g),i.b=bi(i.b)),this.spaces[s].primaries!==this.spaces[a].primaries&&(i.applyMatrix3(this.spaces[s].toXYZ),i.applyMatrix3(this.spaces[a].fromXYZ)),this.spaces[a].transfer===ct&&(i.r=fs(i.r),i.g=fs(i.g),i.b=fs(i.b))),i},workingToColorSpace:function(i,s){return this.convert(i,this.workingColorSpace,s)},colorSpaceToWorking:function(i,s){return this.convert(i,s,this.workingColorSpace)},getPrimaries:function(i){return this.spaces[i].primaries},getTransfer:function(i){return i===Ti?sa:this.spaces[i].transfer},getToneMappingMode:function(i){return this.spaces[i].outputColorSpaceConfig.toneMappingMode||"standard"},getLuminanceCoefficients:function(i,s=this.workingColorSpace){return i.fromArray(this.spaces[s].luminanceCoefficients)},define:function(i){Object.assign(this.spaces,i)},_getMatrix:function(i,s,a){return i.copy(this.spaces[s].toXYZ).multiply(this.spaces[a].fromXYZ)},_getDrawingBufferColorSpace:function(i){return this.spaces[i].outputColorSpaceConfig.drawingBufferColorSpace},_getUnpackColorSpace:function(i=this.workingColorSpace){return this.spaces[i].workingColorSpaceConfig.unpackColorSpace},fromWorkingColorSpace:function(i,s){return gs("ColorManagement: .fromWorkingColorSpace() has been renamed to .workingToColorSpace()."),r.workingToColorSpace(i,s)},toWorkingColorSpace:function(i,s){return gs("ColorManagement: .toWorkingColorSpace() has been renamed to .colorSpaceToWorking()."),r.colorSpaceToWorking(i,s)}},e=[.64,.33,.3,.6,.15,.06],t=[.2126,.7152,.0722],n=[.3127,.329];return r.define({[Cr]:{primaries:e,whitePoint:n,transfer:sa,toXYZ:Pd,fromXYZ:Id,luminanceCoefficients:t,workingColorSpaceConfig:{unpackColorSpace:tn},outputColorSpaceConfig:{drawingBufferColorSpace:tn}},[tn]:{primaries:e,whitePoint:n,transfer:ct,toXYZ:Pd,fromXYZ:Id,luminanceCoefficients:t,outputColorSpaceConfig:{drawingBufferColorSpace:tn}}}),r}var tt=Sg();function bi(r){return r<.04045?r*.0773993808:Math.pow(r*.9478672986+.0521327014,2.4)}function fs(r){return r<.0031308?r*12.92:1.055*Math.pow(r,.41666)-.055}var es,To=class{static getDataURL(e,t="image/png"){if(/^data:/i.test(e.src)||typeof HTMLCanvasElement>"u")return e.src;let n;if(e instanceof HTMLCanvasElement)n=e;else{es===void 0&&(es=ps("canvas")),es.width=e.width,es.height=e.height;let i=es.getContext("2d");e instanceof ImageData?i.putImageData(e,0,0):i.drawImage(e,0,0,e.width,e.height),n=es}return n.toDataURL(t)}static sRGBToLinear(e){if(typeof HTMLImageElement<"u"&&e instanceof HTMLImageElement||typeof HTMLCanvasElement<"u"&&e instanceof HTMLCanvasElement||typeof ImageBitmap<"u"&&e instanceof ImageBitmap){let t=ps("canvas");t.width=e.width,t.height=e.height;let n=t.getContext("2d");n.drawImage(e,0,0,e.width,e.height);let i=n.getImageData(0,0,e.width,e.height),s=i.data;for(let a=0;a<s.length;a++)s[a]=bi(s[a]/255)*255;return n.putImageData(i,0,0),t}else if(e.data){let t=e.data.slice(0);for(let n=0;n<t.length;n++)t instanceof Uint8Array||t instanceof Uint8ClampedArray?t[n]=Math.floor(bi(t[n]/255)*255):t[n]=bi(t[n]);return{data:t,width:e.width,height:e.height}}else return Ve("ImageUtils.sRGBToLinear(): Unsupported image type. No color space conversion applied."),e}},wg=0,_s=class{constructor(e=null){this.isSource=!0,Object.defineProperty(this,"id",{value:wg++}),this.uuid=Ta(),this.data=e,this.dataReady=!0,this.version=0}getSize(e){let t=this.data;return typeof HTMLVideoElement<"u"&&t instanceof HTMLVideoElement?e.set(t.videoWidth,t.videoHeight,0):typeof VideoFrame<"u"&&t instanceof VideoFrame?e.set(t.displayHeight,t.displayWidth,0):t!==null?e.set(t.width,t.height,t.depth||0):e.set(0,0,0),e}set needsUpdate(e){e===!0&&this.version++}toJSON(e){let t=e===void 0||typeof e=="string";if(!t&&e.images[this.uuid]!==void 0)return e.images[this.uuid];let n={uuid:this.uuid,url:""},i=this.data;if(i!==null){let s;if(Array.isArray(i)){s=[];for(let a=0,o=i.length;a<o;a++)i[a].isDataTexture?s.push(jc(i[a].image)):s.push(jc(i[a]))}else s=jc(i);n.url=s}return t||(e.images[this.uuid]=n),n}};function jc(r){return typeof HTMLImageElement<"u"&&r instanceof HTMLImageElement||typeof HTMLCanvasElement<"u"&&r instanceof HTMLCanvasElement||typeof ImageBitmap<"u"&&r instanceof ImageBitmap?To.getDataURL(r):r.data?{data:Array.from(r.data),width:r.width,height:r.height,type:r.data.constructor.name}:(Ve("Texture: Unable to serialize Texture."),{})}var Tg=0,eu=new W,nn=class r extends Si{constructor(e=r.DEFAULT_IMAGE,t=r.DEFAULT_MAPPING,n=$n,i=$n,s=Rt,a=ni,o=Ln,c=Tn,l=r.DEFAULT_ANISOTROPY,u=Ti){super(),this.isTexture=!0,Object.defineProperty(this,"id",{value:Tg++}),this.uuid=Ta(),this.name="",this.source=new _s(e),this.mipmaps=[],this.mapping=t,this.channel=0,this.wrapS=n,this.wrapT=i,this.magFilter=s,this.minFilter=a,this.anisotropy=l,this.format=o,this.internalFormat=null,this.type=c,this.offset=new st(0,0),this.repeat=new st(1,1),this.center=new st(0,0),this.rotation=0,this.matrixAutoUpdate=!0,this.matrix=new He,this.generateMipmaps=!0,this.premultiplyAlpha=!1,this.flipY=!0,this.unpackAlignment=4,this.colorSpace=u,this.userData={},this.updateRanges=[],this.version=0,this.onUpdate=null,this.renderTarget=null,this.isRenderTargetTexture=!1,this.isArrayTexture=!!(e&&e.depth&&e.depth>1),this.pmremVersion=0}get width(){return this.source.getSize(eu).x}get height(){return this.source.getSize(eu).y}get depth(){return this.source.getSize(eu).z}get image(){return this.source.data}set image(e=null){this.source.data=e}updateMatrix(){this.matrix.setUvTransform(this.offset.x,this.offset.y,this.repeat.x,this.repeat.y,this.rotation,this.center.x,this.center.y)}addUpdateRange(e,t){this.updateRanges.push({start:e,count:t})}clearUpdateRanges(){this.updateRanges.length=0}clone(){return new this.constructor().copy(this)}copy(e){return this.name=e.name,this.source=e.source,this.mipmaps=e.mipmaps.slice(0),this.mapping=e.mapping,this.channel=e.channel,this.wrapS=e.wrapS,this.wrapT=e.wrapT,this.magFilter=e.magFilter,this.minFilter=e.minFilter,this.anisotropy=e.anisotropy,this.format=e.format,this.internalFormat=e.internalFormat,this.type=e.type,this.offset.copy(e.offset),this.repeat.copy(e.repeat),this.center.copy(e.center),this.rotation=e.rotation,this.matrixAutoUpdate=e.matrixAutoUpdate,this.matrix.copy(e.matrix),this.generateMipmaps=e.generateMipmaps,this.premultiplyAlpha=e.premultiplyAlpha,this.flipY=e.flipY,this.unpackAlignment=e.unpackAlignment,this.colorSpace=e.colorSpace,this.renderTarget=e.renderTarget,this.isRenderTargetTexture=e.isRenderTargetTexture,this.isArrayTexture=e.isArrayTexture,this.userData=JSON.parse(JSON.stringify(e.userData)),this.needsUpdate=!0,this}setValues(e){for(let t in e){let n=e[t];if(n===void 0){Ve(`Texture.setValues(): parameter '${t}' has value of undefined.`);continue}let i=this[t];if(i===void 0){Ve(`Texture.setValues(): property '${t}' does not exist.`);continue}i&&n&&i.isVector2&&n.isVector2||i&&n&&i.isVector3&&n.isVector3||i&&n&&i.isMatrix3&&n.isMatrix3?i.copy(n):this[t]=n}}toJSON(e){let t=e===void 0||typeof e=="string";if(!t&&e.textures[this.uuid]!==void 0)return e.textures[this.uuid];let n={metadata:{version:4.7,type:"Texture",generator:"Texture.toJSON"},uuid:this.uuid,name:this.name,image:this.source.toJSON(e).uuid,mapping:this.mapping,channel:this.channel,repeat:[this.repeat.x,this.repeat.y],offset:[this.offset.x,this.offset.y],center:[this.center.x,this.center.y],rotation:this.rotation,wrap:[this.wrapS,this.wrapT],format:this.format,internalFormat:this.internalFormat,type:this.type,colorSpace:this.colorSpace,minFilter:this.minFilter,magFilter:this.magFilter,anisotropy:this.anisotropy,flipY:this.flipY,generateMipmaps:this.generateMipmaps,premultiplyAlpha:this.premultiplyAlpha,unpackAlignment:this.unpackAlignment};return Object.keys(this.userData).length>0&&(n.userData=this.userData),t||(e.textures[this.uuid]=n),n}dispose(){this.dispatchEvent({type:"dispose"})}transformUv(e){if(this.mapping!==Uu)return e;if(e.applyMatrix3(this.matrix),e.x<0||e.x>1)switch(this.wrapS){case bo:e.x=e.x-Math.floor(e.x);break;case $n:e.x=e.x<0?0:1;break;case Mo:Math.abs(Math.floor(e.x)%2)===1?e.x=Math.ceil(e.x)-e.x:e.x=e.x-Math.floor(e.x);break}if(e.y<0||e.y>1)switch(this.wrapT){case bo:e.y=e.y-Math.floor(e.y);break;case $n:e.y=e.y<0?0:1;break;case Mo:Math.abs(Math.floor(e.y)%2)===1?e.y=Math.ceil(e.y)-e.y:e.y=e.y-Math.floor(e.y);break}return this.flipY&&(e.y=1-e.y),e}set needsUpdate(e){e===!0&&(this.version++,this.source.needsUpdate=!0)}set needsPMREMUpdate(e){e===!0&&this.pmremVersion++}};nn.DEFAULT_IMAGE=null;nn.DEFAULT_MAPPING=Uu;nn.DEFAULT_ANISOTROPY=1;var St=class r{constructor(e=0,t=0,n=0,i=1){r.prototype.isVector4=!0,this.x=e,this.y=t,this.z=n,this.w=i}get width(){return this.z}set width(e){this.z=e}get height(){return this.w}set height(e){this.w=e}set(e,t,n,i){return this.x=e,this.y=t,this.z=n,this.w=i,this}setScalar(e){return this.x=e,this.y=e,this.z=e,this.w=e,this}setX(e){return this.x=e,this}setY(e){return this.y=e,this}setZ(e){return this.z=e,this}setW(e){return this.w=e,this}setComponent(e,t){switch(e){case 0:this.x=t;break;case 1:this.y=t;break;case 2:this.z=t;break;case 3:this.w=t;break;default:throw new Error("index is out of range: "+e)}return this}getComponent(e){switch(e){case 0:return this.x;case 1:return this.y;case 2:return this.z;case 3:return this.w;default:throw new Error("index is out of range: "+e)}}clone(){return new this.constructor(this.x,this.y,this.z,this.w)}copy(e){return this.x=e.x,this.y=e.y,this.z=e.z,this.w=e.w!==void 0?e.w:1,this}add(e){return this.x+=e.x,this.y+=e.y,this.z+=e.z,this.w+=e.w,this}addScalar(e){return this.x+=e,this.y+=e,this.z+=e,this.w+=e,this}addVectors(e,t){return this.x=e.x+t.x,this.y=e.y+t.y,this.z=e.z+t.z,this.w=e.w+t.w,this}addScaledVector(e,t){return this.x+=e.x*t,this.y+=e.y*t,this.z+=e.z*t,this.w+=e.w*t,this}sub(e){return this.x-=e.x,this.y-=e.y,this.z-=e.z,this.w-=e.w,this}subScalar(e){return this.x-=e,this.y-=e,this.z-=e,this.w-=e,this}subVectors(e,t){return this.x=e.x-t.x,this.y=e.y-t.y,this.z=e.z-t.z,this.w=e.w-t.w,this}multiply(e){return this.x*=e.x,this.y*=e.y,this.z*=e.z,this.w*=e.w,this}multiplyScalar(e){return this.x*=e,this.y*=e,this.z*=e,this.w*=e,this}applyMatrix4(e){let t=this.x,n=this.y,i=this.z,s=this.w,a=e.elements;return this.x=a[0]*t+a[4]*n+a[8]*i+a[12]*s,this.y=a[1]*t+a[5]*n+a[9]*i+a[13]*s,this.z=a[2]*t+a[6]*n+a[10]*i+a[14]*s,this.w=a[3]*t+a[7]*n+a[11]*i+a[15]*s,this}divide(e){return this.x/=e.x,this.y/=e.y,this.z/=e.z,this.w/=e.w,this}divideScalar(e){return this.multiplyScalar(1/e)}setAxisAngleFromQuaternion(e){this.w=2*Math.acos(e.w);let t=Math.sqrt(1-e.w*e.w);return t<1e-4?(this.x=1,this.y=0,this.z=0):(this.x=e.x/t,this.y=e.y/t,this.z=e.z/t),this}setAxisAngleFromRotationMatrix(e){let t,n,i,s,c=e.elements,l=c[0],u=c[4],h=c[8],d=c[1],f=c[5],_=c[9],g=c[2],m=c[6],p=c[10];if(Math.abs(u-d)<.01&&Math.abs(h-g)<.01&&Math.abs(_-m)<.01){if(Math.abs(u+d)<.1&&Math.abs(h+g)<.1&&Math.abs(_+m)<.1&&Math.abs(l+f+p-3)<.1)return this.set(1,0,0,0),this;t=Math.PI;let w=(l+1)/2,S=(f+1)/2,M=(p+1)/2,A=(u+d)/4,E=(h+g)/4,R=(_+m)/4;return w>S&&w>M?w<.01?(n=0,i=.707106781,s=.707106781):(n=Math.sqrt(w),i=A/n,s=E/n):S>M?S<.01?(n=.707106781,i=0,s=.707106781):(i=Math.sqrt(S),n=A/i,s=R/i):M<.01?(n=.707106781,i=.707106781,s=0):(s=Math.sqrt(M),n=E/s,i=R/s),this.set(n,i,s,t),this}let y=Math.sqrt((m-_)*(m-_)+(h-g)*(h-g)+(d-u)*(d-u));return Math.abs(y)<.001&&(y=1),this.x=(m-_)/y,this.y=(h-g)/y,this.z=(d-u)/y,this.w=Math.acos((l+f+p-1)/2),this}setFromMatrixPosition(e){let t=e.elements;return this.x=t[12],this.y=t[13],this.z=t[14],this.w=t[15],this}min(e){return this.x=Math.min(this.x,e.x),this.y=Math.min(this.y,e.y),this.z=Math.min(this.z,e.z),this.w=Math.min(this.w,e.w),this}max(e){return this.x=Math.max(this.x,e.x),this.y=Math.max(this.y,e.y),this.z=Math.max(this.z,e.z),this.w=Math.max(this.w,e.w),this}clamp(e,t){return this.x=je(this.x,e.x,t.x),this.y=je(this.y,e.y,t.y),this.z=je(this.z,e.z,t.z),this.w=je(this.w,e.w,t.w),this}clampScalar(e,t){return this.x=je(this.x,e,t),this.y=je(this.y,e,t),this.z=je(this.z,e,t),this.w=je(this.w,e,t),this}clampLength(e,t){let n=this.length();return this.divideScalar(n||1).multiplyScalar(je(n,e,t))}floor(){return this.x=Math.floor(this.x),this.y=Math.floor(this.y),this.z=Math.floor(this.z),this.w=Math.floor(this.w),this}ceil(){return this.x=Math.ceil(this.x),this.y=Math.ceil(this.y),this.z=Math.ceil(this.z),this.w=Math.ceil(this.w),this}round(){return this.x=Math.round(this.x),this.y=Math.round(this.y),this.z=Math.round(this.z),this.w=Math.round(this.w),this}roundToZero(){return this.x=Math.trunc(this.x),this.y=Math.trunc(this.y),this.z=Math.trunc(this.z),this.w=Math.trunc(this.w),this}negate(){return this.x=-this.x,this.y=-this.y,this.z=-this.z,this.w=-this.w,this}dot(e){return this.x*e.x+this.y*e.y+this.z*e.z+this.w*e.w}lengthSq(){return this.x*this.x+this.y*this.y+this.z*this.z+this.w*this.w}length(){return Math.sqrt(this.x*this.x+this.y*this.y+this.z*this.z+this.w*this.w)}manhattanLength(){return Math.abs(this.x)+Math.abs(this.y)+Math.abs(this.z)+Math.abs(this.w)}normalize(){return this.divideScalar(this.length()||1)}setLength(e){return this.normalize().multiplyScalar(e)}lerp(e,t){return this.x+=(e.x-this.x)*t,this.y+=(e.y-this.y)*t,this.z+=(e.z-this.z)*t,this.w+=(e.w-this.w)*t,this}lerpVectors(e,t,n){return this.x=e.x+(t.x-e.x)*n,this.y=e.y+(t.y-e.y)*n,this.z=e.z+(t.z-e.z)*n,this.w=e.w+(t.w-e.w)*n,this}equals(e){return e.x===this.x&&e.y===this.y&&e.z===this.z&&e.w===this.w}fromArray(e,t=0){return this.x=e[t],this.y=e[t+1],this.z=e[t+2],this.w=e[t+3],this}toArray(e=[],t=0){return e[t]=this.x,e[t+1]=this.y,e[t+2]=this.z,e[t+3]=this.w,e}fromBufferAttribute(e,t){return this.x=e.getX(t),this.y=e.getY(t),this.z=e.getZ(t),this.w=e.getW(t),this}random(){return this.x=Math.random(),this.y=Math.random(),this.z=Math.random(),this.w=Math.random(),this}*[Symbol.iterator](){yield this.x,yield this.y,yield this.z,yield this.w}},Ao=class extends Si{constructor(e=1,t=1,n={}){super(),n=Object.assign({generateMipmaps:!1,internalFormat:null,minFilter:Rt,depthBuffer:!0,stencilBuffer:!1,resolveDepthBuffer:!0,resolveStencilBuffer:!0,depthTexture:null,samples:0,count:1,depth:1,multiview:!1},n),this.isRenderTarget=!0,this.width=e,this.height=t,this.depth=n.depth,this.scissor=new St(0,0,e,t),this.scissorTest=!1,this.viewport=new St(0,0,e,t);let i={width:e,height:t,depth:n.depth},s=new nn(i);this.textures=[];let a=n.count;for(let o=0;o<a;o++)this.textures[o]=s.clone(),this.textures[o].isRenderTargetTexture=!0,this.textures[o].renderTarget=this;this._setTextureOptions(n),this.depthBuffer=n.depthBuffer,this.stencilBuffer=n.stencilBuffer,this.resolveDepthBuffer=n.resolveDepthBuffer,this.resolveStencilBuffer=n.resolveStencilBuffer,this._depthTexture=null,this.depthTexture=n.depthTexture,this.samples=n.samples,this.multiview=n.multiview}_setTextureOptions(e={}){let t={minFilter:Rt,generateMipmaps:!1,flipY:!1,internalFormat:null};e.mapping!==void 0&&(t.mapping=e.mapping),e.wrapS!==void 0&&(t.wrapS=e.wrapS),e.wrapT!==void 0&&(t.wrapT=e.wrapT),e.wrapR!==void 0&&(t.wrapR=e.wrapR),e.magFilter!==void 0&&(t.magFilter=e.magFilter),e.minFilter!==void 0&&(t.minFilter=e.minFilter),e.format!==void 0&&(t.format=e.format),e.type!==void 0&&(t.type=e.type),e.anisotropy!==void 0&&(t.anisotropy=e.anisotropy),e.colorSpace!==void 0&&(t.colorSpace=e.colorSpace),e.flipY!==void 0&&(t.flipY=e.flipY),e.generateMipmaps!==void 0&&(t.generateMipmaps=e.generateMipmaps),e.internalFormat!==void 0&&(t.internalFormat=e.internalFormat);for(let n=0;n<this.textures.length;n++)this.textures[n].setValues(t)}get texture(){return this.textures[0]}set texture(e){this.textures[0]=e}set depthTexture(e){this._depthTexture!==null&&(this._depthTexture.renderTarget=null),e!==null&&(e.renderTarget=this),this._depthTexture=e}get depthTexture(){return this._depthTexture}setSize(e,t,n=1){if(this.width!==e||this.height!==t||this.depth!==n){this.width=e,this.height=t,this.depth=n;for(let i=0,s=this.textures.length;i<s;i++)this.textures[i].image.width=e,this.textures[i].image.height=t,this.textures[i].image.depth=n,this.textures[i].isData3DTexture!==!0&&(this.textures[i].isArrayTexture=this.textures[i].image.depth>1);this.dispose()}this.viewport.set(0,0,e,t),this.scissor.set(0,0,e,t)}clone(){return new this.constructor().copy(this)}copy(e){this.width=e.width,this.height=e.height,this.depth=e.depth,this.scissor.copy(e.scissor),this.scissorTest=e.scissorTest,this.viewport.copy(e.viewport),this.textures.length=0;for(let t=0,n=e.textures.length;t<n;t++){this.textures[t]=e.textures[t].clone(),this.textures[t].isRenderTargetTexture=!0,this.textures[t].renderTarget=this;let i=Object.assign({},e.textures[t].image);this.textures[t].source=new _s(i)}return this.depthBuffer=e.depthBuffer,this.stencilBuffer=e.stencilBuffer,this.resolveDepthBuffer=e.resolveDepthBuffer,this.resolveStencilBuffer=e.resolveStencilBuffer,e.depthTexture!==null&&(this.depthTexture=e.depthTexture.clone()),this.samples=e.samples,this}dispose(){this.dispatchEvent({type:"dispose"})}},rn=class extends Ao{constructor(e=1,t=1,n={}){super(e,t,n),this.isWebGLRenderTarget=!0}},oa=class extends nn{constructor(e=null,t=1,n=1,i=1){super(null),this.isDataArrayTexture=!0,this.image={data:e,width:t,height:n,depth:i},this.magFilter=Ot,this.minFilter=Ot,this.wrapR=$n,this.generateMipmaps=!1,this.flipY=!1,this.unpackAlignment=1,this.layerUpdates=new Set}addLayerUpdate(e){this.layerUpdates.add(e)}clearLayerUpdates(){this.layerUpdates.clear()}};var Eo=class extends nn{constructor(e=null,t=1,n=1,i=1){super(null),this.isData3DTexture=!0,this.image={data:e,width:t,height:n,depth:i},this.magFilter=Ot,this.minFilter=Ot,this.wrapR=$n,this.generateMipmaps=!1,this.flipY=!1,this.unpackAlignment=1}};var Ji=class{constructor(e=new W(1/0,1/0,1/0),t=new W(-1/0,-1/0,-1/0)){this.isBox3=!0,this.min=e,this.max=t}set(e,t){return this.min.copy(e),this.max.copy(t),this}setFromArray(e){this.makeEmpty();for(let t=0,n=e.length;t<n;t+=3)this.expandByPoint(Un.fromArray(e,t));return this}setFromBufferAttribute(e){this.makeEmpty();for(let t=0,n=e.count;t<n;t++)this.expandByPoint(Un.fromBufferAttribute(e,t));return this}setFromPoints(e){this.makeEmpty();for(let t=0,n=e.length;t<n;t++)this.expandByPoint(e[t]);return this}setFromCenterAndSize(e,t){let n=Un.copy(t).multiplyScalar(.5);return this.min.copy(e).sub(n),this.max.copy(e).add(n),this}setFromObject(e,t=!1){return this.makeEmpty(),this.expandByObject(e,t)}clone(){return new this.constructor().copy(this)}copy(e){return this.min.copy(e.min),this.max.copy(e.max),this}makeEmpty(){return this.min.x=this.min.y=this.min.z=1/0,this.max.x=this.max.y=this.max.z=-1/0,this}isEmpty(){return this.max.x<this.min.x||this.max.y<this.min.y||this.max.z<this.min.z}getCenter(e){return this.isEmpty()?e.set(0,0,0):e.addVectors(this.min,this.max).multiplyScalar(.5)}getSize(e){return this.isEmpty()?e.set(0,0,0):e.subVectors(this.max,this.min)}expandByPoint(e){return this.min.min(e),this.max.max(e),this}expandByVector(e){return this.min.sub(e),this.max.add(e),this}expandByScalar(e){return this.min.addScalar(-e),this.max.addScalar(e),this}expandByObject(e,t=!1){e.updateWorldMatrix(!1,!1);let n=e.geometry;if(n!==void 0){let s=n.getAttribute("position");if(t===!0&&s!==void 0&&e.isInstancedMesh!==!0)for(let a=0,o=s.count;a<o;a++)e.isMesh===!0?e.getVertexPosition(a,Un):Un.fromBufferAttribute(s,a),Un.applyMatrix4(e.matrixWorld),this.expandByPoint(Un);else e.boundingBox!==void 0?(e.boundingBox===null&&e.computeBoundingBox(),Qa.copy(e.boundingBox)):(n.boundingBox===null&&n.computeBoundingBox(),Qa.copy(n.boundingBox)),Qa.applyMatrix4(e.matrixWorld),this.union(Qa)}let i=e.children;for(let s=0,a=i.length;s<a;s++)this.expandByObject(i[s],t);return this}containsPoint(e){return e.x>=this.min.x&&e.x<=this.max.x&&e.y>=this.min.y&&e.y<=this.max.y&&e.z>=this.min.z&&e.z<=this.max.z}containsBox(e){return this.min.x<=e.min.x&&e.max.x<=this.max.x&&this.min.y<=e.min.y&&e.max.y<=this.max.y&&this.min.z<=e.min.z&&e.max.z<=this.max.z}getParameter(e,t){return t.set((e.x-this.min.x)/(this.max.x-this.min.x),(e.y-this.min.y)/(this.max.y-this.min.y),(e.z-this.min.z)/(this.max.z-this.min.z))}intersectsBox(e){return e.max.x>=this.min.x&&e.min.x<=this.max.x&&e.max.y>=this.min.y&&e.min.y<=this.max.y&&e.max.z>=this.min.z&&e.min.z<=this.max.z}intersectsSphere(e){return this.clampPoint(e.center,Un),Un.distanceToSquared(e.center)<=e.radius*e.radius}intersectsPlane(e){let t,n;return e.normal.x>0?(t=e.normal.x*this.min.x,n=e.normal.x*this.max.x):(t=e.normal.x*this.max.x,n=e.normal.x*this.min.x),e.normal.y>0?(t+=e.normal.y*this.min.y,n+=e.normal.y*this.max.y):(t+=e.normal.y*this.max.y,n+=e.normal.y*this.min.y),e.normal.z>0?(t+=e.normal.z*this.min.z,n+=e.normal.z*this.max.z):(t+=e.normal.z*this.max.z,n+=e.normal.z*this.min.z),t<=-e.constant&&n>=-e.constant}intersectsTriangle(e){if(this.isEmpty())return!1;this.getCenter(ea),ja.subVectors(this.max,ea),ts.subVectors(e.a,ea),ns.subVectors(e.b,ea),is.subVectors(e.c,ea),Vi.subVectors(ns,ts),Gi.subVectors(is,ns),yr.subVectors(ts,is);let t=[0,-Vi.z,Vi.y,0,-Gi.z,Gi.y,0,-yr.z,yr.y,Vi.z,0,-Vi.x,Gi.z,0,-Gi.x,yr.z,0,-yr.x,-Vi.y,Vi.x,0,-Gi.y,Gi.x,0,-yr.y,yr.x,0];return!tu(t,ts,ns,is,ja)||(t=[1,0,0,0,1,0,0,0,1],!tu(t,ts,ns,is,ja))?!1:(eo.crossVectors(Vi,Gi),t=[eo.x,eo.y,eo.z],tu(t,ts,ns,is,ja))}clampPoint(e,t){return t.copy(e).clamp(this.min,this.max)}distanceToPoint(e){return this.clampPoint(e,Un).distanceTo(e)}getBoundingSphere(e){return this.isEmpty()?e.makeEmpty():(this.getCenter(e.center),e.radius=this.getSize(Un).length()*.5),e}intersect(e){return this.min.max(e.min),this.max.min(e.max),this.isEmpty()&&this.makeEmpty(),this}union(e){return this.min.min(e.min),this.max.max(e.max),this}applyMatrix4(e){return this.isEmpty()?this:(gi[0].set(this.min.x,this.min.y,this.min.z).applyMatrix4(e),gi[1].set(this.min.x,this.min.y,this.max.z).applyMatrix4(e),gi[2].set(this.min.x,this.max.y,this.min.z).applyMatrix4(e),gi[3].set(this.min.x,this.max.y,this.max.z).applyMatrix4(e),gi[4].set(this.max.x,this.min.y,this.min.z).applyMatrix4(e),gi[5].set(this.max.x,this.min.y,this.max.z).applyMatrix4(e),gi[6].set(this.max.x,this.max.y,this.min.z).applyMatrix4(e),gi[7].set(this.max.x,this.max.y,this.max.z).applyMatrix4(e),this.setFromPoints(gi),this)}translate(e){return this.min.add(e),this.max.add(e),this}equals(e){return e.min.equals(this.min)&&e.max.equals(this.max)}toJSON(){return{min:this.min.toArray(),max:this.max.toArray()}}fromJSON(e){return this.min.fromArray(e.min),this.max.fromArray(e.max),this}},gi=[new W,new W,new W,new W,new W,new W,new W,new W],Un=new W,Qa=new Ji,ts=new W,ns=new W,is=new W,Vi=new W,Gi=new W,yr=new W,ea=new W,ja=new W,eo=new W,br=new W;function tu(r,e,t,n,i){for(let s=0,a=r.length-3;s<=a;s+=3){br.fromArray(r,s);let o=i.x*Math.abs(br.x)+i.y*Math.abs(br.y)+i.z*Math.abs(br.z),c=e.dot(br),l=t.dot(br),u=n.dot(br);if(Math.max(-Math.max(c,l,u),Math.min(c,l,u))>o)return!1}return!0}var Ag=new Ji,ta=new W,nu=new W,xs=class{constructor(e=new W,t=-1){this.isSphere=!0,this.center=e,this.radius=t}set(e,t){return this.center.copy(e),this.radius=t,this}setFromPoints(e,t){let n=this.center;t!==void 0?n.copy(t):Ag.setFromPoints(e).getCenter(n);let i=0;for(let s=0,a=e.length;s<a;s++)i=Math.max(i,n.distanceToSquared(e[s]));return this.radius=Math.sqrt(i),this}copy(e){return this.center.copy(e.center),this.radius=e.radius,this}isEmpty(){return this.radius<0}makeEmpty(){return this.center.set(0,0,0),this.radius=-1,this}containsPoint(e){return e.distanceToSquared(this.center)<=this.radius*this.radius}distanceToPoint(e){return e.distanceTo(this.center)-this.radius}intersectsSphere(e){let t=this.radius+e.radius;return e.center.distanceToSquared(this.center)<=t*t}intersectsBox(e){return e.intersectsSphere(this)}intersectsPlane(e){return Math.abs(e.distanceToPoint(this.center))<=this.radius}clampPoint(e,t){let n=this.center.distanceToSquared(e);return t.copy(e),n>this.radius*this.radius&&(t.sub(this.center).normalize(),t.multiplyScalar(this.radius).add(this.center)),t}getBoundingBox(e){return this.isEmpty()?(e.makeEmpty(),e):(e.set(this.center,this.center),e.expandByScalar(this.radius),e)}applyMatrix4(e){return this.center.applyMatrix4(e),this.radius=this.radius*e.getMaxScaleOnAxis(),this}translate(e){return this.center.add(e),this}expandByPoint(e){if(this.isEmpty())return this.center.copy(e),this.radius=0,this;ta.subVectors(e,this.center);let t=ta.lengthSq();if(t>this.radius*this.radius){let n=Math.sqrt(t),i=(n-this.radius)*.5;this.center.addScaledVector(ta,i/n),this.radius+=i}return this}union(e){return e.isEmpty()?this:this.isEmpty()?(this.copy(e),this):(this.center.equals(e.center)===!0?this.radius=Math.max(this.radius,e.radius):(nu.subVectors(e.center,this.center).setLength(e.radius),this.expandByPoint(ta.copy(e.center).add(nu)),this.expandByPoint(ta.copy(e.center).sub(nu))),this)}equals(e){return e.center.equals(this.center)&&e.radius===this.radius}clone(){return new this.constructor().copy(this)}toJSON(){return{radius:this.radius,center:this.center.toArray()}}fromJSON(e){return this.radius=e.radius,this.center.fromArray(e.center),this}},_i=new W,iu=new W,to=new W,Hi=new W,ru=new W,no=new W,su=new W,Co=class{constructor(e=new W,t=new W(0,0,-1)){this.origin=e,this.direction=t}set(e,t){return this.origin.copy(e),this.direction.copy(t),this}copy(e){return this.origin.copy(e.origin),this.direction.copy(e.direction),this}at(e,t){return t.copy(this.origin).addScaledVector(this.direction,e)}lookAt(e){return this.direction.copy(e).sub(this.origin).normalize(),this}recast(e){return this.origin.copy(this.at(e,_i)),this}closestPointToPoint(e,t){t.subVectors(e,this.origin);let n=t.dot(this.direction);return n<0?t.copy(this.origin):t.copy(this.origin).addScaledVector(this.direction,n)}distanceToPoint(e){return Math.sqrt(this.distanceSqToPoint(e))}distanceSqToPoint(e){let t=_i.subVectors(e,this.origin).dot(this.direction);return t<0?this.origin.distanceToSquared(e):(_i.copy(this.origin).addScaledVector(this.direction,t),_i.distanceToSquared(e))}distanceSqToSegment(e,t,n,i){iu.copy(e).add(t).multiplyScalar(.5),to.copy(t).sub(e).normalize(),Hi.copy(this.origin).sub(iu);let s=e.distanceTo(t)*.5,a=-this.direction.dot(to),o=Hi.dot(this.direction),c=-Hi.dot(to),l=Hi.lengthSq(),u=Math.abs(1-a*a),h,d,f,_;if(u>0)if(h=a*c-o,d=a*o-c,_=s*u,h>=0)if(d>=-_)if(d<=_){let g=1/u;h*=g,d*=g,f=h*(h+a*d+2*o)+d*(a*h+d+2*c)+l}else d=s,h=Math.max(0,-(a*d+o)),f=-h*h+d*(d+2*c)+l;else d=-s,h=Math.max(0,-(a*d+o)),f=-h*h+d*(d+2*c)+l;else d<=-_?(h=Math.max(0,-(-a*s+o)),d=h>0?-s:Math.min(Math.max(-s,-c),s),f=-h*h+d*(d+2*c)+l):d<=_?(h=0,d=Math.min(Math.max(-s,-c),s),f=d*(d+2*c)+l):(h=Math.max(0,-(a*s+o)),d=h>0?s:Math.min(Math.max(-s,-c),s),f=-h*h+d*(d+2*c)+l);else d=a>0?-s:s,h=Math.max(0,-(a*d+o)),f=-h*h+d*(d+2*c)+l;return n&&n.copy(this.origin).addScaledVector(this.direction,h),i&&i.copy(iu).addScaledVector(to,d),f}intersectSphere(e,t){_i.subVectors(e.center,this.origin);let n=_i.dot(this.direction),i=_i.dot(_i)-n*n,s=e.radius*e.radius;if(i>s)return null;let a=Math.sqrt(s-i),o=n-a,c=n+a;return c<0?null:o<0?this.at(c,t):this.at(o,t)}intersectsSphere(e){return e.radius<0?!1:this.distanceSqToPoint(e.center)<=e.radius*e.radius}distanceToPlane(e){let t=e.normal.dot(this.direction);if(t===0)return e.distanceToPoint(this.origin)===0?0:null;let n=-(this.origin.dot(e.normal)+e.constant)/t;return n>=0?n:null}intersectPlane(e,t){let n=this.distanceToPlane(e);return n===null?null:this.at(n,t)}intersectsPlane(e){let t=e.distanceToPoint(this.origin);return t===0||e.normal.dot(this.direction)*t<0}intersectBox(e,t){let n,i,s,a,o,c,l=1/this.direction.x,u=1/this.direction.y,h=1/this.direction.z,d=this.origin;return l>=0?(n=(e.min.x-d.x)*l,i=(e.max.x-d.x)*l):(n=(e.max.x-d.x)*l,i=(e.min.x-d.x)*l),u>=0?(s=(e.min.y-d.y)*u,a=(e.max.y-d.y)*u):(s=(e.max.y-d.y)*u,a=(e.min.y-d.y)*u),n>a||s>i||((s>n||isNaN(n))&&(n=s),(a<i||isNaN(i))&&(i=a),h>=0?(o=(e.min.z-d.z)*h,c=(e.max.z-d.z)*h):(o=(e.max.z-d.z)*h,c=(e.min.z-d.z)*h),n>c||o>i)||((o>n||n!==n)&&(n=o),(c<i||i!==i)&&(i=c),i<0)?null:this.at(n>=0?n:i,t)}intersectsBox(e){return this.intersectBox(e,_i)!==null}intersectTriangle(e,t,n,i,s){ru.subVectors(t,e),no.subVectors(n,e),su.crossVectors(ru,no);let a=this.direction.dot(su),o;if(a>0){if(i)return null;o=1}else if(a<0)o=-1,a=-a;else return null;Hi.subVectors(this.origin,e);let c=o*this.direction.dot(no.crossVectors(Hi,no));if(c<0)return null;let l=o*this.direction.dot(ru.cross(Hi));if(l<0||c+l>a)return null;let u=-o*Hi.dot(su);return u<0?null:this.at(u/a,s)}applyMatrix4(e){return this.origin.applyMatrix4(e),this.direction.transformDirection(e),this}equals(e){return e.origin.equals(this.origin)&&e.direction.equals(this.direction)}clone(){return new this.constructor().copy(this)}},At=class r{constructor(e,t,n,i,s,a,o,c,l,u,h,d,f,_,g,m){r.prototype.isMatrix4=!0,this.elements=[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1],e!==void 0&&this.set(e,t,n,i,s,a,o,c,l,u,h,d,f,_,g,m)}set(e,t,n,i,s,a,o,c,l,u,h,d,f,_,g,m){let p=this.elements;return p[0]=e,p[4]=t,p[8]=n,p[12]=i,p[1]=s,p[5]=a,p[9]=o,p[13]=c,p[2]=l,p[6]=u,p[10]=h,p[14]=d,p[3]=f,p[7]=_,p[11]=g,p[15]=m,this}identity(){return this.set(1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1),this}clone(){return new r().fromArray(this.elements)}copy(e){let t=this.elements,n=e.elements;return t[0]=n[0],t[1]=n[1],t[2]=n[2],t[3]=n[3],t[4]=n[4],t[5]=n[5],t[6]=n[6],t[7]=n[7],t[8]=n[8],t[9]=n[9],t[10]=n[10],t[11]=n[11],t[12]=n[12],t[13]=n[13],t[14]=n[14],t[15]=n[15],this}copyPosition(e){let t=this.elements,n=e.elements;return t[12]=n[12],t[13]=n[13],t[14]=n[14],this}setFromMatrix3(e){let t=e.elements;return this.set(t[0],t[3],t[6],0,t[1],t[4],t[7],0,t[2],t[5],t[8],0,0,0,0,1),this}extractBasis(e,t,n){return this.determinant()===0?(e.set(1,0,0),t.set(0,1,0),n.set(0,0,1),this):(e.setFromMatrixColumn(this,0),t.setFromMatrixColumn(this,1),n.setFromMatrixColumn(this,2),this)}makeBasis(e,t,n){return this.set(e.x,t.x,n.x,0,e.y,t.y,n.y,0,e.z,t.z,n.z,0,0,0,0,1),this}extractRotation(e){if(e.determinant()===0)return this.identity();let t=this.elements,n=e.elements,i=1/rs.setFromMatrixColumn(e,0).length(),s=1/rs.setFromMatrixColumn(e,1).length(),a=1/rs.setFromMatrixColumn(e,2).length();return t[0]=n[0]*i,t[1]=n[1]*i,t[2]=n[2]*i,t[3]=0,t[4]=n[4]*s,t[5]=n[5]*s,t[6]=n[6]*s,t[7]=0,t[8]=n[8]*a,t[9]=n[9]*a,t[10]=n[10]*a,t[11]=0,t[12]=0,t[13]=0,t[14]=0,t[15]=1,this}makeRotationFromEuler(e){let t=this.elements,n=e.x,i=e.y,s=e.z,a=Math.cos(n),o=Math.sin(n),c=Math.cos(i),l=Math.sin(i),u=Math.cos(s),h=Math.sin(s);if(e.order==="XYZ"){let d=a*u,f=a*h,_=o*u,g=o*h;t[0]=c*u,t[4]=-c*h,t[8]=l,t[1]=f+_*l,t[5]=d-g*l,t[9]=-o*c,t[2]=g-d*l,t[6]=_+f*l,t[10]=a*c}else if(e.order==="YXZ"){let d=c*u,f=c*h,_=l*u,g=l*h;t[0]=d+g*o,t[4]=_*o-f,t[8]=a*l,t[1]=a*h,t[5]=a*u,t[9]=-o,t[2]=f*o-_,t[6]=g+d*o,t[10]=a*c}else if(e.order==="ZXY"){let d=c*u,f=c*h,_=l*u,g=l*h;t[0]=d-g*o,t[4]=-a*h,t[8]=_+f*o,t[1]=f+_*o,t[5]=a*u,t[9]=g-d*o,t[2]=-a*l,t[6]=o,t[10]=a*c}else if(e.order==="ZYX"){let d=a*u,f=a*h,_=o*u,g=o*h;t[0]=c*u,t[4]=_*l-f,t[8]=d*l+g,t[1]=c*h,t[5]=g*l+d,t[9]=f*l-_,t[2]=-l,t[6]=o*c,t[10]=a*c}else if(e.order==="YZX"){let d=a*c,f=a*l,_=o*c,g=o*l;t[0]=c*u,t[4]=g-d*h,t[8]=_*h+f,t[1]=h,t[5]=a*u,t[9]=-o*u,t[2]=-l*u,t[6]=f*h+_,t[10]=d-g*h}else if(e.order==="XZY"){let d=a*c,f=a*l,_=o*c,g=o*l;t[0]=c*u,t[4]=-h,t[8]=l*u,t[1]=d*h+g,t[5]=a*u,t[9]=f*h-_,t[2]=_*h-f,t[6]=o*u,t[10]=g*h+d}return t[3]=0,t[7]=0,t[11]=0,t[12]=0,t[13]=0,t[14]=0,t[15]=1,this}makeRotationFromQuaternion(e){return this.compose(Eg,e,Cg)}lookAt(e,t,n){let i=this.elements;return bn.subVectors(e,t),bn.lengthSq()===0&&(bn.z=1),bn.normalize(),Wi.crossVectors(n,bn),Wi.lengthSq()===0&&(Math.abs(n.z)===1?bn.x+=1e-4:bn.z+=1e-4,bn.normalize(),Wi.crossVectors(n,bn)),Wi.normalize(),io.crossVectors(bn,Wi),i[0]=Wi.x,i[4]=io.x,i[8]=bn.x,i[1]=Wi.y,i[5]=io.y,i[9]=bn.y,i[2]=Wi.z,i[6]=io.z,i[10]=bn.z,this}multiply(e){return this.multiplyMatrices(this,e)}premultiply(e){return this.multiplyMatrices(e,this)}multiplyMatrices(e,t){let n=e.elements,i=t.elements,s=this.elements,a=n[0],o=n[4],c=n[8],l=n[12],u=n[1],h=n[5],d=n[9],f=n[13],_=n[2],g=n[6],m=n[10],p=n[14],y=n[3],w=n[7],S=n[11],M=n[15],A=i[0],E=i[4],R=i[8],x=i[12],T=i[1],I=i[5],B=i[9],N=i[13],k=i[2],V=i[6],O=i[10],z=i[14],$=i[3],ce=i[7],q=i[11],ie=i[15];return s[0]=a*A+o*T+c*k+l*$,s[4]=a*E+o*I+c*V+l*ce,s[8]=a*R+o*B+c*O+l*q,s[12]=a*x+o*N+c*z+l*ie,s[1]=u*A+h*T+d*k+f*$,s[5]=u*E+h*I+d*V+f*ce,s[9]=u*R+h*B+d*O+f*q,s[13]=u*x+h*N+d*z+f*ie,s[2]=_*A+g*T+m*k+p*$,s[6]=_*E+g*I+m*V+p*ce,s[10]=_*R+g*B+m*O+p*q,s[14]=_*x+g*N+m*z+p*ie,s[3]=y*A+w*T+S*k+M*$,s[7]=y*E+w*I+S*V+M*ce,s[11]=y*R+w*B+S*O+M*q,s[15]=y*x+w*N+S*z+M*ie,this}multiplyScalar(e){let t=this.elements;return t[0]*=e,t[4]*=e,t[8]*=e,t[12]*=e,t[1]*=e,t[5]*=e,t[9]*=e,t[13]*=e,t[2]*=e,t[6]*=e,t[10]*=e,t[14]*=e,t[3]*=e,t[7]*=e,t[11]*=e,t[15]*=e,this}determinant(){let e=this.elements,t=e[0],n=e[4],i=e[8],s=e[12],a=e[1],o=e[5],c=e[9],l=e[13],u=e[2],h=e[6],d=e[10],f=e[14],_=e[3],g=e[7],m=e[11],p=e[15],y=c*f-l*d,w=o*f-l*h,S=o*d-c*h,M=a*f-l*u,A=a*d-c*u,E=a*h-o*u;return t*(g*y-m*w+p*S)-n*(_*y-m*M+p*A)+i*(_*w-g*M+p*E)-s*(_*S-g*A+m*E)}transpose(){let e=this.elements,t;return t=e[1],e[1]=e[4],e[4]=t,t=e[2],e[2]=e[8],e[8]=t,t=e[6],e[6]=e[9],e[9]=t,t=e[3],e[3]=e[12],e[12]=t,t=e[7],e[7]=e[13],e[13]=t,t=e[11],e[11]=e[14],e[14]=t,this}setPosition(e,t,n){let i=this.elements;return e.isVector3?(i[12]=e.x,i[13]=e.y,i[14]=e.z):(i[12]=e,i[13]=t,i[14]=n),this}invert(){let e=this.elements,t=e[0],n=e[1],i=e[2],s=e[3],a=e[4],o=e[5],c=e[6],l=e[7],u=e[8],h=e[9],d=e[10],f=e[11],_=e[12],g=e[13],m=e[14],p=e[15],y=h*m*l-g*d*l+g*c*f-o*m*f-h*c*p+o*d*p,w=_*d*l-u*m*l-_*c*f+a*m*f+u*c*p-a*d*p,S=u*g*l-_*h*l+_*o*f-a*g*f-u*o*p+a*h*p,M=_*h*c-u*g*c-_*o*d+a*g*d+u*o*m-a*h*m,A=t*y+n*w+i*S+s*M;if(A===0)return this.set(0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0);let E=1/A;return e[0]=y*E,e[1]=(g*d*s-h*m*s-g*i*f+n*m*f+h*i*p-n*d*p)*E,e[2]=(o*m*s-g*c*s+g*i*l-n*m*l-o*i*p+n*c*p)*E,e[3]=(h*c*s-o*d*s-h*i*l+n*d*l+o*i*f-n*c*f)*E,e[4]=w*E,e[5]=(u*m*s-_*d*s+_*i*f-t*m*f-u*i*p+t*d*p)*E,e[6]=(_*c*s-a*m*s-_*i*l+t*m*l+a*i*p-t*c*p)*E,e[7]=(a*d*s-u*c*s+u*i*l-t*d*l-a*i*f+t*c*f)*E,e[8]=S*E,e[9]=(_*h*s-u*g*s-_*n*f+t*g*f+u*n*p-t*h*p)*E,e[10]=(a*g*s-_*o*s+_*n*l-t*g*l-a*n*p+t*o*p)*E,e[11]=(u*o*s-a*h*s-u*n*l+t*h*l+a*n*f-t*o*f)*E,e[12]=M*E,e[13]=(u*g*i-_*h*i+_*n*d-t*g*d-u*n*m+t*h*m)*E,e[14]=(_*o*i-a*g*i-_*n*c+t*g*c+a*n*m-t*o*m)*E,e[15]=(a*h*i-u*o*i+u*n*c-t*h*c-a*n*d+t*o*d)*E,this}scale(e){let t=this.elements,n=e.x,i=e.y,s=e.z;return t[0]*=n,t[4]*=i,t[8]*=s,t[1]*=n,t[5]*=i,t[9]*=s,t[2]*=n,t[6]*=i,t[10]*=s,t[3]*=n,t[7]*=i,t[11]*=s,this}getMaxScaleOnAxis(){let e=this.elements,t=e[0]*e[0]+e[1]*e[1]+e[2]*e[2],n=e[4]*e[4]+e[5]*e[5]+e[6]*e[6],i=e[8]*e[8]+e[9]*e[9]+e[10]*e[10];return Math.sqrt(Math.max(t,n,i))}makeTranslation(e,t,n){return e.isVector3?this.set(1,0,0,e.x,0,1,0,e.y,0,0,1,e.z,0,0,0,1):this.set(1,0,0,e,0,1,0,t,0,0,1,n,0,0,0,1),this}makeRotationX(e){let t=Math.cos(e),n=Math.sin(e);return this.set(1,0,0,0,0,t,-n,0,0,n,t,0,0,0,0,1),this}makeRotationY(e){let t=Math.cos(e),n=Math.sin(e);return this.set(t,0,n,0,0,1,0,0,-n,0,t,0,0,0,0,1),this}makeRotationZ(e){let t=Math.cos(e),n=Math.sin(e);return this.set(t,-n,0,0,n,t,0,0,0,0,1,0,0,0,0,1),this}makeRotationAxis(e,t){let n=Math.cos(t),i=Math.sin(t),s=1-n,a=e.x,o=e.y,c=e.z,l=s*a,u=s*o;return this.set(l*a+n,l*o-i*c,l*c+i*o,0,l*o+i*c,u*o+n,u*c-i*a,0,l*c-i*o,u*c+i*a,s*c*c+n,0,0,0,0,1),this}makeScale(e,t,n){return this.set(e,0,0,0,0,t,0,0,0,0,n,0,0,0,0,1),this}makeShear(e,t,n,i,s,a){return this.set(1,n,s,0,e,1,a,0,t,i,1,0,0,0,0,1),this}compose(e,t,n){let i=this.elements,s=t._x,a=t._y,o=t._z,c=t._w,l=s+s,u=a+a,h=o+o,d=s*l,f=s*u,_=s*h,g=a*u,m=a*h,p=o*h,y=c*l,w=c*u,S=c*h,M=n.x,A=n.y,E=n.z;return i[0]=(1-(g+p))*M,i[1]=(f+S)*M,i[2]=(_-w)*M,i[3]=0,i[4]=(f-S)*A,i[5]=(1-(d+p))*A,i[6]=(m+y)*A,i[7]=0,i[8]=(_+w)*E,i[9]=(m-y)*E,i[10]=(1-(d+g))*E,i[11]=0,i[12]=e.x,i[13]=e.y,i[14]=e.z,i[15]=1,this}decompose(e,t,n){let i=this.elements;if(e.x=i[12],e.y=i[13],e.z=i[14],this.determinant()===0)return n.set(1,1,1),t.identity(),this;let s=rs.set(i[0],i[1],i[2]).length(),a=rs.set(i[4],i[5],i[6]).length(),o=rs.set(i[8],i[9],i[10]).length();this.determinant()<0&&(s=-s),On.copy(this);let l=1/s,u=1/a,h=1/o;return On.elements[0]*=l,On.elements[1]*=l,On.elements[2]*=l,On.elements[4]*=u,On.elements[5]*=u,On.elements[6]*=u,On.elements[8]*=h,On.elements[9]*=h,On.elements[10]*=h,t.setFromRotationMatrix(On),n.x=s,n.y=a,n.z=o,this}makePerspective(e,t,n,i,s,a,o=kn,c=!1){let l=this.elements,u=2*s/(t-e),h=2*s/(n-i),d=(t+e)/(t-e),f=(n+i)/(n-i),_,g;if(c)_=s/(a-s),g=a*s/(a-s);else if(o===kn)_=-(a+s)/(a-s),g=-2*a*s/(a-s);else if(o===aa)_=-a/(a-s),g=-a*s/(a-s);else throw new Error("THREE.Matrix4.makePerspective(): Invalid coordinate system: "+o);return l[0]=u,l[4]=0,l[8]=d,l[12]=0,l[1]=0,l[5]=h,l[9]=f,l[13]=0,l[2]=0,l[6]=0,l[10]=_,l[14]=g,l[3]=0,l[7]=0,l[11]=-1,l[15]=0,this}makeOrthographic(e,t,n,i,s,a,o=kn,c=!1){let l=this.elements,u=2/(t-e),h=2/(n-i),d=-(t+e)/(t-e),f=-(n+i)/(n-i),_,g;if(c)_=1/(a-s),g=a/(a-s);else if(o===kn)_=-2/(a-s),g=-(a+s)/(a-s);else if(o===aa)_=-1/(a-s),g=-s/(a-s);else throw new Error("THREE.Matrix4.makeOrthographic(): Invalid coordinate system: "+o);return l[0]=u,l[4]=0,l[8]=0,l[12]=d,l[1]=0,l[5]=h,l[9]=0,l[13]=f,l[2]=0,l[6]=0,l[10]=_,l[14]=g,l[3]=0,l[7]=0,l[11]=0,l[15]=1,this}equals(e){let t=this.elements,n=e.elements;for(let i=0;i<16;i++)if(t[i]!==n[i])return!1;return!0}fromArray(e,t=0){for(let n=0;n<16;n++)this.elements[n]=e[n+t];return this}toArray(e=[],t=0){let n=this.elements;return e[t]=n[0],e[t+1]=n[1],e[t+2]=n[2],e[t+3]=n[3],e[t+4]=n[4],e[t+5]=n[5],e[t+6]=n[6],e[t+7]=n[7],e[t+8]=n[8],e[t+9]=n[9],e[t+10]=n[10],e[t+11]=n[11],e[t+12]=n[12],e[t+13]=n[13],e[t+14]=n[14],e[t+15]=n[15],e}},rs=new W,On=new At,Eg=new W(0,0,0),Cg=new W(1,1,1),Wi=new W,io=new W,bn=new W,Dd=new At,Ld=new wi,Qn=class r{constructor(e=0,t=0,n=0,i=r.DEFAULT_ORDER){this.isEuler=!0,this._x=e,this._y=t,this._z=n,this._order=i}get x(){return this._x}set x(e){this._x=e,this._onChangeCallback()}get y(){return this._y}set y(e){this._y=e,this._onChangeCallback()}get z(){return this._z}set z(e){this._z=e,this._onChangeCallback()}get order(){return this._order}set order(e){this._order=e,this._onChangeCallback()}set(e,t,n,i=this._order){return this._x=e,this._y=t,this._z=n,this._order=i,this._onChangeCallback(),this}clone(){return new this.constructor(this._x,this._y,this._z,this._order)}copy(e){return this._x=e._x,this._y=e._y,this._z=e._z,this._order=e._order,this._onChangeCallback(),this}setFromRotationMatrix(e,t=this._order,n=!0){let i=e.elements,s=i[0],a=i[4],o=i[8],c=i[1],l=i[5],u=i[9],h=i[2],d=i[6],f=i[10];switch(t){case"XYZ":this._y=Math.asin(je(o,-1,1)),Math.abs(o)<.9999999?(this._x=Math.atan2(-u,f),this._z=Math.atan2(-a,s)):(this._x=Math.atan2(d,l),this._z=0);break;case"YXZ":this._x=Math.asin(-je(u,-1,1)),Math.abs(u)<.9999999?(this._y=Math.atan2(o,f),this._z=Math.atan2(c,l)):(this._y=Math.atan2(-h,s),this._z=0);break;case"ZXY":this._x=Math.asin(je(d,-1,1)),Math.abs(d)<.9999999?(this._y=Math.atan2(-h,f),this._z=Math.atan2(-a,l)):(this._y=0,this._z=Math.atan2(c,s));break;case"ZYX":this._y=Math.asin(-je(h,-1,1)),Math.abs(h)<.9999999?(this._x=Math.atan2(d,f),this._z=Math.atan2(c,s)):(this._x=0,this._z=Math.atan2(-a,l));break;case"YZX":this._z=Math.asin(je(c,-1,1)),Math.abs(c)<.9999999?(this._x=Math.atan2(-u,l),this._y=Math.atan2(-h,s)):(this._x=0,this._y=Math.atan2(o,f));break;case"XZY":this._z=Math.asin(-je(a,-1,1)),Math.abs(a)<.9999999?(this._x=Math.atan2(d,l),this._y=Math.atan2(o,s)):(this._x=Math.atan2(-u,f),this._y=0);break;default:Ve("Euler: .setFromRotationMatrix() encountered an unknown order: "+t)}return this._order=t,n===!0&&this._onChangeCallback(),this}setFromQuaternion(e,t,n){return Dd.makeRotationFromQuaternion(e),this.setFromRotationMatrix(Dd,t,n)}setFromVector3(e,t=this._order){return this.set(e.x,e.y,e.z,t)}reorder(e){return Ld.setFromEuler(this),this.setFromQuaternion(Ld,e)}equals(e){return e._x===this._x&&e._y===this._y&&e._z===this._z&&e._order===this._order}fromArray(e){return this._x=e[0],this._y=e[1],this._z=e[2],e[3]!==void 0&&(this._order=e[3]),this._onChangeCallback(),this}toArray(e=[],t=0){return e[t]=this._x,e[t+1]=this._y,e[t+2]=this._z,e[t+3]=this._order,e}_onChange(e){return this._onChangeCallback=e,this}_onChangeCallback(){}*[Symbol.iterator](){yield this._x,yield this._y,yield this._z,yield this._order}};Qn.DEFAULT_ORDER="XYZ";var la=class{constructor(){this.mask=1}set(e){this.mask=(1<<e|0)>>>0}enable(e){this.mask|=1<<e|0}enableAll(){this.mask=-1}toggle(e){this.mask^=1<<e|0}disable(e){this.mask&=~(1<<e|0)}disableAll(){this.mask=0}test(e){return(this.mask&e.mask)!==0}isEnabled(e){return(this.mask&(1<<e|0))!==0}},Rg=0,Nd=new W,ss=new wi,xi=new At,ro=new W,na=new W,Pg=new W,Ig=new wi,Fd=new W(1,0,0),Ud=new W(0,1,0),Od=new W(0,0,1),Bd={type:"added"},Dg={type:"removed"},as={type:"childadded",child:null},au={type:"childremoved",child:null},Dn=class r extends Si{constructor(){super(),this.isObject3D=!0,Object.defineProperty(this,"id",{value:Rg++}),this.uuid=Ta(),this.name="",this.type="Object3D",this.parent=null,this.children=[],this.up=r.DEFAULT_UP.clone();let e=new W,t=new Qn,n=new wi,i=new W(1,1,1);function s(){n.setFromEuler(t,!1)}function a(){t.setFromQuaternion(n,void 0,!1)}t._onChange(s),n._onChange(a),Object.defineProperties(this,{position:{configurable:!0,enumerable:!0,value:e},rotation:{configurable:!0,enumerable:!0,value:t},quaternion:{configurable:!0,enumerable:!0,value:n},scale:{configurable:!0,enumerable:!0,value:i},modelViewMatrix:{value:new At},normalMatrix:{value:new He}}),this.matrix=new At,this.matrixWorld=new At,this.matrixAutoUpdate=r.DEFAULT_MATRIX_AUTO_UPDATE,this.matrixWorldAutoUpdate=r.DEFAULT_MATRIX_WORLD_AUTO_UPDATE,this.matrixWorldNeedsUpdate=!1,this.layers=new la,this.visible=!0,this.castShadow=!1,this.receiveShadow=!1,this.frustumCulled=!0,this.renderOrder=0,this.animations=[],this.customDepthMaterial=void 0,this.customDistanceMaterial=void 0,this.userData={}}onBeforeShadow(){}onAfterShadow(){}onBeforeRender(){}onAfterRender(){}applyMatrix4(e){this.matrixAutoUpdate&&this.updateMatrix(),this.matrix.premultiply(e),this.matrix.decompose(this.position,this.quaternion,this.scale)}applyQuaternion(e){return this.quaternion.premultiply(e),this}setRotationFromAxisAngle(e,t){this.quaternion.setFromAxisAngle(e,t)}setRotationFromEuler(e){this.quaternion.setFromEuler(e,!0)}setRotationFromMatrix(e){this.quaternion.setFromRotationMatrix(e)}setRotationFromQuaternion(e){this.quaternion.copy(e)}rotateOnAxis(e,t){return ss.setFromAxisAngle(e,t),this.quaternion.multiply(ss),this}rotateOnWorldAxis(e,t){return ss.setFromAxisAngle(e,t),this.quaternion.premultiply(ss),this}rotateX(e){return this.rotateOnAxis(Fd,e)}rotateY(e){return this.rotateOnAxis(Ud,e)}rotateZ(e){return this.rotateOnAxis(Od,e)}translateOnAxis(e,t){return Nd.copy(e).applyQuaternion(this.quaternion),this.position.add(Nd.multiplyScalar(t)),this}translateX(e){return this.translateOnAxis(Fd,e)}translateY(e){return this.translateOnAxis(Ud,e)}translateZ(e){return this.translateOnAxis(Od,e)}localToWorld(e){return this.updateWorldMatrix(!0,!1),e.applyMatrix4(this.matrixWorld)}worldToLocal(e){return this.updateWorldMatrix(!0,!1),e.applyMatrix4(xi.copy(this.matrixWorld).invert())}lookAt(e,t,n){e.isVector3?ro.copy(e):ro.set(e,t,n);let i=this.parent;this.updateWorldMatrix(!0,!1),na.setFromMatrixPosition(this.matrixWorld),this.isCamera||this.isLight?xi.lookAt(na,ro,this.up):xi.lookAt(ro,na,this.up),this.quaternion.setFromRotationMatrix(xi),i&&(xi.extractRotation(i.matrixWorld),ss.setFromRotationMatrix(xi),this.quaternion.premultiply(ss.invert()))}add(e){if(arguments.length>1){for(let t=0;t<arguments.length;t++)this.add(arguments[t]);return this}return e===this?(Be("Object3D.add: object can't be added as a child of itself.",e),this):(e&&e.isObject3D?(e.removeFromParent(),e.parent=this,this.children.push(e),e.dispatchEvent(Bd),as.child=e,this.dispatchEvent(as),as.child=null):Be("Object3D.add: object not an instance of THREE.Object3D.",e),this)}remove(e){if(arguments.length>1){for(let n=0;n<arguments.length;n++)this.remove(arguments[n]);return this}let t=this.children.indexOf(e);return t!==-1&&(e.parent=null,this.children.splice(t,1),e.dispatchEvent(Dg),au.child=e,this.dispatchEvent(au),au.child=null),this}removeFromParent(){let e=this.parent;return e!==null&&e.remove(this),this}clear(){return this.remove(...this.children)}attach(e){return this.updateWorldMatrix(!0,!1),xi.copy(this.matrixWorld).invert(),e.parent!==null&&(e.parent.updateWorldMatrix(!0,!1),xi.multiply(e.parent.matrixWorld)),e.applyMatrix4(xi),e.removeFromParent(),e.parent=this,this.children.push(e),e.updateWorldMatrix(!1,!0),e.dispatchEvent(Bd),as.child=e,this.dispatchEvent(as),as.child=null,this}getObjectById(e){return this.getObjectByProperty("id",e)}getObjectByName(e){return this.getObjectByProperty("name",e)}getObjectByProperty(e,t){if(this[e]===t)return this;for(let n=0,i=this.children.length;n<i;n++){let a=this.children[n].getObjectByProperty(e,t);if(a!==void 0)return a}}getObjectsByProperty(e,t,n=[]){this[e]===t&&n.push(this);let i=this.children;for(let s=0,a=i.length;s<a;s++)i[s].getObjectsByProperty(e,t,n);return n}getWorldPosition(e){return this.updateWorldMatrix(!0,!1),e.setFromMatrixPosition(this.matrixWorld)}getWorldQuaternion(e){return this.updateWorldMatrix(!0,!1),this.matrixWorld.decompose(na,e,Pg),e}getWorldScale(e){return this.updateWorldMatrix(!0,!1),this.matrixWorld.decompose(na,Ig,e),e}getWorldDirection(e){this.updateWorldMatrix(!0,!1);let t=this.matrixWorld.elements;return e.set(t[8],t[9],t[10]).normalize()}raycast(){}traverse(e){e(this);let t=this.children;for(let n=0,i=t.length;n<i;n++)t[n].traverse(e)}traverseVisible(e){if(this.visible===!1)return;e(this);let t=this.children;for(let n=0,i=t.length;n<i;n++)t[n].traverseVisible(e)}traverseAncestors(e){let t=this.parent;t!==null&&(e(t),t.traverseAncestors(e))}updateMatrix(){this.matrix.compose(this.position,this.quaternion,this.scale),this.matrixWorldNeedsUpdate=!0}updateMatrixWorld(e){this.matrixAutoUpdate&&this.updateMatrix(),(this.matrixWorldNeedsUpdate||e)&&(this.matrixWorldAutoUpdate===!0&&(this.parent===null?this.matrixWorld.copy(this.matrix):this.matrixWorld.multiplyMatrices(this.parent.matrixWorld,this.matrix)),this.matrixWorldNeedsUpdate=!1,e=!0);let t=this.children;for(let n=0,i=t.length;n<i;n++)t[n].updateMatrixWorld(e)}updateWorldMatrix(e,t){let n=this.parent;if(e===!0&&n!==null&&n.updateWorldMatrix(!0,!1),this.matrixAutoUpdate&&this.updateMatrix(),this.matrixWorldAutoUpdate===!0&&(this.parent===null?this.matrixWorld.copy(this.matrix):this.matrixWorld.multiplyMatrices(this.parent.matrixWorld,this.matrix)),t===!0){let i=this.children;for(let s=0,a=i.length;s<a;s++)i[s].updateWorldMatrix(!1,!0)}}toJSON(e){let t=e===void 0||typeof e=="string",n={};t&&(e={geometries:{},materials:{},textures:{},images:{},shapes:{},skeletons:{},animations:{},nodes:{}},n.metadata={version:4.7,type:"Object",generator:"Object3D.toJSON"});let i={};i.uuid=this.uuid,i.type=this.type,this.name!==""&&(i.name=this.name),this.castShadow===!0&&(i.castShadow=!0),this.receiveShadow===!0&&(i.receiveShadow=!0),this.visible===!1&&(i.visible=!1),this.frustumCulled===!1&&(i.frustumCulled=!1),this.renderOrder!==0&&(i.renderOrder=this.renderOrder),Object.keys(this.userData).length>0&&(i.userData=this.userData),i.layers=this.layers.mask,i.matrix=this.matrix.toArray(),i.up=this.up.toArray(),this.matrixAutoUpdate===!1&&(i.matrixAutoUpdate=!1),this.isInstancedMesh&&(i.type="InstancedMesh",i.count=this.count,i.instanceMatrix=this.instanceMatrix.toJSON(),this.instanceColor!==null&&(i.instanceColor=this.instanceColor.toJSON())),this.isBatchedMesh&&(i.type="BatchedMesh",i.perObjectFrustumCulled=this.perObjectFrustumCulled,i.sortObjects=this.sortObjects,i.drawRanges=this._drawRanges,i.reservedRanges=this._reservedRanges,i.geometryInfo=this._geometryInfo.map(o=>({...o,boundingBox:o.boundingBox?o.boundingBox.toJSON():void 0,boundingSphere:o.boundingSphere?o.boundingSphere.toJSON():void 0})),i.instanceInfo=this._instanceInfo.map(o=>({...o})),i.availableInstanceIds=this._availableInstanceIds.slice(),i.availableGeometryIds=this._availableGeometryIds.slice(),i.nextIndexStart=this._nextIndexStart,i.nextVertexStart=this._nextVertexStart,i.geometryCount=this._geometryCount,i.maxInstanceCount=this._maxInstanceCount,i.maxVertexCount=this._maxVertexCount,i.maxIndexCount=this._maxIndexCount,i.geometryInitialized=this._geometryInitialized,i.matricesTexture=this._matricesTexture.toJSON(e),i.indirectTexture=this._indirectTexture.toJSON(e),this._colorsTexture!==null&&(i.colorsTexture=this._colorsTexture.toJSON(e)),this.boundingSphere!==null&&(i.boundingSphere=this.boundingSphere.toJSON()),this.boundingBox!==null&&(i.boundingBox=this.boundingBox.toJSON()));function s(o,c){return o[c.uuid]===void 0&&(o[c.uuid]=c.toJSON(e)),c.uuid}if(this.isScene)this.background&&(this.background.isColor?i.background=this.background.toJSON():this.background.isTexture&&(i.background=this.background.toJSON(e).uuid)),this.environment&&this.environment.isTexture&&this.environment.isRenderTargetTexture!==!0&&(i.environment=this.environment.toJSON(e).uuid);else if(this.isMesh||this.isLine||this.isPoints){i.geometry=s(e.geometries,this.geometry);let o=this.geometry.parameters;if(o!==void 0&&o.shapes!==void 0){let c=o.shapes;if(Array.isArray(c))for(let l=0,u=c.length;l<u;l++){let h=c[l];s(e.shapes,h)}else s(e.shapes,c)}}if(this.isSkinnedMesh&&(i.bindMode=this.bindMode,i.bindMatrix=this.bindMatrix.toArray(),this.skeleton!==void 0&&(s(e.skeletons,this.skeleton),i.skeleton=this.skeleton.uuid)),this.material!==void 0)if(Array.isArray(this.material)){let o=[];for(let c=0,l=this.material.length;c<l;c++)o.push(s(e.materials,this.material[c]));i.material=o}else i.material=s(e.materials,this.material);if(this.children.length>0){i.children=[];for(let o=0;o<this.children.length;o++)i.children.push(this.children[o].toJSON(e).object)}if(this.animations.length>0){i.animations=[];for(let o=0;o<this.animations.length;o++){let c=this.animations[o];i.animations.push(s(e.animations,c))}}if(t){let o=a(e.geometries),c=a(e.materials),l=a(e.textures),u=a(e.images),h=a(e.shapes),d=a(e.skeletons),f=a(e.animations),_=a(e.nodes);o.length>0&&(n.geometries=o),c.length>0&&(n.materials=c),l.length>0&&(n.textures=l),u.length>0&&(n.images=u),h.length>0&&(n.shapes=h),d.length>0&&(n.skeletons=d),f.length>0&&(n.animations=f),_.length>0&&(n.nodes=_)}return n.object=i,n;function a(o){let c=[];for(let l in o){let u=o[l];delete u.metadata,c.push(u)}return c}}clone(e){return new this.constructor().copy(this,e)}copy(e,t=!0){if(this.name=e.name,this.up.copy(e.up),this.position.copy(e.position),this.rotation.order=e.rotation.order,this.quaternion.copy(e.quaternion),this.scale.copy(e.scale),this.matrix.copy(e.matrix),this.matrixWorld.copy(e.matrixWorld),this.matrixAutoUpdate=e.matrixAutoUpdate,this.matrixWorldAutoUpdate=e.matrixWorldAutoUpdate,this.matrixWorldNeedsUpdate=e.matrixWorldNeedsUpdate,this.layers.mask=e.layers.mask,this.visible=e.visible,this.castShadow=e.castShadow,this.receiveShadow=e.receiveShadow,this.frustumCulled=e.frustumCulled,this.renderOrder=e.renderOrder,this.animations=e.animations.slice(),this.userData=JSON.parse(JSON.stringify(e.userData)),t===!0)for(let n=0;n<e.children.length;n++){let i=e.children[n];this.add(i.clone())}return this}};Dn.DEFAULT_UP=new W(0,1,0);Dn.DEFAULT_MATRIX_AUTO_UPDATE=!0;Dn.DEFAULT_MATRIX_WORLD_AUTO_UPDATE=!0;var Bn=new W,vi=new W,ou=new W,yi=new W,os=new W,ls=new W,kd=new W,lu=new W,cu=new W,uu=new W,hu=new St,du=new St,fu=new St,Yi=class r{constructor(e=new W,t=new W,n=new W){this.a=e,this.b=t,this.c=n}static getNormal(e,t,n,i){i.subVectors(n,t),Bn.subVectors(e,t),i.cross(Bn);let s=i.lengthSq();return s>0?i.multiplyScalar(1/Math.sqrt(s)):i.set(0,0,0)}static getBarycoord(e,t,n,i,s){Bn.subVectors(i,t),vi.subVectors(n,t),ou.subVectors(e,t);let a=Bn.dot(Bn),o=Bn.dot(vi),c=Bn.dot(ou),l=vi.dot(vi),u=vi.dot(ou),h=a*l-o*o;if(h===0)return s.set(0,0,0),null;let d=1/h,f=(l*c-o*u)*d,_=(a*u-o*c)*d;return s.set(1-f-_,_,f)}static containsPoint(e,t,n,i){return this.getBarycoord(e,t,n,i,yi)===null?!1:yi.x>=0&&yi.y>=0&&yi.x+yi.y<=1}static getInterpolation(e,t,n,i,s,a,o,c){return this.getBarycoord(e,t,n,i,yi)===null?(c.x=0,c.y=0,"z"in c&&(c.z=0),"w"in c&&(c.w=0),null):(c.setScalar(0),c.addScaledVector(s,yi.x),c.addScaledVector(a,yi.y),c.addScaledVector(o,yi.z),c)}static getInterpolatedAttribute(e,t,n,i,s,a){return hu.setScalar(0),du.setScalar(0),fu.setScalar(0),hu.fromBufferAttribute(e,t),du.fromBufferAttribute(e,n),fu.fromBufferAttribute(e,i),a.setScalar(0),a.addScaledVector(hu,s.x),a.addScaledVector(du,s.y),a.addScaledVector(fu,s.z),a}static isFrontFacing(e,t,n,i){return Bn.subVectors(n,t),vi.subVectors(e,t),Bn.cross(vi).dot(i)<0}set(e,t,n){return this.a.copy(e),this.b.copy(t),this.c.copy(n),this}setFromPointsAndIndices(e,t,n,i){return this.a.copy(e[t]),this.b.copy(e[n]),this.c.copy(e[i]),this}setFromAttributeAndIndices(e,t,n,i){return this.a.fromBufferAttribute(e,t),this.b.fromBufferAttribute(e,n),this.c.fromBufferAttribute(e,i),this}clone(){return new this.constructor().copy(this)}copy(e){return this.a.copy(e.a),this.b.copy(e.b),this.c.copy(e.c),this}getArea(){return Bn.subVectors(this.c,this.b),vi.subVectors(this.a,this.b),Bn.cross(vi).length()*.5}getMidpoint(e){return e.addVectors(this.a,this.b).add(this.c).multiplyScalar(1/3)}getNormal(e){return r.getNormal(this.a,this.b,this.c,e)}getPlane(e){return e.setFromCoplanarPoints(this.a,this.b,this.c)}getBarycoord(e,t){return r.getBarycoord(e,this.a,this.b,this.c,t)}getInterpolation(e,t,n,i,s){return r.getInterpolation(e,this.a,this.b,this.c,t,n,i,s)}containsPoint(e){return r.containsPoint(e,this.a,this.b,this.c)}isFrontFacing(e){return r.isFrontFacing(this.a,this.b,this.c,e)}intersectsBox(e){return e.intersectsTriangle(this)}closestPointToPoint(e,t){let n=this.a,i=this.b,s=this.c,a,o;os.subVectors(i,n),ls.subVectors(s,n),lu.subVectors(e,n);let c=os.dot(lu),l=ls.dot(lu);if(c<=0&&l<=0)return t.copy(n);cu.subVectors(e,i);let u=os.dot(cu),h=ls.dot(cu);if(u>=0&&h<=u)return t.copy(i);let d=c*h-u*l;if(d<=0&&c>=0&&u<=0)return a=c/(c-u),t.copy(n).addScaledVector(os,a);uu.subVectors(e,s);let f=os.dot(uu),_=ls.dot(uu);if(_>=0&&f<=_)return t.copy(s);let g=f*l-c*_;if(g<=0&&l>=0&&_<=0)return o=l/(l-_),t.copy(n).addScaledVector(ls,o);let m=u*_-f*h;if(m<=0&&h-u>=0&&f-_>=0)return kd.subVectors(s,i),o=(h-u)/(h-u+(f-_)),t.copy(i).addScaledVector(kd,o);let p=1/(m+g+d);return a=g*p,o=d*p,t.copy(n).addScaledVector(os,a).addScaledVector(ls,o)}equals(e){return e.a.equals(this.a)&&e.b.equals(this.b)&&e.c.equals(this.c)}},Ef={aliceblue:15792383,antiquewhite:16444375,aqua:65535,aquamarine:8388564,azure:15794175,beige:16119260,bisque:16770244,black:0,blanchedalmond:16772045,blue:255,blueviolet:9055202,brown:10824234,burlywood:14596231,cadetblue:6266528,chartreuse:8388352,chocolate:13789470,coral:16744272,cornflowerblue:6591981,cornsilk:16775388,crimson:14423100,cyan:65535,darkblue:139,darkcyan:35723,darkgoldenrod:12092939,darkgray:11119017,darkgreen:25600,darkgrey:11119017,darkkhaki:12433259,darkmagenta:9109643,darkolivegreen:5597999,darkorange:16747520,darkorchid:10040012,darkred:9109504,darksalmon:15308410,darkseagreen:9419919,darkslateblue:4734347,darkslategray:3100495,darkslategrey:3100495,darkturquoise:52945,darkviolet:9699539,deeppink:16716947,deepskyblue:49151,dimgray:6908265,dimgrey:6908265,dodgerblue:2003199,firebrick:11674146,floralwhite:16775920,forestgreen:2263842,fuchsia:16711935,gainsboro:14474460,ghostwhite:16316671,gold:16766720,goldenrod:14329120,gray:8421504,green:32768,greenyellow:11403055,grey:8421504,honeydew:15794160,hotpink:16738740,indianred:13458524,indigo:4915330,ivory:16777200,khaki:15787660,lavender:15132410,lavenderblush:16773365,lawngreen:8190976,lemonchiffon:16775885,lightblue:11393254,lightcoral:15761536,lightcyan:14745599,lightgoldenrodyellow:16448210,lightgray:13882323,lightgreen:9498256,lightgrey:13882323,lightpink:16758465,lightsalmon:16752762,lightseagreen:2142890,lightskyblue:8900346,lightslategray:7833753,lightslategrey:7833753,lightsteelblue:11584734,lightyellow:16777184,lime:65280,limegreen:3329330,linen:16445670,magenta:16711935,maroon:8388608,mediumaquamarine:6737322,mediumblue:205,mediumorchid:12211667,mediumpurple:9662683,mediumseagreen:3978097,mediumslateblue:8087790,mediumspringgreen:64154,mediumturquoise:4772300,mediumvioletred:13047173,midnightblue:1644912,mintcream:16121850,mistyrose:16770273,moccasin:16770229,navajowhite:16768685,navy:128,oldlace:16643558,olive:8421376,olivedrab:7048739,orange:16753920,orangered:16729344,orchid:14315734,palegoldenrod:15657130,palegreen:10025880,paleturquoise:11529966,palevioletred:14381203,papayawhip:16773077,peachpuff:16767673,peru:13468991,pink:16761035,plum:14524637,powderblue:11591910,purple:8388736,rebeccapurple:6697881,red:16711680,rosybrown:12357519,royalblue:4286945,saddlebrown:9127187,salmon:16416882,sandybrown:16032864,seagreen:3050327,seashell:16774638,sienna:10506797,silver:12632256,skyblue:8900331,slateblue:6970061,slategray:7372944,slategrey:7372944,snow:16775930,springgreen:65407,steelblue:4620980,tan:13808780,teal:32896,thistle:14204888,tomato:16737095,turquoise:4251856,violet:15631086,wheat:16113331,white:16777215,whitesmoke:16119285,yellow:16776960,yellowgreen:10145074},Xi={h:0,s:0,l:0},so={h:0,s:0,l:0};function pu(r,e,t){return t<0&&(t+=1),t>1&&(t-=1),t<1/6?r+(e-r)*6*t:t<1/2?e:t<2/3?r+(e-r)*6*(2/3-t):r}var it=class{constructor(e,t,n){return this.isColor=!0,this.r=1,this.g=1,this.b=1,this.set(e,t,n)}set(e,t,n){if(t===void 0&&n===void 0){let i=e;i&&i.isColor?this.copy(i):typeof i=="number"?this.setHex(i):typeof i=="string"&&this.setStyle(i)}else this.setRGB(e,t,n);return this}setScalar(e){return this.r=e,this.g=e,this.b=e,this}setHex(e,t=tn){return e=Math.floor(e),this.r=(e>>16&255)/255,this.g=(e>>8&255)/255,this.b=(e&255)/255,tt.colorSpaceToWorking(this,t),this}setRGB(e,t,n,i=tt.workingColorSpace){return this.r=e,this.g=t,this.b=n,tt.colorSpaceToWorking(this,i),this}setHSL(e,t,n,i=tt.workingColorSpace){if(e=Mg(e,1),t=je(t,0,1),n=je(n,0,1),t===0)this.r=this.g=this.b=n;else{let s=n<=.5?n*(1+t):n+t-n*t,a=2*n-s;this.r=pu(a,s,e+1/3),this.g=pu(a,s,e),this.b=pu(a,s,e-1/3)}return tt.colorSpaceToWorking(this,i),this}setStyle(e,t=tn){function n(s){s!==void 0&&parseFloat(s)<1&&Ve("Color: Alpha component of "+e+" will be ignored.")}let i;if(i=/^(\w+)\(([^\)]*)\)/.exec(e)){let s,a=i[1],o=i[2];switch(a){case"rgb":case"rgba":if(s=/^\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*(\d*\.?\d+)\s*)?$/.exec(o))return n(s[4]),this.setRGB(Math.min(255,parseInt(s[1],10))/255,Math.min(255,parseInt(s[2],10))/255,Math.min(255,parseInt(s[3],10))/255,t);if(s=/^\s*(\d+)\%\s*,\s*(\d+)\%\s*,\s*(\d+)\%\s*(?:,\s*(\d*\.?\d+)\s*)?$/.exec(o))return n(s[4]),this.setRGB(Math.min(100,parseInt(s[1],10))/100,Math.min(100,parseInt(s[2],10))/100,Math.min(100,parseInt(s[3],10))/100,t);break;case"hsl":case"hsla":if(s=/^\s*(\d*\.?\d+)\s*,\s*(\d*\.?\d+)\%\s*,\s*(\d*\.?\d+)\%\s*(?:,\s*(\d*\.?\d+)\s*)?$/.exec(o))return n(s[4]),this.setHSL(parseFloat(s[1])/360,parseFloat(s[2])/100,parseFloat(s[3])/100,t);break;default:Ve("Color: Unknown color model "+e)}}else if(i=/^\#([A-Fa-f\d]+)$/.exec(e)){let s=i[1],a=s.length;if(a===3)return this.setRGB(parseInt(s.charAt(0),16)/15,parseInt(s.charAt(1),16)/15,parseInt(s.charAt(2),16)/15,t);if(a===6)return this.setHex(parseInt(s,16),t);Ve("Color: Invalid hex color "+e)}else if(e&&e.length>0)return this.setColorName(e,t);return this}setColorName(e,t=tn){let n=Ef[e.toLowerCase()];return n!==void 0?this.setHex(n,t):Ve("Color: Unknown color "+e),this}clone(){return new this.constructor(this.r,this.g,this.b)}copy(e){return this.r=e.r,this.g=e.g,this.b=e.b,this}copySRGBToLinear(e){return this.r=bi(e.r),this.g=bi(e.g),this.b=bi(e.b),this}copyLinearToSRGB(e){return this.r=fs(e.r),this.g=fs(e.g),this.b=fs(e.b),this}convertSRGBToLinear(){return this.copySRGBToLinear(this),this}convertLinearToSRGB(){return this.copyLinearToSRGB(this),this}getHex(e=tn){return tt.workingToColorSpace(Yt.copy(this),e),Math.round(je(Yt.r*255,0,255))*65536+Math.round(je(Yt.g*255,0,255))*256+Math.round(je(Yt.b*255,0,255))}getHexString(e=tn){return("000000"+this.getHex(e).toString(16)).slice(-6)}getHSL(e,t=tt.workingColorSpace){tt.workingToColorSpace(Yt.copy(this),t);let n=Yt.r,i=Yt.g,s=Yt.b,a=Math.max(n,i,s),o=Math.min(n,i,s),c,l,u=(o+a)/2;if(o===a)c=0,l=0;else{let h=a-o;switch(l=u<=.5?h/(a+o):h/(2-a-o),a){case n:c=(i-s)/h+(i<s?6:0);break;case i:c=(s-n)/h+2;break;case s:c=(n-i)/h+4;break}c/=6}return e.h=c,e.s=l,e.l=u,e}getRGB(e,t=tt.workingColorSpace){return tt.workingToColorSpace(Yt.copy(this),t),e.r=Yt.r,e.g=Yt.g,e.b=Yt.b,e}getStyle(e=tn){tt.workingToColorSpace(Yt.copy(this),e);let t=Yt.r,n=Yt.g,i=Yt.b;return e!==tn?`color(${e} ${t.toFixed(3)} ${n.toFixed(3)} ${i.toFixed(3)})`:`rgb(${Math.round(t*255)},${Math.round(n*255)},${Math.round(i*255)})`}offsetHSL(e,t,n){return this.getHSL(Xi),this.setHSL(Xi.h+e,Xi.s+t,Xi.l+n)}add(e){return this.r+=e.r,this.g+=e.g,this.b+=e.b,this}addColors(e,t){return this.r=e.r+t.r,this.g=e.g+t.g,this.b=e.b+t.b,this}addScalar(e){return this.r+=e,this.g+=e,this.b+=e,this}sub(e){return this.r=Math.max(0,this.r-e.r),this.g=Math.max(0,this.g-e.g),this.b=Math.max(0,this.b-e.b),this}multiply(e){return this.r*=e.r,this.g*=e.g,this.b*=e.b,this}multiplyScalar(e){return this.r*=e,this.g*=e,this.b*=e,this}lerp(e,t){return this.r+=(e.r-this.r)*t,this.g+=(e.g-this.g)*t,this.b+=(e.b-this.b)*t,this}lerpColors(e,t,n){return this.r=e.r+(t.r-e.r)*n,this.g=e.g+(t.g-e.g)*n,this.b=e.b+(t.b-e.b)*n,this}lerpHSL(e,t){this.getHSL(Xi),e.getHSL(so);let n=$c(Xi.h,so.h,t),i=$c(Xi.s,so.s,t),s=$c(Xi.l,so.l,t);return this.setHSL(n,i,s),this}setFromVector3(e){return this.r=e.x,this.g=e.y,this.b=e.z,this}applyMatrix3(e){let t=this.r,n=this.g,i=this.b,s=e.elements;return this.r=s[0]*t+s[3]*n+s[6]*i,this.g=s[1]*t+s[4]*n+s[7]*i,this.b=s[2]*t+s[5]*n+s[8]*i,this}equals(e){return e.r===this.r&&e.g===this.g&&e.b===this.b}fromArray(e,t=0){return this.r=e[t],this.g=e[t+1],this.b=e[t+2],this}toArray(e=[],t=0){return e[t]=this.r,e[t+1]=this.g,e[t+2]=this.b,e}fromBufferAttribute(e,t){return this.r=e.getX(t),this.g=e.getY(t),this.b=e.getZ(t),this}toJSON(){return this.getHex()}*[Symbol.iterator](){yield this.r,yield this.g,yield this.b}},Yt=new it;it.NAMES=Ef;var Lg=0,Rr=class extends Si{constructor(){super(),this.isMaterial=!0,Object.defineProperty(this,"id",{value:Lg++}),this.uuid=Ta(),this.name="",this.type="Material",this.blending=Ar,this.side=Mi,this.vertexColors=!1,this.opacity=1,this.transparent=!1,this.alphaHash=!1,this.blendSrc=vo,this.blendDst=yo,this.blendEquation=Zi,this.blendSrcAlpha=null,this.blendDstAlpha=null,this.blendEquationAlpha=null,this.blendColor=new it(0,0,0),this.blendAlpha=0,this.depthFunc=Er,this.depthTest=!0,this.depthWrite=!0,this.stencilWriteMask=255,this.stencilFunc=bu,this.stencilRef=0,this.stencilFuncMask=255,this.stencilFail=wr,this.stencilZFail=wr,this.stencilZPass=wr,this.stencilWrite=!1,this.clippingPlanes=null,this.clipIntersection=!1,this.clipShadows=!1,this.shadowSide=null,this.colorWrite=!0,this.precision=null,this.polygonOffset=!1,this.polygonOffsetFactor=0,this.polygonOffsetUnits=0,this.dithering=!1,this.alphaToCoverage=!1,this.premultipliedAlpha=!1,this.forceSinglePass=!1,this.allowOverride=!0,this.visible=!0,this.toneMapped=!0,this.userData={},this.version=0,this._alphaTest=0}get alphaTest(){return this._alphaTest}set alphaTest(e){this._alphaTest>0!=e>0&&this.version++,this._alphaTest=e}onBeforeRender(){}onBeforeCompile(){}customProgramCacheKey(){return this.onBeforeCompile.toString()}setValues(e){if(e!==void 0)for(let t in e){let n=e[t];if(n===void 0){Ve(`Material: parameter '${t}' has value of undefined.`);continue}let i=this[t];if(i===void 0){Ve(`Material: '${t}' is not a property of THREE.${this.type}.`);continue}i&&i.isColor?i.set(n):i&&i.isVector3&&n&&n.isVector3?i.copy(n):this[t]=n}}toJSON(e){let t=e===void 0||typeof e=="string";t&&(e={textures:{},images:{}});let n={metadata:{version:4.7,type:"Material",generator:"Material.toJSON"}};n.uuid=this.uuid,n.type=this.type,this.name!==""&&(n.name=this.name),this.color&&this.color.isColor&&(n.color=this.color.getHex()),this.roughness!==void 0&&(n.roughness=this.roughness),this.metalness!==void 0&&(n.metalness=this.metalness),this.sheen!==void 0&&(n.sheen=this.sheen),this.sheenColor&&this.sheenColor.isColor&&(n.sheenColor=this.sheenColor.getHex()),this.sheenRoughness!==void 0&&(n.sheenRoughness=this.sheenRoughness),this.emissive&&this.emissive.isColor&&(n.emissive=this.emissive.getHex()),this.emissiveIntensity!==void 0&&this.emissiveIntensity!==1&&(n.emissiveIntensity=this.emissiveIntensity),this.specular&&this.specular.isColor&&(n.specular=this.specular.getHex()),this.specularIntensity!==void 0&&(n.specularIntensity=this.specularIntensity),this.specularColor&&this.specularColor.isColor&&(n.specularColor=this.specularColor.getHex()),this.shininess!==void 0&&(n.shininess=this.shininess),this.clearcoat!==void 0&&(n.clearcoat=this.clearcoat),this.clearcoatRoughness!==void 0&&(n.clearcoatRoughness=this.clearcoatRoughness),this.clearcoatMap&&this.clearcoatMap.isTexture&&(n.clearcoatMap=this.clearcoatMap.toJSON(e).uuid),this.clearcoatRoughnessMap&&this.clearcoatRoughnessMap.isTexture&&(n.clearcoatRoughnessMap=this.clearcoatRoughnessMap.toJSON(e).uuid),this.clearcoatNormalMap&&this.clearcoatNormalMap.isTexture&&(n.clearcoatNormalMap=this.clearcoatNormalMap.toJSON(e).uuid,n.clearcoatNormalScale=this.clearcoatNormalScale.toArray()),this.sheenColorMap&&this.sheenColorMap.isTexture&&(n.sheenColorMap=this.sheenColorMap.toJSON(e).uuid),this.sheenRoughnessMap&&this.sheenRoughnessMap.isTexture&&(n.sheenRoughnessMap=this.sheenRoughnessMap.toJSON(e).uuid),this.dispersion!==void 0&&(n.dispersion=this.dispersion),this.iridescence!==void 0&&(n.iridescence=this.iridescence),this.iridescenceIOR!==void 0&&(n.iridescenceIOR=this.iridescenceIOR),this.iridescenceThicknessRange!==void 0&&(n.iridescenceThicknessRange=this.iridescenceThicknessRange),this.iridescenceMap&&this.iridescenceMap.isTexture&&(n.iridescenceMap=this.iridescenceMap.toJSON(e).uuid),this.iridescenceThicknessMap&&this.iridescenceThicknessMap.isTexture&&(n.iridescenceThicknessMap=this.iridescenceThicknessMap.toJSON(e).uuid),this.anisotropy!==void 0&&(n.anisotropy=this.anisotropy),this.anisotropyRotation!==void 0&&(n.anisotropyRotation=this.anisotropyRotation),this.anisotropyMap&&this.anisotropyMap.isTexture&&(n.anisotropyMap=this.anisotropyMap.toJSON(e).uuid),this.map&&this.map.isTexture&&(n.map=this.map.toJSON(e).uuid),this.matcap&&this.matcap.isTexture&&(n.matcap=this.matcap.toJSON(e).uuid),this.alphaMap&&this.alphaMap.isTexture&&(n.alphaMap=this.alphaMap.toJSON(e).uuid),this.lightMap&&this.lightMap.isTexture&&(n.lightMap=this.lightMap.toJSON(e).uuid,n.lightMapIntensity=this.lightMapIntensity),this.aoMap&&this.aoMap.isTexture&&(n.aoMap=this.aoMap.toJSON(e).uuid,n.aoMapIntensity=this.aoMapIntensity),this.bumpMap&&this.bumpMap.isTexture&&(n.bumpMap=this.bumpMap.toJSON(e).uuid,n.bumpScale=this.bumpScale),this.normalMap&&this.normalMap.isTexture&&(n.normalMap=this.normalMap.toJSON(e).uuid,n.normalMapType=this.normalMapType,n.normalScale=this.normalScale.toArray()),this.displacementMap&&this.displacementMap.isTexture&&(n.displacementMap=this.displacementMap.toJSON(e).uuid,n.displacementScale=this.displacementScale,n.displacementBias=this.displacementBias),this.roughnessMap&&this.roughnessMap.isTexture&&(n.roughnessMap=this.roughnessMap.toJSON(e).uuid),this.metalnessMap&&this.metalnessMap.isTexture&&(n.metalnessMap=this.metalnessMap.toJSON(e).uuid),this.emissiveMap&&this.emissiveMap.isTexture&&(n.emissiveMap=this.emissiveMap.toJSON(e).uuid),this.specularMap&&this.specularMap.isTexture&&(n.specularMap=this.specularMap.toJSON(e).uuid),this.specularIntensityMap&&this.specularIntensityMap.isTexture&&(n.specularIntensityMap=this.specularIntensityMap.toJSON(e).uuid),this.specularColorMap&&this.specularColorMap.isTexture&&(n.specularColorMap=this.specularColorMap.toJSON(e).uuid),this.envMap&&this.envMap.isTexture&&(n.envMap=this.envMap.toJSON(e).uuid,this.combine!==void 0&&(n.combine=this.combine)),this.envMapRotation!==void 0&&(n.envMapRotation=this.envMapRotation.toArray()),this.envMapIntensity!==void 0&&(n.envMapIntensity=this.envMapIntensity),this.reflectivity!==void 0&&(n.reflectivity=this.reflectivity),this.refractionRatio!==void 0&&(n.refractionRatio=this.refractionRatio),this.gradientMap&&this.gradientMap.isTexture&&(n.gradientMap=this.gradientMap.toJSON(e).uuid),this.transmission!==void 0&&(n.transmission=this.transmission),this.transmissionMap&&this.transmissionMap.isTexture&&(n.transmissionMap=this.transmissionMap.toJSON(e).uuid),this.thickness!==void 0&&(n.thickness=this.thickness),this.thicknessMap&&this.thicknessMap.isTexture&&(n.thicknessMap=this.thicknessMap.toJSON(e).uuid),this.attenuationDistance!==void 0&&this.attenuationDistance!==1/0&&(n.attenuationDistance=this.attenuationDistance),this.attenuationColor!==void 0&&(n.attenuationColor=this.attenuationColor.getHex()),this.size!==void 0&&(n.size=this.size),this.shadowSide!==null&&(n.shadowSide=this.shadowSide),this.sizeAttenuation!==void 0&&(n.sizeAttenuation=this.sizeAttenuation),this.blending!==Ar&&(n.blending=this.blending),this.side!==Mi&&(n.side=this.side),this.vertexColors===!0&&(n.vertexColors=!0),this.opacity<1&&(n.opacity=this.opacity),this.transparent===!0&&(n.transparent=!0),this.blendSrc!==vo&&(n.blendSrc=this.blendSrc),this.blendDst!==yo&&(n.blendDst=this.blendDst),this.blendEquation!==Zi&&(n.blendEquation=this.blendEquation),this.blendSrcAlpha!==null&&(n.blendSrcAlpha=this.blendSrcAlpha),this.blendDstAlpha!==null&&(n.blendDstAlpha=this.blendDstAlpha),this.blendEquationAlpha!==null&&(n.blendEquationAlpha=this.blendEquationAlpha),this.blendColor&&this.blendColor.isColor&&(n.blendColor=this.blendColor.getHex()),this.blendAlpha!==0&&(n.blendAlpha=this.blendAlpha),this.depthFunc!==Er&&(n.depthFunc=this.depthFunc),this.depthTest===!1&&(n.depthTest=this.depthTest),this.depthWrite===!1&&(n.depthWrite=this.depthWrite),this.colorWrite===!1&&(n.colorWrite=this.colorWrite),this.stencilWriteMask!==255&&(n.stencilWriteMask=this.stencilWriteMask),this.stencilFunc!==bu&&(n.stencilFunc=this.stencilFunc),this.stencilRef!==0&&(n.stencilRef=this.stencilRef),this.stencilFuncMask!==255&&(n.stencilFuncMask=this.stencilFuncMask),this.stencilFail!==wr&&(n.stencilFail=this.stencilFail),this.stencilZFail!==wr&&(n.stencilZFail=this.stencilZFail),this.stencilZPass!==wr&&(n.stencilZPass=this.stencilZPass),this.stencilWrite===!0&&(n.stencilWrite=this.stencilWrite),this.rotation!==void 0&&this.rotation!==0&&(n.rotation=this.rotation),this.polygonOffset===!0&&(n.polygonOffset=!0),this.polygonOffsetFactor!==0&&(n.polygonOffsetFactor=this.polygonOffsetFactor),this.polygonOffsetUnits!==0&&(n.polygonOffsetUnits=this.polygonOffsetUnits),this.linewidth!==void 0&&this.linewidth!==1&&(n.linewidth=this.linewidth),this.dashSize!==void 0&&(n.dashSize=this.dashSize),this.gapSize!==void 0&&(n.gapSize=this.gapSize),this.scale!==void 0&&(n.scale=this.scale),this.dithering===!0&&(n.dithering=!0),this.alphaTest>0&&(n.alphaTest=this.alphaTest),this.alphaHash===!0&&(n.alphaHash=!0),this.alphaToCoverage===!0&&(n.alphaToCoverage=!0),this.premultipliedAlpha===!0&&(n.premultipliedAlpha=!0),this.forceSinglePass===!0&&(n.forceSinglePass=!0),this.allowOverride===!1&&(n.allowOverride=!1),this.wireframe===!0&&(n.wireframe=!0),this.wireframeLinewidth>1&&(n.wireframeLinewidth=this.wireframeLinewidth),this.wireframeLinecap!=="round"&&(n.wireframeLinecap=this.wireframeLinecap),this.wireframeLinejoin!=="round"&&(n.wireframeLinejoin=this.wireframeLinejoin),this.flatShading===!0&&(n.flatShading=!0),this.visible===!1&&(n.visible=!1),this.toneMapped===!1&&(n.toneMapped=!1),this.fog===!1&&(n.fog=!1),Object.keys(this.userData).length>0&&(n.userData=this.userData);function i(s){let a=[];for(let o in s){let c=s[o];delete c.metadata,a.push(c)}return a}if(t){let s=i(e.textures),a=i(e.images);s.length>0&&(n.textures=s),a.length>0&&(n.images=a)}return n}clone(){return new this.constructor().copy(this)}copy(e){this.name=e.name,this.blending=e.blending,this.side=e.side,this.vertexColors=e.vertexColors,this.opacity=e.opacity,this.transparent=e.transparent,this.blendSrc=e.blendSrc,this.blendDst=e.blendDst,this.blendEquation=e.blendEquation,this.blendSrcAlpha=e.blendSrcAlpha,this.blendDstAlpha=e.blendDstAlpha,this.blendEquationAlpha=e.blendEquationAlpha,this.blendColor.copy(e.blendColor),this.blendAlpha=e.blendAlpha,this.depthFunc=e.depthFunc,this.depthTest=e.depthTest,this.depthWrite=e.depthWrite,this.stencilWriteMask=e.stencilWriteMask,this.stencilFunc=e.stencilFunc,this.stencilRef=e.stencilRef,this.stencilFuncMask=e.stencilFuncMask,this.stencilFail=e.stencilFail,this.stencilZFail=e.stencilZFail,this.stencilZPass=e.stencilZPass,this.stencilWrite=e.stencilWrite;let t=e.clippingPlanes,n=null;if(t!==null){let i=t.length;n=new Array(i);for(let s=0;s!==i;++s)n[s]=t[s].clone()}return this.clippingPlanes=n,this.clipIntersection=e.clipIntersection,this.clipShadows=e.clipShadows,this.shadowSide=e.shadowSide,this.colorWrite=e.colorWrite,this.precision=e.precision,this.polygonOffset=e.polygonOffset,this.polygonOffsetFactor=e.polygonOffsetFactor,this.polygonOffsetUnits=e.polygonOffsetUnits,this.dithering=e.dithering,this.alphaTest=e.alphaTest,this.alphaHash=e.alphaHash,this.alphaToCoverage=e.alphaToCoverage,this.premultipliedAlpha=e.premultipliedAlpha,this.forceSinglePass=e.forceSinglePass,this.allowOverride=e.allowOverride,this.visible=e.visible,this.toneMapped=e.toneMapped,this.userData=JSON.parse(JSON.stringify(e.userData)),this}dispose(){this.dispatchEvent({type:"dispose"})}set needsUpdate(e){e===!0&&this.version++}},Pr=class extends Rr{constructor(e){super(),this.isMeshBasicMaterial=!0,this.type="MeshBasicMaterial",this.color=new it(16777215),this.map=null,this.lightMap=null,this.lightMapIntensity=1,this.aoMap=null,this.aoMapIntensity=1,this.specularMap=null,this.alphaMap=null,this.envMap=null,this.envMapRotation=new Qn,this.combine=Cu,this.reflectivity=1,this.refractionRatio=.98,this.wireframe=!1,this.wireframeLinewidth=1,this.wireframeLinecap="round",this.wireframeLinejoin="round",this.fog=!0,this.setValues(e)}copy(e){return super.copy(e),this.color.copy(e.color),this.map=e.map,this.lightMap=e.lightMap,this.lightMapIntensity=e.lightMapIntensity,this.aoMap=e.aoMap,this.aoMapIntensity=e.aoMapIntensity,this.specularMap=e.specularMap,this.alphaMap=e.alphaMap,this.envMap=e.envMap,this.envMapRotation.copy(e.envMapRotation),this.combine=e.combine,this.reflectivity=e.reflectivity,this.refractionRatio=e.refractionRatio,this.wireframe=e.wireframe,this.wireframeLinewidth=e.wireframeLinewidth,this.wireframeLinecap=e.wireframeLinecap,this.wireframeLinejoin=e.wireframeLinejoin,this.fog=e.fog,this}};var Tt=new W,ao=new st,Ng=0,Sn=class{constructor(e,t,n=!1){if(Array.isArray(e))throw new TypeError("THREE.BufferAttribute: array should be a Typed Array.");this.isBufferAttribute=!0,Object.defineProperty(this,"id",{value:Ng++}),this.name="",this.array=e,this.itemSize=t,this.count=e!==void 0?e.length/t:0,this.normalized=n,this.usage=Mu,this.updateRanges=[],this.gpuType=Gn,this.version=0}onUploadCallback(){}set needsUpdate(e){e===!0&&this.version++}setUsage(e){return this.usage=e,this}addUpdateRange(e,t){this.updateRanges.push({start:e,count:t})}clearUpdateRanges(){this.updateRanges.length=0}copy(e){return this.name=e.name,this.array=new e.array.constructor(e.array),this.itemSize=e.itemSize,this.count=e.count,this.normalized=e.normalized,this.usage=e.usage,this.gpuType=e.gpuType,this}copyAt(e,t,n){e*=this.itemSize,n*=t.itemSize;for(let i=0,s=this.itemSize;i<s;i++)this.array[e+i]=t.array[n+i];return this}copyArray(e){return this.array.set(e),this}applyMatrix3(e){if(this.itemSize===2)for(let t=0,n=this.count;t<n;t++)ao.fromBufferAttribute(this,t),ao.applyMatrix3(e),this.setXY(t,ao.x,ao.y);else if(this.itemSize===3)for(let t=0,n=this.count;t<n;t++)Tt.fromBufferAttribute(this,t),Tt.applyMatrix3(e),this.setXYZ(t,Tt.x,Tt.y,Tt.z);return this}applyMatrix4(e){for(let t=0,n=this.count;t<n;t++)Tt.fromBufferAttribute(this,t),Tt.applyMatrix4(e),this.setXYZ(t,Tt.x,Tt.y,Tt.z);return this}applyNormalMatrix(e){for(let t=0,n=this.count;t<n;t++)Tt.fromBufferAttribute(this,t),Tt.applyNormalMatrix(e),this.setXYZ(t,Tt.x,Tt.y,Tt.z);return this}transformDirection(e){for(let t=0,n=this.count;t<n;t++)Tt.fromBufferAttribute(this,t),Tt.transformDirection(e),this.setXYZ(t,Tt.x,Tt.y,Tt.z);return this}set(e,t=0){return this.array.set(e,t),this}getComponent(e,t){let n=this.array[e*this.itemSize+t];return this.normalized&&(n=js(n,this.array)),n}setComponent(e,t,n){return this.normalized&&(n=fn(n,this.array)),this.array[e*this.itemSize+t]=n,this}getX(e){let t=this.array[e*this.itemSize];return this.normalized&&(t=js(t,this.array)),t}setX(e,t){return this.normalized&&(t=fn(t,this.array)),this.array[e*this.itemSize]=t,this}getY(e){let t=this.array[e*this.itemSize+1];return this.normalized&&(t=js(t,this.array)),t}setY(e,t){return this.normalized&&(t=fn(t,this.array)),this.array[e*this.itemSize+1]=t,this}getZ(e){let t=this.array[e*this.itemSize+2];return this.normalized&&(t=js(t,this.array)),t}setZ(e,t){return this.normalized&&(t=fn(t,this.array)),this.array[e*this.itemSize+2]=t,this}getW(e){let t=this.array[e*this.itemSize+3];return this.normalized&&(t=js(t,this.array)),t}setW(e,t){return this.normalized&&(t=fn(t,this.array)),this.array[e*this.itemSize+3]=t,this}setXY(e,t,n){return e*=this.itemSize,this.normalized&&(t=fn(t,this.array),n=fn(n,this.array)),this.array[e+0]=t,this.array[e+1]=n,this}setXYZ(e,t,n,i){return e*=this.itemSize,this.normalized&&(t=fn(t,this.array),n=fn(n,this.array),i=fn(i,this.array)),this.array[e+0]=t,this.array[e+1]=n,this.array[e+2]=i,this}setXYZW(e,t,n,i,s){return e*=this.itemSize,this.normalized&&(t=fn(t,this.array),n=fn(n,this.array),i=fn(i,this.array),s=fn(s,this.array)),this.array[e+0]=t,this.array[e+1]=n,this.array[e+2]=i,this.array[e+3]=s,this}onUpload(e){return this.onUploadCallback=e,this}clone(){return new this.constructor(this.array,this.itemSize).copy(this)}toJSON(){let e={itemSize:this.itemSize,type:this.array.constructor.name,array:Array.from(this.array),normalized:this.normalized};return this.name!==""&&(e.name=this.name),this.usage!==Mu&&(e.usage=this.usage),e}};var ca=class extends Sn{constructor(e,t,n){super(new Uint16Array(e),t,n)}};var ua=class extends Sn{constructor(e,t,n){super(new Uint32Array(e),t,n)}};var In=class extends Sn{constructor(e,t,n){super(new Float32Array(e),t,n)}},Fg=0,Pn=new At,mu=new Dn,cs=new W,Mn=new Ji,ia=new Ji,Ut=new W,jn=class r extends Si{constructor(){super(),this.isBufferGeometry=!0,Object.defineProperty(this,"id",{value:Fg++}),this.uuid=Ta(),this.name="",this.type="BufferGeometry",this.index=null,this.indirect=null,this.indirectOffset=0,this.attributes={},this.morphAttributes={},this.morphTargetsRelative=!1,this.groups=[],this.boundingBox=null,this.boundingSphere=null,this.drawRange={start:0,count:1/0},this.userData={}}getIndex(){return this.index}setIndex(e){return Array.isArray(e)?this.index=new(Xu(e)?ua:ca)(e,1):this.index=e,this}setIndirect(e,t=0){return this.indirect=e,this.indirectOffset=t,this}getIndirect(){return this.indirect}getAttribute(e){return this.attributes[e]}setAttribute(e,t){return this.attributes[e]=t,this}deleteAttribute(e){return delete this.attributes[e],this}hasAttribute(e){return this.attributes[e]!==void 0}addGroup(e,t,n=0){this.groups.push({start:e,count:t,materialIndex:n})}clearGroups(){this.groups=[]}setDrawRange(e,t){this.drawRange.start=e,this.drawRange.count=t}applyMatrix4(e){let t=this.attributes.position;t!==void 0&&(t.applyMatrix4(e),t.needsUpdate=!0);let n=this.attributes.normal;if(n!==void 0){let s=new He().getNormalMatrix(e);n.applyNormalMatrix(s),n.needsUpdate=!0}let i=this.attributes.tangent;return i!==void 0&&(i.transformDirection(e),i.needsUpdate=!0),this.boundingBox!==null&&this.computeBoundingBox(),this.boundingSphere!==null&&this.computeBoundingSphere(),this}applyQuaternion(e){return Pn.makeRotationFromQuaternion(e),this.applyMatrix4(Pn),this}rotateX(e){return Pn.makeRotationX(e),this.applyMatrix4(Pn),this}rotateY(e){return Pn.makeRotationY(e),this.applyMatrix4(Pn),this}rotateZ(e){return Pn.makeRotationZ(e),this.applyMatrix4(Pn),this}translate(e,t,n){return Pn.makeTranslation(e,t,n),this.applyMatrix4(Pn),this}scale(e,t,n){return Pn.makeScale(e,t,n),this.applyMatrix4(Pn),this}lookAt(e){return mu.lookAt(e),mu.updateMatrix(),this.applyMatrix4(mu.matrix),this}center(){return this.computeBoundingBox(),this.boundingBox.getCenter(cs).negate(),this.translate(cs.x,cs.y,cs.z),this}setFromPoints(e){let t=this.getAttribute("position");if(t===void 0){let n=[];for(let i=0,s=e.length;i<s;i++){let a=e[i];n.push(a.x,a.y,a.z||0)}this.setAttribute("position",new In(n,3))}else{let n=Math.min(e.length,t.count);for(let i=0;i<n;i++){let s=e[i];t.setXYZ(i,s.x,s.y,s.z||0)}e.length>t.count&&Ve("BufferGeometry: Buffer size too small for points data. Use .dispose() and create a new geometry."),t.needsUpdate=!0}return this}computeBoundingBox(){this.boundingBox===null&&(this.boundingBox=new Ji);let e=this.attributes.position,t=this.morphAttributes.position;if(e&&e.isGLBufferAttribute){Be("BufferGeometry.computeBoundingBox(): GLBufferAttribute requires a manual bounding box.",this),this.boundingBox.set(new W(-1/0,-1/0,-1/0),new W(1/0,1/0,1/0));return}if(e!==void 0){if(this.boundingBox.setFromBufferAttribute(e),t)for(let n=0,i=t.length;n<i;n++){let s=t[n];Mn.setFromBufferAttribute(s),this.morphTargetsRelative?(Ut.addVectors(this.boundingBox.min,Mn.min),this.boundingBox.expandByPoint(Ut),Ut.addVectors(this.boundingBox.max,Mn.max),this.boundingBox.expandByPoint(Ut)):(this.boundingBox.expandByPoint(Mn.min),this.boundingBox.expandByPoint(Mn.max))}}else this.boundingBox.makeEmpty();(isNaN(this.boundingBox.min.x)||isNaN(this.boundingBox.min.y)||isNaN(this.boundingBox.min.z))&&Be('BufferGeometry.computeBoundingBox(): Computed min/max have NaN values. The "position" attribute is likely to have NaN values.',this)}computeBoundingSphere(){this.boundingSphere===null&&(this.boundingSphere=new xs);let e=this.attributes.position,t=this.morphAttributes.position;if(e&&e.isGLBufferAttribute){Be("BufferGeometry.computeBoundingSphere(): GLBufferAttribute requires a manual bounding sphere.",this),this.boundingSphere.set(new W,1/0);return}if(e){let n=this.boundingSphere.center;if(Mn.setFromBufferAttribute(e),t)for(let s=0,a=t.length;s<a;s++){let o=t[s];ia.setFromBufferAttribute(o),this.morphTargetsRelative?(Ut.addVectors(Mn.min,ia.min),Mn.expandByPoint(Ut),Ut.addVectors(Mn.max,ia.max),Mn.expandByPoint(Ut)):(Mn.expandByPoint(ia.min),Mn.expandByPoint(ia.max))}Mn.getCenter(n);let i=0;for(let s=0,a=e.count;s<a;s++)Ut.fromBufferAttribute(e,s),i=Math.max(i,n.distanceToSquared(Ut));if(t)for(let s=0,a=t.length;s<a;s++){let o=t[s],c=this.morphTargetsRelative;for(let l=0,u=o.count;l<u;l++)Ut.fromBufferAttribute(o,l),c&&(cs.fromBufferAttribute(e,l),Ut.add(cs)),i=Math.max(i,n.distanceToSquared(Ut))}this.boundingSphere.radius=Math.sqrt(i),isNaN(this.boundingSphere.radius)&&Be('BufferGeometry.computeBoundingSphere(): Computed radius is NaN. The "position" attribute is likely to have NaN values.',this)}}computeTangents(){let e=this.index,t=this.attributes;if(e===null||t.position===void 0||t.normal===void 0||t.uv===void 0){Be("BufferGeometry: .computeTangents() failed. Missing required attributes (index, position, normal or uv)");return}let n=t.position,i=t.normal,s=t.uv;this.hasAttribute("tangent")===!1&&this.setAttribute("tangent",new Sn(new Float32Array(4*n.count),4));let a=this.getAttribute("tangent"),o=[],c=[];for(let R=0;R<n.count;R++)o[R]=new W,c[R]=new W;let l=new W,u=new W,h=new W,d=new st,f=new st,_=new st,g=new W,m=new W;function p(R,x,T){l.fromBufferAttribute(n,R),u.fromBufferAttribute(n,x),h.fromBufferAttribute(n,T),d.fromBufferAttribute(s,R),f.fromBufferAttribute(s,x),_.fromBufferAttribute(s,T),u.sub(l),h.sub(l),f.sub(d),_.sub(d);let I=1/(f.x*_.y-_.x*f.y);isFinite(I)&&(g.copy(u).multiplyScalar(_.y).addScaledVector(h,-f.y).multiplyScalar(I),m.copy(h).multiplyScalar(f.x).addScaledVector(u,-_.x).multiplyScalar(I),o[R].add(g),o[x].add(g),o[T].add(g),c[R].add(m),c[x].add(m),c[T].add(m))}let y=this.groups;y.length===0&&(y=[{start:0,count:e.count}]);for(let R=0,x=y.length;R<x;++R){let T=y[R],I=T.start,B=T.count;for(let N=I,k=I+B;N<k;N+=3)p(e.getX(N+0),e.getX(N+1),e.getX(N+2))}let w=new W,S=new W,M=new W,A=new W;function E(R){M.fromBufferAttribute(i,R),A.copy(M);let x=o[R];w.copy(x),w.sub(M.multiplyScalar(M.dot(x))).normalize(),S.crossVectors(A,x);let I=S.dot(c[R])<0?-1:1;a.setXYZW(R,w.x,w.y,w.z,I)}for(let R=0,x=y.length;R<x;++R){let T=y[R],I=T.start,B=T.count;for(let N=I,k=I+B;N<k;N+=3)E(e.getX(N+0)),E(e.getX(N+1)),E(e.getX(N+2))}}computeVertexNormals(){let e=this.index,t=this.getAttribute("position");if(t!==void 0){let n=this.getAttribute("normal");if(n===void 0)n=new Sn(new Float32Array(t.count*3),3),this.setAttribute("normal",n);else for(let d=0,f=n.count;d<f;d++)n.setXYZ(d,0,0,0);let i=new W,s=new W,a=new W,o=new W,c=new W,l=new W,u=new W,h=new W;if(e)for(let d=0,f=e.count;d<f;d+=3){let _=e.getX(d+0),g=e.getX(d+1),m=e.getX(d+2);i.fromBufferAttribute(t,_),s.fromBufferAttribute(t,g),a.fromBufferAttribute(t,m),u.subVectors(a,s),h.subVectors(i,s),u.cross(h),o.fromBufferAttribute(n,_),c.fromBufferAttribute(n,g),l.fromBufferAttribute(n,m),o.add(u),c.add(u),l.add(u),n.setXYZ(_,o.x,o.y,o.z),n.setXYZ(g,c.x,c.y,c.z),n.setXYZ(m,l.x,l.y,l.z)}else for(let d=0,f=t.count;d<f;d+=3)i.fromBufferAttribute(t,d+0),s.fromBufferAttribute(t,d+1),a.fromBufferAttribute(t,d+2),u.subVectors(a,s),h.subVectors(i,s),u.cross(h),n.setXYZ(d+0,u.x,u.y,u.z),n.setXYZ(d+1,u.x,u.y,u.z),n.setXYZ(d+2,u.x,u.y,u.z);this.normalizeNormals(),n.needsUpdate=!0}}normalizeNormals(){let e=this.attributes.normal;for(let t=0,n=e.count;t<n;t++)Ut.fromBufferAttribute(e,t),Ut.normalize(),e.setXYZ(t,Ut.x,Ut.y,Ut.z)}toNonIndexed(){function e(o,c){let l=o.array,u=o.itemSize,h=o.normalized,d=new l.constructor(c.length*u),f=0,_=0;for(let g=0,m=c.length;g<m;g++){o.isInterleavedBufferAttribute?f=c[g]*o.data.stride+o.offset:f=c[g]*u;for(let p=0;p<u;p++)d[_++]=l[f++]}return new Sn(d,u,h)}if(this.index===null)return Ve("BufferGeometry.toNonIndexed(): BufferGeometry is already non-indexed."),this;let t=new r,n=this.index.array,i=this.attributes;for(let o in i){let c=i[o],l=e(c,n);t.setAttribute(o,l)}let s=this.morphAttributes;for(let o in s){let c=[],l=s[o];for(let u=0,h=l.length;u<h;u++){let d=l[u],f=e(d,n);c.push(f)}t.morphAttributes[o]=c}t.morphTargetsRelative=this.morphTargetsRelative;let a=this.groups;for(let o=0,c=a.length;o<c;o++){let l=a[o];t.addGroup(l.start,l.count,l.materialIndex)}return t}toJSON(){let e={metadata:{version:4.7,type:"BufferGeometry",generator:"BufferGeometry.toJSON"}};if(e.uuid=this.uuid,e.type=this.type,this.name!==""&&(e.name=this.name),Object.keys(this.userData).length>0&&(e.userData=this.userData),this.parameters!==void 0){let c=this.parameters;for(let l in c)c[l]!==void 0&&(e[l]=c[l]);return e}e.data={attributes:{}};let t=this.index;t!==null&&(e.data.index={type:t.array.constructor.name,array:Array.prototype.slice.call(t.array)});let n=this.attributes;for(let c in n){let l=n[c];e.data.attributes[c]=l.toJSON(e.data)}let i={},s=!1;for(let c in this.morphAttributes){let l=this.morphAttributes[c],u=[];for(let h=0,d=l.length;h<d;h++){let f=l[h];u.push(f.toJSON(e.data))}u.length>0&&(i[c]=u,s=!0)}s&&(e.data.morphAttributes=i,e.data.morphTargetsRelative=this.morphTargetsRelative);let a=this.groups;a.length>0&&(e.data.groups=JSON.parse(JSON.stringify(a)));let o=this.boundingSphere;return o!==null&&(e.data.boundingSphere=o.toJSON()),e}clone(){return new this.constructor().copy(this)}copy(e){this.index=null,this.attributes={},this.morphAttributes={},this.groups=[],this.boundingBox=null,this.boundingSphere=null;let t={};this.name=e.name;let n=e.index;n!==null&&this.setIndex(n.clone());let i=e.attributes;for(let l in i){let u=i[l];this.setAttribute(l,u.clone(t))}let s=e.morphAttributes;for(let l in s){let u=[],h=s[l];for(let d=0,f=h.length;d<f;d++)u.push(h[d].clone(t));this.morphAttributes[l]=u}this.morphTargetsRelative=e.morphTargetsRelative;let a=e.groups;for(let l=0,u=a.length;l<u;l++){let h=a[l];this.addGroup(h.start,h.count,h.materialIndex)}let o=e.boundingBox;o!==null&&(this.boundingBox=o.clone());let c=e.boundingSphere;return c!==null&&(this.boundingSphere=c.clone()),this.drawRange.start=e.drawRange.start,this.drawRange.count=e.drawRange.count,this.userData=e.userData,this}dispose(){this.dispatchEvent({type:"dispose"})}},zd=new At,Mr=new Co,oo=new xs,Vd=new W,lo=new W,co=new W,uo=new W,gu=new W,ho=new W,Gd=new W,fo=new W,sn=class extends Dn{constructor(e=new jn,t=new Pr){super(),this.isMesh=!0,this.type="Mesh",this.geometry=e,this.material=t,this.morphTargetDictionary=void 0,this.morphTargetInfluences=void 0,this.count=1,this.updateMorphTargets()}copy(e,t){return super.copy(e,t),e.morphTargetInfluences!==void 0&&(this.morphTargetInfluences=e.morphTargetInfluences.slice()),e.morphTargetDictionary!==void 0&&(this.morphTargetDictionary=Object.assign({},e.morphTargetDictionary)),this.material=Array.isArray(e.material)?e.material.slice():e.material,this.geometry=e.geometry,this}updateMorphTargets(){let t=this.geometry.morphAttributes,n=Object.keys(t);if(n.length>0){let i=t[n[0]];if(i!==void 0){this.morphTargetInfluences=[],this.morphTargetDictionary={};for(let s=0,a=i.length;s<a;s++){let o=i[s].name||String(s);this.morphTargetInfluences.push(0),this.morphTargetDictionary[o]=s}}}}getVertexPosition(e,t){let n=this.geometry,i=n.attributes.position,s=n.morphAttributes.position,a=n.morphTargetsRelative;t.fromBufferAttribute(i,e);let o=this.morphTargetInfluences;if(s&&o){ho.set(0,0,0);for(let c=0,l=s.length;c<l;c++){let u=o[c],h=s[c];u!==0&&(gu.fromBufferAttribute(h,e),a?ho.addScaledVector(gu,u):ho.addScaledVector(gu.sub(t),u))}t.add(ho)}return t}raycast(e,t){let n=this.geometry,i=this.material,s=this.matrixWorld;i!==void 0&&(n.boundingSphere===null&&n.computeBoundingSphere(),oo.copy(n.boundingSphere),oo.applyMatrix4(s),Mr.copy(e.ray).recast(e.near),!(oo.containsPoint(Mr.origin)===!1&&(Mr.intersectSphere(oo,Vd)===null||Mr.origin.distanceToSquared(Vd)>(e.far-e.near)**2))&&(zd.copy(s).invert(),Mr.copy(e.ray).applyMatrix4(zd),!(n.boundingBox!==null&&Mr.intersectsBox(n.boundingBox)===!1)&&this._computeIntersections(e,t,Mr)))}_computeIntersections(e,t,n){let i,s=this.geometry,a=this.material,o=s.index,c=s.attributes.position,l=s.attributes.uv,u=s.attributes.uv1,h=s.attributes.normal,d=s.groups,f=s.drawRange;if(o!==null)if(Array.isArray(a))for(let _=0,g=d.length;_<g;_++){let m=d[_],p=a[m.materialIndex],y=Math.max(m.start,f.start),w=Math.min(o.count,Math.min(m.start+m.count,f.start+f.count));for(let S=y,M=w;S<M;S+=3){let A=o.getX(S),E=o.getX(S+1),R=o.getX(S+2);i=po(this,p,e,n,l,u,h,A,E,R),i&&(i.faceIndex=Math.floor(S/3),i.face.materialIndex=m.materialIndex,t.push(i))}}else{let _=Math.max(0,f.start),g=Math.min(o.count,f.start+f.count);for(let m=_,p=g;m<p;m+=3){let y=o.getX(m),w=o.getX(m+1),S=o.getX(m+2);i=po(this,a,e,n,l,u,h,y,w,S),i&&(i.faceIndex=Math.floor(m/3),t.push(i))}}else if(c!==void 0)if(Array.isArray(a))for(let _=0,g=d.length;_<g;_++){let m=d[_],p=a[m.materialIndex],y=Math.max(m.start,f.start),w=Math.min(c.count,Math.min(m.start+m.count,f.start+f.count));for(let S=y,M=w;S<M;S+=3){let A=S,E=S+1,R=S+2;i=po(this,p,e,n,l,u,h,A,E,R),i&&(i.faceIndex=Math.floor(S/3),i.face.materialIndex=m.materialIndex,t.push(i))}}else{let _=Math.max(0,f.start),g=Math.min(c.count,f.start+f.count);for(let m=_,p=g;m<p;m+=3){let y=m,w=m+1,S=m+2;i=po(this,a,e,n,l,u,h,y,w,S),i&&(i.faceIndex=Math.floor(m/3),t.push(i))}}}};function Ug(r,e,t,n,i,s,a,o){let c;if(e.side===on?c=n.intersectTriangle(a,s,i,!0,o):c=n.intersectTriangle(i,s,a,e.side===Mi,o),c===null)return null;fo.copy(o),fo.applyMatrix4(r.matrixWorld);let l=t.ray.origin.distanceTo(fo);return l<t.near||l>t.far?null:{distance:l,point:fo.clone(),object:r}}function po(r,e,t,n,i,s,a,o,c,l){r.getVertexPosition(o,lo),r.getVertexPosition(c,co),r.getVertexPosition(l,uo);let u=Ug(r,e,t,n,lo,co,uo,Gd);if(u){let h=new W;Yi.getBarycoord(Gd,lo,co,uo,h),i&&(u.uv=Yi.getInterpolatedAttribute(i,o,c,l,h,new st)),s&&(u.uv1=Yi.getInterpolatedAttribute(s,o,c,l,h,new st)),a&&(u.normal=Yi.getInterpolatedAttribute(a,o,c,l,h,new W),u.normal.dot(n.direction)>0&&u.normal.multiplyScalar(-1));let d={a:o,b:c,c:l,normal:new W,materialIndex:0};Yi.getNormal(lo,co,uo,d.normal),u.face=d,u.barycoord=h}return u}var vs=class r extends jn{constructor(e=1,t=1,n=1,i=1,s=1,a=1){super(),this.type="BoxGeometry",this.parameters={width:e,height:t,depth:n,widthSegments:i,heightSegments:s,depthSegments:a};let o=this;i=Math.floor(i),s=Math.floor(s),a=Math.floor(a);let c=[],l=[],u=[],h=[],d=0,f=0;_("z","y","x",-1,-1,n,t,e,a,s,0),_("z","y","x",1,-1,n,t,-e,a,s,1),_("x","z","y",1,1,e,n,t,i,a,2),_("x","z","y",1,-1,e,n,-t,i,a,3),_("x","y","z",1,-1,e,t,n,i,s,4),_("x","y","z",-1,-1,e,t,-n,i,s,5),this.setIndex(c),this.setAttribute("position",new In(l,3)),this.setAttribute("normal",new In(u,3)),this.setAttribute("uv",new In(h,2));function _(g,m,p,y,w,S,M,A,E,R,x){let T=S/E,I=M/R,B=S/2,N=M/2,k=A/2,V=E+1,O=R+1,z=0,$=0,ce=new W;for(let q=0;q<O;q++){let ie=q*I-N;for(let Re=0;Re<V;Re++){let Ue=Re*T-B;ce[g]=Ue*y,ce[m]=ie*w,ce[p]=k,l.push(ce.x,ce.y,ce.z),ce[g]=0,ce[m]=0,ce[p]=A>0?1:-1,u.push(ce.x,ce.y,ce.z),h.push(Re/E),h.push(1-q/R),z+=1}}for(let q=0;q<R;q++)for(let ie=0;ie<E;ie++){let Re=d+ie+V*q,Ue=d+ie+V*(q+1),ke=d+(ie+1)+V*(q+1),Oe=d+(ie+1)+V*q;c.push(Re,Ue,Oe),c.push(Ue,ke,Oe),$+=6}o.addGroup(f,$,x),f+=$,d+=z}}copy(e){return super.copy(e),this.parameters=Object.assign({},e.parameters),this}static fromJSON(e){return new r(e.width,e.height,e.depth,e.widthSegments,e.heightSegments,e.depthSegments)}};function Nr(r){let e={};for(let t in r){e[t]={};for(let n in r[t]){let i=r[t][n];i&&(i.isColor||i.isMatrix3||i.isMatrix4||i.isVector2||i.isVector3||i.isVector4||i.isTexture||i.isQuaternion)?i.isRenderTargetTexture?(Ve("UniformsUtils: Textures of render targets cannot be cloned via cloneUniforms() or mergeUniforms()."),e[t][n]=null):e[t][n]=i.clone():Array.isArray(i)?e[t][n]=i.slice():e[t][n]=i}}return e}function Zt(r){let e={};for(let t=0;t<r.length;t++){let n=Nr(r[t]);for(let i in n)e[i]=n[i]}return e}function Og(r){let e=[];for(let t=0;t<r.length;t++)e.push(r[t].clone());return e}function Yu(r){let e=r.getRenderTarget();return e===null?r.outputColorSpace:e.isXRRenderTarget===!0?e.texture.colorSpace:tt.workingColorSpace}var Cf={clone:Nr,merge:Zt},Bg=`void main() {
	gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
}`,kg=`void main() {
	gl_FragColor = vec4( 1.0, 0.0, 0.0, 1.0 );
}`,an=class extends Rr{constructor(e){super(),this.isShaderMaterial=!0,this.type="ShaderMaterial",this.defines={},this.uniforms={},this.uniformsGroups=[],this.vertexShader=Bg,this.fragmentShader=kg,this.linewidth=1,this.wireframe=!1,this.wireframeLinewidth=1,this.fog=!1,this.lights=!1,this.clipping=!1,this.forceSinglePass=!0,this.extensions={clipCullDistance:!1,multiDraw:!1},this.defaultAttributeValues={color:[1,1,1],uv:[0,0],uv1:[0,0]},this.index0AttributeName=void 0,this.uniformsNeedUpdate=!1,this.glslVersion=null,e!==void 0&&this.setValues(e)}copy(e){return super.copy(e),this.fragmentShader=e.fragmentShader,this.vertexShader=e.vertexShader,this.uniforms=Nr(e.uniforms),this.uniformsGroups=Og(e.uniformsGroups),this.defines=Object.assign({},e.defines),this.wireframe=e.wireframe,this.wireframeLinewidth=e.wireframeLinewidth,this.fog=e.fog,this.lights=e.lights,this.clipping=e.clipping,this.extensions=Object.assign({},e.extensions),this.glslVersion=e.glslVersion,this.defaultAttributeValues=Object.assign({},e.defaultAttributeValues),this.index0AttributeName=e.index0AttributeName,this.uniformsNeedUpdate=e.uniformsNeedUpdate,this}toJSON(e){let t=super.toJSON(e);t.glslVersion=this.glslVersion,t.uniforms={};for(let i in this.uniforms){let a=this.uniforms[i].value;a&&a.isTexture?t.uniforms[i]={type:"t",value:a.toJSON(e).uuid}:a&&a.isColor?t.uniforms[i]={type:"c",value:a.getHex()}:a&&a.isVector2?t.uniforms[i]={type:"v2",value:a.toArray()}:a&&a.isVector3?t.uniforms[i]={type:"v3",value:a.toArray()}:a&&a.isVector4?t.uniforms[i]={type:"v4",value:a.toArray()}:a&&a.isMatrix3?t.uniforms[i]={type:"m3",value:a.toArray()}:a&&a.isMatrix4?t.uniforms[i]={type:"m4",value:a.toArray()}:t.uniforms[i]={value:a}}Object.keys(this.defines).length>0&&(t.defines=this.defines),t.vertexShader=this.vertexShader,t.fragmentShader=this.fragmentShader,t.lights=this.lights,t.clipping=this.clipping;let n={};for(let i in this.extensions)this.extensions[i]===!0&&(n[i]=!0);return Object.keys(n).length>0&&(t.extensions=n),t}},ha=class extends Dn{constructor(){super(),this.isCamera=!0,this.type="Camera",this.matrixWorldInverse=new At,this.projectionMatrix=new At,this.projectionMatrixInverse=new At,this.coordinateSystem=kn,this._reversedDepth=!1}get reversedDepth(){return this._reversedDepth}copy(e,t){return super.copy(e,t),this.matrixWorldInverse.copy(e.matrixWorldInverse),this.projectionMatrix.copy(e.projectionMatrix),this.projectionMatrixInverse.copy(e.projectionMatrixInverse),this.coordinateSystem=e.coordinateSystem,this}getWorldDirection(e){return super.getWorldDirection(e).negate()}updateMatrixWorld(e){super.updateMatrixWorld(e),this.matrixWorldInverse.copy(this.matrixWorld).invert()}updateWorldMatrix(e,t){super.updateWorldMatrix(e,t),this.matrixWorldInverse.copy(this.matrixWorld).invert()}clone(){return new this.constructor().copy(this)}},qi=new W,Hd=new st,Wd=new st,pn=class extends ha{constructor(e=50,t=1,n=.1,i=2e3){super(),this.isPerspectiveCamera=!0,this.type="PerspectiveCamera",this.fov=e,this.zoom=1,this.near=n,this.far=i,this.focus=10,this.aspect=t,this.view=null,this.filmGauge=35,this.filmOffset=0,this.updateProjectionMatrix()}copy(e,t){return super.copy(e,t),this.fov=e.fov,this.zoom=e.zoom,this.near=e.near,this.far=e.far,this.focus=e.focus,this.aspect=e.aspect,this.view=e.view===null?null:Object.assign({},e.view),this.filmGauge=e.filmGauge,this.filmOffset=e.filmOffset,this}setFocalLength(e){let t=.5*this.getFilmHeight()/e;this.fov=wo*2*Math.atan(t),this.updateProjectionMatrix()}getFocalLength(){let e=Math.tan(Jc*.5*this.fov);return .5*this.getFilmHeight()/e}getEffectiveFOV(){return wo*2*Math.atan(Math.tan(Jc*.5*this.fov)/this.zoom)}getFilmWidth(){return this.filmGauge*Math.min(this.aspect,1)}getFilmHeight(){return this.filmGauge/Math.max(this.aspect,1)}getViewBounds(e,t,n){qi.set(-1,-1,.5).applyMatrix4(this.projectionMatrixInverse),t.set(qi.x,qi.y).multiplyScalar(-e/qi.z),qi.set(1,1,.5).applyMatrix4(this.projectionMatrixInverse),n.set(qi.x,qi.y).multiplyScalar(-e/qi.z)}getViewSize(e,t){return this.getViewBounds(e,Hd,Wd),t.subVectors(Wd,Hd)}setViewOffset(e,t,n,i,s,a){this.aspect=e/t,this.view===null&&(this.view={enabled:!0,fullWidth:1,fullHeight:1,offsetX:0,offsetY:0,width:1,height:1}),this.view.enabled=!0,this.view.fullWidth=e,this.view.fullHeight=t,this.view.offsetX=n,this.view.offsetY=i,this.view.width=s,this.view.height=a,this.updateProjectionMatrix()}clearViewOffset(){this.view!==null&&(this.view.enabled=!1),this.updateProjectionMatrix()}updateProjectionMatrix(){let e=this.near,t=e*Math.tan(Jc*.5*this.fov)/this.zoom,n=2*t,i=this.aspect*n,s=-.5*i,a=this.view;if(this.view!==null&&this.view.enabled){let c=a.fullWidth,l=a.fullHeight;s+=a.offsetX*i/c,t-=a.offsetY*n/l,i*=a.width/c,n*=a.height/l}let o=this.filmOffset;o!==0&&(s+=e*o/this.getFilmWidth()),this.projectionMatrix.makePerspective(s,s+i,t,t-n,e,this.far,this.coordinateSystem,this.reversedDepth),this.projectionMatrixInverse.copy(this.projectionMatrix).invert()}toJSON(e){let t=super.toJSON(e);return t.object.fov=this.fov,t.object.zoom=this.zoom,t.object.near=this.near,t.object.far=this.far,t.object.focus=this.focus,t.object.aspect=this.aspect,this.view!==null&&(t.object.view=Object.assign({},this.view)),t.object.filmGauge=this.filmGauge,t.object.filmOffset=this.filmOffset,t}},us=-90,hs=1,Ro=class extends Dn{constructor(e,t,n){super(),this.type="CubeCamera",this.renderTarget=n,this.coordinateSystem=null,this.activeMipmapLevel=0;let i=new pn(us,hs,e,t);i.layers=this.layers,this.add(i);let s=new pn(us,hs,e,t);s.layers=this.layers,this.add(s);let a=new pn(us,hs,e,t);a.layers=this.layers,this.add(a);let o=new pn(us,hs,e,t);o.layers=this.layers,this.add(o);let c=new pn(us,hs,e,t);c.layers=this.layers,this.add(c);let l=new pn(us,hs,e,t);l.layers=this.layers,this.add(l)}updateCoordinateSystem(){let e=this.coordinateSystem,t=this.children.concat(),[n,i,s,a,o,c]=t;for(let l of t)this.remove(l);if(e===kn)n.up.set(0,1,0),n.lookAt(1,0,0),i.up.set(0,1,0),i.lookAt(-1,0,0),s.up.set(0,0,-1),s.lookAt(0,1,0),a.up.set(0,0,1),a.lookAt(0,-1,0),o.up.set(0,1,0),o.lookAt(0,0,1),c.up.set(0,1,0),c.lookAt(0,0,-1);else if(e===aa)n.up.set(0,-1,0),n.lookAt(-1,0,0),i.up.set(0,-1,0),i.lookAt(1,0,0),s.up.set(0,0,1),s.lookAt(0,1,0),a.up.set(0,0,-1),a.lookAt(0,-1,0),o.up.set(0,-1,0),o.lookAt(0,0,1),c.up.set(0,-1,0),c.lookAt(0,0,-1);else throw new Error("THREE.CubeCamera.updateCoordinateSystem(): Invalid coordinate system: "+e);for(let l of t)this.add(l),l.updateMatrixWorld()}update(e,t){this.parent===null&&this.updateMatrixWorld();let{renderTarget:n,activeMipmapLevel:i}=this;this.coordinateSystem!==e.coordinateSystem&&(this.coordinateSystem=e.coordinateSystem,this.updateCoordinateSystem());let[s,a,o,c,l,u]=this.children,h=e.getRenderTarget(),d=e.getActiveCubeFace(),f=e.getActiveMipmapLevel(),_=e.xr.enabled;e.xr.enabled=!1;let g=n.texture.generateMipmaps;n.texture.generateMipmaps=!1,e.setRenderTarget(n,0,i),e.render(t,s),e.setRenderTarget(n,1,i),e.render(t,a),e.setRenderTarget(n,2,i),e.render(t,o),e.setRenderTarget(n,3,i),e.render(t,c),e.setRenderTarget(n,4,i),e.render(t,l),n.texture.generateMipmaps=g,e.setRenderTarget(n,5,i),e.render(t,u),e.setRenderTarget(h,d,f),e.xr.enabled=_,n.texture.needsPMREMUpdate=!0}},da=class extends nn{constructor(e=[],t=tr,n,i,s,a,o,c,l,u){super(e,t,n,i,s,a,o,c,l,u),this.isCubeTexture=!0,this.flipY=!1}get images(){return this.image}set images(e){this.image=e}},fa=class extends rn{constructor(e=1,t={}){super(e,e,t),this.isWebGLCubeRenderTarget=!0;let n={width:e,height:e,depth:1},i=[n,n,n,n,n,n];this.texture=new da(i),this._setTextureOptions(t),this.texture.isRenderTargetTexture=!0}fromEquirectangularTexture(e,t){this.texture.type=t.type,this.texture.colorSpace=t.colorSpace,this.texture.generateMipmaps=t.generateMipmaps,this.texture.minFilter=t.minFilter,this.texture.magFilter=t.magFilter;let n={uniforms:{tEquirect:{value:null}},vertexShader:`

				varying vec3 vWorldDirection;

				vec3 transformDirection( in vec3 dir, in mat4 matrix ) {

					return normalize( ( matrix * vec4( dir, 0.0 ) ).xyz );

				}

				void main() {

					vWorldDirection = transformDirection( position, modelMatrix );

					#include <begin_vertex>
					#include <project_vertex>

				}
			`,fragmentShader:`

				uniform sampler2D tEquirect;

				varying vec3 vWorldDirection;

				#include <common>

				void main() {

					vec3 direction = normalize( vWorldDirection );

					vec2 sampleUV = equirectUv( direction );

					gl_FragColor = texture2D( tEquirect, sampleUV );

				}
			`},i=new vs(5,5,5),s=new an({name:"CubemapFromEquirect",uniforms:Nr(n.uniforms),vertexShader:n.vertexShader,fragmentShader:n.fragmentShader,side:on,blending:ti});s.uniforms.tEquirect.value=t;let a=new sn(i,s),o=t.minFilter;return t.minFilter===ni&&(t.minFilter=Rt),new Ro(1,10,this).update(e,a),t.minFilter=o,a.geometry.dispose(),a.material.dispose(),this}clear(e,t=!0,n=!0,i=!0){let s=e.getRenderTarget();for(let a=0;a<6;a++)e.setRenderTarget(this,a),e.clear(t,n,i);e.setRenderTarget(s)}},Tr=class extends Dn{constructor(){super(),this.isGroup=!0,this.type="Group"}},zg={type:"move"},ys=class{constructor(){this._targetRay=null,this._grip=null,this._hand=null}getHandSpace(){return this._hand===null&&(this._hand=new Tr,this._hand.matrixAutoUpdate=!1,this._hand.visible=!1,this._hand.joints={},this._hand.inputState={pinching:!1}),this._hand}getTargetRaySpace(){return this._targetRay===null&&(this._targetRay=new Tr,this._targetRay.matrixAutoUpdate=!1,this._targetRay.visible=!1,this._targetRay.hasLinearVelocity=!1,this._targetRay.linearVelocity=new W,this._targetRay.hasAngularVelocity=!1,this._targetRay.angularVelocity=new W),this._targetRay}getGripSpace(){return this._grip===null&&(this._grip=new Tr,this._grip.matrixAutoUpdate=!1,this._grip.visible=!1,this._grip.hasLinearVelocity=!1,this._grip.linearVelocity=new W,this._grip.hasAngularVelocity=!1,this._grip.angularVelocity=new W),this._grip}dispatchEvent(e){return this._targetRay!==null&&this._targetRay.dispatchEvent(e),this._grip!==null&&this._grip.dispatchEvent(e),this._hand!==null&&this._hand.dispatchEvent(e),this}connect(e){if(e&&e.hand){let t=this._hand;if(t)for(let n of e.hand.values())this._getHandJoint(t,n)}return this.dispatchEvent({type:"connected",data:e}),this}disconnect(e){return this.dispatchEvent({type:"disconnected",data:e}),this._targetRay!==null&&(this._targetRay.visible=!1),this._grip!==null&&(this._grip.visible=!1),this._hand!==null&&(this._hand.visible=!1),this}update(e,t,n){let i=null,s=null,a=null,o=this._targetRay,c=this._grip,l=this._hand;if(e&&t.session.visibilityState!=="visible-blurred"){if(l&&e.hand){a=!0;for(let g of e.hand.values()){let m=t.getJointPose(g,n),p=this._getHandJoint(l,g);m!==null&&(p.matrix.fromArray(m.transform.matrix),p.matrix.decompose(p.position,p.rotation,p.scale),p.matrixWorldNeedsUpdate=!0,p.jointRadius=m.radius),p.visible=m!==null}let u=l.joints["index-finger-tip"],h=l.joints["thumb-tip"],d=u.position.distanceTo(h.position),f=.02,_=.005;l.inputState.pinching&&d>f+_?(l.inputState.pinching=!1,this.dispatchEvent({type:"pinchend",handedness:e.handedness,target:this})):!l.inputState.pinching&&d<=f-_&&(l.inputState.pinching=!0,this.dispatchEvent({type:"pinchstart",handedness:e.handedness,target:this}))}else c!==null&&e.gripSpace&&(s=t.getPose(e.gripSpace,n),s!==null&&(c.matrix.fromArray(s.transform.matrix),c.matrix.decompose(c.position,c.rotation,c.scale),c.matrixWorldNeedsUpdate=!0,s.linearVelocity?(c.hasLinearVelocity=!0,c.linearVelocity.copy(s.linearVelocity)):c.hasLinearVelocity=!1,s.angularVelocity?(c.hasAngularVelocity=!0,c.angularVelocity.copy(s.angularVelocity)):c.hasAngularVelocity=!1));o!==null&&(i=t.getPose(e.targetRaySpace,n),i===null&&s!==null&&(i=s),i!==null&&(o.matrix.fromArray(i.transform.matrix),o.matrix.decompose(o.position,o.rotation,o.scale),o.matrixWorldNeedsUpdate=!0,i.linearVelocity?(o.hasLinearVelocity=!0,o.linearVelocity.copy(i.linearVelocity)):o.hasLinearVelocity=!1,i.angularVelocity?(o.hasAngularVelocity=!0,o.angularVelocity.copy(i.angularVelocity)):o.hasAngularVelocity=!1,this.dispatchEvent(zg)))}return o!==null&&(o.visible=i!==null),c!==null&&(c.visible=s!==null),l!==null&&(l.visible=a!==null),this}_getHandJoint(e,t){if(e.joints[t.jointName]===void 0){let n=new Tr;n.matrixAutoUpdate=!1,n.visible=!1,e.joints[t.jointName]=n,e.add(n)}return e.joints[t.jointName]}};var bs=class extends Dn{constructor(){super(),this.isScene=!0,this.type="Scene",this.background=null,this.environment=null,this.fog=null,this.backgroundBlurriness=0,this.backgroundIntensity=1,this.backgroundRotation=new Qn,this.environmentIntensity=1,this.environmentRotation=new Qn,this.overrideMaterial=null,typeof __THREE_DEVTOOLS__<"u"&&__THREE_DEVTOOLS__.dispatchEvent(new CustomEvent("observe",{detail:this}))}copy(e,t){return super.copy(e,t),e.background!==null&&(this.background=e.background.clone()),e.environment!==null&&(this.environment=e.environment.clone()),e.fog!==null&&(this.fog=e.fog.clone()),this.backgroundBlurriness=e.backgroundBlurriness,this.backgroundIntensity=e.backgroundIntensity,this.backgroundRotation.copy(e.backgroundRotation),this.environmentIntensity=e.environmentIntensity,this.environmentRotation.copy(e.environmentRotation),e.overrideMaterial!==null&&(this.overrideMaterial=e.overrideMaterial.clone()),this.matrixAutoUpdate=e.matrixAutoUpdate,this}toJSON(e){let t=super.toJSON(e);return this.fog!==null&&(t.object.fog=this.fog.toJSON()),this.backgroundBlurriness>0&&(t.object.backgroundBlurriness=this.backgroundBlurriness),this.backgroundIntensity!==1&&(t.object.backgroundIntensity=this.backgroundIntensity),t.object.backgroundRotation=this.backgroundRotation.toArray(),this.environmentIntensity!==1&&(t.object.environmentIntensity=this.environmentIntensity),t.object.environmentRotation=this.environmentRotation.toArray(),t}};var Po=class extends nn{constructor(e=null,t=1,n=1,i,s,a,o,c,l=Ot,u=Ot,h,d){super(null,a,o,c,l,u,i,s,h,d),this.isDataTexture=!0,this.image={data:e,width:t,height:n},this.generateMipmaps=!1,this.flipY=!1,this.unpackAlignment=1}};var _u=new W,Vg=new W,Gg=new He,Jn=class{constructor(e=new W(1,0,0),t=0){this.isPlane=!0,this.normal=e,this.constant=t}set(e,t){return this.normal.copy(e),this.constant=t,this}setComponents(e,t,n,i){return this.normal.set(e,t,n),this.constant=i,this}setFromNormalAndCoplanarPoint(e,t){return this.normal.copy(e),this.constant=-t.dot(this.normal),this}setFromCoplanarPoints(e,t,n){let i=_u.subVectors(n,t).cross(Vg.subVectors(e,t)).normalize();return this.setFromNormalAndCoplanarPoint(i,e),this}copy(e){return this.normal.copy(e.normal),this.constant=e.constant,this}normalize(){let e=1/this.normal.length();return this.normal.multiplyScalar(e),this.constant*=e,this}negate(){return this.constant*=-1,this.normal.negate(),this}distanceToPoint(e){return this.normal.dot(e)+this.constant}distanceToSphere(e){return this.distanceToPoint(e.center)-e.radius}projectPoint(e,t){return t.copy(e).addScaledVector(this.normal,-this.distanceToPoint(e))}intersectLine(e,t){let n=e.delta(_u),i=this.normal.dot(n);if(i===0)return this.distanceToPoint(e.start)===0?t.copy(e.start):null;let s=-(e.start.dot(this.normal)+this.constant)/i;return s<0||s>1?null:t.copy(e.start).addScaledVector(n,s)}intersectsLine(e){let t=this.distanceToPoint(e.start),n=this.distanceToPoint(e.end);return t<0&&n>0||n<0&&t>0}intersectsBox(e){return e.intersectsPlane(this)}intersectsSphere(e){return e.intersectsPlane(this)}coplanarPoint(e){return e.copy(this.normal).multiplyScalar(-this.constant)}applyMatrix4(e,t){let n=t||Gg.getNormalMatrix(e),i=this.coplanarPoint(_u).applyMatrix4(e),s=this.normal.applyMatrix3(n).normalize();return this.constant=-i.dot(s),this}translate(e){return this.constant-=e.dot(this.normal),this}equals(e){return e.normal.equals(this.normal)&&e.constant===this.constant}clone(){return new this.constructor().copy(this)}},Sr=new xs,Hg=new st(.5,.5),mo=new W,pa=class{constructor(e=new Jn,t=new Jn,n=new Jn,i=new Jn,s=new Jn,a=new Jn){this.planes=[e,t,n,i,s,a]}set(e,t,n,i,s,a){let o=this.planes;return o[0].copy(e),o[1].copy(t),o[2].copy(n),o[3].copy(i),o[4].copy(s),o[5].copy(a),this}copy(e){let t=this.planes;for(let n=0;n<6;n++)t[n].copy(e.planes[n]);return this}setFromProjectionMatrix(e,t=kn,n=!1){let i=this.planes,s=e.elements,a=s[0],o=s[1],c=s[2],l=s[3],u=s[4],h=s[5],d=s[6],f=s[7],_=s[8],g=s[9],m=s[10],p=s[11],y=s[12],w=s[13],S=s[14],M=s[15];if(i[0].setComponents(l-a,f-u,p-_,M-y).normalize(),i[1].setComponents(l+a,f+u,p+_,M+y).normalize(),i[2].setComponents(l+o,f+h,p+g,M+w).normalize(),i[3].setComponents(l-o,f-h,p-g,M-w).normalize(),n)i[4].setComponents(c,d,m,S).normalize(),i[5].setComponents(l-c,f-d,p-m,M-S).normalize();else if(i[4].setComponents(l-c,f-d,p-m,M-S).normalize(),t===kn)i[5].setComponents(l+c,f+d,p+m,M+S).normalize();else if(t===aa)i[5].setComponents(c,d,m,S).normalize();else throw new Error("THREE.Frustum.setFromProjectionMatrix(): Invalid coordinate system: "+t);return this}intersectsObject(e){if(e.boundingSphere!==void 0)e.boundingSphere===null&&e.computeBoundingSphere(),Sr.copy(e.boundingSphere).applyMatrix4(e.matrixWorld);else{let t=e.geometry;t.boundingSphere===null&&t.computeBoundingSphere(),Sr.copy(t.boundingSphere).applyMatrix4(e.matrixWorld)}return this.intersectsSphere(Sr)}intersectsSprite(e){Sr.center.set(0,0,0);let t=Hg.distanceTo(e.center);return Sr.radius=.7071067811865476+t,Sr.applyMatrix4(e.matrixWorld),this.intersectsSphere(Sr)}intersectsSphere(e){let t=this.planes,n=e.center,i=-e.radius;for(let s=0;s<6;s++)if(t[s].distanceToPoint(n)<i)return!1;return!0}intersectsBox(e){let t=this.planes;for(let n=0;n<6;n++){let i=t[n];if(mo.x=i.normal.x>0?e.max.x:e.min.x,mo.y=i.normal.y>0?e.max.y:e.min.y,mo.z=i.normal.z>0?e.max.z:e.min.z,i.distanceToPoint(mo)<0)return!1}return!0}containsPoint(e){let t=this.planes;for(let n=0;n<6;n++)if(t[n].distanceToPoint(e)<0)return!1;return!0}clone(){return new this.constructor().copy(this)}};var $i=class extends nn{constructor(e,t,n=Vn,i,s,a,o=Ot,c=Ot,l,u=Kn,h=1){if(u!==Kn&&u!==nr)throw new Error("DepthTexture format must be either THREE.DepthFormat or THREE.DepthStencilFormat");let d={width:e,height:t,depth:h};super(d,i,s,a,o,c,u,n,l),this.isDepthTexture=!0,this.flipY=!1,this.generateMipmaps=!1,this.compareFunction=null}copy(e){return super.copy(e),this.source=new _s(Object.assign({},e.image)),this.compareFunction=e.compareFunction,this}toJSON(e){let t=super.toJSON(e);return this.compareFunction!==null&&(t.compareFunction=this.compareFunction),t}},Io=class extends $i{constructor(e,t=Vn,n=tr,i,s,a=Ot,o=Ot,c,l=Kn){let u={width:e,height:e,depth:1},h=[u,u,u,u,u,u];super(e,e,t,n,i,s,a,o,c,l),this.image=h,this.isCubeDepthTexture=!0,this.isCubeTexture=!0}get images(){return this.image}set images(e){this.image=e}},ma=class extends nn{constructor(e=null){super(),this.sourceTexture=e,this.isExternalTexture=!0}copy(e){return super.copy(e),this.sourceTexture=e.sourceTexture,this}};var Ki=class r extends jn{constructor(e=1,t=1,n=1,i=1){super(),this.type="PlaneGeometry",this.parameters={width:e,height:t,widthSegments:n,heightSegments:i};let s=e/2,a=t/2,o=Math.floor(n),c=Math.floor(i),l=o+1,u=c+1,h=e/o,d=t/c,f=[],_=[],g=[],m=[];for(let p=0;p<u;p++){let y=p*d-a;for(let w=0;w<l;w++){let S=w*h-s;_.push(S,-y,0),g.push(0,0,1),m.push(w/o),m.push(1-p/c)}}for(let p=0;p<c;p++)for(let y=0;y<o;y++){let w=y+l*p,S=y+l*(p+1),M=y+1+l*(p+1),A=y+1+l*p;f.push(w,S,A),f.push(S,M,A)}this.setIndex(f),this.setAttribute("position",new In(_,3)),this.setAttribute("normal",new In(g,3)),this.setAttribute("uv",new In(m,2))}copy(e){return super.copy(e),this.parameters=Object.assign({},e.parameters),this}static fromJSON(e){return new r(e.width,e.height,e.widthSegments,e.heightSegments)}};var Do=class extends an{constructor(e){super(e),this.isRawShaderMaterial=!0,this.type="RawShaderMaterial"}};var Lo=class extends Rr{constructor(e){super(),this.isMeshDepthMaterial=!0,this.type="MeshDepthMaterial",this.depthPacking=gf,this.map=null,this.alphaMap=null,this.displacementMap=null,this.displacementScale=1,this.displacementBias=0,this.wireframe=!1,this.wireframeLinewidth=1,this.setValues(e)}copy(e){return super.copy(e),this.depthPacking=e.depthPacking,this.map=e.map,this.alphaMap=e.alphaMap,this.displacementMap=e.displacementMap,this.displacementScale=e.displacementScale,this.displacementBias=e.displacementBias,this.wireframe=e.wireframe,this.wireframeLinewidth=e.wireframeLinewidth,this}},No=class extends Rr{constructor(e){super(),this.isMeshDistanceMaterial=!0,this.type="MeshDistanceMaterial",this.map=null,this.alphaMap=null,this.displacementMap=null,this.displacementScale=1,this.displacementBias=0,this.setValues(e)}copy(e){return super.copy(e),this.map=e.map,this.alphaMap=e.alphaMap,this.displacementMap=e.displacementMap,this.displacementScale=e.displacementScale,this.displacementBias=e.displacementBias,this}};function go(r,e){return!r||r.constructor===e?r:typeof e.BYTES_PER_ELEMENT=="number"?new e(r):Array.prototype.slice.call(r)}var Ir=class{constructor(e,t,n,i){this.parameterPositions=e,this._cachedIndex=0,this.resultBuffer=i!==void 0?i:new t.constructor(n),this.sampleValues=t,this.valueSize=n,this.settings=null,this.DefaultSettings_={}}evaluate(e){let t=this.parameterPositions,n=this._cachedIndex,i=t[n],s=t[n-1];n:{e:{let a;t:{i:if(!(e<i)){for(let o=n+2;;){if(i===void 0){if(e<s)break i;return n=t.length,this._cachedIndex=n,this.copySampleValue_(n-1)}if(n===o)break;if(s=i,i=t[++n],e<i)break e}a=t.length;break t}if(!(e>=s)){let o=t[1];e<o&&(n=2,s=o);for(let c=n-2;;){if(s===void 0)return this._cachedIndex=0,this.copySampleValue_(0);if(n===c)break;if(i=s,s=t[--n-1],e>=s)break e}a=n,n=0;break t}break n}for(;n<a;){let o=n+a>>>1;e<t[o]?a=o:n=o+1}if(i=t[n],s=t[n-1],s===void 0)return this._cachedIndex=0,this.copySampleValue_(0);if(i===void 0)return n=t.length,this._cachedIndex=n,this.copySampleValue_(n-1)}this._cachedIndex=n,this.intervalChanged_(n,s,i)}return this.interpolate_(n,s,e,i)}getSettings_(){return this.settings||this.DefaultSettings_}copySampleValue_(e){let t=this.resultBuffer,n=this.sampleValues,i=this.valueSize,s=e*i;for(let a=0;a!==i;++a)t[a]=n[s+a];return t}interpolate_(){throw new Error("call to abstract method")}intervalChanged_(){}},Fo=class extends Ir{constructor(e,t,n,i){super(e,t,n,i),this._weightPrev=-0,this._offsetPrev=-0,this._weightNext=-0,this._offsetNext=-0,this.DefaultSettings_={endingStart:xu,endingEnd:xu}}intervalChanged_(e,t,n){let i=this.parameterPositions,s=e-2,a=e+1,o=i[s],c=i[a];if(o===void 0)switch(this.getSettings_().endingStart){case vu:s=e,o=2*t-n;break;case yu:s=i.length-2,o=t+i[s]-i[s+1];break;default:s=e,o=n}if(c===void 0)switch(this.getSettings_().endingEnd){case vu:a=e,c=2*n-t;break;case yu:a=1,c=n+i[1]-i[0];break;default:a=e-1,c=t}let l=(n-t)*.5,u=this.valueSize;this._weightPrev=l/(t-o),this._weightNext=l/(c-n),this._offsetPrev=s*u,this._offsetNext=a*u}interpolate_(e,t,n,i){let s=this.resultBuffer,a=this.sampleValues,o=this.valueSize,c=e*o,l=c-o,u=this._offsetPrev,h=this._offsetNext,d=this._weightPrev,f=this._weightNext,_=(n-t)/(i-t),g=_*_,m=g*_,p=-d*m+2*d*g-d*_,y=(1+d)*m+(-1.5-2*d)*g+(-.5+d)*_+1,w=(-1-f)*m+(1.5+f)*g+.5*_,S=f*m-f*g;for(let M=0;M!==o;++M)s[M]=p*a[u+M]+y*a[l+M]+w*a[c+M]+S*a[h+M];return s}},Uo=class extends Ir{constructor(e,t,n,i){super(e,t,n,i)}interpolate_(e,t,n,i){let s=this.resultBuffer,a=this.sampleValues,o=this.valueSize,c=e*o,l=c-o,u=(n-t)/(i-t),h=1-u;for(let d=0;d!==o;++d)s[d]=a[l+d]*h+a[c+d]*u;return s}},Oo=class extends Ir{constructor(e,t,n,i){super(e,t,n,i)}interpolate_(e){return this.copySampleValue_(e-1)}},wn=class{constructor(e,t,n,i){if(e===void 0)throw new Error("THREE.KeyframeTrack: track name is undefined");if(t===void 0||t.length===0)throw new Error("THREE.KeyframeTrack: no keyframes in track named "+e);this.name=e,this.times=go(t,this.TimeBufferType),this.values=go(n,this.ValueBufferType),this.setInterpolation(i||this.DefaultInterpolation)}static toJSON(e){let t=e.constructor,n;if(t.toJSON!==this.toJSON)n=t.toJSON(e);else{n={name:e.name,times:go(e.times,Array),values:go(e.values,Array)};let i=e.getInterpolation();i!==e.DefaultInterpolation&&(n.interpolation=i)}return n.type=e.ValueTypeName,n}InterpolantFactoryMethodDiscrete(e){return new Oo(this.times,this.values,this.getValueSize(),e)}InterpolantFactoryMethodLinear(e){return new Uo(this.times,this.values,this.getValueSize(),e)}InterpolantFactoryMethodSmooth(e){return new Fo(this.times,this.values,this.getValueSize(),e)}setInterpolation(e){let t;switch(e){case ra:t=this.InterpolantFactoryMethodDiscrete;break;case So:t=this.InterpolantFactoryMethodLinear;break;case _o:t=this.InterpolantFactoryMethodSmooth;break}if(t===void 0){let n="unsupported interpolation for "+this.ValueTypeName+" keyframe track named "+this.name;if(this.createInterpolant===void 0)if(e!==this.DefaultInterpolation)this.setInterpolation(this.DefaultInterpolation);else throw new Error(n);return Ve("KeyframeTrack:",n),this}return this.createInterpolant=t,this}getInterpolation(){switch(this.createInterpolant){case this.InterpolantFactoryMethodDiscrete:return ra;case this.InterpolantFactoryMethodLinear:return So;case this.InterpolantFactoryMethodSmooth:return _o}}getValueSize(){return this.values.length/this.times.length}shift(e){if(e!==0){let t=this.times;for(let n=0,i=t.length;n!==i;++n)t[n]+=e}return this}scale(e){if(e!==1){let t=this.times;for(let n=0,i=t.length;n!==i;++n)t[n]*=e}return this}trim(e,t){let n=this.times,i=n.length,s=0,a=i-1;for(;s!==i&&n[s]<e;)++s;for(;a!==-1&&n[a]>t;)--a;if(++a,s!==0||a!==i){s>=a&&(a=Math.max(a,1),s=a-1);let o=this.getValueSize();this.times=n.slice(s,a),this.values=this.values.slice(s*o,a*o)}return this}validate(){let e=!0,t=this.getValueSize();t-Math.floor(t)!==0&&(Be("KeyframeTrack: Invalid value size in track.",this),e=!1);let n=this.times,i=this.values,s=n.length;s===0&&(Be("KeyframeTrack: Track is empty.",this),e=!1);let a=null;for(let o=0;o!==s;o++){let c=n[o];if(typeof c=="number"&&isNaN(c)){Be("KeyframeTrack: Time is not a valid number.",this,o,c),e=!1;break}if(a!==null&&a>c){Be("KeyframeTrack: Out of order keys.",this,o,c,a),e=!1;break}a=c}if(i!==void 0&&bg(i))for(let o=0,c=i.length;o!==c;++o){let l=i[o];if(isNaN(l)){Be("KeyframeTrack: Value is not a valid number.",this,o,l),e=!1;break}}return e}optimize(){let e=this.times.slice(),t=this.values.slice(),n=this.getValueSize(),i=this.getInterpolation()===_o,s=e.length-1,a=1;for(let o=1;o<s;++o){let c=!1,l=e[o],u=e[o+1];if(l!==u&&(o!==1||l!==e[0]))if(i)c=!0;else{let h=o*n,d=h-n,f=h+n;for(let _=0;_!==n;++_){let g=t[h+_];if(g!==t[d+_]||g!==t[f+_]){c=!0;break}}}if(c){if(o!==a){e[a]=e[o];let h=o*n,d=a*n;for(let f=0;f!==n;++f)t[d+f]=t[h+f]}++a}}if(s>0){e[a]=e[s];for(let o=s*n,c=a*n,l=0;l!==n;++l)t[c+l]=t[o+l];++a}return a!==e.length?(this.times=e.slice(0,a),this.values=t.slice(0,a*n)):(this.times=e,this.values=t),this}clone(){let e=this.times.slice(),t=this.values.slice(),n=this.constructor,i=new n(this.name,e,t);return i.createInterpolant=this.createInterpolant,i}};wn.prototype.ValueTypeName="";wn.prototype.TimeBufferType=Float32Array;wn.prototype.ValueBufferType=Float32Array;wn.prototype.DefaultInterpolation=So;var Qi=class extends wn{constructor(e,t,n){super(e,t,n)}};Qi.prototype.ValueTypeName="bool";Qi.prototype.ValueBufferType=Array;Qi.prototype.DefaultInterpolation=ra;Qi.prototype.InterpolantFactoryMethodLinear=void 0;Qi.prototype.InterpolantFactoryMethodSmooth=void 0;var Bo=class extends wn{constructor(e,t,n,i){super(e,t,n,i)}};Bo.prototype.ValueTypeName="color";var ko=class extends wn{constructor(e,t,n,i){super(e,t,n,i)}};ko.prototype.ValueTypeName="number";var zo=class extends Ir{constructor(e,t,n,i){super(e,t,n,i)}interpolate_(e,t,n,i){let s=this.resultBuffer,a=this.sampleValues,o=this.valueSize,c=(n-t)/(i-t),l=e*o;for(let u=l+o;l!==u;l+=4)wi.slerpFlat(s,0,a,l-o,a,l,c);return s}},ga=class extends wn{constructor(e,t,n,i){super(e,t,n,i)}InterpolantFactoryMethodLinear(e){return new zo(this.times,this.values,this.getValueSize(),e)}};ga.prototype.ValueTypeName="quaternion";ga.prototype.InterpolantFactoryMethodSmooth=void 0;var ji=class extends wn{constructor(e,t,n){super(e,t,n)}};ji.prototype.ValueTypeName="string";ji.prototype.ValueBufferType=Array;ji.prototype.DefaultInterpolation=ra;ji.prototype.InterpolantFactoryMethodLinear=void 0;ji.prototype.InterpolantFactoryMethodSmooth=void 0;var Vo=class extends wn{constructor(e,t,n,i){super(e,t,n,i)}};Vo.prototype.ValueTypeName="vector";var xo={enabled:!1,files:{},add:function(r,e){this.enabled!==!1&&(this.files[r]=e)},get:function(r){if(this.enabled!==!1)return this.files[r]},remove:function(r){delete this.files[r]},clear:function(){this.files={}}},Go=class{constructor(e,t,n){let i=this,s=!1,a=0,o=0,c,l=[];this.onStart=void 0,this.onLoad=e,this.onProgress=t,this.onError=n,this._abortController=null,this.itemStart=function(u){o++,s===!1&&i.onStart!==void 0&&i.onStart(u,a,o),s=!0},this.itemEnd=function(u){a++,i.onProgress!==void 0&&i.onProgress(u,a,o),a===o&&(s=!1,i.onLoad!==void 0&&i.onLoad())},this.itemError=function(u){i.onError!==void 0&&i.onError(u)},this.resolveURL=function(u){return c?c(u):u},this.setURLModifier=function(u){return c=u,this},this.addHandler=function(u,h){return l.push(u,h),this},this.removeHandler=function(u){let h=l.indexOf(u);return h!==-1&&l.splice(h,2),this},this.getHandler=function(u){for(let h=0,d=l.length;h<d;h+=2){let f=l[h],_=l[h+1];if(f.global&&(f.lastIndex=0),f.test(u))return _}return null},this.abort=function(){return this.abortController.abort(),this._abortController=null,this}}get abortController(){return this._abortController||(this._abortController=new AbortController),this._abortController}},Rf=new Go,Ms=class{constructor(e){this.manager=e!==void 0?e:Rf,this.crossOrigin="anonymous",this.withCredentials=!1,this.path="",this.resourcePath="",this.requestHeader={}}load(){}loadAsync(e,t){let n=this;return new Promise(function(i,s){n.load(e,i,t,s)})}parse(){}setCrossOrigin(e){return this.crossOrigin=e,this}setWithCredentials(e){return this.withCredentials=e,this}setPath(e){return this.path=e,this}setResourcePath(e){return this.resourcePath=e,this}setRequestHeader(e){return this.requestHeader=e,this}abort(){return this}};Ms.DEFAULT_MATERIAL_NAME="__DEFAULT";var ds=new WeakMap,Ho=class extends Ms{constructor(e){super(e)}load(e,t,n,i){this.path!==void 0&&(e=this.path+e),e=this.manager.resolveURL(e);let s=this,a=xo.get(`image:${e}`);if(a!==void 0){if(a.complete===!0)s.manager.itemStart(e),setTimeout(function(){t&&t(a),s.manager.itemEnd(e)},0);else{let h=ds.get(a);h===void 0&&(h=[],ds.set(a,h)),h.push({onLoad:t,onError:i})}return a}let o=ps("img");function c(){u(),t&&t(this);let h=ds.get(this)||[];for(let d=0;d<h.length;d++){let f=h[d];f.onLoad&&f.onLoad(this)}ds.delete(this),s.manager.itemEnd(e)}function l(h){u(),i&&i(h),xo.remove(`image:${e}`);let d=ds.get(this)||[];for(let f=0;f<d.length;f++){let _=d[f];_.onError&&_.onError(h)}ds.delete(this),s.manager.itemError(e),s.manager.itemEnd(e)}function u(){o.removeEventListener("load",c,!1),o.removeEventListener("error",l,!1)}return o.addEventListener("load",c,!1),o.addEventListener("error",l,!1),e.slice(0,5)!=="data:"&&this.crossOrigin!==void 0&&(o.crossOrigin=this.crossOrigin),xo.add(`image:${e}`,o),s.manager.itemStart(e),o.src=e,o}};var _a=class extends Ms{constructor(e){super(e)}load(e,t,n,i){let s=new nn,a=new Ho(this.manager);return a.setCrossOrigin(this.crossOrigin),a.setPath(this.path),a.load(e,function(o){s.image=o,s.needsUpdate=!0,t!==void 0&&t(s)},n,i),s}};var er=class extends ha{constructor(e=-1,t=1,n=1,i=-1,s=.1,a=2e3){super(),this.isOrthographicCamera=!0,this.type="OrthographicCamera",this.zoom=1,this.view=null,this.left=e,this.right=t,this.top=n,this.bottom=i,this.near=s,this.far=a,this.updateProjectionMatrix()}copy(e,t){return super.copy(e,t),this.left=e.left,this.right=e.right,this.top=e.top,this.bottom=e.bottom,this.near=e.near,this.far=e.far,this.zoom=e.zoom,this.view=e.view===null?null:Object.assign({},e.view),this}setViewOffset(e,t,n,i,s,a){this.view===null&&(this.view={enabled:!0,fullWidth:1,fullHeight:1,offsetX:0,offsetY:0,width:1,height:1}),this.view.enabled=!0,this.view.fullWidth=e,this.view.fullHeight=t,this.view.offsetX=n,this.view.offsetY=i,this.view.width=s,this.view.height=a,this.updateProjectionMatrix()}clearViewOffset(){this.view!==null&&(this.view.enabled=!1),this.updateProjectionMatrix()}updateProjectionMatrix(){let e=(this.right-this.left)/(2*this.zoom),t=(this.top-this.bottom)/(2*this.zoom),n=(this.right+this.left)/2,i=(this.top+this.bottom)/2,s=n-e,a=n+e,o=i+t,c=i-t;if(this.view!==null&&this.view.enabled){let l=(this.right-this.left)/this.view.fullWidth/this.zoom,u=(this.top-this.bottom)/this.view.fullHeight/this.zoom;s+=l*this.view.offsetX,a=s+l*this.view.width,o-=u*this.view.offsetY,c=o-u*this.view.height}this.projectionMatrix.makeOrthographic(s,a,o,c,this.near,this.far,this.coordinateSystem,this.reversedDepth),this.projectionMatrixInverse.copy(this.projectionMatrix).invert()}toJSON(e){let t=super.toJSON(e);return t.object.zoom=this.zoom,t.object.left=this.left,t.object.right=this.right,t.object.top=this.top,t.object.bottom=this.bottom,t.object.near=this.near,t.object.far=this.far,this.view!==null&&(t.object.view=Object.assign({},this.view)),t}};var Wo=class extends pn{constructor(e=[]){super(),this.isArrayCamera=!0,this.isMultiViewCamera=!1,this.cameras=e}};var Zu="\\[\\]\\.:\\/",Wg=new RegExp("["+Zu+"]","g"),Ju="[^"+Zu+"]",Xg="[^"+Zu.replace("\\.","")+"]",qg=/((?:WC+[\/:])*)/.source.replace("WC",Ju),Yg=/(WCOD+)?/.source.replace("WCOD",Xg),Zg=/(?:\.(WC+)(?:\[(.+)\])?)?/.source.replace("WC",Ju),Jg=/\.(WC+)(?:\[(.+)\])?/.source.replace("WC",Ju),$g=new RegExp("^"+qg+Yg+Zg+Jg+"$"),Kg=["material","materials","bones","map"],Su=class{constructor(e,t,n){let i=n||gt.parseTrackName(t);this._targetGroup=e,this._bindings=e.subscribe_(t,i)}getValue(e,t){this.bind();let n=this._targetGroup.nCachedObjects_,i=this._bindings[n];i!==void 0&&i.getValue(e,t)}setValue(e,t){let n=this._bindings;for(let i=this._targetGroup.nCachedObjects_,s=n.length;i!==s;++i)n[i].setValue(e,t)}bind(){let e=this._bindings;for(let t=this._targetGroup.nCachedObjects_,n=e.length;t!==n;++t)e[t].bind()}unbind(){let e=this._bindings;for(let t=this._targetGroup.nCachedObjects_,n=e.length;t!==n;++t)e[t].unbind()}},gt=class r{constructor(e,t,n){this.path=t,this.parsedPath=n||r.parseTrackName(t),this.node=r.findNode(e,this.parsedPath.nodeName),this.rootNode=e,this.getValue=this._getValue_unbound,this.setValue=this._setValue_unbound}static create(e,t,n){return e&&e.isAnimationObjectGroup?new r.Composite(e,t,n):new r(e,t,n)}static sanitizeNodeName(e){return e.replace(/\s/g,"_").replace(Wg,"")}static parseTrackName(e){let t=$g.exec(e);if(t===null)throw new Error("PropertyBinding: Cannot parse trackName: "+e);let n={nodeName:t[2],objectName:t[3],objectIndex:t[4],propertyName:t[5],propertyIndex:t[6]},i=n.nodeName&&n.nodeName.lastIndexOf(".");if(i!==void 0&&i!==-1){let s=n.nodeName.substring(i+1);Kg.indexOf(s)!==-1&&(n.nodeName=n.nodeName.substring(0,i),n.objectName=s)}if(n.propertyName===null||n.propertyName.length===0)throw new Error("PropertyBinding: can not parse propertyName from trackName: "+e);return n}static findNode(e,t){if(t===void 0||t===""||t==="."||t===-1||t===e.name||t===e.uuid)return e;if(e.skeleton){let n=e.skeleton.getBoneByName(t);if(n!==void 0)return n}if(e.children){let n=function(s){for(let a=0;a<s.length;a++){let o=s[a];if(o.name===t||o.uuid===t)return o;let c=n(o.children);if(c)return c}return null},i=n(e.children);if(i)return i}return null}_getValue_unavailable(){}_setValue_unavailable(){}_getValue_direct(e,t){e[t]=this.targetObject[this.propertyName]}_getValue_array(e,t){let n=this.resolvedProperty;for(let i=0,s=n.length;i!==s;++i)e[t++]=n[i]}_getValue_arrayElement(e,t){e[t]=this.resolvedProperty[this.propertyIndex]}_getValue_toArray(e,t){this.resolvedProperty.toArray(e,t)}_setValue_direct(e,t){this.targetObject[this.propertyName]=e[t]}_setValue_direct_setNeedsUpdate(e,t){this.targetObject[this.propertyName]=e[t],this.targetObject.needsUpdate=!0}_setValue_direct_setMatrixWorldNeedsUpdate(e,t){this.targetObject[this.propertyName]=e[t],this.targetObject.matrixWorldNeedsUpdate=!0}_setValue_array(e,t){let n=this.resolvedProperty;for(let i=0,s=n.length;i!==s;++i)n[i]=e[t++]}_setValue_array_setNeedsUpdate(e,t){let n=this.resolvedProperty;for(let i=0,s=n.length;i!==s;++i)n[i]=e[t++];this.targetObject.needsUpdate=!0}_setValue_array_setMatrixWorldNeedsUpdate(e,t){let n=this.resolvedProperty;for(let i=0,s=n.length;i!==s;++i)n[i]=e[t++];this.targetObject.matrixWorldNeedsUpdate=!0}_setValue_arrayElement(e,t){this.resolvedProperty[this.propertyIndex]=e[t]}_setValue_arrayElement_setNeedsUpdate(e,t){this.resolvedProperty[this.propertyIndex]=e[t],this.targetObject.needsUpdate=!0}_setValue_arrayElement_setMatrixWorldNeedsUpdate(e,t){this.resolvedProperty[this.propertyIndex]=e[t],this.targetObject.matrixWorldNeedsUpdate=!0}_setValue_fromArray(e,t){this.resolvedProperty.fromArray(e,t)}_setValue_fromArray_setNeedsUpdate(e,t){this.resolvedProperty.fromArray(e,t),this.targetObject.needsUpdate=!0}_setValue_fromArray_setMatrixWorldNeedsUpdate(e,t){this.resolvedProperty.fromArray(e,t),this.targetObject.matrixWorldNeedsUpdate=!0}_getValue_unbound(e,t){this.bind(),this.getValue(e,t)}_setValue_unbound(e,t){this.bind(),this.setValue(e,t)}bind(){let e=this.node,t=this.parsedPath,n=t.objectName,i=t.propertyName,s=t.propertyIndex;if(e||(e=r.findNode(this.rootNode,t.nodeName),this.node=e),this.getValue=this._getValue_unavailable,this.setValue=this._setValue_unavailable,!e){Ve("PropertyBinding: No target node found for track: "+this.path+".");return}if(n){let l=t.objectIndex;switch(n){case"materials":if(!e.material){Be("PropertyBinding: Can not bind to material as node does not have a material.",this);return}if(!e.material.materials){Be("PropertyBinding: Can not bind to material.materials as node.material does not have a materials array.",this);return}e=e.material.materials;break;case"bones":if(!e.skeleton){Be("PropertyBinding: Can not bind to bones as node does not have a skeleton.",this);return}e=e.skeleton.bones;for(let u=0;u<e.length;u++)if(e[u].name===l){l=u;break}break;case"map":if("map"in e){e=e.map;break}if(!e.material){Be("PropertyBinding: Can not bind to material as node does not have a material.",this);return}if(!e.material.map){Be("PropertyBinding: Can not bind to material.map as node.material does not have a map.",this);return}e=e.material.map;break;default:if(e[n]===void 0){Be("PropertyBinding: Can not bind to objectName of node undefined.",this);return}e=e[n]}if(l!==void 0){if(e[l]===void 0){Be("PropertyBinding: Trying to bind to objectIndex of objectName, but is undefined.",this,e);return}e=e[l]}}let a=e[i];if(a===void 0){let l=t.nodeName;Be("PropertyBinding: Trying to update property for track: "+l+"."+i+" but it wasn't found.",e);return}let o=this.Versioning.None;this.targetObject=e,e.isMaterial===!0?o=this.Versioning.NeedsUpdate:e.isObject3D===!0&&(o=this.Versioning.MatrixWorldNeedsUpdate);let c=this.BindingType.Direct;if(s!==void 0){if(i==="morphTargetInfluences"){if(!e.geometry){Be("PropertyBinding: Can not bind to morphTargetInfluences because node does not have a geometry.",this);return}if(!e.geometry.morphAttributes){Be("PropertyBinding: Can not bind to morphTargetInfluences because node does not have a geometry.morphAttributes.",this);return}e.morphTargetDictionary[s]!==void 0&&(s=e.morphTargetDictionary[s])}c=this.BindingType.ArrayElement,this.resolvedProperty=a,this.propertyIndex=s}else a.fromArray!==void 0&&a.toArray!==void 0?(c=this.BindingType.HasFromToArray,this.resolvedProperty=a):Array.isArray(a)?(c=this.BindingType.EntireArray,this.resolvedProperty=a):this.propertyName=i;this.getValue=this.GetterByBindingType[c],this.setValue=this.SetterByBindingTypeAndVersioning[c][o]}unbind(){this.node=null,this.getValue=this._getValue_unbound,this.setValue=this._setValue_unbound}};gt.Composite=Su;gt.prototype.BindingType={Direct:0,EntireArray:1,ArrayElement:2,HasFromToArray:3};gt.prototype.Versioning={None:0,NeedsUpdate:1,MatrixWorldNeedsUpdate:2};gt.prototype.GetterByBindingType=[gt.prototype._getValue_direct,gt.prototype._getValue_array,gt.prototype._getValue_arrayElement,gt.prototype._getValue_toArray];gt.prototype.SetterByBindingTypeAndVersioning=[[gt.prototype._setValue_direct,gt.prototype._setValue_direct_setNeedsUpdate,gt.prototype._setValue_direct_setMatrixWorldNeedsUpdate],[gt.prototype._setValue_array,gt.prototype._setValue_array_setNeedsUpdate,gt.prototype._setValue_array_setMatrixWorldNeedsUpdate],[gt.prototype._setValue_arrayElement,gt.prototype._setValue_arrayElement_setNeedsUpdate,gt.prototype._setValue_arrayElement_setMatrixWorldNeedsUpdate],[gt.prototype._setValue_fromArray,gt.prototype._setValue_fromArray_setNeedsUpdate,gt.prototype._setValue_fromArray_setMatrixWorldNeedsUpdate]];var jb=new Float32Array(1);function $u(r,e,t,n){let i=Qg(n);switch(t){case Vu:return r*e;case Hu:return r*e/i.components*i.byteLength;case rl:return r*e/i.components*i.byteLength;case Lr:return r*e*2/i.components*i.byteLength;case sl:return r*e*2/i.components*i.byteLength;case Gu:return r*e*3/i.components*i.byteLength;case Ln:return r*e*4/i.components*i.byteLength;case al:return r*e*4/i.components*i.byteLength;case ba:case Ma:return Math.floor((r+3)/4)*Math.floor((e+3)/4)*8;case Sa:case wa:return Math.floor((r+3)/4)*Math.floor((e+3)/4)*16;case ll:case ul:return Math.max(r,16)*Math.max(e,8)/4;case ol:case cl:return Math.max(r,8)*Math.max(e,8)/2;case hl:case dl:case pl:case ml:return Math.floor((r+3)/4)*Math.floor((e+3)/4)*8;case fl:case gl:case _l:return Math.floor((r+3)/4)*Math.floor((e+3)/4)*16;case xl:return Math.floor((r+3)/4)*Math.floor((e+3)/4)*16;case vl:return Math.floor((r+4)/5)*Math.floor((e+3)/4)*16;case yl:return Math.floor((r+4)/5)*Math.floor((e+4)/5)*16;case bl:return Math.floor((r+5)/6)*Math.floor((e+4)/5)*16;case Ml:return Math.floor((r+5)/6)*Math.floor((e+5)/6)*16;case Sl:return Math.floor((r+7)/8)*Math.floor((e+4)/5)*16;case wl:return Math.floor((r+7)/8)*Math.floor((e+5)/6)*16;case Tl:return Math.floor((r+7)/8)*Math.floor((e+7)/8)*16;case Al:return Math.floor((r+9)/10)*Math.floor((e+4)/5)*16;case El:return Math.floor((r+9)/10)*Math.floor((e+5)/6)*16;case Cl:return Math.floor((r+9)/10)*Math.floor((e+7)/8)*16;case Rl:return Math.floor((r+9)/10)*Math.floor((e+9)/10)*16;case Pl:return Math.floor((r+11)/12)*Math.floor((e+9)/10)*16;case Il:return Math.floor((r+11)/12)*Math.floor((e+11)/12)*16;case Dl:case Ll:case Nl:return Math.ceil(r/4)*Math.ceil(e/4)*16;case Fl:case Ul:return Math.ceil(r/4)*Math.ceil(e/4)*8;case Ol:case Bl:return Math.ceil(r/4)*Math.ceil(e/4)*16}throw new Error(`Unable to determine texture byte length for ${t} format.`)}function Qg(r){switch(r){case Tn:case Ou:return{byteLength:1,components:1};case ws:case Bu:case ii:return{byteLength:2,components:1};case nl:case il:return{byteLength:2,components:4};case Vn:case tl:case Gn:return{byteLength:4,components:1};case ku:case zu:return{byteLength:4,components:3}}throw new Error(`Unknown texture type ${r}.`)}typeof __THREE_DEVTOOLS__<"u"&&__THREE_DEVTOOLS__.dispatchEvent(new CustomEvent("register",{detail:{revision:"182"}}));typeof window<"u"&&(window.__THREE__?Ve("WARNING: Multiple instances of Three.js being imported."):window.__THREE__="182");function Qf(){let r=null,e=!1,t=null,n=null;function i(s,a){t(s,a),n=r.requestAnimationFrame(i)}return{start:function(){e!==!0&&t!==null&&(n=r.requestAnimationFrame(i),e=!0)},stop:function(){r.cancelAnimationFrame(n),e=!1},setAnimationLoop:function(s){t=s},setContext:function(s){r=s}}}function e_(r){let e=new WeakMap;function t(o,c){let l=o.array,u=o.usage,h=l.byteLength,d=r.createBuffer();r.bindBuffer(c,d),r.bufferData(c,l,u),o.onUploadCallback();let f;if(l instanceof Float32Array)f=r.FLOAT;else if(typeof Float16Array<"u"&&l instanceof Float16Array)f=r.HALF_FLOAT;else if(l instanceof Uint16Array)o.isFloat16BufferAttribute?f=r.HALF_FLOAT:f=r.UNSIGNED_SHORT;else if(l instanceof Int16Array)f=r.SHORT;else if(l instanceof Uint32Array)f=r.UNSIGNED_INT;else if(l instanceof Int32Array)f=r.INT;else if(l instanceof Int8Array)f=r.BYTE;else if(l instanceof Uint8Array)f=r.UNSIGNED_BYTE;else if(l instanceof Uint8ClampedArray)f=r.UNSIGNED_BYTE;else throw new Error("THREE.WebGLAttributes: Unsupported buffer data format: "+l);return{buffer:d,type:f,bytesPerElement:l.BYTES_PER_ELEMENT,version:o.version,size:h}}function n(o,c,l){let u=c.array,h=c.updateRanges;if(r.bindBuffer(l,o),h.length===0)r.bufferSubData(l,0,u);else{h.sort((f,_)=>f.start-_.start);let d=0;for(let f=1;f<h.length;f++){let _=h[d],g=h[f];g.start<=_.start+_.count+1?_.count=Math.max(_.count,g.start+g.count-_.start):(++d,h[d]=g)}h.length=d+1;for(let f=0,_=h.length;f<_;f++){let g=h[f];r.bufferSubData(l,g.start*u.BYTES_PER_ELEMENT,u,g.start,g.count)}c.clearUpdateRanges()}c.onUploadCallback()}function i(o){return o.isInterleavedBufferAttribute&&(o=o.data),e.get(o)}function s(o){o.isInterleavedBufferAttribute&&(o=o.data);let c=e.get(o);c&&(r.deleteBuffer(c.buffer),e.delete(o))}function a(o,c){if(o.isInterleavedBufferAttribute&&(o=o.data),o.isGLBufferAttribute){let u=e.get(o);(!u||u.version<o.version)&&e.set(o,{buffer:o.buffer,type:o.type,bytesPerElement:o.elementSize,version:o.version});return}let l=e.get(o);if(l===void 0)e.set(o,t(o,c));else if(l.version<o.version){if(l.size!==o.array.byteLength)throw new Error("THREE.WebGLAttributes: The size of the buffer attribute's array buffer does not match the original size. Resizing buffer attributes is not supported.");n(l.buffer,o,c),l.version=o.version}}return{get:i,remove:s,update:a}}var t_=`#ifdef USE_ALPHAHASH
	if ( diffuseColor.a < getAlphaHashThreshold( vPosition ) ) discard;
#endif`,n_=`#ifdef USE_ALPHAHASH
	const float ALPHA_HASH_SCALE = 0.05;
	float hash2D( vec2 value ) {
		return fract( 1.0e4 * sin( 17.0 * value.x + 0.1 * value.y ) * ( 0.1 + abs( sin( 13.0 * value.y + value.x ) ) ) );
	}
	float hash3D( vec3 value ) {
		return hash2D( vec2( hash2D( value.xy ), value.z ) );
	}
	float getAlphaHashThreshold( vec3 position ) {
		float maxDeriv = max(
			length( dFdx( position.xyz ) ),
			length( dFdy( position.xyz ) )
		);
		float pixScale = 1.0 / ( ALPHA_HASH_SCALE * maxDeriv );
		vec2 pixScales = vec2(
			exp2( floor( log2( pixScale ) ) ),
			exp2( ceil( log2( pixScale ) ) )
		);
		vec2 alpha = vec2(
			hash3D( floor( pixScales.x * position.xyz ) ),
			hash3D( floor( pixScales.y * position.xyz ) )
		);
		float lerpFactor = fract( log2( pixScale ) );
		float x = ( 1.0 - lerpFactor ) * alpha.x + lerpFactor * alpha.y;
		float a = min( lerpFactor, 1.0 - lerpFactor );
		vec3 cases = vec3(
			x * x / ( 2.0 * a * ( 1.0 - a ) ),
			( x - 0.5 * a ) / ( 1.0 - a ),
			1.0 - ( ( 1.0 - x ) * ( 1.0 - x ) / ( 2.0 * a * ( 1.0 - a ) ) )
		);
		float threshold = ( x < ( 1.0 - a ) )
			? ( ( x < a ) ? cases.x : cases.y )
			: cases.z;
		return clamp( threshold , 1.0e-6, 1.0 );
	}
#endif`,i_=`#ifdef USE_ALPHAMAP
	diffuseColor.a *= texture2D( alphaMap, vAlphaMapUv ).g;
#endif`,r_=`#ifdef USE_ALPHAMAP
	uniform sampler2D alphaMap;
#endif`,s_=`#ifdef USE_ALPHATEST
	#ifdef ALPHA_TO_COVERAGE
	diffuseColor.a = smoothstep( alphaTest, alphaTest + fwidth( diffuseColor.a ), diffuseColor.a );
	if ( diffuseColor.a == 0.0 ) discard;
	#else
	if ( diffuseColor.a < alphaTest ) discard;
	#endif
#endif`,a_=`#ifdef USE_ALPHATEST
	uniform float alphaTest;
#endif`,o_=`#ifdef USE_AOMAP
	float ambientOcclusion = ( texture2D( aoMap, vAoMapUv ).r - 1.0 ) * aoMapIntensity + 1.0;
	reflectedLight.indirectDiffuse *= ambientOcclusion;
	#if defined( USE_CLEARCOAT ) 
		clearcoatSpecularIndirect *= ambientOcclusion;
	#endif
	#if defined( USE_SHEEN ) 
		sheenSpecularIndirect *= ambientOcclusion;
	#endif
	#if defined( USE_ENVMAP ) && defined( STANDARD )
		float dotNV = saturate( dot( geometryNormal, geometryViewDir ) );
		reflectedLight.indirectSpecular *= computeSpecularOcclusion( dotNV, ambientOcclusion, material.roughness );
	#endif
#endif`,l_=`#ifdef USE_AOMAP
	uniform sampler2D aoMap;
	uniform float aoMapIntensity;
#endif`,c_=`#ifdef USE_BATCHING
	#if ! defined( GL_ANGLE_multi_draw )
	#define gl_DrawID _gl_DrawID
	uniform int _gl_DrawID;
	#endif
	uniform highp sampler2D batchingTexture;
	uniform highp usampler2D batchingIdTexture;
	mat4 getBatchingMatrix( const in float i ) {
		int size = textureSize( batchingTexture, 0 ).x;
		int j = int( i ) * 4;
		int x = j % size;
		int y = j / size;
		vec4 v1 = texelFetch( batchingTexture, ivec2( x, y ), 0 );
		vec4 v2 = texelFetch( batchingTexture, ivec2( x + 1, y ), 0 );
		vec4 v3 = texelFetch( batchingTexture, ivec2( x + 2, y ), 0 );
		vec4 v4 = texelFetch( batchingTexture, ivec2( x + 3, y ), 0 );
		return mat4( v1, v2, v3, v4 );
	}
	float getIndirectIndex( const in int i ) {
		int size = textureSize( batchingIdTexture, 0 ).x;
		int x = i % size;
		int y = i / size;
		return float( texelFetch( batchingIdTexture, ivec2( x, y ), 0 ).r );
	}
#endif
#ifdef USE_BATCHING_COLOR
	uniform sampler2D batchingColorTexture;
	vec3 getBatchingColor( const in float i ) {
		int size = textureSize( batchingColorTexture, 0 ).x;
		int j = int( i );
		int x = j % size;
		int y = j / size;
		return texelFetch( batchingColorTexture, ivec2( x, y ), 0 ).rgb;
	}
#endif`,u_=`#ifdef USE_BATCHING
	mat4 batchingMatrix = getBatchingMatrix( getIndirectIndex( gl_DrawID ) );
#endif`,h_=`vec3 transformed = vec3( position );
#ifdef USE_ALPHAHASH
	vPosition = vec3( position );
#endif`,d_=`vec3 objectNormal = vec3( normal );
#ifdef USE_TANGENT
	vec3 objectTangent = vec3( tangent.xyz );
#endif`,f_=`float G_BlinnPhong_Implicit( ) {
	return 0.25;
}
float D_BlinnPhong( const in float shininess, const in float dotNH ) {
	return RECIPROCAL_PI * ( shininess * 0.5 + 1.0 ) * pow( dotNH, shininess );
}
vec3 BRDF_BlinnPhong( const in vec3 lightDir, const in vec3 viewDir, const in vec3 normal, const in vec3 specularColor, const in float shininess ) {
	vec3 halfDir = normalize( lightDir + viewDir );
	float dotNH = saturate( dot( normal, halfDir ) );
	float dotVH = saturate( dot( viewDir, halfDir ) );
	vec3 F = F_Schlick( specularColor, 1.0, dotVH );
	float G = G_BlinnPhong_Implicit( );
	float D = D_BlinnPhong( shininess, dotNH );
	return F * ( G * D );
} // validated`,p_=`#ifdef USE_IRIDESCENCE
	const mat3 XYZ_TO_REC709 = mat3(
		 3.2404542, -0.9692660,  0.0556434,
		-1.5371385,  1.8760108, -0.2040259,
		-0.4985314,  0.0415560,  1.0572252
	);
	vec3 Fresnel0ToIor( vec3 fresnel0 ) {
		vec3 sqrtF0 = sqrt( fresnel0 );
		return ( vec3( 1.0 ) + sqrtF0 ) / ( vec3( 1.0 ) - sqrtF0 );
	}
	vec3 IorToFresnel0( vec3 transmittedIor, float incidentIor ) {
		return pow2( ( transmittedIor - vec3( incidentIor ) ) / ( transmittedIor + vec3( incidentIor ) ) );
	}
	float IorToFresnel0( float transmittedIor, float incidentIor ) {
		return pow2( ( transmittedIor - incidentIor ) / ( transmittedIor + incidentIor ));
	}
	vec3 evalSensitivity( float OPD, vec3 shift ) {
		float phase = 2.0 * PI * OPD * 1.0e-9;
		vec3 val = vec3( 5.4856e-13, 4.4201e-13, 5.2481e-13 );
		vec3 pos = vec3( 1.6810e+06, 1.7953e+06, 2.2084e+06 );
		vec3 var = vec3( 4.3278e+09, 9.3046e+09, 6.6121e+09 );
		vec3 xyz = val * sqrt( 2.0 * PI * var ) * cos( pos * phase + shift ) * exp( - pow2( phase ) * var );
		xyz.x += 9.7470e-14 * sqrt( 2.0 * PI * 4.5282e+09 ) * cos( 2.2399e+06 * phase + shift[ 0 ] ) * exp( - 4.5282e+09 * pow2( phase ) );
		xyz /= 1.0685e-7;
		vec3 rgb = XYZ_TO_REC709 * xyz;
		return rgb;
	}
	vec3 evalIridescence( float outsideIOR, float eta2, float cosTheta1, float thinFilmThickness, vec3 baseF0 ) {
		vec3 I;
		float iridescenceIOR = mix( outsideIOR, eta2, smoothstep( 0.0, 0.03, thinFilmThickness ) );
		float sinTheta2Sq = pow2( outsideIOR / iridescenceIOR ) * ( 1.0 - pow2( cosTheta1 ) );
		float cosTheta2Sq = 1.0 - sinTheta2Sq;
		if ( cosTheta2Sq < 0.0 ) {
			return vec3( 1.0 );
		}
		float cosTheta2 = sqrt( cosTheta2Sq );
		float R0 = IorToFresnel0( iridescenceIOR, outsideIOR );
		float R12 = F_Schlick( R0, 1.0, cosTheta1 );
		float T121 = 1.0 - R12;
		float phi12 = 0.0;
		if ( iridescenceIOR < outsideIOR ) phi12 = PI;
		float phi21 = PI - phi12;
		vec3 baseIOR = Fresnel0ToIor( clamp( baseF0, 0.0, 0.9999 ) );		vec3 R1 = IorToFresnel0( baseIOR, iridescenceIOR );
		vec3 R23 = F_Schlick( R1, 1.0, cosTheta2 );
		vec3 phi23 = vec3( 0.0 );
		if ( baseIOR[ 0 ] < iridescenceIOR ) phi23[ 0 ] = PI;
		if ( baseIOR[ 1 ] < iridescenceIOR ) phi23[ 1 ] = PI;
		if ( baseIOR[ 2 ] < iridescenceIOR ) phi23[ 2 ] = PI;
		float OPD = 2.0 * iridescenceIOR * thinFilmThickness * cosTheta2;
		vec3 phi = vec3( phi21 ) + phi23;
		vec3 R123 = clamp( R12 * R23, 1e-5, 0.9999 );
		vec3 r123 = sqrt( R123 );
		vec3 Rs = pow2( T121 ) * R23 / ( vec3( 1.0 ) - R123 );
		vec3 C0 = R12 + Rs;
		I = C0;
		vec3 Cm = Rs - T121;
		for ( int m = 1; m <= 2; ++ m ) {
			Cm *= r123;
			vec3 Sm = 2.0 * evalSensitivity( float( m ) * OPD, float( m ) * phi );
			I += Cm * Sm;
		}
		return max( I, vec3( 0.0 ) );
	}
#endif`,m_=`#ifdef USE_BUMPMAP
	uniform sampler2D bumpMap;
	uniform float bumpScale;
	vec2 dHdxy_fwd() {
		vec2 dSTdx = dFdx( vBumpMapUv );
		vec2 dSTdy = dFdy( vBumpMapUv );
		float Hll = bumpScale * texture2D( bumpMap, vBumpMapUv ).x;
		float dBx = bumpScale * texture2D( bumpMap, vBumpMapUv + dSTdx ).x - Hll;
		float dBy = bumpScale * texture2D( bumpMap, vBumpMapUv + dSTdy ).x - Hll;
		return vec2( dBx, dBy );
	}
	vec3 perturbNormalArb( vec3 surf_pos, vec3 surf_norm, vec2 dHdxy, float faceDirection ) {
		vec3 vSigmaX = normalize( dFdx( surf_pos.xyz ) );
		vec3 vSigmaY = normalize( dFdy( surf_pos.xyz ) );
		vec3 vN = surf_norm;
		vec3 R1 = cross( vSigmaY, vN );
		vec3 R2 = cross( vN, vSigmaX );
		float fDet = dot( vSigmaX, R1 ) * faceDirection;
		vec3 vGrad = sign( fDet ) * ( dHdxy.x * R1 + dHdxy.y * R2 );
		return normalize( abs( fDet ) * surf_norm - vGrad );
	}
#endif`,g_=`#if NUM_CLIPPING_PLANES > 0
	vec4 plane;
	#ifdef ALPHA_TO_COVERAGE
		float distanceToPlane, distanceGradient;
		float clipOpacity = 1.0;
		#pragma unroll_loop_start
		for ( int i = 0; i < UNION_CLIPPING_PLANES; i ++ ) {
			plane = clippingPlanes[ i ];
			distanceToPlane = - dot( vClipPosition, plane.xyz ) + plane.w;
			distanceGradient = fwidth( distanceToPlane ) / 2.0;
			clipOpacity *= smoothstep( - distanceGradient, distanceGradient, distanceToPlane );
			if ( clipOpacity == 0.0 ) discard;
		}
		#pragma unroll_loop_end
		#if UNION_CLIPPING_PLANES < NUM_CLIPPING_PLANES
			float unionClipOpacity = 1.0;
			#pragma unroll_loop_start
			for ( int i = UNION_CLIPPING_PLANES; i < NUM_CLIPPING_PLANES; i ++ ) {
				plane = clippingPlanes[ i ];
				distanceToPlane = - dot( vClipPosition, plane.xyz ) + plane.w;
				distanceGradient = fwidth( distanceToPlane ) / 2.0;
				unionClipOpacity *= 1.0 - smoothstep( - distanceGradient, distanceGradient, distanceToPlane );
			}
			#pragma unroll_loop_end
			clipOpacity *= 1.0 - unionClipOpacity;
		#endif
		diffuseColor.a *= clipOpacity;
		if ( diffuseColor.a == 0.0 ) discard;
	#else
		#pragma unroll_loop_start
		for ( int i = 0; i < UNION_CLIPPING_PLANES; i ++ ) {
			plane = clippingPlanes[ i ];
			if ( dot( vClipPosition, plane.xyz ) > plane.w ) discard;
		}
		#pragma unroll_loop_end
		#if UNION_CLIPPING_PLANES < NUM_CLIPPING_PLANES
			bool clipped = true;
			#pragma unroll_loop_start
			for ( int i = UNION_CLIPPING_PLANES; i < NUM_CLIPPING_PLANES; i ++ ) {
				plane = clippingPlanes[ i ];
				clipped = ( dot( vClipPosition, plane.xyz ) > plane.w ) && clipped;
			}
			#pragma unroll_loop_end
			if ( clipped ) discard;
		#endif
	#endif
#endif`,__=`#if NUM_CLIPPING_PLANES > 0
	varying vec3 vClipPosition;
	uniform vec4 clippingPlanes[ NUM_CLIPPING_PLANES ];
#endif`,x_=`#if NUM_CLIPPING_PLANES > 0
	varying vec3 vClipPosition;
#endif`,v_=`#if NUM_CLIPPING_PLANES > 0
	vClipPosition = - mvPosition.xyz;
#endif`,y_=`#if defined( USE_COLOR_ALPHA )
	diffuseColor *= vColor;
#elif defined( USE_COLOR )
	diffuseColor.rgb *= vColor;
#endif`,b_=`#if defined( USE_COLOR_ALPHA )
	varying vec4 vColor;
#elif defined( USE_COLOR )
	varying vec3 vColor;
#endif`,M_=`#if defined( USE_COLOR_ALPHA )
	varying vec4 vColor;
#elif defined( USE_COLOR ) || defined( USE_INSTANCING_COLOR ) || defined( USE_BATCHING_COLOR )
	varying vec3 vColor;
#endif`,S_=`#if defined( USE_COLOR_ALPHA )
	vColor = vec4( 1.0 );
#elif defined( USE_COLOR ) || defined( USE_INSTANCING_COLOR ) || defined( USE_BATCHING_COLOR )
	vColor = vec3( 1.0 );
#endif
#ifdef USE_COLOR
	vColor *= color;
#endif
#ifdef USE_INSTANCING_COLOR
	vColor.xyz *= instanceColor.xyz;
#endif
#ifdef USE_BATCHING_COLOR
	vec3 batchingColor = getBatchingColor( getIndirectIndex( gl_DrawID ) );
	vColor.xyz *= batchingColor.xyz;
#endif`,w_=`#define PI 3.141592653589793
#define PI2 6.283185307179586
#define PI_HALF 1.5707963267948966
#define RECIPROCAL_PI 0.3183098861837907
#define RECIPROCAL_PI2 0.15915494309189535
#define EPSILON 1e-6
#ifndef saturate
#define saturate( a ) clamp( a, 0.0, 1.0 )
#endif
#define whiteComplement( a ) ( 1.0 - saturate( a ) )
float pow2( const in float x ) { return x*x; }
vec3 pow2( const in vec3 x ) { return x*x; }
float pow3( const in float x ) { return x*x*x; }
float pow4( const in float x ) { float x2 = x*x; return x2*x2; }
float max3( const in vec3 v ) { return max( max( v.x, v.y ), v.z ); }
float average( const in vec3 v ) { return dot( v, vec3( 0.3333333 ) ); }
highp float rand( const in vec2 uv ) {
	const highp float a = 12.9898, b = 78.233, c = 43758.5453;
	highp float dt = dot( uv.xy, vec2( a,b ) ), sn = mod( dt, PI );
	return fract( sin( sn ) * c );
}
#ifdef HIGH_PRECISION
	float precisionSafeLength( vec3 v ) { return length( v ); }
#else
	float precisionSafeLength( vec3 v ) {
		float maxComponent = max3( abs( v ) );
		return length( v / maxComponent ) * maxComponent;
	}
#endif
struct IncidentLight {
	vec3 color;
	vec3 direction;
	bool visible;
};
struct ReflectedLight {
	vec3 directDiffuse;
	vec3 directSpecular;
	vec3 indirectDiffuse;
	vec3 indirectSpecular;
};
#ifdef USE_ALPHAHASH
	varying vec3 vPosition;
#endif
vec3 transformDirection( in vec3 dir, in mat4 matrix ) {
	return normalize( ( matrix * vec4( dir, 0.0 ) ).xyz );
}
vec3 inverseTransformDirection( in vec3 dir, in mat4 matrix ) {
	return normalize( ( vec4( dir, 0.0 ) * matrix ).xyz );
}
bool isPerspectiveMatrix( mat4 m ) {
	return m[ 2 ][ 3 ] == - 1.0;
}
vec2 equirectUv( in vec3 dir ) {
	float u = atan( dir.z, dir.x ) * RECIPROCAL_PI2 + 0.5;
	float v = asin( clamp( dir.y, - 1.0, 1.0 ) ) * RECIPROCAL_PI + 0.5;
	return vec2( u, v );
}
vec3 BRDF_Lambert( const in vec3 diffuseColor ) {
	return RECIPROCAL_PI * diffuseColor;
}
vec3 F_Schlick( const in vec3 f0, const in float f90, const in float dotVH ) {
	float fresnel = exp2( ( - 5.55473 * dotVH - 6.98316 ) * dotVH );
	return f0 * ( 1.0 - fresnel ) + ( f90 * fresnel );
}
float F_Schlick( const in float f0, const in float f90, const in float dotVH ) {
	float fresnel = exp2( ( - 5.55473 * dotVH - 6.98316 ) * dotVH );
	return f0 * ( 1.0 - fresnel ) + ( f90 * fresnel );
} // validated`,T_=`#ifdef ENVMAP_TYPE_CUBE_UV
	#define cubeUV_minMipLevel 4.0
	#define cubeUV_minTileSize 16.0
	float getFace( vec3 direction ) {
		vec3 absDirection = abs( direction );
		float face = - 1.0;
		if ( absDirection.x > absDirection.z ) {
			if ( absDirection.x > absDirection.y )
				face = direction.x > 0.0 ? 0.0 : 3.0;
			else
				face = direction.y > 0.0 ? 1.0 : 4.0;
		} else {
			if ( absDirection.z > absDirection.y )
				face = direction.z > 0.0 ? 2.0 : 5.0;
			else
				face = direction.y > 0.0 ? 1.0 : 4.0;
		}
		return face;
	}
	vec2 getUV( vec3 direction, float face ) {
		vec2 uv;
		if ( face == 0.0 ) {
			uv = vec2( direction.z, direction.y ) / abs( direction.x );
		} else if ( face == 1.0 ) {
			uv = vec2( - direction.x, - direction.z ) / abs( direction.y );
		} else if ( face == 2.0 ) {
			uv = vec2( - direction.x, direction.y ) / abs( direction.z );
		} else if ( face == 3.0 ) {
			uv = vec2( - direction.z, direction.y ) / abs( direction.x );
		} else if ( face == 4.0 ) {
			uv = vec2( - direction.x, direction.z ) / abs( direction.y );
		} else {
			uv = vec2( direction.x, direction.y ) / abs( direction.z );
		}
		return 0.5 * ( uv + 1.0 );
	}
	vec3 bilinearCubeUV( sampler2D envMap, vec3 direction, float mipInt ) {
		float face = getFace( direction );
		float filterInt = max( cubeUV_minMipLevel - mipInt, 0.0 );
		mipInt = max( mipInt, cubeUV_minMipLevel );
		float faceSize = exp2( mipInt );
		highp vec2 uv = getUV( direction, face ) * ( faceSize - 2.0 ) + 1.0;
		if ( face > 2.0 ) {
			uv.y += faceSize;
			face -= 3.0;
		}
		uv.x += face * faceSize;
		uv.x += filterInt * 3.0 * cubeUV_minTileSize;
		uv.y += 4.0 * ( exp2( CUBEUV_MAX_MIP ) - faceSize );
		uv.x *= CUBEUV_TEXEL_WIDTH;
		uv.y *= CUBEUV_TEXEL_HEIGHT;
		#ifdef texture2DGradEXT
			return texture2DGradEXT( envMap, uv, vec2( 0.0 ), vec2( 0.0 ) ).rgb;
		#else
			return texture2D( envMap, uv ).rgb;
		#endif
	}
	#define cubeUV_r0 1.0
	#define cubeUV_m0 - 2.0
	#define cubeUV_r1 0.8
	#define cubeUV_m1 - 1.0
	#define cubeUV_r4 0.4
	#define cubeUV_m4 2.0
	#define cubeUV_r5 0.305
	#define cubeUV_m5 3.0
	#define cubeUV_r6 0.21
	#define cubeUV_m6 4.0
	float roughnessToMip( float roughness ) {
		float mip = 0.0;
		if ( roughness >= cubeUV_r1 ) {
			mip = ( cubeUV_r0 - roughness ) * ( cubeUV_m1 - cubeUV_m0 ) / ( cubeUV_r0 - cubeUV_r1 ) + cubeUV_m0;
		} else if ( roughness >= cubeUV_r4 ) {
			mip = ( cubeUV_r1 - roughness ) * ( cubeUV_m4 - cubeUV_m1 ) / ( cubeUV_r1 - cubeUV_r4 ) + cubeUV_m1;
		} else if ( roughness >= cubeUV_r5 ) {
			mip = ( cubeUV_r4 - roughness ) * ( cubeUV_m5 - cubeUV_m4 ) / ( cubeUV_r4 - cubeUV_r5 ) + cubeUV_m4;
		} else if ( roughness >= cubeUV_r6 ) {
			mip = ( cubeUV_r5 - roughness ) * ( cubeUV_m6 - cubeUV_m5 ) / ( cubeUV_r5 - cubeUV_r6 ) + cubeUV_m5;
		} else {
			mip = - 2.0 * log2( 1.16 * roughness );		}
		return mip;
	}
	vec4 textureCubeUV( sampler2D envMap, vec3 sampleDir, float roughness ) {
		float mip = clamp( roughnessToMip( roughness ), cubeUV_m0, CUBEUV_MAX_MIP );
		float mipF = fract( mip );
		float mipInt = floor( mip );
		vec3 color0 = bilinearCubeUV( envMap, sampleDir, mipInt );
		if ( mipF == 0.0 ) {
			return vec4( color0, 1.0 );
		} else {
			vec3 color1 = bilinearCubeUV( envMap, sampleDir, mipInt + 1.0 );
			return vec4( mix( color0, color1, mipF ), 1.0 );
		}
	}
#endif`,A_=`vec3 transformedNormal = objectNormal;
#ifdef USE_TANGENT
	vec3 transformedTangent = objectTangent;
#endif
#ifdef USE_BATCHING
	mat3 bm = mat3( batchingMatrix );
	transformedNormal /= vec3( dot( bm[ 0 ], bm[ 0 ] ), dot( bm[ 1 ], bm[ 1 ] ), dot( bm[ 2 ], bm[ 2 ] ) );
	transformedNormal = bm * transformedNormal;
	#ifdef USE_TANGENT
		transformedTangent = bm * transformedTangent;
	#endif
#endif
#ifdef USE_INSTANCING
	mat3 im = mat3( instanceMatrix );
	transformedNormal /= vec3( dot( im[ 0 ], im[ 0 ] ), dot( im[ 1 ], im[ 1 ] ), dot( im[ 2 ], im[ 2 ] ) );
	transformedNormal = im * transformedNormal;
	#ifdef USE_TANGENT
		transformedTangent = im * transformedTangent;
	#endif
#endif
transformedNormal = normalMatrix * transformedNormal;
#ifdef FLIP_SIDED
	transformedNormal = - transformedNormal;
#endif
#ifdef USE_TANGENT
	transformedTangent = ( modelViewMatrix * vec4( transformedTangent, 0.0 ) ).xyz;
	#ifdef FLIP_SIDED
		transformedTangent = - transformedTangent;
	#endif
#endif`,E_=`#ifdef USE_DISPLACEMENTMAP
	uniform sampler2D displacementMap;
	uniform float displacementScale;
	uniform float displacementBias;
#endif`,C_=`#ifdef USE_DISPLACEMENTMAP
	transformed += normalize( objectNormal ) * ( texture2D( displacementMap, vDisplacementMapUv ).x * displacementScale + displacementBias );
#endif`,R_=`#ifdef USE_EMISSIVEMAP
	vec4 emissiveColor = texture2D( emissiveMap, vEmissiveMapUv );
	#ifdef DECODE_VIDEO_TEXTURE_EMISSIVE
		emissiveColor = sRGBTransferEOTF( emissiveColor );
	#endif
	totalEmissiveRadiance *= emissiveColor.rgb;
#endif`,P_=`#ifdef USE_EMISSIVEMAP
	uniform sampler2D emissiveMap;
#endif`,I_="gl_FragColor = linearToOutputTexel( gl_FragColor );",D_=`vec4 LinearTransferOETF( in vec4 value ) {
	return value;
}
vec4 sRGBTransferEOTF( in vec4 value ) {
	return vec4( mix( pow( value.rgb * 0.9478672986 + vec3( 0.0521327014 ), vec3( 2.4 ) ), value.rgb * 0.0773993808, vec3( lessThanEqual( value.rgb, vec3( 0.04045 ) ) ) ), value.a );
}
vec4 sRGBTransferOETF( in vec4 value ) {
	return vec4( mix( pow( value.rgb, vec3( 0.41666 ) ) * 1.055 - vec3( 0.055 ), value.rgb * 12.92, vec3( lessThanEqual( value.rgb, vec3( 0.0031308 ) ) ) ), value.a );
}`,L_=`#ifdef USE_ENVMAP
	#ifdef ENV_WORLDPOS
		vec3 cameraToFrag;
		if ( isOrthographic ) {
			cameraToFrag = normalize( vec3( - viewMatrix[ 0 ][ 2 ], - viewMatrix[ 1 ][ 2 ], - viewMatrix[ 2 ][ 2 ] ) );
		} else {
			cameraToFrag = normalize( vWorldPosition - cameraPosition );
		}
		vec3 worldNormal = inverseTransformDirection( normal, viewMatrix );
		#ifdef ENVMAP_MODE_REFLECTION
			vec3 reflectVec = reflect( cameraToFrag, worldNormal );
		#else
			vec3 reflectVec = refract( cameraToFrag, worldNormal, refractionRatio );
		#endif
	#else
		vec3 reflectVec = vReflect;
	#endif
	#ifdef ENVMAP_TYPE_CUBE
		vec4 envColor = textureCube( envMap, envMapRotation * vec3( flipEnvMap * reflectVec.x, reflectVec.yz ) );
	#else
		vec4 envColor = vec4( 0.0 );
	#endif
	#ifdef ENVMAP_BLENDING_MULTIPLY
		outgoingLight = mix( outgoingLight, outgoingLight * envColor.xyz, specularStrength * reflectivity );
	#elif defined( ENVMAP_BLENDING_MIX )
		outgoingLight = mix( outgoingLight, envColor.xyz, specularStrength * reflectivity );
	#elif defined( ENVMAP_BLENDING_ADD )
		outgoingLight += envColor.xyz * specularStrength * reflectivity;
	#endif
#endif`,N_=`#ifdef USE_ENVMAP
	uniform float envMapIntensity;
	uniform float flipEnvMap;
	uniform mat3 envMapRotation;
	#ifdef ENVMAP_TYPE_CUBE
		uniform samplerCube envMap;
	#else
		uniform sampler2D envMap;
	#endif
#endif`,F_=`#ifdef USE_ENVMAP
	uniform float reflectivity;
	#if defined( USE_BUMPMAP ) || defined( USE_NORMALMAP ) || defined( PHONG ) || defined( LAMBERT )
		#define ENV_WORLDPOS
	#endif
	#ifdef ENV_WORLDPOS
		varying vec3 vWorldPosition;
		uniform float refractionRatio;
	#else
		varying vec3 vReflect;
	#endif
#endif`,U_=`#ifdef USE_ENVMAP
	#if defined( USE_BUMPMAP ) || defined( USE_NORMALMAP ) || defined( PHONG ) || defined( LAMBERT )
		#define ENV_WORLDPOS
	#endif
	#ifdef ENV_WORLDPOS
		
		varying vec3 vWorldPosition;
	#else
		varying vec3 vReflect;
		uniform float refractionRatio;
	#endif
#endif`,O_=`#ifdef USE_ENVMAP
	#ifdef ENV_WORLDPOS
		vWorldPosition = worldPosition.xyz;
	#else
		vec3 cameraToVertex;
		if ( isOrthographic ) {
			cameraToVertex = normalize( vec3( - viewMatrix[ 0 ][ 2 ], - viewMatrix[ 1 ][ 2 ], - viewMatrix[ 2 ][ 2 ] ) );
		} else {
			cameraToVertex = normalize( worldPosition.xyz - cameraPosition );
		}
		vec3 worldNormal = inverseTransformDirection( transformedNormal, viewMatrix );
		#ifdef ENVMAP_MODE_REFLECTION
			vReflect = reflect( cameraToVertex, worldNormal );
		#else
			vReflect = refract( cameraToVertex, worldNormal, refractionRatio );
		#endif
	#endif
#endif`,B_=`#ifdef USE_FOG
	vFogDepth = - mvPosition.z;
#endif`,k_=`#ifdef USE_FOG
	varying float vFogDepth;
#endif`,z_=`#ifdef USE_FOG
	#ifdef FOG_EXP2
		float fogFactor = 1.0 - exp( - fogDensity * fogDensity * vFogDepth * vFogDepth );
	#else
		float fogFactor = smoothstep( fogNear, fogFar, vFogDepth );
	#endif
	gl_FragColor.rgb = mix( gl_FragColor.rgb, fogColor, fogFactor );
#endif`,V_=`#ifdef USE_FOG
	uniform vec3 fogColor;
	varying float vFogDepth;
	#ifdef FOG_EXP2
		uniform float fogDensity;
	#else
		uniform float fogNear;
		uniform float fogFar;
	#endif
#endif`,G_=`#ifdef USE_GRADIENTMAP
	uniform sampler2D gradientMap;
#endif
vec3 getGradientIrradiance( vec3 normal, vec3 lightDirection ) {
	float dotNL = dot( normal, lightDirection );
	vec2 coord = vec2( dotNL * 0.5 + 0.5, 0.0 );
	#ifdef USE_GRADIENTMAP
		return vec3( texture2D( gradientMap, coord ).r );
	#else
		vec2 fw = fwidth( coord ) * 0.5;
		return mix( vec3( 0.7 ), vec3( 1.0 ), smoothstep( 0.7 - fw.x, 0.7 + fw.x, coord.x ) );
	#endif
}`,H_=`#ifdef USE_LIGHTMAP
	uniform sampler2D lightMap;
	uniform float lightMapIntensity;
#endif`,W_=`LambertMaterial material;
material.diffuseColor = diffuseColor.rgb;
material.specularStrength = specularStrength;`,X_=`varying vec3 vViewPosition;
struct LambertMaterial {
	vec3 diffuseColor;
	float specularStrength;
};
void RE_Direct_Lambert( const in IncidentLight directLight, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in LambertMaterial material, inout ReflectedLight reflectedLight ) {
	float dotNL = saturate( dot( geometryNormal, directLight.direction ) );
	vec3 irradiance = dotNL * directLight.color;
	reflectedLight.directDiffuse += irradiance * BRDF_Lambert( material.diffuseColor );
}
void RE_IndirectDiffuse_Lambert( const in vec3 irradiance, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in LambertMaterial material, inout ReflectedLight reflectedLight ) {
	reflectedLight.indirectDiffuse += irradiance * BRDF_Lambert( material.diffuseColor );
}
#define RE_Direct				RE_Direct_Lambert
#define RE_IndirectDiffuse		RE_IndirectDiffuse_Lambert`,q_=`uniform bool receiveShadow;
uniform vec3 ambientLightColor;
#if defined( USE_LIGHT_PROBES )
	uniform vec3 lightProbe[ 9 ];
#endif
vec3 shGetIrradianceAt( in vec3 normal, in vec3 shCoefficients[ 9 ] ) {
	float x = normal.x, y = normal.y, z = normal.z;
	vec3 result = shCoefficients[ 0 ] * 0.886227;
	result += shCoefficients[ 1 ] * 2.0 * 0.511664 * y;
	result += shCoefficients[ 2 ] * 2.0 * 0.511664 * z;
	result += shCoefficients[ 3 ] * 2.0 * 0.511664 * x;
	result += shCoefficients[ 4 ] * 2.0 * 0.429043 * x * y;
	result += shCoefficients[ 5 ] * 2.0 * 0.429043 * y * z;
	result += shCoefficients[ 6 ] * ( 0.743125 * z * z - 0.247708 );
	result += shCoefficients[ 7 ] * 2.0 * 0.429043 * x * z;
	result += shCoefficients[ 8 ] * 0.429043 * ( x * x - y * y );
	return result;
}
vec3 getLightProbeIrradiance( const in vec3 lightProbe[ 9 ], const in vec3 normal ) {
	vec3 worldNormal = inverseTransformDirection( normal, viewMatrix );
	vec3 irradiance = shGetIrradianceAt( worldNormal, lightProbe );
	return irradiance;
}
vec3 getAmbientLightIrradiance( const in vec3 ambientLightColor ) {
	vec3 irradiance = ambientLightColor;
	return irradiance;
}
float getDistanceAttenuation( const in float lightDistance, const in float cutoffDistance, const in float decayExponent ) {
	float distanceFalloff = 1.0 / max( pow( lightDistance, decayExponent ), 0.01 );
	if ( cutoffDistance > 0.0 ) {
		distanceFalloff *= pow2( saturate( 1.0 - pow4( lightDistance / cutoffDistance ) ) );
	}
	return distanceFalloff;
}
float getSpotAttenuation( const in float coneCosine, const in float penumbraCosine, const in float angleCosine ) {
	return smoothstep( coneCosine, penumbraCosine, angleCosine );
}
#if NUM_DIR_LIGHTS > 0
	struct DirectionalLight {
		vec3 direction;
		vec3 color;
	};
	uniform DirectionalLight directionalLights[ NUM_DIR_LIGHTS ];
	void getDirectionalLightInfo( const in DirectionalLight directionalLight, out IncidentLight light ) {
		light.color = directionalLight.color;
		light.direction = directionalLight.direction;
		light.visible = true;
	}
#endif
#if NUM_POINT_LIGHTS > 0
	struct PointLight {
		vec3 position;
		vec3 color;
		float distance;
		float decay;
	};
	uniform PointLight pointLights[ NUM_POINT_LIGHTS ];
	void getPointLightInfo( const in PointLight pointLight, const in vec3 geometryPosition, out IncidentLight light ) {
		vec3 lVector = pointLight.position - geometryPosition;
		light.direction = normalize( lVector );
		float lightDistance = length( lVector );
		light.color = pointLight.color;
		light.color *= getDistanceAttenuation( lightDistance, pointLight.distance, pointLight.decay );
		light.visible = ( light.color != vec3( 0.0 ) );
	}
#endif
#if NUM_SPOT_LIGHTS > 0
	struct SpotLight {
		vec3 position;
		vec3 direction;
		vec3 color;
		float distance;
		float decay;
		float coneCos;
		float penumbraCos;
	};
	uniform SpotLight spotLights[ NUM_SPOT_LIGHTS ];
	void getSpotLightInfo( const in SpotLight spotLight, const in vec3 geometryPosition, out IncidentLight light ) {
		vec3 lVector = spotLight.position - geometryPosition;
		light.direction = normalize( lVector );
		float angleCos = dot( light.direction, spotLight.direction );
		float spotAttenuation = getSpotAttenuation( spotLight.coneCos, spotLight.penumbraCos, angleCos );
		if ( spotAttenuation > 0.0 ) {
			float lightDistance = length( lVector );
			light.color = spotLight.color * spotAttenuation;
			light.color *= getDistanceAttenuation( lightDistance, spotLight.distance, spotLight.decay );
			light.visible = ( light.color != vec3( 0.0 ) );
		} else {
			light.color = vec3( 0.0 );
			light.visible = false;
		}
	}
#endif
#if NUM_RECT_AREA_LIGHTS > 0
	struct RectAreaLight {
		vec3 color;
		vec3 position;
		vec3 halfWidth;
		vec3 halfHeight;
	};
	uniform sampler2D ltc_1;	uniform sampler2D ltc_2;
	uniform RectAreaLight rectAreaLights[ NUM_RECT_AREA_LIGHTS ];
#endif
#if NUM_HEMI_LIGHTS > 0
	struct HemisphereLight {
		vec3 direction;
		vec3 skyColor;
		vec3 groundColor;
	};
	uniform HemisphereLight hemisphereLights[ NUM_HEMI_LIGHTS ];
	vec3 getHemisphereLightIrradiance( const in HemisphereLight hemiLight, const in vec3 normal ) {
		float dotNL = dot( normal, hemiLight.direction );
		float hemiDiffuseWeight = 0.5 * dotNL + 0.5;
		vec3 irradiance = mix( hemiLight.groundColor, hemiLight.skyColor, hemiDiffuseWeight );
		return irradiance;
	}
#endif`,Y_=`#ifdef USE_ENVMAP
	vec3 getIBLIrradiance( const in vec3 normal ) {
		#ifdef ENVMAP_TYPE_CUBE_UV
			vec3 worldNormal = inverseTransformDirection( normal, viewMatrix );
			vec4 envMapColor = textureCubeUV( envMap, envMapRotation * worldNormal, 1.0 );
			return PI * envMapColor.rgb * envMapIntensity;
		#else
			return vec3( 0.0 );
		#endif
	}
	vec3 getIBLRadiance( const in vec3 viewDir, const in vec3 normal, const in float roughness ) {
		#ifdef ENVMAP_TYPE_CUBE_UV
			vec3 reflectVec = reflect( - viewDir, normal );
			reflectVec = normalize( mix( reflectVec, normal, pow4( roughness ) ) );
			reflectVec = inverseTransformDirection( reflectVec, viewMatrix );
			vec4 envMapColor = textureCubeUV( envMap, envMapRotation * reflectVec, roughness );
			return envMapColor.rgb * envMapIntensity;
		#else
			return vec3( 0.0 );
		#endif
	}
	#ifdef USE_ANISOTROPY
		vec3 getIBLAnisotropyRadiance( const in vec3 viewDir, const in vec3 normal, const in float roughness, const in vec3 bitangent, const in float anisotropy ) {
			#ifdef ENVMAP_TYPE_CUBE_UV
				vec3 bentNormal = cross( bitangent, viewDir );
				bentNormal = normalize( cross( bentNormal, bitangent ) );
				bentNormal = normalize( mix( bentNormal, normal, pow2( pow2( 1.0 - anisotropy * ( 1.0 - roughness ) ) ) ) );
				return getIBLRadiance( viewDir, bentNormal, roughness );
			#else
				return vec3( 0.0 );
			#endif
		}
	#endif
#endif`,Z_=`ToonMaterial material;
material.diffuseColor = diffuseColor.rgb;`,J_=`varying vec3 vViewPosition;
struct ToonMaterial {
	vec3 diffuseColor;
};
void RE_Direct_Toon( const in IncidentLight directLight, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in ToonMaterial material, inout ReflectedLight reflectedLight ) {
	vec3 irradiance = getGradientIrradiance( geometryNormal, directLight.direction ) * directLight.color;
	reflectedLight.directDiffuse += irradiance * BRDF_Lambert( material.diffuseColor );
}
void RE_IndirectDiffuse_Toon( const in vec3 irradiance, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in ToonMaterial material, inout ReflectedLight reflectedLight ) {
	reflectedLight.indirectDiffuse += irradiance * BRDF_Lambert( material.diffuseColor );
}
#define RE_Direct				RE_Direct_Toon
#define RE_IndirectDiffuse		RE_IndirectDiffuse_Toon`,$_=`BlinnPhongMaterial material;
material.diffuseColor = diffuseColor.rgb;
material.specularColor = specular;
material.specularShininess = shininess;
material.specularStrength = specularStrength;`,K_=`varying vec3 vViewPosition;
struct BlinnPhongMaterial {
	vec3 diffuseColor;
	vec3 specularColor;
	float specularShininess;
	float specularStrength;
};
void RE_Direct_BlinnPhong( const in IncidentLight directLight, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in BlinnPhongMaterial material, inout ReflectedLight reflectedLight ) {
	float dotNL = saturate( dot( geometryNormal, directLight.direction ) );
	vec3 irradiance = dotNL * directLight.color;
	reflectedLight.directDiffuse += irradiance * BRDF_Lambert( material.diffuseColor );
	reflectedLight.directSpecular += irradiance * BRDF_BlinnPhong( directLight.direction, geometryViewDir, geometryNormal, material.specularColor, material.specularShininess ) * material.specularStrength;
}
void RE_IndirectDiffuse_BlinnPhong( const in vec3 irradiance, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in BlinnPhongMaterial material, inout ReflectedLight reflectedLight ) {
	reflectedLight.indirectDiffuse += irradiance * BRDF_Lambert( material.diffuseColor );
}
#define RE_Direct				RE_Direct_BlinnPhong
#define RE_IndirectDiffuse		RE_IndirectDiffuse_BlinnPhong`,Q_=`PhysicalMaterial material;
material.diffuseColor = diffuseColor.rgb;
material.diffuseContribution = diffuseColor.rgb * ( 1.0 - metalnessFactor );
material.metalness = metalnessFactor;
vec3 dxy = max( abs( dFdx( nonPerturbedNormal ) ), abs( dFdy( nonPerturbedNormal ) ) );
float geometryRoughness = max( max( dxy.x, dxy.y ), dxy.z );
material.roughness = max( roughnessFactor, 0.0525 );material.roughness += geometryRoughness;
material.roughness = min( material.roughness, 1.0 );
#ifdef IOR
	material.ior = ior;
	#ifdef USE_SPECULAR
		float specularIntensityFactor = specularIntensity;
		vec3 specularColorFactor = specularColor;
		#ifdef USE_SPECULAR_COLORMAP
			specularColorFactor *= texture2D( specularColorMap, vSpecularColorMapUv ).rgb;
		#endif
		#ifdef USE_SPECULAR_INTENSITYMAP
			specularIntensityFactor *= texture2D( specularIntensityMap, vSpecularIntensityMapUv ).a;
		#endif
		material.specularF90 = mix( specularIntensityFactor, 1.0, metalnessFactor );
	#else
		float specularIntensityFactor = 1.0;
		vec3 specularColorFactor = vec3( 1.0 );
		material.specularF90 = 1.0;
	#endif
	material.specularColor = min( pow2( ( material.ior - 1.0 ) / ( material.ior + 1.0 ) ) * specularColorFactor, vec3( 1.0 ) ) * specularIntensityFactor;
	material.specularColorBlended = mix( material.specularColor, diffuseColor.rgb, metalnessFactor );
#else
	material.specularColor = vec3( 0.04 );
	material.specularColorBlended = mix( material.specularColor, diffuseColor.rgb, metalnessFactor );
	material.specularF90 = 1.0;
#endif
#ifdef USE_CLEARCOAT
	material.clearcoat = clearcoat;
	material.clearcoatRoughness = clearcoatRoughness;
	material.clearcoatF0 = vec3( 0.04 );
	material.clearcoatF90 = 1.0;
	#ifdef USE_CLEARCOATMAP
		material.clearcoat *= texture2D( clearcoatMap, vClearcoatMapUv ).x;
	#endif
	#ifdef USE_CLEARCOAT_ROUGHNESSMAP
		material.clearcoatRoughness *= texture2D( clearcoatRoughnessMap, vClearcoatRoughnessMapUv ).y;
	#endif
	material.clearcoat = saturate( material.clearcoat );	material.clearcoatRoughness = max( material.clearcoatRoughness, 0.0525 );
	material.clearcoatRoughness += geometryRoughness;
	material.clearcoatRoughness = min( material.clearcoatRoughness, 1.0 );
#endif
#ifdef USE_DISPERSION
	material.dispersion = dispersion;
#endif
#ifdef USE_IRIDESCENCE
	material.iridescence = iridescence;
	material.iridescenceIOR = iridescenceIOR;
	#ifdef USE_IRIDESCENCEMAP
		material.iridescence *= texture2D( iridescenceMap, vIridescenceMapUv ).r;
	#endif
	#ifdef USE_IRIDESCENCE_THICKNESSMAP
		material.iridescenceThickness = (iridescenceThicknessMaximum - iridescenceThicknessMinimum) * texture2D( iridescenceThicknessMap, vIridescenceThicknessMapUv ).g + iridescenceThicknessMinimum;
	#else
		material.iridescenceThickness = iridescenceThicknessMaximum;
	#endif
#endif
#ifdef USE_SHEEN
	material.sheenColor = sheenColor;
	#ifdef USE_SHEEN_COLORMAP
		material.sheenColor *= texture2D( sheenColorMap, vSheenColorMapUv ).rgb;
	#endif
	material.sheenRoughness = clamp( sheenRoughness, 0.0001, 1.0 );
	#ifdef USE_SHEEN_ROUGHNESSMAP
		material.sheenRoughness *= texture2D( sheenRoughnessMap, vSheenRoughnessMapUv ).a;
	#endif
#endif
#ifdef USE_ANISOTROPY
	#ifdef USE_ANISOTROPYMAP
		mat2 anisotropyMat = mat2( anisotropyVector.x, anisotropyVector.y, - anisotropyVector.y, anisotropyVector.x );
		vec3 anisotropyPolar = texture2D( anisotropyMap, vAnisotropyMapUv ).rgb;
		vec2 anisotropyV = anisotropyMat * normalize( 2.0 * anisotropyPolar.rg - vec2( 1.0 ) ) * anisotropyPolar.b;
	#else
		vec2 anisotropyV = anisotropyVector;
	#endif
	material.anisotropy = length( anisotropyV );
	if( material.anisotropy == 0.0 ) {
		anisotropyV = vec2( 1.0, 0.0 );
	} else {
		anisotropyV /= material.anisotropy;
		material.anisotropy = saturate( material.anisotropy );
	}
	material.alphaT = mix( pow2( material.roughness ), 1.0, pow2( material.anisotropy ) );
	material.anisotropyT = tbn[ 0 ] * anisotropyV.x + tbn[ 1 ] * anisotropyV.y;
	material.anisotropyB = tbn[ 1 ] * anisotropyV.x - tbn[ 0 ] * anisotropyV.y;
#endif`,j_=`uniform sampler2D dfgLUT;
struct PhysicalMaterial {
	vec3 diffuseColor;
	vec3 diffuseContribution;
	vec3 specularColor;
	vec3 specularColorBlended;
	float roughness;
	float metalness;
	float specularF90;
	float dispersion;
	#ifdef USE_CLEARCOAT
		float clearcoat;
		float clearcoatRoughness;
		vec3 clearcoatF0;
		float clearcoatF90;
	#endif
	#ifdef USE_IRIDESCENCE
		float iridescence;
		float iridescenceIOR;
		float iridescenceThickness;
		vec3 iridescenceFresnel;
		vec3 iridescenceF0;
		vec3 iridescenceFresnelDielectric;
		vec3 iridescenceFresnelMetallic;
	#endif
	#ifdef USE_SHEEN
		vec3 sheenColor;
		float sheenRoughness;
	#endif
	#ifdef IOR
		float ior;
	#endif
	#ifdef USE_TRANSMISSION
		float transmission;
		float transmissionAlpha;
		float thickness;
		float attenuationDistance;
		vec3 attenuationColor;
	#endif
	#ifdef USE_ANISOTROPY
		float anisotropy;
		float alphaT;
		vec3 anisotropyT;
		vec3 anisotropyB;
	#endif
};
vec3 clearcoatSpecularDirect = vec3( 0.0 );
vec3 clearcoatSpecularIndirect = vec3( 0.0 );
vec3 sheenSpecularDirect = vec3( 0.0 );
vec3 sheenSpecularIndirect = vec3(0.0 );
vec3 Schlick_to_F0( const in vec3 f, const in float f90, const in float dotVH ) {
    float x = clamp( 1.0 - dotVH, 0.0, 1.0 );
    float x2 = x * x;
    float x5 = clamp( x * x2 * x2, 0.0, 0.9999 );
    return ( f - vec3( f90 ) * x5 ) / ( 1.0 - x5 );
}
float V_GGX_SmithCorrelated( const in float alpha, const in float dotNL, const in float dotNV ) {
	float a2 = pow2( alpha );
	float gv = dotNL * sqrt( a2 + ( 1.0 - a2 ) * pow2( dotNV ) );
	float gl = dotNV * sqrt( a2 + ( 1.0 - a2 ) * pow2( dotNL ) );
	return 0.5 / max( gv + gl, EPSILON );
}
float D_GGX( const in float alpha, const in float dotNH ) {
	float a2 = pow2( alpha );
	float denom = pow2( dotNH ) * ( a2 - 1.0 ) + 1.0;
	return RECIPROCAL_PI * a2 / pow2( denom );
}
#ifdef USE_ANISOTROPY
	float V_GGX_SmithCorrelated_Anisotropic( const in float alphaT, const in float alphaB, const in float dotTV, const in float dotBV, const in float dotTL, const in float dotBL, const in float dotNV, const in float dotNL ) {
		float gv = dotNL * length( vec3( alphaT * dotTV, alphaB * dotBV, dotNV ) );
		float gl = dotNV * length( vec3( alphaT * dotTL, alphaB * dotBL, dotNL ) );
		float v = 0.5 / ( gv + gl );
		return v;
	}
	float D_GGX_Anisotropic( const in float alphaT, const in float alphaB, const in float dotNH, const in float dotTH, const in float dotBH ) {
		float a2 = alphaT * alphaB;
		highp vec3 v = vec3( alphaB * dotTH, alphaT * dotBH, a2 * dotNH );
		highp float v2 = dot( v, v );
		float w2 = a2 / v2;
		return RECIPROCAL_PI * a2 * pow2 ( w2 );
	}
#endif
#ifdef USE_CLEARCOAT
	vec3 BRDF_GGX_Clearcoat( const in vec3 lightDir, const in vec3 viewDir, const in vec3 normal, const in PhysicalMaterial material) {
		vec3 f0 = material.clearcoatF0;
		float f90 = material.clearcoatF90;
		float roughness = material.clearcoatRoughness;
		float alpha = pow2( roughness );
		vec3 halfDir = normalize( lightDir + viewDir );
		float dotNL = saturate( dot( normal, lightDir ) );
		float dotNV = saturate( dot( normal, viewDir ) );
		float dotNH = saturate( dot( normal, halfDir ) );
		float dotVH = saturate( dot( viewDir, halfDir ) );
		vec3 F = F_Schlick( f0, f90, dotVH );
		float V = V_GGX_SmithCorrelated( alpha, dotNL, dotNV );
		float D = D_GGX( alpha, dotNH );
		return F * ( V * D );
	}
#endif
vec3 BRDF_GGX( const in vec3 lightDir, const in vec3 viewDir, const in vec3 normal, const in PhysicalMaterial material ) {
	vec3 f0 = material.specularColorBlended;
	float f90 = material.specularF90;
	float roughness = material.roughness;
	float alpha = pow2( roughness );
	vec3 halfDir = normalize( lightDir + viewDir );
	float dotNL = saturate( dot( normal, lightDir ) );
	float dotNV = saturate( dot( normal, viewDir ) );
	float dotNH = saturate( dot( normal, halfDir ) );
	float dotVH = saturate( dot( viewDir, halfDir ) );
	vec3 F = F_Schlick( f0, f90, dotVH );
	#ifdef USE_IRIDESCENCE
		F = mix( F, material.iridescenceFresnel, material.iridescence );
	#endif
	#ifdef USE_ANISOTROPY
		float dotTL = dot( material.anisotropyT, lightDir );
		float dotTV = dot( material.anisotropyT, viewDir );
		float dotTH = dot( material.anisotropyT, halfDir );
		float dotBL = dot( material.anisotropyB, lightDir );
		float dotBV = dot( material.anisotropyB, viewDir );
		float dotBH = dot( material.anisotropyB, halfDir );
		float V = V_GGX_SmithCorrelated_Anisotropic( material.alphaT, alpha, dotTV, dotBV, dotTL, dotBL, dotNV, dotNL );
		float D = D_GGX_Anisotropic( material.alphaT, alpha, dotNH, dotTH, dotBH );
	#else
		float V = V_GGX_SmithCorrelated( alpha, dotNL, dotNV );
		float D = D_GGX( alpha, dotNH );
	#endif
	return F * ( V * D );
}
vec2 LTC_Uv( const in vec3 N, const in vec3 V, const in float roughness ) {
	const float LUT_SIZE = 64.0;
	const float LUT_SCALE = ( LUT_SIZE - 1.0 ) / LUT_SIZE;
	const float LUT_BIAS = 0.5 / LUT_SIZE;
	float dotNV = saturate( dot( N, V ) );
	vec2 uv = vec2( roughness, sqrt( 1.0 - dotNV ) );
	uv = uv * LUT_SCALE + LUT_BIAS;
	return uv;
}
float LTC_ClippedSphereFormFactor( const in vec3 f ) {
	float l = length( f );
	return max( ( l * l + f.z ) / ( l + 1.0 ), 0.0 );
}
vec3 LTC_EdgeVectorFormFactor( const in vec3 v1, const in vec3 v2 ) {
	float x = dot( v1, v2 );
	float y = abs( x );
	float a = 0.8543985 + ( 0.4965155 + 0.0145206 * y ) * y;
	float b = 3.4175940 + ( 4.1616724 + y ) * y;
	float v = a / b;
	float theta_sintheta = ( x > 0.0 ) ? v : 0.5 * inversesqrt( max( 1.0 - x * x, 1e-7 ) ) - v;
	return cross( v1, v2 ) * theta_sintheta;
}
vec3 LTC_Evaluate( const in vec3 N, const in vec3 V, const in vec3 P, const in mat3 mInv, const in vec3 rectCoords[ 4 ] ) {
	vec3 v1 = rectCoords[ 1 ] - rectCoords[ 0 ];
	vec3 v2 = rectCoords[ 3 ] - rectCoords[ 0 ];
	vec3 lightNormal = cross( v1, v2 );
	if( dot( lightNormal, P - rectCoords[ 0 ] ) < 0.0 ) return vec3( 0.0 );
	vec3 T1, T2;
	T1 = normalize( V - N * dot( V, N ) );
	T2 = - cross( N, T1 );
	mat3 mat = mInv * transpose( mat3( T1, T2, N ) );
	vec3 coords[ 4 ];
	coords[ 0 ] = mat * ( rectCoords[ 0 ] - P );
	coords[ 1 ] = mat * ( rectCoords[ 1 ] - P );
	coords[ 2 ] = mat * ( rectCoords[ 2 ] - P );
	coords[ 3 ] = mat * ( rectCoords[ 3 ] - P );
	coords[ 0 ] = normalize( coords[ 0 ] );
	coords[ 1 ] = normalize( coords[ 1 ] );
	coords[ 2 ] = normalize( coords[ 2 ] );
	coords[ 3 ] = normalize( coords[ 3 ] );
	vec3 vectorFormFactor = vec3( 0.0 );
	vectorFormFactor += LTC_EdgeVectorFormFactor( coords[ 0 ], coords[ 1 ] );
	vectorFormFactor += LTC_EdgeVectorFormFactor( coords[ 1 ], coords[ 2 ] );
	vectorFormFactor += LTC_EdgeVectorFormFactor( coords[ 2 ], coords[ 3 ] );
	vectorFormFactor += LTC_EdgeVectorFormFactor( coords[ 3 ], coords[ 0 ] );
	float result = LTC_ClippedSphereFormFactor( vectorFormFactor );
	return vec3( result );
}
#if defined( USE_SHEEN )
float D_Charlie( float roughness, float dotNH ) {
	float alpha = pow2( roughness );
	float invAlpha = 1.0 / alpha;
	float cos2h = dotNH * dotNH;
	float sin2h = max( 1.0 - cos2h, 0.0078125 );
	return ( 2.0 + invAlpha ) * pow( sin2h, invAlpha * 0.5 ) / ( 2.0 * PI );
}
float V_Neubelt( float dotNV, float dotNL ) {
	return saturate( 1.0 / ( 4.0 * ( dotNL + dotNV - dotNL * dotNV ) ) );
}
vec3 BRDF_Sheen( const in vec3 lightDir, const in vec3 viewDir, const in vec3 normal, vec3 sheenColor, const in float sheenRoughness ) {
	vec3 halfDir = normalize( lightDir + viewDir );
	float dotNL = saturate( dot( normal, lightDir ) );
	float dotNV = saturate( dot( normal, viewDir ) );
	float dotNH = saturate( dot( normal, halfDir ) );
	float D = D_Charlie( sheenRoughness, dotNH );
	float V = V_Neubelt( dotNV, dotNL );
	return sheenColor * ( D * V );
}
#endif
float IBLSheenBRDF( const in vec3 normal, const in vec3 viewDir, const in float roughness ) {
	float dotNV = saturate( dot( normal, viewDir ) );
	float r2 = roughness * roughness;
	float rInv = 1.0 / ( roughness + 0.1 );
	float a = -1.9362 + 1.0678 * roughness + 0.4573 * r2 - 0.8469 * rInv;
	float b = -0.6014 + 0.5538 * roughness - 0.4670 * r2 - 0.1255 * rInv;
	float DG = exp( a * dotNV + b );
	return saturate( DG );
}
vec3 EnvironmentBRDF( const in vec3 normal, const in vec3 viewDir, const in vec3 specularColor, const in float specularF90, const in float roughness ) {
	float dotNV = saturate( dot( normal, viewDir ) );
	vec2 fab = texture2D( dfgLUT, vec2( roughness, dotNV ) ).rg;
	return specularColor * fab.x + specularF90 * fab.y;
}
#ifdef USE_IRIDESCENCE
void computeMultiscatteringIridescence( const in vec3 normal, const in vec3 viewDir, const in vec3 specularColor, const in float specularF90, const in float iridescence, const in vec3 iridescenceF0, const in float roughness, inout vec3 singleScatter, inout vec3 multiScatter ) {
#else
void computeMultiscattering( const in vec3 normal, const in vec3 viewDir, const in vec3 specularColor, const in float specularF90, const in float roughness, inout vec3 singleScatter, inout vec3 multiScatter ) {
#endif
	float dotNV = saturate( dot( normal, viewDir ) );
	vec2 fab = texture2D( dfgLUT, vec2( roughness, dotNV ) ).rg;
	#ifdef USE_IRIDESCENCE
		vec3 Fr = mix( specularColor, iridescenceF0, iridescence );
	#else
		vec3 Fr = specularColor;
	#endif
	vec3 FssEss = Fr * fab.x + specularF90 * fab.y;
	float Ess = fab.x + fab.y;
	float Ems = 1.0 - Ess;
	vec3 Favg = Fr + ( 1.0 - Fr ) * 0.047619;	vec3 Fms = FssEss * Favg / ( 1.0 - Ems * Favg );
	singleScatter += FssEss;
	multiScatter += Fms * Ems;
}
vec3 BRDF_GGX_Multiscatter( const in vec3 lightDir, const in vec3 viewDir, const in vec3 normal, const in PhysicalMaterial material ) {
	vec3 singleScatter = BRDF_GGX( lightDir, viewDir, normal, material );
	float dotNL = saturate( dot( normal, lightDir ) );
	float dotNV = saturate( dot( normal, viewDir ) );
	vec2 dfgV = texture2D( dfgLUT, vec2( material.roughness, dotNV ) ).rg;
	vec2 dfgL = texture2D( dfgLUT, vec2( material.roughness, dotNL ) ).rg;
	vec3 FssEss_V = material.specularColorBlended * dfgV.x + material.specularF90 * dfgV.y;
	vec3 FssEss_L = material.specularColorBlended * dfgL.x + material.specularF90 * dfgL.y;
	float Ess_V = dfgV.x + dfgV.y;
	float Ess_L = dfgL.x + dfgL.y;
	float Ems_V = 1.0 - Ess_V;
	float Ems_L = 1.0 - Ess_L;
	vec3 Favg = material.specularColorBlended + ( 1.0 - material.specularColorBlended ) * 0.047619;
	vec3 Fms = FssEss_V * FssEss_L * Favg / ( 1.0 - Ems_V * Ems_L * Favg + EPSILON );
	float compensationFactor = Ems_V * Ems_L;
	vec3 multiScatter = Fms * compensationFactor;
	return singleScatter + multiScatter;
}
#if NUM_RECT_AREA_LIGHTS > 0
	void RE_Direct_RectArea_Physical( const in RectAreaLight rectAreaLight, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in PhysicalMaterial material, inout ReflectedLight reflectedLight ) {
		vec3 normal = geometryNormal;
		vec3 viewDir = geometryViewDir;
		vec3 position = geometryPosition;
		vec3 lightPos = rectAreaLight.position;
		vec3 halfWidth = rectAreaLight.halfWidth;
		vec3 halfHeight = rectAreaLight.halfHeight;
		vec3 lightColor = rectAreaLight.color;
		float roughness = material.roughness;
		vec3 rectCoords[ 4 ];
		rectCoords[ 0 ] = lightPos + halfWidth - halfHeight;		rectCoords[ 1 ] = lightPos - halfWidth - halfHeight;
		rectCoords[ 2 ] = lightPos - halfWidth + halfHeight;
		rectCoords[ 3 ] = lightPos + halfWidth + halfHeight;
		vec2 uv = LTC_Uv( normal, viewDir, roughness );
		vec4 t1 = texture2D( ltc_1, uv );
		vec4 t2 = texture2D( ltc_2, uv );
		mat3 mInv = mat3(
			vec3( t1.x, 0, t1.y ),
			vec3(    0, 1,    0 ),
			vec3( t1.z, 0, t1.w )
		);
		vec3 fresnel = ( material.specularColorBlended * t2.x + ( vec3( 1.0 ) - material.specularColorBlended ) * t2.y );
		reflectedLight.directSpecular += lightColor * fresnel * LTC_Evaluate( normal, viewDir, position, mInv, rectCoords );
		reflectedLight.directDiffuse += lightColor * material.diffuseContribution * LTC_Evaluate( normal, viewDir, position, mat3( 1.0 ), rectCoords );
	}
#endif
void RE_Direct_Physical( const in IncidentLight directLight, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in PhysicalMaterial material, inout ReflectedLight reflectedLight ) {
	float dotNL = saturate( dot( geometryNormal, directLight.direction ) );
	vec3 irradiance = dotNL * directLight.color;
	#ifdef USE_CLEARCOAT
		float dotNLcc = saturate( dot( geometryClearcoatNormal, directLight.direction ) );
		vec3 ccIrradiance = dotNLcc * directLight.color;
		clearcoatSpecularDirect += ccIrradiance * BRDF_GGX_Clearcoat( directLight.direction, geometryViewDir, geometryClearcoatNormal, material );
	#endif
	#ifdef USE_SHEEN
 
 		sheenSpecularDirect += irradiance * BRDF_Sheen( directLight.direction, geometryViewDir, geometryNormal, material.sheenColor, material.sheenRoughness );
 
 		float sheenAlbedoV = IBLSheenBRDF( geometryNormal, geometryViewDir, material.sheenRoughness );
 		float sheenAlbedoL = IBLSheenBRDF( geometryNormal, directLight.direction, material.sheenRoughness );
 
 		float sheenEnergyComp = 1.0 - max3( material.sheenColor ) * max( sheenAlbedoV, sheenAlbedoL );
 
 		irradiance *= sheenEnergyComp;
 
 	#endif
	reflectedLight.directSpecular += irradiance * BRDF_GGX_Multiscatter( directLight.direction, geometryViewDir, geometryNormal, material );
	reflectedLight.directDiffuse += irradiance * BRDF_Lambert( material.diffuseContribution );
}
void RE_IndirectDiffuse_Physical( const in vec3 irradiance, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in PhysicalMaterial material, inout ReflectedLight reflectedLight ) {
	vec3 diffuse = irradiance * BRDF_Lambert( material.diffuseContribution );
	#ifdef USE_SHEEN
		float sheenAlbedo = IBLSheenBRDF( geometryNormal, geometryViewDir, material.sheenRoughness );
		float sheenEnergyComp = 1.0 - max3( material.sheenColor ) * sheenAlbedo;
		diffuse *= sheenEnergyComp;
	#endif
	reflectedLight.indirectDiffuse += diffuse;
}
void RE_IndirectSpecular_Physical( const in vec3 radiance, const in vec3 irradiance, const in vec3 clearcoatRadiance, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in PhysicalMaterial material, inout ReflectedLight reflectedLight) {
	#ifdef USE_CLEARCOAT
		clearcoatSpecularIndirect += clearcoatRadiance * EnvironmentBRDF( geometryClearcoatNormal, geometryViewDir, material.clearcoatF0, material.clearcoatF90, material.clearcoatRoughness );
	#endif
	#ifdef USE_SHEEN
		sheenSpecularIndirect += irradiance * material.sheenColor * IBLSheenBRDF( geometryNormal, geometryViewDir, material.sheenRoughness ) * RECIPROCAL_PI;
 	#endif
	vec3 singleScatteringDielectric = vec3( 0.0 );
	vec3 multiScatteringDielectric = vec3( 0.0 );
	vec3 singleScatteringMetallic = vec3( 0.0 );
	vec3 multiScatteringMetallic = vec3( 0.0 );
	#ifdef USE_IRIDESCENCE
		computeMultiscatteringIridescence( geometryNormal, geometryViewDir, material.specularColor, material.specularF90, material.iridescence, material.iridescenceFresnelDielectric, material.roughness, singleScatteringDielectric, multiScatteringDielectric );
		computeMultiscatteringIridescence( geometryNormal, geometryViewDir, material.diffuseColor, material.specularF90, material.iridescence, material.iridescenceFresnelMetallic, material.roughness, singleScatteringMetallic, multiScatteringMetallic );
	#else
		computeMultiscattering( geometryNormal, geometryViewDir, material.specularColor, material.specularF90, material.roughness, singleScatteringDielectric, multiScatteringDielectric );
		computeMultiscattering( geometryNormal, geometryViewDir, material.diffuseColor, material.specularF90, material.roughness, singleScatteringMetallic, multiScatteringMetallic );
	#endif
	vec3 singleScattering = mix( singleScatteringDielectric, singleScatteringMetallic, material.metalness );
	vec3 multiScattering = mix( multiScatteringDielectric, multiScatteringMetallic, material.metalness );
	vec3 totalScatteringDielectric = singleScatteringDielectric + multiScatteringDielectric;
	vec3 diffuse = material.diffuseContribution * ( 1.0 - totalScatteringDielectric );
	vec3 cosineWeightedIrradiance = irradiance * RECIPROCAL_PI;
	vec3 indirectSpecular = radiance * singleScattering;
	indirectSpecular += multiScattering * cosineWeightedIrradiance;
	vec3 indirectDiffuse = diffuse * cosineWeightedIrradiance;
	#ifdef USE_SHEEN
		float sheenAlbedo = IBLSheenBRDF( geometryNormal, geometryViewDir, material.sheenRoughness );
		float sheenEnergyComp = 1.0 - max3( material.sheenColor ) * sheenAlbedo;
		indirectSpecular *= sheenEnergyComp;
		indirectDiffuse *= sheenEnergyComp;
	#endif
	reflectedLight.indirectSpecular += indirectSpecular;
	reflectedLight.indirectDiffuse += indirectDiffuse;
}
#define RE_Direct				RE_Direct_Physical
#define RE_Direct_RectArea		RE_Direct_RectArea_Physical
#define RE_IndirectDiffuse		RE_IndirectDiffuse_Physical
#define RE_IndirectSpecular		RE_IndirectSpecular_Physical
float computeSpecularOcclusion( const in float dotNV, const in float ambientOcclusion, const in float roughness ) {
	return saturate( pow( dotNV + ambientOcclusion, exp2( - 16.0 * roughness - 1.0 ) ) - 1.0 + ambientOcclusion );
}`,e0=`
vec3 geometryPosition = - vViewPosition;
vec3 geometryNormal = normal;
vec3 geometryViewDir = ( isOrthographic ) ? vec3( 0, 0, 1 ) : normalize( vViewPosition );
vec3 geometryClearcoatNormal = vec3( 0.0 );
#ifdef USE_CLEARCOAT
	geometryClearcoatNormal = clearcoatNormal;
#endif
#ifdef USE_IRIDESCENCE
	float dotNVi = saturate( dot( normal, geometryViewDir ) );
	if ( material.iridescenceThickness == 0.0 ) {
		material.iridescence = 0.0;
	} else {
		material.iridescence = saturate( material.iridescence );
	}
	if ( material.iridescence > 0.0 ) {
		material.iridescenceFresnelDielectric = evalIridescence( 1.0, material.iridescenceIOR, dotNVi, material.iridescenceThickness, material.specularColor );
		material.iridescenceFresnelMetallic = evalIridescence( 1.0, material.iridescenceIOR, dotNVi, material.iridescenceThickness, material.diffuseColor );
		material.iridescenceFresnel = mix( material.iridescenceFresnelDielectric, material.iridescenceFresnelMetallic, material.metalness );
		material.iridescenceF0 = Schlick_to_F0( material.iridescenceFresnel, 1.0, dotNVi );
	}
#endif
IncidentLight directLight;
#if ( NUM_POINT_LIGHTS > 0 ) && defined( RE_Direct )
	PointLight pointLight;
	#if defined( USE_SHADOWMAP ) && NUM_POINT_LIGHT_SHADOWS > 0
	PointLightShadow pointLightShadow;
	#endif
	#pragma unroll_loop_start
	for ( int i = 0; i < NUM_POINT_LIGHTS; i ++ ) {
		pointLight = pointLights[ i ];
		getPointLightInfo( pointLight, geometryPosition, directLight );
		#if defined( USE_SHADOWMAP ) && ( UNROLLED_LOOP_INDEX < NUM_POINT_LIGHT_SHADOWS ) && ( defined( SHADOWMAP_TYPE_PCF ) || defined( SHADOWMAP_TYPE_BASIC ) )
		pointLightShadow = pointLightShadows[ i ];
		directLight.color *= ( directLight.visible && receiveShadow ) ? getPointShadow( pointShadowMap[ i ], pointLightShadow.shadowMapSize, pointLightShadow.shadowIntensity, pointLightShadow.shadowBias, pointLightShadow.shadowRadius, vPointShadowCoord[ i ], pointLightShadow.shadowCameraNear, pointLightShadow.shadowCameraFar ) : 1.0;
		#endif
		RE_Direct( directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );
	}
	#pragma unroll_loop_end
#endif
#if ( NUM_SPOT_LIGHTS > 0 ) && defined( RE_Direct )
	SpotLight spotLight;
	vec4 spotColor;
	vec3 spotLightCoord;
	bool inSpotLightMap;
	#if defined( USE_SHADOWMAP ) && NUM_SPOT_LIGHT_SHADOWS > 0
	SpotLightShadow spotLightShadow;
	#endif
	#pragma unroll_loop_start
	for ( int i = 0; i < NUM_SPOT_LIGHTS; i ++ ) {
		spotLight = spotLights[ i ];
		getSpotLightInfo( spotLight, geometryPosition, directLight );
		#if ( UNROLLED_LOOP_INDEX < NUM_SPOT_LIGHT_SHADOWS_WITH_MAPS )
		#define SPOT_LIGHT_MAP_INDEX UNROLLED_LOOP_INDEX
		#elif ( UNROLLED_LOOP_INDEX < NUM_SPOT_LIGHT_SHADOWS )
		#define SPOT_LIGHT_MAP_INDEX NUM_SPOT_LIGHT_MAPS
		#else
		#define SPOT_LIGHT_MAP_INDEX ( UNROLLED_LOOP_INDEX - NUM_SPOT_LIGHT_SHADOWS + NUM_SPOT_LIGHT_SHADOWS_WITH_MAPS )
		#endif
		#if ( SPOT_LIGHT_MAP_INDEX < NUM_SPOT_LIGHT_MAPS )
			spotLightCoord = vSpotLightCoord[ i ].xyz / vSpotLightCoord[ i ].w;
			inSpotLightMap = all( lessThan( abs( spotLightCoord * 2. - 1. ), vec3( 1.0 ) ) );
			spotColor = texture2D( spotLightMap[ SPOT_LIGHT_MAP_INDEX ], spotLightCoord.xy );
			directLight.color = inSpotLightMap ? directLight.color * spotColor.rgb : directLight.color;
		#endif
		#undef SPOT_LIGHT_MAP_INDEX
		#if defined( USE_SHADOWMAP ) && ( UNROLLED_LOOP_INDEX < NUM_SPOT_LIGHT_SHADOWS )
		spotLightShadow = spotLightShadows[ i ];
		directLight.color *= ( directLight.visible && receiveShadow ) ? getShadow( spotShadowMap[ i ], spotLightShadow.shadowMapSize, spotLightShadow.shadowIntensity, spotLightShadow.shadowBias, spotLightShadow.shadowRadius, vSpotLightCoord[ i ] ) : 1.0;
		#endif
		RE_Direct( directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );
	}
	#pragma unroll_loop_end
#endif
#if ( NUM_DIR_LIGHTS > 0 ) && defined( RE_Direct )
	DirectionalLight directionalLight;
	#if defined( USE_SHADOWMAP ) && NUM_DIR_LIGHT_SHADOWS > 0
	DirectionalLightShadow directionalLightShadow;
	#endif
	#pragma unroll_loop_start
	for ( int i = 0; i < NUM_DIR_LIGHTS; i ++ ) {
		directionalLight = directionalLights[ i ];
		getDirectionalLightInfo( directionalLight, directLight );
		#if defined( USE_SHADOWMAP ) && ( UNROLLED_LOOP_INDEX < NUM_DIR_LIGHT_SHADOWS )
		directionalLightShadow = directionalLightShadows[ i ];
		directLight.color *= ( directLight.visible && receiveShadow ) ? getShadow( directionalShadowMap[ i ], directionalLightShadow.shadowMapSize, directionalLightShadow.shadowIntensity, directionalLightShadow.shadowBias, directionalLightShadow.shadowRadius, vDirectionalShadowCoord[ i ] ) : 1.0;
		#endif
		RE_Direct( directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );
	}
	#pragma unroll_loop_end
#endif
#if ( NUM_RECT_AREA_LIGHTS > 0 ) && defined( RE_Direct_RectArea )
	RectAreaLight rectAreaLight;
	#pragma unroll_loop_start
	for ( int i = 0; i < NUM_RECT_AREA_LIGHTS; i ++ ) {
		rectAreaLight = rectAreaLights[ i ];
		RE_Direct_RectArea( rectAreaLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );
	}
	#pragma unroll_loop_end
#endif
#if defined( RE_IndirectDiffuse )
	vec3 iblIrradiance = vec3( 0.0 );
	vec3 irradiance = getAmbientLightIrradiance( ambientLightColor );
	#if defined( USE_LIGHT_PROBES )
		irradiance += getLightProbeIrradiance( lightProbe, geometryNormal );
	#endif
	#if ( NUM_HEMI_LIGHTS > 0 )
		#pragma unroll_loop_start
		for ( int i = 0; i < NUM_HEMI_LIGHTS; i ++ ) {
			irradiance += getHemisphereLightIrradiance( hemisphereLights[ i ], geometryNormal );
		}
		#pragma unroll_loop_end
	#endif
#endif
#if defined( RE_IndirectSpecular )
	vec3 radiance = vec3( 0.0 );
	vec3 clearcoatRadiance = vec3( 0.0 );
#endif`,t0=`#if defined( RE_IndirectDiffuse )
	#ifdef USE_LIGHTMAP
		vec4 lightMapTexel = texture2D( lightMap, vLightMapUv );
		vec3 lightMapIrradiance = lightMapTexel.rgb * lightMapIntensity;
		irradiance += lightMapIrradiance;
	#endif
	#if defined( USE_ENVMAP ) && defined( STANDARD ) && defined( ENVMAP_TYPE_CUBE_UV )
		iblIrradiance += getIBLIrradiance( geometryNormal );
	#endif
#endif
#if defined( USE_ENVMAP ) && defined( RE_IndirectSpecular )
	#ifdef USE_ANISOTROPY
		radiance += getIBLAnisotropyRadiance( geometryViewDir, geometryNormal, material.roughness, material.anisotropyB, material.anisotropy );
	#else
		radiance += getIBLRadiance( geometryViewDir, geometryNormal, material.roughness );
	#endif
	#ifdef USE_CLEARCOAT
		clearcoatRadiance += getIBLRadiance( geometryViewDir, geometryClearcoatNormal, material.clearcoatRoughness );
	#endif
#endif`,n0=`#if defined( RE_IndirectDiffuse )
	RE_IndirectDiffuse( irradiance, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );
#endif
#if defined( RE_IndirectSpecular )
	RE_IndirectSpecular( radiance, iblIrradiance, clearcoatRadiance, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );
#endif`,i0=`#if defined( USE_LOGARITHMIC_DEPTH_BUFFER )
	gl_FragDepth = vIsPerspective == 0.0 ? gl_FragCoord.z : log2( vFragDepth ) * logDepthBufFC * 0.5;
#endif`,r0=`#if defined( USE_LOGARITHMIC_DEPTH_BUFFER )
	uniform float logDepthBufFC;
	varying float vFragDepth;
	varying float vIsPerspective;
#endif`,s0=`#ifdef USE_LOGARITHMIC_DEPTH_BUFFER
	varying float vFragDepth;
	varying float vIsPerspective;
#endif`,a0=`#ifdef USE_LOGARITHMIC_DEPTH_BUFFER
	vFragDepth = 1.0 + gl_Position.w;
	vIsPerspective = float( isPerspectiveMatrix( projectionMatrix ) );
#endif`,o0=`#ifdef USE_MAP
	vec4 sampledDiffuseColor = texture2D( map, vMapUv );
	#ifdef DECODE_VIDEO_TEXTURE
		sampledDiffuseColor = sRGBTransferEOTF( sampledDiffuseColor );
	#endif
	diffuseColor *= sampledDiffuseColor;
#endif`,l0=`#ifdef USE_MAP
	uniform sampler2D map;
#endif`,c0=`#if defined( USE_MAP ) || defined( USE_ALPHAMAP )
	#if defined( USE_POINTS_UV )
		vec2 uv = vUv;
	#else
		vec2 uv = ( uvTransform * vec3( gl_PointCoord.x, 1.0 - gl_PointCoord.y, 1 ) ).xy;
	#endif
#endif
#ifdef USE_MAP
	diffuseColor *= texture2D( map, uv );
#endif
#ifdef USE_ALPHAMAP
	diffuseColor.a *= texture2D( alphaMap, uv ).g;
#endif`,u0=`#if defined( USE_POINTS_UV )
	varying vec2 vUv;
#else
	#if defined( USE_MAP ) || defined( USE_ALPHAMAP )
		uniform mat3 uvTransform;
	#endif
#endif
#ifdef USE_MAP
	uniform sampler2D map;
#endif
#ifdef USE_ALPHAMAP
	uniform sampler2D alphaMap;
#endif`,h0=`float metalnessFactor = metalness;
#ifdef USE_METALNESSMAP
	vec4 texelMetalness = texture2D( metalnessMap, vMetalnessMapUv );
	metalnessFactor *= texelMetalness.b;
#endif`,d0=`#ifdef USE_METALNESSMAP
	uniform sampler2D metalnessMap;
#endif`,f0=`#ifdef USE_INSTANCING_MORPH
	float morphTargetInfluences[ MORPHTARGETS_COUNT ];
	float morphTargetBaseInfluence = texelFetch( morphTexture, ivec2( 0, gl_InstanceID ), 0 ).r;
	for ( int i = 0; i < MORPHTARGETS_COUNT; i ++ ) {
		morphTargetInfluences[i] =  texelFetch( morphTexture, ivec2( i + 1, gl_InstanceID ), 0 ).r;
	}
#endif`,p0=`#if defined( USE_MORPHCOLORS )
	vColor *= morphTargetBaseInfluence;
	for ( int i = 0; i < MORPHTARGETS_COUNT; i ++ ) {
		#if defined( USE_COLOR_ALPHA )
			if ( morphTargetInfluences[ i ] != 0.0 ) vColor += getMorph( gl_VertexID, i, 2 ) * morphTargetInfluences[ i ];
		#elif defined( USE_COLOR )
			if ( morphTargetInfluences[ i ] != 0.0 ) vColor += getMorph( gl_VertexID, i, 2 ).rgb * morphTargetInfluences[ i ];
		#endif
	}
#endif`,m0=`#ifdef USE_MORPHNORMALS
	objectNormal *= morphTargetBaseInfluence;
	for ( int i = 0; i < MORPHTARGETS_COUNT; i ++ ) {
		if ( morphTargetInfluences[ i ] != 0.0 ) objectNormal += getMorph( gl_VertexID, i, 1 ).xyz * morphTargetInfluences[ i ];
	}
#endif`,g0=`#ifdef USE_MORPHTARGETS
	#ifndef USE_INSTANCING_MORPH
		uniform float morphTargetBaseInfluence;
		uniform float morphTargetInfluences[ MORPHTARGETS_COUNT ];
	#endif
	uniform sampler2DArray morphTargetsTexture;
	uniform ivec2 morphTargetsTextureSize;
	vec4 getMorph( const in int vertexIndex, const in int morphTargetIndex, const in int offset ) {
		int texelIndex = vertexIndex * MORPHTARGETS_TEXTURE_STRIDE + offset;
		int y = texelIndex / morphTargetsTextureSize.x;
		int x = texelIndex - y * morphTargetsTextureSize.x;
		ivec3 morphUV = ivec3( x, y, morphTargetIndex );
		return texelFetch( morphTargetsTexture, morphUV, 0 );
	}
#endif`,_0=`#ifdef USE_MORPHTARGETS
	transformed *= morphTargetBaseInfluence;
	for ( int i = 0; i < MORPHTARGETS_COUNT; i ++ ) {
		if ( morphTargetInfluences[ i ] != 0.0 ) transformed += getMorph( gl_VertexID, i, 0 ).xyz * morphTargetInfluences[ i ];
	}
#endif`,x0=`float faceDirection = gl_FrontFacing ? 1.0 : - 1.0;
#ifdef FLAT_SHADED
	vec3 fdx = dFdx( vViewPosition );
	vec3 fdy = dFdy( vViewPosition );
	vec3 normal = normalize( cross( fdx, fdy ) );
#else
	vec3 normal = normalize( vNormal );
	#ifdef DOUBLE_SIDED
		normal *= faceDirection;
	#endif
#endif
#if defined( USE_NORMALMAP_TANGENTSPACE ) || defined( USE_CLEARCOAT_NORMALMAP ) || defined( USE_ANISOTROPY )
	#ifdef USE_TANGENT
		mat3 tbn = mat3( normalize( vTangent ), normalize( vBitangent ), normal );
	#else
		mat3 tbn = getTangentFrame( - vViewPosition, normal,
		#if defined( USE_NORMALMAP )
			vNormalMapUv
		#elif defined( USE_CLEARCOAT_NORMALMAP )
			vClearcoatNormalMapUv
		#else
			vUv
		#endif
		);
	#endif
	#if defined( DOUBLE_SIDED ) && ! defined( FLAT_SHADED )
		tbn[0] *= faceDirection;
		tbn[1] *= faceDirection;
	#endif
#endif
#ifdef USE_CLEARCOAT_NORMALMAP
	#ifdef USE_TANGENT
		mat3 tbn2 = mat3( normalize( vTangent ), normalize( vBitangent ), normal );
	#else
		mat3 tbn2 = getTangentFrame( - vViewPosition, normal, vClearcoatNormalMapUv );
	#endif
	#if defined( DOUBLE_SIDED ) && ! defined( FLAT_SHADED )
		tbn2[0] *= faceDirection;
		tbn2[1] *= faceDirection;
	#endif
#endif
vec3 nonPerturbedNormal = normal;`,v0=`#ifdef USE_NORMALMAP_OBJECTSPACE
	normal = texture2D( normalMap, vNormalMapUv ).xyz * 2.0 - 1.0;
	#ifdef FLIP_SIDED
		normal = - normal;
	#endif
	#ifdef DOUBLE_SIDED
		normal = normal * faceDirection;
	#endif
	normal = normalize( normalMatrix * normal );
#elif defined( USE_NORMALMAP_TANGENTSPACE )
	vec3 mapN = texture2D( normalMap, vNormalMapUv ).xyz * 2.0 - 1.0;
	mapN.xy *= normalScale;
	normal = normalize( tbn * mapN );
#elif defined( USE_BUMPMAP )
	normal = perturbNormalArb( - vViewPosition, normal, dHdxy_fwd(), faceDirection );
#endif`,y0=`#ifndef FLAT_SHADED
	varying vec3 vNormal;
	#ifdef USE_TANGENT
		varying vec3 vTangent;
		varying vec3 vBitangent;
	#endif
#endif`,b0=`#ifndef FLAT_SHADED
	varying vec3 vNormal;
	#ifdef USE_TANGENT
		varying vec3 vTangent;
		varying vec3 vBitangent;
	#endif
#endif`,M0=`#ifndef FLAT_SHADED
	vNormal = normalize( transformedNormal );
	#ifdef USE_TANGENT
		vTangent = normalize( transformedTangent );
		vBitangent = normalize( cross( vNormal, vTangent ) * tangent.w );
	#endif
#endif`,S0=`#ifdef USE_NORMALMAP
	uniform sampler2D normalMap;
	uniform vec2 normalScale;
#endif
#ifdef USE_NORMALMAP_OBJECTSPACE
	uniform mat3 normalMatrix;
#endif
#if ! defined ( USE_TANGENT ) && ( defined ( USE_NORMALMAP_TANGENTSPACE ) || defined ( USE_CLEARCOAT_NORMALMAP ) || defined( USE_ANISOTROPY ) )
	mat3 getTangentFrame( vec3 eye_pos, vec3 surf_norm, vec2 uv ) {
		vec3 q0 = dFdx( eye_pos.xyz );
		vec3 q1 = dFdy( eye_pos.xyz );
		vec2 st0 = dFdx( uv.st );
		vec2 st1 = dFdy( uv.st );
		vec3 N = surf_norm;
		vec3 q1perp = cross( q1, N );
		vec3 q0perp = cross( N, q0 );
		vec3 T = q1perp * st0.x + q0perp * st1.x;
		vec3 B = q1perp * st0.y + q0perp * st1.y;
		float det = max( dot( T, T ), dot( B, B ) );
		float scale = ( det == 0.0 ) ? 0.0 : inversesqrt( det );
		return mat3( T * scale, B * scale, N );
	}
#endif`,w0=`#ifdef USE_CLEARCOAT
	vec3 clearcoatNormal = nonPerturbedNormal;
#endif`,T0=`#ifdef USE_CLEARCOAT_NORMALMAP
	vec3 clearcoatMapN = texture2D( clearcoatNormalMap, vClearcoatNormalMapUv ).xyz * 2.0 - 1.0;
	clearcoatMapN.xy *= clearcoatNormalScale;
	clearcoatNormal = normalize( tbn2 * clearcoatMapN );
#endif`,A0=`#ifdef USE_CLEARCOATMAP
	uniform sampler2D clearcoatMap;
#endif
#ifdef USE_CLEARCOAT_NORMALMAP
	uniform sampler2D clearcoatNormalMap;
	uniform vec2 clearcoatNormalScale;
#endif
#ifdef USE_CLEARCOAT_ROUGHNESSMAP
	uniform sampler2D clearcoatRoughnessMap;
#endif`,E0=`#ifdef USE_IRIDESCENCEMAP
	uniform sampler2D iridescenceMap;
#endif
#ifdef USE_IRIDESCENCE_THICKNESSMAP
	uniform sampler2D iridescenceThicknessMap;
#endif`,C0=`#ifdef OPAQUE
diffuseColor.a = 1.0;
#endif
#ifdef USE_TRANSMISSION
diffuseColor.a *= material.transmissionAlpha;
#endif
gl_FragColor = vec4( outgoingLight, diffuseColor.a );`,R0=`vec3 packNormalToRGB( const in vec3 normal ) {
	return normalize( normal ) * 0.5 + 0.5;
}
vec3 unpackRGBToNormal( const in vec3 rgb ) {
	return 2.0 * rgb.xyz - 1.0;
}
const float PackUpscale = 256. / 255.;const float UnpackDownscale = 255. / 256.;const float ShiftRight8 = 1. / 256.;
const float Inv255 = 1. / 255.;
const vec4 PackFactors = vec4( 1.0, 256.0, 256.0 * 256.0, 256.0 * 256.0 * 256.0 );
const vec2 UnpackFactors2 = vec2( UnpackDownscale, 1.0 / PackFactors.g );
const vec3 UnpackFactors3 = vec3( UnpackDownscale / PackFactors.rg, 1.0 / PackFactors.b );
const vec4 UnpackFactors4 = vec4( UnpackDownscale / PackFactors.rgb, 1.0 / PackFactors.a );
vec4 packDepthToRGBA( const in float v ) {
	if( v <= 0.0 )
		return vec4( 0., 0., 0., 0. );
	if( v >= 1.0 )
		return vec4( 1., 1., 1., 1. );
	float vuf;
	float af = modf( v * PackFactors.a, vuf );
	float bf = modf( vuf * ShiftRight8, vuf );
	float gf = modf( vuf * ShiftRight8, vuf );
	return vec4( vuf * Inv255, gf * PackUpscale, bf * PackUpscale, af );
}
vec3 packDepthToRGB( const in float v ) {
	if( v <= 0.0 )
		return vec3( 0., 0., 0. );
	if( v >= 1.0 )
		return vec3( 1., 1., 1. );
	float vuf;
	float bf = modf( v * PackFactors.b, vuf );
	float gf = modf( vuf * ShiftRight8, vuf );
	return vec3( vuf * Inv255, gf * PackUpscale, bf );
}
vec2 packDepthToRG( const in float v ) {
	if( v <= 0.0 )
		return vec2( 0., 0. );
	if( v >= 1.0 )
		return vec2( 1., 1. );
	float vuf;
	float gf = modf( v * 256., vuf );
	return vec2( vuf * Inv255, gf );
}
float unpackRGBAToDepth( const in vec4 v ) {
	return dot( v, UnpackFactors4 );
}
float unpackRGBToDepth( const in vec3 v ) {
	return dot( v, UnpackFactors3 );
}
float unpackRGToDepth( const in vec2 v ) {
	return v.r * UnpackFactors2.r + v.g * UnpackFactors2.g;
}
vec4 pack2HalfToRGBA( const in vec2 v ) {
	vec4 r = vec4( v.x, fract( v.x * 255.0 ), v.y, fract( v.y * 255.0 ) );
	return vec4( r.x - r.y / 255.0, r.y, r.z - r.w / 255.0, r.w );
}
vec2 unpackRGBATo2Half( const in vec4 v ) {
	return vec2( v.x + ( v.y / 255.0 ), v.z + ( v.w / 255.0 ) );
}
float viewZToOrthographicDepth( const in float viewZ, const in float near, const in float far ) {
	return ( viewZ + near ) / ( near - far );
}
float orthographicDepthToViewZ( const in float depth, const in float near, const in float far ) {
	return depth * ( near - far ) - near;
}
float viewZToPerspectiveDepth( const in float viewZ, const in float near, const in float far ) {
	return ( ( near + viewZ ) * far ) / ( ( far - near ) * viewZ );
}
float perspectiveDepthToViewZ( const in float depth, const in float near, const in float far ) {
	return ( near * far ) / ( ( far - near ) * depth - far );
}`,P0=`#ifdef PREMULTIPLIED_ALPHA
	gl_FragColor.rgb *= gl_FragColor.a;
#endif`,I0=`vec4 mvPosition = vec4( transformed, 1.0 );
#ifdef USE_BATCHING
	mvPosition = batchingMatrix * mvPosition;
#endif
#ifdef USE_INSTANCING
	mvPosition = instanceMatrix * mvPosition;
#endif
mvPosition = modelViewMatrix * mvPosition;
gl_Position = projectionMatrix * mvPosition;`,D0=`#ifdef DITHERING
	gl_FragColor.rgb = dithering( gl_FragColor.rgb );
#endif`,L0=`#ifdef DITHERING
	vec3 dithering( vec3 color ) {
		float grid_position = rand( gl_FragCoord.xy );
		vec3 dither_shift_RGB = vec3( 0.25 / 255.0, -0.25 / 255.0, 0.25 / 255.0 );
		dither_shift_RGB = mix( 2.0 * dither_shift_RGB, -2.0 * dither_shift_RGB, grid_position );
		return color + dither_shift_RGB;
	}
#endif`,N0=`float roughnessFactor = roughness;
#ifdef USE_ROUGHNESSMAP
	vec4 texelRoughness = texture2D( roughnessMap, vRoughnessMapUv );
	roughnessFactor *= texelRoughness.g;
#endif`,F0=`#ifdef USE_ROUGHNESSMAP
	uniform sampler2D roughnessMap;
#endif`,U0=`#if NUM_SPOT_LIGHT_COORDS > 0
	varying vec4 vSpotLightCoord[ NUM_SPOT_LIGHT_COORDS ];
#endif
#if NUM_SPOT_LIGHT_MAPS > 0
	uniform sampler2D spotLightMap[ NUM_SPOT_LIGHT_MAPS ];
#endif
#ifdef USE_SHADOWMAP
	#if NUM_DIR_LIGHT_SHADOWS > 0
		#if defined( SHADOWMAP_TYPE_PCF )
			uniform sampler2DShadow directionalShadowMap[ NUM_DIR_LIGHT_SHADOWS ];
		#else
			uniform sampler2D directionalShadowMap[ NUM_DIR_LIGHT_SHADOWS ];
		#endif
		varying vec4 vDirectionalShadowCoord[ NUM_DIR_LIGHT_SHADOWS ];
		struct DirectionalLightShadow {
			float shadowIntensity;
			float shadowBias;
			float shadowNormalBias;
			float shadowRadius;
			vec2 shadowMapSize;
		};
		uniform DirectionalLightShadow directionalLightShadows[ NUM_DIR_LIGHT_SHADOWS ];
	#endif
	#if NUM_SPOT_LIGHT_SHADOWS > 0
		#if defined( SHADOWMAP_TYPE_PCF )
			uniform sampler2DShadow spotShadowMap[ NUM_SPOT_LIGHT_SHADOWS ];
		#else
			uniform sampler2D spotShadowMap[ NUM_SPOT_LIGHT_SHADOWS ];
		#endif
		struct SpotLightShadow {
			float shadowIntensity;
			float shadowBias;
			float shadowNormalBias;
			float shadowRadius;
			vec2 shadowMapSize;
		};
		uniform SpotLightShadow spotLightShadows[ NUM_SPOT_LIGHT_SHADOWS ];
	#endif
	#if NUM_POINT_LIGHT_SHADOWS > 0
		#if defined( SHADOWMAP_TYPE_PCF )
			uniform samplerCubeShadow pointShadowMap[ NUM_POINT_LIGHT_SHADOWS ];
		#elif defined( SHADOWMAP_TYPE_BASIC )
			uniform samplerCube pointShadowMap[ NUM_POINT_LIGHT_SHADOWS ];
		#endif
		varying vec4 vPointShadowCoord[ NUM_POINT_LIGHT_SHADOWS ];
		struct PointLightShadow {
			float shadowIntensity;
			float shadowBias;
			float shadowNormalBias;
			float shadowRadius;
			vec2 shadowMapSize;
			float shadowCameraNear;
			float shadowCameraFar;
		};
		uniform PointLightShadow pointLightShadows[ NUM_POINT_LIGHT_SHADOWS ];
	#endif
	#if defined( SHADOWMAP_TYPE_PCF )
		float interleavedGradientNoise( vec2 position ) {
			return fract( 52.9829189 * fract( dot( position, vec2( 0.06711056, 0.00583715 ) ) ) );
		}
		vec2 vogelDiskSample( int sampleIndex, int samplesCount, float phi ) {
			const float goldenAngle = 2.399963229728653;
			float r = sqrt( ( float( sampleIndex ) + 0.5 ) / float( samplesCount ) );
			float theta = float( sampleIndex ) * goldenAngle + phi;
			return vec2( cos( theta ), sin( theta ) ) * r;
		}
	#endif
	#if defined( SHADOWMAP_TYPE_PCF )
		float getShadow( sampler2DShadow shadowMap, vec2 shadowMapSize, float shadowIntensity, float shadowBias, float shadowRadius, vec4 shadowCoord ) {
			float shadow = 1.0;
			shadowCoord.xyz /= shadowCoord.w;
			shadowCoord.z += shadowBias;
			bool inFrustum = shadowCoord.x >= 0.0 && shadowCoord.x <= 1.0 && shadowCoord.y >= 0.0 && shadowCoord.y <= 1.0;
			bool frustumTest = inFrustum && shadowCoord.z <= 1.0;
			if ( frustumTest ) {
				vec2 texelSize = vec2( 1.0 ) / shadowMapSize;
				float radius = shadowRadius * texelSize.x;
				float phi = interleavedGradientNoise( gl_FragCoord.xy ) * 6.28318530718;
				shadow = (
					texture( shadowMap, vec3( shadowCoord.xy + vogelDiskSample( 0, 5, phi ) * radius, shadowCoord.z ) ) +
					texture( shadowMap, vec3( shadowCoord.xy + vogelDiskSample( 1, 5, phi ) * radius, shadowCoord.z ) ) +
					texture( shadowMap, vec3( shadowCoord.xy + vogelDiskSample( 2, 5, phi ) * radius, shadowCoord.z ) ) +
					texture( shadowMap, vec3( shadowCoord.xy + vogelDiskSample( 3, 5, phi ) * radius, shadowCoord.z ) ) +
					texture( shadowMap, vec3( shadowCoord.xy + vogelDiskSample( 4, 5, phi ) * radius, shadowCoord.z ) )
				) * 0.2;
			}
			return mix( 1.0, shadow, shadowIntensity );
		}
	#elif defined( SHADOWMAP_TYPE_VSM )
		float getShadow( sampler2D shadowMap, vec2 shadowMapSize, float shadowIntensity, float shadowBias, float shadowRadius, vec4 shadowCoord ) {
			float shadow = 1.0;
			shadowCoord.xyz /= shadowCoord.w;
			shadowCoord.z += shadowBias;
			bool inFrustum = shadowCoord.x >= 0.0 && shadowCoord.x <= 1.0 && shadowCoord.y >= 0.0 && shadowCoord.y <= 1.0;
			bool frustumTest = inFrustum && shadowCoord.z <= 1.0;
			if ( frustumTest ) {
				vec2 distribution = texture2D( shadowMap, shadowCoord.xy ).rg;
				float mean = distribution.x;
				float variance = distribution.y * distribution.y;
				#ifdef USE_REVERSED_DEPTH_BUFFER
					float hard_shadow = step( mean, shadowCoord.z );
				#else
					float hard_shadow = step( shadowCoord.z, mean );
				#endif
				if ( hard_shadow == 1.0 ) {
					shadow = 1.0;
				} else {
					variance = max( variance, 0.0000001 );
					float d = shadowCoord.z - mean;
					float p_max = variance / ( variance + d * d );
					p_max = clamp( ( p_max - 0.3 ) / 0.65, 0.0, 1.0 );
					shadow = max( hard_shadow, p_max );
				}
			}
			return mix( 1.0, shadow, shadowIntensity );
		}
	#else
		float getShadow( sampler2D shadowMap, vec2 shadowMapSize, float shadowIntensity, float shadowBias, float shadowRadius, vec4 shadowCoord ) {
			float shadow = 1.0;
			shadowCoord.xyz /= shadowCoord.w;
			shadowCoord.z += shadowBias;
			bool inFrustum = shadowCoord.x >= 0.0 && shadowCoord.x <= 1.0 && shadowCoord.y >= 0.0 && shadowCoord.y <= 1.0;
			bool frustumTest = inFrustum && shadowCoord.z <= 1.0;
			if ( frustumTest ) {
				float depth = texture2D( shadowMap, shadowCoord.xy ).r;
				#ifdef USE_REVERSED_DEPTH_BUFFER
					shadow = step( depth, shadowCoord.z );
				#else
					shadow = step( shadowCoord.z, depth );
				#endif
			}
			return mix( 1.0, shadow, shadowIntensity );
		}
	#endif
	#if NUM_POINT_LIGHT_SHADOWS > 0
	#if defined( SHADOWMAP_TYPE_PCF )
	float getPointShadow( samplerCubeShadow shadowMap, vec2 shadowMapSize, float shadowIntensity, float shadowBias, float shadowRadius, vec4 shadowCoord, float shadowCameraNear, float shadowCameraFar ) {
		float shadow = 1.0;
		vec3 lightToPosition = shadowCoord.xyz;
		vec3 bd3D = normalize( lightToPosition );
		vec3 absVec = abs( lightToPosition );
		float viewSpaceZ = max( max( absVec.x, absVec.y ), absVec.z );
		if ( viewSpaceZ - shadowCameraFar <= 0.0 && viewSpaceZ - shadowCameraNear >= 0.0 ) {
			float dp = ( shadowCameraFar * ( viewSpaceZ - shadowCameraNear ) ) / ( viewSpaceZ * ( shadowCameraFar - shadowCameraNear ) );
			dp += shadowBias;
			float texelSize = shadowRadius / shadowMapSize.x;
			vec3 absDir = abs( bd3D );
			vec3 tangent = absDir.x > absDir.z ? vec3( 0.0, 1.0, 0.0 ) : vec3( 1.0, 0.0, 0.0 );
			tangent = normalize( cross( bd3D, tangent ) );
			vec3 bitangent = cross( bd3D, tangent );
			float phi = interleavedGradientNoise( gl_FragCoord.xy ) * 6.28318530718;
			shadow = (
				texture( shadowMap, vec4( bd3D + ( tangent * vogelDiskSample( 0, 5, phi ).x + bitangent * vogelDiskSample( 0, 5, phi ).y ) * texelSize, dp ) ) +
				texture( shadowMap, vec4( bd3D + ( tangent * vogelDiskSample( 1, 5, phi ).x + bitangent * vogelDiskSample( 1, 5, phi ).y ) * texelSize, dp ) ) +
				texture( shadowMap, vec4( bd3D + ( tangent * vogelDiskSample( 2, 5, phi ).x + bitangent * vogelDiskSample( 2, 5, phi ).y ) * texelSize, dp ) ) +
				texture( shadowMap, vec4( bd3D + ( tangent * vogelDiskSample( 3, 5, phi ).x + bitangent * vogelDiskSample( 3, 5, phi ).y ) * texelSize, dp ) ) +
				texture( shadowMap, vec4( bd3D + ( tangent * vogelDiskSample( 4, 5, phi ).x + bitangent * vogelDiskSample( 4, 5, phi ).y ) * texelSize, dp ) )
			) * 0.2;
		}
		return mix( 1.0, shadow, shadowIntensity );
	}
	#elif defined( SHADOWMAP_TYPE_BASIC )
	float getPointShadow( samplerCube shadowMap, vec2 shadowMapSize, float shadowIntensity, float shadowBias, float shadowRadius, vec4 shadowCoord, float shadowCameraNear, float shadowCameraFar ) {
		float shadow = 1.0;
		vec3 lightToPosition = shadowCoord.xyz;
		vec3 bd3D = normalize( lightToPosition );
		vec3 absVec = abs( lightToPosition );
		float viewSpaceZ = max( max( absVec.x, absVec.y ), absVec.z );
		if ( viewSpaceZ - shadowCameraFar <= 0.0 && viewSpaceZ - shadowCameraNear >= 0.0 ) {
			float dp = ( shadowCameraFar * ( viewSpaceZ - shadowCameraNear ) ) / ( viewSpaceZ * ( shadowCameraFar - shadowCameraNear ) );
			dp += shadowBias;
			float depth = textureCube( shadowMap, bd3D ).r;
			#ifdef USE_REVERSED_DEPTH_BUFFER
				shadow = step( depth, dp );
			#else
				shadow = step( dp, depth );
			#endif
		}
		return mix( 1.0, shadow, shadowIntensity );
	}
	#endif
	#endif
#endif`,O0=`#if NUM_SPOT_LIGHT_COORDS > 0
	uniform mat4 spotLightMatrix[ NUM_SPOT_LIGHT_COORDS ];
	varying vec4 vSpotLightCoord[ NUM_SPOT_LIGHT_COORDS ];
#endif
#ifdef USE_SHADOWMAP
	#if NUM_DIR_LIGHT_SHADOWS > 0
		uniform mat4 directionalShadowMatrix[ NUM_DIR_LIGHT_SHADOWS ];
		varying vec4 vDirectionalShadowCoord[ NUM_DIR_LIGHT_SHADOWS ];
		struct DirectionalLightShadow {
			float shadowIntensity;
			float shadowBias;
			float shadowNormalBias;
			float shadowRadius;
			vec2 shadowMapSize;
		};
		uniform DirectionalLightShadow directionalLightShadows[ NUM_DIR_LIGHT_SHADOWS ];
	#endif
	#if NUM_SPOT_LIGHT_SHADOWS > 0
		struct SpotLightShadow {
			float shadowIntensity;
			float shadowBias;
			float shadowNormalBias;
			float shadowRadius;
			vec2 shadowMapSize;
		};
		uniform SpotLightShadow spotLightShadows[ NUM_SPOT_LIGHT_SHADOWS ];
	#endif
	#if NUM_POINT_LIGHT_SHADOWS > 0
		uniform mat4 pointShadowMatrix[ NUM_POINT_LIGHT_SHADOWS ];
		varying vec4 vPointShadowCoord[ NUM_POINT_LIGHT_SHADOWS ];
		struct PointLightShadow {
			float shadowIntensity;
			float shadowBias;
			float shadowNormalBias;
			float shadowRadius;
			vec2 shadowMapSize;
			float shadowCameraNear;
			float shadowCameraFar;
		};
		uniform PointLightShadow pointLightShadows[ NUM_POINT_LIGHT_SHADOWS ];
	#endif
#endif`,B0=`#if ( defined( USE_SHADOWMAP ) && ( NUM_DIR_LIGHT_SHADOWS > 0 || NUM_POINT_LIGHT_SHADOWS > 0 ) ) || ( NUM_SPOT_LIGHT_COORDS > 0 )
	vec3 shadowWorldNormal = inverseTransformDirection( transformedNormal, viewMatrix );
	vec4 shadowWorldPosition;
#endif
#if defined( USE_SHADOWMAP )
	#if NUM_DIR_LIGHT_SHADOWS > 0
		#pragma unroll_loop_start
		for ( int i = 0; i < NUM_DIR_LIGHT_SHADOWS; i ++ ) {
			shadowWorldPosition = worldPosition + vec4( shadowWorldNormal * directionalLightShadows[ i ].shadowNormalBias, 0 );
			vDirectionalShadowCoord[ i ] = directionalShadowMatrix[ i ] * shadowWorldPosition;
		}
		#pragma unroll_loop_end
	#endif
	#if NUM_POINT_LIGHT_SHADOWS > 0
		#pragma unroll_loop_start
		for ( int i = 0; i < NUM_POINT_LIGHT_SHADOWS; i ++ ) {
			shadowWorldPosition = worldPosition + vec4( shadowWorldNormal * pointLightShadows[ i ].shadowNormalBias, 0 );
			vPointShadowCoord[ i ] = pointShadowMatrix[ i ] * shadowWorldPosition;
		}
		#pragma unroll_loop_end
	#endif
#endif
#if NUM_SPOT_LIGHT_COORDS > 0
	#pragma unroll_loop_start
	for ( int i = 0; i < NUM_SPOT_LIGHT_COORDS; i ++ ) {
		shadowWorldPosition = worldPosition;
		#if ( defined( USE_SHADOWMAP ) && UNROLLED_LOOP_INDEX < NUM_SPOT_LIGHT_SHADOWS )
			shadowWorldPosition.xyz += shadowWorldNormal * spotLightShadows[ i ].shadowNormalBias;
		#endif
		vSpotLightCoord[ i ] = spotLightMatrix[ i ] * shadowWorldPosition;
	}
	#pragma unroll_loop_end
#endif`,k0=`float getShadowMask() {
	float shadow = 1.0;
	#ifdef USE_SHADOWMAP
	#if NUM_DIR_LIGHT_SHADOWS > 0
	DirectionalLightShadow directionalLight;
	#pragma unroll_loop_start
	for ( int i = 0; i < NUM_DIR_LIGHT_SHADOWS; i ++ ) {
		directionalLight = directionalLightShadows[ i ];
		shadow *= receiveShadow ? getShadow( directionalShadowMap[ i ], directionalLight.shadowMapSize, directionalLight.shadowIntensity, directionalLight.shadowBias, directionalLight.shadowRadius, vDirectionalShadowCoord[ i ] ) : 1.0;
	}
	#pragma unroll_loop_end
	#endif
	#if NUM_SPOT_LIGHT_SHADOWS > 0
	SpotLightShadow spotLight;
	#pragma unroll_loop_start
	for ( int i = 0; i < NUM_SPOT_LIGHT_SHADOWS; i ++ ) {
		spotLight = spotLightShadows[ i ];
		shadow *= receiveShadow ? getShadow( spotShadowMap[ i ], spotLight.shadowMapSize, spotLight.shadowIntensity, spotLight.shadowBias, spotLight.shadowRadius, vSpotLightCoord[ i ] ) : 1.0;
	}
	#pragma unroll_loop_end
	#endif
	#if NUM_POINT_LIGHT_SHADOWS > 0 && ( defined( SHADOWMAP_TYPE_PCF ) || defined( SHADOWMAP_TYPE_BASIC ) )
	PointLightShadow pointLight;
	#pragma unroll_loop_start
	for ( int i = 0; i < NUM_POINT_LIGHT_SHADOWS; i ++ ) {
		pointLight = pointLightShadows[ i ];
		shadow *= receiveShadow ? getPointShadow( pointShadowMap[ i ], pointLight.shadowMapSize, pointLight.shadowIntensity, pointLight.shadowBias, pointLight.shadowRadius, vPointShadowCoord[ i ], pointLight.shadowCameraNear, pointLight.shadowCameraFar ) : 1.0;
	}
	#pragma unroll_loop_end
	#endif
	#endif
	return shadow;
}`,z0=`#ifdef USE_SKINNING
	mat4 boneMatX = getBoneMatrix( skinIndex.x );
	mat4 boneMatY = getBoneMatrix( skinIndex.y );
	mat4 boneMatZ = getBoneMatrix( skinIndex.z );
	mat4 boneMatW = getBoneMatrix( skinIndex.w );
#endif`,V0=`#ifdef USE_SKINNING
	uniform mat4 bindMatrix;
	uniform mat4 bindMatrixInverse;
	uniform highp sampler2D boneTexture;
	mat4 getBoneMatrix( const in float i ) {
		int size = textureSize( boneTexture, 0 ).x;
		int j = int( i ) * 4;
		int x = j % size;
		int y = j / size;
		vec4 v1 = texelFetch( boneTexture, ivec2( x, y ), 0 );
		vec4 v2 = texelFetch( boneTexture, ivec2( x + 1, y ), 0 );
		vec4 v3 = texelFetch( boneTexture, ivec2( x + 2, y ), 0 );
		vec4 v4 = texelFetch( boneTexture, ivec2( x + 3, y ), 0 );
		return mat4( v1, v2, v3, v4 );
	}
#endif`,G0=`#ifdef USE_SKINNING
	vec4 skinVertex = bindMatrix * vec4( transformed, 1.0 );
	vec4 skinned = vec4( 0.0 );
	skinned += boneMatX * skinVertex * skinWeight.x;
	skinned += boneMatY * skinVertex * skinWeight.y;
	skinned += boneMatZ * skinVertex * skinWeight.z;
	skinned += boneMatW * skinVertex * skinWeight.w;
	transformed = ( bindMatrixInverse * skinned ).xyz;
#endif`,H0=`#ifdef USE_SKINNING
	mat4 skinMatrix = mat4( 0.0 );
	skinMatrix += skinWeight.x * boneMatX;
	skinMatrix += skinWeight.y * boneMatY;
	skinMatrix += skinWeight.z * boneMatZ;
	skinMatrix += skinWeight.w * boneMatW;
	skinMatrix = bindMatrixInverse * skinMatrix * bindMatrix;
	objectNormal = vec4( skinMatrix * vec4( objectNormal, 0.0 ) ).xyz;
	#ifdef USE_TANGENT
		objectTangent = vec4( skinMatrix * vec4( objectTangent, 0.0 ) ).xyz;
	#endif
#endif`,W0=`float specularStrength;
#ifdef USE_SPECULARMAP
	vec4 texelSpecular = texture2D( specularMap, vSpecularMapUv );
	specularStrength = texelSpecular.r;
#else
	specularStrength = 1.0;
#endif`,X0=`#ifdef USE_SPECULARMAP
	uniform sampler2D specularMap;
#endif`,q0=`#if defined( TONE_MAPPING )
	gl_FragColor.rgb = toneMapping( gl_FragColor.rgb );
#endif`,Y0=`#ifndef saturate
#define saturate( a ) clamp( a, 0.0, 1.0 )
#endif
uniform float toneMappingExposure;
vec3 LinearToneMapping( vec3 color ) {
	return saturate( toneMappingExposure * color );
}
vec3 ReinhardToneMapping( vec3 color ) {
	color *= toneMappingExposure;
	return saturate( color / ( vec3( 1.0 ) + color ) );
}
vec3 CineonToneMapping( vec3 color ) {
	color *= toneMappingExposure;
	color = max( vec3( 0.0 ), color - 0.004 );
	return pow( ( color * ( 6.2 * color + 0.5 ) ) / ( color * ( 6.2 * color + 1.7 ) + 0.06 ), vec3( 2.2 ) );
}
vec3 RRTAndODTFit( vec3 v ) {
	vec3 a = v * ( v + 0.0245786 ) - 0.000090537;
	vec3 b = v * ( 0.983729 * v + 0.4329510 ) + 0.238081;
	return a / b;
}
vec3 ACESFilmicToneMapping( vec3 color ) {
	const mat3 ACESInputMat = mat3(
		vec3( 0.59719, 0.07600, 0.02840 ),		vec3( 0.35458, 0.90834, 0.13383 ),
		vec3( 0.04823, 0.01566, 0.83777 )
	);
	const mat3 ACESOutputMat = mat3(
		vec3(  1.60475, -0.10208, -0.00327 ),		vec3( -0.53108,  1.10813, -0.07276 ),
		vec3( -0.07367, -0.00605,  1.07602 )
	);
	color *= toneMappingExposure / 0.6;
	color = ACESInputMat * color;
	color = RRTAndODTFit( color );
	color = ACESOutputMat * color;
	return saturate( color );
}
const mat3 LINEAR_REC2020_TO_LINEAR_SRGB = mat3(
	vec3( 1.6605, - 0.1246, - 0.0182 ),
	vec3( - 0.5876, 1.1329, - 0.1006 ),
	vec3( - 0.0728, - 0.0083, 1.1187 )
);
const mat3 LINEAR_SRGB_TO_LINEAR_REC2020 = mat3(
	vec3( 0.6274, 0.0691, 0.0164 ),
	vec3( 0.3293, 0.9195, 0.0880 ),
	vec3( 0.0433, 0.0113, 0.8956 )
);
vec3 agxDefaultContrastApprox( vec3 x ) {
	vec3 x2 = x * x;
	vec3 x4 = x2 * x2;
	return + 15.5 * x4 * x2
		- 40.14 * x4 * x
		+ 31.96 * x4
		- 6.868 * x2 * x
		+ 0.4298 * x2
		+ 0.1191 * x
		- 0.00232;
}
vec3 AgXToneMapping( vec3 color ) {
	const mat3 AgXInsetMatrix = mat3(
		vec3( 0.856627153315983, 0.137318972929847, 0.11189821299995 ),
		vec3( 0.0951212405381588, 0.761241990602591, 0.0767994186031903 ),
		vec3( 0.0482516061458583, 0.101439036467562, 0.811302368396859 )
	);
	const mat3 AgXOutsetMatrix = mat3(
		vec3( 1.1271005818144368, - 0.1413297634984383, - 0.14132976349843826 ),
		vec3( - 0.11060664309660323, 1.157823702216272, - 0.11060664309660294 ),
		vec3( - 0.016493938717834573, - 0.016493938717834257, 1.2519364065950405 )
	);
	const float AgxMinEv = - 12.47393;	const float AgxMaxEv = 4.026069;
	color *= toneMappingExposure;
	color = LINEAR_SRGB_TO_LINEAR_REC2020 * color;
	color = AgXInsetMatrix * color;
	color = max( color, 1e-10 );	color = log2( color );
	color = ( color - AgxMinEv ) / ( AgxMaxEv - AgxMinEv );
	color = clamp( color, 0.0, 1.0 );
	color = agxDefaultContrastApprox( color );
	color = AgXOutsetMatrix * color;
	color = pow( max( vec3( 0.0 ), color ), vec3( 2.2 ) );
	color = LINEAR_REC2020_TO_LINEAR_SRGB * color;
	color = clamp( color, 0.0, 1.0 );
	return color;
}
vec3 NeutralToneMapping( vec3 color ) {
	const float StartCompression = 0.8 - 0.04;
	const float Desaturation = 0.15;
	color *= toneMappingExposure;
	float x = min( color.r, min( color.g, color.b ) );
	float offset = x < 0.08 ? x - 6.25 * x * x : 0.04;
	color -= offset;
	float peak = max( color.r, max( color.g, color.b ) );
	if ( peak < StartCompression ) return color;
	float d = 1. - StartCompression;
	float newPeak = 1. - d * d / ( peak + d - StartCompression );
	color *= newPeak / peak;
	float g = 1. - 1. / ( Desaturation * ( peak - newPeak ) + 1. );
	return mix( color, vec3( newPeak ), g );
}
vec3 CustomToneMapping( vec3 color ) { return color; }`,Z0=`#ifdef USE_TRANSMISSION
	material.transmission = transmission;
	material.transmissionAlpha = 1.0;
	material.thickness = thickness;
	material.attenuationDistance = attenuationDistance;
	material.attenuationColor = attenuationColor;
	#ifdef USE_TRANSMISSIONMAP
		material.transmission *= texture2D( transmissionMap, vTransmissionMapUv ).r;
	#endif
	#ifdef USE_THICKNESSMAP
		material.thickness *= texture2D( thicknessMap, vThicknessMapUv ).g;
	#endif
	vec3 pos = vWorldPosition;
	vec3 v = normalize( cameraPosition - pos );
	vec3 n = inverseTransformDirection( normal, viewMatrix );
	vec4 transmitted = getIBLVolumeRefraction(
		n, v, material.roughness, material.diffuseContribution, material.specularColorBlended, material.specularF90,
		pos, modelMatrix, viewMatrix, projectionMatrix, material.dispersion, material.ior, material.thickness,
		material.attenuationColor, material.attenuationDistance );
	material.transmissionAlpha = mix( material.transmissionAlpha, transmitted.a, material.transmission );
	totalDiffuse = mix( totalDiffuse, transmitted.rgb, material.transmission );
#endif`,J0=`#ifdef USE_TRANSMISSION
	uniform float transmission;
	uniform float thickness;
	uniform float attenuationDistance;
	uniform vec3 attenuationColor;
	#ifdef USE_TRANSMISSIONMAP
		uniform sampler2D transmissionMap;
	#endif
	#ifdef USE_THICKNESSMAP
		uniform sampler2D thicknessMap;
	#endif
	uniform vec2 transmissionSamplerSize;
	uniform sampler2D transmissionSamplerMap;
	uniform mat4 modelMatrix;
	uniform mat4 projectionMatrix;
	varying vec3 vWorldPosition;
	float w0( float a ) {
		return ( 1.0 / 6.0 ) * ( a * ( a * ( - a + 3.0 ) - 3.0 ) + 1.0 );
	}
	float w1( float a ) {
		return ( 1.0 / 6.0 ) * ( a *  a * ( 3.0 * a - 6.0 ) + 4.0 );
	}
	float w2( float a ){
		return ( 1.0 / 6.0 ) * ( a * ( a * ( - 3.0 * a + 3.0 ) + 3.0 ) + 1.0 );
	}
	float w3( float a ) {
		return ( 1.0 / 6.0 ) * ( a * a * a );
	}
	float g0( float a ) {
		return w0( a ) + w1( a );
	}
	float g1( float a ) {
		return w2( a ) + w3( a );
	}
	float h0( float a ) {
		return - 1.0 + w1( a ) / ( w0( a ) + w1( a ) );
	}
	float h1( float a ) {
		return 1.0 + w3( a ) / ( w2( a ) + w3( a ) );
	}
	vec4 bicubic( sampler2D tex, vec2 uv, vec4 texelSize, float lod ) {
		uv = uv * texelSize.zw + 0.5;
		vec2 iuv = floor( uv );
		vec2 fuv = fract( uv );
		float g0x = g0( fuv.x );
		float g1x = g1( fuv.x );
		float h0x = h0( fuv.x );
		float h1x = h1( fuv.x );
		float h0y = h0( fuv.y );
		float h1y = h1( fuv.y );
		vec2 p0 = ( vec2( iuv.x + h0x, iuv.y + h0y ) - 0.5 ) * texelSize.xy;
		vec2 p1 = ( vec2( iuv.x + h1x, iuv.y + h0y ) - 0.5 ) * texelSize.xy;
		vec2 p2 = ( vec2( iuv.x + h0x, iuv.y + h1y ) - 0.5 ) * texelSize.xy;
		vec2 p3 = ( vec2( iuv.x + h1x, iuv.y + h1y ) - 0.5 ) * texelSize.xy;
		return g0( fuv.y ) * ( g0x * textureLod( tex, p0, lod ) + g1x * textureLod( tex, p1, lod ) ) +
			g1( fuv.y ) * ( g0x * textureLod( tex, p2, lod ) + g1x * textureLod( tex, p3, lod ) );
	}
	vec4 textureBicubic( sampler2D sampler, vec2 uv, float lod ) {
		vec2 fLodSize = vec2( textureSize( sampler, int( lod ) ) );
		vec2 cLodSize = vec2( textureSize( sampler, int( lod + 1.0 ) ) );
		vec2 fLodSizeInv = 1.0 / fLodSize;
		vec2 cLodSizeInv = 1.0 / cLodSize;
		vec4 fSample = bicubic( sampler, uv, vec4( fLodSizeInv, fLodSize ), floor( lod ) );
		vec4 cSample = bicubic( sampler, uv, vec4( cLodSizeInv, cLodSize ), ceil( lod ) );
		return mix( fSample, cSample, fract( lod ) );
	}
	vec3 getVolumeTransmissionRay( const in vec3 n, const in vec3 v, const in float thickness, const in float ior, const in mat4 modelMatrix ) {
		vec3 refractionVector = refract( - v, normalize( n ), 1.0 / ior );
		vec3 modelScale;
		modelScale.x = length( vec3( modelMatrix[ 0 ].xyz ) );
		modelScale.y = length( vec3( modelMatrix[ 1 ].xyz ) );
		modelScale.z = length( vec3( modelMatrix[ 2 ].xyz ) );
		return normalize( refractionVector ) * thickness * modelScale;
	}
	float applyIorToRoughness( const in float roughness, const in float ior ) {
		return roughness * clamp( ior * 2.0 - 2.0, 0.0, 1.0 );
	}
	vec4 getTransmissionSample( const in vec2 fragCoord, const in float roughness, const in float ior ) {
		float lod = log2( transmissionSamplerSize.x ) * applyIorToRoughness( roughness, ior );
		return textureBicubic( transmissionSamplerMap, fragCoord.xy, lod );
	}
	vec3 volumeAttenuation( const in float transmissionDistance, const in vec3 attenuationColor, const in float attenuationDistance ) {
		if ( isinf( attenuationDistance ) ) {
			return vec3( 1.0 );
		} else {
			vec3 attenuationCoefficient = -log( attenuationColor ) / attenuationDistance;
			vec3 transmittance = exp( - attenuationCoefficient * transmissionDistance );			return transmittance;
		}
	}
	vec4 getIBLVolumeRefraction( const in vec3 n, const in vec3 v, const in float roughness, const in vec3 diffuseColor,
		const in vec3 specularColor, const in float specularF90, const in vec3 position, const in mat4 modelMatrix,
		const in mat4 viewMatrix, const in mat4 projMatrix, const in float dispersion, const in float ior, const in float thickness,
		const in vec3 attenuationColor, const in float attenuationDistance ) {
		vec4 transmittedLight;
		vec3 transmittance;
		#ifdef USE_DISPERSION
			float halfSpread = ( ior - 1.0 ) * 0.025 * dispersion;
			vec3 iors = vec3( ior - halfSpread, ior, ior + halfSpread );
			for ( int i = 0; i < 3; i ++ ) {
				vec3 transmissionRay = getVolumeTransmissionRay( n, v, thickness, iors[ i ], modelMatrix );
				vec3 refractedRayExit = position + transmissionRay;
				vec4 ndcPos = projMatrix * viewMatrix * vec4( refractedRayExit, 1.0 );
				vec2 refractionCoords = ndcPos.xy / ndcPos.w;
				refractionCoords += 1.0;
				refractionCoords /= 2.0;
				vec4 transmissionSample = getTransmissionSample( refractionCoords, roughness, iors[ i ] );
				transmittedLight[ i ] = transmissionSample[ i ];
				transmittedLight.a += transmissionSample.a;
				transmittance[ i ] = diffuseColor[ i ] * volumeAttenuation( length( transmissionRay ), attenuationColor, attenuationDistance )[ i ];
			}
			transmittedLight.a /= 3.0;
		#else
			vec3 transmissionRay = getVolumeTransmissionRay( n, v, thickness, ior, modelMatrix );
			vec3 refractedRayExit = position + transmissionRay;
			vec4 ndcPos = projMatrix * viewMatrix * vec4( refractedRayExit, 1.0 );
			vec2 refractionCoords = ndcPos.xy / ndcPos.w;
			refractionCoords += 1.0;
			refractionCoords /= 2.0;
			transmittedLight = getTransmissionSample( refractionCoords, roughness, ior );
			transmittance = diffuseColor * volumeAttenuation( length( transmissionRay ), attenuationColor, attenuationDistance );
		#endif
		vec3 attenuatedColor = transmittance * transmittedLight.rgb;
		vec3 F = EnvironmentBRDF( n, v, specularColor, specularF90, roughness );
		float transmittanceFactor = ( transmittance.r + transmittance.g + transmittance.b ) / 3.0;
		return vec4( ( 1.0 - F ) * attenuatedColor, 1.0 - ( 1.0 - transmittedLight.a ) * transmittanceFactor );
	}
#endif`,$0=`#if defined( USE_UV ) || defined( USE_ANISOTROPY )
	varying vec2 vUv;
#endif
#ifdef USE_MAP
	varying vec2 vMapUv;
#endif
#ifdef USE_ALPHAMAP
	varying vec2 vAlphaMapUv;
#endif
#ifdef USE_LIGHTMAP
	varying vec2 vLightMapUv;
#endif
#ifdef USE_AOMAP
	varying vec2 vAoMapUv;
#endif
#ifdef USE_BUMPMAP
	varying vec2 vBumpMapUv;
#endif
#ifdef USE_NORMALMAP
	varying vec2 vNormalMapUv;
#endif
#ifdef USE_EMISSIVEMAP
	varying vec2 vEmissiveMapUv;
#endif
#ifdef USE_METALNESSMAP
	varying vec2 vMetalnessMapUv;
#endif
#ifdef USE_ROUGHNESSMAP
	varying vec2 vRoughnessMapUv;
#endif
#ifdef USE_ANISOTROPYMAP
	varying vec2 vAnisotropyMapUv;
#endif
#ifdef USE_CLEARCOATMAP
	varying vec2 vClearcoatMapUv;
#endif
#ifdef USE_CLEARCOAT_NORMALMAP
	varying vec2 vClearcoatNormalMapUv;
#endif
#ifdef USE_CLEARCOAT_ROUGHNESSMAP
	varying vec2 vClearcoatRoughnessMapUv;
#endif
#ifdef USE_IRIDESCENCEMAP
	varying vec2 vIridescenceMapUv;
#endif
#ifdef USE_IRIDESCENCE_THICKNESSMAP
	varying vec2 vIridescenceThicknessMapUv;
#endif
#ifdef USE_SHEEN_COLORMAP
	varying vec2 vSheenColorMapUv;
#endif
#ifdef USE_SHEEN_ROUGHNESSMAP
	varying vec2 vSheenRoughnessMapUv;
#endif
#ifdef USE_SPECULARMAP
	varying vec2 vSpecularMapUv;
#endif
#ifdef USE_SPECULAR_COLORMAP
	varying vec2 vSpecularColorMapUv;
#endif
#ifdef USE_SPECULAR_INTENSITYMAP
	varying vec2 vSpecularIntensityMapUv;
#endif
#ifdef USE_TRANSMISSIONMAP
	uniform mat3 transmissionMapTransform;
	varying vec2 vTransmissionMapUv;
#endif
#ifdef USE_THICKNESSMAP
	uniform mat3 thicknessMapTransform;
	varying vec2 vThicknessMapUv;
#endif`,K0=`#if defined( USE_UV ) || defined( USE_ANISOTROPY )
	varying vec2 vUv;
#endif
#ifdef USE_MAP
	uniform mat3 mapTransform;
	varying vec2 vMapUv;
#endif
#ifdef USE_ALPHAMAP
	uniform mat3 alphaMapTransform;
	varying vec2 vAlphaMapUv;
#endif
#ifdef USE_LIGHTMAP
	uniform mat3 lightMapTransform;
	varying vec2 vLightMapUv;
#endif
#ifdef USE_AOMAP
	uniform mat3 aoMapTransform;
	varying vec2 vAoMapUv;
#endif
#ifdef USE_BUMPMAP
	uniform mat3 bumpMapTransform;
	varying vec2 vBumpMapUv;
#endif
#ifdef USE_NORMALMAP
	uniform mat3 normalMapTransform;
	varying vec2 vNormalMapUv;
#endif
#ifdef USE_DISPLACEMENTMAP
	uniform mat3 displacementMapTransform;
	varying vec2 vDisplacementMapUv;
#endif
#ifdef USE_EMISSIVEMAP
	uniform mat3 emissiveMapTransform;
	varying vec2 vEmissiveMapUv;
#endif
#ifdef USE_METALNESSMAP
	uniform mat3 metalnessMapTransform;
	varying vec2 vMetalnessMapUv;
#endif
#ifdef USE_ROUGHNESSMAP
	uniform mat3 roughnessMapTransform;
	varying vec2 vRoughnessMapUv;
#endif
#ifdef USE_ANISOTROPYMAP
	uniform mat3 anisotropyMapTransform;
	varying vec2 vAnisotropyMapUv;
#endif
#ifdef USE_CLEARCOATMAP
	uniform mat3 clearcoatMapTransform;
	varying vec2 vClearcoatMapUv;
#endif
#ifdef USE_CLEARCOAT_NORMALMAP
	uniform mat3 clearcoatNormalMapTransform;
	varying vec2 vClearcoatNormalMapUv;
#endif
#ifdef USE_CLEARCOAT_ROUGHNESSMAP
	uniform mat3 clearcoatRoughnessMapTransform;
	varying vec2 vClearcoatRoughnessMapUv;
#endif
#ifdef USE_SHEEN_COLORMAP
	uniform mat3 sheenColorMapTransform;
	varying vec2 vSheenColorMapUv;
#endif
#ifdef USE_SHEEN_ROUGHNESSMAP
	uniform mat3 sheenRoughnessMapTransform;
	varying vec2 vSheenRoughnessMapUv;
#endif
#ifdef USE_IRIDESCENCEMAP
	uniform mat3 iridescenceMapTransform;
	varying vec2 vIridescenceMapUv;
#endif
#ifdef USE_IRIDESCENCE_THICKNESSMAP
	uniform mat3 iridescenceThicknessMapTransform;
	varying vec2 vIridescenceThicknessMapUv;
#endif
#ifdef USE_SPECULARMAP
	uniform mat3 specularMapTransform;
	varying vec2 vSpecularMapUv;
#endif
#ifdef USE_SPECULAR_COLORMAP
	uniform mat3 specularColorMapTransform;
	varying vec2 vSpecularColorMapUv;
#endif
#ifdef USE_SPECULAR_INTENSITYMAP
	uniform mat3 specularIntensityMapTransform;
	varying vec2 vSpecularIntensityMapUv;
#endif
#ifdef USE_TRANSMISSIONMAP
	uniform mat3 transmissionMapTransform;
	varying vec2 vTransmissionMapUv;
#endif
#ifdef USE_THICKNESSMAP
	uniform mat3 thicknessMapTransform;
	varying vec2 vThicknessMapUv;
#endif`,Q0=`#if defined( USE_UV ) || defined( USE_ANISOTROPY )
	vUv = vec3( uv, 1 ).xy;
#endif
#ifdef USE_MAP
	vMapUv = ( mapTransform * vec3( MAP_UV, 1 ) ).xy;
#endif
#ifdef USE_ALPHAMAP
	vAlphaMapUv = ( alphaMapTransform * vec3( ALPHAMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_LIGHTMAP
	vLightMapUv = ( lightMapTransform * vec3( LIGHTMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_AOMAP
	vAoMapUv = ( aoMapTransform * vec3( AOMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_BUMPMAP
	vBumpMapUv = ( bumpMapTransform * vec3( BUMPMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_NORMALMAP
	vNormalMapUv = ( normalMapTransform * vec3( NORMALMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_DISPLACEMENTMAP
	vDisplacementMapUv = ( displacementMapTransform * vec3( DISPLACEMENTMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_EMISSIVEMAP
	vEmissiveMapUv = ( emissiveMapTransform * vec3( EMISSIVEMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_METALNESSMAP
	vMetalnessMapUv = ( metalnessMapTransform * vec3( METALNESSMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_ROUGHNESSMAP
	vRoughnessMapUv = ( roughnessMapTransform * vec3( ROUGHNESSMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_ANISOTROPYMAP
	vAnisotropyMapUv = ( anisotropyMapTransform * vec3( ANISOTROPYMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_CLEARCOATMAP
	vClearcoatMapUv = ( clearcoatMapTransform * vec3( CLEARCOATMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_CLEARCOAT_NORMALMAP
	vClearcoatNormalMapUv = ( clearcoatNormalMapTransform * vec3( CLEARCOAT_NORMALMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_CLEARCOAT_ROUGHNESSMAP
	vClearcoatRoughnessMapUv = ( clearcoatRoughnessMapTransform * vec3( CLEARCOAT_ROUGHNESSMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_IRIDESCENCEMAP
	vIridescenceMapUv = ( iridescenceMapTransform * vec3( IRIDESCENCEMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_IRIDESCENCE_THICKNESSMAP
	vIridescenceThicknessMapUv = ( iridescenceThicknessMapTransform * vec3( IRIDESCENCE_THICKNESSMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_SHEEN_COLORMAP
	vSheenColorMapUv = ( sheenColorMapTransform * vec3( SHEEN_COLORMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_SHEEN_ROUGHNESSMAP
	vSheenRoughnessMapUv = ( sheenRoughnessMapTransform * vec3( SHEEN_ROUGHNESSMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_SPECULARMAP
	vSpecularMapUv = ( specularMapTransform * vec3( SPECULARMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_SPECULAR_COLORMAP
	vSpecularColorMapUv = ( specularColorMapTransform * vec3( SPECULAR_COLORMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_SPECULAR_INTENSITYMAP
	vSpecularIntensityMapUv = ( specularIntensityMapTransform * vec3( SPECULAR_INTENSITYMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_TRANSMISSIONMAP
	vTransmissionMapUv = ( transmissionMapTransform * vec3( TRANSMISSIONMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_THICKNESSMAP
	vThicknessMapUv = ( thicknessMapTransform * vec3( THICKNESSMAP_UV, 1 ) ).xy;
#endif`,j0=`#if defined( USE_ENVMAP ) || defined( DISTANCE ) || defined ( USE_SHADOWMAP ) || defined ( USE_TRANSMISSION ) || NUM_SPOT_LIGHT_COORDS > 0
	vec4 worldPosition = vec4( transformed, 1.0 );
	#ifdef USE_BATCHING
		worldPosition = batchingMatrix * worldPosition;
	#endif
	#ifdef USE_INSTANCING
		worldPosition = instanceMatrix * worldPosition;
	#endif
	worldPosition = modelMatrix * worldPosition;
#endif`,ex=`varying vec2 vUv;
uniform mat3 uvTransform;
void main() {
	vUv = ( uvTransform * vec3( uv, 1 ) ).xy;
	gl_Position = vec4( position.xy, 1.0, 1.0 );
}`,tx=`uniform sampler2D t2D;
uniform float backgroundIntensity;
varying vec2 vUv;
void main() {
	vec4 texColor = texture2D( t2D, vUv );
	#ifdef DECODE_VIDEO_TEXTURE
		texColor = vec4( mix( pow( texColor.rgb * 0.9478672986 + vec3( 0.0521327014 ), vec3( 2.4 ) ), texColor.rgb * 0.0773993808, vec3( lessThanEqual( texColor.rgb, vec3( 0.04045 ) ) ) ), texColor.w );
	#endif
	texColor.rgb *= backgroundIntensity;
	gl_FragColor = texColor;
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
}`,nx=`varying vec3 vWorldDirection;
#include <common>
void main() {
	vWorldDirection = transformDirection( position, modelMatrix );
	#include <begin_vertex>
	#include <project_vertex>
	gl_Position.z = gl_Position.w;
}`,ix=`#ifdef ENVMAP_TYPE_CUBE
	uniform samplerCube envMap;
#elif defined( ENVMAP_TYPE_CUBE_UV )
	uniform sampler2D envMap;
#endif
uniform float flipEnvMap;
uniform float backgroundBlurriness;
uniform float backgroundIntensity;
uniform mat3 backgroundRotation;
varying vec3 vWorldDirection;
#include <cube_uv_reflection_fragment>
void main() {
	#ifdef ENVMAP_TYPE_CUBE
		vec4 texColor = textureCube( envMap, backgroundRotation * vec3( flipEnvMap * vWorldDirection.x, vWorldDirection.yz ) );
	#elif defined( ENVMAP_TYPE_CUBE_UV )
		vec4 texColor = textureCubeUV( envMap, backgroundRotation * vWorldDirection, backgroundBlurriness );
	#else
		vec4 texColor = vec4( 0.0, 0.0, 0.0, 1.0 );
	#endif
	texColor.rgb *= backgroundIntensity;
	gl_FragColor = texColor;
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
}`,rx=`varying vec3 vWorldDirection;
#include <common>
void main() {
	vWorldDirection = transformDirection( position, modelMatrix );
	#include <begin_vertex>
	#include <project_vertex>
	gl_Position.z = gl_Position.w;
}`,sx=`uniform samplerCube tCube;
uniform float tFlip;
uniform float opacity;
varying vec3 vWorldDirection;
void main() {
	vec4 texColor = textureCube( tCube, vec3( tFlip * vWorldDirection.x, vWorldDirection.yz ) );
	gl_FragColor = texColor;
	gl_FragColor.a *= opacity;
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
}`,ax=`#include <common>
#include <batching_pars_vertex>
#include <uv_pars_vertex>
#include <displacementmap_pars_vertex>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>
varying vec2 vHighPrecisionZW;
void main() {
	#include <uv_vertex>
	#include <batching_vertex>
	#include <skinbase_vertex>
	#include <morphinstance_vertex>
	#ifdef USE_DISPLACEMENTMAP
		#include <beginnormal_vertex>
		#include <morphnormal_vertex>
		#include <skinnormal_vertex>
	#endif
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <skinning_vertex>
	#include <displacementmap_vertex>
	#include <project_vertex>
	#include <logdepthbuf_vertex>
	#include <clipping_planes_vertex>
	vHighPrecisionZW = gl_Position.zw;
}`,ox=`#if DEPTH_PACKING == 3200
	uniform float opacity;
#endif
#include <common>
#include <packing>
#include <uv_pars_fragment>
#include <map_pars_fragment>
#include <alphamap_pars_fragment>
#include <alphatest_pars_fragment>
#include <alphahash_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>
varying vec2 vHighPrecisionZW;
void main() {
	vec4 diffuseColor = vec4( 1.0 );
	#include <clipping_planes_fragment>
	#if DEPTH_PACKING == 3200
		diffuseColor.a = opacity;
	#endif
	#include <map_fragment>
	#include <alphamap_fragment>
	#include <alphatest_fragment>
	#include <alphahash_fragment>
	#include <logdepthbuf_fragment>
	#ifdef USE_REVERSED_DEPTH_BUFFER
		float fragCoordZ = vHighPrecisionZW[ 0 ] / vHighPrecisionZW[ 1 ];
	#else
		float fragCoordZ = 0.5 * vHighPrecisionZW[ 0 ] / vHighPrecisionZW[ 1 ] + 0.5;
	#endif
	#if DEPTH_PACKING == 3200
		gl_FragColor = vec4( vec3( 1.0 - fragCoordZ ), opacity );
	#elif DEPTH_PACKING == 3201
		gl_FragColor = packDepthToRGBA( fragCoordZ );
	#elif DEPTH_PACKING == 3202
		gl_FragColor = vec4( packDepthToRGB( fragCoordZ ), 1.0 );
	#elif DEPTH_PACKING == 3203
		gl_FragColor = vec4( packDepthToRG( fragCoordZ ), 0.0, 1.0 );
	#endif
}`,lx=`#define DISTANCE
varying vec3 vWorldPosition;
#include <common>
#include <batching_pars_vertex>
#include <uv_pars_vertex>
#include <displacementmap_pars_vertex>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>
#include <clipping_planes_pars_vertex>
void main() {
	#include <uv_vertex>
	#include <batching_vertex>
	#include <skinbase_vertex>
	#include <morphinstance_vertex>
	#ifdef USE_DISPLACEMENTMAP
		#include <beginnormal_vertex>
		#include <morphnormal_vertex>
		#include <skinnormal_vertex>
	#endif
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <skinning_vertex>
	#include <displacementmap_vertex>
	#include <project_vertex>
	#include <worldpos_vertex>
	#include <clipping_planes_vertex>
	vWorldPosition = worldPosition.xyz;
}`,cx=`#define DISTANCE
uniform vec3 referencePosition;
uniform float nearDistance;
uniform float farDistance;
varying vec3 vWorldPosition;
#include <common>
#include <uv_pars_fragment>
#include <map_pars_fragment>
#include <alphamap_pars_fragment>
#include <alphatest_pars_fragment>
#include <alphahash_pars_fragment>
#include <clipping_planes_pars_fragment>
void main () {
	vec4 diffuseColor = vec4( 1.0 );
	#include <clipping_planes_fragment>
	#include <map_fragment>
	#include <alphamap_fragment>
	#include <alphatest_fragment>
	#include <alphahash_fragment>
	float dist = length( vWorldPosition - referencePosition );
	dist = ( dist - nearDistance ) / ( farDistance - nearDistance );
	dist = saturate( dist );
	gl_FragColor = vec4( dist, 0.0, 0.0, 1.0 );
}`,ux=`varying vec3 vWorldDirection;
#include <common>
void main() {
	vWorldDirection = transformDirection( position, modelMatrix );
	#include <begin_vertex>
	#include <project_vertex>
}`,hx=`uniform sampler2D tEquirect;
varying vec3 vWorldDirection;
#include <common>
void main() {
	vec3 direction = normalize( vWorldDirection );
	vec2 sampleUV = equirectUv( direction );
	gl_FragColor = texture2D( tEquirect, sampleUV );
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
}`,dx=`uniform float scale;
attribute float lineDistance;
varying float vLineDistance;
#include <common>
#include <uv_pars_vertex>
#include <color_pars_vertex>
#include <fog_pars_vertex>
#include <morphtarget_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>
void main() {
	vLineDistance = scale * lineDistance;
	#include <uv_vertex>
	#include <color_vertex>
	#include <morphinstance_vertex>
	#include <morphcolor_vertex>
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <project_vertex>
	#include <logdepthbuf_vertex>
	#include <clipping_planes_vertex>
	#include <fog_vertex>
}`,fx=`uniform vec3 diffuse;
uniform float opacity;
uniform float dashSize;
uniform float totalSize;
varying float vLineDistance;
#include <common>
#include <color_pars_fragment>
#include <uv_pars_fragment>
#include <map_pars_fragment>
#include <fog_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>
void main() {
	vec4 diffuseColor = vec4( diffuse, opacity );
	#include <clipping_planes_fragment>
	if ( mod( vLineDistance, totalSize ) > dashSize ) {
		discard;
	}
	vec3 outgoingLight = vec3( 0.0 );
	#include <logdepthbuf_fragment>
	#include <map_fragment>
	#include <color_fragment>
	outgoingLight = diffuseColor.rgb;
	#include <opaque_fragment>
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
	#include <fog_fragment>
	#include <premultiplied_alpha_fragment>
}`,px=`#include <common>
#include <batching_pars_vertex>
#include <uv_pars_vertex>
#include <envmap_pars_vertex>
#include <color_pars_vertex>
#include <fog_pars_vertex>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>
void main() {
	#include <uv_vertex>
	#include <color_vertex>
	#include <morphinstance_vertex>
	#include <morphcolor_vertex>
	#include <batching_vertex>
	#if defined ( USE_ENVMAP ) || defined ( USE_SKINNING )
		#include <beginnormal_vertex>
		#include <morphnormal_vertex>
		#include <skinbase_vertex>
		#include <skinnormal_vertex>
		#include <defaultnormal_vertex>
	#endif
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <skinning_vertex>
	#include <project_vertex>
	#include <logdepthbuf_vertex>
	#include <clipping_planes_vertex>
	#include <worldpos_vertex>
	#include <envmap_vertex>
	#include <fog_vertex>
}`,mx=`uniform vec3 diffuse;
uniform float opacity;
#ifndef FLAT_SHADED
	varying vec3 vNormal;
#endif
#include <common>
#include <dithering_pars_fragment>
#include <color_pars_fragment>
#include <uv_pars_fragment>
#include <map_pars_fragment>
#include <alphamap_pars_fragment>
#include <alphatest_pars_fragment>
#include <alphahash_pars_fragment>
#include <aomap_pars_fragment>
#include <lightmap_pars_fragment>
#include <envmap_common_pars_fragment>
#include <envmap_pars_fragment>
#include <fog_pars_fragment>
#include <specularmap_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>
void main() {
	vec4 diffuseColor = vec4( diffuse, opacity );
	#include <clipping_planes_fragment>
	#include <logdepthbuf_fragment>
	#include <map_fragment>
	#include <color_fragment>
	#include <alphamap_fragment>
	#include <alphatest_fragment>
	#include <alphahash_fragment>
	#include <specularmap_fragment>
	ReflectedLight reflectedLight = ReflectedLight( vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ) );
	#ifdef USE_LIGHTMAP
		vec4 lightMapTexel = texture2D( lightMap, vLightMapUv );
		reflectedLight.indirectDiffuse += lightMapTexel.rgb * lightMapIntensity * RECIPROCAL_PI;
	#else
		reflectedLight.indirectDiffuse += vec3( 1.0 );
	#endif
	#include <aomap_fragment>
	reflectedLight.indirectDiffuse *= diffuseColor.rgb;
	vec3 outgoingLight = reflectedLight.indirectDiffuse;
	#include <envmap_fragment>
	#include <opaque_fragment>
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
	#include <fog_fragment>
	#include <premultiplied_alpha_fragment>
	#include <dithering_fragment>
}`,gx=`#define LAMBERT
varying vec3 vViewPosition;
#include <common>
#include <batching_pars_vertex>
#include <uv_pars_vertex>
#include <displacementmap_pars_vertex>
#include <envmap_pars_vertex>
#include <color_pars_vertex>
#include <fog_pars_vertex>
#include <normal_pars_vertex>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>
#include <shadowmap_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>
void main() {
	#include <uv_vertex>
	#include <color_vertex>
	#include <morphinstance_vertex>
	#include <morphcolor_vertex>
	#include <batching_vertex>
	#include <beginnormal_vertex>
	#include <morphnormal_vertex>
	#include <skinbase_vertex>
	#include <skinnormal_vertex>
	#include <defaultnormal_vertex>
	#include <normal_vertex>
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <skinning_vertex>
	#include <displacementmap_vertex>
	#include <project_vertex>
	#include <logdepthbuf_vertex>
	#include <clipping_planes_vertex>
	vViewPosition = - mvPosition.xyz;
	#include <worldpos_vertex>
	#include <envmap_vertex>
	#include <shadowmap_vertex>
	#include <fog_vertex>
}`,_x=`#define LAMBERT
uniform vec3 diffuse;
uniform vec3 emissive;
uniform float opacity;
#include <common>
#include <dithering_pars_fragment>
#include <color_pars_fragment>
#include <uv_pars_fragment>
#include <map_pars_fragment>
#include <alphamap_pars_fragment>
#include <alphatest_pars_fragment>
#include <alphahash_pars_fragment>
#include <aomap_pars_fragment>
#include <lightmap_pars_fragment>
#include <emissivemap_pars_fragment>
#include <envmap_common_pars_fragment>
#include <envmap_pars_fragment>
#include <fog_pars_fragment>
#include <bsdfs>
#include <lights_pars_begin>
#include <normal_pars_fragment>
#include <lights_lambert_pars_fragment>
#include <shadowmap_pars_fragment>
#include <bumpmap_pars_fragment>
#include <normalmap_pars_fragment>
#include <specularmap_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>
void main() {
	vec4 diffuseColor = vec4( diffuse, opacity );
	#include <clipping_planes_fragment>
	ReflectedLight reflectedLight = ReflectedLight( vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ) );
	vec3 totalEmissiveRadiance = emissive;
	#include <logdepthbuf_fragment>
	#include <map_fragment>
	#include <color_fragment>
	#include <alphamap_fragment>
	#include <alphatest_fragment>
	#include <alphahash_fragment>
	#include <specularmap_fragment>
	#include <normal_fragment_begin>
	#include <normal_fragment_maps>
	#include <emissivemap_fragment>
	#include <lights_lambert_fragment>
	#include <lights_fragment_begin>
	#include <lights_fragment_maps>
	#include <lights_fragment_end>
	#include <aomap_fragment>
	vec3 outgoingLight = reflectedLight.directDiffuse + reflectedLight.indirectDiffuse + totalEmissiveRadiance;
	#include <envmap_fragment>
	#include <opaque_fragment>
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
	#include <fog_fragment>
	#include <premultiplied_alpha_fragment>
	#include <dithering_fragment>
}`,xx=`#define MATCAP
varying vec3 vViewPosition;
#include <common>
#include <batching_pars_vertex>
#include <uv_pars_vertex>
#include <color_pars_vertex>
#include <displacementmap_pars_vertex>
#include <fog_pars_vertex>
#include <normal_pars_vertex>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>
void main() {
	#include <uv_vertex>
	#include <color_vertex>
	#include <morphinstance_vertex>
	#include <morphcolor_vertex>
	#include <batching_vertex>
	#include <beginnormal_vertex>
	#include <morphnormal_vertex>
	#include <skinbase_vertex>
	#include <skinnormal_vertex>
	#include <defaultnormal_vertex>
	#include <normal_vertex>
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <skinning_vertex>
	#include <displacementmap_vertex>
	#include <project_vertex>
	#include <logdepthbuf_vertex>
	#include <clipping_planes_vertex>
	#include <fog_vertex>
	vViewPosition = - mvPosition.xyz;
}`,vx=`#define MATCAP
uniform vec3 diffuse;
uniform float opacity;
uniform sampler2D matcap;
varying vec3 vViewPosition;
#include <common>
#include <dithering_pars_fragment>
#include <color_pars_fragment>
#include <uv_pars_fragment>
#include <map_pars_fragment>
#include <alphamap_pars_fragment>
#include <alphatest_pars_fragment>
#include <alphahash_pars_fragment>
#include <fog_pars_fragment>
#include <normal_pars_fragment>
#include <bumpmap_pars_fragment>
#include <normalmap_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>
void main() {
	vec4 diffuseColor = vec4( diffuse, opacity );
	#include <clipping_planes_fragment>
	#include <logdepthbuf_fragment>
	#include <map_fragment>
	#include <color_fragment>
	#include <alphamap_fragment>
	#include <alphatest_fragment>
	#include <alphahash_fragment>
	#include <normal_fragment_begin>
	#include <normal_fragment_maps>
	vec3 viewDir = normalize( vViewPosition );
	vec3 x = normalize( vec3( viewDir.z, 0.0, - viewDir.x ) );
	vec3 y = cross( viewDir, x );
	vec2 uv = vec2( dot( x, normal ), dot( y, normal ) ) * 0.495 + 0.5;
	#ifdef USE_MATCAP
		vec4 matcapColor = texture2D( matcap, uv );
	#else
		vec4 matcapColor = vec4( vec3( mix( 0.2, 0.8, uv.y ) ), 1.0 );
	#endif
	vec3 outgoingLight = diffuseColor.rgb * matcapColor.rgb;
	#include <opaque_fragment>
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
	#include <fog_fragment>
	#include <premultiplied_alpha_fragment>
	#include <dithering_fragment>
}`,yx=`#define NORMAL
#if defined( FLAT_SHADED ) || defined( USE_BUMPMAP ) || defined( USE_NORMALMAP_TANGENTSPACE )
	varying vec3 vViewPosition;
#endif
#include <common>
#include <batching_pars_vertex>
#include <uv_pars_vertex>
#include <displacementmap_pars_vertex>
#include <normal_pars_vertex>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>
void main() {
	#include <uv_vertex>
	#include <batching_vertex>
	#include <beginnormal_vertex>
	#include <morphinstance_vertex>
	#include <morphnormal_vertex>
	#include <skinbase_vertex>
	#include <skinnormal_vertex>
	#include <defaultnormal_vertex>
	#include <normal_vertex>
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <skinning_vertex>
	#include <displacementmap_vertex>
	#include <project_vertex>
	#include <logdepthbuf_vertex>
	#include <clipping_planes_vertex>
#if defined( FLAT_SHADED ) || defined( USE_BUMPMAP ) || defined( USE_NORMALMAP_TANGENTSPACE )
	vViewPosition = - mvPosition.xyz;
#endif
}`,bx=`#define NORMAL
uniform float opacity;
#if defined( FLAT_SHADED ) || defined( USE_BUMPMAP ) || defined( USE_NORMALMAP_TANGENTSPACE )
	varying vec3 vViewPosition;
#endif
#include <uv_pars_fragment>
#include <normal_pars_fragment>
#include <bumpmap_pars_fragment>
#include <normalmap_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>
void main() {
	vec4 diffuseColor = vec4( 0.0, 0.0, 0.0, opacity );
	#include <clipping_planes_fragment>
	#include <logdepthbuf_fragment>
	#include <normal_fragment_begin>
	#include <normal_fragment_maps>
	gl_FragColor = vec4( normalize( normal ) * 0.5 + 0.5, diffuseColor.a );
	#ifdef OPAQUE
		gl_FragColor.a = 1.0;
	#endif
}`,Mx=`#define PHONG
varying vec3 vViewPosition;
#include <common>
#include <batching_pars_vertex>
#include <uv_pars_vertex>
#include <displacementmap_pars_vertex>
#include <envmap_pars_vertex>
#include <color_pars_vertex>
#include <fog_pars_vertex>
#include <normal_pars_vertex>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>
#include <shadowmap_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>
void main() {
	#include <uv_vertex>
	#include <color_vertex>
	#include <morphcolor_vertex>
	#include <batching_vertex>
	#include <beginnormal_vertex>
	#include <morphinstance_vertex>
	#include <morphnormal_vertex>
	#include <skinbase_vertex>
	#include <skinnormal_vertex>
	#include <defaultnormal_vertex>
	#include <normal_vertex>
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <skinning_vertex>
	#include <displacementmap_vertex>
	#include <project_vertex>
	#include <logdepthbuf_vertex>
	#include <clipping_planes_vertex>
	vViewPosition = - mvPosition.xyz;
	#include <worldpos_vertex>
	#include <envmap_vertex>
	#include <shadowmap_vertex>
	#include <fog_vertex>
}`,Sx=`#define PHONG
uniform vec3 diffuse;
uniform vec3 emissive;
uniform vec3 specular;
uniform float shininess;
uniform float opacity;
#include <common>
#include <dithering_pars_fragment>
#include <color_pars_fragment>
#include <uv_pars_fragment>
#include <map_pars_fragment>
#include <alphamap_pars_fragment>
#include <alphatest_pars_fragment>
#include <alphahash_pars_fragment>
#include <aomap_pars_fragment>
#include <lightmap_pars_fragment>
#include <emissivemap_pars_fragment>
#include <envmap_common_pars_fragment>
#include <envmap_pars_fragment>
#include <fog_pars_fragment>
#include <bsdfs>
#include <lights_pars_begin>
#include <normal_pars_fragment>
#include <lights_phong_pars_fragment>
#include <shadowmap_pars_fragment>
#include <bumpmap_pars_fragment>
#include <normalmap_pars_fragment>
#include <specularmap_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>
void main() {
	vec4 diffuseColor = vec4( diffuse, opacity );
	#include <clipping_planes_fragment>
	ReflectedLight reflectedLight = ReflectedLight( vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ) );
	vec3 totalEmissiveRadiance = emissive;
	#include <logdepthbuf_fragment>
	#include <map_fragment>
	#include <color_fragment>
	#include <alphamap_fragment>
	#include <alphatest_fragment>
	#include <alphahash_fragment>
	#include <specularmap_fragment>
	#include <normal_fragment_begin>
	#include <normal_fragment_maps>
	#include <emissivemap_fragment>
	#include <lights_phong_fragment>
	#include <lights_fragment_begin>
	#include <lights_fragment_maps>
	#include <lights_fragment_end>
	#include <aomap_fragment>
	vec3 outgoingLight = reflectedLight.directDiffuse + reflectedLight.indirectDiffuse + reflectedLight.directSpecular + reflectedLight.indirectSpecular + totalEmissiveRadiance;
	#include <envmap_fragment>
	#include <opaque_fragment>
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
	#include <fog_fragment>
	#include <premultiplied_alpha_fragment>
	#include <dithering_fragment>
}`,wx=`#define STANDARD
varying vec3 vViewPosition;
#ifdef USE_TRANSMISSION
	varying vec3 vWorldPosition;
#endif
#include <common>
#include <batching_pars_vertex>
#include <uv_pars_vertex>
#include <displacementmap_pars_vertex>
#include <color_pars_vertex>
#include <fog_pars_vertex>
#include <normal_pars_vertex>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>
#include <shadowmap_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>
void main() {
	#include <uv_vertex>
	#include <color_vertex>
	#include <morphinstance_vertex>
	#include <morphcolor_vertex>
	#include <batching_vertex>
	#include <beginnormal_vertex>
	#include <morphnormal_vertex>
	#include <skinbase_vertex>
	#include <skinnormal_vertex>
	#include <defaultnormal_vertex>
	#include <normal_vertex>
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <skinning_vertex>
	#include <displacementmap_vertex>
	#include <project_vertex>
	#include <logdepthbuf_vertex>
	#include <clipping_planes_vertex>
	vViewPosition = - mvPosition.xyz;
	#include <worldpos_vertex>
	#include <shadowmap_vertex>
	#include <fog_vertex>
#ifdef USE_TRANSMISSION
	vWorldPosition = worldPosition.xyz;
#endif
}`,Tx=`#define STANDARD
#ifdef PHYSICAL
	#define IOR
	#define USE_SPECULAR
#endif
uniform vec3 diffuse;
uniform vec3 emissive;
uniform float roughness;
uniform float metalness;
uniform float opacity;
#ifdef IOR
	uniform float ior;
#endif
#ifdef USE_SPECULAR
	uniform float specularIntensity;
	uniform vec3 specularColor;
	#ifdef USE_SPECULAR_COLORMAP
		uniform sampler2D specularColorMap;
	#endif
	#ifdef USE_SPECULAR_INTENSITYMAP
		uniform sampler2D specularIntensityMap;
	#endif
#endif
#ifdef USE_CLEARCOAT
	uniform float clearcoat;
	uniform float clearcoatRoughness;
#endif
#ifdef USE_DISPERSION
	uniform float dispersion;
#endif
#ifdef USE_IRIDESCENCE
	uniform float iridescence;
	uniform float iridescenceIOR;
	uniform float iridescenceThicknessMinimum;
	uniform float iridescenceThicknessMaximum;
#endif
#ifdef USE_SHEEN
	uniform vec3 sheenColor;
	uniform float sheenRoughness;
	#ifdef USE_SHEEN_COLORMAP
		uniform sampler2D sheenColorMap;
	#endif
	#ifdef USE_SHEEN_ROUGHNESSMAP
		uniform sampler2D sheenRoughnessMap;
	#endif
#endif
#ifdef USE_ANISOTROPY
	uniform vec2 anisotropyVector;
	#ifdef USE_ANISOTROPYMAP
		uniform sampler2D anisotropyMap;
	#endif
#endif
varying vec3 vViewPosition;
#include <common>
#include <dithering_pars_fragment>
#include <color_pars_fragment>
#include <uv_pars_fragment>
#include <map_pars_fragment>
#include <alphamap_pars_fragment>
#include <alphatest_pars_fragment>
#include <alphahash_pars_fragment>
#include <aomap_pars_fragment>
#include <lightmap_pars_fragment>
#include <emissivemap_pars_fragment>
#include <iridescence_fragment>
#include <cube_uv_reflection_fragment>
#include <envmap_common_pars_fragment>
#include <envmap_physical_pars_fragment>
#include <fog_pars_fragment>
#include <lights_pars_begin>
#include <normal_pars_fragment>
#include <lights_physical_pars_fragment>
#include <transmission_pars_fragment>
#include <shadowmap_pars_fragment>
#include <bumpmap_pars_fragment>
#include <normalmap_pars_fragment>
#include <clearcoat_pars_fragment>
#include <iridescence_pars_fragment>
#include <roughnessmap_pars_fragment>
#include <metalnessmap_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>
void main() {
	vec4 diffuseColor = vec4( diffuse, opacity );
	#include <clipping_planes_fragment>
	ReflectedLight reflectedLight = ReflectedLight( vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ) );
	vec3 totalEmissiveRadiance = emissive;
	#include <logdepthbuf_fragment>
	#include <map_fragment>
	#include <color_fragment>
	#include <alphamap_fragment>
	#include <alphatest_fragment>
	#include <alphahash_fragment>
	#include <roughnessmap_fragment>
	#include <metalnessmap_fragment>
	#include <normal_fragment_begin>
	#include <normal_fragment_maps>
	#include <clearcoat_normal_fragment_begin>
	#include <clearcoat_normal_fragment_maps>
	#include <emissivemap_fragment>
	#include <lights_physical_fragment>
	#include <lights_fragment_begin>
	#include <lights_fragment_maps>
	#include <lights_fragment_end>
	#include <aomap_fragment>
	vec3 totalDiffuse = reflectedLight.directDiffuse + reflectedLight.indirectDiffuse;
	vec3 totalSpecular = reflectedLight.directSpecular + reflectedLight.indirectSpecular;
	#include <transmission_fragment>
	vec3 outgoingLight = totalDiffuse + totalSpecular + totalEmissiveRadiance;
	#ifdef USE_SHEEN
 
		outgoingLight = outgoingLight + sheenSpecularDirect + sheenSpecularIndirect;
 
 	#endif
	#ifdef USE_CLEARCOAT
		float dotNVcc = saturate( dot( geometryClearcoatNormal, geometryViewDir ) );
		vec3 Fcc = F_Schlick( material.clearcoatF0, material.clearcoatF90, dotNVcc );
		outgoingLight = outgoingLight * ( 1.0 - material.clearcoat * Fcc ) + ( clearcoatSpecularDirect + clearcoatSpecularIndirect ) * material.clearcoat;
	#endif
	#include <opaque_fragment>
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
	#include <fog_fragment>
	#include <premultiplied_alpha_fragment>
	#include <dithering_fragment>
}`,Ax=`#define TOON
varying vec3 vViewPosition;
#include <common>
#include <batching_pars_vertex>
#include <uv_pars_vertex>
#include <displacementmap_pars_vertex>
#include <color_pars_vertex>
#include <fog_pars_vertex>
#include <normal_pars_vertex>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>
#include <shadowmap_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>
void main() {
	#include <uv_vertex>
	#include <color_vertex>
	#include <morphinstance_vertex>
	#include <morphcolor_vertex>
	#include <batching_vertex>
	#include <beginnormal_vertex>
	#include <morphnormal_vertex>
	#include <skinbase_vertex>
	#include <skinnormal_vertex>
	#include <defaultnormal_vertex>
	#include <normal_vertex>
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <skinning_vertex>
	#include <displacementmap_vertex>
	#include <project_vertex>
	#include <logdepthbuf_vertex>
	#include <clipping_planes_vertex>
	vViewPosition = - mvPosition.xyz;
	#include <worldpos_vertex>
	#include <shadowmap_vertex>
	#include <fog_vertex>
}`,Ex=`#define TOON
uniform vec3 diffuse;
uniform vec3 emissive;
uniform float opacity;
#include <common>
#include <dithering_pars_fragment>
#include <color_pars_fragment>
#include <uv_pars_fragment>
#include <map_pars_fragment>
#include <alphamap_pars_fragment>
#include <alphatest_pars_fragment>
#include <alphahash_pars_fragment>
#include <aomap_pars_fragment>
#include <lightmap_pars_fragment>
#include <emissivemap_pars_fragment>
#include <gradientmap_pars_fragment>
#include <fog_pars_fragment>
#include <bsdfs>
#include <lights_pars_begin>
#include <normal_pars_fragment>
#include <lights_toon_pars_fragment>
#include <shadowmap_pars_fragment>
#include <bumpmap_pars_fragment>
#include <normalmap_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>
void main() {
	vec4 diffuseColor = vec4( diffuse, opacity );
	#include <clipping_planes_fragment>
	ReflectedLight reflectedLight = ReflectedLight( vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ) );
	vec3 totalEmissiveRadiance = emissive;
	#include <logdepthbuf_fragment>
	#include <map_fragment>
	#include <color_fragment>
	#include <alphamap_fragment>
	#include <alphatest_fragment>
	#include <alphahash_fragment>
	#include <normal_fragment_begin>
	#include <normal_fragment_maps>
	#include <emissivemap_fragment>
	#include <lights_toon_fragment>
	#include <lights_fragment_begin>
	#include <lights_fragment_maps>
	#include <lights_fragment_end>
	#include <aomap_fragment>
	vec3 outgoingLight = reflectedLight.directDiffuse + reflectedLight.indirectDiffuse + totalEmissiveRadiance;
	#include <opaque_fragment>
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
	#include <fog_fragment>
	#include <premultiplied_alpha_fragment>
	#include <dithering_fragment>
}`,Cx=`uniform float size;
uniform float scale;
#include <common>
#include <color_pars_vertex>
#include <fog_pars_vertex>
#include <morphtarget_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>
#ifdef USE_POINTS_UV
	varying vec2 vUv;
	uniform mat3 uvTransform;
#endif
void main() {
	#ifdef USE_POINTS_UV
		vUv = ( uvTransform * vec3( uv, 1 ) ).xy;
	#endif
	#include <color_vertex>
	#include <morphinstance_vertex>
	#include <morphcolor_vertex>
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <project_vertex>
	gl_PointSize = size;
	#ifdef USE_SIZEATTENUATION
		bool isPerspective = isPerspectiveMatrix( projectionMatrix );
		if ( isPerspective ) gl_PointSize *= ( scale / - mvPosition.z );
	#endif
	#include <logdepthbuf_vertex>
	#include <clipping_planes_vertex>
	#include <worldpos_vertex>
	#include <fog_vertex>
}`,Rx=`uniform vec3 diffuse;
uniform float opacity;
#include <common>
#include <color_pars_fragment>
#include <map_particle_pars_fragment>
#include <alphatest_pars_fragment>
#include <alphahash_pars_fragment>
#include <fog_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>
void main() {
	vec4 diffuseColor = vec4( diffuse, opacity );
	#include <clipping_planes_fragment>
	vec3 outgoingLight = vec3( 0.0 );
	#include <logdepthbuf_fragment>
	#include <map_particle_fragment>
	#include <color_fragment>
	#include <alphatest_fragment>
	#include <alphahash_fragment>
	outgoingLight = diffuseColor.rgb;
	#include <opaque_fragment>
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
	#include <fog_fragment>
	#include <premultiplied_alpha_fragment>
}`,Px=`#include <common>
#include <batching_pars_vertex>
#include <fog_pars_vertex>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <shadowmap_pars_vertex>
void main() {
	#include <batching_vertex>
	#include <beginnormal_vertex>
	#include <morphinstance_vertex>
	#include <morphnormal_vertex>
	#include <skinbase_vertex>
	#include <skinnormal_vertex>
	#include <defaultnormal_vertex>
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <skinning_vertex>
	#include <project_vertex>
	#include <logdepthbuf_vertex>
	#include <worldpos_vertex>
	#include <shadowmap_vertex>
	#include <fog_vertex>
}`,Ix=`uniform vec3 color;
uniform float opacity;
#include <common>
#include <fog_pars_fragment>
#include <bsdfs>
#include <lights_pars_begin>
#include <logdepthbuf_pars_fragment>
#include <shadowmap_pars_fragment>
#include <shadowmask_pars_fragment>
void main() {
	#include <logdepthbuf_fragment>
	gl_FragColor = vec4( color, opacity * ( 1.0 - getShadowMask() ) );
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
	#include <fog_fragment>
}`,Dx=`uniform float rotation;
uniform vec2 center;
#include <common>
#include <uv_pars_vertex>
#include <fog_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>
void main() {
	#include <uv_vertex>
	vec4 mvPosition = modelViewMatrix[ 3 ];
	vec2 scale = vec2( length( modelMatrix[ 0 ].xyz ), length( modelMatrix[ 1 ].xyz ) );
	#ifndef USE_SIZEATTENUATION
		bool isPerspective = isPerspectiveMatrix( projectionMatrix );
		if ( isPerspective ) scale *= - mvPosition.z;
	#endif
	vec2 alignedPosition = ( position.xy - ( center - vec2( 0.5 ) ) ) * scale;
	vec2 rotatedPosition;
	rotatedPosition.x = cos( rotation ) * alignedPosition.x - sin( rotation ) * alignedPosition.y;
	rotatedPosition.y = sin( rotation ) * alignedPosition.x + cos( rotation ) * alignedPosition.y;
	mvPosition.xy += rotatedPosition;
	gl_Position = projectionMatrix * mvPosition;
	#include <logdepthbuf_vertex>
	#include <clipping_planes_vertex>
	#include <fog_vertex>
}`,Lx=`uniform vec3 diffuse;
uniform float opacity;
#include <common>
#include <uv_pars_fragment>
#include <map_pars_fragment>
#include <alphamap_pars_fragment>
#include <alphatest_pars_fragment>
#include <alphahash_pars_fragment>
#include <fog_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>
void main() {
	vec4 diffuseColor = vec4( diffuse, opacity );
	#include <clipping_planes_fragment>
	vec3 outgoingLight = vec3( 0.0 );
	#include <logdepthbuf_fragment>
	#include <map_fragment>
	#include <alphamap_fragment>
	#include <alphatest_fragment>
	#include <alphahash_fragment>
	outgoingLight = diffuseColor.rgb;
	#include <opaque_fragment>
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
	#include <fog_fragment>
}`,qe={alphahash_fragment:t_,alphahash_pars_fragment:n_,alphamap_fragment:i_,alphamap_pars_fragment:r_,alphatest_fragment:s_,alphatest_pars_fragment:a_,aomap_fragment:o_,aomap_pars_fragment:l_,batching_pars_vertex:c_,batching_vertex:u_,begin_vertex:h_,beginnormal_vertex:d_,bsdfs:f_,iridescence_fragment:p_,bumpmap_pars_fragment:m_,clipping_planes_fragment:g_,clipping_planes_pars_fragment:__,clipping_planes_pars_vertex:x_,clipping_planes_vertex:v_,color_fragment:y_,color_pars_fragment:b_,color_pars_vertex:M_,color_vertex:S_,common:w_,cube_uv_reflection_fragment:T_,defaultnormal_vertex:A_,displacementmap_pars_vertex:E_,displacementmap_vertex:C_,emissivemap_fragment:R_,emissivemap_pars_fragment:P_,colorspace_fragment:I_,colorspace_pars_fragment:D_,envmap_fragment:L_,envmap_common_pars_fragment:N_,envmap_pars_fragment:F_,envmap_pars_vertex:U_,envmap_physical_pars_fragment:Y_,envmap_vertex:O_,fog_vertex:B_,fog_pars_vertex:k_,fog_fragment:z_,fog_pars_fragment:V_,gradientmap_pars_fragment:G_,lightmap_pars_fragment:H_,lights_lambert_fragment:W_,lights_lambert_pars_fragment:X_,lights_pars_begin:q_,lights_toon_fragment:Z_,lights_toon_pars_fragment:J_,lights_phong_fragment:$_,lights_phong_pars_fragment:K_,lights_physical_fragment:Q_,lights_physical_pars_fragment:j_,lights_fragment_begin:e0,lights_fragment_maps:t0,lights_fragment_end:n0,logdepthbuf_fragment:i0,logdepthbuf_pars_fragment:r0,logdepthbuf_pars_vertex:s0,logdepthbuf_vertex:a0,map_fragment:o0,map_pars_fragment:l0,map_particle_fragment:c0,map_particle_pars_fragment:u0,metalnessmap_fragment:h0,metalnessmap_pars_fragment:d0,morphinstance_vertex:f0,morphcolor_vertex:p0,morphnormal_vertex:m0,morphtarget_pars_vertex:g0,morphtarget_vertex:_0,normal_fragment_begin:x0,normal_fragment_maps:v0,normal_pars_fragment:y0,normal_pars_vertex:b0,normal_vertex:M0,normalmap_pars_fragment:S0,clearcoat_normal_fragment_begin:w0,clearcoat_normal_fragment_maps:T0,clearcoat_pars_fragment:A0,iridescence_pars_fragment:E0,opaque_fragment:C0,packing:R0,premultiplied_alpha_fragment:P0,project_vertex:I0,dithering_fragment:D0,dithering_pars_fragment:L0,roughnessmap_fragment:N0,roughnessmap_pars_fragment:F0,shadowmap_pars_fragment:U0,shadowmap_pars_vertex:O0,shadowmap_vertex:B0,shadowmask_pars_fragment:k0,skinbase_vertex:z0,skinning_pars_vertex:V0,skinning_vertex:G0,skinnormal_vertex:H0,specularmap_fragment:W0,specularmap_pars_fragment:X0,tonemapping_fragment:q0,tonemapping_pars_fragment:Y0,transmission_fragment:Z0,transmission_pars_fragment:J0,uv_pars_fragment:$0,uv_pars_vertex:K0,uv_vertex:Q0,worldpos_vertex:j0,background_vert:ex,background_frag:tx,backgroundCube_vert:nx,backgroundCube_frag:ix,cube_vert:rx,cube_frag:sx,depth_vert:ax,depth_frag:ox,distance_vert:lx,distance_frag:cx,equirect_vert:ux,equirect_frag:hx,linedashed_vert:dx,linedashed_frag:fx,meshbasic_vert:px,meshbasic_frag:mx,meshlambert_vert:gx,meshlambert_frag:_x,meshmatcap_vert:xx,meshmatcap_frag:vx,meshnormal_vert:yx,meshnormal_frag:bx,meshphong_vert:Mx,meshphong_frag:Sx,meshphysical_vert:wx,meshphysical_frag:Tx,meshtoon_vert:Ax,meshtoon_frag:Ex,points_vert:Cx,points_frag:Rx,shadow_vert:Px,shadow_frag:Ix,sprite_vert:Dx,sprite_frag:Lx},ge={common:{diffuse:{value:new it(16777215)},opacity:{value:1},map:{value:null},mapTransform:{value:new He},alphaMap:{value:null},alphaMapTransform:{value:new He},alphaTest:{value:0}},specularmap:{specularMap:{value:null},specularMapTransform:{value:new He}},envmap:{envMap:{value:null},envMapRotation:{value:new He},flipEnvMap:{value:-1},reflectivity:{value:1},ior:{value:1.5},refractionRatio:{value:.98},dfgLUT:{value:null}},aomap:{aoMap:{value:null},aoMapIntensity:{value:1},aoMapTransform:{value:new He}},lightmap:{lightMap:{value:null},lightMapIntensity:{value:1},lightMapTransform:{value:new He}},bumpmap:{bumpMap:{value:null},bumpMapTransform:{value:new He},bumpScale:{value:1}},normalmap:{normalMap:{value:null},normalMapTransform:{value:new He},normalScale:{value:new st(1,1)}},displacementmap:{displacementMap:{value:null},displacementMapTransform:{value:new He},displacementScale:{value:1},displacementBias:{value:0}},emissivemap:{emissiveMap:{value:null},emissiveMapTransform:{value:new He}},metalnessmap:{metalnessMap:{value:null},metalnessMapTransform:{value:new He}},roughnessmap:{roughnessMap:{value:null},roughnessMapTransform:{value:new He}},gradientmap:{gradientMap:{value:null}},fog:{fogDensity:{value:25e-5},fogNear:{value:1},fogFar:{value:2e3},fogColor:{value:new it(16777215)}},lights:{ambientLightColor:{value:[]},lightProbe:{value:[]},directionalLights:{value:[],properties:{direction:{},color:{}}},directionalLightShadows:{value:[],properties:{shadowIntensity:1,shadowBias:{},shadowNormalBias:{},shadowRadius:{},shadowMapSize:{}}},directionalShadowMap:{value:[]},directionalShadowMatrix:{value:[]},spotLights:{value:[],properties:{color:{},position:{},direction:{},distance:{},coneCos:{},penumbraCos:{},decay:{}}},spotLightShadows:{value:[],properties:{shadowIntensity:1,shadowBias:{},shadowNormalBias:{},shadowRadius:{},shadowMapSize:{}}},spotLightMap:{value:[]},spotShadowMap:{value:[]},spotLightMatrix:{value:[]},pointLights:{value:[],properties:{color:{},position:{},decay:{},distance:{}}},pointLightShadows:{value:[],properties:{shadowIntensity:1,shadowBias:{},shadowNormalBias:{},shadowRadius:{},shadowMapSize:{},shadowCameraNear:{},shadowCameraFar:{}}},pointShadowMap:{value:[]},pointShadowMatrix:{value:[]},hemisphereLights:{value:[],properties:{direction:{},skyColor:{},groundColor:{}}},rectAreaLights:{value:[],properties:{color:{},position:{},width:{},height:{}}},ltc_1:{value:null},ltc_2:{value:null}},points:{diffuse:{value:new it(16777215)},opacity:{value:1},size:{value:1},scale:{value:1},map:{value:null},alphaMap:{value:null},alphaMapTransform:{value:new He},alphaTest:{value:0},uvTransform:{value:new He}},sprite:{diffuse:{value:new it(16777215)},opacity:{value:1},center:{value:new st(.5,.5)},rotation:{value:0},map:{value:null},mapTransform:{value:new He},alphaMap:{value:null},alphaMapTransform:{value:new He},alphaTest:{value:0}}},si={basic:{uniforms:Zt([ge.common,ge.specularmap,ge.envmap,ge.aomap,ge.lightmap,ge.fog]),vertexShader:qe.meshbasic_vert,fragmentShader:qe.meshbasic_frag},lambert:{uniforms:Zt([ge.common,ge.specularmap,ge.envmap,ge.aomap,ge.lightmap,ge.emissivemap,ge.bumpmap,ge.normalmap,ge.displacementmap,ge.fog,ge.lights,{emissive:{value:new it(0)}}]),vertexShader:qe.meshlambert_vert,fragmentShader:qe.meshlambert_frag},phong:{uniforms:Zt([ge.common,ge.specularmap,ge.envmap,ge.aomap,ge.lightmap,ge.emissivemap,ge.bumpmap,ge.normalmap,ge.displacementmap,ge.fog,ge.lights,{emissive:{value:new it(0)},specular:{value:new it(1118481)},shininess:{value:30}}]),vertexShader:qe.meshphong_vert,fragmentShader:qe.meshphong_frag},standard:{uniforms:Zt([ge.common,ge.envmap,ge.aomap,ge.lightmap,ge.emissivemap,ge.bumpmap,ge.normalmap,ge.displacementmap,ge.roughnessmap,ge.metalnessmap,ge.fog,ge.lights,{emissive:{value:new it(0)},roughness:{value:1},metalness:{value:0},envMapIntensity:{value:1}}]),vertexShader:qe.meshphysical_vert,fragmentShader:qe.meshphysical_frag},toon:{uniforms:Zt([ge.common,ge.aomap,ge.lightmap,ge.emissivemap,ge.bumpmap,ge.normalmap,ge.displacementmap,ge.gradientmap,ge.fog,ge.lights,{emissive:{value:new it(0)}}]),vertexShader:qe.meshtoon_vert,fragmentShader:qe.meshtoon_frag},matcap:{uniforms:Zt([ge.common,ge.bumpmap,ge.normalmap,ge.displacementmap,ge.fog,{matcap:{value:null}}]),vertexShader:qe.meshmatcap_vert,fragmentShader:qe.meshmatcap_frag},points:{uniforms:Zt([ge.points,ge.fog]),vertexShader:qe.points_vert,fragmentShader:qe.points_frag},dashed:{uniforms:Zt([ge.common,ge.fog,{scale:{value:1},dashSize:{value:1},totalSize:{value:2}}]),vertexShader:qe.linedashed_vert,fragmentShader:qe.linedashed_frag},depth:{uniforms:Zt([ge.common,ge.displacementmap]),vertexShader:qe.depth_vert,fragmentShader:qe.depth_frag},normal:{uniforms:Zt([ge.common,ge.bumpmap,ge.normalmap,ge.displacementmap,{opacity:{value:1}}]),vertexShader:qe.meshnormal_vert,fragmentShader:qe.meshnormal_frag},sprite:{uniforms:Zt([ge.sprite,ge.fog]),vertexShader:qe.sprite_vert,fragmentShader:qe.sprite_frag},background:{uniforms:{uvTransform:{value:new He},t2D:{value:null},backgroundIntensity:{value:1}},vertexShader:qe.background_vert,fragmentShader:qe.background_frag},backgroundCube:{uniforms:{envMap:{value:null},flipEnvMap:{value:-1},backgroundBlurriness:{value:0},backgroundIntensity:{value:1},backgroundRotation:{value:new He}},vertexShader:qe.backgroundCube_vert,fragmentShader:qe.backgroundCube_frag},cube:{uniforms:{tCube:{value:null},tFlip:{value:-1},opacity:{value:1}},vertexShader:qe.cube_vert,fragmentShader:qe.cube_frag},equirect:{uniforms:{tEquirect:{value:null}},vertexShader:qe.equirect_vert,fragmentShader:qe.equirect_frag},distance:{uniforms:Zt([ge.common,ge.displacementmap,{referencePosition:{value:new W},nearDistance:{value:1},farDistance:{value:1e3}}]),vertexShader:qe.distance_vert,fragmentShader:qe.distance_frag},shadow:{uniforms:Zt([ge.lights,ge.fog,{color:{value:new it(0)},opacity:{value:1}}]),vertexShader:qe.shadow_vert,fragmentShader:qe.shadow_frag}};si.physical={uniforms:Zt([si.standard.uniforms,{clearcoat:{value:0},clearcoatMap:{value:null},clearcoatMapTransform:{value:new He},clearcoatNormalMap:{value:null},clearcoatNormalMapTransform:{value:new He},clearcoatNormalScale:{value:new st(1,1)},clearcoatRoughness:{value:0},clearcoatRoughnessMap:{value:null},clearcoatRoughnessMapTransform:{value:new He},dispersion:{value:0},iridescence:{value:0},iridescenceMap:{value:null},iridescenceMapTransform:{value:new He},iridescenceIOR:{value:1.3},iridescenceThicknessMinimum:{value:100},iridescenceThicknessMaximum:{value:400},iridescenceThicknessMap:{value:null},iridescenceThicknessMapTransform:{value:new He},sheen:{value:0},sheenColor:{value:new it(0)},sheenColorMap:{value:null},sheenColorMapTransform:{value:new He},sheenRoughness:{value:1},sheenRoughnessMap:{value:null},sheenRoughnessMapTransform:{value:new He},transmission:{value:0},transmissionMap:{value:null},transmissionMapTransform:{value:new He},transmissionSamplerSize:{value:new st},transmissionSamplerMap:{value:null},thickness:{value:0},thicknessMap:{value:null},thicknessMapTransform:{value:new He},attenuationDistance:{value:0},attenuationColor:{value:new it(0)},specularColor:{value:new it(1,1,1)},specularColorMap:{value:null},specularColorMapTransform:{value:new He},specularIntensity:{value:1},specularIntensityMap:{value:null},specularIntensityMapTransform:{value:new He},anisotropyVector:{value:new st},anisotropyMap:{value:null},anisotropyMapTransform:{value:new He}}]),vertexShader:qe.meshphysical_vert,fragmentShader:qe.meshphysical_frag};var Vl={r:0,b:0,g:0},Fr=new Qn,Nx=new At;function Fx(r,e,t,n,i,s,a){let o=new it(0),c=s===!0?0:1,l,u,h=null,d=0,f=null;function _(w){let S=w.isScene===!0?w.background:null;return S&&S.isTexture&&(S=(w.backgroundBlurriness>0?t:e).get(S)),S}function g(w){let S=!1,M=_(w);M===null?p(o,c):M&&M.isColor&&(p(M,1),S=!0);let A=r.xr.getEnvironmentBlendMode();A==="additive"?n.buffers.color.setClear(0,0,0,1,a):A==="alpha-blend"&&n.buffers.color.setClear(0,0,0,0,a),(r.autoClear||S)&&(n.buffers.depth.setTest(!0),n.buffers.depth.setMask(!0),n.buffers.color.setMask(!0),r.clear(r.autoClearColor,r.autoClearDepth,r.autoClearStencil))}function m(w,S){let M=_(S);M&&(M.isCubeTexture||M.mapping===va)?(u===void 0&&(u=new sn(new vs(1,1,1),new an({name:"BackgroundCubeMaterial",uniforms:Nr(si.backgroundCube.uniforms),vertexShader:si.backgroundCube.vertexShader,fragmentShader:si.backgroundCube.fragmentShader,side:on,depthTest:!1,depthWrite:!1,fog:!1,allowOverride:!1})),u.geometry.deleteAttribute("normal"),u.geometry.deleteAttribute("uv"),u.onBeforeRender=function(A,E,R){this.matrixWorld.copyPosition(R.matrixWorld)},Object.defineProperty(u.material,"envMap",{get:function(){return this.uniforms.envMap.value}}),i.update(u)),Fr.copy(S.backgroundRotation),Fr.x*=-1,Fr.y*=-1,Fr.z*=-1,M.isCubeTexture&&M.isRenderTargetTexture===!1&&(Fr.y*=-1,Fr.z*=-1),u.material.uniforms.envMap.value=M,u.material.uniforms.flipEnvMap.value=M.isCubeTexture&&M.isRenderTargetTexture===!1?-1:1,u.material.uniforms.backgroundBlurriness.value=S.backgroundBlurriness,u.material.uniforms.backgroundIntensity.value=S.backgroundIntensity,u.material.uniforms.backgroundRotation.value.setFromMatrix4(Nx.makeRotationFromEuler(Fr)),u.material.toneMapped=tt.getTransfer(M.colorSpace)!==ct,(h!==M||d!==M.version||f!==r.toneMapping)&&(u.material.needsUpdate=!0,h=M,d=M.version,f=r.toneMapping),u.layers.enableAll(),w.unshift(u,u.geometry,u.material,0,0,null)):M&&M.isTexture&&(l===void 0&&(l=new sn(new Ki(2,2),new an({name:"BackgroundMaterial",uniforms:Nr(si.background.uniforms),vertexShader:si.background.vertexShader,fragmentShader:si.background.fragmentShader,side:Mi,depthTest:!1,depthWrite:!1,fog:!1,allowOverride:!1})),l.geometry.deleteAttribute("normal"),Object.defineProperty(l.material,"map",{get:function(){return this.uniforms.t2D.value}}),i.update(l)),l.material.uniforms.t2D.value=M,l.material.uniforms.backgroundIntensity.value=S.backgroundIntensity,l.material.toneMapped=tt.getTransfer(M.colorSpace)!==ct,M.matrixAutoUpdate===!0&&M.updateMatrix(),l.material.uniforms.uvTransform.value.copy(M.matrix),(h!==M||d!==M.version||f!==r.toneMapping)&&(l.material.needsUpdate=!0,h=M,d=M.version,f=r.toneMapping),l.layers.enableAll(),w.unshift(l,l.geometry,l.material,0,0,null))}function p(w,S){w.getRGB(Vl,Yu(r)),n.buffers.color.setClear(Vl.r,Vl.g,Vl.b,S,a)}function y(){u!==void 0&&(u.geometry.dispose(),u.material.dispose(),u=void 0),l!==void 0&&(l.geometry.dispose(),l.material.dispose(),l=void 0)}return{getClearColor:function(){return o},setClearColor:function(w,S=1){o.set(w),c=S,p(o,c)},getClearAlpha:function(){return c},setClearAlpha:function(w){c=w,p(o,c)},render:g,addToRenderList:m,dispose:y}}function Ux(r,e){let t=r.getParameter(r.MAX_VERTEX_ATTRIBS),n={},i=d(null),s=i,a=!1;function o(T,I,B,N,k){let V=!1,O=h(N,B,I);s!==O&&(s=O,l(s.object)),V=f(T,N,B,k),V&&_(T,N,B,k),k!==null&&e.update(k,r.ELEMENT_ARRAY_BUFFER),(V||a)&&(a=!1,S(T,I,B,N),k!==null&&r.bindBuffer(r.ELEMENT_ARRAY_BUFFER,e.get(k).buffer))}function c(){return r.createVertexArray()}function l(T){return r.bindVertexArray(T)}function u(T){return r.deleteVertexArray(T)}function h(T,I,B){let N=B.wireframe===!0,k=n[T.id];k===void 0&&(k={},n[T.id]=k);let V=k[I.id];V===void 0&&(V={},k[I.id]=V);let O=V[N];return O===void 0&&(O=d(c()),V[N]=O),O}function d(T){let I=[],B=[],N=[];for(let k=0;k<t;k++)I[k]=0,B[k]=0,N[k]=0;return{geometry:null,program:null,wireframe:!1,newAttributes:I,enabledAttributes:B,attributeDivisors:N,object:T,attributes:{},index:null}}function f(T,I,B,N){let k=s.attributes,V=I.attributes,O=0,z=B.getAttributes();for(let $ in z)if(z[$].location>=0){let q=k[$],ie=V[$];if(ie===void 0&&($==="instanceMatrix"&&T.instanceMatrix&&(ie=T.instanceMatrix),$==="instanceColor"&&T.instanceColor&&(ie=T.instanceColor)),q===void 0||q.attribute!==ie||ie&&q.data!==ie.data)return!0;O++}return s.attributesNum!==O||s.index!==N}function _(T,I,B,N){let k={},V=I.attributes,O=0,z=B.getAttributes();for(let $ in z)if(z[$].location>=0){let q=V[$];q===void 0&&($==="instanceMatrix"&&T.instanceMatrix&&(q=T.instanceMatrix),$==="instanceColor"&&T.instanceColor&&(q=T.instanceColor));let ie={};ie.attribute=q,q&&q.data&&(ie.data=q.data),k[$]=ie,O++}s.attributes=k,s.attributesNum=O,s.index=N}function g(){let T=s.newAttributes;for(let I=0,B=T.length;I<B;I++)T[I]=0}function m(T){p(T,0)}function p(T,I){let B=s.newAttributes,N=s.enabledAttributes,k=s.attributeDivisors;B[T]=1,N[T]===0&&(r.enableVertexAttribArray(T),N[T]=1),k[T]!==I&&(r.vertexAttribDivisor(T,I),k[T]=I)}function y(){let T=s.newAttributes,I=s.enabledAttributes;for(let B=0,N=I.length;B<N;B++)I[B]!==T[B]&&(r.disableVertexAttribArray(B),I[B]=0)}function w(T,I,B,N,k,V,O){O===!0?r.vertexAttribIPointer(T,I,B,k,V):r.vertexAttribPointer(T,I,B,N,k,V)}function S(T,I,B,N){g();let k=N.attributes,V=B.getAttributes(),O=I.defaultAttributeValues;for(let z in V){let $=V[z];if($.location>=0){let ce=k[z];if(ce===void 0&&(z==="instanceMatrix"&&T.instanceMatrix&&(ce=T.instanceMatrix),z==="instanceColor"&&T.instanceColor&&(ce=T.instanceColor)),ce!==void 0){let q=ce.normalized,ie=ce.itemSize,Re=e.get(ce);if(Re===void 0)continue;let Ue=Re.buffer,ke=Re.type,Oe=Re.bytesPerElement,Y=ke===r.INT||ke===r.UNSIGNED_INT||ce.gpuType===tl;if(ce.isInterleavedBufferAttribute){let ee=ce.data,_e=ee.stride,ye=ce.offset;if(ee.isInstancedInterleavedBuffer){for(let Me=0;Me<$.locationSize;Me++)p($.location+Me,ee.meshPerAttribute);T.isInstancedMesh!==!0&&N._maxInstanceCount===void 0&&(N._maxInstanceCount=ee.meshPerAttribute*ee.count)}else for(let Me=0;Me<$.locationSize;Me++)m($.location+Me);r.bindBuffer(r.ARRAY_BUFFER,Ue);for(let Me=0;Me<$.locationSize;Me++)w($.location+Me,ie/$.locationSize,ke,q,_e*Oe,(ye+ie/$.locationSize*Me)*Oe,Y)}else{if(ce.isInstancedBufferAttribute){for(let ee=0;ee<$.locationSize;ee++)p($.location+ee,ce.meshPerAttribute);T.isInstancedMesh!==!0&&N._maxInstanceCount===void 0&&(N._maxInstanceCount=ce.meshPerAttribute*ce.count)}else for(let ee=0;ee<$.locationSize;ee++)m($.location+ee);r.bindBuffer(r.ARRAY_BUFFER,Ue);for(let ee=0;ee<$.locationSize;ee++)w($.location+ee,ie/$.locationSize,ke,q,ie*Oe,ie/$.locationSize*ee*Oe,Y)}}else if(O!==void 0){let q=O[z];if(q!==void 0)switch(q.length){case 2:r.vertexAttrib2fv($.location,q);break;case 3:r.vertexAttrib3fv($.location,q);break;case 4:r.vertexAttrib4fv($.location,q);break;default:r.vertexAttrib1fv($.location,q)}}}}y()}function M(){R();for(let T in n){let I=n[T];for(let B in I){let N=I[B];for(let k in N)u(N[k].object),delete N[k];delete I[B]}delete n[T]}}function A(T){if(n[T.id]===void 0)return;let I=n[T.id];for(let B in I){let N=I[B];for(let k in N)u(N[k].object),delete N[k];delete I[B]}delete n[T.id]}function E(T){for(let I in n){let B=n[I];if(B[T.id]===void 0)continue;let N=B[T.id];for(let k in N)u(N[k].object),delete N[k];delete B[T.id]}}function R(){x(),a=!0,s!==i&&(s=i,l(s.object))}function x(){i.geometry=null,i.program=null,i.wireframe=!1}return{setup:o,reset:R,resetDefaultState:x,dispose:M,releaseStatesOfGeometry:A,releaseStatesOfProgram:E,initAttributes:g,enableAttribute:m,disableUnusedAttributes:y}}function Ox(r,e,t){let n;function i(l){n=l}function s(l,u){r.drawArrays(n,l,u),t.update(u,n,1)}function a(l,u,h){h!==0&&(r.drawArraysInstanced(n,l,u,h),t.update(u,n,h))}function o(l,u,h){if(h===0)return;e.get("WEBGL_multi_draw").multiDrawArraysWEBGL(n,l,0,u,0,h);let f=0;for(let _=0;_<h;_++)f+=u[_];t.update(f,n,1)}function c(l,u,h,d){if(h===0)return;let f=e.get("WEBGL_multi_draw");if(f===null)for(let _=0;_<l.length;_++)a(l[_],u[_],d[_]);else{f.multiDrawArraysInstancedWEBGL(n,l,0,u,0,d,0,h);let _=0;for(let g=0;g<h;g++)_+=u[g]*d[g];t.update(_,n,1)}}this.setMode=i,this.render=s,this.renderInstances=a,this.renderMultiDraw=o,this.renderMultiDrawInstances=c}function Bx(r,e,t,n){let i;function s(){if(i!==void 0)return i;if(e.has("EXT_texture_filter_anisotropic")===!0){let E=e.get("EXT_texture_filter_anisotropic");i=r.getParameter(E.MAX_TEXTURE_MAX_ANISOTROPY_EXT)}else i=0;return i}function a(E){return!(E!==Ln&&n.convert(E)!==r.getParameter(r.IMPLEMENTATION_COLOR_READ_FORMAT))}function o(E){let R=E===ii&&(e.has("EXT_color_buffer_half_float")||e.has("EXT_color_buffer_float"));return!(E!==Tn&&n.convert(E)!==r.getParameter(r.IMPLEMENTATION_COLOR_READ_TYPE)&&E!==Gn&&!R)}function c(E){if(E==="highp"){if(r.getShaderPrecisionFormat(r.VERTEX_SHADER,r.HIGH_FLOAT).precision>0&&r.getShaderPrecisionFormat(r.FRAGMENT_SHADER,r.HIGH_FLOAT).precision>0)return"highp";E="mediump"}return E==="mediump"&&r.getShaderPrecisionFormat(r.VERTEX_SHADER,r.MEDIUM_FLOAT).precision>0&&r.getShaderPrecisionFormat(r.FRAGMENT_SHADER,r.MEDIUM_FLOAT).precision>0?"mediump":"lowp"}let l=t.precision!==void 0?t.precision:"highp",u=c(l);u!==l&&(Ve("WebGLRenderer:",l,"not supported, using",u,"instead."),l=u);let h=t.logarithmicDepthBuffer===!0,d=t.reversedDepthBuffer===!0&&e.has("EXT_clip_control"),f=r.getParameter(r.MAX_TEXTURE_IMAGE_UNITS),_=r.getParameter(r.MAX_VERTEX_TEXTURE_IMAGE_UNITS),g=r.getParameter(r.MAX_TEXTURE_SIZE),m=r.getParameter(r.MAX_CUBE_MAP_TEXTURE_SIZE),p=r.getParameter(r.MAX_VERTEX_ATTRIBS),y=r.getParameter(r.MAX_VERTEX_UNIFORM_VECTORS),w=r.getParameter(r.MAX_VARYING_VECTORS),S=r.getParameter(r.MAX_FRAGMENT_UNIFORM_VECTORS),M=r.getParameter(r.MAX_SAMPLES),A=r.getParameter(r.SAMPLES);return{isWebGL2:!0,getMaxAnisotropy:s,getMaxPrecision:c,textureFormatReadable:a,textureTypeReadable:o,precision:l,logarithmicDepthBuffer:h,reversedDepthBuffer:d,maxTextures:f,maxVertexTextures:_,maxTextureSize:g,maxCubemapSize:m,maxAttributes:p,maxVertexUniforms:y,maxVaryings:w,maxFragmentUniforms:S,maxSamples:M,samples:A}}function kx(r){let e=this,t=null,n=0,i=!1,s=!1,a=new Jn,o=new He,c={value:null,needsUpdate:!1};this.uniform=c,this.numPlanes=0,this.numIntersection=0,this.init=function(h,d){let f=h.length!==0||d||n!==0||i;return i=d,n=h.length,f},this.beginShadows=function(){s=!0,u(null)},this.endShadows=function(){s=!1},this.setGlobalState=function(h,d){t=u(h,d,0)},this.setState=function(h,d,f){let _=h.clippingPlanes,g=h.clipIntersection,m=h.clipShadows,p=r.get(h);if(!i||_===null||_.length===0||s&&!m)s?u(null):l();else{let y=s?0:n,w=y*4,S=p.clippingState||null;c.value=S,S=u(_,d,w,f);for(let M=0;M!==w;++M)S[M]=t[M];p.clippingState=S,this.numIntersection=g?this.numPlanes:0,this.numPlanes+=y}};function l(){c.value!==t&&(c.value=t,c.needsUpdate=n>0),e.numPlanes=n,e.numIntersection=0}function u(h,d,f,_){let g=h!==null?h.length:0,m=null;if(g!==0){if(m=c.value,_!==!0||m===null){let p=f+g*4,y=d.matrixWorldInverse;o.getNormalMatrix(y),(m===null||m.length<p)&&(m=new Float32Array(p));for(let w=0,S=f;w!==g;++w,S+=4)a.copy(h[w]).applyMatrix4(y,o),a.normal.toArray(m,S),m[S+3]=a.constant}c.value=m,c.needsUpdate=!0}return e.numPlanes=g,e.numIntersection=0,m}}function zx(r){let e=new WeakMap;function t(a,o){return o===Qo?a.mapping=tr:o===jo&&(a.mapping=Dr),a}function n(a){if(a&&a.isTexture){let o=a.mapping;if(o===Qo||o===jo)if(e.has(a)){let c=e.get(a).texture;return t(c,a.mapping)}else{let c=a.image;if(c&&c.height>0){let l=new fa(c.height);return l.fromEquirectangularTexture(r,a),e.set(a,l),a.addEventListener("dispose",i),t(l.texture,a.mapping)}else return null}}return a}function i(a){let o=a.target;o.removeEventListener("dispose",i);let c=e.get(o);c!==void 0&&(e.delete(o),c.dispose())}function s(){e=new WeakMap}return{get:n,dispose:s}}var ir=4,Pf=[.125,.215,.35,.446,.526,.582],Or=20,Vx=256,Aa=new er,If=new it,Ku=null,Qu=0,ju=0,eh=!1,Gx=new W,Hl=class{constructor(e){this._renderer=e,this._pingPongRenderTarget=null,this._lodMax=0,this._cubeSize=0,this._sizeLods=[],this._sigmas=[],this._lodMeshes=[],this._backgroundBox=null,this._cubemapMaterial=null,this._equirectMaterial=null,this._blurMaterial=null,this._ggxMaterial=null}fromScene(e,t=0,n=.1,i=100,s={}){let{size:a=256,position:o=Gx}=s;Ku=this._renderer.getRenderTarget(),Qu=this._renderer.getActiveCubeFace(),ju=this._renderer.getActiveMipmapLevel(),eh=this._renderer.xr.enabled,this._renderer.xr.enabled=!1,this._setSize(a);let c=this._allocateTargets();return c.depthBuffer=!0,this._sceneToCubeUV(e,n,i,c,o),t>0&&this._blur(c,0,0,t),this._applyPMREM(c),this._cleanup(c),c}fromEquirectangular(e,t=null){return this._fromTexture(e,t)}fromCubemap(e,t=null){return this._fromTexture(e,t)}compileCubemapShader(){this._cubemapMaterial===null&&(this._cubemapMaterial=Nf(),this._compileMaterial(this._cubemapMaterial))}compileEquirectangularShader(){this._equirectMaterial===null&&(this._equirectMaterial=Lf(),this._compileMaterial(this._equirectMaterial))}dispose(){this._dispose(),this._cubemapMaterial!==null&&this._cubemapMaterial.dispose(),this._equirectMaterial!==null&&this._equirectMaterial.dispose(),this._backgroundBox!==null&&(this._backgroundBox.geometry.dispose(),this._backgroundBox.material.dispose())}_setSize(e){this._lodMax=Math.floor(Math.log2(e)),this._cubeSize=Math.pow(2,this._lodMax)}_dispose(){this._blurMaterial!==null&&this._blurMaterial.dispose(),this._ggxMaterial!==null&&this._ggxMaterial.dispose(),this._pingPongRenderTarget!==null&&this._pingPongRenderTarget.dispose();for(let e=0;e<this._lodMeshes.length;e++)this._lodMeshes[e].geometry.dispose()}_cleanup(e){this._renderer.setRenderTarget(Ku,Qu,ju),this._renderer.xr.enabled=eh,e.scissorTest=!1,As(e,0,0,e.width,e.height)}_fromTexture(e,t){e.mapping===tr||e.mapping===Dr?this._setSize(e.image.length===0?16:e.image[0].width||e.image[0].image.width):this._setSize(e.image.width/4),Ku=this._renderer.getRenderTarget(),Qu=this._renderer.getActiveCubeFace(),ju=this._renderer.getActiveMipmapLevel(),eh=this._renderer.xr.enabled,this._renderer.xr.enabled=!1;let n=t||this._allocateTargets();return this._textureToCubeUV(e,n),this._applyPMREM(n),this._cleanup(n),n}_allocateTargets(){let e=3*Math.max(this._cubeSize,112),t=4*this._cubeSize,n={magFilter:Rt,minFilter:Rt,generateMipmaps:!1,type:ii,format:Ln,colorSpace:Cr,depthBuffer:!1},i=Df(e,t,n);if(this._pingPongRenderTarget===null||this._pingPongRenderTarget.width!==e||this._pingPongRenderTarget.height!==t){this._pingPongRenderTarget!==null&&this._dispose(),this._pingPongRenderTarget=Df(e,t,n);let{_lodMax:s}=this;({lodMeshes:this._lodMeshes,sizeLods:this._sizeLods,sigmas:this._sigmas}=Hx(s)),this._blurMaterial=Xx(s,e,t),this._ggxMaterial=Wx(s,e,t)}return i}_compileMaterial(e){let t=new sn(new jn,e);this._renderer.compile(t,Aa)}_sceneToCubeUV(e,t,n,i,s){let c=new pn(90,1,t,n),l=[1,-1,1,1,1,1],u=[1,1,1,-1,-1,-1],h=this._renderer,d=h.autoClear,f=h.toneMapping;h.getClearColor(If),h.toneMapping=zn,h.autoClear=!1,h.state.buffers.depth.getReversed()&&(h.setRenderTarget(i),h.clearDepth(),h.setRenderTarget(null)),this._backgroundBox===null&&(this._backgroundBox=new sn(new vs,new Pr({name:"PMREM.Background",side:on,depthWrite:!1,depthTest:!1})));let g=this._backgroundBox,m=g.material,p=!1,y=e.background;y?y.isColor&&(m.color.copy(y),e.background=null,p=!0):(m.color.copy(If),p=!0);for(let w=0;w<6;w++){let S=w%3;S===0?(c.up.set(0,l[w],0),c.position.set(s.x,s.y,s.z),c.lookAt(s.x+u[w],s.y,s.z)):S===1?(c.up.set(0,0,l[w]),c.position.set(s.x,s.y,s.z),c.lookAt(s.x,s.y+u[w],s.z)):(c.up.set(0,l[w],0),c.position.set(s.x,s.y,s.z),c.lookAt(s.x,s.y,s.z+u[w]));let M=this._cubeSize;As(i,S*M,w>2?M:0,M,M),h.setRenderTarget(i),p&&h.render(g,c),h.render(e,c)}h.toneMapping=f,h.autoClear=d,e.background=y}_textureToCubeUV(e,t){let n=this._renderer,i=e.mapping===tr||e.mapping===Dr;i?(this._cubemapMaterial===null&&(this._cubemapMaterial=Nf()),this._cubemapMaterial.uniforms.flipEnvMap.value=e.isRenderTargetTexture===!1?-1:1):this._equirectMaterial===null&&(this._equirectMaterial=Lf());let s=i?this._cubemapMaterial:this._equirectMaterial,a=this._lodMeshes[0];a.material=s;let o=s.uniforms;o.envMap.value=e;let c=this._cubeSize;As(t,0,0,3*c,2*c),n.setRenderTarget(t),n.render(a,Aa)}_applyPMREM(e){let t=this._renderer,n=t.autoClear;t.autoClear=!1;let i=this._lodMeshes.length;for(let s=1;s<i;s++)this._applyGGXFilter(e,s-1,s);t.autoClear=n}_applyGGXFilter(e,t,n){let i=this._renderer,s=this._pingPongRenderTarget,a=this._ggxMaterial,o=this._lodMeshes[n];o.material=a;let c=a.uniforms,l=n/(this._lodMeshes.length-1),u=t/(this._lodMeshes.length-1),h=Math.sqrt(l*l-u*u),d=0+l*1.25,f=h*d,{_lodMax:_}=this,g=this._sizeLods[n],m=3*g*(n>_-ir?n-_+ir:0),p=4*(this._cubeSize-g);c.envMap.value=e.texture,c.roughness.value=f,c.mipInt.value=_-t,As(s,m,p,3*g,2*g),i.setRenderTarget(s),i.render(o,Aa),c.envMap.value=s.texture,c.roughness.value=0,c.mipInt.value=_-n,As(e,m,p,3*g,2*g),i.setRenderTarget(e),i.render(o,Aa)}_blur(e,t,n,i,s){let a=this._pingPongRenderTarget;this._halfBlur(e,a,t,n,i,"latitudinal",s),this._halfBlur(a,e,n,n,i,"longitudinal",s)}_halfBlur(e,t,n,i,s,a,o){let c=this._renderer,l=this._blurMaterial;a!=="latitudinal"&&a!=="longitudinal"&&Be("blur direction must be either latitudinal or longitudinal!");let u=3,h=this._lodMeshes[i];h.material=l;let d=l.uniforms,f=this._sizeLods[n]-1,_=isFinite(s)?Math.PI/(2*f):2*Math.PI/(2*Or-1),g=s/_,m=isFinite(s)?1+Math.floor(u*g):Or;m>Or&&Ve(`sigmaRadians, ${s}, is too large and will clip, as it requested ${m} samples when the maximum is set to ${Or}`);let p=[],y=0;for(let E=0;E<Or;++E){let R=E/g,x=Math.exp(-R*R/2);p.push(x),E===0?y+=x:E<m&&(y+=2*x)}for(let E=0;E<p.length;E++)p[E]=p[E]/y;d.envMap.value=e.texture,d.samples.value=m,d.weights.value=p,d.latitudinal.value=a==="latitudinal",o&&(d.poleAxis.value=o);let{_lodMax:w}=this;d.dTheta.value=_,d.mipInt.value=w-n;let S=this._sizeLods[i],M=3*S*(i>w-ir?i-w+ir:0),A=4*(this._cubeSize-S);As(t,M,A,3*S,2*S),c.setRenderTarget(t),c.render(h,Aa)}};function Hx(r){let e=[],t=[],n=[],i=r,s=r-ir+1+Pf.length;for(let a=0;a<s;a++){let o=Math.pow(2,i);e.push(o);let c=1/o;a>r-ir?c=Pf[a-r+ir-1]:a===0&&(c=0),t.push(c);let l=1/(o-2),u=-l,h=1+l,d=[u,u,h,u,h,h,u,u,h,h,u,h],f=6,_=6,g=3,m=2,p=1,y=new Float32Array(g*_*f),w=new Float32Array(m*_*f),S=new Float32Array(p*_*f);for(let A=0;A<f;A++){let E=A%3*2/3-1,R=A>2?0:-1,x=[E,R,0,E+2/3,R,0,E+2/3,R+1,0,E,R,0,E+2/3,R+1,0,E,R+1,0];y.set(x,g*_*A),w.set(d,m*_*A);let T=[A,A,A,A,A,A];S.set(T,p*_*A)}let M=new jn;M.setAttribute("position",new Sn(y,g)),M.setAttribute("uv",new Sn(w,m)),M.setAttribute("faceIndex",new Sn(S,p)),n.push(new sn(M,null)),i>ir&&i--}return{lodMeshes:n,sizeLods:e,sigmas:t}}function Df(r,e,t){let n=new rn(r,e,t);return n.texture.mapping=va,n.texture.name="PMREM.cubeUv",n.scissorTest=!0,n}function As(r,e,t,n,i){r.viewport.set(e,t,n,i),r.scissor.set(e,t,n,i)}function Wx(r,e,t){return new an({name:"PMREMGGXConvolution",defines:{GGX_SAMPLES:Vx,CUBEUV_TEXEL_WIDTH:1/e,CUBEUV_TEXEL_HEIGHT:1/t,CUBEUV_MAX_MIP:`${r}.0`},uniforms:{envMap:{value:null},roughness:{value:0},mipInt:{value:0}},vertexShader:Xl(),fragmentShader:`

			precision highp float;
			precision highp int;

			varying vec3 vOutputDirection;

			uniform sampler2D envMap;
			uniform float roughness;
			uniform float mipInt;

			#define ENVMAP_TYPE_CUBE_UV
			#include <cube_uv_reflection_fragment>

			#define PI 3.14159265359

			// Van der Corput radical inverse
			float radicalInverse_VdC(uint bits) {
				bits = (bits << 16u) | (bits >> 16u);
				bits = ((bits & 0x55555555u) << 1u) | ((bits & 0xAAAAAAAAu) >> 1u);
				bits = ((bits & 0x33333333u) << 2u) | ((bits & 0xCCCCCCCCu) >> 2u);
				bits = ((bits & 0x0F0F0F0Fu) << 4u) | ((bits & 0xF0F0F0F0u) >> 4u);
				bits = ((bits & 0x00FF00FFu) << 8u) | ((bits & 0xFF00FF00u) >> 8u);
				return float(bits) * 2.3283064365386963e-10; // / 0x100000000
			}

			// Hammersley sequence
			vec2 hammersley(uint i, uint N) {
				return vec2(float(i) / float(N), radicalInverse_VdC(i));
			}

			// GGX VNDF importance sampling (Eric Heitz 2018)
			// "Sampling the GGX Distribution of Visible Normals"
			// https://jcgt.org/published/0007/04/01/
			vec3 importanceSampleGGX_VNDF(vec2 Xi, vec3 V, float roughness) {
				float alpha = roughness * roughness;

				// Section 3.2: Transform view direction to hemisphere configuration
				vec3 Vh = normalize(vec3(alpha * V.x, alpha * V.y, V.z));

				// Section 4.1: Orthonormal basis
				float lensq = Vh.x * Vh.x + Vh.y * Vh.y;
				vec3 T1 = lensq > 0.0 ? vec3(-Vh.y, Vh.x, 0.0) / sqrt(lensq) : vec3(1.0, 0.0, 0.0);
				vec3 T2 = cross(Vh, T1);

				// Section 4.2: Parameterization of projected area
				float r = sqrt(Xi.x);
				float phi = 2.0 * PI * Xi.y;
				float t1 = r * cos(phi);
				float t2 = r * sin(phi);
				float s = 0.5 * (1.0 + Vh.z);
				t2 = (1.0 - s) * sqrt(1.0 - t1 * t1) + s * t2;

				// Section 4.3: Reprojection onto hemisphere
				vec3 Nh = t1 * T1 + t2 * T2 + sqrt(max(0.0, 1.0 - t1 * t1 - t2 * t2)) * Vh;

				// Section 3.4: Transform back to ellipsoid configuration
				return normalize(vec3(alpha * Nh.x, alpha * Nh.y, max(0.0, Nh.z)));
			}

			void main() {
				vec3 N = normalize(vOutputDirection);
				vec3 V = N; // Assume view direction equals normal for pre-filtering

				vec3 prefilteredColor = vec3(0.0);
				float totalWeight = 0.0;

				// For very low roughness, just sample the environment directly
				if (roughness < 0.001) {
					gl_FragColor = vec4(bilinearCubeUV(envMap, N, mipInt), 1.0);
					return;
				}

				// Tangent space basis for VNDF sampling
				vec3 up = abs(N.z) < 0.999 ? vec3(0.0, 0.0, 1.0) : vec3(1.0, 0.0, 0.0);
				vec3 tangent = normalize(cross(up, N));
				vec3 bitangent = cross(N, tangent);

				for(uint i = 0u; i < uint(GGX_SAMPLES); i++) {
					vec2 Xi = hammersley(i, uint(GGX_SAMPLES));

					// For PMREM, V = N, so in tangent space V is always (0, 0, 1)
					vec3 H_tangent = importanceSampleGGX_VNDF(Xi, vec3(0.0, 0.0, 1.0), roughness);

					// Transform H back to world space
					vec3 H = normalize(tangent * H_tangent.x + bitangent * H_tangent.y + N * H_tangent.z);
					vec3 L = normalize(2.0 * dot(V, H) * H - V);

					float NdotL = max(dot(N, L), 0.0);

					if(NdotL > 0.0) {
						// Sample environment at fixed mip level
						// VNDF importance sampling handles the distribution filtering
						vec3 sampleColor = bilinearCubeUV(envMap, L, mipInt);

						// Weight by NdotL for the split-sum approximation
						// VNDF PDF naturally accounts for the visible microfacet distribution
						prefilteredColor += sampleColor * NdotL;
						totalWeight += NdotL;
					}
				}

				if (totalWeight > 0.0) {
					prefilteredColor = prefilteredColor / totalWeight;
				}

				gl_FragColor = vec4(prefilteredColor, 1.0);
			}
		`,blending:ti,depthTest:!1,depthWrite:!1})}function Xx(r,e,t){let n=new Float32Array(Or),i=new W(0,1,0);return new an({name:"SphericalGaussianBlur",defines:{n:Or,CUBEUV_TEXEL_WIDTH:1/e,CUBEUV_TEXEL_HEIGHT:1/t,CUBEUV_MAX_MIP:`${r}.0`},uniforms:{envMap:{value:null},samples:{value:1},weights:{value:n},latitudinal:{value:!1},dTheta:{value:0},mipInt:{value:0},poleAxis:{value:i}},vertexShader:Xl(),fragmentShader:`

			precision mediump float;
			precision mediump int;

			varying vec3 vOutputDirection;

			uniform sampler2D envMap;
			uniform int samples;
			uniform float weights[ n ];
			uniform bool latitudinal;
			uniform float dTheta;
			uniform float mipInt;
			uniform vec3 poleAxis;

			#define ENVMAP_TYPE_CUBE_UV
			#include <cube_uv_reflection_fragment>

			vec3 getSample( float theta, vec3 axis ) {

				float cosTheta = cos( theta );
				// Rodrigues' axis-angle rotation
				vec3 sampleDirection = vOutputDirection * cosTheta
					+ cross( axis, vOutputDirection ) * sin( theta )
					+ axis * dot( axis, vOutputDirection ) * ( 1.0 - cosTheta );

				return bilinearCubeUV( envMap, sampleDirection, mipInt );

			}

			void main() {

				vec3 axis = latitudinal ? poleAxis : cross( poleAxis, vOutputDirection );

				if ( all( equal( axis, vec3( 0.0 ) ) ) ) {

					axis = vec3( vOutputDirection.z, 0.0, - vOutputDirection.x );

				}

				axis = normalize( axis );

				gl_FragColor = vec4( 0.0, 0.0, 0.0, 1.0 );
				gl_FragColor.rgb += weights[ 0 ] * getSample( 0.0, axis );

				for ( int i = 1; i < n; i++ ) {

					if ( i >= samples ) {

						break;

					}

					float theta = dTheta * float( i );
					gl_FragColor.rgb += weights[ i ] * getSample( -1.0 * theta, axis );
					gl_FragColor.rgb += weights[ i ] * getSample( theta, axis );

				}

			}
		`,blending:ti,depthTest:!1,depthWrite:!1})}function Lf(){return new an({name:"EquirectangularToCubeUV",uniforms:{envMap:{value:null}},vertexShader:Xl(),fragmentShader:`

			precision mediump float;
			precision mediump int;

			varying vec3 vOutputDirection;

			uniform sampler2D envMap;

			#include <common>

			void main() {

				vec3 outputDirection = normalize( vOutputDirection );
				vec2 uv = equirectUv( outputDirection );

				gl_FragColor = vec4( texture2D ( envMap, uv ).rgb, 1.0 );

			}
		`,blending:ti,depthTest:!1,depthWrite:!1})}function Nf(){return new an({name:"CubemapToCubeUV",uniforms:{envMap:{value:null},flipEnvMap:{value:-1}},vertexShader:Xl(),fragmentShader:`

			precision mediump float;
			precision mediump int;

			uniform float flipEnvMap;

			varying vec3 vOutputDirection;

			uniform samplerCube envMap;

			void main() {

				gl_FragColor = textureCube( envMap, vec3( flipEnvMap * vOutputDirection.x, vOutputDirection.yz ) );

			}
		`,blending:ti,depthTest:!1,depthWrite:!1})}function Xl(){return`

		precision mediump float;
		precision mediump int;

		attribute float faceIndex;

		varying vec3 vOutputDirection;

		// RH coordinate system; PMREM face-indexing convention
		vec3 getDirection( vec2 uv, float face ) {

			uv = 2.0 * uv - 1.0;

			vec3 direction = vec3( uv, 1.0 );

			if ( face == 0.0 ) {

				direction = direction.zyx; // ( 1, v, u ) pos x

			} else if ( face == 1.0 ) {

				direction = direction.xzy;
				direction.xz *= -1.0; // ( -u, 1, -v ) pos y

			} else if ( face == 2.0 ) {

				direction.x *= -1.0; // ( -u, v, 1 ) pos z

			} else if ( face == 3.0 ) {

				direction = direction.zyx;
				direction.xz *= -1.0; // ( -1, v, -u ) neg x

			} else if ( face == 4.0 ) {

				direction = direction.xzy;
				direction.xy *= -1.0; // ( -u, -1, v ) neg y

			} else if ( face == 5.0 ) {

				direction.z *= -1.0; // ( u, v, -1 ) neg z

			}

			return direction;

		}

		void main() {

			vOutputDirection = getDirection( uv, faceIndex );
			gl_Position = vec4( position, 1.0 );

		}
	`}function qx(r){let e=new WeakMap,t=null;function n(o){if(o&&o.isTexture){let c=o.mapping,l=c===Qo||c===jo,u=c===tr||c===Dr;if(l||u){let h=e.get(o),d=h!==void 0?h.texture.pmremVersion:0;if(o.isRenderTargetTexture&&o.pmremVersion!==d)return t===null&&(t=new Hl(r)),h=l?t.fromEquirectangular(o,h):t.fromCubemap(o,h),h.texture.pmremVersion=o.pmremVersion,e.set(o,h),h.texture;if(h!==void 0)return h.texture;{let f=o.image;return l&&f&&f.height>0||u&&f&&i(f)?(t===null&&(t=new Hl(r)),h=l?t.fromEquirectangular(o):t.fromCubemap(o),h.texture.pmremVersion=o.pmremVersion,e.set(o,h),o.addEventListener("dispose",s),h.texture):null}}}return o}function i(o){let c=0,l=6;for(let u=0;u<l;u++)o[u]!==void 0&&c++;return c===l}function s(o){let c=o.target;c.removeEventListener("dispose",s);let l=e.get(c);l!==void 0&&(e.delete(c),l.dispose())}function a(){e=new WeakMap,t!==null&&(t.dispose(),t=null)}return{get:n,dispose:a}}function Yx(r){let e={};function t(n){if(e[n]!==void 0)return e[n];let i=r.getExtension(n);return e[n]=i,i}return{has:function(n){return t(n)!==null},init:function(){t("EXT_color_buffer_float"),t("WEBGL_clip_cull_distance"),t("OES_texture_float_linear"),t("EXT_color_buffer_half_float"),t("WEBGL_multisampled_render_to_texture"),t("WEBGL_render_shared_exponent")},get:function(n){let i=t(n);return i===null&&gs("WebGLRenderer: "+n+" extension not supported."),i}}}function Zx(r,e,t,n){let i={},s=new WeakMap;function a(h){let d=h.target;d.index!==null&&e.remove(d.index);for(let _ in d.attributes)e.remove(d.attributes[_]);d.removeEventListener("dispose",a),delete i[d.id];let f=s.get(d);f&&(e.remove(f),s.delete(d)),n.releaseStatesOfGeometry(d),d.isInstancedBufferGeometry===!0&&delete d._maxInstanceCount,t.memory.geometries--}function o(h,d){return i[d.id]===!0||(d.addEventListener("dispose",a),i[d.id]=!0,t.memory.geometries++),d}function c(h){let d=h.attributes;for(let f in d)e.update(d[f],r.ARRAY_BUFFER)}function l(h){let d=[],f=h.index,_=h.attributes.position,g=0;if(f!==null){let y=f.array;g=f.version;for(let w=0,S=y.length;w<S;w+=3){let M=y[w+0],A=y[w+1],E=y[w+2];d.push(M,A,A,E,E,M)}}else if(_!==void 0){let y=_.array;g=_.version;for(let w=0,S=y.length/3-1;w<S;w+=3){let M=w+0,A=w+1,E=w+2;d.push(M,A,A,E,E,M)}}else return;let m=new(Xu(d)?ua:ca)(d,1);m.version=g;let p=s.get(h);p&&e.remove(p),s.set(h,m)}function u(h){let d=s.get(h);if(d){let f=h.index;f!==null&&d.version<f.version&&l(h)}else l(h);return s.get(h)}return{get:o,update:c,getWireframeAttribute:u}}function Jx(r,e,t){let n;function i(d){n=d}let s,a;function o(d){s=d.type,a=d.bytesPerElement}function c(d,f){r.drawElements(n,f,s,d*a),t.update(f,n,1)}function l(d,f,_){_!==0&&(r.drawElementsInstanced(n,f,s,d*a,_),t.update(f,n,_))}function u(d,f,_){if(_===0)return;e.get("WEBGL_multi_draw").multiDrawElementsWEBGL(n,f,0,s,d,0,_);let m=0;for(let p=0;p<_;p++)m+=f[p];t.update(m,n,1)}function h(d,f,_,g){if(_===0)return;let m=e.get("WEBGL_multi_draw");if(m===null)for(let p=0;p<d.length;p++)l(d[p]/a,f[p],g[p]);else{m.multiDrawElementsInstancedWEBGL(n,f,0,s,d,0,g,0,_);let p=0;for(let y=0;y<_;y++)p+=f[y]*g[y];t.update(p,n,1)}}this.setMode=i,this.setIndex=o,this.render=c,this.renderInstances=l,this.renderMultiDraw=u,this.renderMultiDrawInstances=h}function $x(r){let e={geometries:0,textures:0},t={frame:0,calls:0,triangles:0,points:0,lines:0};function n(s,a,o){switch(t.calls++,a){case r.TRIANGLES:t.triangles+=o*(s/3);break;case r.LINES:t.lines+=o*(s/2);break;case r.LINE_STRIP:t.lines+=o*(s-1);break;case r.LINE_LOOP:t.lines+=o*s;break;case r.POINTS:t.points+=o*s;break;default:Be("WebGLInfo: Unknown draw mode:",a);break}}function i(){t.calls=0,t.triangles=0,t.points=0,t.lines=0}return{memory:e,render:t,programs:null,autoReset:!0,reset:i,update:n}}function Kx(r,e,t){let n=new WeakMap,i=new St;function s(a,o,c){let l=a.morphTargetInfluences,u=o.morphAttributes.position||o.morphAttributes.normal||o.morphAttributes.color,h=u!==void 0?u.length:0,d=n.get(o);if(d===void 0||d.count!==h){let x=function(){E.dispose(),n.delete(o),o.removeEventListener("dispose",x)};d!==void 0&&d.texture.dispose();let f=o.morphAttributes.position!==void 0,_=o.morphAttributes.normal!==void 0,g=o.morphAttributes.color!==void 0,m=o.morphAttributes.position||[],p=o.morphAttributes.normal||[],y=o.morphAttributes.color||[],w=0;f===!0&&(w=1),_===!0&&(w=2),g===!0&&(w=3);let S=o.attributes.position.count*w,M=1;S>e.maxTextureSize&&(M=Math.ceil(S/e.maxTextureSize),S=e.maxTextureSize);let A=new Float32Array(S*M*4*h),E=new oa(A,S,M,h);E.type=Gn,E.needsUpdate=!0;let R=w*4;for(let T=0;T<h;T++){let I=m[T],B=p[T],N=y[T],k=S*M*4*T;for(let V=0;V<I.count;V++){let O=V*R;f===!0&&(i.fromBufferAttribute(I,V),A[k+O+0]=i.x,A[k+O+1]=i.y,A[k+O+2]=i.z,A[k+O+3]=0),_===!0&&(i.fromBufferAttribute(B,V),A[k+O+4]=i.x,A[k+O+5]=i.y,A[k+O+6]=i.z,A[k+O+7]=0),g===!0&&(i.fromBufferAttribute(N,V),A[k+O+8]=i.x,A[k+O+9]=i.y,A[k+O+10]=i.z,A[k+O+11]=N.itemSize===4?i.w:1)}}d={count:h,texture:E,size:new st(S,M)},n.set(o,d),o.addEventListener("dispose",x)}if(a.isInstancedMesh===!0&&a.morphTexture!==null)c.getUniforms().setValue(r,"morphTexture",a.morphTexture,t);else{let f=0;for(let g=0;g<l.length;g++)f+=l[g];let _=o.morphTargetsRelative?1:1-f;c.getUniforms().setValue(r,"morphTargetBaseInfluence",_),c.getUniforms().setValue(r,"morphTargetInfluences",l)}c.getUniforms().setValue(r,"morphTargetsTexture",d.texture,t),c.getUniforms().setValue(r,"morphTargetsTextureSize",d.size)}return{update:s}}function Qx(r,e,t,n){let i=new WeakMap;function s(c){let l=n.render.frame,u=c.geometry,h=e.get(c,u);if(i.get(h)!==l&&(e.update(h),i.set(h,l)),c.isInstancedMesh&&(c.hasEventListener("dispose",o)===!1&&c.addEventListener("dispose",o),i.get(c)!==l&&(t.update(c.instanceMatrix,r.ARRAY_BUFFER),c.instanceColor!==null&&t.update(c.instanceColor,r.ARRAY_BUFFER),i.set(c,l))),c.isSkinnedMesh){let d=c.skeleton;i.get(d)!==l&&(d.update(),i.set(d,l))}return h}function a(){i=new WeakMap}function o(c){let l=c.target;l.removeEventListener("dispose",o),t.remove(l.instanceMatrix),l.instanceColor!==null&&t.remove(l.instanceColor)}return{update:s,dispose:a}}var jx={[Ru]:"LINEAR_TONE_MAPPING",[Pu]:"REINHARD_TONE_MAPPING",[Iu]:"CINEON_TONE_MAPPING",[Du]:"ACES_FILMIC_TONE_MAPPING",[Nu]:"AGX_TONE_MAPPING",[Fu]:"NEUTRAL_TONE_MAPPING",[Lu]:"CUSTOM_TONE_MAPPING"};function ev(r,e,t,n,i){let s=new rn(e,t,{type:r,depthBuffer:n,stencilBuffer:i}),a=new rn(e,t,{type:ii,depthBuffer:!1,stencilBuffer:!1}),o=new jn;o.setAttribute("position",new In([-1,3,0,-1,-1,0,3,-1,0],3)),o.setAttribute("uv",new In([0,2,0,0,2,0],2));let c=new Do({uniforms:{tDiffuse:{value:null}},vertexShader:`
			precision highp float;

			uniform mat4 modelViewMatrix;
			uniform mat4 projectionMatrix;

			attribute vec3 position;
			attribute vec2 uv;

			varying vec2 vUv;

			void main() {
				vUv = uv;
				gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
			}`,fragmentShader:`
			precision highp float;

			uniform sampler2D tDiffuse;

			varying vec2 vUv;

			#include <tonemapping_pars_fragment>
			#include <colorspace_pars_fragment>

			void main() {
				gl_FragColor = texture2D( tDiffuse, vUv );

				#ifdef LINEAR_TONE_MAPPING
					gl_FragColor.rgb = LinearToneMapping( gl_FragColor.rgb );
				#elif defined( REINHARD_TONE_MAPPING )
					gl_FragColor.rgb = ReinhardToneMapping( gl_FragColor.rgb );
				#elif defined( CINEON_TONE_MAPPING )
					gl_FragColor.rgb = CineonToneMapping( gl_FragColor.rgb );
				#elif defined( ACES_FILMIC_TONE_MAPPING )
					gl_FragColor.rgb = ACESFilmicToneMapping( gl_FragColor.rgb );
				#elif defined( AGX_TONE_MAPPING )
					gl_FragColor.rgb = AgXToneMapping( gl_FragColor.rgb );
				#elif defined( NEUTRAL_TONE_MAPPING )
					gl_FragColor.rgb = NeutralToneMapping( gl_FragColor.rgb );
				#elif defined( CUSTOM_TONE_MAPPING )
					gl_FragColor.rgb = CustomToneMapping( gl_FragColor.rgb );
				#endif

				#ifdef SRGB_TRANSFER
					gl_FragColor = sRGBTransferOETF( gl_FragColor );
				#endif
			}`,depthTest:!1,depthWrite:!1}),l=new sn(o,c),u=new er(-1,1,1,-1,0,1),h=null,d=null,f=!1,_,g=null,m=[],p=!1;this.setSize=function(y,w){s.setSize(y,w),a.setSize(y,w);for(let S=0;S<m.length;S++){let M=m[S];M.setSize&&M.setSize(y,w)}},this.setEffects=function(y){m=y,p=m.length>0&&m[0].isRenderPass===!0;let w=s.width,S=s.height;for(let M=0;M<m.length;M++){let A=m[M];A.setSize&&A.setSize(w,S)}},this.begin=function(y,w){if(f||y.toneMapping===zn&&m.length===0)return!1;if(g=w,w!==null){let S=w.width,M=w.height;(s.width!==S||s.height!==M)&&this.setSize(S,M)}return p===!1&&y.setRenderTarget(s),_=y.toneMapping,y.toneMapping=zn,!0},this.hasRenderPass=function(){return p},this.end=function(y,w){y.toneMapping=_,f=!0;let S=s,M=a;for(let A=0;A<m.length;A++){let E=m[A];if(E.enabled!==!1&&(E.render(y,M,S,w),E.needsSwap!==!1)){let R=S;S=M,M=R}}if(h!==y.outputColorSpace||d!==y.toneMapping){h=y.outputColorSpace,d=y.toneMapping,c.defines={},tt.getTransfer(h)===ct&&(c.defines.SRGB_TRANSFER="");let A=jx[d];A&&(c.defines[A]=""),c.needsUpdate=!0}c.uniforms.tDiffuse.value=S.texture,y.setRenderTarget(g),y.render(l,u),g=null,f=!1},this.isCompositing=function(){return f},this.dispose=function(){s.dispose(),a.dispose(),o.dispose(),c.dispose()}}var jf=new nn,ih=new $i(1,1),ep=new oa,tp=new Eo,np=new da,Ff=[],Uf=[],Of=new Float32Array(16),Bf=new Float32Array(9),kf=new Float32Array(4);function Cs(r,e,t){let n=r[0];if(n<=0||n>0)return r;let i=e*t,s=Ff[i];if(s===void 0&&(s=new Float32Array(i),Ff[i]=s),e!==0){n.toArray(s,0);for(let a=1,o=0;a!==e;++a)o+=t,r[a].toArray(s,o)}return s}function Pt(r,e){if(r.length!==e.length)return!1;for(let t=0,n=r.length;t<n;t++)if(r[t]!==e[t])return!1;return!0}function It(r,e){for(let t=0,n=e.length;t<n;t++)r[t]=e[t]}function ql(r,e){let t=Uf[e];t===void 0&&(t=new Int32Array(e),Uf[e]=t);for(let n=0;n!==e;++n)t[n]=r.allocateTextureUnit();return t}function tv(r,e){let t=this.cache;t[0]!==e&&(r.uniform1f(this.addr,e),t[0]=e)}function nv(r,e){let t=this.cache;if(e.x!==void 0)(t[0]!==e.x||t[1]!==e.y)&&(r.uniform2f(this.addr,e.x,e.y),t[0]=e.x,t[1]=e.y);else{if(Pt(t,e))return;r.uniform2fv(this.addr,e),It(t,e)}}function iv(r,e){let t=this.cache;if(e.x!==void 0)(t[0]!==e.x||t[1]!==e.y||t[2]!==e.z)&&(r.uniform3f(this.addr,e.x,e.y,e.z),t[0]=e.x,t[1]=e.y,t[2]=e.z);else if(e.r!==void 0)(t[0]!==e.r||t[1]!==e.g||t[2]!==e.b)&&(r.uniform3f(this.addr,e.r,e.g,e.b),t[0]=e.r,t[1]=e.g,t[2]=e.b);else{if(Pt(t,e))return;r.uniform3fv(this.addr,e),It(t,e)}}function rv(r,e){let t=this.cache;if(e.x!==void 0)(t[0]!==e.x||t[1]!==e.y||t[2]!==e.z||t[3]!==e.w)&&(r.uniform4f(this.addr,e.x,e.y,e.z,e.w),t[0]=e.x,t[1]=e.y,t[2]=e.z,t[3]=e.w);else{if(Pt(t,e))return;r.uniform4fv(this.addr,e),It(t,e)}}function sv(r,e){let t=this.cache,n=e.elements;if(n===void 0){if(Pt(t,e))return;r.uniformMatrix2fv(this.addr,!1,e),It(t,e)}else{if(Pt(t,n))return;kf.set(n),r.uniformMatrix2fv(this.addr,!1,kf),It(t,n)}}function av(r,e){let t=this.cache,n=e.elements;if(n===void 0){if(Pt(t,e))return;r.uniformMatrix3fv(this.addr,!1,e),It(t,e)}else{if(Pt(t,n))return;Bf.set(n),r.uniformMatrix3fv(this.addr,!1,Bf),It(t,n)}}function ov(r,e){let t=this.cache,n=e.elements;if(n===void 0){if(Pt(t,e))return;r.uniformMatrix4fv(this.addr,!1,e),It(t,e)}else{if(Pt(t,n))return;Of.set(n),r.uniformMatrix4fv(this.addr,!1,Of),It(t,n)}}function lv(r,e){let t=this.cache;t[0]!==e&&(r.uniform1i(this.addr,e),t[0]=e)}function cv(r,e){let t=this.cache;if(e.x!==void 0)(t[0]!==e.x||t[1]!==e.y)&&(r.uniform2i(this.addr,e.x,e.y),t[0]=e.x,t[1]=e.y);else{if(Pt(t,e))return;r.uniform2iv(this.addr,e),It(t,e)}}function uv(r,e){let t=this.cache;if(e.x!==void 0)(t[0]!==e.x||t[1]!==e.y||t[2]!==e.z)&&(r.uniform3i(this.addr,e.x,e.y,e.z),t[0]=e.x,t[1]=e.y,t[2]=e.z);else{if(Pt(t,e))return;r.uniform3iv(this.addr,e),It(t,e)}}function hv(r,e){let t=this.cache;if(e.x!==void 0)(t[0]!==e.x||t[1]!==e.y||t[2]!==e.z||t[3]!==e.w)&&(r.uniform4i(this.addr,e.x,e.y,e.z,e.w),t[0]=e.x,t[1]=e.y,t[2]=e.z,t[3]=e.w);else{if(Pt(t,e))return;r.uniform4iv(this.addr,e),It(t,e)}}function dv(r,e){let t=this.cache;t[0]!==e&&(r.uniform1ui(this.addr,e),t[0]=e)}function fv(r,e){let t=this.cache;if(e.x!==void 0)(t[0]!==e.x||t[1]!==e.y)&&(r.uniform2ui(this.addr,e.x,e.y),t[0]=e.x,t[1]=e.y);else{if(Pt(t,e))return;r.uniform2uiv(this.addr,e),It(t,e)}}function pv(r,e){let t=this.cache;if(e.x!==void 0)(t[0]!==e.x||t[1]!==e.y||t[2]!==e.z)&&(r.uniform3ui(this.addr,e.x,e.y,e.z),t[0]=e.x,t[1]=e.y,t[2]=e.z);else{if(Pt(t,e))return;r.uniform3uiv(this.addr,e),It(t,e)}}function mv(r,e){let t=this.cache;if(e.x!==void 0)(t[0]!==e.x||t[1]!==e.y||t[2]!==e.z||t[3]!==e.w)&&(r.uniform4ui(this.addr,e.x,e.y,e.z,e.w),t[0]=e.x,t[1]=e.y,t[2]=e.z,t[3]=e.w);else{if(Pt(t,e))return;r.uniform4uiv(this.addr,e),It(t,e)}}function gv(r,e,t){let n=this.cache,i=t.allocateTextureUnit();n[0]!==i&&(r.uniform1i(this.addr,i),n[0]=i);let s;this.type===r.SAMPLER_2D_SHADOW?(ih.compareFunction=t.isReversedDepthBuffer()?zl:kl,s=ih):s=jf,t.setTexture2D(e||s,i)}function _v(r,e,t){let n=this.cache,i=t.allocateTextureUnit();n[0]!==i&&(r.uniform1i(this.addr,i),n[0]=i),t.setTexture3D(e||tp,i)}function xv(r,e,t){let n=this.cache,i=t.allocateTextureUnit();n[0]!==i&&(r.uniform1i(this.addr,i),n[0]=i),t.setTextureCube(e||np,i)}function vv(r,e,t){let n=this.cache,i=t.allocateTextureUnit();n[0]!==i&&(r.uniform1i(this.addr,i),n[0]=i),t.setTexture2DArray(e||ep,i)}function yv(r){switch(r){case 5126:return tv;case 35664:return nv;case 35665:return iv;case 35666:return rv;case 35674:return sv;case 35675:return av;case 35676:return ov;case 5124:case 35670:return lv;case 35667:case 35671:return cv;case 35668:case 35672:return uv;case 35669:case 35673:return hv;case 5125:return dv;case 36294:return fv;case 36295:return pv;case 36296:return mv;case 35678:case 36198:case 36298:case 36306:case 35682:return gv;case 35679:case 36299:case 36307:return _v;case 35680:case 36300:case 36308:case 36293:return xv;case 36289:case 36303:case 36311:case 36292:return vv}}function bv(r,e){r.uniform1fv(this.addr,e)}function Mv(r,e){let t=Cs(e,this.size,2);r.uniform2fv(this.addr,t)}function Sv(r,e){let t=Cs(e,this.size,3);r.uniform3fv(this.addr,t)}function wv(r,e){let t=Cs(e,this.size,4);r.uniform4fv(this.addr,t)}function Tv(r,e){let t=Cs(e,this.size,4);r.uniformMatrix2fv(this.addr,!1,t)}function Av(r,e){let t=Cs(e,this.size,9);r.uniformMatrix3fv(this.addr,!1,t)}function Ev(r,e){let t=Cs(e,this.size,16);r.uniformMatrix4fv(this.addr,!1,t)}function Cv(r,e){r.uniform1iv(this.addr,e)}function Rv(r,e){r.uniform2iv(this.addr,e)}function Pv(r,e){r.uniform3iv(this.addr,e)}function Iv(r,e){r.uniform4iv(this.addr,e)}function Dv(r,e){r.uniform1uiv(this.addr,e)}function Lv(r,e){r.uniform2uiv(this.addr,e)}function Nv(r,e){r.uniform3uiv(this.addr,e)}function Fv(r,e){r.uniform4uiv(this.addr,e)}function Uv(r,e,t){let n=this.cache,i=e.length,s=ql(t,i);Pt(n,s)||(r.uniform1iv(this.addr,s),It(n,s));let a;this.type===r.SAMPLER_2D_SHADOW?a=ih:a=jf;for(let o=0;o!==i;++o)t.setTexture2D(e[o]||a,s[o])}function Ov(r,e,t){let n=this.cache,i=e.length,s=ql(t,i);Pt(n,s)||(r.uniform1iv(this.addr,s),It(n,s));for(let a=0;a!==i;++a)t.setTexture3D(e[a]||tp,s[a])}function Bv(r,e,t){let n=this.cache,i=e.length,s=ql(t,i);Pt(n,s)||(r.uniform1iv(this.addr,s),It(n,s));for(let a=0;a!==i;++a)t.setTextureCube(e[a]||np,s[a])}function kv(r,e,t){let n=this.cache,i=e.length,s=ql(t,i);Pt(n,s)||(r.uniform1iv(this.addr,s),It(n,s));for(let a=0;a!==i;++a)t.setTexture2DArray(e[a]||ep,s[a])}function zv(r){switch(r){case 5126:return bv;case 35664:return Mv;case 35665:return Sv;case 35666:return wv;case 35674:return Tv;case 35675:return Av;case 35676:return Ev;case 5124:case 35670:return Cv;case 35667:case 35671:return Rv;case 35668:case 35672:return Pv;case 35669:case 35673:return Iv;case 5125:return Dv;case 36294:return Lv;case 36295:return Nv;case 36296:return Fv;case 35678:case 36198:case 36298:case 36306:case 35682:return Uv;case 35679:case 36299:case 36307:return Ov;case 35680:case 36300:case 36308:case 36293:return Bv;case 36289:case 36303:case 36311:case 36292:return kv}}var rh=class{constructor(e,t,n){this.id=e,this.addr=n,this.cache=[],this.type=t.type,this.setValue=yv(t.type)}},sh=class{constructor(e,t,n){this.id=e,this.addr=n,this.cache=[],this.type=t.type,this.size=t.size,this.setValue=zv(t.type)}},ah=class{constructor(e){this.id=e,this.seq=[],this.map={}}setValue(e,t,n){let i=this.seq;for(let s=0,a=i.length;s!==a;++s){let o=i[s];o.setValue(e,t[o.id],n)}}},th=/(\w+)(\])?(\[|\.)?/g;function zf(r,e){r.seq.push(e),r.map[e.id]=e}function Vv(r,e,t){let n=r.name,i=n.length;for(th.lastIndex=0;;){let s=th.exec(n),a=th.lastIndex,o=s[1],c=s[2]==="]",l=s[3];if(c&&(o=o|0),l===void 0||l==="["&&a+2===i){zf(t,l===void 0?new rh(o,r,e):new sh(o,r,e));break}else{let h=t.map[o];h===void 0&&(h=new ah(o),zf(t,h)),t=h}}}var Es=class{constructor(e,t){this.seq=[],this.map={};let n=e.getProgramParameter(t,e.ACTIVE_UNIFORMS);for(let a=0;a<n;++a){let o=e.getActiveUniform(t,a),c=e.getUniformLocation(t,o.name);Vv(o,c,this)}let i=[],s=[];for(let a of this.seq)a.type===e.SAMPLER_2D_SHADOW||a.type===e.SAMPLER_CUBE_SHADOW||a.type===e.SAMPLER_2D_ARRAY_SHADOW?i.push(a):s.push(a);i.length>0&&(this.seq=i.concat(s))}setValue(e,t,n,i){let s=this.map[t];s!==void 0&&s.setValue(e,n,i)}setOptional(e,t,n){let i=t[n];i!==void 0&&this.setValue(e,n,i)}static upload(e,t,n,i){for(let s=0,a=t.length;s!==a;++s){let o=t[s],c=n[o.id];c.needsUpdate!==!1&&o.setValue(e,c.value,i)}}static seqWithValue(e,t){let n=[];for(let i=0,s=e.length;i!==s;++i){let a=e[i];a.id in t&&n.push(a)}return n}};function Vf(r,e,t){let n=r.createShader(e);return r.shaderSource(n,t),r.compileShader(n),n}var Gv=37297,Hv=0;function Wv(r,e){let t=r.split(`
`),n=[],i=Math.max(e-6,0),s=Math.min(e+6,t.length);for(let a=i;a<s;a++){let o=a+1;n.push(`${o===e?">":" "} ${o}: ${t[a]}`)}return n.join(`
`)}var Gf=new He;function Xv(r){tt._getMatrix(Gf,tt.workingColorSpace,r);let e=`mat3( ${Gf.elements.map(t=>t.toFixed(4))} )`;switch(tt.getTransfer(r)){case sa:return[e,"LinearTransferOETF"];case ct:return[e,"sRGBTransferOETF"];default:return Ve("WebGLProgram: Unsupported color space: ",r),[e,"LinearTransferOETF"]}}function Hf(r,e,t){let n=r.getShaderParameter(e,r.COMPILE_STATUS),s=(r.getShaderInfoLog(e)||"").trim();if(n&&s==="")return"";let a=/ERROR: 0:(\d+)/.exec(s);if(a){let o=parseInt(a[1]);return t.toUpperCase()+`

`+s+`

`+Wv(r.getShaderSource(e),o)}else return s}function qv(r,e){let t=Xv(e);return[`vec4 ${r}( vec4 value ) {`,`	return ${t[1]}( vec4( value.rgb * ${t[0]}, value.a ) );`,"}"].join(`
`)}var Yv={[Ru]:"Linear",[Pu]:"Reinhard",[Iu]:"Cineon",[Du]:"ACESFilmic",[Nu]:"AgX",[Fu]:"Neutral",[Lu]:"Custom"};function Zv(r,e){let t=Yv[e];return t===void 0?(Ve("WebGLProgram: Unsupported toneMapping:",e),"vec3 "+r+"( vec3 color ) { return LinearToneMapping( color ); }"):"vec3 "+r+"( vec3 color ) { return "+t+"ToneMapping( color ); }"}var Gl=new W;function Jv(){tt.getLuminanceCoefficients(Gl);let r=Gl.x.toFixed(4),e=Gl.y.toFixed(4),t=Gl.z.toFixed(4);return["float luminance( const in vec3 rgb ) {",`	const vec3 weights = vec3( ${r}, ${e}, ${t} );`,"	return dot( weights, rgb );","}"].join(`
`)}function $v(r){return[r.extensionClipCullDistance?"#extension GL_ANGLE_clip_cull_distance : require":"",r.extensionMultiDraw?"#extension GL_ANGLE_multi_draw : require":""].filter(Ca).join(`
`)}function Kv(r){let e=[];for(let t in r){let n=r[t];n!==!1&&e.push("#define "+t+" "+n)}return e.join(`
`)}function Qv(r,e){let t={},n=r.getProgramParameter(e,r.ACTIVE_ATTRIBUTES);for(let i=0;i<n;i++){let s=r.getActiveAttrib(e,i),a=s.name,o=1;s.type===r.FLOAT_MAT2&&(o=2),s.type===r.FLOAT_MAT3&&(o=3),s.type===r.FLOAT_MAT4&&(o=4),t[a]={type:s.type,location:r.getAttribLocation(e,a),locationSize:o}}return t}function Ca(r){return r!==""}function Wf(r,e){let t=e.numSpotLightShadows+e.numSpotLightMaps-e.numSpotLightShadowsWithMaps;return r.replace(/NUM_DIR_LIGHTS/g,e.numDirLights).replace(/NUM_SPOT_LIGHTS/g,e.numSpotLights).replace(/NUM_SPOT_LIGHT_MAPS/g,e.numSpotLightMaps).replace(/NUM_SPOT_LIGHT_COORDS/g,t).replace(/NUM_RECT_AREA_LIGHTS/g,e.numRectAreaLights).replace(/NUM_POINT_LIGHTS/g,e.numPointLights).replace(/NUM_HEMI_LIGHTS/g,e.numHemiLights).replace(/NUM_DIR_LIGHT_SHADOWS/g,e.numDirLightShadows).replace(/NUM_SPOT_LIGHT_SHADOWS_WITH_MAPS/g,e.numSpotLightShadowsWithMaps).replace(/NUM_SPOT_LIGHT_SHADOWS/g,e.numSpotLightShadows).replace(/NUM_POINT_LIGHT_SHADOWS/g,e.numPointLightShadows)}function Xf(r,e){return r.replace(/NUM_CLIPPING_PLANES/g,e.numClippingPlanes).replace(/UNION_CLIPPING_PLANES/g,e.numClippingPlanes-e.numClipIntersection)}var jv=/^[ \t]*#include +<([\w\d./]+)>/gm;function oh(r){return r.replace(jv,ty)}var ey=new Map;function ty(r,e){let t=qe[e];if(t===void 0){let n=ey.get(e);if(n!==void 0)t=qe[n],Ve('WebGLRenderer: Shader chunk "%s" has been deprecated. Use "%s" instead.',e,n);else throw new Error("Can not resolve #include <"+e+">")}return oh(t)}var ny=/#pragma unroll_loop_start\s+for\s*\(\s*int\s+i\s*=\s*(\d+)\s*;\s*i\s*<\s*(\d+)\s*;\s*i\s*\+\+\s*\)\s*{([\s\S]+?)}\s+#pragma unroll_loop_end/g;function qf(r){return r.replace(ny,iy)}function iy(r,e,t,n){let i="";for(let s=parseInt(e);s<parseInt(t);s++)i+=n.replace(/\[\s*i\s*\]/g,"[ "+s+" ]").replace(/UNROLLED_LOOP_INDEX/g,s);return i}function Yf(r){let e=`precision ${r.precision} float;
	precision ${r.precision} int;
	precision ${r.precision} sampler2D;
	precision ${r.precision} samplerCube;
	precision ${r.precision} sampler3D;
	precision ${r.precision} sampler2DArray;
	precision ${r.precision} sampler2DShadow;
	precision ${r.precision} samplerCubeShadow;
	precision ${r.precision} sampler2DArrayShadow;
	precision ${r.precision} isampler2D;
	precision ${r.precision} isampler3D;
	precision ${r.precision} isamplerCube;
	precision ${r.precision} isampler2DArray;
	precision ${r.precision} usampler2D;
	precision ${r.precision} usampler3D;
	precision ${r.precision} usamplerCube;
	precision ${r.precision} usampler2DArray;
	`;return r.precision==="highp"?e+=`
#define HIGH_PRECISION`:r.precision==="mediump"?e+=`
#define MEDIUM_PRECISION`:r.precision==="lowp"&&(e+=`
#define LOW_PRECISION`),e}var ry={[xa]:"SHADOWMAP_TYPE_PCF",[Ss]:"SHADOWMAP_TYPE_VSM"};function sy(r){return ry[r.shadowMapType]||"SHADOWMAP_TYPE_BASIC"}var ay={[tr]:"ENVMAP_TYPE_CUBE",[Dr]:"ENVMAP_TYPE_CUBE",[va]:"ENVMAP_TYPE_CUBE_UV"};function oy(r){return r.envMap===!1?"ENVMAP_TYPE_CUBE":ay[r.envMapMode]||"ENVMAP_TYPE_CUBE"}var ly={[Dr]:"ENVMAP_MODE_REFRACTION"};function cy(r){return r.envMap===!1?"ENVMAP_MODE_REFLECTION":ly[r.envMapMode]||"ENVMAP_MODE_REFLECTION"}var uy={[Cu]:"ENVMAP_BLENDING_MULTIPLY",[ff]:"ENVMAP_BLENDING_MIX",[pf]:"ENVMAP_BLENDING_ADD"};function hy(r){return r.envMap===!1?"ENVMAP_BLENDING_NONE":uy[r.combine]||"ENVMAP_BLENDING_NONE"}function dy(r){let e=r.envMapCubeUVHeight;if(e===null)return null;let t=Math.log2(e)-2,n=1/e;return{texelWidth:1/(3*Math.max(Math.pow(2,t),112)),texelHeight:n,maxMip:t}}function fy(r,e,t,n){let i=r.getContext(),s=t.defines,a=t.vertexShader,o=t.fragmentShader,c=sy(t),l=oy(t),u=cy(t),h=hy(t),d=dy(t),f=$v(t),_=Kv(s),g=i.createProgram(),m,p,y=t.glslVersion?"#version "+t.glslVersion+`
`:"";t.isRawShaderMaterial?(m=["#define SHADER_TYPE "+t.shaderType,"#define SHADER_NAME "+t.shaderName,_].filter(Ca).join(`
`),m.length>0&&(m+=`
`),p=["#define SHADER_TYPE "+t.shaderType,"#define SHADER_NAME "+t.shaderName,_].filter(Ca).join(`
`),p.length>0&&(p+=`
`)):(m=[Yf(t),"#define SHADER_TYPE "+t.shaderType,"#define SHADER_NAME "+t.shaderName,_,t.extensionClipCullDistance?"#define USE_CLIP_DISTANCE":"",t.batching?"#define USE_BATCHING":"",t.batchingColor?"#define USE_BATCHING_COLOR":"",t.instancing?"#define USE_INSTANCING":"",t.instancingColor?"#define USE_INSTANCING_COLOR":"",t.instancingMorph?"#define USE_INSTANCING_MORPH":"",t.useFog&&t.fog?"#define USE_FOG":"",t.useFog&&t.fogExp2?"#define FOG_EXP2":"",t.map?"#define USE_MAP":"",t.envMap?"#define USE_ENVMAP":"",t.envMap?"#define "+u:"",t.lightMap?"#define USE_LIGHTMAP":"",t.aoMap?"#define USE_AOMAP":"",t.bumpMap?"#define USE_BUMPMAP":"",t.normalMap?"#define USE_NORMALMAP":"",t.normalMapObjectSpace?"#define USE_NORMALMAP_OBJECTSPACE":"",t.normalMapTangentSpace?"#define USE_NORMALMAP_TANGENTSPACE":"",t.displacementMap?"#define USE_DISPLACEMENTMAP":"",t.emissiveMap?"#define USE_EMISSIVEMAP":"",t.anisotropy?"#define USE_ANISOTROPY":"",t.anisotropyMap?"#define USE_ANISOTROPYMAP":"",t.clearcoatMap?"#define USE_CLEARCOATMAP":"",t.clearcoatRoughnessMap?"#define USE_CLEARCOAT_ROUGHNESSMAP":"",t.clearcoatNormalMap?"#define USE_CLEARCOAT_NORMALMAP":"",t.iridescenceMap?"#define USE_IRIDESCENCEMAP":"",t.iridescenceThicknessMap?"#define USE_IRIDESCENCE_THICKNESSMAP":"",t.specularMap?"#define USE_SPECULARMAP":"",t.specularColorMap?"#define USE_SPECULAR_COLORMAP":"",t.specularIntensityMap?"#define USE_SPECULAR_INTENSITYMAP":"",t.roughnessMap?"#define USE_ROUGHNESSMAP":"",t.metalnessMap?"#define USE_METALNESSMAP":"",t.alphaMap?"#define USE_ALPHAMAP":"",t.alphaHash?"#define USE_ALPHAHASH":"",t.transmission?"#define USE_TRANSMISSION":"",t.transmissionMap?"#define USE_TRANSMISSIONMAP":"",t.thicknessMap?"#define USE_THICKNESSMAP":"",t.sheenColorMap?"#define USE_SHEEN_COLORMAP":"",t.sheenRoughnessMap?"#define USE_SHEEN_ROUGHNESSMAP":"",t.mapUv?"#define MAP_UV "+t.mapUv:"",t.alphaMapUv?"#define ALPHAMAP_UV "+t.alphaMapUv:"",t.lightMapUv?"#define LIGHTMAP_UV "+t.lightMapUv:"",t.aoMapUv?"#define AOMAP_UV "+t.aoMapUv:"",t.emissiveMapUv?"#define EMISSIVEMAP_UV "+t.emissiveMapUv:"",t.bumpMapUv?"#define BUMPMAP_UV "+t.bumpMapUv:"",t.normalMapUv?"#define NORMALMAP_UV "+t.normalMapUv:"",t.displacementMapUv?"#define DISPLACEMENTMAP_UV "+t.displacementMapUv:"",t.metalnessMapUv?"#define METALNESSMAP_UV "+t.metalnessMapUv:"",t.roughnessMapUv?"#define ROUGHNESSMAP_UV "+t.roughnessMapUv:"",t.anisotropyMapUv?"#define ANISOTROPYMAP_UV "+t.anisotropyMapUv:"",t.clearcoatMapUv?"#define CLEARCOATMAP_UV "+t.clearcoatMapUv:"",t.clearcoatNormalMapUv?"#define CLEARCOAT_NORMALMAP_UV "+t.clearcoatNormalMapUv:"",t.clearcoatRoughnessMapUv?"#define CLEARCOAT_ROUGHNESSMAP_UV "+t.clearcoatRoughnessMapUv:"",t.iridescenceMapUv?"#define IRIDESCENCEMAP_UV "+t.iridescenceMapUv:"",t.iridescenceThicknessMapUv?"#define IRIDESCENCE_THICKNESSMAP_UV "+t.iridescenceThicknessMapUv:"",t.sheenColorMapUv?"#define SHEEN_COLORMAP_UV "+t.sheenColorMapUv:"",t.sheenRoughnessMapUv?"#define SHEEN_ROUGHNESSMAP_UV "+t.sheenRoughnessMapUv:"",t.specularMapUv?"#define SPECULARMAP_UV "+t.specularMapUv:"",t.specularColorMapUv?"#define SPECULAR_COLORMAP_UV "+t.specularColorMapUv:"",t.specularIntensityMapUv?"#define SPECULAR_INTENSITYMAP_UV "+t.specularIntensityMapUv:"",t.transmissionMapUv?"#define TRANSMISSIONMAP_UV "+t.transmissionMapUv:"",t.thicknessMapUv?"#define THICKNESSMAP_UV "+t.thicknessMapUv:"",t.vertexTangents&&t.flatShading===!1?"#define USE_TANGENT":"",t.vertexColors?"#define USE_COLOR":"",t.vertexAlphas?"#define USE_COLOR_ALPHA":"",t.vertexUv1s?"#define USE_UV1":"",t.vertexUv2s?"#define USE_UV2":"",t.vertexUv3s?"#define USE_UV3":"",t.pointsUvs?"#define USE_POINTS_UV":"",t.flatShading?"#define FLAT_SHADED":"",t.skinning?"#define USE_SKINNING":"",t.morphTargets?"#define USE_MORPHTARGETS":"",t.morphNormals&&t.flatShading===!1?"#define USE_MORPHNORMALS":"",t.morphColors?"#define USE_MORPHCOLORS":"",t.morphTargetsCount>0?"#define MORPHTARGETS_TEXTURE_STRIDE "+t.morphTextureStride:"",t.morphTargetsCount>0?"#define MORPHTARGETS_COUNT "+t.morphTargetsCount:"",t.doubleSided?"#define DOUBLE_SIDED":"",t.flipSided?"#define FLIP_SIDED":"",t.shadowMapEnabled?"#define USE_SHADOWMAP":"",t.shadowMapEnabled?"#define "+c:"",t.sizeAttenuation?"#define USE_SIZEATTENUATION":"",t.numLightProbes>0?"#define USE_LIGHT_PROBES":"",t.logarithmicDepthBuffer?"#define USE_LOGARITHMIC_DEPTH_BUFFER":"",t.reversedDepthBuffer?"#define USE_REVERSED_DEPTH_BUFFER":"","uniform mat4 modelMatrix;","uniform mat4 modelViewMatrix;","uniform mat4 projectionMatrix;","uniform mat4 viewMatrix;","uniform mat3 normalMatrix;","uniform vec3 cameraPosition;","uniform bool isOrthographic;","#ifdef USE_INSTANCING","	attribute mat4 instanceMatrix;","#endif","#ifdef USE_INSTANCING_COLOR","	attribute vec3 instanceColor;","#endif","#ifdef USE_INSTANCING_MORPH","	uniform sampler2D morphTexture;","#endif","attribute vec3 position;","attribute vec3 normal;","attribute vec2 uv;","#ifdef USE_UV1","	attribute vec2 uv1;","#endif","#ifdef USE_UV2","	attribute vec2 uv2;","#endif","#ifdef USE_UV3","	attribute vec2 uv3;","#endif","#ifdef USE_TANGENT","	attribute vec4 tangent;","#endif","#if defined( USE_COLOR_ALPHA )","	attribute vec4 color;","#elif defined( USE_COLOR )","	attribute vec3 color;","#endif","#ifdef USE_SKINNING","	attribute vec4 skinIndex;","	attribute vec4 skinWeight;","#endif",`
`].filter(Ca).join(`
`),p=[Yf(t),"#define SHADER_TYPE "+t.shaderType,"#define SHADER_NAME "+t.shaderName,_,t.useFog&&t.fog?"#define USE_FOG":"",t.useFog&&t.fogExp2?"#define FOG_EXP2":"",t.alphaToCoverage?"#define ALPHA_TO_COVERAGE":"",t.map?"#define USE_MAP":"",t.matcap?"#define USE_MATCAP":"",t.envMap?"#define USE_ENVMAP":"",t.envMap?"#define "+l:"",t.envMap?"#define "+u:"",t.envMap?"#define "+h:"",d?"#define CUBEUV_TEXEL_WIDTH "+d.texelWidth:"",d?"#define CUBEUV_TEXEL_HEIGHT "+d.texelHeight:"",d?"#define CUBEUV_MAX_MIP "+d.maxMip+".0":"",t.lightMap?"#define USE_LIGHTMAP":"",t.aoMap?"#define USE_AOMAP":"",t.bumpMap?"#define USE_BUMPMAP":"",t.normalMap?"#define USE_NORMALMAP":"",t.normalMapObjectSpace?"#define USE_NORMALMAP_OBJECTSPACE":"",t.normalMapTangentSpace?"#define USE_NORMALMAP_TANGENTSPACE":"",t.emissiveMap?"#define USE_EMISSIVEMAP":"",t.anisotropy?"#define USE_ANISOTROPY":"",t.anisotropyMap?"#define USE_ANISOTROPYMAP":"",t.clearcoat?"#define USE_CLEARCOAT":"",t.clearcoatMap?"#define USE_CLEARCOATMAP":"",t.clearcoatRoughnessMap?"#define USE_CLEARCOAT_ROUGHNESSMAP":"",t.clearcoatNormalMap?"#define USE_CLEARCOAT_NORMALMAP":"",t.dispersion?"#define USE_DISPERSION":"",t.iridescence?"#define USE_IRIDESCENCE":"",t.iridescenceMap?"#define USE_IRIDESCENCEMAP":"",t.iridescenceThicknessMap?"#define USE_IRIDESCENCE_THICKNESSMAP":"",t.specularMap?"#define USE_SPECULARMAP":"",t.specularColorMap?"#define USE_SPECULAR_COLORMAP":"",t.specularIntensityMap?"#define USE_SPECULAR_INTENSITYMAP":"",t.roughnessMap?"#define USE_ROUGHNESSMAP":"",t.metalnessMap?"#define USE_METALNESSMAP":"",t.alphaMap?"#define USE_ALPHAMAP":"",t.alphaTest?"#define USE_ALPHATEST":"",t.alphaHash?"#define USE_ALPHAHASH":"",t.sheen?"#define USE_SHEEN":"",t.sheenColorMap?"#define USE_SHEEN_COLORMAP":"",t.sheenRoughnessMap?"#define USE_SHEEN_ROUGHNESSMAP":"",t.transmission?"#define USE_TRANSMISSION":"",t.transmissionMap?"#define USE_TRANSMISSIONMAP":"",t.thicknessMap?"#define USE_THICKNESSMAP":"",t.vertexTangents&&t.flatShading===!1?"#define USE_TANGENT":"",t.vertexColors||t.instancingColor||t.batchingColor?"#define USE_COLOR":"",t.vertexAlphas?"#define USE_COLOR_ALPHA":"",t.vertexUv1s?"#define USE_UV1":"",t.vertexUv2s?"#define USE_UV2":"",t.vertexUv3s?"#define USE_UV3":"",t.pointsUvs?"#define USE_POINTS_UV":"",t.gradientMap?"#define USE_GRADIENTMAP":"",t.flatShading?"#define FLAT_SHADED":"",t.doubleSided?"#define DOUBLE_SIDED":"",t.flipSided?"#define FLIP_SIDED":"",t.shadowMapEnabled?"#define USE_SHADOWMAP":"",t.shadowMapEnabled?"#define "+c:"",t.premultipliedAlpha?"#define PREMULTIPLIED_ALPHA":"",t.numLightProbes>0?"#define USE_LIGHT_PROBES":"",t.decodeVideoTexture?"#define DECODE_VIDEO_TEXTURE":"",t.decodeVideoTextureEmissive?"#define DECODE_VIDEO_TEXTURE_EMISSIVE":"",t.logarithmicDepthBuffer?"#define USE_LOGARITHMIC_DEPTH_BUFFER":"",t.reversedDepthBuffer?"#define USE_REVERSED_DEPTH_BUFFER":"","uniform mat4 viewMatrix;","uniform vec3 cameraPosition;","uniform bool isOrthographic;",t.toneMapping!==zn?"#define TONE_MAPPING":"",t.toneMapping!==zn?qe.tonemapping_pars_fragment:"",t.toneMapping!==zn?Zv("toneMapping",t.toneMapping):"",t.dithering?"#define DITHERING":"",t.opaque?"#define OPAQUE":"",qe.colorspace_pars_fragment,qv("linearToOutputTexel",t.outputColorSpace),Jv(),t.useDepthPacking?"#define DEPTH_PACKING "+t.depthPacking:"",`
`].filter(Ca).join(`
`)),a=oh(a),a=Wf(a,t),a=Xf(a,t),o=oh(o),o=Wf(o,t),o=Xf(o,t),a=qf(a),o=qf(o),t.isRawShaderMaterial!==!0&&(y=`#version 300 es
`,m=[f,"#define attribute in","#define varying out","#define texture2D texture"].join(`
`)+`
`+m,p=["#define varying in",t.glslVersion===Wu?"":"layout(location = 0) out highp vec4 pc_fragColor;",t.glslVersion===Wu?"":"#define gl_FragColor pc_fragColor","#define gl_FragDepthEXT gl_FragDepth","#define texture2D texture","#define textureCube texture","#define texture2DProj textureProj","#define texture2DLodEXT textureLod","#define texture2DProjLodEXT textureProjLod","#define textureCubeLodEXT textureLod","#define texture2DGradEXT textureGrad","#define texture2DProjGradEXT textureProjGrad","#define textureCubeGradEXT textureGrad"].join(`
`)+`
`+p);let w=y+m+a,S=y+p+o,M=Vf(i,i.VERTEX_SHADER,w),A=Vf(i,i.FRAGMENT_SHADER,S);i.attachShader(g,M),i.attachShader(g,A),t.index0AttributeName!==void 0?i.bindAttribLocation(g,0,t.index0AttributeName):t.morphTargets===!0&&i.bindAttribLocation(g,0,"position"),i.linkProgram(g);function E(I){if(r.debug.checkShaderErrors){let B=i.getProgramInfoLog(g)||"",N=i.getShaderInfoLog(M)||"",k=i.getShaderInfoLog(A)||"",V=B.trim(),O=N.trim(),z=k.trim(),$=!0,ce=!0;if(i.getProgramParameter(g,i.LINK_STATUS)===!1)if($=!1,typeof r.debug.onShaderError=="function")r.debug.onShaderError(i,g,M,A);else{let q=Hf(i,M,"vertex"),ie=Hf(i,A,"fragment");Be("THREE.WebGLProgram: Shader Error "+i.getError()+" - VALIDATE_STATUS "+i.getProgramParameter(g,i.VALIDATE_STATUS)+`

Material Name: `+I.name+`
Material Type: `+I.type+`

Program Info Log: `+V+`
`+q+`
`+ie)}else V!==""?Ve("WebGLProgram: Program Info Log:",V):(O===""||z==="")&&(ce=!1);ce&&(I.diagnostics={runnable:$,programLog:V,vertexShader:{log:O,prefix:m},fragmentShader:{log:z,prefix:p}})}i.deleteShader(M),i.deleteShader(A),R=new Es(i,g),x=Qv(i,g)}let R;this.getUniforms=function(){return R===void 0&&E(this),R};let x;this.getAttributes=function(){return x===void 0&&E(this),x};let T=t.rendererExtensionParallelShaderCompile===!1;return this.isReady=function(){return T===!1&&(T=i.getProgramParameter(g,Gv)),T},this.destroy=function(){n.releaseStatesOfProgram(this),i.deleteProgram(g),this.program=void 0},this.type=t.shaderType,this.name=t.shaderName,this.id=Hv++,this.cacheKey=e,this.usedTimes=1,this.program=g,this.vertexShader=M,this.fragmentShader=A,this}var py=0,lh=class{constructor(){this.shaderCache=new Map,this.materialCache=new Map}update(e){let t=e.vertexShader,n=e.fragmentShader,i=this._getShaderStage(t),s=this._getShaderStage(n),a=this._getShaderCacheForMaterial(e);return a.has(i)===!1&&(a.add(i),i.usedTimes++),a.has(s)===!1&&(a.add(s),s.usedTimes++),this}remove(e){let t=this.materialCache.get(e);for(let n of t)n.usedTimes--,n.usedTimes===0&&this.shaderCache.delete(n.code);return this.materialCache.delete(e),this}getVertexShaderID(e){return this._getShaderStage(e.vertexShader).id}getFragmentShaderID(e){return this._getShaderStage(e.fragmentShader).id}dispose(){this.shaderCache.clear(),this.materialCache.clear()}_getShaderCacheForMaterial(e){let t=this.materialCache,n=t.get(e);return n===void 0&&(n=new Set,t.set(e,n)),n}_getShaderStage(e){let t=this.shaderCache,n=t.get(e);return n===void 0&&(n=new ch(e),t.set(e,n)),n}},ch=class{constructor(e){this.id=py++,this.code=e,this.usedTimes=0}};function my(r,e,t,n,i,s,a){let o=new la,c=new lh,l=new Set,u=[],h=new Map,d=i.logarithmicDepthBuffer,f=i.precision,_={MeshDepthMaterial:"depth",MeshDistanceMaterial:"distance",MeshNormalMaterial:"normal",MeshBasicMaterial:"basic",MeshLambertMaterial:"lambert",MeshPhongMaterial:"phong",MeshToonMaterial:"toon",MeshStandardMaterial:"physical",MeshPhysicalMaterial:"physical",MeshMatcapMaterial:"matcap",LineBasicMaterial:"basic",LineDashedMaterial:"dashed",PointsMaterial:"points",ShadowMaterial:"shadow",SpriteMaterial:"sprite"};function g(x){return l.add(x),x===0?"uv":`uv${x}`}function m(x,T,I,B,N){let k=B.fog,V=N.geometry,O=x.isMeshStandardMaterial?B.environment:null,z=(x.isMeshStandardMaterial?t:e).get(x.envMap||O),$=z&&z.mapping===va?z.image.height:null,ce=_[x.type];x.precision!==null&&(f=i.getMaxPrecision(x.precision),f!==x.precision&&Ve("WebGLProgram.getParameters:",x.precision,"not supported, using",f,"instead."));let q=V.morphAttributes.position||V.morphAttributes.normal||V.morphAttributes.color,ie=q!==void 0?q.length:0,Re=0;V.morphAttributes.position!==void 0&&(Re=1),V.morphAttributes.normal!==void 0&&(Re=2),V.morphAttributes.color!==void 0&&(Re=3);let Ue,ke,Oe,Y;if(ce){let rt=si[ce];Ue=rt.vertexShader,ke=rt.fragmentShader}else Ue=x.vertexShader,ke=x.fragmentShader,c.update(x),Oe=c.getVertexShaderID(x),Y=c.getFragmentShaderID(x);let ee=r.getRenderTarget(),_e=r.state.buffers.depth.getReversed(),ye=N.isInstancedMesh===!0,Me=N.isBatchedMesh===!0,Xe=!!x.map,pt=!!x.matcap,Ne=!!z,Ze=!!x.aoMap,lt=!!x.lightMap,be=!!x.bumpMap,mt=!!x.normalMap,D=!!x.displacementMap,nt=!!x.emissiveMap,Ke=!!x.metalnessMap,et=!!x.roughnessMap,Se=x.anisotropy>0,C=x.clearcoat>0,v=x.dispersion>0,F=x.iridescence>0,J=x.sheen>0,Q=x.transmission>0,Z=Se&&!!x.anisotropyMap,Pe=C&&!!x.clearcoatMap,ue=C&&!!x.clearcoatNormalMap,pe=C&&!!x.clearcoatRoughnessMap,De=F&&!!x.iridescenceMap,ne=F&&!!x.iridescenceThicknessMap,fe=J&&!!x.sheenColorMap,Ae=J&&!!x.sheenRoughnessMap,Ce=!!x.specularMap,le=!!x.specularColorMap,Ge=!!x.specularIntensityMap,L=Q&&!!x.transmissionMap,me=Q&&!!x.thicknessMap,ae=!!x.gradientMap,xe=!!x.alphaMap,re=x.alphaTest>0,te=!!x.alphaHash,he=!!x.extensions,ze=zn;x.toneMapped&&(ee===null||ee.isXRRenderTarget===!0)&&(ze=r.toneMapping);let ut={shaderID:ce,shaderType:x.type,shaderName:x.name,vertexShader:Ue,fragmentShader:ke,defines:x.defines,customVertexShaderID:Oe,customFragmentShaderID:Y,isRawShaderMaterial:x.isRawShaderMaterial===!0,glslVersion:x.glslVersion,precision:f,batching:Me,batchingColor:Me&&N._colorsTexture!==null,instancing:ye,instancingColor:ye&&N.instanceColor!==null,instancingMorph:ye&&N.morphTexture!==null,outputColorSpace:ee===null?r.outputColorSpace:ee.isXRRenderTarget===!0?ee.texture.colorSpace:Cr,alphaToCoverage:!!x.alphaToCoverage,map:Xe,matcap:pt,envMap:Ne,envMapMode:Ne&&z.mapping,envMapCubeUVHeight:$,aoMap:Ze,lightMap:lt,bumpMap:be,normalMap:mt,displacementMap:D,emissiveMap:nt,normalMapObjectSpace:mt&&x.normalMapType===xf,normalMapTangentSpace:mt&&x.normalMapType===_f,metalnessMap:Ke,roughnessMap:et,anisotropy:Se,anisotropyMap:Z,clearcoat:C,clearcoatMap:Pe,clearcoatNormalMap:ue,clearcoatRoughnessMap:pe,dispersion:v,iridescence:F,iridescenceMap:De,iridescenceThicknessMap:ne,sheen:J,sheenColorMap:fe,sheenRoughnessMap:Ae,specularMap:Ce,specularColorMap:le,specularIntensityMap:Ge,transmission:Q,transmissionMap:L,thicknessMap:me,gradientMap:ae,opaque:x.transparent===!1&&x.blending===Ar&&x.alphaToCoverage===!1,alphaMap:xe,alphaTest:re,alphaHash:te,combine:x.combine,mapUv:Xe&&g(x.map.channel),aoMapUv:Ze&&g(x.aoMap.channel),lightMapUv:lt&&g(x.lightMap.channel),bumpMapUv:be&&g(x.bumpMap.channel),normalMapUv:mt&&g(x.normalMap.channel),displacementMapUv:D&&g(x.displacementMap.channel),emissiveMapUv:nt&&g(x.emissiveMap.channel),metalnessMapUv:Ke&&g(x.metalnessMap.channel),roughnessMapUv:et&&g(x.roughnessMap.channel),anisotropyMapUv:Z&&g(x.anisotropyMap.channel),clearcoatMapUv:Pe&&g(x.clearcoatMap.channel),clearcoatNormalMapUv:ue&&g(x.clearcoatNormalMap.channel),clearcoatRoughnessMapUv:pe&&g(x.clearcoatRoughnessMap.channel),iridescenceMapUv:De&&g(x.iridescenceMap.channel),iridescenceThicknessMapUv:ne&&g(x.iridescenceThicknessMap.channel),sheenColorMapUv:fe&&g(x.sheenColorMap.channel),sheenRoughnessMapUv:Ae&&g(x.sheenRoughnessMap.channel),specularMapUv:Ce&&g(x.specularMap.channel),specularColorMapUv:le&&g(x.specularColorMap.channel),specularIntensityMapUv:Ge&&g(x.specularIntensityMap.channel),transmissionMapUv:L&&g(x.transmissionMap.channel),thicknessMapUv:me&&g(x.thicknessMap.channel),alphaMapUv:xe&&g(x.alphaMap.channel),vertexTangents:!!V.attributes.tangent&&(mt||Se),vertexColors:x.vertexColors,vertexAlphas:x.vertexColors===!0&&!!V.attributes.color&&V.attributes.color.itemSize===4,pointsUvs:N.isPoints===!0&&!!V.attributes.uv&&(Xe||xe),fog:!!k,useFog:x.fog===!0,fogExp2:!!k&&k.isFogExp2,flatShading:x.flatShading===!0&&x.wireframe===!1,sizeAttenuation:x.sizeAttenuation===!0,logarithmicDepthBuffer:d,reversedDepthBuffer:_e,skinning:N.isSkinnedMesh===!0,morphTargets:V.morphAttributes.position!==void 0,morphNormals:V.morphAttributes.normal!==void 0,morphColors:V.morphAttributes.color!==void 0,morphTargetsCount:ie,morphTextureStride:Re,numDirLights:T.directional.length,numPointLights:T.point.length,numSpotLights:T.spot.length,numSpotLightMaps:T.spotLightMap.length,numRectAreaLights:T.rectArea.length,numHemiLights:T.hemi.length,numDirLightShadows:T.directionalShadowMap.length,numPointLightShadows:T.pointShadowMap.length,numSpotLightShadows:T.spotShadowMap.length,numSpotLightShadowsWithMaps:T.numSpotLightShadowsWithMaps,numLightProbes:T.numLightProbes,numClippingPlanes:a.numPlanes,numClipIntersection:a.numIntersection,dithering:x.dithering,shadowMapEnabled:r.shadowMap.enabled&&I.length>0,shadowMapType:r.shadowMap.type,toneMapping:ze,decodeVideoTexture:Xe&&x.map.isVideoTexture===!0&&tt.getTransfer(x.map.colorSpace)===ct,decodeVideoTextureEmissive:nt&&x.emissiveMap.isVideoTexture===!0&&tt.getTransfer(x.emissiveMap.colorSpace)===ct,premultipliedAlpha:x.premultipliedAlpha,doubleSided:x.side===ei,flipSided:x.side===on,useDepthPacking:x.depthPacking>=0,depthPacking:x.depthPacking||0,index0AttributeName:x.index0AttributeName,extensionClipCullDistance:he&&x.extensions.clipCullDistance===!0&&n.has("WEBGL_clip_cull_distance"),extensionMultiDraw:(he&&x.extensions.multiDraw===!0||Me)&&n.has("WEBGL_multi_draw"),rendererExtensionParallelShaderCompile:n.has("KHR_parallel_shader_compile"),customProgramCacheKey:x.customProgramCacheKey()};return ut.vertexUv1s=l.has(1),ut.vertexUv2s=l.has(2),ut.vertexUv3s=l.has(3),l.clear(),ut}function p(x){let T=[];if(x.shaderID?T.push(x.shaderID):(T.push(x.customVertexShaderID),T.push(x.customFragmentShaderID)),x.defines!==void 0)for(let I in x.defines)T.push(I),T.push(x.defines[I]);return x.isRawShaderMaterial===!1&&(y(T,x),w(T,x),T.push(r.outputColorSpace)),T.push(x.customProgramCacheKey),T.join()}function y(x,T){x.push(T.precision),x.push(T.outputColorSpace),x.push(T.envMapMode),x.push(T.envMapCubeUVHeight),x.push(T.mapUv),x.push(T.alphaMapUv),x.push(T.lightMapUv),x.push(T.aoMapUv),x.push(T.bumpMapUv),x.push(T.normalMapUv),x.push(T.displacementMapUv),x.push(T.emissiveMapUv),x.push(T.metalnessMapUv),x.push(T.roughnessMapUv),x.push(T.anisotropyMapUv),x.push(T.clearcoatMapUv),x.push(T.clearcoatNormalMapUv),x.push(T.clearcoatRoughnessMapUv),x.push(T.iridescenceMapUv),x.push(T.iridescenceThicknessMapUv),x.push(T.sheenColorMapUv),x.push(T.sheenRoughnessMapUv),x.push(T.specularMapUv),x.push(T.specularColorMapUv),x.push(T.specularIntensityMapUv),x.push(T.transmissionMapUv),x.push(T.thicknessMapUv),x.push(T.combine),x.push(T.fogExp2),x.push(T.sizeAttenuation),x.push(T.morphTargetsCount),x.push(T.morphAttributeCount),x.push(T.numDirLights),x.push(T.numPointLights),x.push(T.numSpotLights),x.push(T.numSpotLightMaps),x.push(T.numHemiLights),x.push(T.numRectAreaLights),x.push(T.numDirLightShadows),x.push(T.numPointLightShadows),x.push(T.numSpotLightShadows),x.push(T.numSpotLightShadowsWithMaps),x.push(T.numLightProbes),x.push(T.shadowMapType),x.push(T.toneMapping),x.push(T.numClippingPlanes),x.push(T.numClipIntersection),x.push(T.depthPacking)}function w(x,T){o.disableAll(),T.instancing&&o.enable(0),T.instancingColor&&o.enable(1),T.instancingMorph&&o.enable(2),T.matcap&&o.enable(3),T.envMap&&o.enable(4),T.normalMapObjectSpace&&o.enable(5),T.normalMapTangentSpace&&o.enable(6),T.clearcoat&&o.enable(7),T.iridescence&&o.enable(8),T.alphaTest&&o.enable(9),T.vertexColors&&o.enable(10),T.vertexAlphas&&o.enable(11),T.vertexUv1s&&o.enable(12),T.vertexUv2s&&o.enable(13),T.vertexUv3s&&o.enable(14),T.vertexTangents&&o.enable(15),T.anisotropy&&o.enable(16),T.alphaHash&&o.enable(17),T.batching&&o.enable(18),T.dispersion&&o.enable(19),T.batchingColor&&o.enable(20),T.gradientMap&&o.enable(21),x.push(o.mask),o.disableAll(),T.fog&&o.enable(0),T.useFog&&o.enable(1),T.flatShading&&o.enable(2),T.logarithmicDepthBuffer&&o.enable(3),T.reversedDepthBuffer&&o.enable(4),T.skinning&&o.enable(5),T.morphTargets&&o.enable(6),T.morphNormals&&o.enable(7),T.morphColors&&o.enable(8),T.premultipliedAlpha&&o.enable(9),T.shadowMapEnabled&&o.enable(10),T.doubleSided&&o.enable(11),T.flipSided&&o.enable(12),T.useDepthPacking&&o.enable(13),T.dithering&&o.enable(14),T.transmission&&o.enable(15),T.sheen&&o.enable(16),T.opaque&&o.enable(17),T.pointsUvs&&o.enable(18),T.decodeVideoTexture&&o.enable(19),T.decodeVideoTextureEmissive&&o.enable(20),T.alphaToCoverage&&o.enable(21),x.push(o.mask)}function S(x){let T=_[x.type],I;if(T){let B=si[T];I=Cf.clone(B.uniforms)}else I=x.uniforms;return I}function M(x,T){let I=h.get(T);return I!==void 0?++I.usedTimes:(I=new fy(r,T,x,s),u.push(I),h.set(T,I)),I}function A(x){if(--x.usedTimes===0){let T=u.indexOf(x);u[T]=u[u.length-1],u.pop(),h.delete(x.cacheKey),x.destroy()}}function E(x){c.remove(x)}function R(){c.dispose()}return{getParameters:m,getProgramCacheKey:p,getUniforms:S,acquireProgram:M,releaseProgram:A,releaseShaderCache:E,programs:u,dispose:R}}function gy(){let r=new WeakMap;function e(a){return r.has(a)}function t(a){let o=r.get(a);return o===void 0&&(o={},r.set(a,o)),o}function n(a){r.delete(a)}function i(a,o,c){r.get(a)[o]=c}function s(){r=new WeakMap}return{has:e,get:t,remove:n,update:i,dispose:s}}function _y(r,e){return r.groupOrder!==e.groupOrder?r.groupOrder-e.groupOrder:r.renderOrder!==e.renderOrder?r.renderOrder-e.renderOrder:r.material.id!==e.material.id?r.material.id-e.material.id:r.z!==e.z?r.z-e.z:r.id-e.id}function Zf(r,e){return r.groupOrder!==e.groupOrder?r.groupOrder-e.groupOrder:r.renderOrder!==e.renderOrder?r.renderOrder-e.renderOrder:r.z!==e.z?e.z-r.z:r.id-e.id}function Jf(){let r=[],e=0,t=[],n=[],i=[];function s(){e=0,t.length=0,n.length=0,i.length=0}function a(h,d,f,_,g,m){let p=r[e];return p===void 0?(p={id:h.id,object:h,geometry:d,material:f,groupOrder:_,renderOrder:h.renderOrder,z:g,group:m},r[e]=p):(p.id=h.id,p.object=h,p.geometry=d,p.material=f,p.groupOrder=_,p.renderOrder=h.renderOrder,p.z=g,p.group=m),e++,p}function o(h,d,f,_,g,m){let p=a(h,d,f,_,g,m);f.transmission>0?n.push(p):f.transparent===!0?i.push(p):t.push(p)}function c(h,d,f,_,g,m){let p=a(h,d,f,_,g,m);f.transmission>0?n.unshift(p):f.transparent===!0?i.unshift(p):t.unshift(p)}function l(h,d){t.length>1&&t.sort(h||_y),n.length>1&&n.sort(d||Zf),i.length>1&&i.sort(d||Zf)}function u(){for(let h=e,d=r.length;h<d;h++){let f=r[h];if(f.id===null)break;f.id=null,f.object=null,f.geometry=null,f.material=null,f.group=null}}return{opaque:t,transmissive:n,transparent:i,init:s,push:o,unshift:c,finish:u,sort:l}}function xy(){let r=new WeakMap;function e(n,i){let s=r.get(n),a;return s===void 0?(a=new Jf,r.set(n,[a])):i>=s.length?(a=new Jf,s.push(a)):a=s[i],a}function t(){r=new WeakMap}return{get:e,dispose:t}}function vy(){let r={};return{get:function(e){if(r[e.id]!==void 0)return r[e.id];let t;switch(e.type){case"DirectionalLight":t={direction:new W,color:new it};break;case"SpotLight":t={position:new W,direction:new W,color:new it,distance:0,coneCos:0,penumbraCos:0,decay:0};break;case"PointLight":t={position:new W,color:new it,distance:0,decay:0};break;case"HemisphereLight":t={direction:new W,skyColor:new it,groundColor:new it};break;case"RectAreaLight":t={color:new it,position:new W,halfWidth:new W,halfHeight:new W};break}return r[e.id]=t,t}}}function yy(){let r={};return{get:function(e){if(r[e.id]!==void 0)return r[e.id];let t;switch(e.type){case"DirectionalLight":t={shadowIntensity:1,shadowBias:0,shadowNormalBias:0,shadowRadius:1,shadowMapSize:new st};break;case"SpotLight":t={shadowIntensity:1,shadowBias:0,shadowNormalBias:0,shadowRadius:1,shadowMapSize:new st};break;case"PointLight":t={shadowIntensity:1,shadowBias:0,shadowNormalBias:0,shadowRadius:1,shadowMapSize:new st,shadowCameraNear:1,shadowCameraFar:1e3};break}return r[e.id]=t,t}}}var by=0;function My(r,e){return(e.castShadow?2:0)-(r.castShadow?2:0)+(e.map?1:0)-(r.map?1:0)}function Sy(r){let e=new vy,t=yy(),n={version:0,hash:{directionalLength:-1,pointLength:-1,spotLength:-1,rectAreaLength:-1,hemiLength:-1,numDirectionalShadows:-1,numPointShadows:-1,numSpotShadows:-1,numSpotMaps:-1,numLightProbes:-1},ambient:[0,0,0],probe:[],directional:[],directionalShadow:[],directionalShadowMap:[],directionalShadowMatrix:[],spot:[],spotLightMap:[],spotShadow:[],spotShadowMap:[],spotLightMatrix:[],rectArea:[],rectAreaLTC1:null,rectAreaLTC2:null,point:[],pointShadow:[],pointShadowMap:[],pointShadowMatrix:[],hemi:[],numSpotLightShadowsWithMaps:0,numLightProbes:0};for(let l=0;l<9;l++)n.probe.push(new W);let i=new W,s=new At,a=new At;function o(l){let u=0,h=0,d=0;for(let x=0;x<9;x++)n.probe[x].set(0,0,0);let f=0,_=0,g=0,m=0,p=0,y=0,w=0,S=0,M=0,A=0,E=0;l.sort(My);for(let x=0,T=l.length;x<T;x++){let I=l[x],B=I.color,N=I.intensity,k=I.distance,V=null;if(I.shadow&&I.shadow.map&&(I.shadow.map.texture.format===Lr?V=I.shadow.map.texture:V=I.shadow.map.depthTexture||I.shadow.map.texture),I.isAmbientLight)u+=B.r*N,h+=B.g*N,d+=B.b*N;else if(I.isLightProbe){for(let O=0;O<9;O++)n.probe[O].addScaledVector(I.sh.coefficients[O],N);E++}else if(I.isDirectionalLight){let O=e.get(I);if(O.color.copy(I.color).multiplyScalar(I.intensity),I.castShadow){let z=I.shadow,$=t.get(I);$.shadowIntensity=z.intensity,$.shadowBias=z.bias,$.shadowNormalBias=z.normalBias,$.shadowRadius=z.radius,$.shadowMapSize=z.mapSize,n.directionalShadow[f]=$,n.directionalShadowMap[f]=V,n.directionalShadowMatrix[f]=I.shadow.matrix,y++}n.directional[f]=O,f++}else if(I.isSpotLight){let O=e.get(I);O.position.setFromMatrixPosition(I.matrixWorld),O.color.copy(B).multiplyScalar(N),O.distance=k,O.coneCos=Math.cos(I.angle),O.penumbraCos=Math.cos(I.angle*(1-I.penumbra)),O.decay=I.decay,n.spot[g]=O;let z=I.shadow;if(I.map&&(n.spotLightMap[M]=I.map,M++,z.updateMatrices(I),I.castShadow&&A++),n.spotLightMatrix[g]=z.matrix,I.castShadow){let $=t.get(I);$.shadowIntensity=z.intensity,$.shadowBias=z.bias,$.shadowNormalBias=z.normalBias,$.shadowRadius=z.radius,$.shadowMapSize=z.mapSize,n.spotShadow[g]=$,n.spotShadowMap[g]=V,S++}g++}else if(I.isRectAreaLight){let O=e.get(I);O.color.copy(B).multiplyScalar(N),O.halfWidth.set(I.width*.5,0,0),O.halfHeight.set(0,I.height*.5,0),n.rectArea[m]=O,m++}else if(I.isPointLight){let O=e.get(I);if(O.color.copy(I.color).multiplyScalar(I.intensity),O.distance=I.distance,O.decay=I.decay,I.castShadow){let z=I.shadow,$=t.get(I);$.shadowIntensity=z.intensity,$.shadowBias=z.bias,$.shadowNormalBias=z.normalBias,$.shadowRadius=z.radius,$.shadowMapSize=z.mapSize,$.shadowCameraNear=z.camera.near,$.shadowCameraFar=z.camera.far,n.pointShadow[_]=$,n.pointShadowMap[_]=V,n.pointShadowMatrix[_]=I.shadow.matrix,w++}n.point[_]=O,_++}else if(I.isHemisphereLight){let O=e.get(I);O.skyColor.copy(I.color).multiplyScalar(N),O.groundColor.copy(I.groundColor).multiplyScalar(N),n.hemi[p]=O,p++}}m>0&&(r.has("OES_texture_float_linear")===!0?(n.rectAreaLTC1=ge.LTC_FLOAT_1,n.rectAreaLTC2=ge.LTC_FLOAT_2):(n.rectAreaLTC1=ge.LTC_HALF_1,n.rectAreaLTC2=ge.LTC_HALF_2)),n.ambient[0]=u,n.ambient[1]=h,n.ambient[2]=d;let R=n.hash;(R.directionalLength!==f||R.pointLength!==_||R.spotLength!==g||R.rectAreaLength!==m||R.hemiLength!==p||R.numDirectionalShadows!==y||R.numPointShadows!==w||R.numSpotShadows!==S||R.numSpotMaps!==M||R.numLightProbes!==E)&&(n.directional.length=f,n.spot.length=g,n.rectArea.length=m,n.point.length=_,n.hemi.length=p,n.directionalShadow.length=y,n.directionalShadowMap.length=y,n.pointShadow.length=w,n.pointShadowMap.length=w,n.spotShadow.length=S,n.spotShadowMap.length=S,n.directionalShadowMatrix.length=y,n.pointShadowMatrix.length=w,n.spotLightMatrix.length=S+M-A,n.spotLightMap.length=M,n.numSpotLightShadowsWithMaps=A,n.numLightProbes=E,R.directionalLength=f,R.pointLength=_,R.spotLength=g,R.rectAreaLength=m,R.hemiLength=p,R.numDirectionalShadows=y,R.numPointShadows=w,R.numSpotShadows=S,R.numSpotMaps=M,R.numLightProbes=E,n.version=by++)}function c(l,u){let h=0,d=0,f=0,_=0,g=0,m=u.matrixWorldInverse;for(let p=0,y=l.length;p<y;p++){let w=l[p];if(w.isDirectionalLight){let S=n.directional[h];S.direction.setFromMatrixPosition(w.matrixWorld),i.setFromMatrixPosition(w.target.matrixWorld),S.direction.sub(i),S.direction.transformDirection(m),h++}else if(w.isSpotLight){let S=n.spot[f];S.position.setFromMatrixPosition(w.matrixWorld),S.position.applyMatrix4(m),S.direction.setFromMatrixPosition(w.matrixWorld),i.setFromMatrixPosition(w.target.matrixWorld),S.direction.sub(i),S.direction.transformDirection(m),f++}else if(w.isRectAreaLight){let S=n.rectArea[_];S.position.setFromMatrixPosition(w.matrixWorld),S.position.applyMatrix4(m),a.identity(),s.copy(w.matrixWorld),s.premultiply(m),a.extractRotation(s),S.halfWidth.set(w.width*.5,0,0),S.halfHeight.set(0,w.height*.5,0),S.halfWidth.applyMatrix4(a),S.halfHeight.applyMatrix4(a),_++}else if(w.isPointLight){let S=n.point[d];S.position.setFromMatrixPosition(w.matrixWorld),S.position.applyMatrix4(m),d++}else if(w.isHemisphereLight){let S=n.hemi[g];S.direction.setFromMatrixPosition(w.matrixWorld),S.direction.transformDirection(m),g++}}}return{setup:o,setupView:c,state:n}}function $f(r){let e=new Sy(r),t=[],n=[];function i(u){l.camera=u,t.length=0,n.length=0}function s(u){t.push(u)}function a(u){n.push(u)}function o(){e.setup(t)}function c(u){e.setupView(t,u)}let l={lightsArray:t,shadowsArray:n,camera:null,lights:e,transmissionRenderTarget:{}};return{init:i,state:l,setupLights:o,setupLightsView:c,pushLight:s,pushShadow:a}}function wy(r){let e=new WeakMap;function t(i,s=0){let a=e.get(i),o;return a===void 0?(o=new $f(r),e.set(i,[o])):s>=a.length?(o=new $f(r),a.push(o)):o=a[s],o}function n(){e=new WeakMap}return{get:t,dispose:n}}var Ty=`void main() {
	gl_Position = vec4( position, 1.0 );
}`,Ay=`uniform sampler2D shadow_pass;
uniform vec2 resolution;
uniform float radius;
void main() {
	const float samples = float( VSM_SAMPLES );
	float mean = 0.0;
	float squared_mean = 0.0;
	float uvStride = samples <= 1.0 ? 0.0 : 2.0 / ( samples - 1.0 );
	float uvStart = samples <= 1.0 ? 0.0 : - 1.0;
	for ( float i = 0.0; i < samples; i ++ ) {
		float uvOffset = uvStart + i * uvStride;
		#ifdef HORIZONTAL_PASS
			vec2 distribution = texture2D( shadow_pass, ( gl_FragCoord.xy + vec2( uvOffset, 0.0 ) * radius ) / resolution ).rg;
			mean += distribution.x;
			squared_mean += distribution.y * distribution.y + distribution.x * distribution.x;
		#else
			float depth = texture2D( shadow_pass, ( gl_FragCoord.xy + vec2( 0.0, uvOffset ) * radius ) / resolution ).r;
			mean += depth;
			squared_mean += depth * depth;
		#endif
	}
	mean = mean / samples;
	squared_mean = squared_mean / samples;
	float std_dev = sqrt( max( 0.0, squared_mean - mean * mean ) );
	gl_FragColor = vec4( mean, std_dev, 0.0, 1.0 );
}`,Ey=[new W(1,0,0),new W(-1,0,0),new W(0,1,0),new W(0,-1,0),new W(0,0,1),new W(0,0,-1)],Cy=[new W(0,-1,0),new W(0,-1,0),new W(0,0,1),new W(0,0,-1),new W(0,-1,0),new W(0,-1,0)],Kf=new At,Ea=new W,nh=new W;function Ry(r,e,t){let n=new pa,i=new st,s=new st,a=new St,o=new Lo,c=new No,l={},u=t.maxTextureSize,h={[Mi]:on,[on]:Mi,[ei]:ei},d=new an({defines:{VSM_SAMPLES:8},uniforms:{shadow_pass:{value:null},resolution:{value:new st},radius:{value:4}},vertexShader:Ty,fragmentShader:Ay}),f=d.clone();f.defines.HORIZONTAL_PASS=1;let _=new jn;_.setAttribute("position",new Sn(new Float32Array([-1,-1,.5,3,-1,.5,-1,3,.5]),3));let g=new sn(_,d),m=this;this.enabled=!1,this.autoUpdate=!0,this.needsUpdate=!1,this.type=xa;let p=this.type;this.render=function(A,E,R){if(m.enabled===!1||m.autoUpdate===!1&&m.needsUpdate===!1||A.length===0)return;A.type===Yd&&(Ve("WebGLShadowMap: PCFSoftShadowMap has been deprecated. Using PCFShadowMap instead."),A.type=xa);let x=r.getRenderTarget(),T=r.getActiveCubeFace(),I=r.getActiveMipmapLevel(),B=r.state;B.setBlending(ti),B.buffers.depth.getReversed()===!0?B.buffers.color.setClear(0,0,0,0):B.buffers.color.setClear(1,1,1,1),B.buffers.depth.setTest(!0),B.setScissorTest(!1);let N=p!==this.type;N&&E.traverse(function(k){k.material&&(Array.isArray(k.material)?k.material.forEach(V=>V.needsUpdate=!0):k.material.needsUpdate=!0)});for(let k=0,V=A.length;k<V;k++){let O=A[k],z=O.shadow;if(z===void 0){Ve("WebGLShadowMap:",O,"has no shadow.");continue}if(z.autoUpdate===!1&&z.needsUpdate===!1)continue;i.copy(z.mapSize);let $=z.getFrameExtents();if(i.multiply($),s.copy(z.mapSize),(i.x>u||i.y>u)&&(i.x>u&&(s.x=Math.floor(u/$.x),i.x=s.x*$.x,z.mapSize.x=s.x),i.y>u&&(s.y=Math.floor(u/$.y),i.y=s.y*$.y,z.mapSize.y=s.y)),z.map===null||N===!0){if(z.map!==null&&(z.map.depthTexture!==null&&(z.map.depthTexture.dispose(),z.map.depthTexture=null),z.map.dispose()),this.type===Ss){if(O.isPointLight){Ve("WebGLShadowMap: VSM shadow maps are not supported for PointLights. Use PCF or BasicShadowMap instead.");continue}z.map=new rn(i.x,i.y,{format:Lr,type:ii,minFilter:Rt,magFilter:Rt,generateMipmaps:!1}),z.map.texture.name=O.name+".shadowMap",z.map.depthTexture=new $i(i.x,i.y,Gn),z.map.depthTexture.name=O.name+".shadowMapDepth",z.map.depthTexture.format=Kn,z.map.depthTexture.compareFunction=null,z.map.depthTexture.minFilter=Ot,z.map.depthTexture.magFilter=Ot}else{O.isPointLight?(z.map=new fa(i.x),z.map.depthTexture=new Io(i.x,Vn)):(z.map=new rn(i.x,i.y),z.map.depthTexture=new $i(i.x,i.y,Vn)),z.map.depthTexture.name=O.name+".shadowMap",z.map.depthTexture.format=Kn;let q=r.state.buffers.depth.getReversed();this.type===xa?(z.map.depthTexture.compareFunction=q?zl:kl,z.map.depthTexture.minFilter=Rt,z.map.depthTexture.magFilter=Rt):(z.map.depthTexture.compareFunction=null,z.map.depthTexture.minFilter=Ot,z.map.depthTexture.magFilter=Ot)}z.camera.updateProjectionMatrix()}let ce=z.map.isWebGLCubeRenderTarget?6:1;for(let q=0;q<ce;q++){if(z.map.isWebGLCubeRenderTarget)r.setRenderTarget(z.map,q),r.clear();else{q===0&&(r.setRenderTarget(z.map),r.clear());let ie=z.getViewport(q);a.set(s.x*ie.x,s.y*ie.y,s.x*ie.z,s.y*ie.w),B.viewport(a)}if(O.isPointLight){let ie=z.camera,Re=z.matrix,Ue=O.distance||ie.far;Ue!==ie.far&&(ie.far=Ue,ie.updateProjectionMatrix()),Ea.setFromMatrixPosition(O.matrixWorld),ie.position.copy(Ea),nh.copy(ie.position),nh.add(Ey[q]),ie.up.copy(Cy[q]),ie.lookAt(nh),ie.updateMatrixWorld(),Re.makeTranslation(-Ea.x,-Ea.y,-Ea.z),Kf.multiplyMatrices(ie.projectionMatrix,ie.matrixWorldInverse),z._frustum.setFromProjectionMatrix(Kf,ie.coordinateSystem,ie.reversedDepth)}else z.updateMatrices(O);n=z.getFrustum(),S(E,R,z.camera,O,this.type)}z.isPointLightShadow!==!0&&this.type===Ss&&y(z,R),z.needsUpdate=!1}p=this.type,m.needsUpdate=!1,r.setRenderTarget(x,T,I)};function y(A,E){let R=e.update(g);d.defines.VSM_SAMPLES!==A.blurSamples&&(d.defines.VSM_SAMPLES=A.blurSamples,f.defines.VSM_SAMPLES=A.blurSamples,d.needsUpdate=!0,f.needsUpdate=!0),A.mapPass===null&&(A.mapPass=new rn(i.x,i.y,{format:Lr,type:ii})),d.uniforms.shadow_pass.value=A.map.depthTexture,d.uniforms.resolution.value=A.mapSize,d.uniforms.radius.value=A.radius,r.setRenderTarget(A.mapPass),r.clear(),r.renderBufferDirect(E,null,R,d,g,null),f.uniforms.shadow_pass.value=A.mapPass.texture,f.uniforms.resolution.value=A.mapSize,f.uniforms.radius.value=A.radius,r.setRenderTarget(A.map),r.clear(),r.renderBufferDirect(E,null,R,f,g,null)}function w(A,E,R,x){let T=null,I=R.isPointLight===!0?A.customDistanceMaterial:A.customDepthMaterial;if(I!==void 0)T=I;else if(T=R.isPointLight===!0?c:o,r.localClippingEnabled&&E.clipShadows===!0&&Array.isArray(E.clippingPlanes)&&E.clippingPlanes.length!==0||E.displacementMap&&E.displacementScale!==0||E.alphaMap&&E.alphaTest>0||E.map&&E.alphaTest>0||E.alphaToCoverage===!0){let B=T.uuid,N=E.uuid,k=l[B];k===void 0&&(k={},l[B]=k);let V=k[N];V===void 0&&(V=T.clone(),k[N]=V,E.addEventListener("dispose",M)),T=V}if(T.visible=E.visible,T.wireframe=E.wireframe,x===Ss?T.side=E.shadowSide!==null?E.shadowSide:E.side:T.side=E.shadowSide!==null?E.shadowSide:h[E.side],T.alphaMap=E.alphaMap,T.alphaTest=E.alphaToCoverage===!0?.5:E.alphaTest,T.map=E.map,T.clipShadows=E.clipShadows,T.clippingPlanes=E.clippingPlanes,T.clipIntersection=E.clipIntersection,T.displacementMap=E.displacementMap,T.displacementScale=E.displacementScale,T.displacementBias=E.displacementBias,T.wireframeLinewidth=E.wireframeLinewidth,T.linewidth=E.linewidth,R.isPointLight===!0&&T.isMeshDistanceMaterial===!0){let B=r.properties.get(T);B.light=R}return T}function S(A,E,R,x,T){if(A.visible===!1)return;if(A.layers.test(E.layers)&&(A.isMesh||A.isLine||A.isPoints)&&(A.castShadow||A.receiveShadow&&T===Ss)&&(!A.frustumCulled||n.intersectsObject(A))){A.modelViewMatrix.multiplyMatrices(R.matrixWorldInverse,A.matrixWorld);let N=e.update(A),k=A.material;if(Array.isArray(k)){let V=N.groups;for(let O=0,z=V.length;O<z;O++){let $=V[O],ce=k[$.materialIndex];if(ce&&ce.visible){let q=w(A,ce,x,T);A.onBeforeShadow(r,A,E,R,N,q,$),r.renderBufferDirect(R,null,N,q,A,$),A.onAfterShadow(r,A,E,R,N,q,$)}}}else if(k.visible){let V=w(A,k,x,T);A.onBeforeShadow(r,A,E,R,N,V,null),r.renderBufferDirect(R,null,N,V,A,null),A.onAfterShadow(r,A,E,R,N,V,null)}}let B=A.children;for(let N=0,k=B.length;N<k;N++)S(B[N],E,R,x,T)}function M(A){A.target.removeEventListener("dispose",M);for(let R in l){let x=l[R],T=A.target.uuid;T in x&&(x[T].dispose(),delete x[T])}}}var Py={[Xo]:qo,[Yo]:$o,[Zo]:Ko,[Er]:Jo,[qo]:Xo,[$o]:Yo,[Ko]:Zo,[Jo]:Er};function Iy(r,e){function t(){let L=!1,me=new St,ae=null,xe=new St(0,0,0,0);return{setMask:function(re){ae!==re&&!L&&(r.colorMask(re,re,re,re),ae=re)},setLocked:function(re){L=re},setClear:function(re,te,he,ze,ut){ut===!0&&(re*=ze,te*=ze,he*=ze),me.set(re,te,he,ze),xe.equals(me)===!1&&(r.clearColor(re,te,he,ze),xe.copy(me))},reset:function(){L=!1,ae=null,xe.set(-1,0,0,0)}}}function n(){let L=!1,me=!1,ae=null,xe=null,re=null;return{setReversed:function(te){if(me!==te){let he=e.get("EXT_clip_control");te?he.clipControlEXT(he.LOWER_LEFT_EXT,he.ZERO_TO_ONE_EXT):he.clipControlEXT(he.LOWER_LEFT_EXT,he.NEGATIVE_ONE_TO_ONE_EXT),me=te;let ze=re;re=null,this.setClear(ze)}},getReversed:function(){return me},setTest:function(te){te?ee(r.DEPTH_TEST):_e(r.DEPTH_TEST)},setMask:function(te){ae!==te&&!L&&(r.depthMask(te),ae=te)},setFunc:function(te){if(me&&(te=Py[te]),xe!==te){switch(te){case Xo:r.depthFunc(r.NEVER);break;case qo:r.depthFunc(r.ALWAYS);break;case Yo:r.depthFunc(r.LESS);break;case Er:r.depthFunc(r.LEQUAL);break;case Zo:r.depthFunc(r.EQUAL);break;case Jo:r.depthFunc(r.GEQUAL);break;case $o:r.depthFunc(r.GREATER);break;case Ko:r.depthFunc(r.NOTEQUAL);break;default:r.depthFunc(r.LEQUAL)}xe=te}},setLocked:function(te){L=te},setClear:function(te){re!==te&&(me&&(te=1-te),r.clearDepth(te),re=te)},reset:function(){L=!1,ae=null,xe=null,re=null,me=!1}}}function i(){let L=!1,me=null,ae=null,xe=null,re=null,te=null,he=null,ze=null,ut=null;return{setTest:function(rt){L||(rt?ee(r.STENCIL_TEST):_e(r.STENCIL_TEST))},setMask:function(rt){me!==rt&&!L&&(r.stencilMask(rt),me=rt)},setFunc:function(rt,Jt,$t){(ae!==rt||xe!==Jt||re!==$t)&&(r.stencilFunc(rt,Jt,$t),ae=rt,xe=Jt,re=$t)},setOp:function(rt,Jt,$t){(te!==rt||he!==Jt||ze!==$t)&&(r.stencilOp(rt,Jt,$t),te=rt,he=Jt,ze=$t)},setLocked:function(rt){L=rt},setClear:function(rt){ut!==rt&&(r.clearStencil(rt),ut=rt)},reset:function(){L=!1,me=null,ae=null,xe=null,re=null,te=null,he=null,ze=null,ut=null}}}let s=new t,a=new n,o=new i,c=new WeakMap,l=new WeakMap,u={},h={},d=new WeakMap,f=[],_=null,g=!1,m=null,p=null,y=null,w=null,S=null,M=null,A=null,E=new it(0,0,0),R=0,x=!1,T=null,I=null,B=null,N=null,k=null,V=r.getParameter(r.MAX_COMBINED_TEXTURE_IMAGE_UNITS),O=!1,z=0,$=r.getParameter(r.VERSION);$.indexOf("WebGL")!==-1?(z=parseFloat(/^WebGL (\d)/.exec($)[1]),O=z>=1):$.indexOf("OpenGL ES")!==-1&&(z=parseFloat(/^OpenGL ES (\d)/.exec($)[1]),O=z>=2);let ce=null,q={},ie=r.getParameter(r.SCISSOR_BOX),Re=r.getParameter(r.VIEWPORT),Ue=new St().fromArray(ie),ke=new St().fromArray(Re);function Oe(L,me,ae,xe){let re=new Uint8Array(4),te=r.createTexture();r.bindTexture(L,te),r.texParameteri(L,r.TEXTURE_MIN_FILTER,r.NEAREST),r.texParameteri(L,r.TEXTURE_MAG_FILTER,r.NEAREST);for(let he=0;he<ae;he++)L===r.TEXTURE_3D||L===r.TEXTURE_2D_ARRAY?r.texImage3D(me,0,r.RGBA,1,1,xe,0,r.RGBA,r.UNSIGNED_BYTE,re):r.texImage2D(me+he,0,r.RGBA,1,1,0,r.RGBA,r.UNSIGNED_BYTE,re);return te}let Y={};Y[r.TEXTURE_2D]=Oe(r.TEXTURE_2D,r.TEXTURE_2D,1),Y[r.TEXTURE_CUBE_MAP]=Oe(r.TEXTURE_CUBE_MAP,r.TEXTURE_CUBE_MAP_POSITIVE_X,6),Y[r.TEXTURE_2D_ARRAY]=Oe(r.TEXTURE_2D_ARRAY,r.TEXTURE_2D_ARRAY,1,1),Y[r.TEXTURE_3D]=Oe(r.TEXTURE_3D,r.TEXTURE_3D,1,1),s.setClear(0,0,0,1),a.setClear(1),o.setClear(0),ee(r.DEPTH_TEST),a.setFunc(Er),be(!1),mt(wu),ee(r.CULL_FACE),Ze(ti);function ee(L){u[L]!==!0&&(r.enable(L),u[L]=!0)}function _e(L){u[L]!==!1&&(r.disable(L),u[L]=!1)}function ye(L,me){return h[L]!==me?(r.bindFramebuffer(L,me),h[L]=me,L===r.DRAW_FRAMEBUFFER&&(h[r.FRAMEBUFFER]=me),L===r.FRAMEBUFFER&&(h[r.DRAW_FRAMEBUFFER]=me),!0):!1}function Me(L,me){let ae=f,xe=!1;if(L){ae=d.get(me),ae===void 0&&(ae=[],d.set(me,ae));let re=L.textures;if(ae.length!==re.length||ae[0]!==r.COLOR_ATTACHMENT0){for(let te=0,he=re.length;te<he;te++)ae[te]=r.COLOR_ATTACHMENT0+te;ae.length=re.length,xe=!0}}else ae[0]!==r.BACK&&(ae[0]=r.BACK,xe=!0);xe&&r.drawBuffers(ae)}function Xe(L){return _!==L?(r.useProgram(L),_=L,!0):!1}let pt={[Zi]:r.FUNC_ADD,[Jd]:r.FUNC_SUBTRACT,[$d]:r.FUNC_REVERSE_SUBTRACT};pt[Kd]=r.MIN,pt[Qd]=r.MAX;let Ne={[jd]:r.ZERO,[ef]:r.ONE,[tf]:r.SRC_COLOR,[vo]:r.SRC_ALPHA,[lf]:r.SRC_ALPHA_SATURATE,[af]:r.DST_COLOR,[rf]:r.DST_ALPHA,[nf]:r.ONE_MINUS_SRC_COLOR,[yo]:r.ONE_MINUS_SRC_ALPHA,[of]:r.ONE_MINUS_DST_COLOR,[sf]:r.ONE_MINUS_DST_ALPHA,[cf]:r.CONSTANT_COLOR,[uf]:r.ONE_MINUS_CONSTANT_COLOR,[hf]:r.CONSTANT_ALPHA,[df]:r.ONE_MINUS_CONSTANT_ALPHA};function Ze(L,me,ae,xe,re,te,he,ze,ut,rt){if(L===ti){g===!0&&(_e(r.BLEND),g=!1);return}if(g===!1&&(ee(r.BLEND),g=!0),L!==Zd){if(L!==m||rt!==x){if((p!==Zi||S!==Zi)&&(r.blendEquation(r.FUNC_ADD),p=Zi,S=Zi),rt)switch(L){case Ar:r.blendFuncSeparate(r.ONE,r.ONE_MINUS_SRC_ALPHA,r.ONE,r.ONE_MINUS_SRC_ALPHA);break;case Tu:r.blendFunc(r.ONE,r.ONE);break;case Au:r.blendFuncSeparate(r.ZERO,r.ONE_MINUS_SRC_COLOR,r.ZERO,r.ONE);break;case Eu:r.blendFuncSeparate(r.DST_COLOR,r.ONE_MINUS_SRC_ALPHA,r.ZERO,r.ONE);break;default:Be("WebGLState: Invalid blending: ",L);break}else switch(L){case Ar:r.blendFuncSeparate(r.SRC_ALPHA,r.ONE_MINUS_SRC_ALPHA,r.ONE,r.ONE_MINUS_SRC_ALPHA);break;case Tu:r.blendFuncSeparate(r.SRC_ALPHA,r.ONE,r.ONE,r.ONE);break;case Au:Be("WebGLState: SubtractiveBlending requires material.premultipliedAlpha = true");break;case Eu:Be("WebGLState: MultiplyBlending requires material.premultipliedAlpha = true");break;default:Be("WebGLState: Invalid blending: ",L);break}y=null,w=null,M=null,A=null,E.set(0,0,0),R=0,m=L,x=rt}return}re=re||me,te=te||ae,he=he||xe,(me!==p||re!==S)&&(r.blendEquationSeparate(pt[me],pt[re]),p=me,S=re),(ae!==y||xe!==w||te!==M||he!==A)&&(r.blendFuncSeparate(Ne[ae],Ne[xe],Ne[te],Ne[he]),y=ae,w=xe,M=te,A=he),(ze.equals(E)===!1||ut!==R)&&(r.blendColor(ze.r,ze.g,ze.b,ut),E.copy(ze),R=ut),m=L,x=!1}function lt(L,me){L.side===ei?_e(r.CULL_FACE):ee(r.CULL_FACE);let ae=L.side===on;me&&(ae=!ae),be(ae),L.blending===Ar&&L.transparent===!1?Ze(ti):Ze(L.blending,L.blendEquation,L.blendSrc,L.blendDst,L.blendEquationAlpha,L.blendSrcAlpha,L.blendDstAlpha,L.blendColor,L.blendAlpha,L.premultipliedAlpha),a.setFunc(L.depthFunc),a.setTest(L.depthTest),a.setMask(L.depthWrite),s.setMask(L.colorWrite);let xe=L.stencilWrite;o.setTest(xe),xe&&(o.setMask(L.stencilWriteMask),o.setFunc(L.stencilFunc,L.stencilRef,L.stencilFuncMask),o.setOp(L.stencilFail,L.stencilZFail,L.stencilZPass)),nt(L.polygonOffset,L.polygonOffsetFactor,L.polygonOffsetUnits),L.alphaToCoverage===!0?ee(r.SAMPLE_ALPHA_TO_COVERAGE):_e(r.SAMPLE_ALPHA_TO_COVERAGE)}function be(L){T!==L&&(L?r.frontFace(r.CW):r.frontFace(r.CCW),T=L)}function mt(L){L!==Xd?(ee(r.CULL_FACE),L!==I&&(L===wu?r.cullFace(r.BACK):L===qd?r.cullFace(r.FRONT):r.cullFace(r.FRONT_AND_BACK))):_e(r.CULL_FACE),I=L}function D(L){L!==B&&(O&&r.lineWidth(L),B=L)}function nt(L,me,ae){L?(ee(r.POLYGON_OFFSET_FILL),(N!==me||k!==ae)&&(r.polygonOffset(me,ae),N=me,k=ae)):_e(r.POLYGON_OFFSET_FILL)}function Ke(L){L?ee(r.SCISSOR_TEST):_e(r.SCISSOR_TEST)}function et(L){L===void 0&&(L=r.TEXTURE0+V-1),ce!==L&&(r.activeTexture(L),ce=L)}function Se(L,me,ae){ae===void 0&&(ce===null?ae=r.TEXTURE0+V-1:ae=ce);let xe=q[ae];xe===void 0&&(xe={type:void 0,texture:void 0},q[ae]=xe),(xe.type!==L||xe.texture!==me)&&(ce!==ae&&(r.activeTexture(ae),ce=ae),r.bindTexture(L,me||Y[L]),xe.type=L,xe.texture=me)}function C(){let L=q[ce];L!==void 0&&L.type!==void 0&&(r.bindTexture(L.type,null),L.type=void 0,L.texture=void 0)}function v(){try{r.compressedTexImage2D(...arguments)}catch(L){Be("WebGLState:",L)}}function F(){try{r.compressedTexImage3D(...arguments)}catch(L){Be("WebGLState:",L)}}function J(){try{r.texSubImage2D(...arguments)}catch(L){Be("WebGLState:",L)}}function Q(){try{r.texSubImage3D(...arguments)}catch(L){Be("WebGLState:",L)}}function Z(){try{r.compressedTexSubImage2D(...arguments)}catch(L){Be("WebGLState:",L)}}function Pe(){try{r.compressedTexSubImage3D(...arguments)}catch(L){Be("WebGLState:",L)}}function ue(){try{r.texStorage2D(...arguments)}catch(L){Be("WebGLState:",L)}}function pe(){try{r.texStorage3D(...arguments)}catch(L){Be("WebGLState:",L)}}function De(){try{r.texImage2D(...arguments)}catch(L){Be("WebGLState:",L)}}function ne(){try{r.texImage3D(...arguments)}catch(L){Be("WebGLState:",L)}}function fe(L){Ue.equals(L)===!1&&(r.scissor(L.x,L.y,L.z,L.w),Ue.copy(L))}function Ae(L){ke.equals(L)===!1&&(r.viewport(L.x,L.y,L.z,L.w),ke.copy(L))}function Ce(L,me){let ae=l.get(me);ae===void 0&&(ae=new WeakMap,l.set(me,ae));let xe=ae.get(L);xe===void 0&&(xe=r.getUniformBlockIndex(me,L.name),ae.set(L,xe))}function le(L,me){let xe=l.get(me).get(L);c.get(me)!==xe&&(r.uniformBlockBinding(me,xe,L.__bindingPointIndex),c.set(me,xe))}function Ge(){r.disable(r.BLEND),r.disable(r.CULL_FACE),r.disable(r.DEPTH_TEST),r.disable(r.POLYGON_OFFSET_FILL),r.disable(r.SCISSOR_TEST),r.disable(r.STENCIL_TEST),r.disable(r.SAMPLE_ALPHA_TO_COVERAGE),r.blendEquation(r.FUNC_ADD),r.blendFunc(r.ONE,r.ZERO),r.blendFuncSeparate(r.ONE,r.ZERO,r.ONE,r.ZERO),r.blendColor(0,0,0,0),r.colorMask(!0,!0,!0,!0),r.clearColor(0,0,0,0),r.depthMask(!0),r.depthFunc(r.LESS),a.setReversed(!1),r.clearDepth(1),r.stencilMask(4294967295),r.stencilFunc(r.ALWAYS,0,4294967295),r.stencilOp(r.KEEP,r.KEEP,r.KEEP),r.clearStencil(0),r.cullFace(r.BACK),r.frontFace(r.CCW),r.polygonOffset(0,0),r.activeTexture(r.TEXTURE0),r.bindFramebuffer(r.FRAMEBUFFER,null),r.bindFramebuffer(r.DRAW_FRAMEBUFFER,null),r.bindFramebuffer(r.READ_FRAMEBUFFER,null),r.useProgram(null),r.lineWidth(1),r.scissor(0,0,r.canvas.width,r.canvas.height),r.viewport(0,0,r.canvas.width,r.canvas.height),u={},ce=null,q={},h={},d=new WeakMap,f=[],_=null,g=!1,m=null,p=null,y=null,w=null,S=null,M=null,A=null,E=new it(0,0,0),R=0,x=!1,T=null,I=null,B=null,N=null,k=null,Ue.set(0,0,r.canvas.width,r.canvas.height),ke.set(0,0,r.canvas.width,r.canvas.height),s.reset(),a.reset(),o.reset()}return{buffers:{color:s,depth:a,stencil:o},enable:ee,disable:_e,bindFramebuffer:ye,drawBuffers:Me,useProgram:Xe,setBlending:Ze,setMaterial:lt,setFlipSided:be,setCullFace:mt,setLineWidth:D,setPolygonOffset:nt,setScissorTest:Ke,activeTexture:et,bindTexture:Se,unbindTexture:C,compressedTexImage2D:v,compressedTexImage3D:F,texImage2D:De,texImage3D:ne,updateUBOMapping:Ce,uniformBlockBinding:le,texStorage2D:ue,texStorage3D:pe,texSubImage2D:J,texSubImage3D:Q,compressedTexSubImage2D:Z,compressedTexSubImage3D:Pe,scissor:fe,viewport:Ae,reset:Ge}}function Dy(r,e,t,n,i,s,a){let o=e.has("WEBGL_multisampled_render_to_texture")?e.get("WEBGL_multisampled_render_to_texture"):null,c=typeof navigator>"u"?!1:/OculusBrowser/g.test(navigator.userAgent),l=new st,u=new WeakMap,h,d=new WeakMap,f=!1;try{f=typeof OffscreenCanvas<"u"&&new OffscreenCanvas(1,1).getContext("2d")!==null}catch{}function _(C,v){return f?new OffscreenCanvas(C,v):ps("canvas")}function g(C,v,F){let J=1,Q=Se(C);if((Q.width>F||Q.height>F)&&(J=F/Math.max(Q.width,Q.height)),J<1)if(typeof HTMLImageElement<"u"&&C instanceof HTMLImageElement||typeof HTMLCanvasElement<"u"&&C instanceof HTMLCanvasElement||typeof ImageBitmap<"u"&&C instanceof ImageBitmap||typeof VideoFrame<"u"&&C instanceof VideoFrame){let Z=Math.floor(J*Q.width),Pe=Math.floor(J*Q.height);h===void 0&&(h=_(Z,Pe));let ue=v?_(Z,Pe):h;return ue.width=Z,ue.height=Pe,ue.getContext("2d").drawImage(C,0,0,Z,Pe),Ve("WebGLRenderer: Texture has been resized from ("+Q.width+"x"+Q.height+") to ("+Z+"x"+Pe+")."),ue}else return"data"in C&&Ve("WebGLRenderer: Image in DataTexture is too big ("+Q.width+"x"+Q.height+")."),C;return C}function m(C){return C.generateMipmaps}function p(C){r.generateMipmap(C)}function y(C){return C.isWebGLCubeRenderTarget?r.TEXTURE_CUBE_MAP:C.isWebGL3DRenderTarget?r.TEXTURE_3D:C.isWebGLArrayRenderTarget||C.isCompressedArrayTexture?r.TEXTURE_2D_ARRAY:r.TEXTURE_2D}function w(C,v,F,J,Q=!1){if(C!==null){if(r[C]!==void 0)return r[C];Ve("WebGLRenderer: Attempt to use non-existing WebGL internal format '"+C+"'")}let Z=v;if(v===r.RED&&(F===r.FLOAT&&(Z=r.R32F),F===r.HALF_FLOAT&&(Z=r.R16F),F===r.UNSIGNED_BYTE&&(Z=r.R8)),v===r.RED_INTEGER&&(F===r.UNSIGNED_BYTE&&(Z=r.R8UI),F===r.UNSIGNED_SHORT&&(Z=r.R16UI),F===r.UNSIGNED_INT&&(Z=r.R32UI),F===r.BYTE&&(Z=r.R8I),F===r.SHORT&&(Z=r.R16I),F===r.INT&&(Z=r.R32I)),v===r.RG&&(F===r.FLOAT&&(Z=r.RG32F),F===r.HALF_FLOAT&&(Z=r.RG16F),F===r.UNSIGNED_BYTE&&(Z=r.RG8)),v===r.RG_INTEGER&&(F===r.UNSIGNED_BYTE&&(Z=r.RG8UI),F===r.UNSIGNED_SHORT&&(Z=r.RG16UI),F===r.UNSIGNED_INT&&(Z=r.RG32UI),F===r.BYTE&&(Z=r.RG8I),F===r.SHORT&&(Z=r.RG16I),F===r.INT&&(Z=r.RG32I)),v===r.RGB_INTEGER&&(F===r.UNSIGNED_BYTE&&(Z=r.RGB8UI),F===r.UNSIGNED_SHORT&&(Z=r.RGB16UI),F===r.UNSIGNED_INT&&(Z=r.RGB32UI),F===r.BYTE&&(Z=r.RGB8I),F===r.SHORT&&(Z=r.RGB16I),F===r.INT&&(Z=r.RGB32I)),v===r.RGBA_INTEGER&&(F===r.UNSIGNED_BYTE&&(Z=r.RGBA8UI),F===r.UNSIGNED_SHORT&&(Z=r.RGBA16UI),F===r.UNSIGNED_INT&&(Z=r.RGBA32UI),F===r.BYTE&&(Z=r.RGBA8I),F===r.SHORT&&(Z=r.RGBA16I),F===r.INT&&(Z=r.RGBA32I)),v===r.RGB&&(F===r.UNSIGNED_INT_5_9_9_9_REV&&(Z=r.RGB9_E5),F===r.UNSIGNED_INT_10F_11F_11F_REV&&(Z=r.R11F_G11F_B10F)),v===r.RGBA){let Pe=Q?sa:tt.getTransfer(J);F===r.FLOAT&&(Z=r.RGBA32F),F===r.HALF_FLOAT&&(Z=r.RGBA16F),F===r.UNSIGNED_BYTE&&(Z=Pe===ct?r.SRGB8_ALPHA8:r.RGBA8),F===r.UNSIGNED_SHORT_4_4_4_4&&(Z=r.RGBA4),F===r.UNSIGNED_SHORT_5_5_5_1&&(Z=r.RGB5_A1)}return(Z===r.R16F||Z===r.R32F||Z===r.RG16F||Z===r.RG32F||Z===r.RGBA16F||Z===r.RGBA32F)&&e.get("EXT_color_buffer_float"),Z}function S(C,v){let F;return C?v===null||v===Vn||v===Ts?F=r.DEPTH24_STENCIL8:v===Gn?F=r.DEPTH32F_STENCIL8:v===ws&&(F=r.DEPTH24_STENCIL8,Ve("DepthTexture: 16 bit depth attachment is not supported with stencil. Using 24-bit attachment.")):v===null||v===Vn||v===Ts?F=r.DEPTH_COMPONENT24:v===Gn?F=r.DEPTH_COMPONENT32F:v===ws&&(F=r.DEPTH_COMPONENT16),F}function M(C,v){return m(C)===!0||C.isFramebufferTexture&&C.minFilter!==Ot&&C.minFilter!==Rt?Math.log2(Math.max(v.width,v.height))+1:C.mipmaps!==void 0&&C.mipmaps.length>0?C.mipmaps.length:C.isCompressedTexture&&Array.isArray(C.image)?v.mipmaps.length:1}function A(C){let v=C.target;v.removeEventListener("dispose",A),R(v),v.isVideoTexture&&u.delete(v)}function E(C){let v=C.target;v.removeEventListener("dispose",E),T(v)}function R(C){let v=n.get(C);if(v.__webglInit===void 0)return;let F=C.source,J=d.get(F);if(J){let Q=J[v.__cacheKey];Q.usedTimes--,Q.usedTimes===0&&x(C),Object.keys(J).length===0&&d.delete(F)}n.remove(C)}function x(C){let v=n.get(C);r.deleteTexture(v.__webglTexture);let F=C.source,J=d.get(F);delete J[v.__cacheKey],a.memory.textures--}function T(C){let v=n.get(C);if(C.depthTexture&&(C.depthTexture.dispose(),n.remove(C.depthTexture)),C.isWebGLCubeRenderTarget)for(let J=0;J<6;J++){if(Array.isArray(v.__webglFramebuffer[J]))for(let Q=0;Q<v.__webglFramebuffer[J].length;Q++)r.deleteFramebuffer(v.__webglFramebuffer[J][Q]);else r.deleteFramebuffer(v.__webglFramebuffer[J]);v.__webglDepthbuffer&&r.deleteRenderbuffer(v.__webglDepthbuffer[J])}else{if(Array.isArray(v.__webglFramebuffer))for(let J=0;J<v.__webglFramebuffer.length;J++)r.deleteFramebuffer(v.__webglFramebuffer[J]);else r.deleteFramebuffer(v.__webglFramebuffer);if(v.__webglDepthbuffer&&r.deleteRenderbuffer(v.__webglDepthbuffer),v.__webglMultisampledFramebuffer&&r.deleteFramebuffer(v.__webglMultisampledFramebuffer),v.__webglColorRenderbuffer)for(let J=0;J<v.__webglColorRenderbuffer.length;J++)v.__webglColorRenderbuffer[J]&&r.deleteRenderbuffer(v.__webglColorRenderbuffer[J]);v.__webglDepthRenderbuffer&&r.deleteRenderbuffer(v.__webglDepthRenderbuffer)}let F=C.textures;for(let J=0,Q=F.length;J<Q;J++){let Z=n.get(F[J]);Z.__webglTexture&&(r.deleteTexture(Z.__webglTexture),a.memory.textures--),n.remove(F[J])}n.remove(C)}let I=0;function B(){I=0}function N(){let C=I;return C>=i.maxTextures&&Ve("WebGLTextures: Trying to use "+C+" texture units while this GPU supports only "+i.maxTextures),I+=1,C}function k(C){let v=[];return v.push(C.wrapS),v.push(C.wrapT),v.push(C.wrapR||0),v.push(C.magFilter),v.push(C.minFilter),v.push(C.anisotropy),v.push(C.internalFormat),v.push(C.format),v.push(C.type),v.push(C.generateMipmaps),v.push(C.premultiplyAlpha),v.push(C.flipY),v.push(C.unpackAlignment),v.push(C.colorSpace),v.join()}function V(C,v){let F=n.get(C);if(C.isVideoTexture&&Ke(C),C.isRenderTargetTexture===!1&&C.isExternalTexture!==!0&&C.version>0&&F.__version!==C.version){let J=C.image;if(J===null)Ve("WebGLRenderer: Texture marked for update but no image data found.");else if(J.complete===!1)Ve("WebGLRenderer: Texture marked for update but image is incomplete");else{Y(F,C,v);return}}else C.isExternalTexture&&(F.__webglTexture=C.sourceTexture?C.sourceTexture:null);t.bindTexture(r.TEXTURE_2D,F.__webglTexture,r.TEXTURE0+v)}function O(C,v){let F=n.get(C);if(C.isRenderTargetTexture===!1&&C.version>0&&F.__version!==C.version){Y(F,C,v);return}else C.isExternalTexture&&(F.__webglTexture=C.sourceTexture?C.sourceTexture:null);t.bindTexture(r.TEXTURE_2D_ARRAY,F.__webglTexture,r.TEXTURE0+v)}function z(C,v){let F=n.get(C);if(C.isRenderTargetTexture===!1&&C.version>0&&F.__version!==C.version){Y(F,C,v);return}t.bindTexture(r.TEXTURE_3D,F.__webglTexture,r.TEXTURE0+v)}function $(C,v){let F=n.get(C);if(C.isCubeDepthTexture!==!0&&C.version>0&&F.__version!==C.version){ee(F,C,v);return}t.bindTexture(r.TEXTURE_CUBE_MAP,F.__webglTexture,r.TEXTURE0+v)}let ce={[bo]:r.REPEAT,[$n]:r.CLAMP_TO_EDGE,[Mo]:r.MIRRORED_REPEAT},q={[Ot]:r.NEAREST,[mf]:r.NEAREST_MIPMAP_NEAREST,[ya]:r.NEAREST_MIPMAP_LINEAR,[Rt]:r.LINEAR,[el]:r.LINEAR_MIPMAP_NEAREST,[ni]:r.LINEAR_MIPMAP_LINEAR},ie={[vf]:r.NEVER,[wf]:r.ALWAYS,[yf]:r.LESS,[kl]:r.LEQUAL,[bf]:r.EQUAL,[zl]:r.GEQUAL,[Mf]:r.GREATER,[Sf]:r.NOTEQUAL};function Re(C,v){if(v.type===Gn&&e.has("OES_texture_float_linear")===!1&&(v.magFilter===Rt||v.magFilter===el||v.magFilter===ya||v.magFilter===ni||v.minFilter===Rt||v.minFilter===el||v.minFilter===ya||v.minFilter===ni)&&Ve("WebGLRenderer: Unable to use linear filtering with floating point textures. OES_texture_float_linear not supported on this device."),r.texParameteri(C,r.TEXTURE_WRAP_S,ce[v.wrapS]),r.texParameteri(C,r.TEXTURE_WRAP_T,ce[v.wrapT]),(C===r.TEXTURE_3D||C===r.TEXTURE_2D_ARRAY)&&r.texParameteri(C,r.TEXTURE_WRAP_R,ce[v.wrapR]),r.texParameteri(C,r.TEXTURE_MAG_FILTER,q[v.magFilter]),r.texParameteri(C,r.TEXTURE_MIN_FILTER,q[v.minFilter]),v.compareFunction&&(r.texParameteri(C,r.TEXTURE_COMPARE_MODE,r.COMPARE_REF_TO_TEXTURE),r.texParameteri(C,r.TEXTURE_COMPARE_FUNC,ie[v.compareFunction])),e.has("EXT_texture_filter_anisotropic")===!0){if(v.magFilter===Ot||v.minFilter!==ya&&v.minFilter!==ni||v.type===Gn&&e.has("OES_texture_float_linear")===!1)return;if(v.anisotropy>1||n.get(v).__currentAnisotropy){let F=e.get("EXT_texture_filter_anisotropic");r.texParameterf(C,F.TEXTURE_MAX_ANISOTROPY_EXT,Math.min(v.anisotropy,i.getMaxAnisotropy())),n.get(v).__currentAnisotropy=v.anisotropy}}}function Ue(C,v){let F=!1;C.__webglInit===void 0&&(C.__webglInit=!0,v.addEventListener("dispose",A));let J=v.source,Q=d.get(J);Q===void 0&&(Q={},d.set(J,Q));let Z=k(v);if(Z!==C.__cacheKey){Q[Z]===void 0&&(Q[Z]={texture:r.createTexture(),usedTimes:0},a.memory.textures++,F=!0),Q[Z].usedTimes++;let Pe=Q[C.__cacheKey];Pe!==void 0&&(Q[C.__cacheKey].usedTimes--,Pe.usedTimes===0&&x(v)),C.__cacheKey=Z,C.__webglTexture=Q[Z].texture}return F}function ke(C,v,F){return Math.floor(Math.floor(C/F)/v)}function Oe(C,v,F,J){let Z=C.updateRanges;if(Z.length===0)t.texSubImage2D(r.TEXTURE_2D,0,0,0,v.width,v.height,F,J,v.data);else{Z.sort((ne,fe)=>ne.start-fe.start);let Pe=0;for(let ne=1;ne<Z.length;ne++){let fe=Z[Pe],Ae=Z[ne],Ce=fe.start+fe.count,le=ke(Ae.start,v.width,4),Ge=ke(fe.start,v.width,4);Ae.start<=Ce+1&&le===Ge&&ke(Ae.start+Ae.count-1,v.width,4)===le?fe.count=Math.max(fe.count,Ae.start+Ae.count-fe.start):(++Pe,Z[Pe]=Ae)}Z.length=Pe+1;let ue=r.getParameter(r.UNPACK_ROW_LENGTH),pe=r.getParameter(r.UNPACK_SKIP_PIXELS),De=r.getParameter(r.UNPACK_SKIP_ROWS);r.pixelStorei(r.UNPACK_ROW_LENGTH,v.width);for(let ne=0,fe=Z.length;ne<fe;ne++){let Ae=Z[ne],Ce=Math.floor(Ae.start/4),le=Math.ceil(Ae.count/4),Ge=Ce%v.width,L=Math.floor(Ce/v.width),me=le,ae=1;r.pixelStorei(r.UNPACK_SKIP_PIXELS,Ge),r.pixelStorei(r.UNPACK_SKIP_ROWS,L),t.texSubImage2D(r.TEXTURE_2D,0,Ge,L,me,ae,F,J,v.data)}C.clearUpdateRanges(),r.pixelStorei(r.UNPACK_ROW_LENGTH,ue),r.pixelStorei(r.UNPACK_SKIP_PIXELS,pe),r.pixelStorei(r.UNPACK_SKIP_ROWS,De)}}function Y(C,v,F){let J=r.TEXTURE_2D;(v.isDataArrayTexture||v.isCompressedArrayTexture)&&(J=r.TEXTURE_2D_ARRAY),v.isData3DTexture&&(J=r.TEXTURE_3D);let Q=Ue(C,v),Z=v.source;t.bindTexture(J,C.__webglTexture,r.TEXTURE0+F);let Pe=n.get(Z);if(Z.version!==Pe.__version||Q===!0){t.activeTexture(r.TEXTURE0+F);let ue=tt.getPrimaries(tt.workingColorSpace),pe=v.colorSpace===Ti?null:tt.getPrimaries(v.colorSpace),De=v.colorSpace===Ti||ue===pe?r.NONE:r.BROWSER_DEFAULT_WEBGL;r.pixelStorei(r.UNPACK_FLIP_Y_WEBGL,v.flipY),r.pixelStorei(r.UNPACK_PREMULTIPLY_ALPHA_WEBGL,v.premultiplyAlpha),r.pixelStorei(r.UNPACK_ALIGNMENT,v.unpackAlignment),r.pixelStorei(r.UNPACK_COLORSPACE_CONVERSION_WEBGL,De);let ne=g(v.image,!1,i.maxTextureSize);ne=et(v,ne);let fe=s.convert(v.format,v.colorSpace),Ae=s.convert(v.type),Ce=w(v.internalFormat,fe,Ae,v.colorSpace,v.isVideoTexture);Re(J,v);let le,Ge=v.mipmaps,L=v.isVideoTexture!==!0,me=Pe.__version===void 0||Q===!0,ae=Z.dataReady,xe=M(v,ne);if(v.isDepthTexture)Ce=S(v.format===nr,v.type),me&&(L?t.texStorage2D(r.TEXTURE_2D,1,Ce,ne.width,ne.height):t.texImage2D(r.TEXTURE_2D,0,Ce,ne.width,ne.height,0,fe,Ae,null));else if(v.isDataTexture)if(Ge.length>0){L&&me&&t.texStorage2D(r.TEXTURE_2D,xe,Ce,Ge[0].width,Ge[0].height);for(let re=0,te=Ge.length;re<te;re++)le=Ge[re],L?ae&&t.texSubImage2D(r.TEXTURE_2D,re,0,0,le.width,le.height,fe,Ae,le.data):t.texImage2D(r.TEXTURE_2D,re,Ce,le.width,le.height,0,fe,Ae,le.data);v.generateMipmaps=!1}else L?(me&&t.texStorage2D(r.TEXTURE_2D,xe,Ce,ne.width,ne.height),ae&&Oe(v,ne,fe,Ae)):t.texImage2D(r.TEXTURE_2D,0,Ce,ne.width,ne.height,0,fe,Ae,ne.data);else if(v.isCompressedTexture)if(v.isCompressedArrayTexture){L&&me&&t.texStorage3D(r.TEXTURE_2D_ARRAY,xe,Ce,Ge[0].width,Ge[0].height,ne.depth);for(let re=0,te=Ge.length;re<te;re++)if(le=Ge[re],v.format!==Ln)if(fe!==null)if(L){if(ae)if(v.layerUpdates.size>0){let he=$u(le.width,le.height,v.format,v.type);for(let ze of v.layerUpdates){let ut=le.data.subarray(ze*he/le.data.BYTES_PER_ELEMENT,(ze+1)*he/le.data.BYTES_PER_ELEMENT);t.compressedTexSubImage3D(r.TEXTURE_2D_ARRAY,re,0,0,ze,le.width,le.height,1,fe,ut)}v.clearLayerUpdates()}else t.compressedTexSubImage3D(r.TEXTURE_2D_ARRAY,re,0,0,0,le.width,le.height,ne.depth,fe,le.data)}else t.compressedTexImage3D(r.TEXTURE_2D_ARRAY,re,Ce,le.width,le.height,ne.depth,0,le.data,0,0);else Ve("WebGLRenderer: Attempt to load unsupported compressed texture format in .uploadTexture()");else L?ae&&t.texSubImage3D(r.TEXTURE_2D_ARRAY,re,0,0,0,le.width,le.height,ne.depth,fe,Ae,le.data):t.texImage3D(r.TEXTURE_2D_ARRAY,re,Ce,le.width,le.height,ne.depth,0,fe,Ae,le.data)}else{L&&me&&t.texStorage2D(r.TEXTURE_2D,xe,Ce,Ge[0].width,Ge[0].height);for(let re=0,te=Ge.length;re<te;re++)le=Ge[re],v.format!==Ln?fe!==null?L?ae&&t.compressedTexSubImage2D(r.TEXTURE_2D,re,0,0,le.width,le.height,fe,le.data):t.compressedTexImage2D(r.TEXTURE_2D,re,Ce,le.width,le.height,0,le.data):Ve("WebGLRenderer: Attempt to load unsupported compressed texture format in .uploadTexture()"):L?ae&&t.texSubImage2D(r.TEXTURE_2D,re,0,0,le.width,le.height,fe,Ae,le.data):t.texImage2D(r.TEXTURE_2D,re,Ce,le.width,le.height,0,fe,Ae,le.data)}else if(v.isDataArrayTexture)if(L){if(me&&t.texStorage3D(r.TEXTURE_2D_ARRAY,xe,Ce,ne.width,ne.height,ne.depth),ae)if(v.layerUpdates.size>0){let re=$u(ne.width,ne.height,v.format,v.type);for(let te of v.layerUpdates){let he=ne.data.subarray(te*re/ne.data.BYTES_PER_ELEMENT,(te+1)*re/ne.data.BYTES_PER_ELEMENT);t.texSubImage3D(r.TEXTURE_2D_ARRAY,0,0,0,te,ne.width,ne.height,1,fe,Ae,he)}v.clearLayerUpdates()}else t.texSubImage3D(r.TEXTURE_2D_ARRAY,0,0,0,0,ne.width,ne.height,ne.depth,fe,Ae,ne.data)}else t.texImage3D(r.TEXTURE_2D_ARRAY,0,Ce,ne.width,ne.height,ne.depth,0,fe,Ae,ne.data);else if(v.isData3DTexture)L?(me&&t.texStorage3D(r.TEXTURE_3D,xe,Ce,ne.width,ne.height,ne.depth),ae&&t.texSubImage3D(r.TEXTURE_3D,0,0,0,0,ne.width,ne.height,ne.depth,fe,Ae,ne.data)):t.texImage3D(r.TEXTURE_3D,0,Ce,ne.width,ne.height,ne.depth,0,fe,Ae,ne.data);else if(v.isFramebufferTexture){if(me)if(L)t.texStorage2D(r.TEXTURE_2D,xe,Ce,ne.width,ne.height);else{let re=ne.width,te=ne.height;for(let he=0;he<xe;he++)t.texImage2D(r.TEXTURE_2D,he,Ce,re,te,0,fe,Ae,null),re>>=1,te>>=1}}else if(Ge.length>0){if(L&&me){let re=Se(Ge[0]);t.texStorage2D(r.TEXTURE_2D,xe,Ce,re.width,re.height)}for(let re=0,te=Ge.length;re<te;re++)le=Ge[re],L?ae&&t.texSubImage2D(r.TEXTURE_2D,re,0,0,fe,Ae,le):t.texImage2D(r.TEXTURE_2D,re,Ce,fe,Ae,le);v.generateMipmaps=!1}else if(L){if(me){let re=Se(ne);t.texStorage2D(r.TEXTURE_2D,xe,Ce,re.width,re.height)}ae&&t.texSubImage2D(r.TEXTURE_2D,0,0,0,fe,Ae,ne)}else t.texImage2D(r.TEXTURE_2D,0,Ce,fe,Ae,ne);m(v)&&p(J),Pe.__version=Z.version,v.onUpdate&&v.onUpdate(v)}C.__version=v.version}function ee(C,v,F){if(v.image.length!==6)return;let J=Ue(C,v),Q=v.source;t.bindTexture(r.TEXTURE_CUBE_MAP,C.__webglTexture,r.TEXTURE0+F);let Z=n.get(Q);if(Q.version!==Z.__version||J===!0){t.activeTexture(r.TEXTURE0+F);let Pe=tt.getPrimaries(tt.workingColorSpace),ue=v.colorSpace===Ti?null:tt.getPrimaries(v.colorSpace),pe=v.colorSpace===Ti||Pe===ue?r.NONE:r.BROWSER_DEFAULT_WEBGL;r.pixelStorei(r.UNPACK_FLIP_Y_WEBGL,v.flipY),r.pixelStorei(r.UNPACK_PREMULTIPLY_ALPHA_WEBGL,v.premultiplyAlpha),r.pixelStorei(r.UNPACK_ALIGNMENT,v.unpackAlignment),r.pixelStorei(r.UNPACK_COLORSPACE_CONVERSION_WEBGL,pe);let De=v.isCompressedTexture||v.image[0].isCompressedTexture,ne=v.image[0]&&v.image[0].isDataTexture,fe=[];for(let te=0;te<6;te++)!De&&!ne?fe[te]=g(v.image[te],!0,i.maxCubemapSize):fe[te]=ne?v.image[te].image:v.image[te],fe[te]=et(v,fe[te]);let Ae=fe[0],Ce=s.convert(v.format,v.colorSpace),le=s.convert(v.type),Ge=w(v.internalFormat,Ce,le,v.colorSpace),L=v.isVideoTexture!==!0,me=Z.__version===void 0||J===!0,ae=Q.dataReady,xe=M(v,Ae);Re(r.TEXTURE_CUBE_MAP,v);let re;if(De){L&&me&&t.texStorage2D(r.TEXTURE_CUBE_MAP,xe,Ge,Ae.width,Ae.height);for(let te=0;te<6;te++){re=fe[te].mipmaps;for(let he=0;he<re.length;he++){let ze=re[he];v.format!==Ln?Ce!==null?L?ae&&t.compressedTexSubImage2D(r.TEXTURE_CUBE_MAP_POSITIVE_X+te,he,0,0,ze.width,ze.height,Ce,ze.data):t.compressedTexImage2D(r.TEXTURE_CUBE_MAP_POSITIVE_X+te,he,Ge,ze.width,ze.height,0,ze.data):Ve("WebGLRenderer: Attempt to load unsupported compressed texture format in .setTextureCube()"):L?ae&&t.texSubImage2D(r.TEXTURE_CUBE_MAP_POSITIVE_X+te,he,0,0,ze.width,ze.height,Ce,le,ze.data):t.texImage2D(r.TEXTURE_CUBE_MAP_POSITIVE_X+te,he,Ge,ze.width,ze.height,0,Ce,le,ze.data)}}}else{if(re=v.mipmaps,L&&me){re.length>0&&xe++;let te=Se(fe[0]);t.texStorage2D(r.TEXTURE_CUBE_MAP,xe,Ge,te.width,te.height)}for(let te=0;te<6;te++)if(ne){L?ae&&t.texSubImage2D(r.TEXTURE_CUBE_MAP_POSITIVE_X+te,0,0,0,fe[te].width,fe[te].height,Ce,le,fe[te].data):t.texImage2D(r.TEXTURE_CUBE_MAP_POSITIVE_X+te,0,Ge,fe[te].width,fe[te].height,0,Ce,le,fe[te].data);for(let he=0;he<re.length;he++){let ut=re[he].image[te].image;L?ae&&t.texSubImage2D(r.TEXTURE_CUBE_MAP_POSITIVE_X+te,he+1,0,0,ut.width,ut.height,Ce,le,ut.data):t.texImage2D(r.TEXTURE_CUBE_MAP_POSITIVE_X+te,he+1,Ge,ut.width,ut.height,0,Ce,le,ut.data)}}else{L?ae&&t.texSubImage2D(r.TEXTURE_CUBE_MAP_POSITIVE_X+te,0,0,0,Ce,le,fe[te]):t.texImage2D(r.TEXTURE_CUBE_MAP_POSITIVE_X+te,0,Ge,Ce,le,fe[te]);for(let he=0;he<re.length;he++){let ze=re[he];L?ae&&t.texSubImage2D(r.TEXTURE_CUBE_MAP_POSITIVE_X+te,he+1,0,0,Ce,le,ze.image[te]):t.texImage2D(r.TEXTURE_CUBE_MAP_POSITIVE_X+te,he+1,Ge,Ce,le,ze.image[te])}}}m(v)&&p(r.TEXTURE_CUBE_MAP),Z.__version=Q.version,v.onUpdate&&v.onUpdate(v)}C.__version=v.version}function _e(C,v,F,J,Q,Z){let Pe=s.convert(F.format,F.colorSpace),ue=s.convert(F.type),pe=w(F.internalFormat,Pe,ue,F.colorSpace),De=n.get(v),ne=n.get(F);if(ne.__renderTarget=v,!De.__hasExternalTextures){let fe=Math.max(1,v.width>>Z),Ae=Math.max(1,v.height>>Z);Q===r.TEXTURE_3D||Q===r.TEXTURE_2D_ARRAY?t.texImage3D(Q,Z,pe,fe,Ae,v.depth,0,Pe,ue,null):t.texImage2D(Q,Z,pe,fe,Ae,0,Pe,ue,null)}t.bindFramebuffer(r.FRAMEBUFFER,C),nt(v)?o.framebufferTexture2DMultisampleEXT(r.FRAMEBUFFER,J,Q,ne.__webglTexture,0,D(v)):(Q===r.TEXTURE_2D||Q>=r.TEXTURE_CUBE_MAP_POSITIVE_X&&Q<=r.TEXTURE_CUBE_MAP_NEGATIVE_Z)&&r.framebufferTexture2D(r.FRAMEBUFFER,J,Q,ne.__webglTexture,Z),t.bindFramebuffer(r.FRAMEBUFFER,null)}function ye(C,v,F){if(r.bindRenderbuffer(r.RENDERBUFFER,C),v.depthBuffer){let J=v.depthTexture,Q=J&&J.isDepthTexture?J.type:null,Z=S(v.stencilBuffer,Q),Pe=v.stencilBuffer?r.DEPTH_STENCIL_ATTACHMENT:r.DEPTH_ATTACHMENT;nt(v)?o.renderbufferStorageMultisampleEXT(r.RENDERBUFFER,D(v),Z,v.width,v.height):F?r.renderbufferStorageMultisample(r.RENDERBUFFER,D(v),Z,v.width,v.height):r.renderbufferStorage(r.RENDERBUFFER,Z,v.width,v.height),r.framebufferRenderbuffer(r.FRAMEBUFFER,Pe,r.RENDERBUFFER,C)}else{let J=v.textures;for(let Q=0;Q<J.length;Q++){let Z=J[Q],Pe=s.convert(Z.format,Z.colorSpace),ue=s.convert(Z.type),pe=w(Z.internalFormat,Pe,ue,Z.colorSpace);nt(v)?o.renderbufferStorageMultisampleEXT(r.RENDERBUFFER,D(v),pe,v.width,v.height):F?r.renderbufferStorageMultisample(r.RENDERBUFFER,D(v),pe,v.width,v.height):r.renderbufferStorage(r.RENDERBUFFER,pe,v.width,v.height)}}r.bindRenderbuffer(r.RENDERBUFFER,null)}function Me(C,v,F){let J=v.isWebGLCubeRenderTarget===!0;if(t.bindFramebuffer(r.FRAMEBUFFER,C),!(v.depthTexture&&v.depthTexture.isDepthTexture))throw new Error("renderTarget.depthTexture must be an instance of THREE.DepthTexture");let Q=n.get(v.depthTexture);if(Q.__renderTarget=v,(!Q.__webglTexture||v.depthTexture.image.width!==v.width||v.depthTexture.image.height!==v.height)&&(v.depthTexture.image.width=v.width,v.depthTexture.image.height=v.height,v.depthTexture.needsUpdate=!0),J){if(Q.__webglInit===void 0&&(Q.__webglInit=!0,v.depthTexture.addEventListener("dispose",A)),Q.__webglTexture===void 0){Q.__webglTexture=r.createTexture(),t.bindTexture(r.TEXTURE_CUBE_MAP,Q.__webglTexture),Re(r.TEXTURE_CUBE_MAP,v.depthTexture);let De=s.convert(v.depthTexture.format),ne=s.convert(v.depthTexture.type),fe;v.depthTexture.format===Kn?fe=r.DEPTH_COMPONENT24:v.depthTexture.format===nr&&(fe=r.DEPTH24_STENCIL8);for(let Ae=0;Ae<6;Ae++)r.texImage2D(r.TEXTURE_CUBE_MAP_POSITIVE_X+Ae,0,fe,v.width,v.height,0,De,ne,null)}}else V(v.depthTexture,0);let Z=Q.__webglTexture,Pe=D(v),ue=J?r.TEXTURE_CUBE_MAP_POSITIVE_X+F:r.TEXTURE_2D,pe=v.depthTexture.format===nr?r.DEPTH_STENCIL_ATTACHMENT:r.DEPTH_ATTACHMENT;if(v.depthTexture.format===Kn)nt(v)?o.framebufferTexture2DMultisampleEXT(r.FRAMEBUFFER,pe,ue,Z,0,Pe):r.framebufferTexture2D(r.FRAMEBUFFER,pe,ue,Z,0);else if(v.depthTexture.format===nr)nt(v)?o.framebufferTexture2DMultisampleEXT(r.FRAMEBUFFER,pe,ue,Z,0,Pe):r.framebufferTexture2D(r.FRAMEBUFFER,pe,ue,Z,0);else throw new Error("Unknown depthTexture format")}function Xe(C){let v=n.get(C),F=C.isWebGLCubeRenderTarget===!0;if(v.__boundDepthTexture!==C.depthTexture){let J=C.depthTexture;if(v.__depthDisposeCallback&&v.__depthDisposeCallback(),J){let Q=()=>{delete v.__boundDepthTexture,delete v.__depthDisposeCallback,J.removeEventListener("dispose",Q)};J.addEventListener("dispose",Q),v.__depthDisposeCallback=Q}v.__boundDepthTexture=J}if(C.depthTexture&&!v.__autoAllocateDepthBuffer)if(F)for(let J=0;J<6;J++)Me(v.__webglFramebuffer[J],C,J);else{let J=C.texture.mipmaps;J&&J.length>0?Me(v.__webglFramebuffer[0],C,0):Me(v.__webglFramebuffer,C,0)}else if(F){v.__webglDepthbuffer=[];for(let J=0;J<6;J++)if(t.bindFramebuffer(r.FRAMEBUFFER,v.__webglFramebuffer[J]),v.__webglDepthbuffer[J]===void 0)v.__webglDepthbuffer[J]=r.createRenderbuffer(),ye(v.__webglDepthbuffer[J],C,!1);else{let Q=C.stencilBuffer?r.DEPTH_STENCIL_ATTACHMENT:r.DEPTH_ATTACHMENT,Z=v.__webglDepthbuffer[J];r.bindRenderbuffer(r.RENDERBUFFER,Z),r.framebufferRenderbuffer(r.FRAMEBUFFER,Q,r.RENDERBUFFER,Z)}}else{let J=C.texture.mipmaps;if(J&&J.length>0?t.bindFramebuffer(r.FRAMEBUFFER,v.__webglFramebuffer[0]):t.bindFramebuffer(r.FRAMEBUFFER,v.__webglFramebuffer),v.__webglDepthbuffer===void 0)v.__webglDepthbuffer=r.createRenderbuffer(),ye(v.__webglDepthbuffer,C,!1);else{let Q=C.stencilBuffer?r.DEPTH_STENCIL_ATTACHMENT:r.DEPTH_ATTACHMENT,Z=v.__webglDepthbuffer;r.bindRenderbuffer(r.RENDERBUFFER,Z),r.framebufferRenderbuffer(r.FRAMEBUFFER,Q,r.RENDERBUFFER,Z)}}t.bindFramebuffer(r.FRAMEBUFFER,null)}function pt(C,v,F){let J=n.get(C);v!==void 0&&_e(J.__webglFramebuffer,C,C.texture,r.COLOR_ATTACHMENT0,r.TEXTURE_2D,0),F!==void 0&&Xe(C)}function Ne(C){let v=C.texture,F=n.get(C),J=n.get(v);C.addEventListener("dispose",E);let Q=C.textures,Z=C.isWebGLCubeRenderTarget===!0,Pe=Q.length>1;if(Pe||(J.__webglTexture===void 0&&(J.__webglTexture=r.createTexture()),J.__version=v.version,a.memory.textures++),Z){F.__webglFramebuffer=[];for(let ue=0;ue<6;ue++)if(v.mipmaps&&v.mipmaps.length>0){F.__webglFramebuffer[ue]=[];for(let pe=0;pe<v.mipmaps.length;pe++)F.__webglFramebuffer[ue][pe]=r.createFramebuffer()}else F.__webglFramebuffer[ue]=r.createFramebuffer()}else{if(v.mipmaps&&v.mipmaps.length>0){F.__webglFramebuffer=[];for(let ue=0;ue<v.mipmaps.length;ue++)F.__webglFramebuffer[ue]=r.createFramebuffer()}else F.__webglFramebuffer=r.createFramebuffer();if(Pe)for(let ue=0,pe=Q.length;ue<pe;ue++){let De=n.get(Q[ue]);De.__webglTexture===void 0&&(De.__webglTexture=r.createTexture(),a.memory.textures++)}if(C.samples>0&&nt(C)===!1){F.__webglMultisampledFramebuffer=r.createFramebuffer(),F.__webglColorRenderbuffer=[],t.bindFramebuffer(r.FRAMEBUFFER,F.__webglMultisampledFramebuffer);for(let ue=0;ue<Q.length;ue++){let pe=Q[ue];F.__webglColorRenderbuffer[ue]=r.createRenderbuffer(),r.bindRenderbuffer(r.RENDERBUFFER,F.__webglColorRenderbuffer[ue]);let De=s.convert(pe.format,pe.colorSpace),ne=s.convert(pe.type),fe=w(pe.internalFormat,De,ne,pe.colorSpace,C.isXRRenderTarget===!0),Ae=D(C);r.renderbufferStorageMultisample(r.RENDERBUFFER,Ae,fe,C.width,C.height),r.framebufferRenderbuffer(r.FRAMEBUFFER,r.COLOR_ATTACHMENT0+ue,r.RENDERBUFFER,F.__webglColorRenderbuffer[ue])}r.bindRenderbuffer(r.RENDERBUFFER,null),C.depthBuffer&&(F.__webglDepthRenderbuffer=r.createRenderbuffer(),ye(F.__webglDepthRenderbuffer,C,!0)),t.bindFramebuffer(r.FRAMEBUFFER,null)}}if(Z){t.bindTexture(r.TEXTURE_CUBE_MAP,J.__webglTexture),Re(r.TEXTURE_CUBE_MAP,v);for(let ue=0;ue<6;ue++)if(v.mipmaps&&v.mipmaps.length>0)for(let pe=0;pe<v.mipmaps.length;pe++)_e(F.__webglFramebuffer[ue][pe],C,v,r.COLOR_ATTACHMENT0,r.TEXTURE_CUBE_MAP_POSITIVE_X+ue,pe);else _e(F.__webglFramebuffer[ue],C,v,r.COLOR_ATTACHMENT0,r.TEXTURE_CUBE_MAP_POSITIVE_X+ue,0);m(v)&&p(r.TEXTURE_CUBE_MAP),t.unbindTexture()}else if(Pe){for(let ue=0,pe=Q.length;ue<pe;ue++){let De=Q[ue],ne=n.get(De),fe=r.TEXTURE_2D;(C.isWebGL3DRenderTarget||C.isWebGLArrayRenderTarget)&&(fe=C.isWebGL3DRenderTarget?r.TEXTURE_3D:r.TEXTURE_2D_ARRAY),t.bindTexture(fe,ne.__webglTexture),Re(fe,De),_e(F.__webglFramebuffer,C,De,r.COLOR_ATTACHMENT0+ue,fe,0),m(De)&&p(fe)}t.unbindTexture()}else{let ue=r.TEXTURE_2D;if((C.isWebGL3DRenderTarget||C.isWebGLArrayRenderTarget)&&(ue=C.isWebGL3DRenderTarget?r.TEXTURE_3D:r.TEXTURE_2D_ARRAY),t.bindTexture(ue,J.__webglTexture),Re(ue,v),v.mipmaps&&v.mipmaps.length>0)for(let pe=0;pe<v.mipmaps.length;pe++)_e(F.__webglFramebuffer[pe],C,v,r.COLOR_ATTACHMENT0,ue,pe);else _e(F.__webglFramebuffer,C,v,r.COLOR_ATTACHMENT0,ue,0);m(v)&&p(ue),t.unbindTexture()}C.depthBuffer&&Xe(C)}function Ze(C){let v=C.textures;for(let F=0,J=v.length;F<J;F++){let Q=v[F];if(m(Q)){let Z=y(C),Pe=n.get(Q).__webglTexture;t.bindTexture(Z,Pe),p(Z),t.unbindTexture()}}}let lt=[],be=[];function mt(C){if(C.samples>0){if(nt(C)===!1){let v=C.textures,F=C.width,J=C.height,Q=r.COLOR_BUFFER_BIT,Z=C.stencilBuffer?r.DEPTH_STENCIL_ATTACHMENT:r.DEPTH_ATTACHMENT,Pe=n.get(C),ue=v.length>1;if(ue)for(let De=0;De<v.length;De++)t.bindFramebuffer(r.FRAMEBUFFER,Pe.__webglMultisampledFramebuffer),r.framebufferRenderbuffer(r.FRAMEBUFFER,r.COLOR_ATTACHMENT0+De,r.RENDERBUFFER,null),t.bindFramebuffer(r.FRAMEBUFFER,Pe.__webglFramebuffer),r.framebufferTexture2D(r.DRAW_FRAMEBUFFER,r.COLOR_ATTACHMENT0+De,r.TEXTURE_2D,null,0);t.bindFramebuffer(r.READ_FRAMEBUFFER,Pe.__webglMultisampledFramebuffer);let pe=C.texture.mipmaps;pe&&pe.length>0?t.bindFramebuffer(r.DRAW_FRAMEBUFFER,Pe.__webglFramebuffer[0]):t.bindFramebuffer(r.DRAW_FRAMEBUFFER,Pe.__webglFramebuffer);for(let De=0;De<v.length;De++){if(C.resolveDepthBuffer&&(C.depthBuffer&&(Q|=r.DEPTH_BUFFER_BIT),C.stencilBuffer&&C.resolveStencilBuffer&&(Q|=r.STENCIL_BUFFER_BIT)),ue){r.framebufferRenderbuffer(r.READ_FRAMEBUFFER,r.COLOR_ATTACHMENT0,r.RENDERBUFFER,Pe.__webglColorRenderbuffer[De]);let ne=n.get(v[De]).__webglTexture;r.framebufferTexture2D(r.DRAW_FRAMEBUFFER,r.COLOR_ATTACHMENT0,r.TEXTURE_2D,ne,0)}r.blitFramebuffer(0,0,F,J,0,0,F,J,Q,r.NEAREST),c===!0&&(lt.length=0,be.length=0,lt.push(r.COLOR_ATTACHMENT0+De),C.depthBuffer&&C.resolveDepthBuffer===!1&&(lt.push(Z),be.push(Z),r.invalidateFramebuffer(r.DRAW_FRAMEBUFFER,be)),r.invalidateFramebuffer(r.READ_FRAMEBUFFER,lt))}if(t.bindFramebuffer(r.READ_FRAMEBUFFER,null),t.bindFramebuffer(r.DRAW_FRAMEBUFFER,null),ue)for(let De=0;De<v.length;De++){t.bindFramebuffer(r.FRAMEBUFFER,Pe.__webglMultisampledFramebuffer),r.framebufferRenderbuffer(r.FRAMEBUFFER,r.COLOR_ATTACHMENT0+De,r.RENDERBUFFER,Pe.__webglColorRenderbuffer[De]);let ne=n.get(v[De]).__webglTexture;t.bindFramebuffer(r.FRAMEBUFFER,Pe.__webglFramebuffer),r.framebufferTexture2D(r.DRAW_FRAMEBUFFER,r.COLOR_ATTACHMENT0+De,r.TEXTURE_2D,ne,0)}t.bindFramebuffer(r.DRAW_FRAMEBUFFER,Pe.__webglMultisampledFramebuffer)}else if(C.depthBuffer&&C.resolveDepthBuffer===!1&&c){let v=C.stencilBuffer?r.DEPTH_STENCIL_ATTACHMENT:r.DEPTH_ATTACHMENT;r.invalidateFramebuffer(r.DRAW_FRAMEBUFFER,[v])}}}function D(C){return Math.min(i.maxSamples,C.samples)}function nt(C){let v=n.get(C);return C.samples>0&&e.has("WEBGL_multisampled_render_to_texture")===!0&&v.__useRenderToTexture!==!1}function Ke(C){let v=a.render.frame;u.get(C)!==v&&(u.set(C,v),C.update())}function et(C,v){let F=C.colorSpace,J=C.format,Q=C.type;return C.isCompressedTexture===!0||C.isVideoTexture===!0||F!==Cr&&F!==Ti&&(tt.getTransfer(F)===ct?(J!==Ln||Q!==Tn)&&Ve("WebGLTextures: sRGB encoded textures have to use RGBAFormat and UnsignedByteType."):Be("WebGLTextures: Unsupported texture color space:",F)),v}function Se(C){return typeof HTMLImageElement<"u"&&C instanceof HTMLImageElement?(l.width=C.naturalWidth||C.width,l.height=C.naturalHeight||C.height):typeof VideoFrame<"u"&&C instanceof VideoFrame?(l.width=C.displayWidth,l.height=C.displayHeight):(l.width=C.width,l.height=C.height),l}this.allocateTextureUnit=N,this.resetTextureUnits=B,this.setTexture2D=V,this.setTexture2DArray=O,this.setTexture3D=z,this.setTextureCube=$,this.rebindTextures=pt,this.setupRenderTarget=Ne,this.updateRenderTargetMipmap=Ze,this.updateMultisampleRenderTarget=mt,this.setupDepthRenderbuffer=Xe,this.setupFrameBufferTexture=_e,this.useMultisampledRTT=nt,this.isReversedDepthBuffer=function(){return t.buffers.depth.getReversed()}}function Ly(r,e){function t(n,i=Ti){let s,a=tt.getTransfer(i);if(n===Tn)return r.UNSIGNED_BYTE;if(n===nl)return r.UNSIGNED_SHORT_4_4_4_4;if(n===il)return r.UNSIGNED_SHORT_5_5_5_1;if(n===ku)return r.UNSIGNED_INT_5_9_9_9_REV;if(n===zu)return r.UNSIGNED_INT_10F_11F_11F_REV;if(n===Ou)return r.BYTE;if(n===Bu)return r.SHORT;if(n===ws)return r.UNSIGNED_SHORT;if(n===tl)return r.INT;if(n===Vn)return r.UNSIGNED_INT;if(n===Gn)return r.FLOAT;if(n===ii)return r.HALF_FLOAT;if(n===Vu)return r.ALPHA;if(n===Gu)return r.RGB;if(n===Ln)return r.RGBA;if(n===Kn)return r.DEPTH_COMPONENT;if(n===nr)return r.DEPTH_STENCIL;if(n===Hu)return r.RED;if(n===rl)return r.RED_INTEGER;if(n===Lr)return r.RG;if(n===sl)return r.RG_INTEGER;if(n===al)return r.RGBA_INTEGER;if(n===ba||n===Ma||n===Sa||n===wa)if(a===ct)if(s=e.get("WEBGL_compressed_texture_s3tc_srgb"),s!==null){if(n===ba)return s.COMPRESSED_SRGB_S3TC_DXT1_EXT;if(n===Ma)return s.COMPRESSED_SRGB_ALPHA_S3TC_DXT1_EXT;if(n===Sa)return s.COMPRESSED_SRGB_ALPHA_S3TC_DXT3_EXT;if(n===wa)return s.COMPRESSED_SRGB_ALPHA_S3TC_DXT5_EXT}else return null;else if(s=e.get("WEBGL_compressed_texture_s3tc"),s!==null){if(n===ba)return s.COMPRESSED_RGB_S3TC_DXT1_EXT;if(n===Ma)return s.COMPRESSED_RGBA_S3TC_DXT1_EXT;if(n===Sa)return s.COMPRESSED_RGBA_S3TC_DXT3_EXT;if(n===wa)return s.COMPRESSED_RGBA_S3TC_DXT5_EXT}else return null;if(n===ol||n===ll||n===cl||n===ul)if(s=e.get("WEBGL_compressed_texture_pvrtc"),s!==null){if(n===ol)return s.COMPRESSED_RGB_PVRTC_4BPPV1_IMG;if(n===ll)return s.COMPRESSED_RGB_PVRTC_2BPPV1_IMG;if(n===cl)return s.COMPRESSED_RGBA_PVRTC_4BPPV1_IMG;if(n===ul)return s.COMPRESSED_RGBA_PVRTC_2BPPV1_IMG}else return null;if(n===hl||n===dl||n===fl||n===pl||n===ml||n===gl||n===_l)if(s=e.get("WEBGL_compressed_texture_etc"),s!==null){if(n===hl||n===dl)return a===ct?s.COMPRESSED_SRGB8_ETC2:s.COMPRESSED_RGB8_ETC2;if(n===fl)return a===ct?s.COMPRESSED_SRGB8_ALPHA8_ETC2_EAC:s.COMPRESSED_RGBA8_ETC2_EAC;if(n===pl)return s.COMPRESSED_R11_EAC;if(n===ml)return s.COMPRESSED_SIGNED_R11_EAC;if(n===gl)return s.COMPRESSED_RG11_EAC;if(n===_l)return s.COMPRESSED_SIGNED_RG11_EAC}else return null;if(n===xl||n===vl||n===yl||n===bl||n===Ml||n===Sl||n===wl||n===Tl||n===Al||n===El||n===Cl||n===Rl||n===Pl||n===Il)if(s=e.get("WEBGL_compressed_texture_astc"),s!==null){if(n===xl)return a===ct?s.COMPRESSED_SRGB8_ALPHA8_ASTC_4x4_KHR:s.COMPRESSED_RGBA_ASTC_4x4_KHR;if(n===vl)return a===ct?s.COMPRESSED_SRGB8_ALPHA8_ASTC_5x4_KHR:s.COMPRESSED_RGBA_ASTC_5x4_KHR;if(n===yl)return a===ct?s.COMPRESSED_SRGB8_ALPHA8_ASTC_5x5_KHR:s.COMPRESSED_RGBA_ASTC_5x5_KHR;if(n===bl)return a===ct?s.COMPRESSED_SRGB8_ALPHA8_ASTC_6x5_KHR:s.COMPRESSED_RGBA_ASTC_6x5_KHR;if(n===Ml)return a===ct?s.COMPRESSED_SRGB8_ALPHA8_ASTC_6x6_KHR:s.COMPRESSED_RGBA_ASTC_6x6_KHR;if(n===Sl)return a===ct?s.COMPRESSED_SRGB8_ALPHA8_ASTC_8x5_KHR:s.COMPRESSED_RGBA_ASTC_8x5_KHR;if(n===wl)return a===ct?s.COMPRESSED_SRGB8_ALPHA8_ASTC_8x6_KHR:s.COMPRESSED_RGBA_ASTC_8x6_KHR;if(n===Tl)return a===ct?s.COMPRESSED_SRGB8_ALPHA8_ASTC_8x8_KHR:s.COMPRESSED_RGBA_ASTC_8x8_KHR;if(n===Al)return a===ct?s.COMPRESSED_SRGB8_ALPHA8_ASTC_10x5_KHR:s.COMPRESSED_RGBA_ASTC_10x5_KHR;if(n===El)return a===ct?s.COMPRESSED_SRGB8_ALPHA8_ASTC_10x6_KHR:s.COMPRESSED_RGBA_ASTC_10x6_KHR;if(n===Cl)return a===ct?s.COMPRESSED_SRGB8_ALPHA8_ASTC_10x8_KHR:s.COMPRESSED_RGBA_ASTC_10x8_KHR;if(n===Rl)return a===ct?s.COMPRESSED_SRGB8_ALPHA8_ASTC_10x10_KHR:s.COMPRESSED_RGBA_ASTC_10x10_KHR;if(n===Pl)return a===ct?s.COMPRESSED_SRGB8_ALPHA8_ASTC_12x10_KHR:s.COMPRESSED_RGBA_ASTC_12x10_KHR;if(n===Il)return a===ct?s.COMPRESSED_SRGB8_ALPHA8_ASTC_12x12_KHR:s.COMPRESSED_RGBA_ASTC_12x12_KHR}else return null;if(n===Dl||n===Ll||n===Nl)if(s=e.get("EXT_texture_compression_bptc"),s!==null){if(n===Dl)return a===ct?s.COMPRESSED_SRGB_ALPHA_BPTC_UNORM_EXT:s.COMPRESSED_RGBA_BPTC_UNORM_EXT;if(n===Ll)return s.COMPRESSED_RGB_BPTC_SIGNED_FLOAT_EXT;if(n===Nl)return s.COMPRESSED_RGB_BPTC_UNSIGNED_FLOAT_EXT}else return null;if(n===Fl||n===Ul||n===Ol||n===Bl)if(s=e.get("EXT_texture_compression_rgtc"),s!==null){if(n===Fl)return s.COMPRESSED_RED_RGTC1_EXT;if(n===Ul)return s.COMPRESSED_SIGNED_RED_RGTC1_EXT;if(n===Ol)return s.COMPRESSED_RED_GREEN_RGTC2_EXT;if(n===Bl)return s.COMPRESSED_SIGNED_RED_GREEN_RGTC2_EXT}else return null;return n===Ts?r.UNSIGNED_INT_24_8:r[n]!==void 0?r[n]:null}return{convert:t}}var Ny=`
void main() {

	gl_Position = vec4( position, 1.0 );

}`,Fy=`
uniform sampler2DArray depthColor;
uniform float depthWidth;
uniform float depthHeight;

void main() {

	vec2 coord = vec2( gl_FragCoord.x / depthWidth, gl_FragCoord.y / depthHeight );

	if ( coord.x >= 1.0 ) {

		gl_FragDepth = texture( depthColor, vec3( coord.x - 1.0, coord.y, 1 ) ).r;

	} else {

		gl_FragDepth = texture( depthColor, vec3( coord.x, coord.y, 0 ) ).r;

	}

}`,uh=class{constructor(){this.texture=null,this.mesh=null,this.depthNear=0,this.depthFar=0}init(e,t){if(this.texture===null){let n=new ma(e.texture);(e.depthNear!==t.depthNear||e.depthFar!==t.depthFar)&&(this.depthNear=e.depthNear,this.depthFar=e.depthFar),this.texture=n}}getMesh(e){if(this.texture!==null&&this.mesh===null){let t=e.cameras[0].viewport,n=new an({vertexShader:Ny,fragmentShader:Fy,uniforms:{depthColor:{value:this.texture},depthWidth:{value:t.z},depthHeight:{value:t.w}}});this.mesh=new sn(new Ki(20,20),n)}return this.mesh}reset(){this.texture=null,this.mesh=null}getDepthTexture(){return this.texture}},hh=class extends Si{constructor(e,t){super();let n=this,i=null,s=1,a=null,o="local-floor",c=1,l=null,u=null,h=null,d=null,f=null,_=null,g=typeof XRWebGLBinding<"u",m=new uh,p={},y=t.getContextAttributes(),w=null,S=null,M=[],A=[],E=new st,R=null,x=new pn;x.viewport=new St;let T=new pn;T.viewport=new St;let I=[x,T],B=new Wo,N=null,k=null;this.cameraAutoUpdate=!0,this.enabled=!1,this.isPresenting=!1,this.getController=function(Y){let ee=M[Y];return ee===void 0&&(ee=new ys,M[Y]=ee),ee.getTargetRaySpace()},this.getControllerGrip=function(Y){let ee=M[Y];return ee===void 0&&(ee=new ys,M[Y]=ee),ee.getGripSpace()},this.getHand=function(Y){let ee=M[Y];return ee===void 0&&(ee=new ys,M[Y]=ee),ee.getHandSpace()};function V(Y){let ee=A.indexOf(Y.inputSource);if(ee===-1)return;let _e=M[ee];_e!==void 0&&(_e.update(Y.inputSource,Y.frame,l||a),_e.dispatchEvent({type:Y.type,data:Y.inputSource}))}function O(){i.removeEventListener("select",V),i.removeEventListener("selectstart",V),i.removeEventListener("selectend",V),i.removeEventListener("squeeze",V),i.removeEventListener("squeezestart",V),i.removeEventListener("squeezeend",V),i.removeEventListener("end",O),i.removeEventListener("inputsourceschange",z);for(let Y=0;Y<M.length;Y++){let ee=A[Y];ee!==null&&(A[Y]=null,M[Y].disconnect(ee))}N=null,k=null,m.reset();for(let Y in p)delete p[Y];e.setRenderTarget(w),f=null,d=null,h=null,i=null,S=null,Oe.stop(),n.isPresenting=!1,e.setPixelRatio(R),e.setSize(E.width,E.height,!1),n.dispatchEvent({type:"sessionend"})}this.setFramebufferScaleFactor=function(Y){s=Y,n.isPresenting===!0&&Ve("WebXRManager: Cannot change framebuffer scale while presenting.")},this.setReferenceSpaceType=function(Y){o=Y,n.isPresenting===!0&&Ve("WebXRManager: Cannot change reference space type while presenting.")},this.getReferenceSpace=function(){return l||a},this.setReferenceSpace=function(Y){l=Y},this.getBaseLayer=function(){return d!==null?d:f},this.getBinding=function(){return h===null&&g&&(h=new XRWebGLBinding(i,t)),h},this.getFrame=function(){return _},this.getSession=function(){return i},this.setSession=async function(Y){if(i=Y,i!==null){if(w=e.getRenderTarget(),i.addEventListener("select",V),i.addEventListener("selectstart",V),i.addEventListener("selectend",V),i.addEventListener("squeeze",V),i.addEventListener("squeezestart",V),i.addEventListener("squeezeend",V),i.addEventListener("end",O),i.addEventListener("inputsourceschange",z),y.xrCompatible!==!0&&await t.makeXRCompatible(),R=e.getPixelRatio(),e.getSize(E),g&&"createProjectionLayer"in XRWebGLBinding.prototype){let _e=null,ye=null,Me=null;y.depth&&(Me=y.stencil?t.DEPTH24_STENCIL8:t.DEPTH_COMPONENT24,_e=y.stencil?nr:Kn,ye=y.stencil?Ts:Vn);let Xe={colorFormat:t.RGBA8,depthFormat:Me,scaleFactor:s};h=this.getBinding(),d=h.createProjectionLayer(Xe),i.updateRenderState({layers:[d]}),e.setPixelRatio(1),e.setSize(d.textureWidth,d.textureHeight,!1),S=new rn(d.textureWidth,d.textureHeight,{format:Ln,type:Tn,depthTexture:new $i(d.textureWidth,d.textureHeight,ye,void 0,void 0,void 0,void 0,void 0,void 0,_e),stencilBuffer:y.stencil,colorSpace:e.outputColorSpace,samples:y.antialias?4:0,resolveDepthBuffer:d.ignoreDepthValues===!1,resolveStencilBuffer:d.ignoreDepthValues===!1})}else{let _e={antialias:y.antialias,alpha:!0,depth:y.depth,stencil:y.stencil,framebufferScaleFactor:s};f=new XRWebGLLayer(i,t,_e),i.updateRenderState({baseLayer:f}),e.setPixelRatio(1),e.setSize(f.framebufferWidth,f.framebufferHeight,!1),S=new rn(f.framebufferWidth,f.framebufferHeight,{format:Ln,type:Tn,colorSpace:e.outputColorSpace,stencilBuffer:y.stencil,resolveDepthBuffer:f.ignoreDepthValues===!1,resolveStencilBuffer:f.ignoreDepthValues===!1})}S.isXRRenderTarget=!0,this.setFoveation(c),l=null,a=await i.requestReferenceSpace(o),Oe.setContext(i),Oe.start(),n.isPresenting=!0,n.dispatchEvent({type:"sessionstart"})}},this.getEnvironmentBlendMode=function(){if(i!==null)return i.environmentBlendMode},this.getDepthTexture=function(){return m.getDepthTexture()};function z(Y){for(let ee=0;ee<Y.removed.length;ee++){let _e=Y.removed[ee],ye=A.indexOf(_e);ye>=0&&(A[ye]=null,M[ye].disconnect(_e))}for(let ee=0;ee<Y.added.length;ee++){let _e=Y.added[ee],ye=A.indexOf(_e);if(ye===-1){for(let Xe=0;Xe<M.length;Xe++)if(Xe>=A.length){A.push(_e),ye=Xe;break}else if(A[Xe]===null){A[Xe]=_e,ye=Xe;break}if(ye===-1)break}let Me=M[ye];Me&&Me.connect(_e)}}let $=new W,ce=new W;function q(Y,ee,_e){$.setFromMatrixPosition(ee.matrixWorld),ce.setFromMatrixPosition(_e.matrixWorld);let ye=$.distanceTo(ce),Me=ee.projectionMatrix.elements,Xe=_e.projectionMatrix.elements,pt=Me[14]/(Me[10]-1),Ne=Me[14]/(Me[10]+1),Ze=(Me[9]+1)/Me[5],lt=(Me[9]-1)/Me[5],be=(Me[8]-1)/Me[0],mt=(Xe[8]+1)/Xe[0],D=pt*be,nt=pt*mt,Ke=ye/(-be+mt),et=Ke*-be;if(ee.matrixWorld.decompose(Y.position,Y.quaternion,Y.scale),Y.translateX(et),Y.translateZ(Ke),Y.matrixWorld.compose(Y.position,Y.quaternion,Y.scale),Y.matrixWorldInverse.copy(Y.matrixWorld).invert(),Me[10]===-1)Y.projectionMatrix.copy(ee.projectionMatrix),Y.projectionMatrixInverse.copy(ee.projectionMatrixInverse);else{let Se=pt+Ke,C=Ne+Ke,v=D-et,F=nt+(ye-et),J=Ze*Ne/C*Se,Q=lt*Ne/C*Se;Y.projectionMatrix.makePerspective(v,F,J,Q,Se,C),Y.projectionMatrixInverse.copy(Y.projectionMatrix).invert()}}function ie(Y,ee){ee===null?Y.matrixWorld.copy(Y.matrix):Y.matrixWorld.multiplyMatrices(ee.matrixWorld,Y.matrix),Y.matrixWorldInverse.copy(Y.matrixWorld).invert()}this.updateCamera=function(Y){if(i===null)return;let ee=Y.near,_e=Y.far;m.texture!==null&&(m.depthNear>0&&(ee=m.depthNear),m.depthFar>0&&(_e=m.depthFar)),B.near=T.near=x.near=ee,B.far=T.far=x.far=_e,(N!==B.near||k!==B.far)&&(i.updateRenderState({depthNear:B.near,depthFar:B.far}),N=B.near,k=B.far),B.layers.mask=Y.layers.mask|6,x.layers.mask=B.layers.mask&3,T.layers.mask=B.layers.mask&5;let ye=Y.parent,Me=B.cameras;ie(B,ye);for(let Xe=0;Xe<Me.length;Xe++)ie(Me[Xe],ye);Me.length===2?q(B,x,T):B.projectionMatrix.copy(x.projectionMatrix),Re(Y,B,ye)};function Re(Y,ee,_e){_e===null?Y.matrix.copy(ee.matrixWorld):(Y.matrix.copy(_e.matrixWorld),Y.matrix.invert(),Y.matrix.multiply(ee.matrixWorld)),Y.matrix.decompose(Y.position,Y.quaternion,Y.scale),Y.updateMatrixWorld(!0),Y.projectionMatrix.copy(ee.projectionMatrix),Y.projectionMatrixInverse.copy(ee.projectionMatrixInverse),Y.isPerspectiveCamera&&(Y.fov=wo*2*Math.atan(1/Y.projectionMatrix.elements[5]),Y.zoom=1)}this.getCamera=function(){return B},this.getFoveation=function(){if(!(d===null&&f===null))return c},this.setFoveation=function(Y){c=Y,d!==null&&(d.fixedFoveation=Y),f!==null&&f.fixedFoveation!==void 0&&(f.fixedFoveation=Y)},this.hasDepthSensing=function(){return m.texture!==null},this.getDepthSensingMesh=function(){return m.getMesh(B)},this.getCameraTexture=function(Y){return p[Y]};let Ue=null;function ke(Y,ee){if(u=ee.getViewerPose(l||a),_=ee,u!==null){let _e=u.views;f!==null&&(e.setRenderTargetFramebuffer(S,f.framebuffer),e.setRenderTarget(S));let ye=!1;_e.length!==B.cameras.length&&(B.cameras.length=0,ye=!0);for(let Ne=0;Ne<_e.length;Ne++){let Ze=_e[Ne],lt=null;if(f!==null)lt=f.getViewport(Ze);else{let mt=h.getViewSubImage(d,Ze);lt=mt.viewport,Ne===0&&(e.setRenderTargetTextures(S,mt.colorTexture,mt.depthStencilTexture),e.setRenderTarget(S))}let be=I[Ne];be===void 0&&(be=new pn,be.layers.enable(Ne),be.viewport=new St,I[Ne]=be),be.matrix.fromArray(Ze.transform.matrix),be.matrix.decompose(be.position,be.quaternion,be.scale),be.projectionMatrix.fromArray(Ze.projectionMatrix),be.projectionMatrixInverse.copy(be.projectionMatrix).invert(),be.viewport.set(lt.x,lt.y,lt.width,lt.height),Ne===0&&(B.matrix.copy(be.matrix),B.matrix.decompose(B.position,B.quaternion,B.scale)),ye===!0&&B.cameras.push(be)}let Me=i.enabledFeatures;if(Me&&Me.includes("depth-sensing")&&i.depthUsage=="gpu-optimized"&&g){h=n.getBinding();let Ne=h.getDepthInformation(_e[0]);Ne&&Ne.isValid&&Ne.texture&&m.init(Ne,i.renderState)}if(Me&&Me.includes("camera-access")&&g){e.state.unbindTexture(),h=n.getBinding();for(let Ne=0;Ne<_e.length;Ne++){let Ze=_e[Ne].camera;if(Ze){let lt=p[Ze];lt||(lt=new ma,p[Ze]=lt);let be=h.getCameraImage(Ze);lt.sourceTexture=be}}}}for(let _e=0;_e<M.length;_e++){let ye=A[_e],Me=M[_e];ye!==null&&Me!==void 0&&Me.update(ye,ee,l||a)}Ue&&Ue(Y,ee),ee.detectedPlanes&&n.dispatchEvent({type:"planesdetected",data:ee}),_=null}let Oe=new Qf;Oe.setAnimationLoop(ke),this.setAnimationLoop=function(Y){Ue=Y},this.dispose=function(){}}},Ur=new Qn,Uy=new At;function Oy(r,e){function t(m,p){m.matrixAutoUpdate===!0&&m.updateMatrix(),p.value.copy(m.matrix)}function n(m,p){p.color.getRGB(m.fogColor.value,Yu(r)),p.isFog?(m.fogNear.value=p.near,m.fogFar.value=p.far):p.isFogExp2&&(m.fogDensity.value=p.density)}function i(m,p,y,w,S){p.isMeshBasicMaterial||p.isMeshLambertMaterial?s(m,p):p.isMeshToonMaterial?(s(m,p),h(m,p)):p.isMeshPhongMaterial?(s(m,p),u(m,p)):p.isMeshStandardMaterial?(s(m,p),d(m,p),p.isMeshPhysicalMaterial&&f(m,p,S)):p.isMeshMatcapMaterial?(s(m,p),_(m,p)):p.isMeshDepthMaterial?s(m,p):p.isMeshDistanceMaterial?(s(m,p),g(m,p)):p.isMeshNormalMaterial?s(m,p):p.isLineBasicMaterial?(a(m,p),p.isLineDashedMaterial&&o(m,p)):p.isPointsMaterial?c(m,p,y,w):p.isSpriteMaterial?l(m,p):p.isShadowMaterial?(m.color.value.copy(p.color),m.opacity.value=p.opacity):p.isShaderMaterial&&(p.uniformsNeedUpdate=!1)}function s(m,p){m.opacity.value=p.opacity,p.color&&m.diffuse.value.copy(p.color),p.emissive&&m.emissive.value.copy(p.emissive).multiplyScalar(p.emissiveIntensity),p.map&&(m.map.value=p.map,t(p.map,m.mapTransform)),p.alphaMap&&(m.alphaMap.value=p.alphaMap,t(p.alphaMap,m.alphaMapTransform)),p.bumpMap&&(m.bumpMap.value=p.bumpMap,t(p.bumpMap,m.bumpMapTransform),m.bumpScale.value=p.bumpScale,p.side===on&&(m.bumpScale.value*=-1)),p.normalMap&&(m.normalMap.value=p.normalMap,t(p.normalMap,m.normalMapTransform),m.normalScale.value.copy(p.normalScale),p.side===on&&m.normalScale.value.negate()),p.displacementMap&&(m.displacementMap.value=p.displacementMap,t(p.displacementMap,m.displacementMapTransform),m.displacementScale.value=p.displacementScale,m.displacementBias.value=p.displacementBias),p.emissiveMap&&(m.emissiveMap.value=p.emissiveMap,t(p.emissiveMap,m.emissiveMapTransform)),p.specularMap&&(m.specularMap.value=p.specularMap,t(p.specularMap,m.specularMapTransform)),p.alphaTest>0&&(m.alphaTest.value=p.alphaTest);let y=e.get(p),w=y.envMap,S=y.envMapRotation;w&&(m.envMap.value=w,Ur.copy(S),Ur.x*=-1,Ur.y*=-1,Ur.z*=-1,w.isCubeTexture&&w.isRenderTargetTexture===!1&&(Ur.y*=-1,Ur.z*=-1),m.envMapRotation.value.setFromMatrix4(Uy.makeRotationFromEuler(Ur)),m.flipEnvMap.value=w.isCubeTexture&&w.isRenderTargetTexture===!1?-1:1,m.reflectivity.value=p.reflectivity,m.ior.value=p.ior,m.refractionRatio.value=p.refractionRatio),p.lightMap&&(m.lightMap.value=p.lightMap,m.lightMapIntensity.value=p.lightMapIntensity,t(p.lightMap,m.lightMapTransform)),p.aoMap&&(m.aoMap.value=p.aoMap,m.aoMapIntensity.value=p.aoMapIntensity,t(p.aoMap,m.aoMapTransform))}function a(m,p){m.diffuse.value.copy(p.color),m.opacity.value=p.opacity,p.map&&(m.map.value=p.map,t(p.map,m.mapTransform))}function o(m,p){m.dashSize.value=p.dashSize,m.totalSize.value=p.dashSize+p.gapSize,m.scale.value=p.scale}function c(m,p,y,w){m.diffuse.value.copy(p.color),m.opacity.value=p.opacity,m.size.value=p.size*y,m.scale.value=w*.5,p.map&&(m.map.value=p.map,t(p.map,m.uvTransform)),p.alphaMap&&(m.alphaMap.value=p.alphaMap,t(p.alphaMap,m.alphaMapTransform)),p.alphaTest>0&&(m.alphaTest.value=p.alphaTest)}function l(m,p){m.diffuse.value.copy(p.color),m.opacity.value=p.opacity,m.rotation.value=p.rotation,p.map&&(m.map.value=p.map,t(p.map,m.mapTransform)),p.alphaMap&&(m.alphaMap.value=p.alphaMap,t(p.alphaMap,m.alphaMapTransform)),p.alphaTest>0&&(m.alphaTest.value=p.alphaTest)}function u(m,p){m.specular.value.copy(p.specular),m.shininess.value=Math.max(p.shininess,1e-4)}function h(m,p){p.gradientMap&&(m.gradientMap.value=p.gradientMap)}function d(m,p){m.metalness.value=p.metalness,p.metalnessMap&&(m.metalnessMap.value=p.metalnessMap,t(p.metalnessMap,m.metalnessMapTransform)),m.roughness.value=p.roughness,p.roughnessMap&&(m.roughnessMap.value=p.roughnessMap,t(p.roughnessMap,m.roughnessMapTransform)),p.envMap&&(m.envMapIntensity.value=p.envMapIntensity)}function f(m,p,y){m.ior.value=p.ior,p.sheen>0&&(m.sheenColor.value.copy(p.sheenColor).multiplyScalar(p.sheen),m.sheenRoughness.value=p.sheenRoughness,p.sheenColorMap&&(m.sheenColorMap.value=p.sheenColorMap,t(p.sheenColorMap,m.sheenColorMapTransform)),p.sheenRoughnessMap&&(m.sheenRoughnessMap.value=p.sheenRoughnessMap,t(p.sheenRoughnessMap,m.sheenRoughnessMapTransform))),p.clearcoat>0&&(m.clearcoat.value=p.clearcoat,m.clearcoatRoughness.value=p.clearcoatRoughness,p.clearcoatMap&&(m.clearcoatMap.value=p.clearcoatMap,t(p.clearcoatMap,m.clearcoatMapTransform)),p.clearcoatRoughnessMap&&(m.clearcoatRoughnessMap.value=p.clearcoatRoughnessMap,t(p.clearcoatRoughnessMap,m.clearcoatRoughnessMapTransform)),p.clearcoatNormalMap&&(m.clearcoatNormalMap.value=p.clearcoatNormalMap,t(p.clearcoatNormalMap,m.clearcoatNormalMapTransform),m.clearcoatNormalScale.value.copy(p.clearcoatNormalScale),p.side===on&&m.clearcoatNormalScale.value.negate())),p.dispersion>0&&(m.dispersion.value=p.dispersion),p.iridescence>0&&(m.iridescence.value=p.iridescence,m.iridescenceIOR.value=p.iridescenceIOR,m.iridescenceThicknessMinimum.value=p.iridescenceThicknessRange[0],m.iridescenceThicknessMaximum.value=p.iridescenceThicknessRange[1],p.iridescenceMap&&(m.iridescenceMap.value=p.iridescenceMap,t(p.iridescenceMap,m.iridescenceMapTransform)),p.iridescenceThicknessMap&&(m.iridescenceThicknessMap.value=p.iridescenceThicknessMap,t(p.iridescenceThicknessMap,m.iridescenceThicknessMapTransform))),p.transmission>0&&(m.transmission.value=p.transmission,m.transmissionSamplerMap.value=y.texture,m.transmissionSamplerSize.value.set(y.width,y.height),p.transmissionMap&&(m.transmissionMap.value=p.transmissionMap,t(p.transmissionMap,m.transmissionMapTransform)),m.thickness.value=p.thickness,p.thicknessMap&&(m.thicknessMap.value=p.thicknessMap,t(p.thicknessMap,m.thicknessMapTransform)),m.attenuationDistance.value=p.attenuationDistance,m.attenuationColor.value.copy(p.attenuationColor)),p.anisotropy>0&&(m.anisotropyVector.value.set(p.anisotropy*Math.cos(p.anisotropyRotation),p.anisotropy*Math.sin(p.anisotropyRotation)),p.anisotropyMap&&(m.anisotropyMap.value=p.anisotropyMap,t(p.anisotropyMap,m.anisotropyMapTransform))),m.specularIntensity.value=p.specularIntensity,m.specularColor.value.copy(p.specularColor),p.specularColorMap&&(m.specularColorMap.value=p.specularColorMap,t(p.specularColorMap,m.specularColorMapTransform)),p.specularIntensityMap&&(m.specularIntensityMap.value=p.specularIntensityMap,t(p.specularIntensityMap,m.specularIntensityMapTransform))}function _(m,p){p.matcap&&(m.matcap.value=p.matcap)}function g(m,p){let y=e.get(p).light;m.referencePosition.value.setFromMatrixPosition(y.matrixWorld),m.nearDistance.value=y.shadow.camera.near,m.farDistance.value=y.shadow.camera.far}return{refreshFogUniforms:n,refreshMaterialUniforms:i}}function By(r,e,t,n){let i={},s={},a=[],o=r.getParameter(r.MAX_UNIFORM_BUFFER_BINDINGS);function c(y,w){let S=w.program;n.uniformBlockBinding(y,S)}function l(y,w){let S=i[y.id];S===void 0&&(_(y),S=u(y),i[y.id]=S,y.addEventListener("dispose",m));let M=w.program;n.updateUBOMapping(y,M);let A=e.render.frame;s[y.id]!==A&&(d(y),s[y.id]=A)}function u(y){let w=h();y.__bindingPointIndex=w;let S=r.createBuffer(),M=y.__size,A=y.usage;return r.bindBuffer(r.UNIFORM_BUFFER,S),r.bufferData(r.UNIFORM_BUFFER,M,A),r.bindBuffer(r.UNIFORM_BUFFER,null),r.bindBufferBase(r.UNIFORM_BUFFER,w,S),S}function h(){for(let y=0;y<o;y++)if(a.indexOf(y)===-1)return a.push(y),y;return Be("WebGLRenderer: Maximum number of simultaneously usable uniforms groups reached."),0}function d(y){let w=i[y.id],S=y.uniforms,M=y.__cache;r.bindBuffer(r.UNIFORM_BUFFER,w);for(let A=0,E=S.length;A<E;A++){let R=Array.isArray(S[A])?S[A]:[S[A]];for(let x=0,T=R.length;x<T;x++){let I=R[x];if(f(I,A,x,M)===!0){let B=I.__offset,N=Array.isArray(I.value)?I.value:[I.value],k=0;for(let V=0;V<N.length;V++){let O=N[V],z=g(O);typeof O=="number"||typeof O=="boolean"?(I.__data[0]=O,r.bufferSubData(r.UNIFORM_BUFFER,B+k,I.__data)):O.isMatrix3?(I.__data[0]=O.elements[0],I.__data[1]=O.elements[1],I.__data[2]=O.elements[2],I.__data[3]=0,I.__data[4]=O.elements[3],I.__data[5]=O.elements[4],I.__data[6]=O.elements[5],I.__data[7]=0,I.__data[8]=O.elements[6],I.__data[9]=O.elements[7],I.__data[10]=O.elements[8],I.__data[11]=0):(O.toArray(I.__data,k),k+=z.storage/Float32Array.BYTES_PER_ELEMENT)}r.bufferSubData(r.UNIFORM_BUFFER,B,I.__data)}}}r.bindBuffer(r.UNIFORM_BUFFER,null)}function f(y,w,S,M){let A=y.value,E=w+"_"+S;if(M[E]===void 0)return typeof A=="number"||typeof A=="boolean"?M[E]=A:M[E]=A.clone(),!0;{let R=M[E];if(typeof A=="number"||typeof A=="boolean"){if(R!==A)return M[E]=A,!0}else if(R.equals(A)===!1)return R.copy(A),!0}return!1}function _(y){let w=y.uniforms,S=0,M=16;for(let E=0,R=w.length;E<R;E++){let x=Array.isArray(w[E])?w[E]:[w[E]];for(let T=0,I=x.length;T<I;T++){let B=x[T],N=Array.isArray(B.value)?B.value:[B.value];for(let k=0,V=N.length;k<V;k++){let O=N[k],z=g(O),$=S%M,ce=$%z.boundary,q=$+ce;S+=ce,q!==0&&M-q<z.storage&&(S+=M-q),B.__data=new Float32Array(z.storage/Float32Array.BYTES_PER_ELEMENT),B.__offset=S,S+=z.storage}}}let A=S%M;return A>0&&(S+=M-A),y.__size=S,y.__cache={},this}function g(y){let w={boundary:0,storage:0};return typeof y=="number"||typeof y=="boolean"?(w.boundary=4,w.storage=4):y.isVector2?(w.boundary=8,w.storage=8):y.isVector3||y.isColor?(w.boundary=16,w.storage=12):y.isVector4?(w.boundary=16,w.storage=16):y.isMatrix3?(w.boundary=48,w.storage=48):y.isMatrix4?(w.boundary=64,w.storage=64):y.isTexture?Ve("WebGLRenderer: Texture samplers can not be part of an uniforms group."):Ve("WebGLRenderer: Unsupported uniform value type.",y),w}function m(y){let w=y.target;w.removeEventListener("dispose",m);let S=a.indexOf(w.__bindingPointIndex);a.splice(S,1),r.deleteBuffer(i[w.id]),delete i[w.id],delete s[w.id]}function p(){for(let y in i)r.deleteBuffer(i[y]);a=[],i={},s={}}return{bind:c,update:l,dispose:p}}var ky=new Uint16Array([12469,15057,12620,14925,13266,14620,13807,14376,14323,13990,14545,13625,14713,13328,14840,12882,14931,12528,14996,12233,15039,11829,15066,11525,15080,11295,15085,10976,15082,10705,15073,10495,13880,14564,13898,14542,13977,14430,14158,14124,14393,13732,14556,13410,14702,12996,14814,12596,14891,12291,14937,11834,14957,11489,14958,11194,14943,10803,14921,10506,14893,10278,14858,9960,14484,14039,14487,14025,14499,13941,14524,13740,14574,13468,14654,13106,14743,12678,14818,12344,14867,11893,14889,11509,14893,11180,14881,10751,14852,10428,14812,10128,14765,9754,14712,9466,14764,13480,14764,13475,14766,13440,14766,13347,14769,13070,14786,12713,14816,12387,14844,11957,14860,11549,14868,11215,14855,10751,14825,10403,14782,10044,14729,9651,14666,9352,14599,9029,14967,12835,14966,12831,14963,12804,14954,12723,14936,12564,14917,12347,14900,11958,14886,11569,14878,11247,14859,10765,14828,10401,14784,10011,14727,9600,14660,9289,14586,8893,14508,8533,15111,12234,15110,12234,15104,12216,15092,12156,15067,12010,15028,11776,14981,11500,14942,11205,14902,10752,14861,10393,14812,9991,14752,9570,14682,9252,14603,8808,14519,8445,14431,8145,15209,11449,15208,11451,15202,11451,15190,11438,15163,11384,15117,11274,15055,10979,14994,10648,14932,10343,14871,9936,14803,9532,14729,9218,14645,8742,14556,8381,14461,8020,14365,7603,15273,10603,15272,10607,15267,10619,15256,10631,15231,10614,15182,10535,15118,10389,15042,10167,14963,9787,14883,9447,14800,9115,14710,8665,14615,8318,14514,7911,14411,7507,14279,7198,15314,9675,15313,9683,15309,9712,15298,9759,15277,9797,15229,9773,15166,9668,15084,9487,14995,9274,14898,8910,14800,8539,14697,8234,14590,7790,14479,7409,14367,7067,14178,6621,15337,8619,15337,8631,15333,8677,15325,8769,15305,8871,15264,8940,15202,8909,15119,8775,15022,8565,14916,8328,14804,8009,14688,7614,14569,7287,14448,6888,14321,6483,14088,6171,15350,7402,15350,7419,15347,7480,15340,7613,15322,7804,15287,7973,15229,8057,15148,8012,15046,7846,14933,7611,14810,7357,14682,7069,14552,6656,14421,6316,14251,5948,14007,5528,15356,5942,15356,5977,15353,6119,15348,6294,15332,6551,15302,6824,15249,7044,15171,7122,15070,7050,14949,6861,14818,6611,14679,6349,14538,6067,14398,5651,14189,5311,13935,4958,15359,4123,15359,4153,15356,4296,15353,4646,15338,5160,15311,5508,15263,5829,15188,6042,15088,6094,14966,6001,14826,5796,14678,5543,14527,5287,14377,4985,14133,4586,13869,4257,15360,1563,15360,1642,15358,2076,15354,2636,15341,3350,15317,4019,15273,4429,15203,4732,15105,4911,14981,4932,14836,4818,14679,4621,14517,4386,14359,4156,14083,3795,13808,3437,15360,122,15360,137,15358,285,15355,636,15344,1274,15322,2177,15281,2765,15215,3223,15120,3451,14995,3569,14846,3567,14681,3466,14511,3305,14344,3121,14037,2800,13753,2467,15360,0,15360,1,15359,21,15355,89,15346,253,15325,479,15287,796,15225,1148,15133,1492,15008,1749,14856,1882,14685,1886,14506,1783,14324,1608,13996,1398,13702,1183]),ri=null;function zy(){return ri===null&&(ri=new Po(ky,16,16,Lr,ii),ri.name="DFG_LUT",ri.minFilter=Rt,ri.magFilter=Rt,ri.wrapS=$n,ri.wrapT=$n,ri.generateMipmaps=!1,ri.needsUpdate=!0),ri}var Wl=class{constructor(e={}){let{canvas:t=Tf(),context:n=null,depth:i=!0,stencil:s=!1,alpha:a=!1,antialias:o=!1,premultipliedAlpha:c=!0,preserveDrawingBuffer:l=!1,powerPreference:u="default",failIfMajorPerformanceCaveat:h=!1,reversedDepthBuffer:d=!1,outputBufferType:f=Tn}=e;this.isWebGLRenderer=!0;let _;if(n!==null){if(typeof WebGLRenderingContext<"u"&&n instanceof WebGLRenderingContext)throw new Error("THREE.WebGLRenderer: WebGL 1 is not supported since r163.");_=n.getContextAttributes().alpha}else _=a;let g=f,m=new Set([al,sl,rl]),p=new Set([Tn,Vn,ws,Ts,nl,il]),y=new Uint32Array(4),w=new Int32Array(4),S=null,M=null,A=[],E=[],R=null;this.domElement=t,this.debug={checkShaderErrors:!0,onShaderError:null},this.autoClear=!0,this.autoClearColor=!0,this.autoClearDepth=!0,this.autoClearStencil=!0,this.sortObjects=!0,this.clippingPlanes=[],this.localClippingEnabled=!1,this.toneMapping=zn,this.toneMappingExposure=1,this.transmissionResolutionScale=1;let x=this,T=!1;this._outputColorSpace=tn;let I=0,B=0,N=null,k=-1,V=null,O=new St,z=new St,$=null,ce=new it(0),q=0,ie=t.width,Re=t.height,Ue=1,ke=null,Oe=null,Y=new St(0,0,ie,Re),ee=new St(0,0,ie,Re),_e=!1,ye=new pa,Me=!1,Xe=!1,pt=new At,Ne=new W,Ze=new St,lt={background:null,fog:null,environment:null,overrideMaterial:null,isScene:!0},be=!1;function mt(){return N===null?Ue:1}let D=n;function nt(b,U){return t.getContext(b,U)}try{let b={alpha:!0,depth:i,stencil:s,antialias:o,premultipliedAlpha:c,preserveDrawingBuffer:l,powerPreference:u,failIfMajorPerformanceCaveat:h};if("setAttribute"in t&&t.setAttribute("data-engine",`three.js r${"182"}`),t.addEventListener("webglcontextlost",ze,!1),t.addEventListener("webglcontextrestored",ut,!1),t.addEventListener("webglcontextcreationerror",rt,!1),D===null){let U="webgl2";if(D=nt(U,b),D===null)throw nt(U)?new Error("Error creating WebGL context with your selected attributes."):new Error("Error creating WebGL context.")}}catch(b){throw Be("WebGLRenderer: "+b.message),b}let Ke,et,Se,C,v,F,J,Q,Z,Pe,ue,pe,De,ne,fe,Ae,Ce,le,Ge,L,me,ae,xe,re;function te(){Ke=new Yx(D),Ke.init(),ae=new Ly(D,Ke),et=new Bx(D,Ke,e,ae),Se=new Iy(D,Ke),et.reversedDepthBuffer&&d&&Se.buffers.depth.setReversed(!0),C=new $x(D),v=new gy,F=new Dy(D,Ke,Se,v,et,ae,C),J=new zx(x),Q=new qx(x),Z=new e_(D),xe=new Ux(D,Z),Pe=new Zx(D,Z,C,xe),ue=new Qx(D,Pe,Z,C),Ge=new Kx(D,et,F),Ae=new kx(v),pe=new my(x,J,Q,Ke,et,xe,Ae),De=new Oy(x,v),ne=new xy,fe=new wy(Ke),le=new Fx(x,J,Q,Se,ue,_,c),Ce=new Ry(x,ue,et),re=new By(D,C,et,Se),L=new Ox(D,Ke,C),me=new Jx(D,Ke,C),C.programs=pe.programs,x.capabilities=et,x.extensions=Ke,x.properties=v,x.renderLists=ne,x.shadowMap=Ce,x.state=Se,x.info=C}te(),g!==Tn&&(R=new ev(g,t.width,t.height,i,s));let he=new hh(x,D);this.xr=he,this.getContext=function(){return D},this.getContextAttributes=function(){return D.getContextAttributes()},this.forceContextLoss=function(){let b=Ke.get("WEBGL_lose_context");b&&b.loseContext()},this.forceContextRestore=function(){let b=Ke.get("WEBGL_lose_context");b&&b.restoreContext()},this.getPixelRatio=function(){return Ue},this.setPixelRatio=function(b){b!==void 0&&(Ue=b,this.setSize(ie,Re,!1))},this.getSize=function(b){return b.set(ie,Re)},this.setSize=function(b,U,X=!0){if(he.isPresenting){Ve("WebGLRenderer: Can't change size while VR device is presenting.");return}ie=b,Re=U,t.width=Math.floor(b*Ue),t.height=Math.floor(U*Ue),X===!0&&(t.style.width=b+"px",t.style.height=U+"px"),R!==null&&R.setSize(t.width,t.height),this.setViewport(0,0,b,U)},this.getDrawingBufferSize=function(b){return b.set(ie*Ue,Re*Ue).floor()},this.setDrawingBufferSize=function(b,U,X){ie=b,Re=U,Ue=X,t.width=Math.floor(b*X),t.height=Math.floor(U*X),this.setViewport(0,0,b,U)},this.setEffects=function(b){if(g===Tn){console.error("THREE.WebGLRenderer: setEffects() requires outputBufferType set to HalfFloatType or FloatType.");return}if(b){for(let U=0;U<b.length;U++)if(b[U].isOutputPass===!0){console.warn("THREE.WebGLRenderer: OutputPass is not needed in setEffects(). Tone mapping and color space conversion are applied automatically.");break}}R.setEffects(b||[])},this.getCurrentViewport=function(b){return b.copy(O)},this.getViewport=function(b){return b.copy(Y)},this.setViewport=function(b,U,X,H){b.isVector4?Y.set(b.x,b.y,b.z,b.w):Y.set(b,U,X,H),Se.viewport(O.copy(Y).multiplyScalar(Ue).round())},this.getScissor=function(b){return b.copy(ee)},this.setScissor=function(b,U,X,H){b.isVector4?ee.set(b.x,b.y,b.z,b.w):ee.set(b,U,X,H),Se.scissor(z.copy(ee).multiplyScalar(Ue).round())},this.getScissorTest=function(){return _e},this.setScissorTest=function(b){Se.setScissorTest(_e=b)},this.setOpaqueSort=function(b){ke=b},this.setTransparentSort=function(b){Oe=b},this.getClearColor=function(b){return b.copy(le.getClearColor())},this.setClearColor=function(){le.setClearColor(...arguments)},this.getClearAlpha=function(){return le.getClearAlpha()},this.setClearAlpha=function(){le.setClearAlpha(...arguments)},this.clear=function(b=!0,U=!0,X=!0){let H=0;if(b){let P=!1;if(N!==null){let G=N.texture.format;P=m.has(G)}if(P){let G=N.texture.type,j=p.has(G),K=le.getClearColor(),se=le.getClearAlpha(),de=K.r,ve=K.g,oe=K.b;j?(y[0]=de,y[1]=ve,y[2]=oe,y[3]=se,D.clearBufferuiv(D.COLOR,0,y)):(w[0]=de,w[1]=ve,w[2]=oe,w[3]=se,D.clearBufferiv(D.COLOR,0,w))}else H|=D.COLOR_BUFFER_BIT}U&&(H|=D.DEPTH_BUFFER_BIT),X&&(H|=D.STENCIL_BUFFER_BIT,this.state.buffers.stencil.setMask(4294967295)),D.clear(H)},this.clearColor=function(){this.clear(!0,!1,!1)},this.clearDepth=function(){this.clear(!1,!0,!1)},this.clearStencil=function(){this.clear(!1,!1,!0)},this.dispose=function(){t.removeEventListener("webglcontextlost",ze,!1),t.removeEventListener("webglcontextrestored",ut,!1),t.removeEventListener("webglcontextcreationerror",rt,!1),le.dispose(),ne.dispose(),fe.dispose(),v.dispose(),J.dispose(),Q.dispose(),ue.dispose(),xe.dispose(),re.dispose(),pe.dispose(),he.dispose(),he.removeEventListener("sessionstart",Rs),he.removeEventListener("sessionend",Ps),Hn.stop()};function ze(b){b.preventDefault(),qu("WebGLRenderer: Context Lost."),T=!0}function ut(){qu("WebGLRenderer: Context Restored."),T=!1;let b=C.autoReset,U=Ce.enabled,X=Ce.autoUpdate,H=Ce.needsUpdate,P=Ce.type;te(),C.autoReset=b,Ce.enabled=U,Ce.autoUpdate=X,Ce.needsUpdate=H,Ce.type=P}function rt(b){Be("WebGLRenderer: A WebGL context could not be created. Reason: ",b.statusMessage)}function Jt(b){let U=b.target;U.removeEventListener("dispose",Jt),$t(U)}function $t(b){Ci(b),v.remove(b)}function Ci(b){let U=v.get(b).programs;U!==void 0&&(U.forEach(function(X){pe.releaseProgram(X)}),b.isShaderMaterial&&pe.releaseShaderCache(b))}this.renderBufferDirect=function(b,U,X,H,P,G){U===null&&(U=lt);let j=P.isMesh&&P.matrixWorld.determinant()<0,K=lr(b,U,X,H,P);Se.setMaterial(H,j);let se=X.index,de=1;if(H.wireframe===!0){if(se=Pe.getWireframeAttribute(X),se===void 0)return;de=2}let ve=X.drawRange,oe=X.attributes.position,Fe=ve.start*de,Le=(ve.start+ve.count)*de;G!==null&&(Fe=Math.max(Fe,G.start*de),Le=Math.min(Le,(G.start+G.count)*de)),se!==null?(Fe=Math.max(Fe,0),Le=Math.min(Le,se.count)):oe!=null&&(Fe=Math.max(Fe,0),Le=Math.min(Le,oe.count));let We=Le-Fe;if(We<0||We===1/0)return;xe.setup(P,H,K,X,se);let ht,Ie=L;if(se!==null&&(ht=Z.get(se),Ie=me,Ie.setIndex(ht)),P.isMesh)H.wireframe===!0?(Se.setLineWidth(H.wireframeLinewidth*mt()),Ie.setMode(D.LINES)):Ie.setMode(D.TRIANGLES);else if(P.isLine){let we=H.linewidth;we===void 0&&(we=1),Se.setLineWidth(we*mt()),P.isLineSegments?Ie.setMode(D.LINES):P.isLineLoop?Ie.setMode(D.LINE_LOOP):Ie.setMode(D.LINE_STRIP)}else P.isPoints?Ie.setMode(D.POINTS):P.isSprite&&Ie.setMode(D.TRIANGLES);if(P.isBatchedMesh)if(P._multiDrawInstances!==null)gs("WebGLRenderer: renderMultiDrawInstances has been deprecated and will be removed in r184. Append to renderMultiDraw arguments and use indirection."),Ie.renderMultiDrawInstances(P._multiDrawStarts,P._multiDrawCounts,P._multiDrawCount,P._multiDrawInstances);else if(Ke.get("WEBGL_multi_draw"))Ie.renderMultiDraw(P._multiDrawStarts,P._multiDrawCounts,P._multiDrawCount);else{let we=P._multiDrawStarts,$e=P._multiDrawCounts,Je=P._multiDrawCount,Kt=se?Z.get(se).bytesPerElement:1,ci=v.get(H).currentProgram.getUniforms();for(let Lt=0;Lt<Je;Lt++)ci.setValue(D,"_gl_DrawID",Lt),Ie.render(we[Lt]/Kt,$e[Lt])}else if(P.isInstancedMesh)Ie.renderInstances(Fe,We,P.count);else if(X.isInstancedBufferGeometry){let we=X._maxInstanceCount!==void 0?X._maxInstanceCount:1/0,$e=Math.min(X.instanceCount,we);Ie.renderInstances(Fe,We,$e)}else Ie.render(Fe,We)};function Ia(b,U,X){b.transparent===!0&&b.side===ei&&b.forceSinglePass===!1?(b.side=on,b.needsUpdate=!0,Vr(b,U,X),b.side=Mi,b.needsUpdate=!0,Vr(b,U,X),b.side=ei):Vr(b,U,X)}this.compile=function(b,U,X=null){X===null&&(X=b),M=fe.get(X),M.init(U),E.push(M),X.traverseVisible(function(P){P.isLight&&P.layers.test(U.layers)&&(M.pushLight(P),P.castShadow&&M.pushShadow(P))}),b!==X&&b.traverseVisible(function(P){P.isLight&&P.layers.test(U.layers)&&(M.pushLight(P),P.castShadow&&M.pushShadow(P))}),M.setupLights();let H=new Set;return b.traverse(function(P){if(!(P.isMesh||P.isPoints||P.isLine||P.isSprite))return;let G=P.material;if(G)if(Array.isArray(G))for(let j=0;j<G.length;j++){let K=G[j];Ia(K,X,P),H.add(K)}else Ia(G,X,P),H.add(G)}),M=E.pop(),H},this.compileAsync=function(b,U,X=null){let H=this.compile(b,U,X);return new Promise(P=>{function G(){if(H.forEach(function(j){v.get(j).currentProgram.isReady()&&H.delete(j)}),H.size===0){P(b);return}setTimeout(G,10)}Ke.get("KHR_parallel_shader_compile")!==null?G():setTimeout(G,10)})};let Ri=null;function zr(b){Ri&&Ri(b)}function Rs(){Hn.stop()}function Ps(){Hn.start()}let Hn=new Qf;Hn.setAnimationLoop(zr),typeof self<"u"&&Hn.setContext(self),this.setAnimationLoop=function(b){Ri=b,he.setAnimationLoop(b),b===null?Hn.stop():Hn.start()},he.addEventListener("sessionstart",Rs),he.addEventListener("sessionend",Ps),this.render=function(b,U){if(U!==void 0&&U.isCamera!==!0){Be("WebGLRenderer.render: camera is not an instance of THREE.Camera.");return}if(T===!0)return;let X=he.enabled===!0&&he.isPresenting===!0,H=R!==null&&(N===null||X)&&R.begin(x,N);if(b.matrixWorldAutoUpdate===!0&&b.updateMatrixWorld(),U.parent===null&&U.matrixWorldAutoUpdate===!0&&U.updateMatrixWorld(),he.enabled===!0&&he.isPresenting===!0&&(R===null||R.isCompositing()===!1)&&(he.cameraAutoUpdate===!0&&he.updateCamera(U),U=he.getCamera()),b.isScene===!0&&b.onBeforeRender(x,b,U,N),M=fe.get(b,E.length),M.init(U),E.push(M),pt.multiplyMatrices(U.projectionMatrix,U.matrixWorldInverse),ye.setFromProjectionMatrix(pt,kn,U.reversedDepth),Xe=this.localClippingEnabled,Me=Ae.init(this.clippingPlanes,Xe),S=ne.get(b,A.length),S.init(),A.push(S),he.enabled===!0&&he.isPresenting===!0){let j=x.xr.getDepthSensingMesh();j!==null&&Pi(j,U,-1/0,x.sortObjects)}Pi(b,U,0,x.sortObjects),S.finish(),x.sortObjects===!0&&S.sort(ke,Oe),be=he.enabled===!1||he.isPresenting===!1||he.hasDepthSensing()===!1,be&&le.addToRenderList(S,b),this.info.render.frame++,Me===!0&&Ae.beginShadows();let P=M.state.shadowsArray;if(Ce.render(P,b,U),Me===!0&&Ae.endShadows(),this.info.autoReset===!0&&this.info.reset(),(H&&R.hasRenderPass())===!1){let j=S.opaque,K=S.transmissive;if(M.setupLights(),U.isArrayCamera){let se=U.cameras;if(K.length>0)for(let de=0,ve=se.length;de<ve;de++){let oe=se[de];Ds(j,K,b,oe)}be&&le.render(b);for(let de=0,ve=se.length;de<ve;de++){let oe=se[de];Is(S,b,oe,oe.viewport)}}else K.length>0&&Ds(j,K,b,U),be&&le.render(b),Is(S,b,U)}N!==null&&B===0&&(F.updateMultisampleRenderTarget(N),F.updateRenderTargetMipmap(N)),H&&R.end(x),b.isScene===!0&&b.onAfterRender(x,b,U),xe.resetDefaultState(),k=-1,V=null,E.pop(),E.length>0?(M=E[E.length-1],Me===!0&&Ae.setGlobalState(x.clippingPlanes,M.state.camera)):M=null,A.pop(),A.length>0?S=A[A.length-1]:S=null};function Pi(b,U,X,H){if(b.visible===!1)return;if(b.layers.test(U.layers)){if(b.isGroup)X=b.renderOrder;else if(b.isLOD)b.autoUpdate===!0&&b.update(U);else if(b.isLight)M.pushLight(b),b.castShadow&&M.pushShadow(b);else if(b.isSprite){if(!b.frustumCulled||ye.intersectsSprite(b)){H&&Ze.setFromMatrixPosition(b.matrixWorld).applyMatrix4(pt);let j=ue.update(b),K=b.material;K.visible&&S.push(b,j,K,X,Ze.z,null)}}else if((b.isMesh||b.isLine||b.isPoints)&&(!b.frustumCulled||ye.intersectsObject(b))){let j=ue.update(b),K=b.material;if(H&&(b.boundingSphere!==void 0?(b.boundingSphere===null&&b.computeBoundingSphere(),Ze.copy(b.boundingSphere.center)):(j.boundingSphere===null&&j.computeBoundingSphere(),Ze.copy(j.boundingSphere.center)),Ze.applyMatrix4(b.matrixWorld).applyMatrix4(pt)),Array.isArray(K)){let se=j.groups;for(let de=0,ve=se.length;de<ve;de++){let oe=se[de],Fe=K[oe.materialIndex];Fe&&Fe.visible&&S.push(b,j,Fe,X,Ze.z,oe)}}else K.visible&&S.push(b,j,K,X,Ze.z,null)}}let G=b.children;for(let j=0,K=G.length;j<K;j++)Pi(G[j],U,X,H)}function Is(b,U,X,H){let{opaque:P,transmissive:G,transparent:j}=b;M.setupLightsView(X),Me===!0&&Ae.setGlobalState(x.clippingPlanes,X),H&&Se.viewport(O.copy(H)),P.length>0&&or(P,U,X),G.length>0&&or(G,U,X),j.length>0&&or(j,U,X),Se.buffers.depth.setTest(!0),Se.buffers.depth.setMask(!0),Se.buffers.color.setMask(!0),Se.setPolygonOffset(!1)}function Ds(b,U,X,H){if((X.isScene===!0?X.overrideMaterial:null)!==null)return;if(M.state.transmissionRenderTarget[H.id]===void 0){let Fe=Ke.has("EXT_color_buffer_half_float")||Ke.has("EXT_color_buffer_float");M.state.transmissionRenderTarget[H.id]=new rn(1,1,{generateMipmaps:!0,type:Fe?ii:Tn,minFilter:ni,samples:et.samples,stencilBuffer:s,resolveDepthBuffer:!1,resolveStencilBuffer:!1,colorSpace:tt.workingColorSpace})}let G=M.state.transmissionRenderTarget[H.id],j=H.viewport||O;G.setSize(j.z*x.transmissionResolutionScale,j.w*x.transmissionResolutionScale);let K=x.getRenderTarget(),se=x.getActiveCubeFace(),de=x.getActiveMipmapLevel();x.setRenderTarget(G),x.getClearColor(ce),q=x.getClearAlpha(),q<1&&x.setClearColor(16777215,.5),x.clear(),be&&le.render(X);let ve=x.toneMapping;x.toneMapping=zn;let oe=H.viewport;if(H.viewport!==void 0&&(H.viewport=void 0),M.setupLightsView(H),Me===!0&&Ae.setGlobalState(x.clippingPlanes,H),or(b,X,H),F.updateMultisampleRenderTarget(G),F.updateRenderTargetMipmap(G),Ke.has("WEBGL_multisampled_render_to_texture")===!1){let Fe=!1;for(let Le=0,We=U.length;Le<We;Le++){let ht=U[Le],{object:Ie,geometry:we,material:$e,group:Je}=ht;if($e.side===ei&&Ie.layers.test(H.layers)){let Kt=$e.side;$e.side=on,$e.needsUpdate=!0,Ls(Ie,X,H,we,$e,Je),$e.side=Kt,$e.needsUpdate=!0,Fe=!0}}Fe===!0&&(F.updateMultisampleRenderTarget(G),F.updateRenderTargetMipmap(G))}x.setRenderTarget(K,se,de),x.setClearColor(ce,q),oe!==void 0&&(H.viewport=oe),x.toneMapping=ve}function or(b,U,X){let H=U.isScene===!0?U.overrideMaterial:null;for(let P=0,G=b.length;P<G;P++){let j=b[P],{object:K,geometry:se,group:de}=j,ve=j.material;ve.allowOverride===!0&&H!==null&&(ve=H),K.layers.test(X.layers)&&Ls(K,U,X,se,ve,de)}}function Ls(b,U,X,H,P,G){b.onBeforeRender(x,U,X,H,P,G),b.modelViewMatrix.multiplyMatrices(X.matrixWorldInverse,b.matrixWorld),b.normalMatrix.getNormalMatrix(b.modelViewMatrix),P.onBeforeRender(x,U,X,H,b,G),P.transparent===!0&&P.side===ei&&P.forceSinglePass===!1?(P.side=on,P.needsUpdate=!0,x.renderBufferDirect(X,U,H,P,b,G),P.side=Mi,P.needsUpdate=!0,x.renderBufferDirect(X,U,H,P,b,G),P.side=ei):x.renderBufferDirect(X,U,H,P,b,G),b.onAfterRender(x,U,X,H,P,G)}function Vr(b,U,X){U.isScene!==!0&&(U=lt);let H=v.get(b),P=M.state.lights,G=M.state.shadowsArray,j=P.state.version,K=pe.getParameters(b,P.state,G,U,X),se=pe.getProgramCacheKey(K),de=H.programs;H.environment=b.isMeshStandardMaterial?U.environment:null,H.fog=U.fog,H.envMap=(b.isMeshStandardMaterial?Q:J).get(b.envMap||H.environment),H.envMapRotation=H.environment!==null&&b.envMap===null?U.environmentRotation:b.envMapRotation,de===void 0&&(b.addEventListener("dispose",Jt),de=new Map,H.programs=de);let ve=de.get(se);if(ve!==void 0){if(H.currentProgram===ve&&H.lightsStateVersion===j)return Ns(b,K),ve}else K.uniforms=pe.getUniforms(b),b.onBeforeCompile(K,x),ve=pe.acquireProgram(K,se),de.set(se,ve),H.uniforms=K.uniforms;let oe=H.uniforms;return(!b.isShaderMaterial&&!b.isRawShaderMaterial||b.clipping===!0)&&(oe.clippingPlanes=Ae.uniform),Ns(b,K),H.needsLights=Us(b),H.lightsStateVersion=j,H.needsLights&&(oe.ambientLightColor.value=P.state.ambient,oe.lightProbe.value=P.state.probe,oe.directionalLights.value=P.state.directional,oe.directionalLightShadows.value=P.state.directionalShadow,oe.spotLights.value=P.state.spot,oe.spotLightShadows.value=P.state.spotShadow,oe.rectAreaLights.value=P.state.rectArea,oe.ltc_1.value=P.state.rectAreaLTC1,oe.ltc_2.value=P.state.rectAreaLTC2,oe.pointLights.value=P.state.point,oe.pointLightShadows.value=P.state.pointShadow,oe.hemisphereLights.value=P.state.hemi,oe.directionalShadowMap.value=P.state.directionalShadowMap,oe.directionalShadowMatrix.value=P.state.directionalShadowMatrix,oe.spotShadowMap.value=P.state.spotShadowMap,oe.spotLightMatrix.value=P.state.spotLightMatrix,oe.spotLightMap.value=P.state.spotLightMap,oe.pointShadowMap.value=P.state.pointShadowMap,oe.pointShadowMatrix.value=P.state.pointShadowMatrix),H.currentProgram=ve,H.uniformsList=null,ve}function Da(b){if(b.uniformsList===null){let U=b.currentProgram.getUniforms();b.uniformsList=Es.seqWithValue(U.seq,b.uniforms)}return b.uniformsList}function Ns(b,U){let X=v.get(b);X.outputColorSpace=U.outputColorSpace,X.batching=U.batching,X.batchingColor=U.batchingColor,X.instancing=U.instancing,X.instancingColor=U.instancingColor,X.instancingMorph=U.instancingMorph,X.skinning=U.skinning,X.morphTargets=U.morphTargets,X.morphNormals=U.morphNormals,X.morphColors=U.morphColors,X.morphTargetsCount=U.morphTargetsCount,X.numClippingPlanes=U.numClippingPlanes,X.numIntersection=U.numClipIntersection,X.vertexAlphas=U.vertexAlphas,X.vertexTangents=U.vertexTangents,X.toneMapping=U.toneMapping}function lr(b,U,X,H,P){U.isScene!==!0&&(U=lt),F.resetTextureUnits();let G=U.fog,j=H.isMeshStandardMaterial?U.environment:null,K=N===null?x.outputColorSpace:N.isXRRenderTarget===!0?N.texture.colorSpace:Cr,se=(H.isMeshStandardMaterial?Q:J).get(H.envMap||j),de=H.vertexColors===!0&&!!X.attributes.color&&X.attributes.color.itemSize===4,ve=!!X.attributes.tangent&&(!!H.normalMap||H.anisotropy>0),oe=!!X.morphAttributes.position,Fe=!!X.morphAttributes.normal,Le=!!X.morphAttributes.color,We=zn;H.toneMapped&&(N===null||N.isXRRenderTarget===!0)&&(We=x.toneMapping);let ht=X.morphAttributes.position||X.morphAttributes.normal||X.morphAttributes.color,Ie=ht!==void 0?ht.length:0,we=v.get(H),$e=M.state.lights;if(Me===!0&&(Xe===!0||b!==V)){let Nt=b===V&&H.id===k;Ae.setState(H,b,Nt)}let Je=!1;H.version===we.__version?(we.needsLights&&we.lightsStateVersion!==$e.state.version||we.outputColorSpace!==K||P.isBatchedMesh&&we.batching===!1||!P.isBatchedMesh&&we.batching===!0||P.isBatchedMesh&&we.batchingColor===!0&&P.colorTexture===null||P.isBatchedMesh&&we.batchingColor===!1&&P.colorTexture!==null||P.isInstancedMesh&&we.instancing===!1||!P.isInstancedMesh&&we.instancing===!0||P.isSkinnedMesh&&we.skinning===!1||!P.isSkinnedMesh&&we.skinning===!0||P.isInstancedMesh&&we.instancingColor===!0&&P.instanceColor===null||P.isInstancedMesh&&we.instancingColor===!1&&P.instanceColor!==null||P.isInstancedMesh&&we.instancingMorph===!0&&P.morphTexture===null||P.isInstancedMesh&&we.instancingMorph===!1&&P.morphTexture!==null||we.envMap!==se||H.fog===!0&&we.fog!==G||we.numClippingPlanes!==void 0&&(we.numClippingPlanes!==Ae.numPlanes||we.numIntersection!==Ae.numIntersection)||we.vertexAlphas!==de||we.vertexTangents!==ve||we.morphTargets!==oe||we.morphNormals!==Fe||we.morphColors!==Le||we.toneMapping!==We||we.morphTargetsCount!==Ie)&&(Je=!0):(Je=!0,we.__version=H.version);let Kt=we.currentProgram;Je===!0&&(Kt=Vr(H,U,P));let ci=!1,Lt=!1,Nn=!1,at=Kt.getUniforms(),Bt=we.uniforms;if(Se.useProgram(Kt.program)&&(ci=!0,Lt=!0,Nn=!0),H.id!==k&&(k=H.id,Lt=!0),ci||V!==b){Se.buffers.depth.getReversed()&&b.reversedDepth!==!0&&(b._reversedDepth=!0,b.updateProjectionMatrix()),at.setValue(D,"projectionMatrix",b.projectionMatrix),at.setValue(D,"viewMatrix",b.matrixWorldInverse);let kt=at.map.cameraPosition;kt!==void 0&&kt.setValue(D,Ne.setFromMatrixPosition(b.matrixWorld)),et.logarithmicDepthBuffer&&at.setValue(D,"logDepthBufFC",2/(Math.log(b.far+1)/Math.LN2)),(H.isMeshPhongMaterial||H.isMeshToonMaterial||H.isMeshLambertMaterial||H.isMeshBasicMaterial||H.isMeshStandardMaterial||H.isShaderMaterial)&&at.setValue(D,"isOrthographic",b.isOrthographicCamera===!0),V!==b&&(V=b,Lt=!0,Nn=!0)}if(we.needsLights&&($e.state.directionalShadowMap.length>0&&at.setValue(D,"directionalShadowMap",$e.state.directionalShadowMap,F),$e.state.spotShadowMap.length>0&&at.setValue(D,"spotShadowMap",$e.state.spotShadowMap,F),$e.state.pointShadowMap.length>0&&at.setValue(D,"pointShadowMap",$e.state.pointShadowMap,F)),P.isSkinnedMesh){at.setOptional(D,P,"bindMatrix"),at.setOptional(D,P,"bindMatrixInverse");let Nt=P.skeleton;Nt&&(Nt.boneTexture===null&&Nt.computeBoneTexture(),at.setValue(D,"boneTexture",Nt.boneTexture,F))}P.isBatchedMesh&&(at.setOptional(D,P,"batchingTexture"),at.setValue(D,"batchingTexture",P._matricesTexture,F),at.setOptional(D,P,"batchingIdTexture"),at.setValue(D,"batchingIdTexture",P._indirectTexture,F),at.setOptional(D,P,"batchingColorTexture"),P._colorsTexture!==null&&at.setValue(D,"batchingColorTexture",P._colorsTexture,F));let Qt=X.morphAttributes;if((Qt.position!==void 0||Qt.normal!==void 0||Qt.color!==void 0)&&Ge.update(P,X,Kt),(Lt||we.receiveShadow!==P.receiveShadow)&&(we.receiveShadow=P.receiveShadow,at.setValue(D,"receiveShadow",P.receiveShadow)),H.isMeshGouraudMaterial&&H.envMap!==null&&(Bt.envMap.value=se,Bt.flipEnvMap.value=se.isCubeTexture&&se.isRenderTargetTexture===!1?-1:1),H.isMeshStandardMaterial&&H.envMap===null&&U.environment!==null&&(Bt.envMapIntensity.value=U.environmentIntensity),Bt.dfgLUT!==void 0&&(Bt.dfgLUT.value=zy()),Lt&&(at.setValue(D,"toneMappingExposure",x.toneMappingExposure),we.needsLights&&Fs(Bt,Nn),G&&H.fog===!0&&De.refreshFogUniforms(Bt,G),De.refreshMaterialUniforms(Bt,H,Ue,Re,M.state.transmissionRenderTarget[b.id]),Es.upload(D,Da(we),Bt,F)),H.isShaderMaterial&&H.uniformsNeedUpdate===!0&&(Es.upload(D,Da(we),Bt,F),H.uniformsNeedUpdate=!1),H.isSpriteMaterial&&at.setValue(D,"center",P.center),at.setValue(D,"modelViewMatrix",P.modelViewMatrix),at.setValue(D,"normalMatrix",P.normalMatrix),at.setValue(D,"modelMatrix",P.matrixWorld),H.isShaderMaterial||H.isRawShaderMaterial){let Nt=H.uniformsGroups;for(let kt=0,Gr=Nt.length;kt<Gr;kt++){let ui=Nt[kt];re.update(ui,Kt),re.bind(ui,Kt)}}return Kt}function Fs(b,U){b.ambientLightColor.needsUpdate=U,b.lightProbe.needsUpdate=U,b.directionalLights.needsUpdate=U,b.directionalLightShadows.needsUpdate=U,b.pointLights.needsUpdate=U,b.pointLightShadows.needsUpdate=U,b.spotLights.needsUpdate=U,b.spotLightShadows.needsUpdate=U,b.rectAreaLights.needsUpdate=U,b.hemisphereLights.needsUpdate=U}function Us(b){return b.isMeshLambertMaterial||b.isMeshToonMaterial||b.isMeshPhongMaterial||b.isMeshStandardMaterial||b.isShadowMaterial||b.isShaderMaterial&&b.lights===!0}this.getActiveCubeFace=function(){return I},this.getActiveMipmapLevel=function(){return B},this.getRenderTarget=function(){return N},this.setRenderTargetTextures=function(b,U,X){let H=v.get(b);H.__autoAllocateDepthBuffer=b.resolveDepthBuffer===!1,H.__autoAllocateDepthBuffer===!1&&(H.__useRenderToTexture=!1),v.get(b.texture).__webglTexture=U,v.get(b.depthTexture).__webglTexture=H.__autoAllocateDepthBuffer?void 0:X,H.__hasExternalTextures=!0},this.setRenderTargetFramebuffer=function(b,U){let X=v.get(b);X.__webglFramebuffer=U,X.__useDefaultFramebuffer=U===void 0};let La=D.createFramebuffer();this.setRenderTarget=function(b,U=0,X=0){N=b,I=U,B=X;let H=null,P=!1,G=!1;if(b){let K=v.get(b);if(K.__useDefaultFramebuffer!==void 0){Se.bindFramebuffer(D.FRAMEBUFFER,K.__webglFramebuffer),O.copy(b.viewport),z.copy(b.scissor),$=b.scissorTest,Se.viewport(O),Se.scissor(z),Se.setScissorTest($),k=-1;return}else if(K.__webglFramebuffer===void 0)F.setupRenderTarget(b);else if(K.__hasExternalTextures)F.rebindTextures(b,v.get(b.texture).__webglTexture,v.get(b.depthTexture).__webglTexture);else if(b.depthBuffer){let ve=b.depthTexture;if(K.__boundDepthTexture!==ve){if(ve!==null&&v.has(ve)&&(b.width!==ve.image.width||b.height!==ve.image.height))throw new Error("WebGLRenderTarget: Attached DepthTexture is initialized to the incorrect size.");F.setupDepthRenderbuffer(b)}}let se=b.texture;(se.isData3DTexture||se.isDataArrayTexture||se.isCompressedArrayTexture)&&(G=!0);let de=v.get(b).__webglFramebuffer;b.isWebGLCubeRenderTarget?(Array.isArray(de[U])?H=de[U][X]:H=de[U],P=!0):b.samples>0&&F.useMultisampledRTT(b)===!1?H=v.get(b).__webglMultisampledFramebuffer:Array.isArray(de)?H=de[X]:H=de,O.copy(b.viewport),z.copy(b.scissor),$=b.scissorTest}else O.copy(Y).multiplyScalar(Ue).floor(),z.copy(ee).multiplyScalar(Ue).floor(),$=_e;if(X!==0&&(H=La),Se.bindFramebuffer(D.FRAMEBUFFER,H)&&Se.drawBuffers(b,H),Se.viewport(O),Se.scissor(z),Se.setScissorTest($),P){let K=v.get(b.texture);D.framebufferTexture2D(D.FRAMEBUFFER,D.COLOR_ATTACHMENT0,D.TEXTURE_CUBE_MAP_POSITIVE_X+U,K.__webglTexture,X)}else if(G){let K=U;for(let se=0;se<b.textures.length;se++){let de=v.get(b.textures[se]);D.framebufferTextureLayer(D.FRAMEBUFFER,D.COLOR_ATTACHMENT0+se,de.__webglTexture,X,K)}}else if(b!==null&&X!==0){let K=v.get(b.texture);D.framebufferTexture2D(D.FRAMEBUFFER,D.COLOR_ATTACHMENT0,D.TEXTURE_2D,K.__webglTexture,X)}k=-1},this.readRenderTargetPixels=function(b,U,X,H,P,G,j,K=0){if(!(b&&b.isWebGLRenderTarget)){Be("WebGLRenderer.readRenderTargetPixels: renderTarget is not THREE.WebGLRenderTarget.");return}let se=v.get(b).__webglFramebuffer;if(b.isWebGLCubeRenderTarget&&j!==void 0&&(se=se[j]),se){Se.bindFramebuffer(D.FRAMEBUFFER,se);try{let de=b.textures[K],ve=de.format,oe=de.type;if(!et.textureFormatReadable(ve)){Be("WebGLRenderer.readRenderTargetPixels: renderTarget is not in RGBA or implementation defined format.");return}if(!et.textureTypeReadable(oe)){Be("WebGLRenderer.readRenderTargetPixels: renderTarget is not in UnsignedByteType or implementation defined type.");return}U>=0&&U<=b.width-H&&X>=0&&X<=b.height-P&&(b.textures.length>1&&D.readBuffer(D.COLOR_ATTACHMENT0+K),D.readPixels(U,X,H,P,ae.convert(ve),ae.convert(oe),G))}finally{let de=N!==null?v.get(N).__webglFramebuffer:null;Se.bindFramebuffer(D.FRAMEBUFFER,de)}}},this.readRenderTargetPixelsAsync=async function(b,U,X,H,P,G,j,K=0){if(!(b&&b.isWebGLRenderTarget))throw new Error("THREE.WebGLRenderer.readRenderTargetPixels: renderTarget is not THREE.WebGLRenderTarget.");let se=v.get(b).__webglFramebuffer;if(b.isWebGLCubeRenderTarget&&j!==void 0&&(se=se[j]),se)if(U>=0&&U<=b.width-H&&X>=0&&X<=b.height-P){Se.bindFramebuffer(D.FRAMEBUFFER,se);let de=b.textures[K],ve=de.format,oe=de.type;if(!et.textureFormatReadable(ve))throw new Error("THREE.WebGLRenderer.readRenderTargetPixelsAsync: renderTarget is not in RGBA or implementation defined format.");if(!et.textureTypeReadable(oe))throw new Error("THREE.WebGLRenderer.readRenderTargetPixelsAsync: renderTarget is not in UnsignedByteType or implementation defined type.");let Fe=D.createBuffer();D.bindBuffer(D.PIXEL_PACK_BUFFER,Fe),D.bufferData(D.PIXEL_PACK_BUFFER,G.byteLength,D.STREAM_READ),b.textures.length>1&&D.readBuffer(D.COLOR_ATTACHMENT0+K),D.readPixels(U,X,H,P,ae.convert(ve),ae.convert(oe),0);let Le=N!==null?v.get(N).__webglFramebuffer:null;Se.bindFramebuffer(D.FRAMEBUFFER,Le);let We=D.fenceSync(D.SYNC_GPU_COMMANDS_COMPLETE,0);return D.flush(),await Af(D,We,4),D.bindBuffer(D.PIXEL_PACK_BUFFER,Fe),D.getBufferSubData(D.PIXEL_PACK_BUFFER,0,G),D.deleteBuffer(Fe),D.deleteSync(We),G}else throw new Error("THREE.WebGLRenderer.readRenderTargetPixelsAsync: requested read bounds are out of range.")},this.copyFramebufferToTexture=function(b,U=null,X=0){let H=Math.pow(2,-X),P=Math.floor(b.image.width*H),G=Math.floor(b.image.height*H),j=U!==null?U.x:0,K=U!==null?U.y:0;F.setTexture2D(b,0),D.copyTexSubImage2D(D.TEXTURE_2D,X,0,0,j,K,P,G),Se.unbindTexture()};let Os=D.createFramebuffer(),tc=D.createFramebuffer();this.copyTextureToTexture=function(b,U,X=null,H=null,P=0,G=null){G===null&&(P!==0?(gs("WebGLRenderer: copyTextureToTexture function signature has changed to support src and dst mipmap levels."),G=P,P=0):G=0);let j,K,se,de,ve,oe,Fe,Le,We,ht=b.isCompressedTexture?b.mipmaps[G]:b.image;if(X!==null)j=X.max.x-X.min.x,K=X.max.y-X.min.y,se=X.isBox3?X.max.z-X.min.z:1,de=X.min.x,ve=X.min.y,oe=X.isBox3?X.min.z:0;else{let Qt=Math.pow(2,-P);j=Math.floor(ht.width*Qt),K=Math.floor(ht.height*Qt),b.isDataArrayTexture?se=ht.depth:b.isData3DTexture?se=Math.floor(ht.depth*Qt):se=1,de=0,ve=0,oe=0}H!==null?(Fe=H.x,Le=H.y,We=H.z):(Fe=0,Le=0,We=0);let Ie=ae.convert(U.format),we=ae.convert(U.type),$e;U.isData3DTexture?(F.setTexture3D(U,0),$e=D.TEXTURE_3D):U.isDataArrayTexture||U.isCompressedArrayTexture?(F.setTexture2DArray(U,0),$e=D.TEXTURE_2D_ARRAY):(F.setTexture2D(U,0),$e=D.TEXTURE_2D),D.pixelStorei(D.UNPACK_FLIP_Y_WEBGL,U.flipY),D.pixelStorei(D.UNPACK_PREMULTIPLY_ALPHA_WEBGL,U.premultiplyAlpha),D.pixelStorei(D.UNPACK_ALIGNMENT,U.unpackAlignment);let Je=D.getParameter(D.UNPACK_ROW_LENGTH),Kt=D.getParameter(D.UNPACK_IMAGE_HEIGHT),ci=D.getParameter(D.UNPACK_SKIP_PIXELS),Lt=D.getParameter(D.UNPACK_SKIP_ROWS),Nn=D.getParameter(D.UNPACK_SKIP_IMAGES);D.pixelStorei(D.UNPACK_ROW_LENGTH,ht.width),D.pixelStorei(D.UNPACK_IMAGE_HEIGHT,ht.height),D.pixelStorei(D.UNPACK_SKIP_PIXELS,de),D.pixelStorei(D.UNPACK_SKIP_ROWS,ve),D.pixelStorei(D.UNPACK_SKIP_IMAGES,oe);let at=b.isDataArrayTexture||b.isData3DTexture,Bt=U.isDataArrayTexture||U.isData3DTexture;if(b.isDepthTexture){let Qt=v.get(b),Nt=v.get(U),kt=v.get(Qt.__renderTarget),Gr=v.get(Nt.__renderTarget);Se.bindFramebuffer(D.READ_FRAMEBUFFER,kt.__webglFramebuffer),Se.bindFramebuffer(D.DRAW_FRAMEBUFFER,Gr.__webglFramebuffer);for(let ui=0;ui<se;ui++)at&&(D.framebufferTextureLayer(D.READ_FRAMEBUFFER,D.COLOR_ATTACHMENT0,v.get(b).__webglTexture,P,oe+ui),D.framebufferTextureLayer(D.DRAW_FRAMEBUFFER,D.COLOR_ATTACHMENT0,v.get(U).__webglTexture,G,We+ui)),D.blitFramebuffer(de,ve,j,K,Fe,Le,j,K,D.DEPTH_BUFFER_BIT,D.NEAREST);Se.bindFramebuffer(D.READ_FRAMEBUFFER,null),Se.bindFramebuffer(D.DRAW_FRAMEBUFFER,null)}else if(P!==0||b.isRenderTargetTexture||v.has(b)){let Qt=v.get(b),Nt=v.get(U);Se.bindFramebuffer(D.READ_FRAMEBUFFER,Os),Se.bindFramebuffer(D.DRAW_FRAMEBUFFER,tc);for(let kt=0;kt<se;kt++)at?D.framebufferTextureLayer(D.READ_FRAMEBUFFER,D.COLOR_ATTACHMENT0,Qt.__webglTexture,P,oe+kt):D.framebufferTexture2D(D.READ_FRAMEBUFFER,D.COLOR_ATTACHMENT0,D.TEXTURE_2D,Qt.__webglTexture,P),Bt?D.framebufferTextureLayer(D.DRAW_FRAMEBUFFER,D.COLOR_ATTACHMENT0,Nt.__webglTexture,G,We+kt):D.framebufferTexture2D(D.DRAW_FRAMEBUFFER,D.COLOR_ATTACHMENT0,D.TEXTURE_2D,Nt.__webglTexture,G),P!==0?D.blitFramebuffer(de,ve,j,K,Fe,Le,j,K,D.COLOR_BUFFER_BIT,D.NEAREST):Bt?D.copyTexSubImage3D($e,G,Fe,Le,We+kt,de,ve,j,K):D.copyTexSubImage2D($e,G,Fe,Le,de,ve,j,K);Se.bindFramebuffer(D.READ_FRAMEBUFFER,null),Se.bindFramebuffer(D.DRAW_FRAMEBUFFER,null)}else Bt?b.isDataTexture||b.isData3DTexture?D.texSubImage3D($e,G,Fe,Le,We,j,K,se,Ie,we,ht.data):U.isCompressedArrayTexture?D.compressedTexSubImage3D($e,G,Fe,Le,We,j,K,se,Ie,ht.data):D.texSubImage3D($e,G,Fe,Le,We,j,K,se,Ie,we,ht):b.isDataTexture?D.texSubImage2D(D.TEXTURE_2D,G,Fe,Le,j,K,Ie,we,ht.data):b.isCompressedTexture?D.compressedTexSubImage2D(D.TEXTURE_2D,G,Fe,Le,ht.width,ht.height,Ie,ht.data):D.texSubImage2D(D.TEXTURE_2D,G,Fe,Le,j,K,Ie,we,ht);D.pixelStorei(D.UNPACK_ROW_LENGTH,Je),D.pixelStorei(D.UNPACK_IMAGE_HEIGHT,Kt),D.pixelStorei(D.UNPACK_SKIP_PIXELS,ci),D.pixelStorei(D.UNPACK_SKIP_ROWS,Lt),D.pixelStorei(D.UNPACK_SKIP_IMAGES,Nn),G===0&&U.generateMipmaps&&D.generateMipmap($e),Se.unbindTexture()},this.initRenderTarget=function(b){v.get(b).__webglFramebuffer===void 0&&F.setupRenderTarget(b)},this.initTexture=function(b){b.isCubeTexture?F.setTextureCube(b,0):b.isData3DTexture?F.setTexture3D(b,0):b.isDataArrayTexture||b.isCompressedArrayTexture?F.setTexture2DArray(b,0):F.setTexture2D(b,0),Se.unbindTexture()},this.resetState=function(){I=0,B=0,N=null,Se.reset(),xe.reset()},typeof __THREE_DEVTOOLS__<"u"&&__THREE_DEVTOOLS__.dispatchEvent(new CustomEvent("observe",{detail:this}))}get coordinateSystem(){return kn}get outputColorSpace(){return this._outputColorSpace}set outputColorSpace(e){this._outputColorSpace=e;let t=this.getContext();t.drawingBufferColorSpace=tt._getDrawingBufferColorSpace(e),t.unpackColorSpace=tt._getUnpackColorSpace()}};function ip(r){var e,t,n="";if(typeof r=="string"||typeof r=="number")n+=r;else if(typeof r=="object")if(Array.isArray(r)){var i=r.length;for(e=0;e<i;e++)r[e]&&(t=ip(r[e]))&&(n&&(n+=" "),n+=t)}else for(t in r)r[t]&&(n&&(n+=" "),n+=t);return n}function rp(){for(var r,e,t=0,n="",i=arguments.length;t<i;t++)(r=arguments[t])&&(e=ip(r))&&(n&&(n+=" "),n+=e);return n}var Gy=(r,e)=>{let t=new Array(r.length+e.length);for(let n=0;n<r.length;n++)t[n]=r[n];for(let n=0;n<e.length;n++)t[r.length+n]=e[n];return t},Hy=(r,e)=>({classGroupId:r,validator:e}),up=(r=new Map,e=null,t)=>({nextPart:r,validators:e,classGroupId:t});var sp=[],Wy="arbitrary..",Xy=r=>{let e=Yy(r),{conflictingClassGroups:t,conflictingClassGroupModifiers:n}=r;return{getClassGroupId:a=>{if(a.startsWith("[")&&a.endsWith("]"))return qy(a);let o=a.split("-"),c=o[0]===""&&o.length>1?1:0;return hp(o,c,e)},getConflictingClassGroupIds:(a,o)=>{if(o){let c=n[a],l=t[a];return c?l?Gy(l,c):c:l||sp}return t[a]||sp}}},hp=(r,e,t)=>{if(r.length-e===0)return t.classGroupId;let i=r[e],s=t.nextPart.get(i);if(s){let l=hp(r,e+1,s);if(l)return l}let a=t.validators;if(a===null)return;let o=e===0?r.join("-"):r.slice(e).join("-"),c=a.length;for(let l=0;l<c;l++){let u=a[l];if(u.validator(o))return u.classGroupId}},qy=r=>r.slice(1,-1).indexOf(":")===-1?void 0:(()=>{let e=r.slice(1,-1),t=e.indexOf(":"),n=e.slice(0,t);return n?Wy+n:void 0})(),Yy=r=>{let{theme:e,classGroups:t}=r;return Zy(t,e)},Zy=(r,e)=>{let t=up();for(let n in r){let i=r[n];fh(i,t,n,e)}return t},fh=(r,e,t,n)=>{let i=r.length;for(let s=0;s<i;s++){let a=r[s];Jy(a,e,t,n)}},Jy=(r,e,t,n)=>{if(typeof r=="string"){$y(r,e,t);return}if(typeof r=="function"){Ky(r,e,t,n);return}Qy(r,e,t,n)},$y=(r,e,t)=>{let n=r===""?e:dp(e,r);n.classGroupId=t},Ky=(r,e,t,n)=>{if(jy(r)){fh(r(n),e,t,n);return}e.validators===null&&(e.validators=[]),e.validators.push(Hy(t,r))},Qy=(r,e,t,n)=>{let i=Object.entries(r),s=i.length;for(let a=0;a<s;a++){let[o,c]=i[a];fh(c,dp(e,o),t,n)}},dp=(r,e)=>{let t=r,n=e.split("-"),i=n.length;for(let s=0;s<i;s++){let a=n[s],o=t.nextPart.get(a);o||(o=up(),t.nextPart.set(a,o)),t=o}return t},jy=r=>"isThemeGetter"in r&&r.isThemeGetter===!0,eb=r=>{if(r<1)return{get:()=>{},set:()=>{}};let e=0,t=Object.create(null),n=Object.create(null),i=(s,a)=>{t[s]=a,e++,e>r&&(e=0,n=t,t=Object.create(null))};return{get(s){let a=t[s];if(a!==void 0)return a;if((a=n[s])!==void 0)return i(s,a),a},set(s,a){s in t?t[s]=a:i(s,a)}}};var tb=[],ap=(r,e,t,n,i)=>({modifiers:r,hasImportantModifier:e,baseClassName:t,maybePostfixModifierPosition:n,isExternal:i}),nb=r=>{let{prefix:e,experimentalParseClassName:t}=r,n=i=>{let s=[],a=0,o=0,c=0,l,u=i.length;for(let g=0;g<u;g++){let m=i[g];if(a===0&&o===0){if(m===":"){s.push(i.slice(c,g)),c=g+1;continue}if(m==="/"){l=g;continue}}m==="["?a++:m==="]"?a--:m==="("?o++:m===")"&&o--}let h=s.length===0?i:i.slice(c),d=h,f=!1;h.endsWith("!")?(d=h.slice(0,-1),f=!0):h.startsWith("!")&&(d=h.slice(1),f=!0);let _=l&&l>c?l-c:void 0;return ap(s,f,d,_)};if(e){let i=e+":",s=n;n=a=>a.startsWith(i)?s(a.slice(i.length)):ap(tb,!1,a,void 0,!0)}if(t){let i=n;n=s=>t({className:s,parseClassName:i})}return n},ib=r=>{let e=new Map;return r.orderSensitiveModifiers.forEach((t,n)=>{e.set(t,1e6+n)}),t=>{let n=[],i=[];for(let s=0;s<t.length;s++){let a=t[s],o=a[0]==="[",c=e.has(a);o||c?(i.length>0&&(i.sort(),n.push(...i),i=[]),n.push(a)):i.push(a)}return i.length>0&&(i.sort(),n.push(...i)),n}},rb=r=>({cache:eb(r.cacheSize),parseClassName:nb(r),sortModifiers:ib(r),postfixLookupClassGroupIds:sb(r),...Xy(r)}),sb=r=>{let e=Object.create(null),t=r.postfixLookupClassGroups;if(t)for(let n=0;n<t.length;n++)e[t[n]]=!0;return e},ab=/\s+/,ob=(r,e)=>{let{parseClassName:t,getClassGroupId:n,getConflictingClassGroupIds:i,sortModifiers:s,postfixLookupClassGroupIds:a}=e,o=[],c=r.trim().split(ab),l="";for(let u=c.length-1;u>=0;u-=1){let h=c[u],{isExternal:d,modifiers:f,hasImportantModifier:_,baseClassName:g,maybePostfixModifierPosition:m}=t(h);if(d){l=h+(l.length>0?" "+l:l);continue}let p=!!m,y;if(p){let E=g.substring(0,m);y=n(E);let R=y&&a[y]?n(g):void 0;R&&R!==y&&(y=R,p=!1)}else y=n(g);if(!y){if(!p){l=h+(l.length>0?" "+l:l);continue}if(y=n(g),!y){l=h+(l.length>0?" "+l:l);continue}p=!1}let w=f.length===0?"":f.length===1?f[0]:s(f).join(":"),S=_?w+"!":w,M=S+y;if(o.indexOf(M)>-1)continue;o.push(M);let A=i(y,p);for(let E=0;E<A.length;++E){let R=A[E];o.push(S+R)}l=h+(l.length>0?" "+l:l)}return l},lb=(...r)=>{let e=0,t,n,i="";for(;e<r.length;)(t=r[e++])&&(n=fp(t))&&(i&&(i+=" "),i+=n);return i},fp=r=>{if(typeof r=="string")return r;let e,t="";for(let n=0;n<r.length;n++)r[n]&&(e=fp(r[n]))&&(t&&(t+=" "),t+=e);return t},cb=(r,...e)=>{let t,n,i,s,a=c=>{let l=e.reduce((u,h)=>h(u),r());return t=rb(l),n=t.cache.get,i=t.cache.set,s=o,o(c)},o=c=>{let l=n(c);if(l)return l;let u=ob(c,t);return i(c,u),u};return s=a,(...c)=>s(lb(...c))},ub=[],Dt=r=>{let e=t=>t[r]||ub;return e.isThemeGetter=!0,e},pp=/^\[(?:(\w[\w-]*):)?(.+)\]$/i,mp=/^\((?:(\w[\w-]*):)?(.+)\)$/i,hb=/^\d+(?:\.\d+)?\/\d+(?:\.\d+)?$/,db=/^(\d+(\.\d+)?)?(xs|sm|md|lg|xl)$/,fb=/\d+(%|px|r?em|[sdl]?v([hwib]|min|max)|pt|pc|in|cm|mm|cap|ch|ex|r?lh|cq(w|h|i|b|min|max))|\b(calc|min|max|clamp)\(.+\)|^0$/,pb=/^(rgba?|hsla?|hwb|(ok)?(lab|lch)|color-mix)\(.+\)$/,mb=/^(inset_)?-?((\d+)?\.?(\d+)[a-z]+|0)_-?((\d+)?\.?(\d+)[a-z]+|0)/,gb=/^(url|image|image-set|cross-fade|element|(repeating-)?(linear|radial|conic)-gradient)\(.+\)$/,rr=r=>hb.test(r),Ye=r=>!!r&&!Number.isNaN(Number(r)),ai=r=>!!r&&Number.isInteger(Number(r)),dh=r=>r.endsWith("%")&&Ye(r.slice(0,-1)),Ai=r=>db.test(r),gp=()=>!0,_b=r=>fb.test(r)&&!pb.test(r),ph=()=>!1,xb=r=>mb.test(r),vb=r=>gb.test(r),yb=r=>!Te(r)&&!Ee(r),bb=r=>r.startsWith("@container")&&(r[10]==="/"&&r[11]!==void 0||r[11]==="s"&&r[16]!==void 0&&r.startsWith("-size/",10)||r[11]==="n"&&r[18]!==void 0&&r.startsWith("-normal/",10)),Mb=r=>sr(r,vp,ph),Te=r=>pp.test(r),Br=r=>sr(r,yp,_b),op=r=>sr(r,Pb,Ye),Sb=r=>sr(r,Mp,gp),wb=r=>sr(r,bp,ph),lp=r=>sr(r,_p,ph),Tb=r=>sr(r,xp,vb),Yl=r=>sr(r,Sp,xb),Ee=r=>mp.test(r),Ra=r=>kr(r,yp),Ab=r=>kr(r,bp),cp=r=>kr(r,_p),Eb=r=>kr(r,vp),Cb=r=>kr(r,xp),Zl=r=>kr(r,Sp,!0),Rb=r=>kr(r,Mp,!0),sr=(r,e,t)=>{let n=pp.exec(r);return n?n[1]?e(n[1]):t(n[2]):!1},kr=(r,e,t=!1)=>{let n=mp.exec(r);return n?n[1]?e(n[1]):t:!1},_p=r=>r==="position"||r==="percentage",xp=r=>r==="image"||r==="url",vp=r=>r==="length"||r==="size"||r==="bg-size",yp=r=>r==="length",Pb=r=>r==="number",bp=r=>r==="family-name",Mp=r=>r==="number"||r==="weight",Sp=r=>r==="shadow";var Ib=()=>{let r=Dt("color"),e=Dt("font"),t=Dt("text"),n=Dt("font-weight"),i=Dt("tracking"),s=Dt("leading"),a=Dt("breakpoint"),o=Dt("container"),c=Dt("spacing"),l=Dt("radius"),u=Dt("shadow"),h=Dt("inset-shadow"),d=Dt("text-shadow"),f=Dt("drop-shadow"),_=Dt("blur"),g=Dt("perspective"),m=Dt("aspect"),p=Dt("ease"),y=Dt("animate"),w=()=>["auto","avoid","all","avoid-page","page","left","right","column"],S=()=>["center","top","bottom","left","right","top-left","left-top","top-right","right-top","bottom-right","right-bottom","bottom-left","left-bottom"],M=()=>[...S(),Ee,Te],A=()=>["auto","hidden","clip","visible","scroll"],E=()=>["auto","contain","none"],R=()=>[Ee,Te,c],x=()=>[rr,"full","auto",...R()],T=()=>[ai,"none","subgrid",Ee,Te],I=()=>["auto",{span:["full",ai,Ee,Te]},ai,Ee,Te],B=()=>[ai,"auto",Ee,Te],N=()=>["auto","min","max","fr",Ee,Te],k=()=>["start","end","center","between","around","evenly","stretch","baseline","center-safe","end-safe"],V=()=>["start","end","center","stretch","center-safe","end-safe"],O=()=>["auto",...R()],z=()=>[rr,"auto","full","dvw","dvh","lvw","lvh","svw","svh","min","max","fit",...R()],$=()=>[rr,"screen","full","dvw","lvw","svw","min","max","fit",...R()],ce=()=>[rr,"screen","full","lh","dvh","lvh","svh","min","max","fit",...R()],q=()=>[r,Ee,Te],ie=()=>[...S(),cp,lp,{position:[Ee,Te]}],Re=()=>["no-repeat",{repeat:["","x","y","space","round"]}],Ue=()=>["auto","cover","contain",Eb,Mb,{size:[Ee,Te]}],ke=()=>[dh,Ra,Br],Oe=()=>["","none","full",l,Ee,Te],Y=()=>["",Ye,Ra,Br],ee=()=>["solid","dashed","dotted","double"],_e=()=>["normal","multiply","screen","overlay","darken","lighten","color-dodge","color-burn","hard-light","soft-light","difference","exclusion","hue","saturation","color","luminosity"],ye=()=>[Ye,dh,cp,lp],Me=()=>["","none",_,Ee,Te],Xe=()=>["none",Ye,Ee,Te],pt=()=>["none",Ye,Ee,Te],Ne=()=>[Ye,Ee,Te],Ze=()=>[rr,"full",...R()];return{cacheSize:500,theme:{animate:["spin","ping","pulse","bounce"],aspect:["video"],blur:[Ai],breakpoint:[Ai],color:[gp],container:[Ai],"drop-shadow":[Ai],ease:["in","out","in-out"],font:[yb],"font-weight":["thin","extralight","light","normal","medium","semibold","bold","extrabold","black"],"inset-shadow":[Ai],leading:["none","tight","snug","normal","relaxed","loose"],perspective:["dramatic","near","normal","midrange","distant","none"],radius:[Ai],shadow:[Ai],spacing:["px",Ye],text:[Ai],"text-shadow":[Ai],tracking:["tighter","tight","normal","wide","wider","widest"]},classGroups:{aspect:[{aspect:["auto","square",rr,Te,Ee,m]}],container:["container"],"container-type":[{"@container":["","normal","size",Ee,Te]}],"container-named":[bb],columns:[{columns:[Ye,Te,Ee,o]}],"break-after":[{"break-after":w()}],"break-before":[{"break-before":w()}],"break-inside":[{"break-inside":["auto","avoid","avoid-page","avoid-column"]}],"box-decoration":[{"box-decoration":["slice","clone"]}],box:[{box:["border","content"]}],display:["block","inline-block","inline","flex","inline-flex","table","inline-table","table-caption","table-cell","table-column","table-column-group","table-footer-group","table-header-group","table-row-group","table-row","flow-root","grid","inline-grid","contents","list-item","hidden"],sr:["sr-only","not-sr-only"],float:[{float:["right","left","none","start","end"]}],clear:[{clear:["left","right","both","none","start","end"]}],isolation:["isolate","isolation-auto"],"object-fit":[{object:["contain","cover","fill","none","scale-down"]}],"object-position":[{object:M()}],overflow:[{overflow:A()}],"overflow-x":[{"overflow-x":A()}],"overflow-y":[{"overflow-y":A()}],overscroll:[{overscroll:E()}],"overscroll-x":[{"overscroll-x":E()}],"overscroll-y":[{"overscroll-y":E()}],position:["static","fixed","absolute","relative","sticky"],inset:[{inset:x()}],"inset-x":[{"inset-x":x()}],"inset-y":[{"inset-y":x()}],start:[{"inset-s":x(),start:x()}],end:[{"inset-e":x(),end:x()}],"inset-bs":[{"inset-bs":x()}],"inset-be":[{"inset-be":x()}],top:[{top:x()}],right:[{right:x()}],bottom:[{bottom:x()}],left:[{left:x()}],visibility:["visible","invisible","collapse"],z:[{z:[ai,"auto",Ee,Te]}],basis:[{basis:[rr,"full","auto",o,...R()]}],"flex-direction":[{flex:["row","row-reverse","col","col-reverse"]}],"flex-wrap":[{flex:["nowrap","wrap","wrap-reverse"]}],flex:[{flex:[Ye,rr,"auto","initial","none",Te]}],grow:[{grow:["",Ye,Ee,Te]}],shrink:[{shrink:["",Ye,Ee,Te]}],order:[{order:[ai,"first","last","none",Ee,Te]}],"grid-cols":[{"grid-cols":T()}],"col-start-end":[{col:I()}],"col-start":[{"col-start":B()}],"col-end":[{"col-end":B()}],"grid-rows":[{"grid-rows":T()}],"row-start-end":[{row:I()}],"row-start":[{"row-start":B()}],"row-end":[{"row-end":B()}],"grid-flow":[{"grid-flow":["row","col","dense","row-dense","col-dense"]}],"auto-cols":[{"auto-cols":N()}],"auto-rows":[{"auto-rows":N()}],gap:[{gap:R()}],"gap-x":[{"gap-x":R()}],"gap-y":[{"gap-y":R()}],"justify-content":[{justify:[...k(),"normal"]}],"justify-items":[{"justify-items":[...V(),"normal"]}],"justify-self":[{"justify-self":["auto",...V()]}],"align-content":[{content:["normal",...k()]}],"align-items":[{items:[...V(),{baseline:["","last"]}]}],"align-self":[{self:["auto",...V(),{baseline:["","last"]}]}],"place-content":[{"place-content":k()}],"place-items":[{"place-items":[...V(),"baseline"]}],"place-self":[{"place-self":["auto",...V()]}],p:[{p:R()}],px:[{px:R()}],py:[{py:R()}],ps:[{ps:R()}],pe:[{pe:R()}],pbs:[{pbs:R()}],pbe:[{pbe:R()}],pt:[{pt:R()}],pr:[{pr:R()}],pb:[{pb:R()}],pl:[{pl:R()}],m:[{m:O()}],mx:[{mx:O()}],my:[{my:O()}],ms:[{ms:O()}],me:[{me:O()}],mbs:[{mbs:O()}],mbe:[{mbe:O()}],mt:[{mt:O()}],mr:[{mr:O()}],mb:[{mb:O()}],ml:[{ml:O()}],"space-x":[{"space-x":R()}],"space-x-reverse":["space-x-reverse"],"space-y":[{"space-y":R()}],"space-y-reverse":["space-y-reverse"],size:[{size:z()}],"inline-size":[{inline:["auto",...$()]}],"min-inline-size":[{"min-inline":["auto",...$()]}],"max-inline-size":[{"max-inline":["none",...$()]}],"block-size":[{block:["auto",...ce()]}],"min-block-size":[{"min-block":["auto",...ce()]}],"max-block-size":[{"max-block":["none",...ce()]}],w:[{w:[o,"screen",...z()]}],"min-w":[{"min-w":[o,"screen","none",...z()]}],"max-w":[{"max-w":[o,"screen","none","prose",{screen:[a]},...z()]}],h:[{h:["screen","lh",...z()]}],"min-h":[{"min-h":["screen","lh","none",...z()]}],"max-h":[{"max-h":["screen","lh",...z()]}],"font-size":[{text:["base",t,Ra,Br]}],"font-smoothing":["antialiased","subpixel-antialiased"],"font-style":["italic","not-italic"],"font-weight":[{font:[n,Rb,Sb]}],"font-stretch":[{"font-stretch":["ultra-condensed","extra-condensed","condensed","semi-condensed","normal","semi-expanded","expanded","extra-expanded","ultra-expanded",dh,Te]}],"font-family":[{font:[Ab,wb,e]}],"font-features":[{"font-features":[Te]}],"fvn-normal":["normal-nums"],"fvn-ordinal":["ordinal"],"fvn-slashed-zero":["slashed-zero"],"fvn-figure":["lining-nums","oldstyle-nums"],"fvn-spacing":["proportional-nums","tabular-nums"],"fvn-fraction":["diagonal-fractions","stacked-fractions"],tracking:[{tracking:[i,Ee,Te]}],"line-clamp":[{"line-clamp":[Ye,"none",Ee,op]}],leading:[{leading:[s,...R()]}],"list-image":[{"list-image":["none",Ee,Te]}],"list-style-position":[{list:["inside","outside"]}],"list-style-type":[{list:["disc","decimal","none",Ee,Te]}],"text-alignment":[{text:["left","center","right","justify","start","end"]}],"placeholder-color":[{placeholder:q()}],"text-color":[{text:q()}],"text-decoration":["underline","overline","line-through","no-underline"],"text-decoration-style":[{decoration:[...ee(),"wavy"]}],"text-decoration-thickness":[{decoration:[Ye,"from-font","auto",Ee,Br]}],"text-decoration-color":[{decoration:q()}],"underline-offset":[{"underline-offset":[Ye,"auto",Ee,Te]}],"text-transform":["uppercase","lowercase","capitalize","normal-case"],"text-overflow":["truncate","text-ellipsis","text-clip"],"text-wrap":[{text:["wrap","nowrap","balance","pretty"]}],indent:[{indent:R()}],"tab-size":[{tab:[ai,Ee,Te]}],"vertical-align":[{align:["baseline","top","middle","bottom","text-top","text-bottom","sub","super",Ee,Te]}],whitespace:[{whitespace:["normal","nowrap","pre","pre-line","pre-wrap","break-spaces"]}],break:[{break:["normal","words","all","keep"]}],wrap:[{wrap:["break-word","anywhere","normal"]}],hyphens:[{hyphens:["none","manual","auto"]}],content:[{content:["none",Ee,Te]}],"bg-attachment":[{bg:["fixed","local","scroll"]}],"bg-clip":[{"bg-clip":["border","padding","content","text"]}],"bg-origin":[{"bg-origin":["border","padding","content"]}],"bg-position":[{bg:ie()}],"bg-repeat":[{bg:Re()}],"bg-size":[{bg:Ue()}],"bg-image":[{bg:["none",{linear:[{to:["t","tr","r","br","b","bl","l","tl"]},ai,Ee,Te],radial:["",Ee,Te],conic:[ai,Ee,Te]},Cb,Tb]}],"bg-color":[{bg:q()}],"gradient-from-pos":[{from:ke()}],"gradient-via-pos":[{via:ke()}],"gradient-to-pos":[{to:ke()}],"gradient-from":[{from:q()}],"gradient-via":[{via:q()}],"gradient-to":[{to:q()}],rounded:[{rounded:Oe()}],"rounded-s":[{"rounded-s":Oe()}],"rounded-e":[{"rounded-e":Oe()}],"rounded-t":[{"rounded-t":Oe()}],"rounded-r":[{"rounded-r":Oe()}],"rounded-b":[{"rounded-b":Oe()}],"rounded-l":[{"rounded-l":Oe()}],"rounded-ss":[{"rounded-ss":Oe()}],"rounded-se":[{"rounded-se":Oe()}],"rounded-ee":[{"rounded-ee":Oe()}],"rounded-es":[{"rounded-es":Oe()}],"rounded-tl":[{"rounded-tl":Oe()}],"rounded-tr":[{"rounded-tr":Oe()}],"rounded-br":[{"rounded-br":Oe()}],"rounded-bl":[{"rounded-bl":Oe()}],"border-w":[{border:Y()}],"border-w-x":[{"border-x":Y()}],"border-w-y":[{"border-y":Y()}],"border-w-s":[{"border-s":Y()}],"border-w-e":[{"border-e":Y()}],"border-w-bs":[{"border-bs":Y()}],"border-w-be":[{"border-be":Y()}],"border-w-t":[{"border-t":Y()}],"border-w-r":[{"border-r":Y()}],"border-w-b":[{"border-b":Y()}],"border-w-l":[{"border-l":Y()}],"divide-x":[{"divide-x":Y()}],"divide-x-reverse":["divide-x-reverse"],"divide-y":[{"divide-y":Y()}],"divide-y-reverse":["divide-y-reverse"],"border-style":[{border:[...ee(),"hidden","none"]}],"divide-style":[{divide:[...ee(),"hidden","none"]}],"border-color":[{border:q()}],"border-color-x":[{"border-x":q()}],"border-color-y":[{"border-y":q()}],"border-color-s":[{"border-s":q()}],"border-color-e":[{"border-e":q()}],"border-color-bs":[{"border-bs":q()}],"border-color-be":[{"border-be":q()}],"border-color-t":[{"border-t":q()}],"border-color-r":[{"border-r":q()}],"border-color-b":[{"border-b":q()}],"border-color-l":[{"border-l":q()}],"divide-color":[{divide:q()}],"outline-style":[{outline:[...ee(),"none","hidden"]}],"outline-offset":[{"outline-offset":[Ye,Ee,Te]}],"outline-w":[{outline:["",Ye,Ra,Br]}],"outline-color":[{outline:q()}],shadow:[{shadow:["","none",u,Zl,Yl]}],"shadow-color":[{shadow:q()}],"inset-shadow":[{"inset-shadow":["none",h,Zl,Yl]}],"inset-shadow-color":[{"inset-shadow":q()}],"ring-w":[{ring:Y()}],"ring-w-inset":["ring-inset"],"ring-color":[{ring:q()}],"ring-offset-w":[{"ring-offset":[Ye,Br]}],"ring-offset-color":[{"ring-offset":q()}],"inset-ring-w":[{"inset-ring":Y()}],"inset-ring-color":[{"inset-ring":q()}],"text-shadow":[{"text-shadow":["none",d,Zl,Yl]}],"text-shadow-color":[{"text-shadow":q()}],opacity:[{opacity:[Ye,Ee,Te]}],"mix-blend":[{"mix-blend":[..._e(),"plus-darker","plus-lighter"]}],"bg-blend":[{"bg-blend":_e()}],"mask-clip":[{"mask-clip":["border","padding","content","fill","stroke","view"]},"mask-no-clip"],"mask-composite":[{mask:["add","subtract","intersect","exclude"]}],"mask-image-linear-pos":[{"mask-linear":[Ye]}],"mask-image-linear-from-pos":[{"mask-linear-from":ye()}],"mask-image-linear-to-pos":[{"mask-linear-to":ye()}],"mask-image-linear-from-color":[{"mask-linear-from":q()}],"mask-image-linear-to-color":[{"mask-linear-to":q()}],"mask-image-t-from-pos":[{"mask-t-from":ye()}],"mask-image-t-to-pos":[{"mask-t-to":ye()}],"mask-image-t-from-color":[{"mask-t-from":q()}],"mask-image-t-to-color":[{"mask-t-to":q()}],"mask-image-r-from-pos":[{"mask-r-from":ye()}],"mask-image-r-to-pos":[{"mask-r-to":ye()}],"mask-image-r-from-color":[{"mask-r-from":q()}],"mask-image-r-to-color":[{"mask-r-to":q()}],"mask-image-b-from-pos":[{"mask-b-from":ye()}],"mask-image-b-to-pos":[{"mask-b-to":ye()}],"mask-image-b-from-color":[{"mask-b-from":q()}],"mask-image-b-to-color":[{"mask-b-to":q()}],"mask-image-l-from-pos":[{"mask-l-from":ye()}],"mask-image-l-to-pos":[{"mask-l-to":ye()}],"mask-image-l-from-color":[{"mask-l-from":q()}],"mask-image-l-to-color":[{"mask-l-to":q()}],"mask-image-x-from-pos":[{"mask-x-from":ye()}],"mask-image-x-to-pos":[{"mask-x-to":ye()}],"mask-image-x-from-color":[{"mask-x-from":q()}],"mask-image-x-to-color":[{"mask-x-to":q()}],"mask-image-y-from-pos":[{"mask-y-from":ye()}],"mask-image-y-to-pos":[{"mask-y-to":ye()}],"mask-image-y-from-color":[{"mask-y-from":q()}],"mask-image-y-to-color":[{"mask-y-to":q()}],"mask-image-radial":[{"mask-radial":[Ee,Te]}],"mask-image-radial-from-pos":[{"mask-radial-from":ye()}],"mask-image-radial-to-pos":[{"mask-radial-to":ye()}],"mask-image-radial-from-color":[{"mask-radial-from":q()}],"mask-image-radial-to-color":[{"mask-radial-to":q()}],"mask-image-radial-shape":[{"mask-radial":["circle","ellipse"]}],"mask-image-radial-size":[{"mask-radial":[{closest:["side","corner"],farthest:["side","corner"]}]}],"mask-image-radial-pos":[{"mask-radial-at":S()}],"mask-image-conic-pos":[{"mask-conic":[Ye]}],"mask-image-conic-from-pos":[{"mask-conic-from":ye()}],"mask-image-conic-to-pos":[{"mask-conic-to":ye()}],"mask-image-conic-from-color":[{"mask-conic-from":q()}],"mask-image-conic-to-color":[{"mask-conic-to":q()}],"mask-mode":[{mask:["alpha","luminance","match"]}],"mask-origin":[{"mask-origin":["border","padding","content","fill","stroke","view"]}],"mask-position":[{mask:ie()}],"mask-repeat":[{mask:Re()}],"mask-size":[{mask:Ue()}],"mask-type":[{"mask-type":["alpha","luminance"]}],"mask-image":[{mask:["none",Ee,Te]}],filter:[{filter:["","none",Ee,Te]}],blur:[{blur:Me()}],brightness:[{brightness:[Ye,Ee,Te]}],contrast:[{contrast:[Ye,Ee,Te]}],"drop-shadow":[{"drop-shadow":["","none",f,Zl,Yl]}],"drop-shadow-color":[{"drop-shadow":q()}],grayscale:[{grayscale:["",Ye,Ee,Te]}],"hue-rotate":[{"hue-rotate":[Ye,Ee,Te]}],invert:[{invert:["",Ye,Ee,Te]}],saturate:[{saturate:[Ye,Ee,Te]}],sepia:[{sepia:["",Ye,Ee,Te]}],"backdrop-filter":[{"backdrop-filter":["","none",Ee,Te]}],"backdrop-blur":[{"backdrop-blur":Me()}],"backdrop-brightness":[{"backdrop-brightness":[Ye,Ee,Te]}],"backdrop-contrast":[{"backdrop-contrast":[Ye,Ee,Te]}],"backdrop-grayscale":[{"backdrop-grayscale":["",Ye,Ee,Te]}],"backdrop-hue-rotate":[{"backdrop-hue-rotate":[Ye,Ee,Te]}],"backdrop-invert":[{"backdrop-invert":["",Ye,Ee,Te]}],"backdrop-opacity":[{"backdrop-opacity":[Ye,Ee,Te]}],"backdrop-saturate":[{"backdrop-saturate":[Ye,Ee,Te]}],"backdrop-sepia":[{"backdrop-sepia":["",Ye,Ee,Te]}],"border-collapse":[{border:["collapse","separate"]}],"border-spacing":[{"border-spacing":R()}],"border-spacing-x":[{"border-spacing-x":R()}],"border-spacing-y":[{"border-spacing-y":R()}],"table-layout":[{table:["auto","fixed"]}],caption:[{caption:["top","bottom"]}],transition:[{transition:["","all","colors","opacity","shadow","transform","none",Ee,Te]}],"transition-behavior":[{transition:["normal","discrete"]}],duration:[{duration:[Ye,"initial",Ee,Te]}],ease:[{ease:["linear","initial",p,Ee,Te]}],delay:[{delay:[Ye,Ee,Te]}],animate:[{animate:["none",y,Ee,Te]}],backface:[{backface:["hidden","visible"]}],perspective:[{perspective:[g,Ee,Te]}],"perspective-origin":[{"perspective-origin":M()}],rotate:[{rotate:Xe()}],"rotate-x":[{"rotate-x":Xe()}],"rotate-y":[{"rotate-y":Xe()}],"rotate-z":[{"rotate-z":Xe()}],scale:[{scale:pt()}],"scale-x":[{"scale-x":pt()}],"scale-y":[{"scale-y":pt()}],"scale-z":[{"scale-z":pt()}],"scale-3d":["scale-3d"],skew:[{skew:Ne()}],"skew-x":[{"skew-x":Ne()}],"skew-y":[{"skew-y":Ne()}],transform:[{transform:[Ee,Te,"","none","gpu","cpu"]}],"transform-origin":[{origin:M()}],"transform-style":[{transform:["3d","flat"]}],translate:[{translate:Ze()}],"translate-x":[{"translate-x":Ze()}],"translate-y":[{"translate-y":Ze()}],"translate-z":[{"translate-z":Ze()}],"translate-none":["translate-none"],zoom:[{zoom:[ai,Ee,Te]}],accent:[{accent:q()}],appearance:[{appearance:["none","auto"]}],"caret-color":[{caret:q()}],"color-scheme":[{scheme:["normal","dark","light","light-dark","only-dark","only-light"]}],cursor:[{cursor:["auto","default","pointer","wait","text","move","help","not-allowed","none","context-menu","progress","cell","crosshair","vertical-text","alias","copy","no-drop","grab","grabbing","all-scroll","col-resize","row-resize","n-resize","e-resize","s-resize","w-resize","ne-resize","nw-resize","se-resize","sw-resize","ew-resize","ns-resize","nesw-resize","nwse-resize","zoom-in","zoom-out",Ee,Te]}],"field-sizing":[{"field-sizing":["fixed","content"]}],"pointer-events":[{"pointer-events":["auto","none"]}],resize:[{resize:["none","","y","x"]}],"scroll-behavior":[{scroll:["auto","smooth"]}],"scrollbar-thumb-color":[{"scrollbar-thumb":q()}],"scrollbar-track-color":[{"scrollbar-track":q()}],"scrollbar-gutter":[{"scrollbar-gutter":["auto","stable","both"]}],"scrollbar-w":[{scrollbar:["auto","thin","none"]}],"scroll-m":[{"scroll-m":R()}],"scroll-mx":[{"scroll-mx":R()}],"scroll-my":[{"scroll-my":R()}],"scroll-ms":[{"scroll-ms":R()}],"scroll-me":[{"scroll-me":R()}],"scroll-mbs":[{"scroll-mbs":R()}],"scroll-mbe":[{"scroll-mbe":R()}],"scroll-mt":[{"scroll-mt":R()}],"scroll-mr":[{"scroll-mr":R()}],"scroll-mb":[{"scroll-mb":R()}],"scroll-ml":[{"scroll-ml":R()}],"scroll-p":[{"scroll-p":R()}],"scroll-px":[{"scroll-px":R()}],"scroll-py":[{"scroll-py":R()}],"scroll-ps":[{"scroll-ps":R()}],"scroll-pe":[{"scroll-pe":R()}],"scroll-pbs":[{"scroll-pbs":R()}],"scroll-pbe":[{"scroll-pbe":R()}],"scroll-pt":[{"scroll-pt":R()}],"scroll-pr":[{"scroll-pr":R()}],"scroll-pb":[{"scroll-pb":R()}],"scroll-pl":[{"scroll-pl":R()}],"snap-align":[{snap:["start","end","center","align-none"]}],"snap-stop":[{snap:["normal","always"]}],"snap-type":[{snap:["none","x","y","both"]}],"snap-strictness":[{snap:["mandatory","proximity"]}],touch:[{touch:["auto","none","manipulation"]}],"touch-x":[{"touch-pan":["x","left","right"]}],"touch-y":[{"touch-pan":["y","up","down"]}],"touch-pz":["touch-pinch-zoom"],select:[{select:["none","text","all","auto"]}],"will-change":[{"will-change":["auto","scroll","contents","transform",Ee,Te]}],fill:[{fill:["none",...q()]}],"stroke-w":[{stroke:[Ye,Ra,Br,op]}],stroke:[{stroke:["none",...q()]}],"forced-color-adjust":[{"forced-color-adjust":["auto","none"]}]},conflictingClassGroups:{"container-named":["container-type"],overflow:["overflow-x","overflow-y"],overscroll:["overscroll-x","overscroll-y"],inset:["inset-x","inset-y","inset-bs","inset-be","start","end","top","right","bottom","left"],"inset-x":["right","left"],"inset-y":["top","bottom"],flex:["basis","grow","shrink"],gap:["gap-x","gap-y"],p:["px","py","ps","pe","pbs","pbe","pt","pr","pb","pl"],px:["pr","pl"],py:["pt","pb"],m:["mx","my","ms","me","mbs","mbe","mt","mr","mb","ml"],mx:["mr","ml"],my:["mt","mb"],size:["w","h"],"font-size":["leading"],"fvn-normal":["fvn-ordinal","fvn-slashed-zero","fvn-figure","fvn-spacing","fvn-fraction"],"fvn-ordinal":["fvn-normal"],"fvn-slashed-zero":["fvn-normal"],"fvn-figure":["fvn-normal"],"fvn-spacing":["fvn-normal"],"fvn-fraction":["fvn-normal"],"line-clamp":["display","overflow"],rounded:["rounded-s","rounded-e","rounded-t","rounded-r","rounded-b","rounded-l","rounded-ss","rounded-se","rounded-ee","rounded-es","rounded-tl","rounded-tr","rounded-br","rounded-bl"],"rounded-s":["rounded-ss","rounded-es"],"rounded-e":["rounded-se","rounded-ee"],"rounded-t":["rounded-tl","rounded-tr"],"rounded-r":["rounded-tr","rounded-br"],"rounded-b":["rounded-br","rounded-bl"],"rounded-l":["rounded-tl","rounded-bl"],"border-spacing":["border-spacing-x","border-spacing-y"],"border-w":["border-w-x","border-w-y","border-w-s","border-w-e","border-w-bs","border-w-be","border-w-t","border-w-r","border-w-b","border-w-l"],"border-w-x":["border-w-r","border-w-l"],"border-w-y":["border-w-t","border-w-b"],"border-color":["border-color-x","border-color-y","border-color-s","border-color-e","border-color-bs","border-color-be","border-color-t","border-color-r","border-color-b","border-color-l"],"border-color-x":["border-color-r","border-color-l"],"border-color-y":["border-color-t","border-color-b"],translate:["translate-x","translate-y","translate-none"],"translate-none":["translate","translate-x","translate-y","translate-z"],"scroll-m":["scroll-mx","scroll-my","scroll-ms","scroll-me","scroll-mbs","scroll-mbe","scroll-mt","scroll-mr","scroll-mb","scroll-ml"],"scroll-mx":["scroll-mr","scroll-ml"],"scroll-my":["scroll-mt","scroll-mb"],"scroll-p":["scroll-px","scroll-py","scroll-ps","scroll-pe","scroll-pbs","scroll-pbe","scroll-pt","scroll-pr","scroll-pb","scroll-pl"],"scroll-px":["scroll-pr","scroll-pl"],"scroll-py":["scroll-pt","scroll-pb"],touch:["touch-x","touch-y","touch-pz"],"touch-x":["touch"],"touch-y":["touch"],"touch-pz":["touch"]},conflictingClassGroupModifiers:{"font-size":["leading"]},postfixLookupClassGroups:["container-type"],orderSensitiveModifiers:["*","**","after","backdrop","before","details-content","file","first-letter","first-line","marker","placeholder","selection"]}};var wp=cb(Ib);function Jl(...r){return wp(rp(r))}var Tp=yh(Wn("react")),Kl=Wn("react/jsx-runtime"),$l=class extends Tp.Component{state={hasError:!1};static getDerivedStateFromError(){return{hasError:!0}}componentDidCatch(e,t){this.props.onError?.(e,t)}render(){return this.state.hasError?this.props.fallback??(0,Kl.jsx)(Ql,{}):this.props.children}};function Ql({className:r,message:e="Interactive WebGL content is unavailable on this device/browser."}){return(0,Kl.jsx)("div",{className:Jl("flex h-full w-full items-center justify-center bg-gradient-to-br from-zinc-950 via-slate-900 to-zinc-900 px-4 text-center text-sm text-white/75",r),role:"status","aria-live":"polite",children:(0,Kl.jsx)("p",{children:e})})}var An=Wn("react/jsx-runtime"),li=3/4,ar=r=>`https://images.unsplash.com/photo-${r}?w=900&h=1200&q=85&auto=format&fit=crop`,Db=[{title:"Project One",src:ar("1600585154340-be6161a56a0c"),aspect:li},{title:"Project Two",src:ar("1514906689926-25ba6dcb584b"),aspect:li},{title:"Project Three",src:ar("1568557412756-7d219873dd11"),aspect:li},{title:"Project Four",src:ar("1581892805885-73bdd91beff0"),aspect:li},{title:"Project Five",src:ar("1482938289607-e9573fc25ebb"),aspect:li},{title:"Project Six",src:ar("1610846202780-b4d9837371ea"),aspect:li},{title:"Project Seven",src:ar("1527630941-4a229fd674ab"),aspect:li},{title:"Project Eight",src:ar("1603786420263-ad59136a7409"),aspect:li}],ot={sizeX:.565,sizeY:1,posX:.5,posY:.5,rotation:65,spin:0,zoom:0,dispersion:11,blur:0,glow:4.2,whiteGlow:.24,novaSize:12,blueRing:6,ringRadius:.49,ringWidth:.014,shimmer:!0,shimmerFreq:12,shimmerSpeed:3.5,shimmerDepth:.12,rimStart:.578,rimTangential:.6,rimInward:0,rimFreq1:2,rimFreq2:1,blueColor:"#009dff",rimLine:1.4,rimLinePos:.488,rimLineWidth:.003,vignette:0,vignetteSize:.3,samples:16},mn={cardDuration:.7,focusDuration:.9,cardEase:"power4.out",focusEase:"power3.out",stagger:.06,dropDist:1.4,centerScale:1.18,lensFade:.85},Ht={delay:.5,startH:80,riseDuration:1,stagger:.07,riseEase:"power3.out",fromBelow:.9,growDelay:.25,growDuration:2.15,growEase:"expo.inOut",growStagger:.085,lensBloom:1.4,lensBloomEase:"power2.inOut"},Lb=`
varying vec2 vUv;
void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
`,Nb=`
#define PI 3.14159265
precision highp float;
varying vec2 vUv;
uniform sampler2D uTex;
uniform vec2 uRes;
uniform vec2 uCenter;
uniform float uSizeX;
uniform float uSizeY;
uniform float uAspect;
uniform float uZoom;
uniform float uDispersion;
uniform float uBlur;
uniform float uGlow;
uniform float uWhiteGlow;
uniform float uNovaSize;
uniform float uBlueRing;
uniform float uRingRadius;
uniform float uRingWidth;
uniform float uShimmer;
uniform float uShimmerFreq;
uniform float uShimmerSpeed;
uniform float uShimmerDepth;
uniform float uTime;
uniform float uRimStart;
uniform float uRimTangential;
uniform float uRimInward;
uniform float uRimFreq1;
uniform float uRimFreq2;
uniform vec3 uBlueColor;
uniform float uRimLine;
uniform float uRimLinePos;
uniform float uRimLineWidth;
uniform float uVignette;
uniform float uVignetteSize;
uniform float uShape;
uniform float uSquareRound;
uniform float uRotation;
uniform int uSamples;

const int MAX_SAMPLES = 16;

float sdRoundBox(vec2 p, vec2 b, float r){
  vec2 q = abs(p) - b + r;
  return min(max(q.x, q.y), 0.0) + length(max(q, 0.0)) - r;
}

vec3 discLens(vec2 center, float aspectCorrect, out float outA) {
  vec2 p = (vUv - center);
  p.x *= aspectCorrect;
  float ca = cos(uRotation), sa = sin(uRotation);
  p = mat2(ca, -sa, sa, ca) * p;
  vec2 halfSize = vec2(uSizeX, uSizeY);
  float dist = length(p / halfSize);
  outA = 0.0;

  float maskND;
  if (uShape > 0.5) {
    float corner = min(uSizeX, uSizeY) * clamp(uSquareRound, 0.0, 1.0);
    float sd = sdRoundBox(p, halfSize, corner);
    maskND = 1.0 + sd / min(uSizeX, uSizeY);
  } else {
    maskND = dist;
  }
  if (maskND > 1.0) return vec3(0.0);

  float shapeND = clamp(maskND, 0.0, 1.0);
  float nd = clamp(dist, 0.0, 1.0);
  vec2 offset = vUv - center;
  vec2 radialDir = normalize(offset + 1e-6);
  vec2 tangentDir = vec2(-radialDir.y, radialDir.x);
  float angle = atan(p.y, p.x);

  float pull = uZoom * 0.30 * (nd * nd);
  float rimStrength = smoothstep(uRimStart, 1.0, nd);
  float fluidWave = sin(angle * uRimFreq1) * 0.55 + sin(angle * uRimFreq2) * 0.25;
  float rScreen = (uSizeX + uSizeY) * 0.5;
  vec2 rimOff = tangentDir * fluidWave * rimStrength * rScreen * uRimTangential;
  vec2 rimPull = -radialDir * rimStrength * rScreen * uRimInward;

  vec2 baseUV = center + offset * (1.0 - pull) + rimOff + rimPull;

  float rimMask = smoothstep(0.55, 1.0, nd);
  vec2 dispDir = offset * uDispersion * 0.004 * rimMask;
  int N = uSamples;
  if (N < 2) N = 2;
  if (N > MAX_SAMPLES) N = MAX_SAMPLES;
  vec3 col = vec3(0.0);
  vec3 caW = vec3(0.0);
  for (int i = 0; i < MAX_SAMPLES; i++) {
    if (i >= N) break;
    float t = float(i) / float(N - 1);
    vec2 sUV = baseUV + dispDir * (t - 0.5);
    vec3 s = texture2D(uTex, sUV).rgb;
    vec3 w = vec3(
      exp(-pow((t - 0.00) / 0.38, 2.0)),
      exp(-pow((t - 0.50) / 0.38, 2.0)),
      exp(-pow((t - 1.00) / 0.38, 2.0))
    );
    col += s * w;
    caW += w;
  }
  col /= max(caW, vec3(0.001));

  float blurFade = 1.0 - smoothstep(0.72, 0.98, nd);
  if (uBlur > 0.01 && blurFade > 0.01) {
    vec2 blurRad = vec2(uBlur) / uRes * blurFade;
    vec3 bcol = vec3(0.0);
    float btw = 0.0;
    for (float a = 0.0; a < PI * 2.0; a += PI * 2.0 / 6.0) {
      for (float rr = 0.4; rr <= 1.001; rr += 0.3) {
        vec2 o = vec2(cos(a), sin(a)) * blurRad * rr;
        float w = 1.0 - rr * 0.38;
        bcol += texture2D(uTex, baseUV + o).rgb * w;
        btw += w;
      }
    }
    col = mix(bcol / btw, col, rimMask);
  }

  col *= mix(0.91, 1.0, smoothstep(0.0, 0.38, shapeND));

  float r2 = shapeND * shapeND * 0.25;
  float gs = max(uNovaSize * uGlow * 0.003, 0.004);
  float nova = exp(-r2 / gs) + exp(-r2 / (gs * 7.0)) * 0.18;
  nova *= uWhiteGlow * (uGlow / 17.0) * 1.15;
  col += vec3(nova);

  float dC = shapeND * 0.5;
  float tR = clamp(uRingRadius, 0.1, 0.49);
  float rW = max(uRingWidth, 0.003);
  float ring = exp(-pow((dC - tR) / rW, 2.0));
  ring *= uBlueRing * (uGlow / 17.0) * 1.8;
  if (uShimmer > 0.5) ring *= sin(angle * uShimmerFreq + uTime * uShimmerSpeed) * uShimmerDepth + (1.0 - uShimmerDepth);
  float ringAura = exp(-pow((dC - tR) / (rW * 6.0), 2.0)) * 0.28 * uBlueRing * (uGlow / 17.0);
  col += uBlueColor * (ring + ringAura);
  col += vec3(exp(-pow((dC - uRimLinePos) / max(uRimLineWidth, 0.0001), 2.0)) * uRimLine);

  outA = smoothstep(1.0, 0.93, maskND);
  return col;
}

void main(){
  vec3 base = texture2D(uTex, vUv).rgb;
  vec3 outc = base;
  float a = 0.0;
  vec3 c = discLens(uCenter, uAspect, a);
  outc = mix(outc, c, a);
  if (uVignette > 0.001) {
    vec2 vc = vUv - 0.5;
    vc.x *= uAspect;
    float d = length(vc) / max(uVignetteSize, 0.0001);
    float vig = 1.0 - uVignette * smoothstep(0.5, 1.0, d);
    outc *= clamp(vig, 0.0, 1.0);
  }
  gl_FragColor = vec4(outc, 1.0);
}
`,Ap=["uDispersion","uBlueRing","uRimLine","uVignette","uZoom","uRimTangential","uRimInward"],Ei=4,Fb=6,Ub=12,Ob=90;function oi(r,e){let t=r[e];if(t===void 0)throw new Error("Index out of range.");return t}function Ep(){return typeof window<"u"&&window.matchMedia("(prefers-reduced-motion: reduce)").matches}function Bb(r){let e=r.trim();if(e.startsWith("#")&&(e.length===7||e.length===4)){let t=e.length===4?`#${e[1]}${e[1]}${e[2]}${e[2]}${e[3]}${e[3]}`:e,n=Number.parseInt(t.slice(1),16);return Number.isFinite(n)?n:16777215}return 16777215}function kb(r,e,t){let n=Ep(),i=t.entry&&!n,s=t.items;if(s.length===0)return null;let a=Math.max(1,r.clientWidth),o=Math.max(1,r.clientHeight),c=()=>Math.max(120,Math.min(t.panelHeight,Math.round(o*.52))),l=c(),u=t.gap,h=n?.28:.09,d=n?.22:.05,f=1.4,_=1.6,g=1,m=.22,p=.865,y=120,w=60,S=.25,M=.06,A;try{A=new Wl({antialias:!0,alpha:!1})}catch{return null}let E=Math.min(window.devicePixelRatio||1,2);A.setPixelRatio(E),A.setSize(a,o),A.setClearColor(Bb(t.background),1),A.domElement.style.display="block",A.domElement.style.width="100%",A.domElement.style.height="100%",A.domElement.style.touchAction="none",A.domElement.style.userSelect="none",A.domElement.setAttribute("aria-hidden","true"),r.appendChild(A.domElement);let R=new bs,x=new er(-a/2,a/2,o/2,-o/2,-100,100);x.position.z=10;let T=new _a;T.setCrossOrigin("anonymous");let I=s.map(P=>{let G={tex:null,aspect:P.aspect||li,locked:P.aspect!=null};return T.load(P.src,j=>{j.minFilter=ni,j.magFilter=Rt,j.generateMipmaps=!0,j.anisotropy=A.capabilities.getMaxAnisotropy(),j.colorSpace=tn,!G.locked&&j.image&&(G.aspect=j.image.width/j.image.height),G.tex=j,V(),Ue||(ie=O(0),Re=ie)},void 0,()=>{G.aspect=G.aspect||li}),G});function B(P){return oi(I,P).aspect*l+u}let N=[],k=0;function V(){N=[];let P=0;for(let G=0;G<I.length;G++)N.push(P),P+=B(G);k=P}V();function O(P){let G=I.length,j=Math.floor(P/G),K=(P%G+G)%G;return oi(N,K)+B(K)/2-u/2+j*k}function z(P){if(!k)return 0;let G=I.length,j=0,K=1/0;for(let se=0;se<G;se++){let de=oi(N,se)+B(se)/2-u/2,ve=Math.round((P-de)/k),oe=Math.abs(de+ve*k-P);oe<K&&(K=oe,j=se+ve*G)}return j}function $(P){if(!k)return 0;let G=0,j=1/0;for(let K=0;K<I.length;K++){let se=oi(N,K)+B(K)/2-u/2,de=Math.round((P-se)/k),ve=Math.abs(se+de*k-P);ve<j&&(j=ve,G=K)}return G}let ce=-1,q=[];for(let P=0;P<Ei;P++)for(let G=0;G<I.length;G++){let j=new Pr({color:14540253,transparent:!0}),K=new sn(new Ki(1,1,1,1),j);K.visible=!1,R.add(K),q.push({mesh:K,mat:j,srcIndex:G,bound:!1})}let ie=O(0),Re=ie,Ue=!1,ke=0,Oe=0,Y=0,ee=null,_e=performance.now(),ye=!1,Me=new rn(a*E,o*E),Xe=new bs,pt=new er(-1,1,1,-1,0,1),Ne={uTex:{value:Me.texture},uRes:{value:new st(a*E,o*E)},uCenter:{value:new st(.5,.5)},uSizeX:{value:ot.sizeX},uSizeY:{value:ot.sizeY},uShape:{value:0},uSquareRound:{value:0},uRotation:{value:0},uAspect:{value:a/o},uZoom:{value:ot.zoom},uDispersion:{value:ot.dispersion},uBlur:{value:ot.blur},uGlow:{value:ot.glow},uWhiteGlow:{value:ot.whiteGlow},uNovaSize:{value:ot.novaSize},uBlueRing:{value:ot.blueRing},uRingRadius:{value:ot.ringRadius},uRingWidth:{value:ot.ringWidth},uShimmer:{value:n||!ot.shimmer?0:1},uShimmerFreq:{value:ot.shimmerFreq},uShimmerSpeed:{value:ot.shimmerSpeed},uShimmerDepth:{value:ot.shimmerDepth},uTime:{value:0},uRimStart:{value:ot.rimStart},uRimTangential:{value:ot.rimTangential},uRimInward:{value:ot.rimInward},uRimFreq1:{value:ot.rimFreq1},uRimFreq2:{value:ot.rimFreq2},uBlueColor:{value:new it(ot.blueColor)},uRimLine:{value:ot.rimLine},uRimLinePos:{value:ot.rimLinePos},uRimLineWidth:{value:ot.rimLineWidth},uVignette:{value:ot.vignette},uVignetteSize:{value:ot.vignetteSize},uSamples:{value:ot.samples}},Ze=new an({uniforms:Ne,vertexShader:Lb,fragmentShader:Nb}),lt=new sn(new Ki(2,2),Ze);Xe.add(lt);let be={active:!1,srcIndex:-1,poolIdx:-1,lensFx:i?0:1,anim:null},mt=new Array(Ei*I.length).fill(0),D=1,nt=new Array(Ei*I.length),Ke=new Array(Ei*I.length).fill(i?0:1),et=i,Se=!1,C=new Array(Ei*I.length).fill(i?0:1),v=null,F={uDispersion:Ne.uDispersion.value,uBlueRing:Ne.uBlueRing.value,uRimLine:Ne.uRimLine.value,uVignette:Ne.uVignette.value,uZoom:Ne.uZoom.value,uRimTangential:Ne.uRimTangential.value,uRimInward:Ne.uRimInward.value},J=[],Q=null;function Z(){J=[],Q=null;let P=1/0,G=a/2,j=l;q.forEach((K,se)=>{let de=Math.floor(se/I.length),ve=K.srcIndex,oe=oi(I,ve),Le=oi(N,ve)+B(ve)/2-u/2-ie;Le=(Le%k+k)%k,Le+=(de-Math.floor(Ei/2))*k,Le>G+k&&(Le-=k*Ei);let We=Le;if(!(et||Se)&&(We<-G-j||We>G+j)){K.mesh.visible=!1,nt[se]=void 0;return}nt[se]=We;let Ie=1-.25*Y,we=l*Ie,$e=oe.aspect*l*Ie;oe.tex&&!K.bound&&(K.mat.map=oe.tex,K.mat.color.set(16777215),K.mat.needsUpdate=!0,K.bound=!0);let Je=0,Kt=be.active&&be.poolIdx===se,ci=mt[se]||0,Lt=$e,Nn=we;Kt?(Lt=$e*D,Nn=we*D):ci>0&&(Je=-ci*o*mn.dropDist),K.mesh.visible=!0;let at=We,Bt=Je,Qt=Lt,Nt=Nn;if(et||Se){let ui=Ke[se]||0,Ip=C[se]||0,gh=Ht.startH+(Nn-Ht.startH)*Ip;Nt=gh,Qt=gh*oe.aspect;let Bs=$(ie),Ii=ve-Bs;Ii>I.length/2&&(Ii-=I.length),Ii<-I.length/2&&(Ii+=I.length);let gn=I.length,_h=Math.floor(Ei/2);if(de!==_h){K.mesh.visible=!1,nt[se]=void 0;return}let Na=Fn=>{let cr=C[_h*gn+Fn]||0;return Ht.startH+(l-Ht.startH)*cr},nc=0;if(Ii>0)for(let Fn=0;Fn<Ii;Fn++){let cr=((Bs+Fn)%gn+gn)%gn,ks=((Bs+Fn+1)%gn+gn)%gn;nc+=(oi(I,cr).aspect*Na(cr)+oi(I,ks).aspect*Na(ks))/2+u}else if(Ii<0)for(let Fn=0;Fn<-Ii;Fn++){let cr=((Bs-Fn)%gn+gn)%gn,ks=((Bs-Fn-1)%gn+gn)%gn;nc-=(oi(I,cr).aspect*Na(cr)+oi(I,ks).aspect*Na(ks))/2+u}if(at=nc,at<-G-j||at>G+j){K.mesh.visible=!1,nt[se]=void 0;return}let xh=-o*Ht.fromBelow;Bt=xh+(Je-xh)*ui}K.mesh.position.set(at,Bt,0),K.mesh.scale.set(Qt,Nt,1);let kt=We+a/2,Gr=o/2-Je;J.push({left:kt-Lt/2,right:kt+Lt/2,top:Gr-Nn/2,bottom:Gr+Nn/2,poolIdx:se,srcIndex:ve,centerX:We}),Math.abs(We)<P&&(P=Math.abs(We),Q={srcIndex:ve,centerX:We,wPx:$e,h:we,poolIdx:se})})}function Pe(P,G){for(let j of J)if(P>=j.left&&P<=j.right&&G>=j.top&&G<=j.bottom)return j;return null}function ue(P){let G=A.domElement.getBoundingClientRect();return{x:P.clientX-G.left,y:P.clientY-G.top}}let pe=A.domElement,De=!1,ne=null,fe=0,Ae=0,Ce=0,le=0,Ge=!1,L="mouse",me=Number.NaN,ae=Number.NaN,xe=!1,re="mouse";e&&Ft.set(e,{xPercent:20,yPercent:30,scale:0,autoAlpha:0});let te=e?Ft.quickTo(e,"x",{duration:.5,ease:"power3.out"}):null,he=e?Ft.quickTo(e,"y",{duration:.5,ease:"power3.out"}):null,ze=!1,ut=!1,rt="";function Jt(P){P!==rt&&(rt=P,pe.style.cursor=P)}function $t(){return be.active||et||Se?Jt(""):Jt(De?"grabbing":ut?"grab":"")}function Ci(P){ut=P,Ri(P)}function Ia(){if(!(!xe||re!=="mouse")&&Number.isFinite(me)){if(be.active){Ci(!1);return}Ci(Pe(me,ae)!==null)}}function Ri(P){if((et||Se)&&(P=!1),De&&(P=!1),P===ze){$t();return}ze=P,$t(),e&&(Ft.killTweensOf(e,"scale,autoAlpha,opacity,visibility"),Ft.to(e,{scale:P?1:0,autoAlpha:P?1:0,duration:P?.35:.25,ease:P?"power3.out":"power3.in"}))}function zr(){return be.active||et||Se}function Rs(P){P.preventDefault(),!zr()&&(Ue=!0,ee=null,Re+=(P.deltaY||P.deltaX)*f,_e=performance.now(),ye=!1)}function Ps(P){if(Ge=!1,zr()||De||P.button!==0&&P.pointerType==="mouse")return;De=!0,ne=P.pointerId,L=P.pointerType||"mouse";try{pe.setPointerCapture(P.pointerId)}catch{}let G=ue(P);fe=G.x,me=G.x,ae=G.y,Ae=0,Ce=0,le=performance.now(),Ri(!1),ke=0,ee=null,Ue=!0,ye=!1,_e=le}function Hn(P){let G=ue(P);if(De&&P.pointerId===ne){let j=L==="mouse"?_:g,K=G.x-fe;fe=G.x,Ae+=Math.abs(K),Re-=K*j,Ce=Ce*.6+-K*j*.4,le=performance.now(),_e=le,ye=!1}if(me=G.x,ae=G.y,re=P.pointerType||"mouse",xe=!0,P.pointerType==="mouse"){if(te&&te(G.x),he&&he(G.y),be.active){Ci(!1);return}Ci(Pe(G.x,G.y)!==null)}}function Pi(P){if(De&&!(P&&ne!==null&&P.pointerId!==ne)){if(De=!1,ne!==null){try{pe.releasePointerCapture(ne)}catch{}ne=null}ke=performance.now()-le>Ob?0:Ce,Ce=0,_e=performance.now(),ye=!1,Ge=Ae>(L==="mouse"?Fb:Ub),L==="mouse"?Ci(Pe(me,ae)!==null):$t()}}function Is(P){xe=!0,re=P.pointerType||"mouse"}function Ds(){xe=!1,Ci(!1)}function or(P){if(Ge){Ge=!1;return}if(zr())return;let G=ue(P),j=Pe(G.x,G.y);if(j){if(Q&&j.poolIdx===Q.poolIdx){ee=null,Ls();return}Ue=!0,ke=0,Re=O(z(ie+j.centerX)),ye=!0,ee={srcIndex:j.srcIndex},Ri(!1)}}function Ls(){if(be.active||!Q||!I[Q.srcIndex]?.tex)return;be.active=!0,be.srcIndex=Q.srcIndex;let G=Q.poolIdx;be.poolIdx=G,Re=O(z(ie));let j=nt[G]||0,K=q.map((Le,We)=>({idx:We,x:nt[We]})).filter(Le=>Le.idx!==G&&Le.x!==void 0).map(Le=>({idx:Le.idx,dist:Math.abs((Le.x??0)-j)})).sort((Le,We)=>Le.dist-We.dist),se=0,de=-1,ve=K.map(Le=>(de>=0&&Le.dist-de>1&&(se+=1),de=Le.dist,{idx:Le.idx,rank:se}));for(let Le of Ap)F[Le]=Ne[Le].value;be.anim&&be.anim.kill();let oe={v:D},Fe=Ft.timeline();Fe.to(be,{lensFx:0,duration:mn.lensFade,ease:"power3.out"},0),Fe.to(oe,{v:mn.centerScale,duration:mn.focusDuration,ease:mn.focusEase,onUpdate(){D=oe.v}},0),ve.forEach(Le=>{Fe.to(mt,{[Le.idx]:1,duration:mn.cardDuration,ease:mn.cardEase},Le.rank*mn.stagger)}),be.anim=Fe,Ri(!1),t.onFocusChange(!0)}function Vr(){if(!be.active)return;be.anim&&be.anim.kill();let P=nt[be.poolIdx]||0,G=q.map((oe,Fe)=>({idx:Fe,x:nt[Fe]})).filter(oe=>oe.x!==void 0&&(mt[oe.idx]||0)>0).map(oe=>({idx:oe.idx,dist:Math.abs((oe.x??0)-P)})).sort((oe,Fe)=>Fe.dist-oe.dist),j=0,K=-1,se=G.map(oe=>(K>=0&&K-oe.dist>1&&(j+=1),K=oe.dist,{idx:oe.idx,rank:j}));t.onFocusChange(!1);let de={v:D},ve=Ft.timeline({onComplete:()=>{be.active=!1,be.srcIndex=-1,$t()}});ve.to(be,{lensFx:1,duration:mn.lensFade*.8,ease:"power3.inOut"},0),ve.to(de,{v:1,duration:mn.focusDuration*.85,ease:mn.focusEase,onUpdate(){D=de.v}},0),se.forEach(oe=>{ve.to(mt,{[oe.idx]:0,duration:mn.cardDuration*.85,ease:mn.cardEase},oe.rank*mn.stagger*.7)}),be.anim=ve}function Da(){if(!i){t.onEntryDone(!0);return}v&&v.kill();for(let Ie=0;Ie<Ke.length;Ie++)Ke[Ie]=0;et=!0,Se=!1,t.onEntryDone(!1);for(let Ie=0;Ie<C.length;Ie++)C[Ie]=0;be.lensFx=0,Re=O(z(ie)),ie=Re,ke=0,ye=!0,Z();let P=[];for(let Ie=0;Ie<nt.length;Ie++)nt[Ie]!==void 0&&P.push(Ie);let G=Ft.timeline({delay:Ht.delay}),j=Ht.stagger*Math.max(P.length-1,1),K=0;P.forEach(Ie=>{let we=Math.random()*j;K=Math.max(K,we+Ht.riseDuration),G.to(Ke,{[Ie]:1,duration:Ht.riseDuration,ease:Ht.riseEase},we)}),G.call(()=>{et=!1,Se=!0},[],K);let se=$(ie),de=I.length,ve=Math.floor(Ei/2),oe=[],Fe=0;for(let Ie=0;Ie<nt.length;Ie++){if(nt[Ie]===void 0||Math.floor(Ie/de)!==ve)continue;let we=Ie%de-se;we>de/2&&(we-=de),we<-de/2&&(we+=de);let $e=Math.abs(we);Fe=Math.max(Fe,$e),oe.push({idx:Ie,rank:$e})}let Le=oe.map(Ie=>({idx:Ie.idx,rank:Fe-Ie.rank})),We=K+Ht.growDelay,ht=We;G.to(be,{lensFx:1,duration:Ht.lensBloom,ease:Ht.lensBloomEase},We),Le.forEach(Ie=>{let we=We+Ie.rank*Ht.growStagger;ht=Math.max(ht,we+Ht.growDuration),G.to(C,{[Ie.idx]:1,duration:Ht.growDuration,ease:Ht.growEase},we)}),G.call(()=>{Se=!1;for(let Ie=0;Ie<C.length;Ie++)C[Ie]=1;t.onEntryDone(!0),$t()},[],ht),v=G}function Ns(P){zr()||(Ue=!0,ke=0,ee=null,Re=O(z(ie)+P),ye=!0,_e=performance.now())}pe.addEventListener("wheel",Rs,{passive:!1}),pe.addEventListener("pointerdown",Ps),pe.addEventListener("pointermove",Hn),pe.addEventListener("pointerup",Pi),pe.addEventListener("pointercancel",Pi),pe.addEventListener("pointerenter",Is),pe.addEventListener("pointerleave",Ds),pe.addEventListener("click",or);let lr=0,Fs=!0,Us=!0;function La(){if(!Fs)return;if(!Us||document.hidden){lr=0;return}De||(Re+=ke,ke*=p,Math.abs(ke)<.05&&(ke=0),!ye&&!be.active&&performance.now()-_e>y&&(Re=O(z(ie)),ye=!0));let P=De&&L!=="mouse"?m:ye&&!ee?d:h;ie+=(Re-ie)*P;let G=$(ie);G!==ce&&(ce=G,t.onActiveChange(G));let j=ie-Oe;Oe=ie;let K=Math.min(1,Math.abs(j)/Math.max(1,w)),se=K>Y?S:M;if(Y+=(K-Y)*se,Z(),Ia(),ee&&!be.active&&Math.abs(Re-ie)<.5){let oe=ee;ee=null,Q&&Q.srcIndex===oe.srcIndex&&Ls()}Ne.uCenter.value.set(ot.posX,ot.posY),Ne.uAspect.value=a/o,Ne.uTime.value=performance.now()*.001;let de=oe=>oe*Math.PI/180;Ne.uRotation.value=de(ot.rotation)+de(ot.spin)*(performance.now()*.001);let ve=be.lensFx;for(let oe of Ap)Ne[oe].value=F[oe]*ve;A.setRenderTarget(Me),A.render(R,x),A.setRenderTarget(null),A.render(Xe,pt),lr=requestAnimationFrame(La)}function Os(){!Fs||lr||(lr=requestAnimationFrame(La))}Os(),i?Da():t.onEntryDone(!0);function tc(){a=Math.max(1,r.clientWidth),o=Math.max(1,r.clientHeight),l=c(),V(),A.setSize(a,o),x.left=-a/2,x.right=a/2,x.top=o/2,x.bottom=-o/2,x.updateProjectionMatrix();let P=Math.min(window.devicePixelRatio||1,2);A.setPixelRatio(P),Me.setSize(a*P,o*P),Ne.uRes.value.set(a*P,o*P),Ue||(ie=O(0),Re=ie)}let b=new ResizeObserver(tc);b.observe(r);let U=new IntersectionObserver(([P])=>{let G=P?.boundingClientRect;!G||G.width===0&&G.height===0||(Us=P?.isIntersecting??!0,Us&&Os())});U.observe(r);let X=()=>{document.hidden||Os()};document.addEventListener("visibilitychange",X);function H(){Fs=!1,cancelAnimationFrame(lr),b.disconnect(),U.disconnect(),document.removeEventListener("visibilitychange",X),pe.removeEventListener("wheel",Rs),pe.removeEventListener("pointerdown",Ps),pe.removeEventListener("pointermove",Hn),pe.removeEventListener("pointerup",Pi),pe.removeEventListener("pointercancel",Pi),pe.removeEventListener("pointerenter",Is),pe.removeEventListener("pointerleave",Ds),pe.removeEventListener("click",or),be.anim&&be.anim.kill(),v&&v.kill(),e&&Ft.killTweensOf(e),A.dispose(),Me.dispose(),lt.geometry.dispose(),Ze.dispose(),q.forEach(P=>{P.mesh.geometry.dispose(),P.mat.dispose()}),I.forEach(P=>{P.tex?.dispose()}),A.domElement.parentNode&&A.domElement.parentNode.removeChild(A.domElement)}return{closeFocus:Vr,next:()=>Ns(1),previous:()=>Ns(-1),destroy:H}}function jl(r){return String(r).padStart(2,"0")}function Cp({items:r=Db,panelHeight:e=450,gap:t=12,background:n="#ffffff",entry:i=!0,className:s,style:a,onActiveChange:o,onFocusChange:c}){let l=(0,Et.useRef)(null),u=(0,Et.useRef)(null),h=(0,Et.useRef)(null),d=(0,Et.useRef)(null),f=(0,Et.useRef)(null),_=(0,Et.useRef)(!1),[g,m]=(0,Et.useState)(0),[p,y]=(0,Et.useState)(!1),[w,S]=(0,Et.useState)(!i),[M,A]=(0,Et.useState)(!1),E=(0,Et.useId)(),R=(0,Et.useId)(),x=r[g]??r[0],T=(0,Et.useRef)(o),I=(0,Et.useRef)(c);T.current=o,I.current=c,(0,Et.useEffect)(()=>{let N=l.current;if(!N||r.length===0)return;let k=kb(N,u.current,{items:r,panelHeight:e,gap:t,background:n,entry:i,onActiveChange:V=>{m(V),T.current?.(V)},onFocusChange:V=>{y(V),I.current?.(V)},onEntryDone:S});if(!k){A(!0);return}return h.current=k,()=>{k.destroy(),h.current=null}},[r,e,t,n,i]),(0,Et.useEffect)(()=>{let N=d.current,k=f.current;if(!N||!k)return;let V=Ep();if(Ft.set(N,{xPercent:-50}),Ft.set(k,{xPercent:-50}),!w&&i&&!V){Ft.set([N,k],{autoAlpha:0}),_.current=!1;return}let O=p?window.innerHeight*-.05:0;if(w&&!p&&!_.current){_.current=!0,Ft.fromTo(N,{autoAlpha:0},{autoAlpha:1,duration:V?0:1.6,ease:"power2.out"}),Ft.fromTo(k,{autoAlpha:0},{autoAlpha:1,duration:V?0:1.6,ease:"power2.out",delay:V?0:.18});return}Ft.to(N,{y:O,autoAlpha:1,duration:V?0:.4,ease:"power3.out"}),Ft.to(k,{autoAlpha:p?0:1,duration:V?0:.4,ease:"power3.out"})},[p,w,i]);let B=N=>{N.key==="ArrowRight"?(N.preventDefault(),h.current?.next()):N.key==="ArrowLeft"?(N.preventDefault(),h.current?.previous()):N.key==="Escape"&&(N.preventDefault(),h.current?.closeFocus())};return(0,An.jsxs)("div",{className:Jl("relative h-full min-h-[420px] w-full overflow-hidden outline-none focus-visible:ring-2 focus-visible:ring-black/20",s),style:{background:n,color:"#111111",...a},tabIndex:0,role:"region","aria-roledescription":"carousel","aria-labelledby":E,onKeyDown:B,children:[(0,An.jsx)("p",{id:E,className:"sr-only",children:"Liquid glass project carousel"}),(0,An.jsxs)("p",{id:R,className:"sr-only","aria-live":"polite",children:[x?.title??"",", ",jl(g+1)," of ",jl(r.length),p?", focused":""]}),(0,An.jsx)($l,{fallback:(0,An.jsx)(Ql,{className:"absolute inset-0",message:"This carousel needs WebGL, which is unavailable in this browser."}),children:M?(0,An.jsx)(Ql,{className:"absolute inset-0",message:"This carousel needs WebGL, which is unavailable in this browser."}):(0,An.jsx)("div",{ref:l,className:"absolute inset-0"})}),(0,An.jsx)("p",{ref:d,className:"pointer-events-none absolute left-1/2 top-[4.5%] z-10 m-0 text-center text-[15px] font-medium tracking-[-0.02em] text-black opacity-0 sm:text-[17px]",children:x?.title}),(0,An.jsxs)("p",{ref:f,className:"pointer-events-none absolute bottom-[6%] left-1/2 z-10 m-0 text-center text-[13px] font-medium tabular-nums tracking-[-0.02em] text-black opacity-0 sm:text-[15px]",children:[jl(g+1),"/",jl(r.length)]}),(0,An.jsx)("div",{ref:u,className:"pointer-events-none absolute left-0 top-0 z-20 text-[13px] font-medium text-black mix-blend-exclusion",children:"View"}),(0,An.jsx)("button",{type:"button",onClick:()=>h.current?.closeFocus(),"aria-label":"Close focused project",className:"absolute right-[4%] top-[4.5%] z-20 text-[13px] font-medium text-black mix-blend-exclusion transition-opacity duration-300",style:{opacity:p?1:0,pointerEvents:p?"auto":"none"},children:"Close"})]})}var Pa=Wn("react/jsx-runtime"),Vb=Cp;function Gb(){return(0,Pa.jsx)(Vb,{panelHeight:540})}function ec(r,e=""){document.documentElement.dataset.previewStatus=r,document.documentElement.dataset.previewReason=e,parent.postMessage({type:"expresso-componentry-preview",id:"componentry-liquid-glass-carousel",status:r,reason:e},"*")}var mh=class extends Rp.default.Component{state={error:null};static getDerivedStateFromError(e){return{error:String(e)}}componentDidCatch(e){ec("error",String(e))}render(){return this.state.error?(0,Pa.jsx)("pre",{role:"alert",children:this.state.error}):this.props.children}};window.addEventListener("error",r=>ec("error",r.message));window.addEventListener("unhandledrejection",r=>ec("error",String(r.reason)));(0,Pp.createRoot)(document.getElementById("demo")).render((0,Pa.jsx)(mh,{children:(0,Pa.jsx)(Gb,{})}));setTimeout(()=>{if(document.documentElement.dataset.previewStatus==="error")return;let e=[...document.getElementById("demo").querySelectorAll("*")].some(t=>{let n=t.getBoundingClientRect(),i=getComputedStyle(t);return n.width>2&&n.height>2&&(t.textContent.trim()||t.matches("input,textarea,select,button,svg,canvas,img,video")||i.backgroundImage!=="none"||i.backgroundColor!=="rgba(0, 0, 0, 0)"&&i.backgroundColor!=="transparent")});ec(e?"ready":"empty",e?"":"\uCEF4\uD3EC\uB10C\uD2B8\uC758 \uD45C\uC2DC \uB0B4\uC6A9\uC774 \uC5C6\uC2B5\uB2C8\uB2E4.")},3500);})();
/*! For license information please see componentry-liquid-glass-carousel.js.LEGAL.txt */
