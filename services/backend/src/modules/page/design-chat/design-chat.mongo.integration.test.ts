import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { CONSENT_POLICY_VERSION, type DesignChat } from "@expresso/contracts";
import { mongoCollections } from "@expresso/database";

import { createMongoFixture } from "../../../../test/support/mongodb.js";
import type { AiCallSpec, AiClient } from "../../../platform/ai/client.js";
import { ScriptedAiClient } from "../../../platform/ai/scripted-client.js";
import { MongoCareerService } from "../../career/index.js";
import { catalogEntries } from "../../design-systems/catalog.js";
import { ConsentService } from "../../consent/index.js";
import { MongoGenerationService } from "../../generation/index.js";
import { MongoIdentityService } from "../../identity/index.js";
import { MongoMaterialsService } from "../../materials/index.js";
import { MongoRecipeService } from "../../recipe/index.js";
import { freePageGenerator } from "../briefed-generator.js";
import { PageService } from "../service.js";
import { DesignChatService } from "./service.js";

/**
 * 디자인 대화가 오가는 길 전체. 모델은 부르지 않고 정해 둔 답을 돌려준다 — 여기서 보는 것은 배관이다.
 * 여는 말 · 따로 고른 스타일과 레이아웃으로 그리기 · 말로 고치기 · 실패와 다시 시도 · 끊긴 실행 · 고른 첫 화면으로 만든 지면.
 */
const tokens = { background: "#101418", text: "#f2f4f6", accent: "#7fe3c4", font: "mono" as const, density: "comfortable" as const };
const blocks = [{ kind: "title" as const, x: 0, y: 0, w: 6, h: 2 }, { kind: "figure" as const, x: 6, y: 1, w: 10, h: 6 }, { kind: "text" as const, x: 0, y: 3, w: 5, h: 3 }, { kind: "accent" as const, x: 0, y: 7, w: 4, h: 2 }];
const style = (key: string) => ({ name: `스타일 ${key}`, words: `${key} 경로 도면의 색`, tokens });
const layout = (key: string) => ({ name: `레이아웃 ${key}`, words: `${key} 경로 지도`, blocks });
const opening = {
  head: { role: "엔지니어", headline: "경로를 설계하는 엔지니어입니다.", intro: "", subject: "통로 경로", lead: ["통로 경로를 검토했습니다."] },
  say: "통로 경로를 검토하신 일이 눈에 띄네요. 어떤 느낌으로 보여 드릴까요?",
  styles: [..."가나다"].map(style),
  layouts: [..."가나다"].map(layout),
};
const reply = { say: "그렇게 해 볼게요.", show: "none" as const, styles: [], layouts: [], screens: [], target: "", instruction: "" };
const snippet = (name: string) => ({
  name,
  note: `${name}을 가장 크게 세웠어요.`,
  tokens,
  css: `.hero{color:${tokens.text}}`,
  html: `<header class="hero"><h1>가상 작성자</h1><p>${name}</p><script>alert(1)</script></header>`,
});
/** 고친 것의 답. 첫 화면 전체가 아니라 바뀌는 자리만 낸다. */
const revision = (name: string, edits: { in: "css" | "html"; find: string; replace: string }[], changed = tokens) => ({ name, tokens: changed, edits });
const plan = { subject: "경로", palette: "먹 · 민트", type: "고정폭", layout: "한 단", signature: "경로 선", revised: "" };
const brief = (sectionIds: string[]) => ({
  role: "엔지니어", headline: "경로를 설계하는 엔지니어입니다.", intro: "", focus: [], subject: "통로 경로", lead: [],
  sections: sectionIds.map((id) => ({ id, title: "경로 연구", claim: "통로 경로를 검토했다", body: "통로 경로를 검토했습니다." })),
  career: [], evidence: [],
});

describe.skipIf(!(process.env.TEST_MONGODB_ADMIN_URL ?? process.env.TEST_MONGODB_URL))("디자인을 정하는 대화", () => {
  let fixture: Awaited<ReturnType<typeof createMongoFixture>>;
  let user = "";
  let other = "";
  let noConsent = "";
  const services: DesignChatService[] = [];
  /** 답을 고르는 함수. 테스트마다 바꿔 끼운다. */
  let route: (request: AiCallSpec) => unknown = () => { throw new Error("정해 둔 답이 없습니다"); };
  const ai = new ScriptedAiClient((request) => route(request));
  const make = () => {
    const service = new DesignChatService(fixture.resource, ai, new ConsentService(fixture.resource));
    services.push(service);
    return service;
  };
  const newBrew = async (owner: string) => {
    const brewId = (await new MongoMaterialsService(fixture.resource).createFreeBrew(owner, { title: "가상 포트폴리오", brief: "경로 연구", lengthPreset: "single" })).brewId;
    await new MongoRecipeService(fixture.resource).generate(owner, brewId, randomUUID());
    return brewId;
  };
  const isOpening = (request: AiCallSpec) => request.contract === "page_design" && request.prompt.includes("## 낼 것");
  /** 대화를 열고 첫 말이 끝날 때까지 기다린다. */
  const opened = async (service: DesignChatService, brewId: string): Promise<DesignChat> => {
    route = () => opening;
    await service.open(user, brewId, randomUUID());
    await service.settled();
    return (await service.get(user, brewId)).chat!;
  };
  /** 첫 견본 카드의 스타일과 레이아웃. 둘은 따로 놓인 목록이다. */
  const proposed = (chat: DesignChat) => {
    const first = chat.messages[0];
    return first?.role === "assistant" && first.card?.kind === "proposals" ? first.card : { styles: [], layouts: [] };
  };
  /** 첫 스타일과 첫 레이아웃을 골라 그리는 요청. */
  const drawFirst = (chat: DesignChat) => ({ action: "draw" as const, requestId: randomUUID(), styleId: proposed(chat).styles[0]!.id, layoutId: proposed(chat).layouts[0]!.id });

  beforeAll(async () => {
    fixture = await createMongoFixture("designchat");
    const identity = new MongoIdentityService(fixture.resource);
    const signup = async (displayName: string) => (await identity.signup({ email: `${randomUUID()}@example.com`, password: "correct-horse-battery", displayName })).user.id;
    [user, other, noConsent] = [await signup("가상 작성자"), await signup("다른 작성자"), await signup("동의 없는 작성자")];
    const consent = new ConsentService(fixture.resource);
    await consent.grant(user, ["career_records"], CONSENT_POLICY_VERSION);
    await consent.grant(other, ["career_records"], CONSENT_POLICY_VERSION);
    const career = new MongoCareerService(fixture.resource);
    for (const owner of [user, noConsent]) {
      const category = (await career.listCategories(owner)).find((item) => item.key === "experience")!;
      const record = (await career.createRecord(owner, randomUUID(), { categoryId: category.id, title: "가상 경로 연구", bodyMd: "통로 경로를 검토했습니다.", properties: {} })).record;
      await mongoCollections(fixture.resource.db).careerRecords.updateOne({ _id: record.id }, { $set: { status: "organized" } });
    }
  }, 60_000);
  afterAll(async () => {
    await Promise.all(services.map((service) => service.close()));
    await fixture?.dispose();
  });

  it("처음 열면 첫 말과 견본을 만들고, 다시 열어도 대화는 하나다", async () => {
    const service = make();
    const brewId = await newBrew(user);
    expect((await service.get(user, brewId)).chat).toBeNull();
    const before = ai.calls.length;
    const chat = await opened(service, brewId);
    expect(chat.run?.status).toBe("complete");
    expect(chat.messages).toHaveLength(1);
    expect(chat.messages[0]).toMatchObject({ role: "assistant", status: "complete", text: opening.say, card: { kind: "proposals" } });
    // 스타일과 레이아웃은 따로 놓인다. 스타일은 구성을, 레이아웃은 색을 갖지 않는다.
    expect(proposed(chat).styles.map(({ name }) => name)).toEqual(["스타일 가", "스타일 나", "스타일 다"]);
    expect(proposed(chat).layouts.map(({ name }) => name)).toEqual(["레이아웃 가", "레이아웃 나", "레이아웃 다"]);
    expect(proposed(chat).styles[0]).not.toHaveProperty("blocks");
    expect(proposed(chat).layouts[0]).not.toHaveProperty("tokens");
    // 여는 호출은 Sonnet으로 부른다. 계약의 기본 등급(Opus)에 맡기지 않는다.
    expect(ai.calls.at(-1)).toMatchObject({ contract: "page_design", modelTier: "sonnet" });
    expect((await mongoCollections(fixture.resource.db).designChats.findOne({ brewId }))?.head).toEqual(opening.head);

    const again = await service.open(user, brewId, randomUUID());
    expect(again.id).toBe(chat.id);
    expect(ai.calls.length).toBe(before + 1);
    // 판이 같으면 대화를 다시 보내지 않는다.
    expect(await service.get(user, brewId, chat.version)).toEqual({ chat: null, unchanged: true });
    await expect(service.get(other, brewId)).rejects.toMatchObject({ statusCode: 404 });
  });

  it("동의하지 않은 계정과 크레딧을 다 쓴 계정은 답을 시작하지 못한다", async () => {
    const service = make();
    const brewId = await newBrew(noConsent);
    await expect(service.open(noConsent, brewId, randomUUID())).rejects.toMatchObject({ statusCode: 403, publicDetails: { requiredConsent: "career_records" } });
    expect((await service.get(noConsent, brewId)).chat).toBeNull();

    const db = mongoCollections(fixture.resource.db);
    const mine = await newBrew(user);
    const account = await db.users.findOne({ _id: user });
    const plan = await db.plans.findOne({ _id: account!.planId });
    await db.plans.updateOne({ _id: plan!._id }, { $set: { monthlyCredits: 0 } });
    try {
      await expect(service.open(user, mine, randomUUID())).rejects.toMatchObject({ statusCode: 403, publicMessage: expect.stringContaining("크레딧") });
    } finally {
      await db.plans.updateOne({ _id: plan!._id }, { $set: { monthlyCredits: plan!.monthlyCredits ?? null } });
    }
  });

  it("스타일 하나와 레이아웃 하나를 골라 보내면 그 짝의 첫 화면을 그려 소독해 저장한다", async () => {
    const service = make();
    const brewId = await newBrew(user);
    const chat = await opened(service, brewId);
    // 서로 다른 자리의 것을 짝짓는다 — 어느 스타일이든 어느 레이아웃과 짝이 된다.
    const [picked, shape] = [proposed(chat).styles[0]!, proposed(chat).layouts[2]!];
    route = () => snippet("가 화면");
    const sent = await service.send(user, brewId, { action: "draw", requestId: randomUUID(), styleId: picked.id, layoutId: shape.id });
    expect(sent.run?.status).toBe("running");
    expect(sent.messages.at(-1)).toMatchObject({ role: "assistant", status: "running", card: { kind: "screens", items: [{ status: "drawing", name: "스타일 가", layout: { name: "레이아웃 다", blocks } }] } });
    // 답을 만드는 동안에는 새로 보낼 수 없다.
    await expect(service.send(user, brewId, drawFirst(chat))).rejects.toMatchObject({ statusCode: 409 });
    await service.settled();

    const done = (await service.get(user, brewId)).chat!;
    expect(done.run?.status).toBe("complete");
    expect(done.messages.at(-2)).toMatchObject({ role: "user", action: "draw", subjects: [{ kind: "style", id: picked.id, name: "스타일 가" }, { kind: "layout", id: shape.id, name: "레이아웃 다" }] });
    const answer = done.messages.at(-1)!;
    // 한 장을 그리면 그린 쪽이 건네는 말이 답이 된다.
    expect(answer).toMatchObject({ role: "assistant", status: "complete", text: "가 화면을 가장 크게 세웠어요." });
    expect(done.snippets).toHaveLength(1);
    expect(done.snippets[0]).toMatchObject({ origin: "agent", name: "가 화면", fromSnippetId: null, tokens, layout: { name: "레이아웃 다", words: "다 경로 지도", blocks } });
    expect(done.snippets[0]!.html).not.toContain("<script");
    expect(answer.role === "assistant" && answer.card?.kind === "screens" && answer.card.items[0]).toMatchObject({ status: "done", snippetId: done.snippets[0]!.id });
    expect(ai.calls.at(-1)).toMatchObject({ contract: "page_generation", modelTier: "sonnet" });
    // 그리는 호출은 원문 자료와, 따로 고른 스타일 · 레이아웃(견본이 그린 배치도와 같은 값)을 받는다.
    const prompt = ai.calls.at(-1)!.prompt;
    expect(prompt).toContain("통로 경로를 검토했습니다.");
    expect(prompt).toContain("고른 것: **스타일 가**");
    expect(prompt).toContain("고른 것: **레이아웃 다** — 다 경로 지도");
    expect(prompt).toContain("왼쪽에서 6칸 · 위에서 1칸 자리에 가로 10칸 · 세로 6칸");
    await expect(service.send(user, brewId, { ...drawFirst(chat), styleId: randomUUID() })).rejects.toMatchObject({ statusCode: 422 });
    // 스타일의 ID를 레이아웃 자리에 보내면 찾지 못한다 — 두 목록은 섞이지 않는다.
    await expect(service.send(user, brewId, { ...drawFirst(chat), layoutId: picked.id })).rejects.toMatchObject({ statusCode: 422 });
  });

  it("에이전트 대화가 청한 차례는 답하는 호출 없이 바로 시작한다 — 견본은 말 없이, 고치기는 이름으로 가리킨 첫 화면을 고친다", async () => {
    const service = make();
    const brewId = await newBrew(user);
    // 열지 않은 대화에는 맡기지 않는다.
    await expect(service.propose(user, brewId, { requestId: randomUUID(), request: "더 따뜻하게", focus: "styles" })).rejects.toMatchObject({ statusCode: 409, publicMessage: expect.stringContaining("디자인 대화가 아직 열리지 않았습니다") });
    const chat = await opened(service, brewId);
    // 그린 첫 화면이 없으면 고칠 것이 없다.
    await expect(service.revise(user, brewId, { requestId: randomUUID(), instruction: "강조색을 초록으로", screen: "" })).rejects.toMatchObject({ statusCode: 409 });

    const calls = ai.calls.length;
    route = () => ({ styles: [style("라"), style("마"), style("바")], layouts: [] });
    const sent = await service.propose(user, brewId, { requestId: randomUUID(), request: "더 따뜻한 색으로 다시 보여 줘", focus: "styles" });
    expect(sent.messages.slice(-2)).toMatchObject([{ role: "user", action: "say", text: "더 따뜻한 색으로 다시 보여 줘" }, { role: "assistant", status: "running", card: null }]);
    await service.settled();
    const proposedAgain = (await service.get(user, brewId)).chat!;
    expect(proposedAgain.messages.at(-1)).toMatchObject({ role: "assistant", status: "complete", text: "", card: { kind: "proposals", layouts: [] } });
    const last = proposedAgain.messages.at(-1)!;
    expect(last.role === "assistant" && last.card?.kind === "proposals" && last.card.styles.map(({ name }) => name)).toEqual(["스타일 라", "스타일 마", "스타일 바"]);
    // 답하는 호출을 거치지 않는다 — 견본을 내는 호출 하나다. 요청과 지금까지의 대화를 싣는다.
    expect(ai.calls.length).toBe(calls + 1);
    expect(ai.calls.at(-1)).toMatchObject({ contract: "page_design", modelTier: "sonnet" });
    expect(ai.calls.at(-1)!.prompt).toContain("더 따뜻한 색으로 다시 보여 줘");
    expect(ai.calls.at(-1)!.prompt).toContain("스타일 견본 「스타일 가」");

    route = () => snippet("가 화면");
    await service.send(user, brewId, drawFirst(chat));
    await service.settled();
    route = () => revision("가 화면 초록", [{ in: "css", find: tokens.text, replace: "#1f5c3a" }], { ...tokens, accent: "#1f5c3a" });
    const revising = await service.revise(user, brewId, { requestId: randomUUID(), instruction: "강조색을 짙은 초록으로 바꾼다", screen: "가 화면" });
    expect(revising.messages.at(-1)).toMatchObject({ role: "assistant", text: "", card: { kind: "revision", item: { status: "drawing", words: "강조색을 짙은 초록으로 바꾼다" } } });
    await service.settled();
    const revised = (await service.get(user, brewId)).chat!;
    const card = revised.messages.at(-1)!;
    expect(card.role === "assistant" && card.card?.kind === "revision" && card.card.item.status).toBe("done");
    expect(revised.snippets.at(-1)).toMatchObject({ origin: "edit", name: "가 화면 초록", fromSnippetId: revised.snippets[0]!.id });
    expect(ai.calls.at(-1)).toMatchObject({ contract: "page_generation" });
  });

  it("카탈로그의 디자인은 스타일로 쓰이고, 고른 레이아웃이 있으면 그 구성으로 그린다", async () => {
    const service = make();
    const brewId = await newBrew(user);
    const chat = await opened(service, brewId);
    const revisionId = catalogEntries()[0]!.revision.revisionId;
    route = () => snippet("카탈로그 화면");
    await service.send(user, brewId, { action: "draw_catalog", requestId: randomUUID(), revisionId });
    await service.settled();
    const alone = (await service.get(user, brewId)).chat!;
    expect(alone.messages.at(-2)).toMatchObject({ role: "user", action: "draw_catalog", subjects: [{ kind: "catalog", id: revisionId }] });
    // 레이아웃을 고르지 않았으면 구성은 그리는 쪽이 정한다.
    expect(alone.snippets.at(-1)).toMatchObject({ origin: "catalog", layout: null });
    expect(ai.calls.at(-1)!.prompt).toContain("## 레이아웃 — 정해지지 않았다");

    const shape = proposed(chat).layouts[1]!;
    await service.send(user, brewId, { action: "draw_catalog", requestId: randomUUID(), revisionId, layoutId: shape.id });
    await service.settled();
    const paired = (await service.get(user, brewId)).chat!;
    expect(paired.messages.at(-2)).toMatchObject({ subjects: [{ kind: "catalog", id: revisionId }, { kind: "layout", id: shape.id, name: "레이아웃 나" }] });
    expect(paired.snippets.at(-1)).toMatchObject({ origin: "catalog", layout: { name: "레이아웃 나" } });
    expect(ai.calls.at(-1)!.prompt).toContain("고른 것: **레이아웃 나**");
  });

  it("여러 장 가운데 한 장이 실패해도 나머지는 남고, 다시 시도는 그리지 못한 장만 그린다", async () => {
    const service = make();
    const brewId = await newBrew(user);
    await opened(service, brewId);
    // 여러 장은 답하는 호출이 스타일과 레이아웃을 짝지어 청한다.
    route = (request) => {
      if (request.contract === "page_design") return { ...reply, show: "screens", screens: [..."가나다"].map((key) => ({ source: "agent", style: style(key), layout: layout(key) })) };
      if (request.prompt.includes("고른 것: **스타일 나**")) throw new Error("그리기 실패");
      return snippet(request.prompt.includes("고른 것: **스타일 가**") ? "가 화면" : "다 화면");
    };
    await service.send(user, brewId, { action: "say", requestId: randomUUID(), text: "세 가지 다 실제 모습으로 보여 주세요" });
    await service.settled();
    const partial = (await service.get(user, brewId)).chat!;
    const card = partial.messages.at(-1)!;
    expect(partial.run?.status).toBe("complete");
    expect(card.role === "assistant" && card.card?.kind === "screens" && card.card.items.map(({ status }) => status)).toEqual(["done", "failed", "done"]);
    expect(partial.snippets.map(({ name }) => name).sort()).toEqual(["가 화면", "다 화면"]);

    const before = ai.calls.length;
    route = () => snippet("나 화면");
    await service.retry(user, brewId, randomUUID());
    await service.settled();
    const repaired = (await service.get(user, brewId)).chat!;
    const again = repaired.messages.at(-1)!;
    expect(ai.calls.length).toBe(before + 1);
    // 다시 그릴 때도 그 장의 스타일과 레이아웃으로 그린다.
    expect(ai.calls.at(-1)!.prompt).toContain("고른 것: **레이아웃 나**");
    expect(again.role === "assistant" && again.card?.kind === "screens" && again.card.items.map(({ status }) => status)).toEqual(["done", "done", "done"]);
    expect(repaired.snippets).toHaveLength(3);
    expect(repaired.snippets.at(-1)).toMatchObject({ origin: "user", layout: { name: "레이아웃 나" } });
    await expect(service.retry(user, brewId, randomUUID())).rejects.toMatchObject({ statusCode: 409 });
  });

  it("말에는 에이전트가 띄울 것을 정하고, 첫 화면을 대상으로 한 말은 그것을 고친다", async () => {
    const service = make();
    const brewId = await newBrew(user);
    const chat = await opened(service, brewId);
    route = () => snippet("가 화면");
    await service.send(user, brewId, drawFirst(chat));
    await service.settled();
    const drawn = (await service.get(user, brewId)).chat!.snippets[0]!;

    route = (request) => (request.contract === "page_design" ? { ...reply, say: "강조색만 바꿔 볼게요.", show: "revision", instruction: "강조색을 짙은 초록으로 바꾼다" } : revision("가 화면 초록", [{ in: "css", find: tokens.text, replace: "#1f5c3a" }], { ...tokens, accent: "#1f5c3a" }));
    await service.send(user, brewId, { action: "say", requestId: randomUUID(), text: "강조색을 짙은 초록으로", subject: { kind: "snippet", id: drawn.id } });
    await service.settled();
    const revised = (await service.get(user, brewId)).chat!;
    expect(revised.messages.at(-2)).toMatchObject({ role: "user", action: "say", text: "강조색을 짙은 초록으로", subjects: [{ kind: "snippet", id: drawn.id, name: "가 화면" }] });
    expect(revised.messages.at(-1)).toMatchObject({ role: "assistant", status: "complete", text: "강조색만 바꿔 볼게요.", card: { kind: "revision", fromSnippetId: drawn.id, item: { status: "done" } } });
    expect(revised.snippets.at(-1)).toMatchObject({ origin: "edit", fromSnippetId: drawn.id, name: "가 화면 초록", words: "강조색을 짙은 초록으로 바꾼다", layout: drawn.layout });
    // 고치는 호출은 바뀌는 자리만 낸다. 서버가 지금 첫 화면에 적용하므로 가리키지 않은 자리는 한 글자도 달라지지 않는다.
    expect(revised.snippets.at(-1)).toMatchObject({ html: drawn.html, css: drawn.css.replace(tokens.text, "#1f5c3a"), tokens: { accent: "#1f5c3a" } });
    expect(revised.snippets.at(-1)!.css).not.toBe(drawn.css);
    // 답하는 호출은 대화 요약과 대상을 받고, 고치는 호출은 지금 첫 화면의 마크업을 받는다.
    const [answered, revise] = ai.calls.slice(-2);
    expect(answered!.prompt).toContain("## 이 말의 대상");
    expect(answered!.prompt).toContain(opening.say);
    expect(revise!.prompt).toContain(drawn.html);

    // 대상을 붙이지 않고 고쳐 달라고 해도 방금 본 첫 화면(가장 최근에 그린 것)을 고친다.
    // 2026-11-19: 이 말에 "바꿔 볼게요"라는 답만 남고 아무것도 뜨지 않았다.
    const latest = revised.snippets.at(-1)!;
    route = (request) => (request.contract === "page_design" ? { ...reply, say: "더 밝게 바꿔 볼게요.", show: "revision", instruction: "바탕을 더 밝게 한다" } : revision("가 화면 밝게", [{ in: "css", find: ".hero{", replace: ".hero{background:#ffffff;" }]));
    await service.send(user, brewId, { action: "say", requestId: randomUUID(), text: "조금 더 밝게요" });
    await service.settled();
    const loose = (await service.get(user, brewId)).chat!;
    expect(loose.messages.at(-2)).toMatchObject({ role: "user", action: "say", subjects: [] });
    expect(loose.messages.at(-1)).toMatchObject({ role: "assistant", status: "complete", text: "더 밝게 바꿔 볼게요.", card: { kind: "revision", fromSnippetId: latest.id, item: { status: "done" } } });
    expect(loose.snippets.at(-1)).toMatchObject({ origin: "edit", fromSnippetId: latest.id, name: "가 화면 밝게" });
    expect(ai.calls.at(-1)!.prompt).toContain(latest.html);

    // 말이 앞서 그린 것을 가리키면 가장 최근 것이 아니라 그 첫 화면을 고친다.
    route = (request) => (request.contract === "page_design" ? { ...reply, say: "처음 것의 제목을 키워 볼게요.", show: "revision", target: drawn.name, instruction: "제목을 키운다" } : revision("가 화면 큰 제목", [{ in: "html", find: "<h1>", replace: '<h1 class="big">' }]));
    await service.send(user, brewId, { action: "say", requestId: randomUUID(), text: "처음 그린 것에서 제목만 키워 주세요" });
    await service.settled();
    const named = (await service.get(user, brewId)).chat!;
    expect(named.messages.at(-1)).toMatchObject({ role: "assistant", status: "complete", card: { kind: "revision", fromSnippetId: drawn.id, item: { status: "done" } } });
    expect(ai.calls.at(-1)!.prompt).toContain(drawn.html);
    // 처음 그린 것에 조각을 적용했다 — 그 사이에 고친 초록 · 밝은 바탕은 들어 있지 않다.
    expect(named.snippets.at(-1)).toMatchObject({ name: "가 화면 큰 제목", css: drawn.css, html: drawn.html.replace("<h1>", '<h1 class="big">') });

    // 그린 첫 화면이 하나도 없는 대화에서 고치겠다고 답하면, 띄울 것과 함께 그 말도 고쳐 받는다.
    const emptyBrew = await newBrew(user);
    await opened(service, emptyBrew);
    const directed = new ScriptedAiClient(
      () => ({ ...reply, say: "고쳐 볼게요.", show: "revision", instruction: "밝게" }),
      () => [{ path: "/show", value: "none" }, { path: "/say", value: "먼저 스타일과 레이아웃을 골라 첫 화면을 그려 볼까요?" }],
    );
    const strict = new DesignChatService(fixture.resource, directed, new ConsentService(fixture.resource));
    services.push(strict);
    await strict.send(user, emptyBrew, { action: "say", requestId: randomUUID(), text: "조금 더 밝게요" });
    await strict.settled();
    expect(directed.fixRequests).toHaveLength(1);
    expect((await service.get(user, emptyBrew)).chat!.messages.at(-1)).toMatchObject({ role: "assistant", status: "complete", card: null, text: "먼저 스타일과 레이아웃을 골라 첫 화면을 그려 볼까요?" });

    // 견본으로 답하면 견본 카드가 붙는다. 색 이야기에는 스타일만 새로 낸다 — 레이아웃 줄은 비어 있다.
    route = () => ({ ...reply, say: "더 밝은 쪽으로 놓아 봤어요.", show: "proposals", styles: [style("라")] });
    await service.send(user, brewId, { action: "say", requestId: randomUUID(), text: "더 밝은 색도 보여 주세요" });
    await service.settled();
    const more = (await service.get(user, brewId)).chat!.messages.at(-1)!;
    expect(more).toMatchObject({ role: "assistant", status: "complete", card: { kind: "proposals", styles: [{ name: "스타일 라" }], layouts: [] } });
    // 새로 놓인 스타일도 앞서 놓인 레이아웃과 짝이 된다.
    const fresh = more.role === "assistant" && more.card?.kind === "proposals" ? more.card.styles[0]! : null;
    route = () => snippet("라 화면");
    await service.send(user, brewId, { action: "draw", requestId: randomUUID(), styleId: fresh!.id, layoutId: proposed(chat).layouts[1]!.id });
    await service.settled();
    expect((await service.get(user, brewId)).chat!.snippets.at(-1)).toMatchObject({ name: "라 화면", layout: { name: "레이아웃 나" } });
  });

  it("고치는 동안 조각이 닿는 자리를 대화에 적고, 다 고치면 고친 첫 화면에서의 자리로 바꾼다", async () => {
    const brewId = await newBrew(user);
    const chat = await opened(make(), brewId);
    const edits = [
      { in: "css" as const, find: `color:${tokens.text}}`, replace: `color:${tokens.text}}.hero p{font-weight:700}` },
      { in: "html" as const, find: "<h1>", replace: '<h1 class="big">' },
    ];
    const draft = revision("가 화면 굵게", edits);
    // 쓰는 중의 출력을 첫 조각의 「지금 있는 글자」까지만 흘리고, 그때 대화에 적힌 자리를 읽는다.
    let during: unknown = null;
    const reader = make();
    const watching: AiClient = {
      complete: async (spec, schema, options) => {
        if (spec.contract === "page_generation" && options?.onPartial && spec.prompt.includes("## 지시")) {
          const text = JSON.stringify(draft);
          options.onPartial(text.slice(0, text.indexOf('"replace"')));
          await expect.poll(async () => {
            const card = (await reader.get(user, brewId)).chat!.messages.at(-1);
            during = card?.role === "assistant" && card.card?.kind === "revision" ? card.card : null;
            return (during as { targets: string[] } | null)?.targets ?? [];
          }).toEqual([".hero"]);
        }
        return ai.complete(spec, schema, options);
      },
    };
    const service = new DesignChatService(fixture.resource, watching, new ConsentService(fixture.resource));
    services.push(service);
    route = () => snippet("가 화면");
    await service.send(user, brewId, drawFirst(chat));
    await service.settled();

    route = (request) => (request.contract === "page_design" ? { ...reply, say: "글을 굵게 하고 제목에 이름을 붙여 볼게요.", show: "revision", instruction: "글을 굵게 한다" } : draft);
    await service.send(user, brewId, { action: "say", requestId: randomUUID(), text: "글을 굵게" });
    await service.settled();
    // 고치는 동안에는 그리는 중인 카드에 지금 첫 화면에서의 자리가 적혀 있었다.
    expect(during).toMatchObject({ kind: "revision", item: { status: "drawing" }, targets: [".hero"] });
    // 다 고친 뒤에는 고친 첫 화면에서 바뀐 자리다 — 이어 붙인 새 규칙과 속성을 바꾼 요소가 더해진다.
    const done = (await service.get(user, brewId)).chat!.messages.at(-1);
    expect(done).toMatchObject({ role: "assistant", status: "complete", card: { kind: "revision", item: { status: "done" }, targets: ["body > :nth-child(1) > :nth-child(1)", ".hero", ".hero p"] } });
  });

  it("답을 만들다 멎은 실행은 읽을 때 끊긴 것으로 바뀌고 다시 시도할 수 있다", async () => {
    const service = make();
    const brewId = await newBrew(user);
    const chat = await opened(service, brewId);
    const db = mongoCollections(fixture.resource.db);
    const stamp = new Date().toISOString();
    // 다른 프로세스가 돌리다 죽은 실행을 흉내 낸다: 실행 중인데 하트비트가 2분 전이다.
    await db.designChats.updateOne({ _id: chat.id }, {
      $push: { messages: { $each: [
        { id: randomUUID(), role: "user", action: "say", text: "더 밝게", subjects: [], createdAt: stamp },
        { id: randomUUID(), role: "assistant", text: "", status: "running", card: null, createdAt: stamp },
      ] } },
      $set: { run: { id: randomUUID(), requestId: randomUUID(), status: "running", error: null, startedAt: stamp }, heartbeatAt: new Date(Date.now() - 120_000) },
      $inc: { version: 1 },
    });
    const stale = (await service.get(user, brewId)).chat!;
    expect(stale.run).toMatchObject({ status: "interrupted", error: expect.stringContaining("끊겼습니다") });
    expect(stale.messages.at(-1)).toMatchObject({ role: "assistant", status: "failed" });

    route = () => ({ ...reply, say: "밝게 잡아 볼게요." });
    await service.retry(user, brewId, randomUUID());
    await service.settled();
    expect((await service.get(user, brewId)).chat!.messages.at(-1)).toMatchObject({ role: "assistant", status: "complete", text: "밝게 잡아 볼게요." });
  });

  it("서버가 내려가면 돌리던 답을 끊긴 것으로 적는다", async () => {
    const service = new DesignChatService(fixture.resource, { complete: () => new Promise(() => undefined) }, new ConsentService(fixture.resource));
    const brewId = await newBrew(user);
    await service.open(user, brewId, randomUUID());
    await service.close();
    const chat = (await make().get(user, brewId)).chat!;
    expect(chat.run?.status).toBe("interrupted");
    expect(chat.messages[0]).toMatchObject({ role: "assistant", status: "failed" });
  });

  it("고른 첫 화면으로 낸 생성은 자유 생성이고, 지면은 그 첫 화면으로 시작한다", async () => {
    const service = make();
    const brewId = await newBrew(user);
    const chat = await opened(service, brewId);
    route = () => snippet("가 화면");
    await service.send(user, brewId, drawFirst(chat));
    await service.settled();
    const picked = (await service.get(user, brewId)).chat!.snippets[0]!;
    expect((await service.select(user, brewId, picked.id)).selectedSnippetId).toBe(picked.id);
    await expect(service.select(user, brewId, randomUUID())).rejects.toMatchObject({ statusCode: 404 });

    const db = mongoCollections(fixture.resource.db);
    const generation = new MongoGenerationService(fixture.resource);
    await expect(generation.submit(user, randomUUID(), { brewId, designSnippetId: randomUUID() })).rejects.toMatchObject({ statusCode: 404 });
    const job = await generation.submit(user, randomUUID(), { brewId, designSnippetId: picked.id });
    expect(await db.generationJobs.findOne({ _id: job.generationJobId })).toMatchObject({ pageFormat: "html", designSnippetId: picked.id, styleOverrides: tokens });
    const portfolioId = (await generation.prepareFreeHtml(job.generationJobId)).portfolioId!;
    expect(await db.portfolios.findOne({ _id: portfolioId })).toMatchObject({ pageFormat: "html", designSnippetId: picked.id });

    const recipe = await db.recipes.findOne({ userId: user, brewId });
    const sectionIds = (await db.recipeSections.find({ userId: user, recipeId: recipe!._id }).sort({ orderNo: 1 }).toArray()).map(({ _id }) => _id);
    const writer = new ScriptedAiClient((request) => (request.contract === "page_fill" ? brief(sectionIds) : { plan, css: ".sec{margin:0}", html: '<section class="sec"><h2>경로 연구</h2></section>', rationale: "첫 화면을 이었다" }));
    const seeded: string[] = [];
    const page = await new PageService(fixture.resource, null, null).generate(user, portfolioId, {
      generate: (context, sink) => freePageGenerator(writer).generate(context, { delta: () => undefined, thinking: () => undefined, seed: (seed) => { seeded.push(seed.html); }, ...sink }),
      usesKit: () => false,
    });
    expect(page.html.startsWith(picked.html)).toBe(true);
    expect(page.html).toContain('<section class="sec">');
    expect(page.css.startsWith(picked.css)).toBe(true);
    expect(seeded).toEqual([picked.html]);
    // 지면 요청은 확정된 첫 화면을 보이고 그 뒤만 쓰게 한다. 서체 계열은 첫 화면이 쓴 것(고정폭)이다.
    const request = writer.calls.at(-1)!.prompt;
    expect(request).toContain("## 확정된 첫 화면");
    expect(request).toContain(picked.html);
    expect(request).toContain("서체 계열: 고정폭");
  });
});
