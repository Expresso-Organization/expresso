import { describe, expect, it } from "vitest";

import { BundledMarkReader, pngSize, publicUrl, type CompanyMark, type MarkReader } from "./logo.js";

/**
 * 로고 받기 시험.
 *
 * 바깥을 부르는 부분은 여기서 시험하지 않는다 — 남의 서버는 우리가 고칠 수
 * 없고, 시험이 그쪽 사정으로 깨지면 시험을 안 보게 된다. 여기서 보는 것은
 * **무엇을 들이고 무엇을 막는가**다.
 */

function png(width: number, height: number): Buffer {
  const bytes = Buffer.alloc(24);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(bytes, 0);
  bytes.write("IHDR", 12, "ascii");
  bytes.writeUInt32BE(width, 16);
  bytes.writeUInt32BE(height, 20);
  return bytes;
}

describe("PNG인지 바이트로 본다", () => {
  it("크기를 읽는다", () => {
    expect(pngSize(png(512, 512))).toEqual({ width: 512, height: 512 });
  });

  it("PNG가 아니면 null이다 — 확장자도 content-type도 보지 않는다", () => {
    // 봇 문이 닫힌 곳은 image/png를 달고 챌린지 HTML을 준다.
    expect(pngSize(Buffer.from("<!DOCTYPE html><html>Just a moment...</html>"))).toBeNull();
    // ICO 서명. krafton.ai의 `/favicon.ico`는 반대로 진짜 PNG였다.
    expect(pngSize(Buffer.from([0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x10, 0x10]))).toBeNull();
  });

  it("너무 짧은 바이트에 안 넘어간다", () => {
    expect(pngSize(Buffer.alloc(4))).toBeNull();
  });
});

describe("공개된 https 주소만 받는다", () => {
  it("평범한 회사 사이트는 통과한다", () => {
    expect(publicUrl("https://about.daangn.com")?.hostname).toBe("about.daangn.com");
    expect(publicUrl("https://www.moloco.com/favicon.png")?.hostname).toBe("www.moloco.com");
  });

  it("http는 받지 않는다", () => {
    expect(publicUrl("http://about.daangn.com")).toBeNull();
  });

  it("우리 안쪽을 가리키는 주소를 막는다", () => {
    for (const inside of [
      "https://localhost/favicon.png",
      "https://127.0.0.1/favicon.png",
      "https://10.0.0.5/favicon.png",
      "https://192.168.0.1/favicon.png",
      "https://172.20.1.1/favicon.png",
      "https://[::1]/favicon.png",
      "https://api.local/favicon.png",
    ]) {
      expect(publicUrl(inside), inside).toBeNull();
    }
  });

  it("클라우드 메타데이터 주소를 막는다", () => {
    // 출처 설정은 인증만 있으면 누구나 쓸 수 있다. 이 문이 열려 있으면
    // 우리 서버가 대신 자격증명을 읽어다 준다.
    expect(publicUrl("https://169.254.169.254/latest/meta-data/")).toBeNull();
  });

  it("주소가 아닌 값은 null이다", () => {
    expect(publicUrl("그냥 글자")).toBeNull();
    expect(publicUrl("file:///etc/passwd")).toBeNull();
  });
});

describe("저장소에 넣어 둔 마크", () => {
  /** 실제로 커밋해 둔 파일을 읽는다. 파일이 사라지면 이 시험이 먼저 운다. */
  it("도메인 이름의 파일이 있으면 그것을 쓴다", async () => {
    const mark = await new BundledMarkReader().read("https://www.coupang.jobs");
    expect(mark).not.toBeNull();
    expect(mark?.mediaType).toBe("image/png");
    expect(mark?.sourceUrl).toBe("file:company-marks/www.coupang.jobs.png");
    expect(pngSize(mark!.bytes)).not.toBeNull();
  });

  it("넣어 둔 것이 있으면 네트워크로 나가지 않는다", async () => {
    let asked = 0;
    const network: MarkReader = {
      async read(): Promise<CompanyMark | null> {
        asked += 1;
        return null;
      },
    };
    await new BundledMarkReader(network).read("https://www.coupang.jobs");
    expect(asked).toBe(0);
  });

  it("없으면 다음 차례로 넘긴다", async () => {
    const asked: string[] = [];
    const network: MarkReader = {
      async read(siteUrl): Promise<CompanyMark | null> {
        asked.push(siteUrl);
        return null;
      },
    };
    await new BundledMarkReader(network).read("https://sendbird.com");
    expect(asked).toEqual(["https://sendbird.com"]);
  });

  it("공개 주소가 아니면 파일도 안 찾는다", async () => {
    expect(await new BundledMarkReader().read("https://127.0.0.1")).toBeNull();
  });
});
