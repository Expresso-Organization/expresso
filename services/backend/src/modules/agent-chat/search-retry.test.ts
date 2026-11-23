import { expect, it, vi } from "vitest";
import { retrySearch } from "./search-retry.js";
it("연결 복구는 한 번만 시도하고 입력 오류는 재시도하지 않는다", async () => {
  const reconnect = vi.fn().mockRejectedValueOnce(Object.assign(new Error(), { code: "ECONNRESET" })).mockResolvedValue(["공고"]);
  expect(await retrySearch(reconnect)).toEqual(["공고"]); expect(reconnect).toHaveBeenCalledTimes(2);
  const invalid = vi.fn().mockRejectedValue(Object.assign(new Error(), { statusCode: 400 }));
  await expect(retrySearch(invalid)).rejects.toMatchObject({ statusCode: 400 }); expect(invalid).toHaveBeenCalledTimes(1);
  const down = vi.fn().mockRejectedValue(Object.assign(new Error(), { statusCode: 503 }));
  await expect(retrySearch(down)).rejects.toMatchObject({ statusCode: 503 }); expect(down).toHaveBeenCalledTimes(2);
});
