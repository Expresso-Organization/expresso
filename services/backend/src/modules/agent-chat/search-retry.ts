/** 일시적인 연결 오류만 한 번 더 시도한다. 입력·권한 오류는 재시도하지 않는다. */
export async function retrySearch<T>(work: () => Promise<T>): Promise<T> {
  try { return await work(); }
  catch (error) {
    const cause = error as { code?: string; name?: string; statusCode?: number };
    if (!["ECONNRESET", "ETIMEDOUT", "ECONNREFUSED"].includes(cause.code ?? "") && !["MongoNetworkError", "MongoServerSelectionError"].includes(cause.name ?? "") && ![502, 503, 504].includes(cause.statusCode ?? 0)) throw error;
    return work();
  }
}
