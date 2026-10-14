import { randomUUID } from "node:crypto";
import type { CareerSocketServerMessage } from "@expresso/contracts";

export interface CareerSocketSession {
  sessionId: string;
  userId: string;
  recordId: string;
  lastAckSequence?:number;
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
  private readonly connections = new Map<string, string>();
  join(session: CareerSocketSession) {
    const connectionId=randomUUID();
    this.connections.set(session.sessionId,connectionId);
    this.sessions.set(session.sessionId, session);
    return () => {
      // 이전 socket의 늦은 종료가 동일 session ID의 새 연결을 제거하지 않습니다.
      if(this.connections.get(session.sessionId)!==connectionId)return;
      this.connections.delete(session.sessionId);this.sessions.delete(session.sessionId);
    };
  }
  publish(recordId: string, message: CareerSocketServerMessage, exceptSessionId?: string) {
    for (const session of this.sessions.values()) {
      if (session.recordId === recordId && session.sessionId !== exceptSessionId) session.send({ ...message, sessionId: session.sessionId });
    }
  }
  activeRecords():{userId:string;recordId:string;afterSequence:number;sessionIds:string[];connectionIds:string[]}[]{
    const groups=new Map<string,{userId:string;recordId:string;afterSequence:number;sessionIds:string[];connectionIds:string[]}>();
    for(const session of this.sessions.values()){
      const key=session.userId+":"+session.recordId,sequence=session.lastAckSequence??0;
      const group=groups.get(key)??{userId:session.userId,recordId:session.recordId,afterSequence:sequence,sessionIds:[],connectionIds:[]};
      group.afterSequence=Math.min(group.afterSequence,sequence);group.sessionIds.push(session.sessionId);group.connectionIds.push(this.connections.get(session.sessionId)!);groups.set(key,group);
    }
    return [...groups.values()].map(group=>({...group,sessionIds:group.sessionIds.sort(),connectionIds:group.connectionIds.sort()}));
  }
  publishOwned(userId:string,recordId:string,message:CareerSocketServerMessage){
    for(const session of this.sessions.values())if(session.userId===userId&&session.recordId===recordId)session.send({...message,sessionId:session.sessionId});
  }
  count(userId: string, recordId: string) {
    return [...this.sessions.values()].filter((s) => s.userId === userId && s.recordId === recordId).length;
  }
}
