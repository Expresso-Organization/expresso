import {
  DesignSelectionSchema,
  DesignStyleOverridesSchema,
  type DesignSelection,
  type SaveDesignSelection,
} from "@expresso/contracts";
import { mongoCollections } from "@expresso/database";

import type { MongoContext } from "../../platform/mongodb.js";
import { catalogEntries } from "./catalog.js";

export class DesignSystemError extends Error {
  readonly statusCode: number;
  constructor(statusCode: number, message: string) {
    super(message);
    this.statusCode = statusCode;
  }
}

export class DesignSystemService {
  constructor(readonly context: MongoContext) {}
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
    const selectedAt = new Date();
    const result = await mongoCollections(this.context.db).brews.updateOne(
      { _id: brewId, userId },
      {
        $set: {
          designSystemRevisionId: revision.revisionId,
          referenceLockSnapshot: lock,
          designStyleOverrides: overrides,
          designSelectedAt: selectedAt,
          updatedAt: selectedAt,
        },
      },
    );
    if (result.matchedCount === 0) throw new DesignSystemError(404, "brew not found");
    return DesignSelectionSchema.parse({
      designSystemRevisionId: revision.revisionId,
      referenceLock: lock,
      styleOverrides: overrides,
      selectedAt: selectedAt.toISOString(),
    });
  }
}
