import { chmodSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";
import { z } from "zod";

import { ClaudeCodeAiClient } from "./claude-code.js";

/** 본문만 다른 가짜 CLI. 입력은 읽지 않는다. */
function fakeCli(body: string) {
  const script = join(mkdtempSync(join(tmpdir(), "fake-claude-exit-")), "claude");
  writeFileSync(script, `#!/bin/sh\n${body}\n`);
  chmodSync(script, 0o755);
  return script;
}

const spec = { contract: "question_draft" as const, system: "질문을 씁니다.", prompt: "쓰세요.", promptVersion: 1 };
const schema = z.object({ ok: z.boolean() });

describe("claude CLI가 끝난 방식에 따라 다시 돌릴지 정한다", () => {
  it.each([
    ["SIGTERM을 받고 스스로 끝남(143)", "exit 143"],
    ["SIGINT를 받고 스스로 끝남(130)", "exit 130"],
    ["신호로 죽음", "kill -TERM $$"],
  ])("%s → 재시도 가능", async (_label, body) => {
    const client = new ClaudeCodeAiClient({ cliPath: fakeCli(body) });
    await expect(client.complete(spec, schema)).rejects.toMatchObject({ code: "AI_UNAVAILABLE", retryable: true });
  });

  it("오류를 내고 끝나면 재시도하지 않는다", async () => {
    const client = new ClaudeCodeAiClient({ cliPath: fakeCli("echo 'not logged in' >&2; exit 1") });
    await expect(client.complete(spec, schema)).rejects.toMatchObject({
      code: "AI_UNAVAILABLE", retryable: false, message: "not logged in",
    });
  });
});
