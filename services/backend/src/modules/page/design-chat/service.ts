import { randomUUID } from "node:crypto";

import { DesignAssistantMessageSchema, DesignCardSchema, DesignSnippetSchema, type DesignCard, type DesignChat, type DesignChatMessage, type DesignLayout, type DesignLayoutSpec, type DesignScreenItem, type DesignSnippet, type DesignStyle, type DesignSubject, type SendDesignMessage, type DesignGraphic } from "@expresso/contracts";
import { mongoCollections, type DesignChatDoc, type JsonObject } from "@expresso/database";
import type { Db, UpdateFilter } from "mongodb";

import type { AiClient } from "../../../platform/ai/client.js";
import { sanitizePage } from "../../../platform/html/sanitize.js";
import type { MongoContext } from "../../../platform/mongodb.js";
import type { ConsentApi } from "../../consent/index.js";
import { MongoEntitlementService } from "../../entitlements/index.js";
import { brewPageSources, type BrewPageSources } from "../brew-sources.js";
import { PageServiceError } from "../public.js";
import {
  DesignHeadSchema,
  OpeningSchema,
  ProposalsSchema,
  proposalsCall,
  type ProposalFocus,
  ReplySchema,
  RevisionDraftSchema,
  SnippetDraftSchema,
  catalogStyle,
  drawCall,
  openingCall,
  replyCall,
  reviseCall,
  reviseTarget,
  type DesignHead,
  type ReplySubject,
  type SnippetDraft,
  type StyleDraft,
} from "./prompts.js";
import { closedFinds, editingTargets, revisedTargets } from "./targets.js";

/**
 * 디자인을 정하는 대화의 살림.
 *
 * 제작(brew) 하나에 대화 하나를 두고, 사용자가 말하거나 카드를 누르면 답 하나를 **뒤에서** 만든다. 요청은 바로 돌아가고
 * 화면은 대화를 다시 읽어 진행을 본다. 에이전트 대화(`agent-chat/service.ts`)와 같은 방식이다 — 실행 중에는 1초마다
 * `heartbeatAt`을 갱신하고, 읽을 때 60초 넘게 멎은 실행을 끊긴 것으로 바꾼다. 두 값도 그쪽과 같다.
 *
 * AI 호출 계층에 중단 신호가 없어 진행 중인 답은 멈출 수 없다. 서버가 내려갈 때는 이 프로세스가 돌리던 실행을
 * 바로 끊긴 것으로 적는다 — 호출이 끝나길 기다리면 배포가 그만큼 늦어지고, 프로세스가 죽으면 어차피 결과가 오지 않는다.
 */
const RUN_HEARTBEAT_MS = 1_000;
const RUN_STALE_MS = 60_000;
const INTERRUPTED = "답을 만드는 중에 연결이 끊겼습니다. 다시 시도해 주세요.";
const FAILED = "답을 만들지 못했습니다. 다시 시도해 주세요.";

export class DesignChatError extends Error {
  constructor(
    readonly statusCode: number,
    message: string,
    /** 화면에 그대로 보일 문장. */
    readonly publicMessage?: string,
  ) {
    super(message);
    this.name = "DesignChatError";
  }
}

/** 답 하나를 만드는 일. 요청을 받을 때 대상을 모두 풀어 두므로 실행은 대화를 다시 읽지 않는다. */
type Turn =
  | { kind: "open" }
  | { kind: "propose"; request: string; focus: ProposalFocus }
  | { kind: "say"; text: string; subject: ReplySubject | null }
  | { kind: "draw"; items: DesignScreenItem[]; origins: DesignSnippet["origin"][]; revise: { from: DesignSnippet; instruction: string } | null };

const view = (row: DesignChatDoc): DesignChat => ({
  id: row._id,
  brewId: row.brewId,
  messages: row.messages,
  snippets: row.snippets,
  selectedSnippetId: row.selectedSnippetId,
  run: row.run,
  version: row.version,
  updatedAt: row.updatedAt,
});

/** 그릴 첫 화면 한 장. 스타일과 레이아웃은 따로 고른 것이고, 여기서 한 장으로 짝지어진다. */
const screenItem = (style: StyleDraft, layout: DesignLayoutSpec | null, graphic?: DesignGraphic): DesignScreenItem => ({ id: randomUUID(), name: style.name, words: style.words, tokens: style.tokens, layout, ...(graphic ? { graphic } : {}), status: "drawing", snippetId: null });
/** 견본 카드의 레이아웃에서 ID를 뗀 것. 첫 화면과 그리는 호출은 값만 가진다. */
const layoutSpec = ({ name, words, blocks }: DesignLayout): DesignLayoutSpec => ({ name, words, blocks });

/** 그리다 만 장(`drawing`)과 그리지 못한 장(`failed`). 다시 시도할 때 이 장들만 다시 그린다. */
const unfinished = (card: DesignCard | null): DesignScreenItem[] =>
  card?.kind === "screens" ? card.items.filter((item) => item.status !== "done") : card?.kind === "revision" && card.item.status !== "done" ? [card.item] : [];

/** 대화에서 고른 첫 화면을 읽는다. 생성 요청과 지면 생성이 쓴다. 그 제작의 대화에 없는 ID면 null이다. */
export async function findDesignSnippet(database: Db, userId: string, brewId: string, snippetId: string): Promise<DesignSnippet | null> {
  const row = await mongoCollections(database).designChats.findOne({ userId, brewId, "snippets.id": snippetId }, { projection: { snippets: 1 } });
  return row?.snippets.find((snippet) => snippet.id === snippetId) ?? null;
}

export class DesignChatService {
  readonly #context: MongoContext;
  readonly #ai: AiClient;
  readonly #consent: ConsentApi | null;
  /** 이 프로세스가 돌리는 실행. 서버가 내려갈 때 끊긴 것으로 적는다. */
  readonly #running = new Map<string, { chatId: string; assistantAt: number }>();
  readonly #tasks = new Set<Promise<void>>();
  #closing = false;

  constructor(context: MongoContext, ai: AiClient, consent: ConsentApi | null = null) {
    this.#context = context;
    this.#ai = ai;
    this.#consent = consent;
  }

  get #rows() {
    return mongoCollections(this.#context.db).designChats;
  }

  async #ownBrew(userId: string, brewId: string): Promise<void> {
    if (!(await mongoCollections(this.#context.db).brews.findOne({ _id: brewId, userId, deletedAt: null }, { projection: { _id: 1 } }))) throw new DesignChatError(404, "brew not found");
  }

  /** 대화를 읽는다. 멎은 지 오래된 실행은 이때 끊긴 것으로 바꾼다. */
  async #load(userId: string, brewId: string): Promise<DesignChatDoc | null> {
    const row = await this.#rows.findOne({ userId, brewId });
    if (!row || row.run?.status !== "running" || row.heartbeatAt.getTime() >= Date.now() - RUN_STALE_MS) return row;
    await this.#end(row._id, row.run.id, row.messages.length - 1, row.messages.at(-1) ?? null, "interrupted", INTERRUPTED);
    return this.#rows.findOne({ userId, brewId });
  }

  async get(userId: string, brewId: string, since?: number): Promise<{ chat: DesignChat | null; unchanged: boolean }> {
    await this.#ownBrew(userId, brewId);
    const row = await this.#load(userId, brewId);
    if (!row) return { chat: null, unchanged: false };
    return since === row.version ? { chat: null, unchanged: true } : { chat: view(row), unchanged: false };
  }

  /** 답을 시작하기 전에 본다 — 자료를 AI에 보내도 되는지(동의)와 이번 달 크레딧이 남았는지. */
  async #gate(userId: string): Promise<void> {
    await this.#consent?.require(userId, "page_generation");
    // 한도는 새 생성을 막는 것과 같은 기준이다. 대화는 새 지면을 만드는 첫걸음이라 한도에 닿은 계정에서 열어 둘 이유가 없다.
    const decision = await new MongoEntitlementService(this.#context).check(userId, "portfolio.generate");
    if (!decision.allowed) throw new DesignChatError(403, "monthly AI credits are exhausted", "이번 달 AI 크레딧을 모두 썼습니다. 다음 달에 대화를 이어 갈 수 있습니다.");
  }

  async #sources(userId: string, brewId: string): Promise<BrewPageSources> {
    try {
      return await brewPageSources(this.#context.db, userId, brewId);
    } catch (error) {
      if (error instanceof PageServiceError) throw new DesignChatError(409, error.message, "구성이 아직 없습니다. 구성이 끝나면 대화를 시작할 수 있습니다.");
      throw error;
    }
  }

  /**
   * 대화를 연다. 없으면 만들고 에이전트의 첫 말을 시작한다. 이미 열려 있으면 그대로 돌려준다 —
   * 화면이 다시 그려질 때마다 불러도 대화는 하나고 첫 말도 한 번만 만든다(`(userId, brewId)` 고유 인덱스).
   */
  async open(userId: string, brewId: string, requestId: string): Promise<DesignChat> {
    await this.#ownBrew(userId, brewId);
    const existing = await this.#load(userId, brewId);
    if (existing && existing.messages.length > 0) return view(existing);
    await this.#gate(userId);
    await this.#sources(userId, brewId);
    const now = new Date();
    const stamp = now.toISOString();
    const run = { id: randomUUID(), requestId, status: "running" as const, error: null, startedAt: stamp };
    const first: DesignChatMessage = { id: randomUUID(), role: "assistant", text: "", status: "running", card: null, createdAt: stamp };
    const row = await this.#rows.findOneAndUpdate(
      { userId, brewId, messages: { $size: 0 } },
      {
        $set: { messages: [first], run, heartbeatAt: now, updatedAt: stamp },
        $inc: { version: 1 },
        $setOnInsert: { _id: randomUUID(), head: null, snippets: [], selectedSnippetId: null, createdAt: stamp },
      },
      { upsert: true, returnDocument: "after" },
    ).catch(async (error: unknown) => {
      // 두 요청이 동시에 들어오면 하나는 고유 인덱스에 걸린다. 먼저 들어간 쪽의 대화를 돌려준다.
      if ((error as { code?: number }).code === 11000) return null;
      throw error;
    });
    if (!row) {
      const current = await this.#load(userId, brewId);
      if (!current) throw new DesignChatError(409, "design chat changed");
      return view(current);
    }
    this.#start(row, 0, { kind: "open" });
    return view(row);
  }

  async send(userId: string, brewId: string, input: SendDesignMessage): Promise<DesignChat> {
    await this.#ownBrew(userId, brewId);
    const row = await this.#load(userId, brewId);
    if (!row || !row.head) throw new DesignChatError(409, "design chat is not open", "대화가 아직 열리지 않았습니다.");
    if (row.run?.requestId === input.requestId) return view(row);
    if (row.run?.status === "running") throw new DesignChatError(409, "design chat is running", "답을 만드는 중입니다. 끝난 뒤에 보내 주세요.");
    await this.#gate(userId);

    const proposals = row.messages.flatMap((message) => (message.role === "assistant" && message.card?.kind === "proposals" ? [message.card] : []));
    const style = (id: string): DesignStyle => {
      const found = proposals.flatMap((card) => card.styles).find((item) => item.id === id);
      if (!found) throw new DesignChatError(422, "style not found", "그 스타일을 대화에서 찾지 못했습니다.");
      return found;
    };
    const layout = (id: string): DesignLayout => {
      const found = proposals.flatMap((card) => card.layouts).find((item) => item.id === id);
      if (!found) throw new DesignChatError(422, "layout not found", "그 레이아웃을 대화에서 찾지 못했습니다.");
      return found;
    };
    const catalog = (revisionId: string): StyleDraft => {
      const found = catalogStyle(revisionId);
      if (!found) throw new DesignChatError(422, "design system revision not found", "그 디자인을 카탈로그에서 찾지 못했습니다.");
      return found;
    };

    let subjects: DesignSubject[] = [];
    let text = "";
    let card: DesignCard | null = null;
    let turn: Turn;
    if (input.action === "draw") {
      const chosen = { style: style(input.styleId), layout: layout(input.layoutId) };
      subjects = [{ kind: "style", id: chosen.style.id, name: chosen.style.name }, { kind: "layout", id: chosen.layout.id, name: chosen.layout.name }];
      const items = [screenItem(chosen.style, layoutSpec(chosen.layout), input.graphic)];
      card = { kind: "screens", items };
      turn = { kind: "draw", items, origins: ["agent"], revise: null };
    } else if (input.action === "draw_catalog") {
      const draft = catalog(input.revisionId);
      // 카탈로그의 디자인은 스타일이다. 견본에서 고른 레이아웃이 함께 오면 그 구성으로, 없으면 그리는 쪽이 구성을 정한다.
      const chosen = input.layoutId ? layout(input.layoutId) : null;
      subjects = [{ kind: "catalog", id: input.revisionId, name: draft.name }, ...(chosen ? [{ kind: "layout" as const, id: chosen.id, name: chosen.name }] : [])];
      const items = [screenItem(draft, chosen ? layoutSpec(chosen) : null, input.graphic)];
      card = { kind: "screens", items };
      turn = { kind: "draw", items, origins: ["catalog"], revise: null };
    } else {
      text = input.text;
      let subject: ReplySubject | null = null;
      if (input.subject?.kind === "catalog") subject = { kind: "catalog", style: catalog(input.subject.id) };
      if (input.subject?.kind === "snippet") {
        const snippet = row.snippets.find(({ id }) => id === input.subject!.id);
        if (!snippet) throw new DesignChatError(422, "snippet not found", "그 첫 화면을 대화에서 찾지 못했습니다.");
        subject = { kind: "snippet", snippet };
      }
      if (subject && input.subject) subjects = [{ kind: input.subject.kind, id: input.subject.id, name: subject.kind === "snippet" ? subject.snippet.name : subject.style.name }];
      turn = { kind: "say", text, subject };
    }

    const now = new Date();
    const stamp = now.toISOString();
    const user: DesignChatMessage = { id: randomUUID(), role: "user", action: input.action, text, subjects, createdAt: stamp };
    const assistant: DesignChatMessage = { id: randomUUID(), role: "assistant", text: "", status: "running", card, createdAt: stamp };
    const next = await this.#rows.findOneAndUpdate(
      { _id: row._id, version: row.version, "run.status": { $ne: "running" } },
      {
        $push: { messages: { $each: [user, assistant] } },
        $set: { run: { id: randomUUID(), requestId: input.requestId, status: "running", error: null, startedAt: stamp }, heartbeatAt: now, updatedAt: stamp },
        $inc: { version: 1 },
      },
      { returnDocument: "after" },
    );
    if (!next) throw new DesignChatError(409, "design chat changed", "대화가 그사이 바뀌었습니다. 다시 보내 주세요.");
    this.#start(next, next.messages.length - 1, turn);
    return view(next);
  }

  /**
   * 에이전트 대화가 청한 차례. 무엇을 할지는 에이전트가 정했으므로 답하는 호출을 거치지 않고 그 차례를 바로 시작한다.
   * 사용자의 차례로는 에이전트가 옮긴 요청이 남는다(지금의 디자인 화면에도 같은 대화로 보인다). 답의 말은 비워 둔다 — 말은 에이전트가 한다.
   *
   * - `propose`: 요청에 맞춘 견본을 낸다.
   * - `revise`: 그린 첫 화면 하나를 고친다. 고칠 것은 이름으로 가리키고, 비면 가장 최근 것이다. 청사진 자리 · 다시 그리기는 말로 고칠 때와 같다.
   */
  async propose(userId: string, brewId: string, input: { requestId: string; request: string; focus: ProposalFocus }): Promise<DesignChat> {
    return this.#delegate(userId, brewId, input.requestId, input.request, () => ({ card: null, turn: { kind: "propose", request: input.request, focus: input.focus } }));
  }

  async revise(userId: string, brewId: string, input: { requestId: string; instruction: string; screen: string }): Promise<DesignChat> {
    return this.#delegate(userId, brewId, input.requestId, input.instruction, (row) => {
      const from = reviseTarget(row.snippets, null, input.screen);
      if (!from) throw new DesignChatError(409, "nothing to revise", "아직 그린 첫 화면이 없습니다. 견본에서 짝을 골라 첫 화면을 먼저 그려 주세요.");
      const entry: DesignScreenItem = { id: randomUUID(), name: from.name, words: input.instruction, tokens: from.tokens, layout: from.layout, status: "drawing", snippetId: null };
      return { card: { kind: "revision", fromSnippetId: from.id, item: entry, targets: [] }, turn: { kind: "draw", items: [entry], origins: ["edit"], revise: { from, instruction: input.instruction } } };
    });
  }

  async #delegate(userId: string, brewId: string, requestId: string, text: string, plan: (row: DesignChatDoc) => { card: DesignCard | null; turn: Turn }): Promise<DesignChat> {
    await this.#ownBrew(userId, brewId);
    const row = await this.#load(userId, brewId);
    if (!row || !row.head) throw new DesignChatError(409, "design chat is not open", "디자인 대화가 아직 열리지 않았습니다. 「디자인」 카드에 첫 말과 견본이 뜬 뒤에 할 수 있습니다.");
    if (row.run?.requestId === requestId) return view(row);
    if (row.run?.status === "running") throw new DesignChatError(409, "design chat is running", "답을 만드는 중입니다. 끝난 뒤에 보내 주세요.");
    await this.#gate(userId);
    const { card, turn } = plan(row);
    const now = new Date();
    const stamp = now.toISOString();
    const user: DesignChatMessage = { id: randomUUID(), role: "user", action: "say", text, subjects: [], createdAt: stamp };
    const assistant: DesignChatMessage = { id: randomUUID(), role: "assistant", text: "", status: "running", card, createdAt: stamp };
    const next = await this.#rows.findOneAndUpdate(
      { _id: row._id, version: row.version, "run.status": { $ne: "running" } },
      { $push: { messages: { $each: [user, assistant] } }, $set: { run: { id: randomUUID(), requestId, status: "running", error: null, startedAt: stamp }, heartbeatAt: now, updatedAt: stamp }, $inc: { version: 1 } },
      { returnDocument: "after" },
    );
    if (!next) throw new DesignChatError(409, "design chat changed", "대화가 그사이 바뀌었습니다. 다시 보내 주세요.");
    this.#start(next, next.messages.length - 1, turn);
    return view(next);
  }

  /**
   * 실패했거나 끊긴 답을 다시 만든다. 이미 그린 장은 두고 그리지 못한 장만 다시 그린다 — 한 장에 20초쯤이 들고 크레딧도 쓴다.
   * 카드 없이 실패한 답은 그 앞의 말(없으면 첫 말)부터 다시 한다.
   */
  async retry(userId: string, brewId: string, requestId: string): Promise<DesignChat> {
    await this.#ownBrew(userId, brewId);
    const row = await this.#load(userId, brewId);
    if (!row) throw new DesignChatError(409, "design chat is not open");
    if (row.run?.requestId === requestId) return view(row);
    if (row.run?.status === "running") throw new DesignChatError(409, "design chat is running", "답을 만드는 중입니다.");
    const at = row.messages.length - 1;
    const last = row.messages[at];
    if (last?.role !== "assistant") throw new DesignChatError(409, "nothing to retry");
    const pending = unfinished(last.card);
    if (last.status !== "failed" && pending.length === 0) throw new DesignChatError(409, "nothing to retry");
    await this.#gate(userId);

    let turn: Turn;
    let card = last.card;
    if (pending.length > 0 && last.card?.kind === "screens") {
      const prior = row.messages[at - 1];
      const origin: DesignSnippet["origin"] = prior?.role === "user" && prior.action === "draw_catalog" ? "catalog" : prior?.role === "user" && prior.action === "say" ? "user" : "agent";
      card = { kind: "screens", items: last.card.items.map((entry) => (entry.status === "done" ? entry : { ...entry, status: "drawing" as const })) };
      turn = { kind: "draw", items: pending, origins: pending.map(() => origin), revise: null };
    } else if (pending.length > 0 && last.card?.kind === "revision") {
      const from = row.snippets.find(({ id }) => id === (last.card as Extract<DesignCard, { kind: "revision" }>).fromSnippetId);
      if (!from) throw new DesignChatError(409, "snippet not found");
      card = { ...last.card, item: { ...last.card.item, status: "drawing" }, targets: [] };
      turn = { kind: "draw", items: pending, origins: ["edit"], revise: { from, instruction: last.card.item.words } };
    } else {
      const prior = row.messages[at - 1];
      card = null;
      if (!prior) turn = { kind: "open" };
      else if (prior.role === "user" && prior.action === "say") {
        // 말의 대상은 하나다 — 첫 화면이거나 카탈로그의 디자인.
        const target = prior.subjects[0];
        const snippet = target?.kind === "snippet" ? row.snippets.find(({ id }) => id === target.id) : undefined;
        const fromCatalog = target?.kind === "catalog" ? catalogStyle(target.id) : null;
        const subject: ReplySubject | null = snippet ? { kind: "snippet", snippet } : fromCatalog ? { kind: "catalog", style: fromCatalog } : null;
        turn = { kind: "say", text: prior.text, subject };
      } else throw new DesignChatError(409, "nothing to retry");
    }

    const now = new Date();
    const stamp = now.toISOString();
    const next = await this.#rows.findOneAndUpdate(
      { _id: row._id, version: row.version, "run.status": { $ne: "running" } },
      {
        $set: {
          [`messages.${at}`]: { ...last, text: turn.kind === "draw" ? last.text : "", status: "running", card } satisfies DesignChatMessage,
          run: { id: randomUUID(), requestId, status: "running", error: null, startedAt: stamp },
          heartbeatAt: now,
          updatedAt: stamp,
        },
        $inc: { version: 1 },
      } as UpdateFilter<DesignChatDoc>,
      { returnDocument: "after" },
    );
    if (!next) throw new DesignChatError(409, "design chat changed", "대화가 그사이 바뀌었습니다. 다시 시도해 주세요.");
    this.#start(next, at, turn);
    return view(next);
  }

  async select(userId: string, brewId: string, snippetId: string | null): Promise<DesignChat> {
    await this.#ownBrew(userId, brewId);
    const stamp = new Date().toISOString();
    const row = await this.#rows.findOneAndUpdate(
      { userId, brewId, ...(snippetId ? { "snippets.id": snippetId } : {}) },
      { $set: { selectedSnippetId: snippetId, updatedAt: stamp }, $inc: { version: 1 } },
      { returnDocument: "after" },
    );
    if (!row) throw new DesignChatError(404, "snippet not found", "그 첫 화면을 대화에서 찾지 못했습니다.");
    return view(row);
  }

  #start(row: DesignChatDoc, assistantAt: number, turn: Turn): void {
    const runId = row.run!.id;
    this.#running.set(runId, { chatId: row._id, assistantAt });
    const task = this.#execute(row, assistantAt, turn)
      .catch(() => undefined)
      .finally(() => {
        this.#running.delete(runId);
        this.#tasks.delete(task);
      });
    this.#tasks.add(task);
  }

  /** 이 실행이 아직 주인인 동안에만 쓴다. 끊긴 것으로 바뀌었거나 다시 시도로 실행이 바뀌었으면 쓰지 않는다. */
  async #write(chatId: string, runId: string, update: UpdateFilter<DesignChatDoc>, arrayFilters?: Record<string, unknown>[]): Promise<boolean> {
    const result = await this.#rows.updateOne(
      { _id: chatId, "run.id": runId, "run.status": "running" },
      { ...update, $set: { ...(update.$set as object), updatedAt: new Date().toISOString() }, $inc: { version: 1 } } as UpdateFilter<DesignChatDoc>,
      arrayFilters ? { arrayFilters } : {},
    );
    return result.matchedCount > 0;
  }

  /** 실행을 끝낸다. 그리던 장은 그리지 못한 것으로 남기고, 한 장도 없는 답은 실패로 적는다. */
  async #end(chatId: string, runId: string, assistantAt: number, message: DesignChatMessage | null, status: "complete" | "failed" | "interrupted", error: string | null): Promise<void> {
    const set: Record<string, unknown> = { "run.status": status, "run.error": error };
    if (message?.role === "assistant") {
      const card = message.card;
      const settled: DesignCard | null =
        card?.kind === "screens" ? { ...card, items: card.items.map((item) => (item.status === "drawing" ? { ...item, status: "failed" as const } : item)) }
        : card?.kind === "revision" && card.item.status === "drawing" ? { ...card, item: { ...card.item, status: "failed" } }
        : card;
      const drawn = settled?.kind === "screens" ? settled.items.some((item) => item.status === "done") : settled?.kind === "revision" ? settled.item.status === "done" : status === "complete";
      set[`messages.${assistantAt}`] = { ...message, card: settled, status: status === "complete" && drawn ? "complete" : "failed" } satisfies DesignChatMessage;
    }
    await this.#write(chatId, runId, { $set: set } as UpdateFilter<DesignChatDoc>);
  }

  async #execute(row: DesignChatDoc, assistantAt: number, turn: Turn): Promise<void> {
    const { _id: chatId, userId, brewId } = row;
    const runId = row.run!.id;
    const heartbeat = setInterval(() => {
      void this.#rows.updateOne({ _id: chatId, "run.id": runId, "run.status": "running" }, { $set: { heartbeatAt: new Date() } }).catch(() => undefined);
    }, RUN_HEARTBEAT_MS);
    const current = async () => (await this.#rows.findOne({ _id: chatId }))?.messages[assistantAt] ?? null;
    try {
      const sources = await this.#sources(userId, brewId);
      if (turn.kind === "open") {
        const call = openingCall(userId, sources);
        const { data } = await this.#ai.complete(call.spec, OpeningSchema, { userId, check: call.check });
        // 저장하기 전에 대화 계약으로 읽는다. 계약에 맞지 않는 것이 한 번 저장되면 화면이 이 대화를 다시 읽지 못한다.
        const card = DesignCardSchema.parse({
          kind: "proposals",
          styles: data.styles.map((draft) => ({ id: randomUUID(), ...draft })),
          layouts: data.layouts.map((draft) => ({ id: randomUUID(), ...draft })),
        });
        await this.#write(chatId, runId, { $set: { head: data.head as JsonObject, [`messages.${assistantAt}.text`]: DesignAssistantMessageSchema.shape.text.parse(data.say), [`messages.${assistantAt}.card`]: card } } as UpdateFilter<DesignChatDoc>);
        await this.#end(chatId, runId, assistantAt, await current(), "complete", null);
        return;
      }
      const head = DesignHeadSchema.parse(row.head) as DesignHead;
      if (turn.kind === "propose") {
        const call = proposalsCall({ userId, sources, head, messages: row.messages.slice(0, assistantAt - 1), snippets: row.snippets, request: turn.request, focus: turn.focus });
        const { data } = await this.#ai.complete(call.spec, ProposalsSchema, { userId, check: call.check });
        const card = DesignCardSchema.parse({ kind: "proposals", styles: data.styles.map((draft) => ({ id: randomUUID(), ...draft })), layouts: data.layouts.map((draft) => ({ id: randomUUID(), ...draft })) });
        await this.#write(chatId, runId, { $set: { [`messages.${assistantAt}.card`]: card } } as UpdateFilter<DesignChatDoc>);
        await this.#end(chatId, runId, assistantAt, await current(), "complete", null);
        return;
      }
      let draw = turn.kind === "draw" ? turn : null;
      if (turn.kind === "say") {
        const call = replyCall({
          userId, sources, head,
          // 방금 넣은 사용자의 말과 빈 답은 대화 요약에서 뺀다. 말은 요청에 따로 적는다.
          messages: row.messages.slice(0, assistantAt - 1),
          snippets: row.snippets,
          text: turn.text,
          subject: turn.subject,
          selected: row.snippets.find(({ id }) => id === row.selectedSnippetId) ?? null,
        });
        const { data } = await this.#ai.complete(call.spec, ReplySchema, { userId, check: call.check });
        let card: DesignCard | null = null;
        if (data.show === "proposals")
          card = { kind: "proposals", styles: data.styles.map((draft) => ({ id: randomUUID(), ...draft })), layouts: data.layouts.map((draft) => ({ id: randomUUID(), ...draft })) };
        if (data.show === "screens") {
          const items = data.screens.map(({ style, layout }) => screenItem(style, layout));
          card = { kind: "screens", items };
          draw = { kind: "draw", items, origins: data.screens.map(({ source }) => source), revise: null };
        }
        // 어느 첫 화면을 고칠지는 말에서 읽는다 — 붙은 대상, 말이 이름으로 가리킨 것, 가장 최근에 그린 것 순서다.
        const from = reviseTarget(row.snippets, turn.subject, data.target);
        if (data.show === "revision" && from) {
          const entry: DesignScreenItem = { id: randomUUID(), name: from.name, words: data.instruction, tokens: from.tokens, layout: from.layout, status: "drawing", snippetId: null };
          card = { kind: "revision", fromSnippetId: from.id, item: entry, targets: [] };
          draw = { kind: "draw", items: [entry], origins: ["edit"], revise: { from, instruction: data.instruction } };
        }
        await this.#write(chatId, runId, { $set: { [`messages.${assistantAt}.text`]: DesignAssistantMessageSchema.shape.text.parse(data.say), [`messages.${assistantAt}.card`]: card ? DesignCardSchema.parse(card) : null } } as UpdateFilter<DesignChatDoc>);
      }
      if (draw) {
        const { items, origins, revise } = draw;
        // 여러 장은 동시에 그리고, 끝난 장부터 대화에 놓는다. 한 장이 실패해도 나머지는 남는다.
        const notes = await Promise.all(items.map(async (item, index) => {
          try {
            let data: SnippetDraft;
            /** 고친 첫 화면에서 바뀐 자리. 고친 것에만 있다. */
            let targets: string[] | null = null;
            if (revise) {
              // 고칠 때는 바뀌는 자리만 받아 지금 첫 화면에 적용한다. 첫 화면 전체를 다시 쓰게 하지 않는다.
              const call = reviseCall({ userId, sources, snippet: revise.from, instruction: revise.instruction });
              // 조각이 오는 대로 어디가 바뀌는지 대화에 적는다. 화면은 그 자리를 청사진으로 보인다.
              const live = this.#liveTargets(chatId, runId, assistantAt, revise.from);
              const draft = (await this.#ai.complete(call.spec, RevisionDraftSchema, { userId, check: call.check, onPartial: live.push, onPartialRestart: live.restart })).data;
              await live.settled();
              data = call.apply(draft);
              // 조각은 고쳐 받는 동안 달라질 수 있다. 끝난 조각으로 고친 첫 화면에서의 자리를 다시 잡는다.
              // 스크립트 조각은 화면의 자리가 없다. 마크업 · CSS 조각만 친다.
              targets = revisedTargets(revise.from, draft.edits.flatMap((edit) => (edit.in === "script" ? [] : [{ ...edit, in: edit.in }])));
            } else {
              const call = drawCall({ userId, sources, style: { name: item.name, words: item.words, tokens: item.tokens }, layout: item.layout, graphic: item.graphic ?? null });
              data = (await this.#ai.complete(call.spec, SnippetDraftSchema, { userId, check: call.check })).data;
            }
            const clean = sanitizePage({ html: data.html, css: data.css });
            // 소독한 뒤의 값을 대화 계약으로 읽는다. 소독으로 마크업이 비었거나 계약에 맞지 않으면 이 장만 그리지 못한 것으로 남는다.
            const snippet: DesignSnippet = DesignSnippetSchema.parse({
              id: randomUUID(), origin: origins[index] ?? "agent", name: data.name, note: data.note, words: item.words, tokens: data.tokens,
              // 그릴 때 따른 레이아웃이다(고친 것은 원래 첫 화면의 것). 카탈로그의 디자인만 골라 그렸으면 null이다.
              layout: item.layout,
              css: clean.css, html: clean.html, ...(data.script?.trim() ? { script: data.script.trim() } : {}), fromSnippetId: revise?.from.id ?? null, createdAt: new Date().toISOString(),
            });
            const done = { ...item, status: "done" as const, snippetId: snippet.id };
            await this.#write(chatId, runId, {
              $push: { snippets: snippet },
              $set: { [`messages.${assistantAt}.card.${revise ? "item" : "items.$[item]"}`]: done, ...(targets ? { [`messages.${assistantAt}.card.targets`]: targets } : {}) },
            } as UpdateFilter<DesignChatDoc>, revise ? undefined : [{ "item.id": item.id }]);
            return data.note;
          } catch (error) {
            this.#log("design_chat.draw_failed", chatId, error);
            await this.#write(chatId, runId, { $set: { [`messages.${assistantAt}.card.${revise ? "item" : "items.$[item]"}`]: { ...item, status: "failed" } } } as UpdateFilter<DesignChatDoc>, revise ? undefined : [{ "item.id": item.id }]);
            return null;
          }
        }));
        // 카드를 눌러 한 장만 청했을 때는 그린 쪽의 한 문장이 답이다. 말에 답한 경우는 이미 답이 적혀 있다.
        const note = notes.length === 1 ? notes[0] : null;
        if (turn.kind === "draw" && note) await this.#write(chatId, runId, { $set: { [`messages.${assistantAt}.text`]: note } } as UpdateFilter<DesignChatDoc>);
      }
      await this.#end(chatId, runId, assistantAt, await current(), "complete", null);
    } catch (error) {
      this.#log("design_chat.turn_failed", chatId, error);
      await this.#end(chatId, runId, assistantAt, await current(), this.#closing ? "interrupted" : "failed", this.#closing ? INTERRUPTED : error instanceof DesignChatError && error.publicMessage ? error.publicMessage : FAILED).catch(() => undefined);
    } finally {
      clearInterval(heartbeat);
    }
  }

  /**
   * 고치는 호출이 쓰는 출력을 받아, 「지금 있는 글자」까지 온 조각이 늘 때마다 지금 첫 화면에서 바뀌는 자리를 대화에 적는다.
   * 자리는 보여 주는 것일 뿐이다 — 읽다가 실패해도 고치는 일은 그대로 간다.
   */
  #liveTargets(chatId: string, runId: string, assistantAt: number, from: DesignSnippet) {
    let buffer = "";
    let count = 0;
    let written = "";
    let queue: Promise<unknown> = Promise.resolve();
    const push = (delta: string) => {
      buffer += delta;
      try {
        const finds = closedFinds(buffer);
        if (finds.length === count) return;
        count = finds.length;
        const targets = editingTargets(from, finds);
        const key = targets.join("\n");
        if (targets.length === 0 || key === written) return;
        written = key;
        // 쓰는 순서를 지킨다. 늦게 끝난 앞의 쓰기가 뒤의 자리를 덮지 않게 한다.
        queue = queue.then(() => this.#write(chatId, runId, { $set: { [`messages.${assistantAt}.card.targets`]: targets } } as UpdateFilter<DesignChatDoc>)).catch(() => undefined);
      } catch (error) {
        this.#log("design_chat.targets_failed", chatId, error);
      }
    };
    // 공급자가 출력을 처음부터 다시 쓰면 쌓은 것만 버린다. 이미 적은 자리는 둔다.
    const restart = () => { buffer = ""; count = 0; };
    return { push, restart, settled: () => queue };
  }

  #log(event: string, chatId: string, error: unknown): void {
    console.error(JSON.stringify({ level: "error", event, chatId, code: (error as { code?: string }).code ?? null, detail: error instanceof Error ? error.message : String(error) }));
  }

  /** 서버가 내려갈 때 부른다. 이 프로세스가 돌리던 실행을 끊긴 것으로 적는다. 호출이 끝나길 기다리지 않는다. */
  async close(): Promise<void> {
    this.#closing = true;
    await Promise.allSettled([...this.#running].map(async ([runId, { chatId, assistantAt }]) => {
      const row = await this.#rows.findOne({ _id: chatId });
      await this.#end(chatId, runId, assistantAt, row?.messages[assistantAt] ?? null, "interrupted", INTERRUPTED);
    }));
  }

  /** 테스트가 뒤에서 도는 실행이 끝나길 기다릴 때 쓴다. */
  async settled(): Promise<void> {
    await Promise.allSettled([...this.#tasks]);
  }
}
