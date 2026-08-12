import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const repositoryRoot = path.resolve(import.meta.dirname, "../../..");
const sourcePath = path.join(
  repositoryRoot,
  "services/dev-portal/docs/Expresso Screens.dc.html",
);
const outputPath = path.join(
  repositoryRoot,
  "services/web/src/app/(app)/brew/new/screen-definition-01.generated.ts",
);

const source = readFileSync(sourcePath, "utf8");
const labelIndex = source.indexOf('data-screen-label="01"');
const nextLabelIndex = source.indexOf('data-screen-label="01b"', labelIndex);

if (labelIndex < 0 || nextLabelIndex < 0) {
  throw new Error("화면 정의서에서 01 또는 01b 경계를 찾지 못했습니다.");
}

const screenStart = source.indexOf(
  '<div style="width: 1440px; height: 940px;',
  labelIndex,
);
const columnBoundary = source.lastIndexOf(
  '\n    </div>\n    <div style="width: 1440px; flex-shrink: 0">',
  nextLabelIndex,
);

if (screenStart < 0 || columnBoundary < 0 || columnBoundary <= screenStart) {
  throw new Error("화면 정의서 01의 HTML 본문 경계를 찾지 못했습니다.");
}

const html = source.slice(screenStart, columnBoundary).trimEnd();
const sha256 = createHash("sha256").update(html).digest("hex");
const generated = `/**
 * GENERATED FILE — 직접 수정하지 않습니다.
 * services/dev-portal/docs/Expresso Screens.dc.html의 data-screen-label="01" 화면 HTML을
 * 변환 없이 그대로 복사합니다.
 * source_sha256: ${sha256}
 */
export const SCREEN_DEFINITION_01_HTML = ${JSON.stringify(html)};
export const SCREEN_DEFINITION_01_SHA256 = ${JSON.stringify(sha256)};
`;

writeFileSync(outputPath, generated);
console.log(`screen 01 synced: ${sha256}`);
