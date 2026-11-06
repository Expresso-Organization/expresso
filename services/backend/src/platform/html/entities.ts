/**
 * HTML 문자 표기(엔티티)를 글자로 풉니다.
 *
 * 렌더러(`renderToStaticMarkup`)는 따옴표를 `&#x27;` · `&quot;`로, 공고 원문은 `&lt;` · `&#39;` 따위로 냅니다. 보이는
 * 글을 뽑는 자리와 공고 본문을 옮기는 자리가 이 함수 하나를 씁니다.
 */

const NAMED: Record<string, string> = {
  nbsp: " ",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  amp: "&",
};

/** 유니코드 코드 포인트의 끝. 넘으면 `String.fromCodePoint`가 예외를 냅니다. */
const MAX_CODE_POINT = 0x10ffff;

/**
 * 한 번 훑어 푸는 표기만 바꿉니다. 그 밖의 `&name;`과 범위를 벗어난 숫자 표기는 그대로 둡니다.
 *
 * 한 번 훑으므로 `&amp;lt;`는 `&lt;`까지만 풀립니다 — `&amp;`를 마지막에 푸는 것과 같은 결과입니다. 여러 겹으로
 * 이스케이프된 글은 부르는 쪽이 반복합니다.
 */
export function decodeHtmlEntities(value: string): string {
  return value.replace(/&(?:#(\d+)|#[xX]([\da-fA-F]+)|([a-zA-Z]+));/g, (entity, decimal?: string, hex?: string, name?: string) => {
    if (name !== undefined) return NAMED[name] ?? entity;
    const code = decimal !== undefined ? Number(decimal) : Number.parseInt(hex!, 16);
    return code <= MAX_CODE_POINT ? String.fromCodePoint(code) : entity;
  });
}
