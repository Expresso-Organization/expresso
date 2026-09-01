import { LayoutError, parseStoredSpec } from "./public.js";
export { LayoutError, parseStoredSpec } from "./public.js";
import { LayoutCandidateListResponseSchema } from "@expresso/contracts";
import type { SqlTag, JSONValue } from "../../platform/legacy-mysql.js";

import { LayoutRemixError, type LayoutRemixer } from "./remixer.js";
import { type ConsentApi } from "../consent/index.js";

/**
 * 03 지면 고르기.
 *
 * 후보는 추출 한 번에 3안이 한꺼번에 쌓인다(§8.3). 여기서는 **가장 최근 배치**만
 * 읽는다 — 지난 생성의 후보를 다시 꺼내 고르는 화면이 아니다.
 */

interface LayoutRow {
  id: string;
  portfolio_id: string;
  seed_template_id: string | null;
  spec: unknown;
  prompt_version: number;
  edited_by: "ai" | "user";
  order_no: number;
  selected: boolean;
  instruction: string | null;
  created_at: Date;
}

export class LayoutService {
  readonly #sql: SqlTag;
  readonly #remixer: LayoutRemixer | null;
  readonly #consent: ConsentApi | null;

  constructor(sql: SqlTag, remixer?: LayoutRemixer | null, consent?: ConsentApi | null) {
    this.#sql = sql;
    this.#remixer = remixer ?? null;
    this.#consent = consent ?? null;
  }

  /**
   * §8.3 「지면 변형」 — 한 문장으로 지금 지면을 고친다.
   *
   * 고친 지면은 **지금 배치에 한 칸 더 붙는다.** 새 배치를 열면 03이 옛 후보를
   * 더 이상 보여주지 못해 되돌릴 방법이 없어진다 — 변형은 후보를 버리는 일이
   * 아니라 하나 더 만드는 일이다.
   *
   * 사용자가 개별 요소에 준 값은 손대지 않는다 — 렌더가
   * `LayoutSpec ∘ block.style` 순서로 합성한다(P3).
   */
  async remix(userId: string, portfolioId: string, instruction: string) {
    if (!this.#remixer) throw new LayoutError(503, "layout remix is unavailable");
    await this.#consent?.require(userId, "style_remix");

    const current = (await this.#sql<LayoutRow[]>`
      select id, portfolio_id, seed_template_id, spec, prompt_version, edited_by,
             order_no, selected, instruction, created_at
      from layout_spec
      where user_id = ${userId} and portfolio_id = ${portfolioId} and selected
    `)[0];
    if (!current) throw new LayoutError(409, "portfolio has no layout to remix");
    const spec = parseStoredSpec(current.spec);
    if (!spec) throw new LayoutError(409, "stored layout is no longer valid");

    // 스펙이 가리키는 순서 그대로 섹션을 준다. 모델은 번호로만 가리킨다.
    const titles = new Map((await this.#sql<{ id: string; title: string | null }[]>`
      select portfolio_section.id, recipe_section.title
      from portfolio_section
      left join recipe_section on recipe_section.id = portfolio_section.recipe_section_id
        and recipe_section.user_id = portfolio_section.user_id
      where portfolio_section.user_id = ${userId}
        and portfolio_section.portfolio_id = ${portfolioId}
    `).map(({ id, title }) => [id, title ?? ""]));

    // 블록도 번호로 오간다. 스펙의 섹션 순서 · 섹션 안 순서를 그대로 센다.
    const blockRows = await this.#sql<{ id: string; portfolio_section_id: string }[]>`
      select block.id, block.portfolio_section_id
      from block
      join portfolio_section on portfolio_section.id = block.portfolio_section_id
        and portfolio_section.user_id = block.user_id
      where block.user_id = ${userId} and portfolio_section.portfolio_id = ${portfolioId}
      order by portfolio_section.order_no, block.order_no, block.id
    `;
    const blockIds = spec.sections.flatMap(({ portfolioSectionId }) =>
      blockRows
        .filter((row) => row.portfolio_section_id === portfolioSectionId)
        .map(({ id }) => id));

    let remixed;
    try {
      remixed = await this.#remixer.remix({
        instruction,
        current: spec,
        sections: spec.sections.map(({ portfolioSectionId }) => ({
          portfolioSectionId,
          title: titles.get(portfolioSectionId) ?? "",
        })),
        blockIds,
      });
    } catch (error) {
      // 계약이 못 고친 것은 사용자에게 말이 되게 돌려준다.
      if (error instanceof LayoutRemixError) throw new LayoutError(422, error.message);
      throw error;
    }

    await this.#sql.begin(async (transaction) => {
      const batch = (await transaction<{ batch_id: string; next_order: number }[]>`
        select batch_id, max(order_no) + 1 as next_order
        from layout_spec
        where user_id = ${userId} and portfolio_id = ${portfolioId}
          and batch_id = (select batch_id from layout_spec where id = ${current.id})
        group by batch_id
      `)[0];
      if (!batch) throw new LayoutError(409, "portfolio has no layout to remix");
      await transaction`
        update layout_spec set selected = false
        where user_id = ${userId} and portfolio_id = ${portfolioId} and selected
      `;
      await transaction`
        insert into layout_spec (
          user_id, portfolio_id, batch_id, spec, prompt_version,
          order_no, selected, instruction
        ) values (
          ${userId}, ${portfolioId}, ${batch.batch_id},
          ${transaction.json(remixed as unknown as JSONValue)},
          ${current.prompt_version}, ${batch.next_order}, true, ${instruction}
        )
      `;
    });
    return this.candidates(userId, portfolioId);
  }

  async candidates(userId: string, portfolioId: string) {
    const owned = await this.#sql<{ id: string }[]>`
      select id from portfolio where user_id = ${userId} and id = ${portfolioId}
    `;
    if (!owned[0]) throw new LayoutError(404, "portfolio not found");

    const rows = await this.#sql<LayoutRow[]>`
      select id, portfolio_id, seed_template_id, spec, prompt_version, edited_by,
             order_no, selected, instruction, created_at
      from layout_spec
      where user_id = ${userId} and portfolio_id = ${portfolioId}
        and batch_id = (
          select batch_id from layout_spec
          where user_id = ${userId} and portfolio_id = ${portfolioId}
          order by created_at desc, order_no desc limit 1
        )
      order by order_no, id
    `;

    return LayoutCandidateListResponseSchema.parse({
      data: {
        selectedId: rows.find(({ selected }) => selected)?.id ?? null,
        candidates: rows.map(mapRow),
      },
    });
  }

  /** 고른 지면을 붙인다. 남의 지면이나 다른 포트폴리오의 지면은 붙지 않는다. */
  async select(userId: string, portfolioId: string, layoutId: string) {
    await this.#sql.begin(async (transaction) => {
      const target = await transaction<{ id: string }[]>`
        select id from layout_spec
        where id = ${layoutId} and user_id = ${userId} and portfolio_id = ${portfolioId}
        for update
      `;
      if (!target[0]) throw new LayoutError(404, "layout candidate not found");
      // 한 포트폴리오에 하나만 선다. 부분 유일 인덱스가 걸려 있어 두 문장으로 나눈다.
      await transaction`
        update layout_spec set selected = false
        where user_id = ${userId} and portfolio_id = ${portfolioId} and selected
      `;
      await transaction`update layout_spec set selected = true where id = ${layoutId}`;
    });
    return this.candidates(userId, portfolioId);
  }
}

function mapRow(row: LayoutRow) {
  return {
    id: row.id,
    portfolioId: row.portfolio_id,
    seedTemplateId: row.seed_template_id,
    spec: row.spec,
    promptVersion: row.prompt_version,
    editedBy: row.edited_by,
    orderNo: row.order_no,
    instruction: row.instruction,
    createdAt: row.created_at.toISOString(),
  };
}
