import { createHash } from "node:crypto";

import { mongoCollections } from "@expresso/database";
import { Binary, type Db } from "mongodb";
import sharp from "sharp";

import { USER_AGENT } from "./sources/adapter.js";

/** 출처 그림을 받는다. 2xx가 아니거나, 받는 그림 종류가 아니거나, 너무 크면 던진다. */
export type FetchImage = (url: string) => Promise<{ bytes: Buffer; mediaType: string }>;

/** 보관하는 폭. 탐색 카드 열 폭(최대 약 320px)의 1.5배라 고해상도 화면에서도 흐리지 않다. */
const WIDTH = 480;
const QUALITY = 74;
const TIMEOUT_MS = 15_000;
const MAX_BYTES = 8 * 1024 * 1024;
/** SVG는 받지 않는다 — 그림 안에서 바깥 주소를 부를 수 있다. */
const ACCEPTED = /^image\/(jpeg|png|webp|gif|avif)\b/i;
const CONCURRENCY = 4;

export const fetchImage: FetchImage = async (url) => {
  const response = await fetch(url, { headers: { "user-agent": USER_AGENT }, redirect: "follow", signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!response.ok) throw new Error(`poster ${response.status}`);
  const mediaType = response.headers.get("content-type") ?? "";
  if (!ACCEPTED.test(mediaType)) throw new Error(`poster type ${mediaType.slice(0, 40)}`);
  if (Number(response.headers.get("content-length") ?? 0) > MAX_BYTES) throw new Error("poster too large");
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length > MAX_BYTES) throw new Error("poster too large");
  return { bytes, mediaType };
};

export interface PosterResult {
  /** 새로 받아 보관한 수. */
  stored: number;
  /** 받거나 줄이지 못한 수. 그 활동은 있던 포스터(없으면 없음)로 남는다. */
  failed: number;
}

/**
 * 출처 그림을 받아 폭 480px webp로 줄여 `activity_posters`에 두고, 활동 문서에 크기와 체크섬을 적는다.
 *
 * 같은 출처 주소로 이미 보관한 활동은 받지 않는다 — 매일 수집해도 새로 올라온 활동의 그림만 받는다.
 * 그림 주소가 없는(`null`) 활동은 건드리지 않는다. 출처 쪽 일시 실패로 있던 포스터를 지우지 않기 위해서다.
 */
export async function storeActivityPosters(db: Db, items: readonly { id: string; posterUrl: string | null }[], fetch: FetchImage = fetchImage): Promise<PosterResult> {
  const { activities, activityPosters } = mongoCollections(db);
  const wanted = items.filter((item): item is { id: string; posterUrl: string } => item.posterUrl !== null);
  if (wanted.length === 0) return { stored: 0, failed: 0 };
  const kept = new Map((await activityPosters.find({ _id: { $in: wanted.map((item) => item.id) } }, { projection: { sourceUrl: 1 } }).toArray()).map((doc) => [doc._id, doc.sourceUrl]));
  const todo = wanted.filter((item) => kept.get(item.id) !== item.posterUrl);
  const result: PosterResult = { stored: 0, failed: 0 };
  for (let start = 0; start < todo.length; start += CONCURRENCY) {
    await Promise.all(todo.slice(start, start + CONCURRENCY).map(async (item) => {
      try {
        const image = await fetch(item.posterUrl);
        // 움직이는 그림은 첫 장만 쓴다. 휴대폰 사진의 회전 정보는 그림에 반영한다.
        const { data, info } = await sharp(image.bytes, { limitInputPixels: 50_000_000 })
          .rotate()
          .resize({ width: WIDTH, withoutEnlargement: true })
          .webp({ quality: QUALITY })
          .toBuffer({ resolveWithObject: true });
        const checksum = createHash("sha256").update(data).digest("hex");
        await activityPosters.updateOne(
          { _id: item.id },
          { $set: { sourceUrl: item.posterUrl, data: new Binary(data), mediaType: "image/webp", width: info.width, height: info.height, checksum, readAt: new Date() } },
          { upsert: true },
        );
        await activities.updateOne({ _id: item.id }, { $set: { poster: { width: info.width, height: info.height, checksum } } });
        result.stored += 1;
      } catch {
        result.failed += 1;
      }
    }));
  }
  return result;
}
