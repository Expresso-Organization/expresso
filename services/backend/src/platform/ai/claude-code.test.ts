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

describe("claude CLI에 서버 계정 신원을 싣지 않는다", () => {
  it("git 상태 스냅샷(Git user)을 끄는 환경으로 띄운다", async () => {
    // 2026-11-10 운영: 스냅샷의 git 사용자 이름이 다른 사용자의 지면에 작성자로 찍혔다.
    const client = new ClaudeCodeAiClient({ cliPath: fakeCli('echo "git=$CLAUDE_CODE_DISABLE_GIT_INSTRUCTIONS" >&2; exit 1') });
    await expect(client.complete(spec, schema)).rejects.toMatchObject({ message: "git=1" });
  });
});
