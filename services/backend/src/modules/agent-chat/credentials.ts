import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { mongoCollections } from "@expresso/database";
import type { MongoContext } from "../../platform/mongodb.js";
export class AgentCredentialError extends Error { readonly statusCode = 503; }
export class AgentCredentials {
  constructor(private readonly db: MongoContext, private readonly encryptionKey?: string) {}
  private get rows() { return mongoCollections(this.db.db).agentCredentials; }
  private key() { if (!this.encryptionKey) throw new AgentCredentialError("API 키 저장이 설정되지 않았습니다."); return Buffer.from(this.encryptionKey, "hex"); }
  async configured(userId: string) { return !!await this.rows.findOne({ _id: userId, userId }, { projection: { _id: 1 } }); }
  async save(userId: string, apiKey: string) {
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", this.key(), iv);
    cipher.setAAD(Buffer.from(`expresso:anthropic:v1:${userId}`));
    const ciphertext = Buffer.concat([cipher.update(apiKey, "utf8"), cipher.final()]).toString("base64");
    await this.rows.updateOne({ _id: userId, userId }, { $set: { userId, ciphertext, iv: iv.toString("base64"), tag: cipher.getAuthTag().toString("base64"), version: 1, updatedAt: new Date() } }, { upsert: true });
  }
  async read(userId: string): Promise<string | undefined> {
    const row = await this.rows.findOne({ _id: userId, userId });
    if (!row) return undefined;
    try {
      const decipher = createDecipheriv("aes-256-gcm", this.key(), Buffer.from(row.iv, "base64"));
      decipher.setAAD(Buffer.from(`expresso:anthropic:v1:${userId}`));
      decipher.setAuthTag(Buffer.from(row.tag, "base64"));
      return Buffer.concat([decipher.update(Buffer.from(row.ciphertext, "base64")), decipher.final()]).toString("utf8");
    } catch { throw new AgentCredentialError("저장된 API 키를 읽지 못했습니다. 설정에서 다시 등록해 주세요."); }
  }
  async remove(userId: string) { await this.rows.deleteOne({ _id: userId, userId }); }
}
