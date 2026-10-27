import { randomUUID } from "node:crypto";

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
 */
export function pageOutline(document: string): DeploymentOutlineSection[] {
  const sections: { id: string; title: string | null }[] = [];
  let depth = 0;
  // 지금 제목을 모으는 중인 h1–h3의 깊이. 모으는 중이 아니면 0.
  let headingDepth = 0;
  let headingText = "";
  let tagDepth = 0;

  const parser = new Parser({
    onopentag(name) {
      tagDepth += 1;
      if (name === "section") {
        if (depth === 0) sections.push({ id: randomUUID(), title: null });
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
  return sections;
}
