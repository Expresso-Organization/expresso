/**
 * 끝나지 않은 JSON 읽기.
 *
 * 계약 호출 하나가 내는 것은 JSON **하나**다. 그래서 "만들어지는 중"에 흐르는
 * 것은 문서가 아니라 잘린 JSON이다 —
 *
 * ```
 * {"sections":[{"title":"조용히 틀리는 파이프라인을 막
 * ```
 *
 * 지면(`partialFields`)은 값이 전부 문자열인 납작한 객체라 앞에서부터 훑는
 * 것으로 됐다. 레시피 초안은 `sections[].items[]`로 중첩이라 그 방법이 닿지
 * 않는다. 여기서는 **열려 있는 것을 닫아** 성한 JSON으로 되살린 뒤 한 번에
 * 읽는다.
 *
 * **백엔드와 웹이 같은 파일을 본다.** 흘려보내는 쪽과 그리는 쪽이 다르게 읽으면
 * 화면에만 나타나는 버그가 되고, 그건 재현이 어렵다.
 */

/**
 * 지금까지 온 데까지 읽는다. 읽을 수 없으면 `null`이다.
 *
 * 값 한가운데서 끊긴 문자열은 **거기까지 살린다** — 그래야 제목이 써지는 것이
 * 화면에 그대로 보인다. 이름 한가운데서 끊겼으면 그 짝은 통째로 버린다.
 */
export function partialJson(buffer: string): unknown {
  for (const candidate of repairs(buffer)) {
    try {
      return JSON.parse(candidate) as unknown;
    } catch {
      // 다음 후보로. 열린 문자열이 값이 아니라 이름이었던 자리가 여기 온다.
    }
  }
  return null;
}

/**
 * 되살릴 후보를 좋은 것부터.
 *
 * 첫째는 **끊긴 자리까지 살린 것**이고, 둘째는 마지막으로 온전했던 자리까지
 * 자른 것이다. 어느 쪽이 맞는지는 `JSON.parse`가 가른다 — 이름인지 값인지
 * 알아내려고 문법을 두 번 적는 대신 파서에게 묻는다.
 */
function repairs(buffer: string): string[] {
  /** 열려 있는 것들. 객체는 이름을 기다리는지 값을 기다리는지도 함께 안다. */
  const frames: { closer: "}" | "]"; expectKey: boolean }[] = [];
  /** 마지막으로 **값 하나가 온전히 끝났던** 자리와, 그때 닫아야 했던 것들. */
  let safeEnd = -1;
  let safeClosers = "";
  const closers = () => frames.map(({ closer }) => closer).reverse().join("");
  const mark = (end: number) => {
    safeEnd = end;
    safeClosers = closers();
  };
  const fallback = () => (safeEnd < 0 ? [] : [buffer.slice(0, safeEnd) + safeClosers]);
  /** 값 하나가 끝났다. 객체 안이었다면 다음은 다시 이름 차례다. */
  const valueDone = (end: number) => {
    const frame = frames.at(-1);
    if (frame?.closer === "}") frame.expectKey = true;
    mark(end);
  };

  let at = 0;
  while (at < buffer.length) {
    const char = buffer[at]!;
    if (char === " " || char === "\n" || char === "\r" || char === "\t" || char === "," || char === ":") {
      at += 1;
      continue;
    }
    if (char === "{" || char === "[") {
      frames.push({ closer: char === "{" ? "}" : "]", expectKey: char === "{" });
      at += 1;
      // 빈 채로 닫아도 성한 JSON이다.
      mark(at);
      continue;
    }
    if (char === "}" || char === "]") {
      // 짝이 안 맞는다 — 우리가 만든 것이 아닌 글자다. 여기서 멈춘다.
      if (frames.pop()?.closer !== char) return fallback();
      valueDone(at + 1);
      at += 1;
      continue;
    }
    if (char === '"') {
      const frame = frames.at(-1);
      const read = readString(buffer, at);
      if (!read.closed) {
        // 끝나지 않은 문자열. 닫아 본 것을 먼저 내고, 아니면 앞으로 돌아간다 —
        // **이름**이었다면 닫아 봐야 짝 없는 이름이라 파서가 거절한다.
        return [buffer.slice(0, read.end) + '"' + closers(), ...fallback()];
      }
      at = read.end;
      // 이름 뒤에서는 멈출 수 없다. 값이 아직 안 왔다.
      if (frame?.expectKey) frame.expectKey = false;
      else valueDone(at);
      continue;
    }
    const literal = readLiteral(buffer, at);
    // 끝을 못 만난 리터럴은 통째로 버린다 — `12`가 `1200`의 앞일 수 있다.
    if (literal >= buffer.length) return fallback();
    valueDone(literal);
    at = literal;
  }
  return fallback();
}

/**
 * `"`에서 시작하는 문자열의 끝을 찾는다.
 *
 * 끝을 못 만나면 **온전한 글자까지의 자리**를 준다. 끊긴 자리가 이스케이프
 * 한가운데(`\` 다음, 또는 `\u00`처럼 네 자리가 모자란 곳)면 그 이스케이프는
 * 통째로 버린다 — 반쪽짜리는 JSON이 아니다.
 */
function readString(source: string, from: number): { end: number; closed: boolean } {
  let at = from + 1;
  while (at < source.length) {
    const char = source[at]!;
    if (char === '"') return { end: at + 1, closed: true };
    if (char !== "\\") {
      at += 1;
      continue;
    }
    const escape = source[at + 1];
    if (escape === undefined) break;
    if (escape === "u") {
      if (source.length < at + 6) break;
      at += 6;
      continue;
    }
    at += 2;
  }
  return { end: at, closed: false };
}

/** 숫자 · `true` · `false` · `null` 이 끝나는 자리. */
function readLiteral(source: string, from: number): number {
  let at = from;
  while (at < source.length && !",]} \n\r\t".includes(source[at]!)) at += 1;
  return at;
}
