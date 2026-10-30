import { randomUUID } from "node:crypto";
import { Binary } from "mongodb";
import { describe, expect, it } from "vitest";
import { encodeDocumentAsYUpdate, markdownToCareerDocument, type CareerDocument } from "@expresso/editor";
import type { MongoContext } from "../../platform/mongodb.js";
import { CanonicalCareerReadService } from "../career/index.js";
import { PageService } from "./service.js";
import type { PageGenerationContext } from "./generator.js";

type Row = Record<string, unknown>;

// 실제 서비스와 Yjs 투영을 쓰고 Mongo 네트워크 읽기만 메모리 fixture로 대체합니다.
function readOnlyContext(rows: Record<string, Row[]>): MongoContext {
  function matches(row: Row, filter: Row): boolean {
    return Object.entries(filter).every(([key, wanted]) => {
      if (key === "$or") return (wanted as Row[]).some(branch => matches(row, branch));
      const actual = row[key];
      if (wanted && typeof wanted === "object" && !Array.isArray(wanted)) {
        const operator = wanted as Row;
        if ("$in" in operator) return (operator.$in as unknown[]).includes(actual);
        if ("$ne" in operator) return actual !== operator.$ne;
        if ("$gt" in operator) return Number(actual) > Number(operator.$gt);
      }
      return actual === wanted;
    });
  }
  const db = {
    collection(name: string) {
      function find(filter: Row = {}) {
        let found = (rows[name] ?? []).filter(row => matches(row, filter));
        const cursor = {
          sort(order: Record<string, number>) {
            found = [...found].sort((left, right) => {
              for (const [key, direction] of Object.entries(order)) {
                if (left[key] === right[key]) continue;
                return (Number(left[key]) < Number(right[key]) ? -1 : 1) * direction;
              }
              return 0;
            });
            return cursor;
          },
          limit(count: number) { found = found.slice(0, count); return cursor; },
          async toArray() { return found; },
          async next() { return found[0] ?? null; },
        };
        return cursor;
      }
      return { find, async findOne(filter: Row) { return find(filter).next(); } };
    },
  };
  return { db } as unknown as MongoContext;
}

function scenario(canonical = true) {
  const userId = randomUUID(), other = randomUUID(), portfolioId = randomUUID(), recipeId = randomUUID();
  const brewId = randomUUID(), categoryId = randomUUID(), recordId = randomUUID(), sectionId = randomUUID();
  const native = randomUUID(), nested = randomUUID(), mediaMarkdown = randomUUID(), legacy = randomUUID(), stale = randomUUID();
  const foreign = randomUUID(), unselected = randomUUID(), empty = randomUUID(), file = randomUUID();
  const now = new Date();
  const record = {
    _id: recordId, userId, categoryId, title: "경험 근거", status: "organized", origin: "manual",
    properties: {}, propertyValues: [], bodyMd: `이전 본문\n\n![이전 이미지](/v1/media/${stale})`,
    version: 1, createdAt: now, updatedAt: now, deletedAt: null,
  };
  const initial = markdownToCareerDocument(record.bodyMd);
  const current: CareerDocument = {
    schemaVersion: 1, type: "doc", content: [
      { id: initial.content[0]!.id, type: "paragraph", attrs: {}, text: [{ text: "현재 Yjs 경험 본문" }] },
      { id: randomUUID(), type: "image", attrs: { mediaId: native, alt: "현재 경험 이미지" } },
      { id: randomUUID(), type: "image", attrs: { mediaId: mediaMarkdown, alt: "Markdown 이미지", sourceMarkdown: `![Markdown 이미지](media:${mediaMarkdown})` } },
      { id: randomUUID(), type: "artifactGroup", attrs: {}, content: [
        { id: randomUUID(), type: "image", attrs: { mediaId: nested, alt: "중첩 이미지" } },
      ] },
      { id: randomUUID(), type: "paragraph", attrs: {}, text: [{ text: `![이전 형식](/v1/media/${legacy})` }] },
      { id: randomUUID(), type: "image", attrs: { mediaId: foreign } },
      { id: randomUUID(), type: "image", attrs: { mediaId: empty } },
      { id: randomUUID(), type: "file", attrs: { mediaId: file } },
    ],
  };
  const rows: Record<string, Row[]> = {
    portfolios: [{ _id: portfolioId, userId, brewId, templateId: randomUUID(), styleOverrides: {} }],
    recipes: [{ _id: recipeId, userId, brewId, version: 1 }],
    recipe_sections: [{ _id: sectionId, userId, recipeId, title: "경험", purpose: "근거", context: {}, targetLength: 900, orderNo: 0 }],
    recipe_evidence_paths: [0, 1].map(() => ({ _id: randomUUID(), userId, recipeId, sourceType: "record", sourceId: recordId, sourceLabel: "경험 근거" })),
    career_categories: [{ _id: categoryId, userId, key: "experience", isSystem: false, propertySchemaV2: [], schemaVersion: 1, version: 1 }],
    career_records: [record, { ...record, _id: randomUUID(), bodyMd: `![미선택](/v1/media/${unselected})` }, { ...record, _id: randomUUID(), userId: other }],
    users: [{ _id: userId, displayName: "작성자", deletionRequestedAt: null }],
    portfolio_sections: [{ _id: sectionId, userId, portfolioId }],
    blocks: [{ _id: randomUUID(), userId, portfolioSectionId: sectionId, kind: "media", content: { assetId: native, alt: "직접 놓은 이미지", frame: "none", width: 640, height: 480, variants: [] } }],
    media_assets: [native, nested, mediaMarkdown, legacy, stale, foreign, unselected, empty, file].map(id => ({
      _id: id, userId: id === foreign ? other : userId, storageKey: id === empty ? "" : `assets/${id}`, width: 640, height: 480,
    })),
    ...(canonical ? {
      career_document_snapshots: [{ recordId, userId, documentVersion: 0, serverSequence: 0, content: initial }],
      career_document_updates: [{ recordId, userId, serverSequence: 1, compactedAt: null, update: new Binary(Buffer.from(encodeDocumentAsYUpdate(current, [encodeDocumentAsYUpdate(initial)]))) }],
    } : {}),
  };
  const context = readOnlyContext(rows);
  const service = new PageService(context, null, null, new CanonicalCareerReadService(context));
  async function capture() {
    let captured: PageGenerationContext | undefined;
    await expect(service.generate(userId, portfolioId, { async generate(input) { captured = input; throw new Error("context captured"); } })).rejects.toThrow("context captured");
    return captured!;
  }
  return { capture, service, rows, userId, other, portfolioId, recordId, sectionId, native, nested, mediaMarkdown, legacy, stale, foreign, unselected, empty, file };
}

describe("Career 근거의 지면 이미지 호환", () => {
  it("프로젝트 밖 선택된 경험의 현재 Yjs 이미지와 본문을 지면에 전달한다", async () => {
    const fixture = scenario(), before = JSON.stringify(fixture.rows), context = await fixture.capture();
    expect(context.evidence).toHaveLength(1);
    expect(context.evidence[0]).toMatchObject({ id: fixture.recordId, text: expect.stringContaining("현재 Yjs 경험 본문") });
    expect(context.evidence[0]!.text).not.toContain("이전 본문");
    expect(context.media).toEqual(expect.arrayContaining([
      expect.objectContaining({ src: `/v1/media/${fixture.native}`, alt: "현재 경험 이미지" }),
      expect.objectContaining({ src: `/v1/media/${fixture.nested}`, alt: "중첩 이미지" }),
      expect.objectContaining({ src: `/v1/media/${fixture.mediaMarkdown}`, alt: "Markdown 이미지" }),
    ]));
    expect(context.author?.name).toBe("작성자");
    expect(context.sections[0]?.id).toBe(fixture.sectionId);
    expect(JSON.stringify(fixture.rows)).toBe(before);
  });

  it("현재 근거와 직접 놓은 이미지를 합치고 중복·미선택·외부 소유 이미지와 낡은 본문을 제외한다", async () => {
    const fixture = scenario(), context = await fixture.capture();
    expect(context.media.map(item => item.src).sort()).toEqual([fixture.native, fixture.nested, fixture.mediaMarkdown, fixture.legacy].map(id => `/v1/media/${id}`).sort());
  });

  it("snapshot이 없는 기존 기록의 URL 이미지를 유지한다", async () => {
    const fixture = scenario(false), context = await fixture.capture();
    expect(context.evidence[0]!.text).toContain("이전 본문");
    expect(context.media.map(item => item.src).sort()).toEqual([fixture.stale, fixture.native].map(id => `/v1/media/${id}`).sort());
  });

  it("이전 본문에 불완전한 블록이 있어도 URL 이미지를 유지한다", async () => {
    const fixture = scenario(false), record = fixture.rows.career_records![0]!;
    record.bodyMd = `${record.bodyMd}\n\n\`\`\`expresso-block\n${JSON.stringify({ type: "futureBlock" })}\n\`\`\``;
    const context = await fixture.capture();
    expect(context.media.map(item => item.src).sort()).toEqual([fixture.stale, fixture.native].map(id => `/v1/media/${id}`).sort());
  });

  it("다른 소유자는 포트폴리오 근거를 생성할 수 없다", async () => {
    const fixture = scenario();
    await expect(fixture.service.generate(fixture.other, fixture.portfolioId, { async generate() { throw new Error("foreign generator called"); } })).rejects.toMatchObject({ statusCode: 404 });
  });
});
