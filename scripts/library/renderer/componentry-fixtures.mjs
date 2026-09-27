// 공식 컴포넌트의 필수 입력을 채우는 독립 실행 예제입니다.
import fs from 'node:fs';
import {portfolioProjects,portfolioFixtureNames} from './componentry-portfolio-data.mjs';
export {portfolioFixtureNames};
const photo='https://images.unsplash.com/photo-1497366754035-f200968a6e72?w=1200&q=85';
const photos=[
  'https://images.unsplash.com/photo-1497366811353-6870744d04b2?w=1200&q=85',
  'https://images.unsplash.com/photo-1497366858526-0766cadbe8fa?w=1200&q=85',
  'https://images.unsplash.com/photo-1497366754035-f200968a6e72?w=1200&q=85',
];
const images=JSON.stringify(photos);
const cards=JSON.stringify(photos.map((image,index)=>({id:index+1,image,title:['Studio','Archive','Practice'][index]})));
const gridImages=JSON.stringify(photos.map((src,index)=>({src,alt:['Studio','Archive','Practice'][index]})));
const inlineLogo='data:image/svg+xml;charset=utf-8,'+encodeURIComponent(fs.readFileSync(new URL('../../../docs/library/materials/componentry/support/dithered-logo.svg',import.meta.url),'utf8'));
const inlineFont='data:font/otf;base64,'+fs.readFileSync(new URL('../../../docs/library/materials/componentry/support/LastoriaBoldRegular.otf',import.meta.url)).toString('base64');
const caseStudies=JSON.stringify(portfolioProjects.map(project=>({
  eyebrow:project.category,title:project.title,description:project.description,
  image:project.image,imageAlt:project.imageAlt,background:project.background,foreground:project.foreground,
})));
const stickyCards=JSON.stringify(portfolioProjects.map(project=>({title:project.title,src:project.image})));
const orbitProjects=JSON.stringify(portfolioProjects.map(project=>({
  name:project.title,role:project.category,description:project.description,
  accent:project.accent,stat:'가상 프로젝트',image:project.image,
})));

export const componentryFixtures={
  'annotated-text':'<div className="grid h-[740px] place-items-center"><div className="text-6xl font-semibold leading-relaxed"><C variant="highlight">Design in motion</C></div></div>',
  'aurora-flow':'<div className="grid h-[740px] place-items-center bg-[#061529]"><C className="h-[420px] w-full" /></div>',
  'ascii-effect':`<C imageSrc=${JSON.stringify(photo)} className="h-[620px] w-full" />`,
  'case-study-flip-stack':`<C items={${caseStudies}} heading="가상 프로젝트 사례" hint="스크롤해 사례 보기" endLabel="예제 끝" />`,
  'circuit-board':'<C width={880} height={540} nodes={[{id:"research",x:120,y:150,label:"Research",status:"active"},{id:"design",x:430,y:120,label:"Design",status:"processing"},{id:"delivery",x:680,y:320,label:"Delivery",status:"active"}]} connections={[{from:"research",to:"design",animated:true},{from:"design",to:"delivery",animated:true}]} />',
  'collection-surfer':`<C items={${cards}} variant="magnetic" />`,
  'cursor-driven-particle-typography':'<C text="EXPRESSO" />',
  'dither-prism-hero':'<C title1="Creative" title2="Portfolio" />',
  'dithered-logo':`<C imageSrc=${JSON.stringify(inlineLogo)} className="h-[740px] w-full" scale={0.36} />`,
  'eye-tracking':'<div className="grid h-[740px] place-items-center bg-[#f1eee7]"><C /></div>',
  'flipping-word-swap':'<div className="grid h-[740px] place-items-center text-6xl font-semibold"><C word1="Create" word2="Express" /></div>',
  'flight-status-card':'<div className="grid h-[740px] place-items-center"><C /></div>',
  'github-calendar':'<div className="grid h-[740px] place-items-center"><C username="portfolio-demo" /></div>',
  'hero-geometric':'<C title1="Creative" title2="Portfolio" description="Selected work and the thinking behind it." />',
  'hover-transition':'<C className="h-[560px] w-full" defaultComponent={<div className="grid h-full place-items-center bg-zinc-100 text-5xl font-semibold">Discover</div>} hoverComponent={<div className="grid h-full place-items-center bg-lime-300 text-5xl font-semibold">Explore</div>} />',
  'image-trail':`<div className="relative h-[650px] bg-zinc-950"><h1 className="pointer-events-none absolute inset-0 z-10 grid place-items-center text-6xl font-semibold text-white">Explore</h1><C images={${images}} /></div>`,
  'image-ripple-effect':`<C className="h-[740px] w-full" images={[{src:${JSON.stringify(photo)},x:0,y:0,widthScale:0.34,heightScale:0.42}]} />`,
  'kinetic-text-reveal':'<div className="grid h-[740px] place-items-center"><C text="Interfaces that move with intent" className="text-6xl font-semibold" /></div>',
  'layered-stack':'<C className="relative mx-auto grid h-[560px] max-w-[820px] grid-cols-3 items-center gap-4">{["Research","Design","Delivery"].map((label,index)=><div key={label} className="grid h-[300px] place-items-center rounded-3xl bg-zinc-900 text-3xl font-semibold text-white" style={{backgroundColor:["#1d4ed8","#7c3aed","#be185d"][index]}}>{label}</div>)}</C>',
  'letter-cascade':'<div className="grid h-[740px] place-items-center"><C text="Creative practice" className="text-6xl font-semibold" /></div>',
  'liquid-glass-carousel':'<C panelHeight={540} />',
  'mac-keyboard':'<C />',
  'magnet-lines':'<div className="grid h-[740px] place-items-center bg-zinc-950"><C /></div>',
  'magnetic-dock':'<div className="grid h-[740px] place-items-center"><C items={[{id:"home",label:"Home",icon:<E.DockIconHome/>},{id:"search",label:"Search",icon:<E.DockIconSearch/>},{id:"folder",label:"Projects",icon:<E.DockIconFolder/>},{id:"mail",label:"Contact",icon:<E.DockIconMail/>}]} /></div>',
  'music-player':`<div className="grid h-[740px] place-items-center bg-zinc-950"><C coverArt=${JSON.stringify(photo)} src="" /></div>`,
  'newsletter-bookshelf':'<C items={E.defaultNewsletterBooks.slice(0,8)} height={620} />',
  'pixel-canvas':'<div className="relative h-[560px] overflow-hidden rounded-3xl bg-zinc-950"><C className="absolute inset-0"/><div className="pointer-events-none absolute inset-0 grid place-items-center text-5xl font-bold text-white">Pixel Canvas</div></div>',
  'pixel-image-trail':`<C src=${JSON.stringify(photo)} alt="A bright creative studio" className="h-[620px] w-full" />`,
  'ripple-transition':`<C images={${images}} className="h-[620px] w-full" />`,
  'scroll-based-velocity':'<div className="grid h-[740px] items-center"><C text="EXPRESSO PORTFOLIO" className="text-6xl font-bold" /></div>',
  'scroll-choreography':`<C images={{topLeft:${JSON.stringify(photos[0])},topRight:${JSON.stringify(photos[1])},bottomLeft:${JSON.stringify(photos[2])},bottomRight:${JSON.stringify(photos[0])}}} />`,
  'scroll-split-card':`<C imageSrc=${JSON.stringify(portfolioProjects[1].image)} cards={[{title:"문제 정의",description:"흩어진 자료를 다시 찾기 어렵다는 가상 상황",bgColor:"#ddd0f4",textColor:"#352d50"},{title:"화면 설계",description:"기록과 연결을 한 흐름에 배치",bgColor:"#c1dcd4",textColor:"#143e4a"},{title:"시연 화면",description:"주제별 연결을 탐색하는 가상 시제품",bgColor:"#f2d9bb",textColor:"#633d27"}]} />`,
  'sticky-scroll-cards':`<C cards={${stickyCards}} hint="가상 프로젝트 탐색" />`,
  'orbit-card-stack':`<div className="grid min-h-[740px] place-items-center bg-[#eeeaf4]"><C items={${orbitProjects}} defaultActiveIndex={1} spread={window.innerWidth<600?28:window.innerWidth<900?72:168} /></div>`,
  'scroll-tilted-grid':`<C images={${gridImages}} smoothScroll={false} />`,
  'signature':`<div className="grid h-[740px] place-items-center"><C text="Expressive work" fontSize={74} fontUrl=${JSON.stringify(inlineFont)} /></div>`,
  'silk-aurora':'<C title="Beyond the brief" subtitle="Creative practice" description="Ideas shaped into useful experiences." />',
  'spectral-ribbon':'<div className="relative h-[620px] w-full"><C className="absolute inset-0"><div className="grid h-full place-items-center text-6xl font-semibold text-white">Portfolio</div></C></div>',
  'spiral-3d-slider':`<C items={${gridImages}} className="h-[640px] w-full" />`,
  'split-flap-display':'<div className="grid h-[740px] place-items-center"><C text="EXPRESSO" /></div>',
  'text-repel':'<div className="grid h-[740px] place-items-center"><C text="Move your cursor" className="text-6xl font-semibold" /></div>',
  'text-morph':'<div className="grid h-[740px] place-items-center"><C className="text-7xl font-semibold" /></div>',
};

export const componentryDefaultFixture='<C />';
