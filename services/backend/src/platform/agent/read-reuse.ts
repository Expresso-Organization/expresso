/** One response only: do not reuse mutation results or failed reads. */
export function readKey(name: string, value: unknown): string {
  function canonical(item: unknown): unknown {
    if (Array.isArray(item)) return item.map(canonical);
    if (item && typeof item === "object") return Object.fromEntries(
      Object.entries(item).sort(([a], [b]) => a.localeCompare(b)).map(([key, val]) => [key, canonical(val)]),
    );
    return item;
  }
  return JSON.stringify([name, canonical(value)]);
}
export function createReadReuse() {
  const pending = new Map<string, Promise<unknown>>();
  return async function reuse<T>(key: string, read: () => Promise<T>): Promise<T> {
    const previous = pending.get(key);
    if (previous) return previous as Promise<T>;
    const result = Promise.resolve().then(read);
    pending.set(key, result);
    try { return await result; }
    catch (error) { if (pending.get(key) === result) pending.delete(key); throw error; }
  };
}
