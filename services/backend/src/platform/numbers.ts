/**
 * 글에 적힌 수.
 *
 * §8.3 환각 방지 ①은 **수치는 사용자 발화 또는 기록에 존재하는 값만 사용**이다.
 * 문장 전체는 글자 비교로 지킬 수 없지만 숫자는 지킬 수 있고, 지어낸 성과가
 * 사는 곳이 정확히 거기다. 추출 · 기록 정리가 같은 기준을 본다.
 */

/**
 * 수가 아닌 숫자가 사는 곳.
 *
 * 이메일과 주소 안의 숫자는 **주장이 아니라 이름표다.** 지어낸 성과를 잡는
 * 검사가 연락처를 성과로 읽으면 지면이 통째로 거절된다 — 실측에서 실제로
 * 그랬다(2026-08-14): `libera3920@gmail.com`의 `3920`이 매 판 「근거 없는
 * 수치」로 걸려 지면을 다시 쓰게 만들었다. 연락처는 모든 지면에 들어가므로
 * 이 한 줄이 없으면 **매번** 두 배로 만든다.
 *
 * 근거 쪽에서도 같이 지운다. 이메일에 든 숫자가 다른 수치를 "뒷받침"하는
 * 일은 없어야 한다.
 */
const IDENTIFIERS = /[\w.+-]+@[\w-]+\.[\w.-]+|https?:\/\/\S+/g;

/**
 * 자릿점만 걷어내고 그대로 둔다 — "3,000만"과 "3000만"은 같은 값이지만
 * "두 시간"과 "2시간"은 같은 값으로 보지 않는다. 근거가 쓴 형태를 그대로
 * 옮기게 하는 편이 낫다(§8.3 품질 기준: 숫자를 살린다).
 */
export function numbersIn(text: string): string[] {
  const claims = text.replace(IDENTIFIERS, " ");
  return (claims.match(/\d[\d,]*(?:\.\d+)?/g) ?? []).map((token) => token.replaceAll(",", ""));
}

/**
 * 세는 수가 아니라 붙여 놓은 번호인가.
 *
 * `01` · `02` · `03`은 섹션에 매기는 이름표다. 앞의 0이 그 표시다 — 분량이나
 * 성과를 `01`이라고 쓰는 글은 없다. 소수는 제외한다(`0.5`는 진짜 값이다).
 *
 * 이것도 실측에서 나왔다: 세 판 중 두 판이 섹션 번호 때문에 다시 쓰였다.
 */
export function isOrdinalLabel(number: string): boolean {
  return /^0\d+$/.test(number);
}

/** `text`에 있는데 `source`에는 없는 수. 비어 있으면 지어낸 수치가 없다는 뜻이다. */
export function ungroundedNumbers(text: string, source: string): string[] {
  const supported = new Set(numbersIn(source));
  return [...new Set(numbersIn(text))].filter((number) => !supported.has(number));
}
