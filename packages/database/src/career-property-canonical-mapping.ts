import { createHash } from "node:crypto";

const DNS_NAMESPACE = "6ba7b810-9dad-11d1-80b4-00c04fd430c8";

function uuidBytes(value: string): Buffer {
  const hex = value.replaceAll("-", "");
  if (!/^[0-9a-fA-F]{32}$/.test(hex)) throw new Error(`유효하지 않은 UUID namespace입니다: ${value}`);
  return Buffer.from(hex, "hex");
}

function uuidV5(namespace: string, name: string): string {
  const bytes = createHash("sha1")
    .update(uuidBytes(namespace))
    .update(name, "utf8")
    .digest()
    .subarray(0, 16);
  bytes[6] = (bytes[6]! & 0x0f) | 0x50;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** migration 0006과 동일한 DNS namespace + `categoryId:key` UUIDv5입니다. */
export function officialPropertyDefinitionId(categoryId: string, key: string): string {
  return uuidV5(DNS_NAMESPACE, `${categoryId}:${key}`);
}

/** 공백·대소문자·Unicode normalization을 바꾸지 않는 exact-string option UUIDv5입니다. */
export function exactOptionId(propertyDefinitionId: string, exactName: string): string {
  return uuidV5(propertyDefinitionId, exactName);
}

/** migration 0009가 system Category에 사용한 임시 UUID 계보입니다. */
export function legacy0009PropertyDefinitionId(categoryId: string, key: string): string {
  return uuidV5(categoryId, key);
}
