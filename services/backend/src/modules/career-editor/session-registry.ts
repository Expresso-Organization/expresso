import type { CareerSocketServerMessage } from "@expresso/contracts";

export interface CareerSocketSession {
  sessionId: string;
  userId: string;
  recordId: string;
  send(message: CareerSocketServerMessage): void;
}

/** 단일 API 프로세스 안의 연결만 관리한다. 여러 인스턴스에서는 gateway/pubsub로 대체한다. */
export interface CareerDocumentSessionRegistry {
  join(session: CareerSocketSession): () => void;
  publish(recordId: string, message: CareerSocketServerMessage, exceptSessionId?: string): void;
  count(userId: string, recordId: string): number;
}

export class InMemoryCareerDocumentSessionRegistry implements CareerDocumentSessionRegistry {
  private readonly sessions = new Map<string, CareerSocketSession>();
  join(session: CareerSocketSession) {
    this.sessions.set(session.sessionId, session);
    return () => this.sessions.delete(session.sessionId);
  }
  publish(recordId: string, message: CareerSocketServerMessage, exceptSessionId?: string) {
    for (const session of this.sessions.values()) {
      if (session.recordId === recordId && session.sessionId !== exceptSessionId) session.send(message);
    }
  }
  count(userId: string, recordId: string) {
    return [...this.sessions.values()].filter((s) => s.userId === userId && s.recordId === recordId).length;
  }
}
