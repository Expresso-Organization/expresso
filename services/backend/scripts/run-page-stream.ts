import { writeFileSync } from "node:fs";

import { pageDocument } from "@expresso/contracts";

import { createMysqlResource } from "../src/platform/mysql.js";
import { loadRuntimeConfig } from "../src/config/runtime-config.js";
import { ConsentService } from "../src/modules/consent/service.js";
import { AiPageGenerator } from "../src/modules/page/generator.js";
import { PageService } from "../src/modules/page/service.js";
import { PageStream } from "../src/modules/page/stream.js";
import { createAiClient } from "../src/platform/ai/create-client.js";
import { createStreamRedis } from "../src/platform/redis.js";

/**
 * 지면 하나를 **실제로** 뽑으면서 조각이 흐르는지 본다.
 *
 * 03의 전체 경로(문장 → 배치 → 지면)를 돌지 않는다. 앞의 둘은 다른 계약이고
 * 지금 보려는 것은 **지면 생성이 조각을 내는가** 하나뿐이다. 그래서 이미
 * 근거가 붙어 있는 포트폴리오에 대고 그 계약만 부른다.
 *
 * 두 갈래로 본다 — 만드는 쪽에서 흘려보낸 것과, **따라 읽는 쪽에서 받은 것**.
 * 후자가 화면이 보는 것과 같은 길이라 그쪽을 믿는다.
 *
 *   node --import tsx scripts/run-page-stream.ts <portfolioId>
 */

const portfolioId = process.argv[2];
if (!portfolioId) throw new Error("usage: run-page-stream.ts <portfolioId>");

const config = loadRuntimeConfig();
const { sql } = createMysqlResource(config.databaseUrl);
const redis = createStreamRedis(config.redisUrl);
const stream = new PageStream(redis, { prefix: config.queuePrefix });
const ai = createAiClient(config);
if (!ai) throw new Error("AI_PROVIDER가 off입니다");

const owner = (await sql<{ user_id: string; title: string }[]>`
  select user_id, title from portfolio where id = ${portfolioId}
`)[0];
if (!owner) throw new Error(`portfolio ${portfolioId} not found`);

// 03은 생성 잡 id로 연다 — 실행마다 새 이름이다. 여기서도 그래야 앞 실행의
// 흔적을 재생하지 않는다(처음에 그걸로 한 번 헛읽었다).
const streamId = `manual-${portfolioId}-${process.pid}`;
const service = new PageService(sql, new ConsentService(sql), stream);

console.log(`포트폴리오: ${owner.title}`);
console.log(`프로바이더: ${config.aiPageGenerationProvider ?? config.aiProvider} · 조각 가능: ${ai.streams ?? false}`);

const started = Date.now();
let events = 0;
let buffer = "";
let thoughts = 0;
let firstThought: number | null = null;

/** 화면과 같은 길로 따라 읽는다. */
const watching = (async () => {
  for await (const message of stream.follow(streamId)) {
    events += 1;
    if (message.event === "delta") {
      if (!buffer) {
        // 조각이 **언제 시작되는가**가 이 화면의 값을 정한다. 끝나기 직전에야
        // 흐르기 시작하면 사용자가 보는 것은 3분의 빈 화면과 3초의 지면이다.
        process.stdout.write(`  ${((Date.now() - started) / 1000).toFixed(1)}s · 첫 조각\n`);
      }
      buffer += message.text;
      if (events % 10 === 0) {
        process.stdout.write(`  ${((Date.now() - started) / 1000).toFixed(1)}s · 조각 ${events} · ${buffer.length}자\n`);
      }
    } else if (message.event === "thinking") {
      thoughts += 1;
      firstThought ??= Date.now() - started;
      // 침묵을 채우는 것이 이것이다. 몇 줄이 언제부터 나오는지가 값이다.
      if (thoughts === 1 || thoughts % 10 === 0) {
        process.stdout.write(`  ${((Date.now() - started) / 1000).toFixed(1)}s · 구상 중 (${thoughts}번째 신호 · ${message.tokens}토큰)\n`);
      }
    } else {
      process.stdout.write(`  ${((Date.now() - started) / 1000).toFixed(1)}s · ${message.event}\n`);
    }
  }
})();

try {
  const page = await service.generate(owner.user_id, portfolioId, new AiPageGenerator(ai), { streamId });
  await watching;

  console.log(`\n걸린 시간 ${((Date.now() - started) / 1000).toFixed(1)}초`);
  console.log(`구상 신호 ${thoughts}번 · 첫 신호 ${firstThought === null ? "없음" : `${(firstThought / 1000).toFixed(1)}s`}`);
  console.log(`QA: ${page.qualityStatus}`);
  for (const check of page.qaReport.checks) {
    console.log(`  ${check.status === "pass" ? "○" : "×"} ${check.name} — ${check.detail}`);
  }
  const usage = page.generationManifest?.usage;
  console.log(`토큰: 입력 ${usage?.inputTokens} · 출력 ${usage?.outputTokens} · 캐시읽기 ${usage?.cacheReadTokens}`);
  console.log(`모델: ${page.generationManifest?.model} · 시도 ${page.generationManifest?.attempts}회`);

  const out = process.env["PAGE_OUT"];
  if (out) {
    writeFileSync(out, pageDocument({
      html: page.html,
      css: page.css,
      title: owner.title,
      ...(page.styleSpec ? { grammar: page.styleSpec } : {}),
    }), "utf8");
    console.log(`문서: ${out}`);
  }
} finally {
  redis.disconnect();
  await sql.end();
}
