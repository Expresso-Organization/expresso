import {
  PortfolioDetailSchema,
  PortfolioListResponseSchema,
  PortfolioRevisionsResponseSchema,
  type ListPortfolioRevisionsQuery,
  type ListPortfoliosQuery,
  type PortfolioBlock,
} from "@expresso/contracts";
import { mongoCollections, type PortfolioDoc } from "@expresso/database";

import type { MongoContext } from "../../platform/mongodb.js";
import { parseStoredSpec } from "../layout/index.js";
import { PortfolioReadError } from "./public.js";

interface Cursor { at: string; id: string }
const CHECKPOINT_LABEL = { initial_generation: "AI 추출 직후", edit: "직접 편집 시작 전", manual: "직접 만든 지점" } as const;

function encodeCursor(value: Cursor): string { return Buffer.from(JSON.stringify(value), "utf8").toString("base64url"); }
function decodeCursor(value: string | undefined): Cursor | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as Partial<Cursor>;
    if (typeof parsed.at === "string" && typeof parsed.id === "string") return { at: parsed.at, id: parsed.id };
  } catch { /* 아래에서 같은 계약 오류로 바꿉니다. */ }
  throw new PortfolioReadError(400, "invalid cursor");
}

export class MongoPortfolioReadService {
  constructor(readonly context: MongoContext) {}

  async #summary(portfolio: PortfolioDoc) {
    const db = mongoCollections(this.context.db);
    const [template, sections, deployment] = await Promise.all([
      db.templates.findOne({ _id: portfolio.templateId }),
      db.portfolioSections.find({ userId: portfolio.userId, portfolioId: portfolio._id }).toArray(),
      portfolio.currentDeploymentId ? db.deployments.findOne({ _id: portfolio.currentDeploymentId, userId: portfolio.userId }) : null,
    ]);
    const blockCount = await db.blocks.countDocuments({ userId: portfolio.userId, portfolioSectionId: { $in: sections.map(({ _id }) => _id) } });
    return {
      id: portfolio._id, brewId: portfolio.brewId, title: portfolio.title, status: portfolio.status,
      templateCode: template?.code ?? "", templateName: template?.name ?? "",
      sectionCount: sections.length, visibleSectionCount: sections.filter(({ visible }) => visible).length,
      blockCount, createdAt: portfolio.createdAt.toISOString(), updatedAt: portfolio.updatedAt.toISOString(),
      deployment: deployment ? {
        id: deployment._id, version: deployment.version, subdomain: deployment.subdomain,
        customDomain: deployment.customDomain ?? null, seoIndexable: deployment.seoIndexable,
        contactVisibility: deployment.contactVisibility,
        publishedAt: deployment.publishedAt?.toISOString() ?? null,
        hasUnpublishedChanges: deployment.hasUnpublishedChanges,
      } : null,
    };
  }

  async list(userId: string, query: ListPortfoliosQuery) {
    const cursor = decodeCursor(query.cursor);
    const filter = {
      userId,
      ...(query.status ? { status: query.status } : {}),
      ...(cursor ? { $or: [{ updatedAt: { $lt: new Date(cursor.at) } }, { updatedAt: new Date(cursor.at), _id: { $lt: cursor.id } }] } : {}),
    };
    const rows = await mongoCollections(this.context.db).portfolios.find(filter).sort({ updatedAt: -1, _id: -1 }).limit(query.limit + 1).toArray();
    const hasNextPage = rows.length > query.limit; const page = rows.slice(0, query.limit); const last = page.at(-1);
    return PortfolioListResponseSchema.parse({
      data: await Promise.all(page.map((row) => this.#summary(row))),
      page: { hasNextPage, nextCursor: hasNextPage && last ? encodeCursor({ at: last.updatedAt.toISOString(), id: last._id }) : null },
    });
  }

  async get(userId: string, portfolioId: string) {
    const db = mongoCollections(this.context.db);
    const portfolio = await db.portfolios.findOne({ _id: portfolioId, userId });
    if (!portfolio) throw new PortfolioReadError(404, "portfolio not found");
    const [summary, template, sections, selected] = await Promise.all([
      this.#summary(portfolio), db.templates.findOne({ _id: portfolio.templateId }),
      db.portfolioSections.find({ userId, portfolioId }).sort({ orderNo: 1, _id: 1 }).toArray(),
      db.layoutSpecs.findOne({ userId, portfolioId, selected: true }),
    ]);
    const blocks = await db.blocks.find({ userId, portfolioSectionId: { $in: sections.map(({ _id }) => _id) } }).sort({ orderNo: 1, _id: 1 }).toArray();
    const recipeSectionIds = sections.flatMap(({ recipeSectionId }) => recipeSectionId ? [recipeSectionId] : []);
    const recipeSections = await db.recipeSections.find({ userId, _id: { $in: recipeSectionIds } }).toArray();
    const titleById = new Map(recipeSections.map((row) => [row._id, row.title]));
    return PortfolioDetailSchema.parse({
      ...summary, templateStyle: template?.style ?? {}, layout: parseStoredSpec(selected?.spec),
      sections: sections.map((section) => ({
        id: section._id, orderNo: section.orderNo,
        title: section.recipeSectionId ? titleById.get(section.recipeSectionId) ?? null : null,
        recipeSectionId: section.recipeSectionId ?? null, visible: section.visible,
        hiddenReason: section.hiddenReason ?? null,
        blocks: blocks.filter(({ portfolioSectionId: id }) => id === section._id).map((block): PortfolioBlock => ({
          id: block._id, orderNo: block.orderNo, kind: block.kind, content: block.content,
          style: block.style, sourceRecordId: block.sourceRecordId ?? null,
          syncState: block.syncState, locked: block.locked,
        })),
      })),
    });
  }

  async revisions(userId: string, portfolioId: string, query: ListPortfolioRevisionsQuery) {
    const db = mongoCollections(this.context.db); const cursor = decodeCursor(query.cursor);
    if (!await db.portfolios.findOne({ _id: portfolioId, userId })) throw new PortfolioReadError(404, "portfolio not found");
    const filter = {
      userId, portfolioId, ...(query.actor ? { actor: query.actor } : {}),
      ...(cursor ? { $or: [{ createdAt: { $lt: new Date(cursor.at) } }, { createdAt: new Date(cursor.at), _id: { $lt: cursor.id } }] } : {}),
    };
    const [rows, checkpoints] = await Promise.all([
      db.revisions.find(filter).sort({ createdAt: -1, _id: -1 }).limit(query.limit + 1).toArray(),
      db.portfolioSnapshots.find({ userId, portfolioId }).sort({ createdAt: -1, _id: -1 }).limit(10).toArray(),
    ]);
    const hasNextPage = rows.length > query.limit; const page = rows.slice(0, query.limit); const last = page.at(-1);
    return PortfolioRevisionsResponseSchema.parse({ data: {
      revisions: page.map((row, index) => ({ id: row._id, actor: row.actor, changeKind: row.changeKind, summary: row.summary, blockId: row.blockId ?? null, createdAt: row.createdAt.toISOString(), isCurrent: !cursor && index === 0 })),
      checkpoints: checkpoints.map((row) => ({ id: row._id, kind: row.kind, label: CHECKPOINT_LABEL[row.kind], createdAt: row.createdAt.toISOString() })),
    }, page: { hasNextPage, nextCursor: hasNextPage && last ? encodeCursor({ at: last.createdAt.toISOString(), id: last._id }) : null } });
  }
}
