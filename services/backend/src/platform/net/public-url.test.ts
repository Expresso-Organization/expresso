import { describe, expect, it } from "vitest";
import { assertPublicHttpUrl, isPrivateAddress } from "./public-url.js";

const resolveTo = (address: string) => (async () => [{ address, family: address.includes(":") ? 6 : 4 }]) as never;

describe("공개 주소 검사", () => {
  it("사설 · 루프백 · 링크로컬 · 메타데이터 대역을 사설로 본다", () => {
    for (const address of ["10.0.0.1", "127.0.0.1", "169.254.169.254", "192.168.1.2", "172.16.0.1", "100.64.0.1", "::1", "fd00::1", "fe80::1", "::ffff:127.0.0.1"]) expect(isPrivateAddress(address)).toBe(true);
    for (const address of ["8.8.8.8", "172.32.0.1", "2606:4700::1111"]) expect(isPrivateAddress(address)).toBe(false);
  });

  it("http(s)가 아니거나 사설로 풀리는 주소, 계정이 든 주소를 막고 공개 주소는 통과시킨다", async () => {
    await expect(assertPublicHttpUrl("file:///etc/passwd")).rejects.toThrow("unsupported scheme");
    await expect(assertPublicHttpUrl("http://localhost:3000")).rejects.toThrow("private host");
    await expect(assertPublicHttpUrl("http://127.0.0.1/")).rejects.toThrow("private address");
    await expect(assertPublicHttpUrl("https://user:pw@example.com")).rejects.toThrow("credentials");
    await expect(assertPublicHttpUrl("https://rebind.example.com", resolveTo("10.1.2.3"))).rejects.toThrow("private address");
    expect((await assertPublicHttpUrl("https://example.com/a", resolveTo("93.184.216.34"))).hostname).toBe("example.com");
  });
});
