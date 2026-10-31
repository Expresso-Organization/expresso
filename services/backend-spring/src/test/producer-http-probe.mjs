import { createHash, createHmac } from "node:crypto";
const [baseUrl, secret, raw] = process.argv.slice(2);
if (!/^http:\/\/127\.0\.0\.1:\d+$/.test(baseUrl ?? "")) throw new Error("disposable loopback server required");
const fixture = JSON.parse(Buffer.from(raw, "base64").toString("utf8"));
const { request, business, document, expiresAt } = fixture;
const { leaseToken, ...scope } = request;
const canonical = value => {
  if (value === null) return ["null"];
  if (typeof value === "number") { const bytes = Buffer.alloc(8); bytes.writeDoubleBE(value === 0 ? 0 : value); return ["number", bytes.toString("hex")]; }
  if (typeof value === "string") return ["string", value];
  if (typeof value === "boolean") return ["boolean", value];
  if (Array.isArray(value)) return ["array", value.map(canonical)];
  return ["object", Object.keys(value).sort().map(key => [key, canonical(value[key])])];
};
const { fingerprint, ...binding } = scope;
if (createHash("sha256").update(JSON.stringify(canonical({ ...binding, business, document }))).digest("hex") !== fingerprint) throw new Error("Java / Node frozen intent fingerprint mismatch");
const payload = Buffer.from(JSON.stringify({ ...scope, audience: "career-producer", expiresAt })).toString("base64url");
const signature = createHmac("sha256", secret).update(payload).digest("base64url");
const result = await fetch(`${baseUrl}/internal/career/integration/business`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer expi.${payload}.${signature}`, "If-Match": `"v${business.expectedVersion}"` }, body: JSON.stringify(request) });
process.stdout.write(JSON.stringify({ status: result.status, etag: result.headers.get("ETag"), body: await result.json() }));
