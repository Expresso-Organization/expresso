import { it, expect, vi } from "vitest";
import { createReadReuse, readKey } from "./read-reuse.js";
it("canonicalizes object order and shares concurrent reads", async () => {
 const reuse = createReadReuse(); const read = vi.fn(async () => ({ text: "source" }));
 const a = readKey("search", { q: "404", limit: 8 });
 const b = readKey("search", { limit: 8, q: "404" });
 expect(a).toBe(b);
 const results = await Promise.all([reuse(a, read), reuse(b, read)]);
 expect(read).toHaveBeenCalledOnce(); expect(results[0]).toBe(results[1]);
});
it("does not retain failures or share results between runs", async () => {
 const read = vi.fn().mockRejectedValueOnce(new Error("retry")).mockResolvedValue("ok");
 const reuse = createReadReuse();
 await expect(reuse("key", read)).rejects.toThrow("retry");
 expect(await reuse("key", read)).toBe("ok");
 expect(await createReadReuse()("key", read)).toBe("ok");
 expect(read).toHaveBeenCalledTimes(3);
});
