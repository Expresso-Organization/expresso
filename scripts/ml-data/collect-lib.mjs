import { createHash } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, rename, rm, stat } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

async function checksumFile(filePath, algorithm) {
  const hash = createHash(algorithm);
  await pipeline(createReadStream(filePath), hash);
  return hash.digest("hex");
}

export async function verifyFile(filePath, expectation) {
  try {
    const fileStat = await stat(filePath);
    if (!fileStat.isFile() || fileStat.size !== expectation.size) {
      return false;
    }

    const actual = await checksumFile(filePath, expectation.checksum.algorithm);
    return actual.toLowerCase() === expectation.checksum.value.toLowerCase();
  } catch (error) {
    if (error && typeof error === "object" && error.code === "ENOENT") {
      return false;
    }
    throw error;
  }
}

export async function collectFile(source) {
  if (await verifyFile(source.destination, source)) {
    return { status: "cached", destination: source.destination };
  }

  await mkdir(path.dirname(source.destination), { recursive: true });
  await rm(source.destination, { force: true });
  const partialPath = `${source.destination}.partial`;
  await rm(partialPath, { force: true });

  try {
    const response = await fetch(source.url, { redirect: "follow" });
    if (!response.ok || !response.body) {
      throw new Error(`다운로드 실패: HTTP ${response.status} ${source.url}`);
    }

    await pipeline(Readable.fromWeb(response.body), createWriteStream(partialPath));
    if (!(await verifyFile(partialPath, source))) {
      throw new Error(`무결성 검증에 실패했습니다: ${source.destination}`);
    }

    await rename(partialPath, source.destination);
    return { status: "downloaded", destination: source.destination };
  } catch (error) {
    await rm(partialPath, { force: true });
    throw error;
  }
}
