import { mongoCollections } from "@expresso/database";
import type { MongoContext } from "../../platform/mongodb.js";
export { AgentChatService } from "./service.js";
export { registerAgentChatRoutes } from "./routes.js";

export { AgentCredentials } from "./credentials.js";

/** 사용자가 마지막으로 대화한 때. 대화가 없으면 null. 컨설턴트의 확인 작업이 「대화가 없을 때」를 가를 때 쓴다. */
export async function lastConversationAt(db: MongoContext, userId: string): Promise<Date | null> {
  const row = await mongoCollections(db.db).agentConversations.find({ userId, "messages.0": { $exists: true } }).project<{ updatedAt: string }>({ updatedAt: 1 }).sort({ updatedAt: -1 }).limit(1).next();
  return row ? new Date(row.updatedAt) : null;
}
