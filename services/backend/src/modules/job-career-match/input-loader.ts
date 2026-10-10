import { createHash } from "node:crypto";

import {
  careerDocumentToMarkdown,
  encodeDocumentAsYUpdate,
  parseCareerDocument,
  reconstructYDocument,
} from "@expresso/editor";
import {
  JobCareerMatchInputSnapshotSchema,
  type JobCareerMatchInputSnapshot,
} from "@expresso/contracts";
import {
  mongoCollections,
  type CareerRecordDoc,
} from "@expresso/database";

import type { MongoContext } from "../../platform/mongodb.js";
import type { JobBoardApi } from "../jobs/index.js";
import { JobCareerMatchError } from "./public.js";
import { resolveMatchChat } from "./chat-context.js";


const MAX_RECORDS = 50;
const MAX_RECORD_TEXT = 4000;
const MAX_TOTAL_RECORD_TEXT = 60000;
const MAX_JOB_TEXT = 30000;

export interface MatchCareerInput {
  id: string;
  title: string;
  version: number;
  status: CareerRecordDoc["status"];
  text: string;
}

export interface JobCareerMatchInput {
  sessionId: string;
  job: {
    id: string;
    title: string;
    description: string;
  };
  records: MatchCareerInput[];
  inputSnapshot: JobCareerMatchInputSnapshot;
}

export class JobCareerMatchInputLoader {
  constructor(
    readonly context: MongoContext,
    readonly jobBoardService: JobBoardApi,
  ) {}

  private async readBody(
    userId: string,
    record: CareerRecordDoc,
  ): Promise<string> {
    const db = mongoCollections(this.context.db);

    const snapshot = await db.careerDocumentSnapshots.findOne(
      { userId, recordId: record._id },
      { sort: { documentVersion: -1 } },
    );

    if (!snapshot) {
      if (record.latestSnapshotId) {
        throw new JobCareerMatchError(
          503,
          "career document snapshot is unavailable",
        );
      }

      return record.bodyMd;
    }

    const updates = await db.careerDocumentUpdates
      .find({
        userId,
        recordId: record._id,
        serverSequence: { $gt: snapshot.serverSequence },
        compactedAt: null,
      })
      .sort({ serverSequence: 1 })
      .limit(10001)
      .toArray();

    if (updates.length > 10000) {
      throw new JobCareerMatchError(
        503,
        "career document compaction is required",
      );
    }

    try {
      const document = reconstructYDocument([
        encodeDocumentAsYUpdate(
          parseCareerDocument(snapshot.content),
        ),
        ...updates.map(
          (update) => new Uint8Array(update.update.buffer),
        ),
      ]);

      return careerDocumentToMarkdown(document);
    } catch {
      throw new JobCareerMatchError(
        422,
        "career document could not be reconstructed",
      );
    }
  }

  async load(
    userId: string,
    sessionId: string,
  ): Promise<JobCareerMatchInput> {
    const db = mongoCollections(this.context.db);

    const session = await resolveMatchChat(
      this.context.db,
      userId,
      sessionId,
    );

    const job = await this.jobBoardService.get(
      userId,
      session.jobPostingId,
    );

    const description = job.descriptionRaw.slice(0, MAX_JOB_TEXT);

    if (!description.trim()) {
      throw new JobCareerMatchError(
        422,
        "job description is empty",
      );
    }

    const rows = await db.careerRecords
      .find({
        userId,
        deletedAt: null,
      })
      .sort({ updatedAt: -1, _id: -1 })
      .limit(MAX_RECORDS + 1)
      .toArray();

    if (rows.length === 0) {
      throw new JobCareerMatchError(
        422,
        "add a career record before analysis",
      );
    }

    let inputTruncated =
      rows.length > MAX_RECORDS ||
      job.descriptionRaw.length > MAX_JOB_TEXT;

    let totalLength = 0;
    const records: MatchCareerInput[] = [];

    for (const row of rows.slice(0, MAX_RECORDS)) {
      const body = await this.readBody(userId, row);

      // 속성도 참고 자료로 전달합니다.
      // 인용문은 아래 text에 실제로 포함된 부분만 허용합니다.
      const fullText = [
        row.title,
        body,
        JSON.stringify(row.properties),
      ].join("\n");

      const remaining = MAX_TOTAL_RECORD_TEXT - totalLength;

      if (remaining <= 0) {
        inputTruncated = true;
        break;
      }

      const text = fullText.slice(
        0,
        Math.min(MAX_RECORD_TEXT, remaining),
      );

      const title = row.title.trim().slice(0, 500) || "제목 없는 경력";

      if (
        text.length < fullText.length ||
        title !== row.title
      ) {
        inputTruncated = true;
      }

      records.push({
        id: row._id,
        title,
        version: row.version,
        status: row.status,
        text,
      });

      totalLength += text.length;
    }

    if (records.length === 0) {
      throw new JobCareerMatchError(
        422,
        "no career records available for analysis",
      );
    }

    const inputSnapshot =
      JobCareerMatchInputSnapshotSchema.parse({
        jobPostingId: session.jobPostingId,
        jobContentHash: createHash("sha256")
          .update(description)
          .digest("hex"),
        records: records.map((record) => ({
          recordId: record.id,
          version: record.version,
          title: record.title,
        })),
        inputTruncated,
      });

    return {
      sessionId,
      job: {
        id: session.jobPostingId,
        title: job.title,
        description,
      },
      records,
      inputSnapshot,
    };
  }
}