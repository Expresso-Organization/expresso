import { randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import { expect, test, type Page } from "@playwright/test";

import { api, login } from "./fixtures";

const execFileAsync = promisify(execFile);

// e2e 서버에는 AI 런타임이 없어 메시지 전송이 503이다. 대화는 API로 만들고 메시지는 e2e 전용 DB에 직접 넣는다.
async function seedConversation(page: Page) {
  const { data } = await api<{ data: { id: string } }>(page, "POST", "/v1/agent/conversations", { contexts: [] });
  const now = new Date().toISOString();
  const messages = [
    { id: randomUUID(), role: "user", text: "지원 동기를 정리해 줘.", tools: [], createdAt: now },
    { id: randomUUID(), role: "assistant", text: "지원 동기를 세 문단으로 정리했습니다.", tools: [], createdAt: now },
  ];
  const agentRun = { id: randomUUID(), requestId: messages[0]!.id, status: "complete", error: null, startedAt: now };
  const script = "import {MongoClient} from 'mongodb'; void(async()=>{const database=process.env.CAREER_E2E_DATABASE;if(!database||!/^expresso_career_editor_e2e_[0-9]+$/.test(database))throw new Error('unsafe E2E database');const seed=JSON.parse(process.env.AGENT_E2E_SEED);const client=new MongoClient(process.env.CAREER_E2E_MONGODB_URL);await client.connect();try{const result=await client.db(database).collection('agent_conversations').updateOne({_id:seed.id},{$set:{title:'지원 동기',messages:seed.messages,run:seed.run,updatedAt:seed.now},$inc:{version:1}});if(result.modifiedCount!==1)throw new Error('conversation seed failed')}finally{await client.close()}})()";
  const root = fileURLToPath(new URL("../../..", import.meta.url));
  await execFileAsync("pnpm", ["--filter", "@expresso/backend", "exec", "tsx", "-e", script], { cwd: root, env: { ...process.env, AGENT_E2E_SEED: JSON.stringify({ id: data.id, messages, run: agentRun, now }) } });
  return data.id;
}

test("keeps assistant action icons at 16px despite the global svg max-width", async ({ page }) => {
  await login(page, "/agent");
  const id = await seedConversation(page);
  await page.goto(`/agent?chat=${id}`);
  const actions = page.locator(".aui-assistant-action-bar-root");
  await expect(actions).toBeVisible();
  await actions.hover();
  const icons = await actions.locator("svg").evaluateAll((items) => items.map((item) => {
    const box = item.getBoundingClientRect();
    return { width: box.width, height: box.height };
  }));
  expect(icons.length).toBeGreaterThanOrEqual(2);
  for (const icon of icons) expect(icon).toEqual({ width: 16, height: 16 });
  const maxWidths = await page.locator(".acf-scope svg").evaluateAll((items) => [...new Set(items.map((item) => getComputedStyle(item).maxWidth))]);
  expect(maxWidths).toEqual(["none"]);
});
