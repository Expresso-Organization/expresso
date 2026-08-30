import {
  DesignSelectionSchema,
  DesignStyleOverridesSchema,
  type DesignSelection,
  type SaveDesignSelection,
} from "@expresso/contracts";
import type { SqlTag } from "../../platform/mysql.js";
import { catalogEntries } from "./catalog.js";

export class DesignSystemError extends Error {
  readonly statusCode: number;
  constructor(statusCode: number, message: string) {
    super(message);
    this.statusCode = statusCode;
  }
}

export class DesignSystemService {
  readonly #sql: SqlTag;
  constructor(sql: SqlTag) {
    this.#sql = sql;
  }
  list() {
    return catalogEntries().map(({ item }) => item);
  }
  get(id: string) {
    const found = catalogEntries().find(
      ({ item }) => item.designSystemId === id,
    );
    if (!found) throw new DesignSystemError(404, "design system not found");
    return found.item;
  }
  getRevision(id: string) {
    const found = catalogEntries().find(
      ({ revision }) => revision.revisionId === id,
    );
    if (!found)
      throw new DesignSystemError(404, "design system revision not found");
    return found.revision;
  }
  async selectForBrew(
    userId: string,
    brewId: string,
    input: SaveDesignSelection,
  ): Promise<DesignSelection> {
    const revision = this.getRevision(input.revisionId);
    const overrides = DesignStyleOverridesSchema.parse(input.overrides ?? {});
    const lock = revision.referenceLock;
    const rows = await this.#sql<
      { id: string }[]
    >`select id from brew where id = ${brewId} and user_id = ${userId}`;
    if (!rows[0]) throw new DesignSystemError(404, "brew not found");
    const selectedAt = new Date();
    await this
      .#sql`update brew set design_system_revision_id = ${revision.revisionId}, reference_lock_snapshot = ${this.#sql.json(lock)}, design_style_overrides = ${this.#sql.json(overrides)}, design_selected_at = ${selectedAt}, updated_at = ${selectedAt} where id = ${brewId} and user_id = ${userId}`;
    return DesignSelectionSchema.parse({
      designSystemRevisionId: revision.revisionId,
      referenceLock: lock,
      styleOverrides: overrides,
      selectedAt: selectedAt.toISOString(),
    });
  }
}
