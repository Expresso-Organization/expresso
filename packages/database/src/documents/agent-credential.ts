export interface AgentCredentialDoc {
  _id: string;
  userId: string;
  ciphertext: string;
  iv: string;
  tag: string;
  version: 1;
  updatedAt: Date;
}
