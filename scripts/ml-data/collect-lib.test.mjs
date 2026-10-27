import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { collectFile, verifyFile } from "./collect-lib.mjs";

const fixture = Buffer.from("expresso-ml-data\n", "utf8");
const fixtureSha256 = createHash("sha256").update(fixture).digest("hex");

test("verifyFile은 기대한 크기와 체크섬이 모두 맞는 파일만 승인한다", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "expresso-ml-data-"));
  const filePath = path.join(directory, "fixture.txt");

  try {
    await writeFile(filePath, fixture);

    assert.equal(
      await verifyFile(filePath, {
        size: fixture.length,
        checksum: { algorithm: "sha256", value: fixtureSha256 },
      }),
      true,
    );
    assert.equal(
      await verifyFile(filePath, {
        size: fixture.length + 1,
        checksum: { algorithm: "sha256", value: fixtureSha256 },
      }),
      false,
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("collectFile은 임시 파일을 검증한 뒤에만 최종 경로로 옮긴다", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "expresso-ml-data-"));
  const destination = path.join(directory, "downloaded.txt");
  const server = createServer((_request, response) => {
    response.writeHead(200, { "content-length": fixture.length });
    response.end(fixture);
  });

  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address === "object");

  try {
    const result = await collectFile({
      url: `http://127.0.0.1:${address.port}/fixture.txt`,
      destination,
      size: fixture.length,
      checksum: { algorithm: "sha256", value: fixtureSha256 },
    });

    assert.equal(result.status, "downloaded");
    assert.deepEqual(await readFile(destination), fixture);
    await assert.rejects(readFile(`${destination}.partial`), { code: "ENOENT" });
  } finally {
    server.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test("collectFile은 체크섬이 틀린 응답을 최종 파일로 남기지 않는다", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "expresso-ml-data-"));
  const destination = path.join(directory, "downloaded.txt");
  const server = createServer((_request, response) => {
    response.writeHead(200, { "content-length": fixture.length });
    response.end(fixture);
  });

  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address === "object");

  try {
    await assert.rejects(
      collectFile({
        url: `http://127.0.0.1:${address.port}/fixture.txt`,
        destination,
        size: fixture.length,
        checksum: { algorithm: "sha256", value: "0".repeat(64) },
      }),
      /무결성 검증에 실패/,
    );
    await assert.rejects(readFile(destination), { code: "ENOENT" });
    await assert.rejects(readFile(`${destination}.partial`), { code: "ENOENT" });
  } finally {
    server.close();
    await rm(directory, { recursive: true, force: true });
  }
});
