/**
 * 지면 어휘 — **여기가 유일한 소스다.**
 *
 * 모델이 쓸 수 있는 클래스와 실제로 컴파일되는 클래스는 **같아야 한다.**
 * 전에는 둘이 따로 있었다: 검증기(`layout-classes.ts`)는 금지 목록만 봤고,
 * 실제로 그려지는 것은 `portfolio-utilities.css`의 `@source inline`이 정했다.
 * 그래서 `w-24`나 `hover:opacity-80`은 **검증을 통과한 뒤 조용히 사라졌다** —
 * 모델은 자기가 짠 지면이 그려졌는지 알 방법이 없었다.
 *
 * 이제 순서가 반대다. 이 파일의 패턴이 CSS를 만들고(`scripts/build-portfolio-css.mjs`),
 * 같은 패턴이 검증기의 통과 목록이 된다. 어휘에 없는 클래스는 **거절되고**,
 * 거절 사유가 재생성 프롬프트에 실려 모델이 다시 짤 기회를 얻는다.
 *
 * 어휘를 넓히려면 이 파일만 고치고 `pnpm build:portfolio-css`를 돌린다.
 */

/** 팔레트에 묶인 색 이름. 실제 값은 지면마다 다르다. */
export const PALETTE_COLOR_NAMES = [
  "ink",
  "paper",
  "accent",
  "muted",
  "hairline",
] as const;

/** 여백 계단. 여백은 지면의 인상을 가장 크게 좌우해서 거의 자르지 않는다. */
const SPACE = "0,px,0.5,1,1.5,2,2.5,3,3.5,4,5,6,7,8,9,10,11,12,14,16,20,24,28,32,36,40,48,56,64,72,80,96";
/** 상자 크기. 아바타 · 아이콘 · 워터마크 · 그림 자리가 전부 여기서 나온다. */
const SIZE = "0,px,1,2,3,4,5,6,7,8,9,10,11,12,14,16,20,24,28,32,36,40,48,56,64,72,80,96";
/** 반응형 변형. 공개되는 지면이라 좁은 화면에서 무너지면 안 된다. */
const BP = "{sm:,md:,lg:,}";

/**
 * `@source inline(...)`과 같은 표기다. `{a,b}`는 갈래, 마지막 빈 갈래(`{sm:,}`)는
 * 변형 없는 형태를 함께 만든다.
 */
export const PORTFOLIO_UTILITY_PATTERNS: readonly string[] = [
  // ── 색 ─────────────────────────────────────────────────────────────
  "{text,bg,border,decoration,ring,divide,fill,stroke}-{ink,paper,accent,muted,hairline}",
  // 형광과 옅은 면 — 강조색을 깔되 글자를 덮지 않는 농도만.
  "bg-{accent,muted,ink}/{5,10,15,20,25,40,60,80}",
  "border-{accent,hairline,ink,muted}/{5,10,15,20,25,40,60,80}",
  // 표지(cover) 그라디언트. **섹션 배경에는 쓸 수 없다**(`layout-classes.ts`).
  // 카드·타일 안에서만 쓰는 한 AI 티가 아니라 표지 미술이다.
  "bg-linear-to-{r,br,b,bl,tr}",
  "{from,via,to}-{ink,paper,accent,muted}",
  "{from,via,to}-{accent,ink,muted}/{20,40,60,80}",

  // ── 타이포 ─────────────────────────────────────────────────────────
  `${BP}text-{step-1,step0,step1,step2,step3,step4,step5}`,
  "font-{display,body,mono}",
  "font-{thin,light,normal,medium,semibold,bold,black}",
  "leading-{none,tight,snug,normal,relaxed,loose}",
  "tracking-{tighter,tight,normal,wide,wider,widest}",
  `${BP}text-{left,center,right,justify}`,
  "text-{balance,pretty,wrap,nowrap}",
  "{uppercase,lowercase,capitalize,italic,not-italic}",
  "{underline,no-underline,line-through}",
  "underline-offset-{2,4,8}",
  "decoration-{1,2,4}",
  "line-clamp-{1,2,3,4,none}",
  "{tabular-nums,proportional-nums,slashed-zero,ordinal}",
  "whitespace-{normal,nowrap,pre-line,pre-wrap}",
  "{truncate,text-ellipsis}",
  // 한국어는 단어 중간에서 끊으면 안 된다.
  "break-{normal,words,keep,all}",
  `${BP}max-w-{measure,none,xs,sm,md,lg,xl,2xl,3xl,4xl,5xl,6xl,prose,full}`,

  // ── 레이아웃 ───────────────────────────────────────────────────────
  `${BP}{block,inline,inline-block,flex,inline-flex,grid,inline-grid,contents,hidden}`,
  `${BP}flex-{row,row-reverse,col,col-reverse,wrap,nowrap,1,auto,none,shrink,grow}`,
  "{shrink,grow}-{0,1}",
  "items-{start,center,end,baseline,stretch}",
  "justify-{start,center,end,between,around,evenly}",
  "justify-items-{start,center,end,stretch}",
  "justify-self-{start,center,end,stretch,auto}",
  "place-items-{start,center,end,stretch}",
  "content-{start,center,end,between}",
  "self-{start,center,end,stretch,auto,baseline}",
  `${BP}grid-cols-{1,2,3,4,5,6,7,8,9,10,11,12}`,
  "grid-rows-{1,2,3,4,5,6}",
  "auto-rows-{auto,fr,min,max}",
  "grid-flow-{row,col,dense,row-dense,col-dense}",
  `${BP}col-span-{1,2,3,4,5,6,7,8,9,10,11,12,full}`,
  "row-span-{1,2,3,4,full}",
  `${BP}col-start-{1,2,3,4,5,6,7,8,9,10,11,12,13,auto}`,
  "row-start-{1,2,3,4,auto}",
  `${BP}columns-{1,2,3,4}`,
  `${BP}gap-{${SPACE}}`,
  `${BP}gap-{x,y}-{${SPACE}}`,
  `${BP}{w,h}-{full,auto,fit,min,max}`,
  `${BP}{w,h,size}-{${SIZE}}`,
  "{w,h}-{1/2,1/3,2/3,1/4,3/4}",
  "{min-w,min-h}-{0,full,fit}",
  "max-h-{none,full,fit}",
  "aspect-{square,video,auto,3/4,4/3}",
  "order-{first,last,none,1,2,3,4,5,6}",
  "float-{left,right,none}",
  `${BP}mx-auto`,
  "isolate",

  // ── 여백 ───────────────────────────────────────────────────────────
  `${BP}{p,px,py,pt,pr,pb,pl}-{${SPACE}}`,
  `${BP}{m,mx,my,mt,mr,mb,ml}-{${SPACE},auto}`,
  "-{mx,my,mt,mr,mb,ml}-{1,2,3,4,6,8,10,12,16,20,24}",
  "space-{x,y}-{0,1,2,3,4,5,6,8,10,12}",

  // ── 장식 ───────────────────────────────────────────────────────────
  // 값 없는 형태. `border`가 1px 테두리고 `rounded`가 기본 모서리다 —
  // 카드에 가장 많이 쓰는 것들이라 빠지면 어휘가 있으나 마나다.
  "{border,rounded,shadow,ring,grow,shrink}",
  "rounded-{none,sm,md,lg,xl,2xl,3xl,full}",
  "rounded-{t,r,b,l,tl,tr,br,bl}-{none,sm,md,lg,xl,2xl,3xl,full}",
  "border-{0,2,4,8}",
  "border-{t,r,b,l,x,y}",
  "border-{t,r,b,l,x,y}-{0,2,4}",
  "border-{solid,dashed,dotted,none}",
  "divide-{x,y}",
  "ring-{0,1,2,4}",
  "ring-inset",
  "list-{none,disc,decimal,inside,outside}",
  "opacity-{0,5,10,15,20,25,30,40,50,60,70,75,80,90,100}",
  "object-{cover,contain,fill,center,top,bottom,left,right}",
  "overflow-{hidden,visible,auto,clip}",
  "overflow-{x,y}-{hidden,visible,auto,clip}",
  "shadow-{none,sm,md,lg,xl,2xl}",
  "{align-baseline,align-top,align-middle,align-bottom}",

  // ── 움직임 ─────────────────────────────────────────────────────────
  // 지면은 종이가 아니라 화면에 선다. 링크와 카드가 눌리는 것임을 알려야 한다.
  // 큰 움직임은 넣지 않는다 — `translate`도 `scale`도 없다.
  "transition",
  "transition-{colors,opacity,shadow,all,none}",
  "duration-{100,150,200,300,500}",
  "ease-{linear,in,out,in-out}",
  "hover:opacity-{60,70,80,90,100}",
  "hover:bg-{accent,muted,ink}/{5,10,15,20,25}",
  "hover:{text,border}-{ink,accent,muted,hairline}",
  "hover:{underline,no-underline}",
  "focus-visible:{underline,opacity-100}",
  "focus-visible:ring-{1,2}",
  "focus-visible:ring-{accent,ink}",
] as const;

/** `{a,b}`를 편다. 마지막 빈 갈래(`{sm:,}`)는 변형 없는 형태를 만든다. */
export function expandPattern(pattern: string): string[] {
  const open = pattern.indexOf("{");
  if (open === -1) return [pattern];
  const close = pattern.indexOf("}", open);
  if (close === -1) return [pattern];
  const head = pattern.slice(0, open);
  const tail = pattern.slice(close + 1);
  const options = pattern.slice(open + 1, close).split(",");
  return options.flatMap((option) => expandPattern(`${head}${option}${tail}`));
}

let compiled: Set<string> | null = null;

/** 실제로 CSS에 있는 클래스 전부. CSS 생성과 검증이 이 하나를 본다. */
export function compiledClassNames(): ReadonlySet<string> {
  compiled ??= new Set(PORTFOLIO_UTILITY_PATTERNS.flatMap(expandPattern));
  return compiled;
}

/** 컴파일되는 클래스인가. 그리지 못할 것을 통과시키지 않는다. */
export function isCompiledClassName(token: string): boolean {
  return compiledClassNames().has(token);
}
