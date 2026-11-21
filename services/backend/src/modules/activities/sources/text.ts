/** HTML 글자 참조를 푼다. 숫자 참조(`&#44277;`)와 자주 쓰는 이름 참조만. */
export function decodeEntities(text: string): string {
  return text
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => String.fromCodePoint(Number.parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec: string) => String.fromCodePoint(Number(dec)))
    .replace(/&nbsp;/g, " ").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&middot;/g, "·")
    .replace(/&amp;/g, "&");
}

/** 태그를 지우고 글자 참조를 풀고 공백을 하나로 줄인다. */
export function htmlText(html: string): string {
  return decodeEntities(html.replace(/<!--[\s\S]*?-->/g, "").replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
}

const HACKATHON = /해커톤|메이커톤|아이디어톤|프롬프톤|데이터톤|hackathon/i;

/** 해커톤인가. 출처 대부분에 해커톤 분류가 없어 제목으로 가른다. */
export function isHackathon(title: string): boolean {
  return HACKATHON.test(title);
}
