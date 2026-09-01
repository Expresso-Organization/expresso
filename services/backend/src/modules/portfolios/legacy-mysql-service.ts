import { PortfolioReadError } from "./public.js";
export { PortfolioReadError } from "./public.js";
import {
  PortfolioDetailSchema,
  PortfolioListResponseSchema,
  PortfolioRevisionsResponseSchema,
  PortfolioSummarySchema,
  type ListPortfolioRevisionsQuery,
  type ListPortfoliosQuery,
  type PortfolioBlock,
  type PortfolioSection,
} from "@expresso/contracts";
import type { SqlTag } from "../../platform/legacy-mysql.js";

import { parseStoredSpec } from "../layout/index.js";

interface SummaryRow {
  id: string;
  brew_id: string;
  title: string;
  status: "draft" | "published" | "unlisted";
  template_code: string;
  template_name: string;
  section_count: number;
  visible_section_count: number;
  block_count: number;
  created_at: Date | string;
  updated_at: Date | string;
  deployment_id: string | null;
  deployment_version: number | null;
  subdomain: string | null;
  custom_domain: string | null;
  seo_indexable: boolean | null;
  contact_visibility: "public" | "on_request" | "hidden" | null;
  published_at: Date | string | null;
  has_unpublished_changes: boolean | null;
}

/**
 * 커서에 쓰는 정렬 키의 원문. JS `Date`는 밀리초까지만 담는데 `timestamptz`는
 * 마이크로초를 쓴다 — 잘린 값을 커서로 돌려주면 그 행이 다음 장에 또 나온다.
 */
interface CursorKeyRow {
  cursor_key: string;
}

interface SectionRow {
  id: string;
  order_no: number;
  title: string | null;
  recipe_section_id: string | null;
  visible: boolean;
  hidden_reason: string | null;
}

interface BlockRow {
  id: string;
  order_no: number;
  portfolio_section_id: string;
  kind: PortfolioBlock["kind"];
  content: Record<string, unknown>;
  style: Record<string, unknown>;
  source_record_id: string | null;
  sync_state: PortfolioBlock["syncState"];
  locked: boolean;
}

interface RevisionRow {
  id: string;
  actor: "user" | "ai";
  change_kind: "edit" | "revert" | "restore";
  summary: string;
  block_id: string | null;
  created_at: Date | string;
}

interface CheckpointRow {
  id: string;
  kind: "initial_generation" | "edit" | "manual";
  created_at: Date | string;
}

interface Cursor {
  at: string;
  id: string;
}

function iso(value: Date | string): string {
  return new Date(value).toISOString();
}

function encodeCursor(cursor: Cursor): string {
  return Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url");
}

/**
 * 커서 값은 질의에서 ``를 한 번 거쳐 넘긴다. postgres.js는 파라미터 뒤의
 * ``를 보고 문자열을 `Date`로 바꿔 보내는데, `Date`는 밀리초까지만
 * 담아 마이크로초가 잘린다. 잘린 값으로 seek하면 방금 읽은 행이 또 나온다.
 */
function decodeCursor(value: string | undefined): Cursor | null {
  if (!value) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
  } catch {
    throw new PortfolioReadError(400, "invalid cursor");
  }
  const cursor = parsed as Partial<Cursor>;
  if (typeof cursor?.at !== "string" || typeof cursor.id !== "string") {
    throw new PortfolioReadError(400, "invalid cursor");
  }
  return { at: cursor.at, id: cursor.id };
}

/** 체크포인트 라벨은 화면 정의서 04c의 확정 문구다. */
const CHECKPOINT_LABEL = {
  initial_generation: "AI 추출 직후",
  edit: "직접 편집 시작 전",
  manual: "직접 만든 지점",
} as const;

function mapSummary(row: SummaryRow) {
  return {
    id: row.id,
    brewId: row.brew_id,
    title: row.title,
    status: row.status,
    templateCode: row.template_code,
    templateName: row.template_name,
    sectionCount: Number(row.section_count),
    visibleSectionCount: Number(row.visible_section_count),
    blockCount: Number(row.block_count),
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
    deployment: row.deployment_id
      ? {
          id: row.deployment_id,
          version: Number(row.deployment_version),
          subdomain: row.subdomain!,
          customDomain: row.custom_domain,
          seoIndexable: row.seo_indexable!,
          contactVisibility: row.contact_visibility!,
          publishedAt: row.published_at ? iso(row.published_at) : null,
          hasUnpublishedChanges: row.has_unpublished_changes!,
        }
      : null,
  };
}

export class PortfolioReadService {
  readonly #sql: SqlTag;

  constructor(sql: SqlTag) {
    this.#sql = sql;
  }

  /**
   * 공통 select. 섹션·블록 수는 상관 서브쿼리로 세고, 현재 배포는
   * `portfolio.current_deployment_id`를 통해서만 따라간다 — 배포 이력 중
   * 아무 행이나 붙지 않게.
   */
  #summarySelect(userId: string) {
    const sql = this.#sql;
    return sql`
      select
        portfolio.updated_at as cursor_key,
        portfolio.id,
        portfolio.brew_id,
        portfolio.title,
        portfolio.status,
        template.code as template_code,
        template.name as template_name,
        portfolio.created_at,
        portfolio.updated_at,
        (
          select count(*) from portfolio_section
          where portfolio_section.user_id = portfolio.user_id
            and portfolio_section.portfolio_id = portfolio.id
        ) as section_count,
        (
          select count(*) from portfolio_section
          where portfolio_section.user_id = portfolio.user_id
            and portfolio_section.portfolio_id = portfolio.id
            and portfolio_section.visible
        ) as visible_section_count,
        (
          select count(*)
          from block
          join portfolio_section on portfolio_section.id = block.portfolio_section_id
            and portfolio_section.user_id = block.user_id
          where block.user_id = portfolio.user_id
            and portfolio_section.portfolio_id = portfolio.id
        ) as block_count,
        deployment.id as deployment_id,
        deployment.version as deployment_version,
        deployment.subdomain,
        deployment.custom_domain,
        deployment.seo_indexable,
        deployment.contact_visibility,
        deployment.published_at,
        deployment.has_unpublished_changes
      from portfolio
      join template on template.id = portfolio.template_id
      left join deployment on deployment.id = portfolio.current_deployment_id
        and deployment.user_id = portfolio.user_id
      where portfolio.user_id = ${userId}
    `;
  }

  /** 00 홈 카드와 사이드바가 쓰는 목록. 최근 편집 순. */
  async list(userId: string, query: ListPortfoliosQuery) {
    const sql = this.#sql;
    const cursor = decodeCursor(query.cursor);

    const rows = await sql<(SummaryRow & CursorKeyRow)[]>`
      ${this.#summarySelect(userId)}
        ${query.status ? sql`and portfolio.status = ${query.status}` : sql``}
        ${cursor
          ? sql`and (portfolio.updated_at, portfolio.id) < (${cursor.at}, ${cursor.id})`
          : sql``}
      order by portfolio.updated_at desc, portfolio.id desc
      limit ${query.limit + 1}
    `;

    const hasNextPage = rows.length > query.limit;
    const page = rows.slice(0, query.limit);
    const last = page.at(-1);

    return PortfolioListResponseSchema.parse({
      data: page.map(mapSummary),
      page: {
        hasNextPage,
        nextCursor:
          hasNextPage && last
            ? encodeCursor({ at: last.cursor_key, id: last.id })
            : null,
      },
    });
  }

  /** 04 에디터가 캔버스를 그리는 데 쓰는 상세. 섹션과 블록을 모두 담는다. */
  async get(userId: string, portfolioId: string) {
    const sql = this.#sql;

    const rows = await sql<(SummaryRow & { template_style: Record<string, unknown> })[]>`
      ${this.#summarySelect(userId)}
        and portfolio.id = ${portfolioId}
    `;
    const portfolio = rows[0];
    if (!portfolio) throw new PortfolioReadError(404, "portfolio not found");

    const [templates, sections, blocks] = await Promise.all([
      sql<{ style: Record<string, unknown>; spec: unknown }[]>`
        select template.style, layout_spec.spec
        from portfolio
        join template on template.id = portfolio.template_id
        left join layout_spec
          on layout_spec.portfolio_id = portfolio.id
          and layout_spec.user_id = portfolio.user_id
          and layout_spec.selected
        where portfolio.user_id = ${userId} and portfolio.id = ${portfolioId}
      `,
      sql<SectionRow[]>`
        select
          portfolio_section.id,
          portfolio_section.order_no,
          recipe_section.title,
          portfolio_section.recipe_section_id,
          portfolio_section.visible,
          portfolio_section.hidden_reason
        from portfolio_section
        left join recipe_section
          on recipe_section.id = portfolio_section.recipe_section_id
          and recipe_section.user_id = portfolio_section.user_id
        where portfolio_section.user_id = ${userId}
          and portfolio_section.portfolio_id = ${portfolioId}
        order by portfolio_section.order_no, portfolio_section.id
      `,
      sql<BlockRow[]>`
        select
          block.id,
          block.order_no,
          block.portfolio_section_id,
          block.kind,
          block.content,
          block.style,
          block.source_record_id,
          block.sync_state,
          block.locked
        from block
        join portfolio_section on portfolio_section.id = block.portfolio_section_id
          and portfolio_section.user_id = block.user_id
        where block.user_id = ${userId}
          and portfolio_section.portfolio_id = ${portfolioId}
        order by portfolio_section.order_no, block.order_no, block.id
      `,
    ]);

    const blocksBySection = new Map<string, PortfolioBlock[]>();
    for (const block of blocks) {
      const bucket = blocksBySection.get(block.portfolio_section_id) ?? [];
      bucket.push({
        id: block.id,
        orderNo: block.order_no,
        kind: block.kind,
        content: block.content,
        style: block.style,
        sourceRecordId: block.source_record_id,
        syncState: block.sync_state,
        locked: block.locked,
      });
      blocksBySection.set(block.portfolio_section_id, bucket);
    }

    const mappedSections: PortfolioSection[] = sections.map((section) => ({
      id: section.id,
      orderNo: section.order_no,
      title: section.title,
      recipeSectionId: section.recipe_section_id,
      visible: section.visible,
      hiddenReason: section.hidden_reason,
      blocks: blocksBySection.get(section.id) ?? [],
    }));

    return PortfolioDetailSchema.parse({
      ...mapSummary(portfolio),
      templateStyle: templates[0]?.style ?? {},
      // 고른 지면. 없으면 화면이 기본 배치로 그린다.
      layout: parseStoredSpec(templates[0]?.spec),
      sections: mappedSections,
    });
  }

  /** 04c 변경 이력과 되돌릴 수 있는 지점. */
  async revisions(
    userId: string,
    portfolioId: string,
    query: ListPortfolioRevisionsQuery,
  ) {
    const sql = this.#sql;
    const cursor = decodeCursor(query.cursor);

    const owned = await sql<{ id: string }[]>`
      select id from portfolio where user_id = ${userId} and id = ${portfolioId}
    `;
    if (!owned[0]) throw new PortfolioReadError(404, "portfolio not found");

    const [rows, checkpoints] = await Promise.all([
      sql<(RevisionRow & CursorKeyRow)[]>`
        select id, actor, change_kind, summary, block_id, created_at,
          created_at as cursor_key
        from revision
        where user_id = ${userId}
          and portfolio_id = ${portfolioId}
          ${query.actor ? sql`and actor = ${query.actor}` : sql``}
          ${cursor
            ? sql`and (created_at, id) < (${cursor.at}, ${cursor.id})`
            : sql``}
        order by created_at desc, id desc
        limit ${query.limit + 1}
      `,
      sql<CheckpointRow[]>`
        select id, kind, created_at
        from portfolio_snapshot
        where user_id = ${userId} and portfolio_id = ${portfolioId}
        order by created_at desc, id desc
        limit 10
      `,
    ]);

    const hasNextPage = rows.length > query.limit;
    const page = rows.slice(0, query.limit);
    const last = page.at(-1);

    return PortfolioRevisionsResponseSchema.parse({
      data: {
        // 최신 항목만 "지금 보는 상태"다. 첫 페이지에서만 표시한다.
        revisions: page.map((row, index) => ({
          id: row.id,
          actor: row.actor,
          changeKind: row.change_kind,
          summary: row.summary,
          blockId: row.block_id,
          createdAt: iso(row.created_at),
          isCurrent: cursor === null && index === 0,
        })),
        checkpoints: checkpoints.map((checkpoint) => ({
          id: checkpoint.id,
          kind: checkpoint.kind,
          label: CHECKPOINT_LABEL[checkpoint.kind],
          createdAt: iso(checkpoint.created_at),
        })),
      },
      page: {
        hasNextPage,
        nextCursor:
          hasNextPage && last
            ? encodeCursor({ at: last.cursor_key, id: last.id })
            : null,
      },
    });
  }
}

export { PortfolioSummarySchema };
