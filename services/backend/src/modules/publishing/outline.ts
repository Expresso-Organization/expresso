import { createHash } from "node:crypto";

import type { DeploymentOutlineSection } from "@expresso/contracts";
import { Parser } from "htmlparser2";

const HEADINGS = new Set(["h1", "h2", "h3"]);
const TITLE_MAX = 80;

/**
 * 배포할 지면의 섹션 목록을 뽑는다.
 *
 * 섹션은 다른 `<section>` 안에 있지 않은 `<section>`이고 문서 순서를 따른다. 공개
 * 사이트의 추적 스크립트도 같은 규칙으로 DOM에서 섹션을 고른다(`site-tracker.ts`).
 * 두 쪽의 개수가 다르면 그 스크립트는 섹션 체류를 보내지 않는다.
 *
 * 제목은 섹션 안의 첫 h1–h3 글자다. 없으면 null — 화면이 순번으로 부른다.
 *
 * id는 포트폴리오 · 자리 · 제목에서 만든다. 다시 배포해도 같은 자리에 같은 제목인
 * 섹션은 같은 id라 분석이 판을 넘어 한 줄로 합친다. 제목이 바뀌면 다른 섹션이다.
 */
export function pageOutline(document: string, portfolioId: string): DeploymentOutlineSection[] {
  const sections: { title: string | null }[] = [];
  let depth = 0;
  // 지금 제목을 모으는 중인 h1–h3의 깊이. 모으는 중이 아니면 0.
  let headingDepth = 0;
  let headingText = "";
  let tagDepth = 0;

  const parser = new Parser({
    onopentag(name) {
      tagDepth += 1;
      if (name === "section") {
        if (depth === 0) sections.push({ title: null });
        depth += 1;
        return;
      }
      const current = sections.at(-1);
      if (depth > 0 && current && current.title === null && headingDepth === 0 && HEADINGS.has(name)) {
        headingDepth = tagDepth;
        headingText = "";
      }
    },
    ontext(text) {
      if (headingDepth > 0) headingText += text;
    },
    onclosetag(name) {
      if (headingDepth === tagDepth && HEADINGS.has(name)) {
        const title = headingText.replace(/\s+/g, " ").trim().slice(0, TITLE_MAX).trim();
        const current = sections.at(-1);
        if (current && title) current.title = title;
        headingDepth = 0;
      }
      if (name === "section" && depth > 0) depth -= 1;
      tagDepth -= 1;
    },
  }, { decodeEntities: true });
  parser.write(document);
  parser.end();
  return sections.map(({ title }, index) => ({ id: stableId(`${portfolioId}:outline:${index}:${title ?? ""}`), title }));
}

/** 이름에서 만드는 UUID(v5 모양). 같은 이름이면 언제나 같은 값이다. */
function stableId(name: string): string {
  const bytes = createHash("sha1").update(name).digest();
  bytes[6] = (bytes[6]! & 0x0f) | 0x50;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = bytes.subarray(0, 16).toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
