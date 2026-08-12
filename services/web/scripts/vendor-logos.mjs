/**
 * src/components/ui/logos.vendor.ts 를 다시 뜬다.
 *
 * simple-icons에 없는 마크만 devicon에서 가져온다. 왜 없는지는 생성된 파일의
 * 머리말에 적혀 있다. 목록을 늘릴 일이 생기면 아래 PICK만 고친다.
 *
 * 실행:
 *   npx --yes pnpm@11.16.0 add -D @iconify-json/devicon-plain --filter @expresso/web
 *   node scripts/vendor-logos.mjs
 *   npx --yes pnpm@11.16.0 remove @iconify-json/devicon-plain --filter @expresso/web
 */
import fs from "node:fs";

/** devicon plain 이름 → [칩에 적을 이름, 브랜드 색] */
const PICK = {
  java: ["Java", "#ED8B00"],
  amazonwebservices: ["AWS", "#FF9900"],
  azure: ["Azure", "#0078D4"],
  csharp: ["C#", "#512BD4"],
};

const pack = JSON.parse(
  fs.readFileSync("node_modules/@iconify-json/devicon-plain/icons.json", "utf8"),
);

const head = `/**
 * simple-icons가 갖고 있지 않은 로고들.
 *
 * simple-icons는 상표권 문제로 Oracle · Amazon · Microsoft의 마크를 통째로
 * 뺐다(v14~). 그런데 우리가 모은 공고에서 Java는 76건, AWS는 68건, Azure는
 * 22건으로 **가장 많이 나오는 축**이다 — 이것들만 로고 없이 두면 칩이 아니라
 * 구멍이 된다.
 *
 * 그래서 devicon의 plain 변형에서 넉 장을 떠 왔다. devicon은 MIT이고, 상표는
 * 각 소유자의 것이다 — 여기서는 그 기술을 가리키는 용도로만 쓴다.
 * 출처: https://github.com/devicons/devicon (plain 변형, 128×128)
 *
 * 이 파일은 손으로 고치지 않는다. 다시 뜨려면 scripts/vendor-logos.mjs.
 */
export const VENDOR_LOGOS = {`;

const rows = Object.entries(PICK).map(([key, [title, hex]]) => {
  const icon = pack.icons[key];
  if (!icon) throw new Error(`devicon-plain에 ${key}가 없습니다`);
  const path = /d="([^"]+)"/.exec(icon.body)?.[1];
  if (!path) throw new Error(`${key}의 path를 읽지 못했습니다`);
  return `  "${key}": { title: "${title}", hex: "${hex}", box: 128, path: "${path}" },`;
});

fs.writeFileSync(
  "src/components/ui/logos.vendor.ts",
  `${head}\n${rows.join("\n")}\n} as const;\n`,
);
console.log(`logos.vendor.ts — ${rows.length}장`);
