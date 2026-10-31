import { writeFileSync } from "node:fs";

// 계약 정책을 명시적으로 갱신할 때 실행합니다. 소비자는 runtime ICU/JVM 목록을 사용하지 않습니다.
// Intl의 지역 timezone 목록과 canonical UTC·Etc 고정 offset ID를 하나의 계약 목록으로 고정합니다.
const candidates = [
  ...Intl.supportedValuesOf("timeZone"),
  "UTC",
  ...Array.from({ length: 12 }, (_, index) => `Etc/GMT+${index + 1}`),
  ...Array.from({ length: 14 }, (_, index) => `Etc/GMT-${index + 1}`),
];
const identifiers = [...new Set(candidates)].filter((identifier) =>
  new Intl.DateTimeFormat("en", { timeZone: identifier }).resolvedOptions().timeZone === identifier,
).sort();
const policy = {
  policy: "intl-canonical-exact-v1",
  generatedWith: { node: process.versions.node, icu: process.versions.icu, tz: process.versions.tz },
  identifiers,
};
writeFileSync(new URL("../src/career-business-timezones.json", import.meta.url), JSON.stringify(policy, null, 2) + "\n");
