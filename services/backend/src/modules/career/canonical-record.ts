import { randomUUID } from "node:crypto";

import type { CareerRecordDoc } from "@expresso/database";

export function createEmptyCanonicalBlockBody(): NonNullable<CareerRecordDoc["blockBody"]> {
  return {
    schemaVersion: 1,
    type: "doc",
    content: [{
      id: randomUUID(),
      type: "paragraph",
      attrs: {},
      text: [],
    }],
  };
}
