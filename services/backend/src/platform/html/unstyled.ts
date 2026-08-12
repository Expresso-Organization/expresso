/**
 * **화면에서 조용히 사라지는 요소**를 브라우저 없이 찾는다.
 *
 * 자유 생성의 고유한 위험이다. 옛 경로에서는 막대를 우리 컴포넌트가 그렸으니
 * CSS가 어긋나도 막대는 있었다. 이제는 모델이 전부 그리므로 한 줄이 어긋나면
 * 요소가 통째로 없어진 채 **그럴듯해 보이는** 페이지가 나가고, 모델은 제 지면을
 * 못 보므로 스스로 알 길이 없다.
 *
 * 두 가지를 본다:
 *
 * - `unstyledClasses` — 규칙이 하나도 없는 클래스.
 * - `inlineSizedClasses` — inline 요소에 `width`·`height`를 준 곳. 실제로 이것 때문에
 *   막대 그래프 세 줄이 전부 빈 트랙만 남은 적이 있다. `<span>`에 `height:100%`를
 *   줬는데 `display`가 없었다.
 *
 * 둘 다 **틀리면 놓치는 쪽으로** 틀리게 짰다. 멀쩡한 지면을 거절해 10분짜리
 * 재생성을 부르는 것이 한 번 놓치는 것보다 나쁘다.
 */

/**
 * 기본이 inline인 태그들.
 *
 * 여기에 `width`·`height`를 주면 **아무 일도 일어나지 않는다.** CSS를 직접 쓰는
 * 모델이 가장 자주 밟는 지뢰다 — 막대 그래프의 채우기를 `<span>`으로 만들고
 * `height:100%`를 주면 화면에서 그냥 사라진다.
 */
const INLINE_TAGS = new Set([
  "span", "a", "em", "strong", "b", "i", "u", "s", "small", "mark", "code",
  "kbd", "samp", "sub", "sup", "abbr", "cite", "q", "time", "label",
]);

/** 크기를 주려는 선언. inline 요소에서는 전부 무시된다. */
const SIZING = /(?:^|;)\s*(?:min-|max-)?(?:width|height)\s*:/;

/** 이 클래스에 붙은 모든 선언을 이어 붙인다(미디어 쿼리 안의 것까지). */
function declarationsFor(css: string, name: string): string {
  const escaped = name.replaceAll(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`\\.${escaped}(?![\\w-])[^{}]*\\{([^}]*)\\}`, "g");
  return [...css.matchAll(pattern)].map(([, body]) => body ?? "").join(";");
}

/**
 * 부모가 flex · grid면 자식은 블록으로 승격되어 `display` 없이도 크기가 먹는다.
 *
 * **직계 부모만 본다.** 승격은 한 대만 내려간다 — 조상 아무나로 넓히면 실제로
 * 사라진 요소를 놓친다(그리드 자식인 트랙은 살고, 그 안의 채우기는 죽는다.
 * 이 검사를 처음 쓸 때 정확히 그걸 놓쳤다).
 */
function blockifyingParent(css: string, parent: string | undefined): boolean {
  if (!parent) return false;
  return parent.split(/\s+/).filter(Boolean).some((name) =>
    /display\s*:\s*(?:inline-)?(?:flex|grid)/.test(declarationsFor(css, name)));
}

/**
 * inline 요소에 크기를 준 곳.
 *
 * **요소 단위로 본다.** 클래스마다 따로 보면 `class="fill fill-1"`처럼 기반 클래스가
 * `display`를 주고 변형이 `width`를 주는 흔한 짜임을 잘못 잡는다 — 그러면 멀쩡한
 * 지면 때문에 몇 분짜리 재생성을 부른다.
 *
 * 반환값은 `클래스(태그)` 꼴이다 — 모델에게 되돌려 줄 때 어디를 고칠지 보이게 한다.
 */
export function inlineSizedClasses(html: string, css: string): string[] {
  const found = new Set<string>();
  const stack: string[] = [];
  const tag = /<(\/?)([a-zA-Z][\w-]*)([^>]*?)(\/?)>/g;

  for (const [, closing, name = "", attributes = "", selfClosing] of html.matchAll(tag)) {
    const lower = name.toLowerCase();
    if (closing) {
      stack.pop();
      continue;
    }
    const classes = /\sclass="([^"]*)"/.exec(attributes)?.[1] ?? "";
    const names = classes.split(/\s+/).filter(Boolean);
    if (INLINE_TAGS.has(lower) && names.length > 0) {
      // 이 요소에 걸린 규칙 전부를 합쳐서 본다.
      const declarations = names.map((name) => declarationsFor(css, name)).join(";");
      const sized = SIZING.test(`;${declarations}`);
      const hasDisplay = /display\s*:/.test(declarations);
      if (sized && !hasDisplay && !blockifyingParent(css, stack.at(-1))) {
        found.add(`${names.join(".")}(<${lower}>)`);
      }
    }
    if (!selfClosing && !VOID_TAGS.has(lower)) stack.push(classes);
  }
  return [...found].sort();
}

const VOID_TAGS = new Set(["br", "hr", "img", "source", "col", "input", "meta", "link"]);

/** CSS 어딘가에 `.이름`으로 등장하는 모든 클래스. */
function styledNames(css: string): Set<string> {
  // 선언 블록 안에 클래스처럼 생긴 것이 있어도 **있는 것으로 친다.** 이 검사는
  // 틀리면 놓치는 쪽으로 틀려야 한다 — 멀쩡한 지면을 거절하는 것이 더 나쁘다.
  const withoutComments = css.replaceAll(/\/\*[\s\S]*?\*\//g, " ");
  const names = new Set<string>();
  for (const [, name] of withoutComments.matchAll(/\.(-?[_a-zA-Z][\w-]*)/g)) {
    if (name !== undefined) names.add(name);
  }
  return names;
}

/**
 * 규칙이 **하나도** 없는 클래스 목록.
 *
 * 요소 단위가 아니라 이름 단위로 본다. `class="card card--wide"`에서 `card`에만
 * 규칙이 있으면 그 요소는 그려지므로, 여기서 찾는 것은 어느 규칙에도 안 걸리는
 * 이름이다. 의미만 담은 이름(`js-`, 앵커용)이 걸릴 수 있어 **거절이 아니라
 * 재시도 사유**로 쓴다.
 */
export function unstyledClasses(html: string, css: string): string[] {
  const styled = styledNames(css);
  const used = new Set<string>();
  for (const [, value] of html.matchAll(/\sclass="([^"]*)"/g)) {
    for (const name of (value ?? "").split(/\s+/)) {
      if (name) used.add(name);
    }
  }
  return [...used].filter((name) => !styled.has(name)).sort();
}
