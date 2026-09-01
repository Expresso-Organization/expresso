import { mongoCollections, type CareerCategoryDoc, type CareerRecordDoc } from "@expresso/database";
import type { ClientSession } from "mongodb";

import type { MongoContext } from "../../platform/mongodb.js";

/** 계산 모듈은 career 모듈 내부를 import하지 않고, 공개 MongoDB 문서 경계만 읽는다. */
export class MongoCareerComputationRepository {
  constructor(readonly context: MongoContext) {}

  records() { return mongoCollections(this.context.db).careerRecords; }
  relations() { return mongoCollections(this.context.db).careerRecordRelations; }
  categories() { return mongoCollections(this.context.db).careerCategories; }
  outbox() { return mongoCollections(this.context.db).outboxEvents; }
  options(): { session?: ClientSession } { return "session" in this.context ? { session: this.context.session as ClientSession } : {}; }

  async activeRecord(userId: string, recordId: string, session?: ClientSession): Promise<CareerRecordDoc | null> {
    return this.records().findOne({ _id: recordId, userId, deletedAt: null }, session ? { session } : {});
  }

  async readableCategory(userId: string, categoryId: string, session?: ClientSession): Promise<CareerCategoryDoc | null> {
    return this.categories().findOne({ _id: categoryId, $or: [{ userId: null }, { userId }] }, session ? { session } : {});
  }
}
