import { ClaudeAgentRuntime } from "../../src/platform/agent/runtime.js";
/** 별도 DB에서 공통 채팅의 UI 흐름을 검증하는 명시적 테스트 서버입니다. */
import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { CONSENT_POLICY_VERSION } from "@expresso/contracts";
import { migrateMongo } from "@expresso/database";
import type { CareerDocument } from "@expresso/editor";
import { buildApi } from "../../src/api/build-app.js";
import { loadRuntimeConfig } from "../../src/config/runtime-config.js";
import { createMongoResource } from "../../src/platform/mongodb.js";
import { IdentityService } from "../../src/modules/identity/index.js";
import { CareerService } from "../../src/modules/career/index.js";
import { CareerDocumentService } from "../../src/modules/career-editor/index.js";
import { ConsentService } from "../../src/modules/consent/index.js";
import { JobBoardService } from "../../src/modules/jobs/index.js";
import { EntitlementService } from "../../src/modules/entitlements/index.js";
import { PortfolioReadService } from "../../src/modules/portfolios/index.js";
import { EngagementService } from "../../src/modules/engagement/index.js";
import { AgentChatService } from "../../src/modules/agent-chat/index.js";

if (process.env.NODE_ENV !== "test" || !process.env.DEV_LOGIN_PASSWORD) throw new Error("테스트 실행과 개발 로그인 설정이 필요합니다.");
const config = loadRuntimeConfig({ ...process.env, MONGODB_DATABASE: "expresso_agent_chat_preview", PORT: "4010", CAREER_EDITOR_V2_ENABLED: "true" });
await migrateMongo({ databaseUrl: config.mongodbUrl!, databaseName: config.mongodbDatabase! });
const db = createMongoResource(config.mongodbUrl!, { databaseName: config.mongodbDatabase! });
const identityService = new IdentityService(db); const careerService = new CareerService(db); const careerDocumentService = new CareerDocumentService(db, config.assetSigningSecret); const consentService = new ConsentService(db); const jobBoardService = new JobBoardService(db);
const email = "agent-chat-preview@example.com"; const password = process.env.DEV_LOGIN_PASSWORD;
const existing = await db.db.collection("users").findOne({ email });
const login = existing ? await identityService.login({ email, password }) : await identityService.signup({ email, password, displayName: "채팅 검증" });
const userId = login.user.id;
await consentService.grant(userId, ["career_records"], CONSENT_POLICY_VERSION);
const categories = await careerService.listCategories(userId);
let record = await db.db.collection("career_records").findOne({ userId, title: "에이전트 채팅 검증 기록" });
const recordId = record ? String(record._id) : (await careerService.createRecord(userId, randomUUID(), { categoryId: categories[0]!.id, title: "에이전트 채팅 검증 기록", bodyMd: "팀의 배포 절차를 문서화했습니다.", properties: {} })).record.id;
const source = db.client.db("expresso");
const job = await source.collection("job_postings").findOne({});
if (job) {
  const company = await source.collection("companies").findOne({ _id: job.companyId });
  if (company) await db.db.collection("companies").replaceOne({ _id: company._id }, company, { upsert: true });
  await db.db.collection("job_postings").replaceOne({ _id: job._id }, job, { upsert: true });
}
const agentChatService = new AgentChatService(db, process.env.AGENT_CHAT_LIVE === "1" ? new ClaudeAgentRuntime() : { async run(input) {
  const refs = input.context as Array<{ kind: string; id: string; data: { document?: CareerDocument } }>;
  const ref = refs.find(item => item.kind === "record");
  if (ref && /수정|다듬|변경/.test(input.messages.at(-1)!.text)) {
    const proposal = await input.propose(ref.id, { summary: "검증용 문장 변경 제안", commands: [{ type: "setText", blockId: ref.data.document!.content[0]!.id, text: "팀의 배포 절차를 정리하고 문서화했습니다." }], propertyChanges: [] });
    await input.emit({ type: "tool", tool: { id: randomUUID(), name: "기록 변경 제안", summary: proposal.summary, status: "complete", proposal } });
  }
  const text = `[검증용 응답] 연결된 자료 ${refs.length}개를 확인했습니다. 이전 질문은 ${input.messages.filter(message => message.role === "user").length - 1}개입니다. 실제 모델 호출 없이 저장·화면 이동·승인·취소 흐름을 확인하고 있습니다.`;
  for (const chunk of text.match(/.{1,5}/g) ?? []) { await delay(200, undefined, { signal: input.signal }); await input.emit({ type: "text", text: chunk }); }
} }, careerService, jobBoardService, careerDocumentService, consentService);
const app = buildApi({ config, identityService, careerService, careerDocumentService, consentService, jobBoardService, entitlementService: new EntitlementService(db), portfolioReadService: new PortfolioReadService(db), engagementService: new EngagementService(db), agentChatService });
await app.listen({ host: "127.0.0.1", port: 4010 });
console.info(JSON.stringify({ recordId, jobId: job?._id }));
for (const signal of ["SIGINT", "SIGTERM"] as const) process.once(signal, () => void app.close().then(() => db.close()));
