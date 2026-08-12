/**
 * 글에 적힌 수.
 *
 * §8.3 환각 방지 ①은 **수치는 사용자 발화 또는 기록에 존재하는 값만 사용**이다.
 * 문장 전체는 글자 비교로 지킬 수 없지만 숫자는 지킬 수 있고, 지어낸 성과가
 * 사는 곳이 정확히 거기다. 추출 · 기록 정리가 같은 기준을 본다.
 */

/**
 * 자릿점만 걷어내고 그대로 둔다 — "3,000만"과 "3000만"은 같은 값이지만
 * "두 시간"과 "2시간"은 같은 값으로 보지 않는다. 근거가 쓴 형태를 그대로
 * 옮기게 하는 편이 낫다(§8.3 품질 기준: 숫자를 살린다).
 */
export function numbersIn(text: string): string[] {
  return (text.match(/\d[\d,]*(?:\.\d+)?/g) ?? []).map((token) => token.replaceAll(",", ""));
}

/** `text`에 있는데 `source`에는 없는 수. 비어 있으면 지어낸 수치가 없다는 뜻이다. */
export function ungroundedNumbers(text: string, source: string): string[] {
  const supported = new Set(numbersIn(source));
  return [...new Set(numbersIn(text))].filter((number) => !supported.has(number));
}
