/**
 * 목록 · 갤러리 카드에 보일 본문 평문. `bodyMd`는 본문 편집기의 Markdown 투영이라
 * 표 · 목록 · 인용 · 이미지 · 서식 기호가 들어 있다. 기호를 지우고 글자만 한 줄로 이어 붙인다.
 */
export function markdownPreview(markdown: string): string {
  const lines = markdown.replace(/\r\n?/g, "\n").split("\n");
  const kept: string[] = [];
  let fenced = false;
  for (const raw of lines) {
    let line = raw.trim();
    if (/^(```|~~~)/.test(line)) { fenced = !fenced; continue; }
    if (fenced) { kept.push(line); continue; }
    // 구분선(`***` · `---` · `___`)과 표 구분 줄(`| --- | :-: |`)은 글자가 없다.
    if (/^([-*_])(\s*\1){2,}$/.test(line)) continue;
    if (line.includes("|") && /^\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?$/.test(line)) continue;
    if (line.startsWith("|")) line = line.replace(/^\|/, "").replace(/\|$/, "").split("|").map((cell) => cell.trim()).filter(Boolean).join(" ");
    line = line
      .replace(/^(>\s?)+/, "")
      .replace(/^#{1,6}\s+/, "")
      .replace(/^([-*+]|\d+[.)])\s+/, "")
      .replace(/^\[[ xX]\]\s+/, "")
      .replace(/\\$/, "");
    kept.push(line);
  }
  return kept.join(" ")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/<\/?[a-zA-Z][^>]*>/g, "")
    .replace(/`([^`]*)`/g, "$1")
    .replace(/(\*\*|__|~~)(.+?)\1/g, "$2")
    .replace(/(^|[^\w*])\*(?!\s)(.+?)(?<!\s)\*(?=[^\w*]|$)/g, "$1$2")
    .replace(/(^|[^\w])_(?!\s)(.+?)(?<!\s)_(?=[^\w]|$)/g, "$1$2")
    .replace(/\\([\\`*_{}[\]()#+\-.!|>~<])/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}
