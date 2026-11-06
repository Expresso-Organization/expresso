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
  /** 같은 사용자 · 기록의 연결 수입니다. exceptSessionId는 재연결 중인 자기 자신을 빼고 셀 때 씁니다. */
  count(userId: string, recordId: string, exceptSessionId?: string): number;
}

export class InMemoryCareerDocumentSessionRegistry implements CareerDocumentSessionRegistry {
  private readonly sessions = new Map<string, CareerSocketSession>();
  join(session: CareerSocketSession) {
    // 같은 sessionId로 다시 들어오면 재연결한 클라이언트입니다. 옛 연결 항목을 새 연결로 바꿉니다.
    // 키에 사용자를 넣어, 다른 사용자가 같은 sessionId를 보내도 남의 항목을 덮지 못하게 합니다.
    const key = `${session.userId}:${session.sessionId}`;
    this.sessions.set(key, session);
    // 옛 소켓의 close가 늦게 와도 새 연결의 항목은 지우지 않습니다. 자기 항목일 때만 지웁니다.
    return () => { if (this.sessions.get(key) === session) this.sessions.delete(key); };
  }
  publish(recordId: string, message: CareerSocketServerMessage, exceptSessionId?: string) {
    for (const session of this.sessions.values()) {
      if (session.recordId === recordId && session.sessionId !== exceptSessionId) session.send({ ...message, sessionId: session.sessionId });
    }
  }
  count(userId: string, recordId: string, exceptSessionId?: string) {
    return [...this.sessions.values()].filter((s) => s.userId === userId && s.recordId === recordId && s.sessionId !== exceptSessionId).length;
  }
}
