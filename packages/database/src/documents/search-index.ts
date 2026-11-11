export interface EvidenceIndexChunk {
  blockId: string | null;
  source: "title" | "body" | "property";
  text: string;
  vector: number[] | null;
}
/** 원본과 대조해 사용하는 검색용 파생 자료입니다. */
export interface EvidenceIndexDoc {
  _id: string;
  userId: string;
  recordId: string;
  fingerprint: string;
  embeddingKey: string;
  chunks: EvidenceIndexChunk[];
  indexedAt: Date;
  expiresAt: Date;
}
