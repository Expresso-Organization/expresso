import { CareerPropertyMutationCommitSchema, CareerPropertyMutationReadSchema, CareerPropertyMutationResultSchema,
  type CareerPropertyMutationCommit, type CareerPropertyMutationRead, type CareerPropertyMutationResult } from "@expresso/contracts";

export interface SpringPropertyMutationPort {
  receipt(userId: string, mutationId: string, recordId: string, fingerprint: string): Promise<CareerPropertyMutationResult | null>;
  read(userId: string, mutationId: string, recordId: string, leaseToken: string, fingerprint: string): Promise<CareerPropertyMutationRead>;
  commit(userId: string, command: CareerPropertyMutationCommit): Promise<CareerPropertyMutationResult>;
}
export interface SpringPropertyMutationTransport {
  invoke(operation: "receipt" | "read" | "commit", userId: string, payload: unknown): Promise<unknown>;
}
/** 인증과 네트워크 transport는 후속 단계가 주입합니다. Mongo fallback은 없습니다. */
export function createSpringPropertyMutationPort(transport: SpringPropertyMutationTransport): SpringPropertyMutationPort {
  function scoped<T extends {data:{id:string;userId:string}}>(result:T,userId:string,recordId:string):T {
    if(result.data.userId!==userId || result.data.id!==recordId) throw new Error("Spring mutation response scope mismatch");return result;
  }
  return {
    async receipt(userId,mutationId,recordId,operationFingerprint) {
      const raw=await transport.invoke("receipt",userId,{mutationId,recordId,operationFingerprint});
      return raw===null?null:scoped(CareerPropertyMutationResultSchema.parse(raw),userId,recordId);
    },
    async read(userId,mutationId,recordId,leaseToken,operationFingerprint) {
      return scoped(CareerPropertyMutationReadSchema.parse(await transport.invoke("read",userId,{mutationId,recordId,leaseToken,operationFingerprint})),userId,recordId);
    },
    async commit(userId,command) {
      const input=CareerPropertyMutationCommitSchema.parse(command);
      return scoped(CareerPropertyMutationResultSchema.parse(await transport.invoke("commit",userId,input)),userId,input.recordId);
    },
  };
}
