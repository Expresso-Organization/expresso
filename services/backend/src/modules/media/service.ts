import { MediaError } from "./public.js";
export { MediaError } from "./public.js";
import { createHash } from "node:crypto";

import {
  CreateMediaBlockSchema,
  MEDIA_MAX_BYTES,
  MediaAssetSchema,
  PortfolioMediaSchema,
  type CreateMediaBlock,
} from "@expresso/contracts";
import type { SqlTag, JSONValue } from "../../platform/mysql.js";

import { readImageMeta, UnsupportedImageError, type ImageMeta } from "../../platform/storage/image.js";
import { buildVariants, orientedSize } from "../../platform/storage/transcode.js";
import { storageKeyFor, type MediaStorage } from "../../platform/storage/client.js";

/**
 * 그림 올리기와 지면에 놓기.
 *
 * 두 가지가 따로다 — **자산**은 사용자의 것이고 여러 포트폴리오가 같은 것을 쓸 수
 * 있다. **블록**은 특정 지면의 한 자리다. 그래서 올리는 일과 놓는 일이 나뉜다.
 */

interface AssetRow {
  id: string;
  user_id: string;
  storage_key: string;
  mime_type: "image/png" | "image/jpeg" | "image/webp" | "image/gif";
  width: number;
  height: number;
  byte_size: number;
  created_at: Date | string;
}

interface VariantRow {
  id: string;
  media_asset_id: string;
  storage_key: string;
  mime_type: "image/webp";
  width: number;
  height: number;
  byte_size: number;
}

function assetDto(row: AssetRow, variants: readonly number[] = []) {
  return MediaAssetSchema.parse({
    id: row.id,
    mimeType: row.mime_type,
    width: row.width,
    height: row.height,
    bytes: row.byte_size,
    variants: [...variants].sort((left, right) => left - right),
    createdAt: new Date(row.created_at).toISOString(),
  });
}

export class MediaService {
  readonly #sql: SqlTag;
  readonly #storage: MediaStorage;

  constructor(sql: SqlTag, storage: MediaStorage) {
    this.#sql = sql;
    this.#storage = storage;
  }

  /**
   * 그림 한 장을 받는다.
   *
   * 형식은 **바이트가 말한다** — 클라이언트가 붙인 Content-Type은 확인용으로도
   * 쓰지 않는다. 같은 파일을 두 번 올리면 새로 쓰지 않고 있던 것을 돌려준다.
   */
  async upload(userId: string, bytes: Buffer) {
    if (bytes.length === 0) throw new MediaError(400, "빈 파일입니다");
    if (bytes.length > MEDIA_MAX_BYTES) {
      throw new MediaError(413, `한 장은 ${Math.floor(MEDIA_MAX_BYTES / 1024 / 1024)}MB까지입니다`);
    }

    let meta;
    try {
      meta = readImageMeta(bytes);
    } catch (error) {
      if (error instanceof UnsupportedImageError) throw new MediaError(415, error.message);
      throw error;
    }

    // EXIF 방향을 적용한 **보이는** 크기를 저장한다. 머리에서 읽은 값을 그대로
    // 두면 세로로 찍은 사진이 가로로 기록되고, 지면이 잡아 둔 자리와 실제 그림이
    // 어긋나 글이 밀린다.
    const display = await orientedSize(bytes, meta);

    const checksum = createHash("sha256").update(bytes).digest("hex");
    const existing = (await this.#sql<AssetRow[]>`
      select * from media_asset where user_id = ${userId} and checksum = ${checksum}
    `)[0];
    if (existing) return assetDto(existing);

    // 행을 먼저 만들어 식별자를 얻고, 그 식별자로 저장소에 쓴다. 순서가 반대면
    // 키를 정할 수 없다. 쓰다 실패하면 행을 지워 **가리키는 곳이 없는 행**을
    // 남기지 않는다 — 그런 행은 화면에서 깨진 그림이 된다.
    const row = (await this.#sql<AssetRow[]>`
      insert into media_asset (user_id, storage_key, mime_type, width, height, byte_size, checksum)
      values (${userId}, '', ${meta.mimeType}, ${display.width}, ${display.height}, ${bytes.length}, ${checksum})
      returning *
    `)[0];
    if (!row) throw new Error("media asset insert failed");

    const key = storageKeyFor(userId, row.id);
    try {
      await this.#storage.put(key, bytes, meta.mimeType);
      await this.#sql`update media_asset set storage_key = ${key} where id = ${row.id}`;
    } catch (error) {
      await this.#sql`delete from media_asset where id = ${row.id}`;
      throw error;
    }
    const widths = await this.#transcode(userId, row.id, bytes, meta);
    return assetDto({ ...row, storage_key: key }, widths);
  }

  /**
   * 내보낼 크기들을 만든다.
   *
   * **올리는 그 요청 안에서 만든다.** 큐에 넘기면 "아직 준비 안 된" 상태가 생기고
   * 지면은 그 상태를 그릴 방법이 없다 — 방금 놓은 그림이 잠깐 원본으로 나갔다가
   * 나중에 바뀌면 캐시가 어긋난다. 사람이 기다리는 시간은 큰 캡처 한 장에 1초
   * 안쪽이다.
   *
   * **실패해도 던지지 않는다.** 변형이 없으면 원본을 내보내면 되지만, 여기서
   * 던지면 사용자가 올린 그림이 통째로 사라진다.
   */
  async #transcode(userId: string, assetId: string, bytes: Buffer, meta: ImageMeta) {
    const widths: number[] = [];
    try {
      for (const variant of await buildVariants(bytes, meta)) {
        const key = `${storageKeyFor(userId, assetId)}@${variant.width}.webp`;
        await this.#storage.put(key, variant.bytes, variant.mimeType);
        await this.#sql`
          insert into media_variant (
            user_id, media_asset_id, storage_key, mime_type, width, height, byte_size
          ) values (
            ${userId}, ${assetId}, ${key}, ${variant.mimeType},
            ${variant.width}, ${variant.height}, ${variant.bytes.length}
          )
          as new on duplicate key update storage_key = new.storage_key,
            mime_type = new.mime_type,
            height = new.height,
            byte_size = new.byte_size
        `;
        widths.push(variant.width);
      }
    } catch (error) {
      console.error(JSON.stringify({
        level: "warn",
        event: "media.transcode_failed",
        assetId,
        message: error instanceof Error ? error.message : String(error),
      }));
    }
    return widths;
  }

  async #variantWidths(assetId: string): Promise<number[]> {
    const rows = await this.#sql<{ width: number }[]>`
      select width from media_variant where media_asset_id = ${assetId} order by width
    `;
    return rows.map(({ width }) => width);
  }

  /**
   * 방문자에게 내보낼 바이트. 서명이 없는 이유는 `media.ts`에 적어 두었다.
   *
   * `width`를 주면 **그보다 크지 않은 가장 큰 변형**을 고른다. 브라우저가
   * `srcset`으로 고른 폭이 그대로 들어오므로, 폰은 640짜리 WebP를 받는다.
   * 변형이 하나도 없으면(옛 자산이거나 변환이 실패했으면) 원본을 내보낸다.
   */
  async read(assetId: string, width?: number) {
    const row = (await this.#sql<AssetRow[]>`
      select * from media_asset where id = ${assetId} and storage_key <> ''
    `)[0];
    if (!row) throw new MediaError(404, "asset not found");

    const variant = width === undefined ? undefined : await this.#pickVariant(assetId, width);
    const target = variant ?? { storage_key: row.storage_key, mime_type: row.mime_type };
    const stored = await this.#storage.get(target.storage_key);
    // 행은 있는데 바이트가 없으면 저장소가 우리 뒤에서 바뀐 것이다.
    if (!stored) throw new MediaError(404, "asset bytes are missing");
    return { bytes: stored.bytes, mimeType: target.mime_type };
  }

  /** 요청한 폭 이하 중 가장 큰 것. 그것도 없으면 가장 작은 변형. */
  async #pickVariant(assetId: string, width: number) {
    const rows = await this.#sql<VariantRow[]>`
      select * from media_variant where media_asset_id = ${assetId} order by width
    `;
    if (rows.length === 0) return undefined;
    const fitting = rows.filter((row) => row.width <= width);
    return fitting[fitting.length - 1] ?? rows[0];
  }

  async list(userId: string) {
    const rows = await this.#sql<AssetRow[]>`
      select * from media_asset
      where user_id = ${userId} and storage_key <> ''
      order by created_at desc limit 60
    `;
    const widths = await this.#sql<{ media_asset_id: string; width: number }[]>`
      select media_asset_id, width from media_variant
      where user_id = ${userId} order by width
    `;
    return rows.map((row) => assetDto(
      row,
      widths.filter(({ media_asset_id }) => media_asset_id === row.id).map(({ width }) => width),
    ));
  }

  /**
   * 지면에 그림을 한 장 놓는다.
   *
   * 04에는 지금까지 **블록을 새로 만드는 길이 없었다** — 복제와 삭제뿐이었다.
   * 문장은 추출이 만들지만 그림은 사용자가 가져오는 것이라 여기서 처음 열린다.
   */
  async addBlock(userId: string, portfolioId: string, sectionId: string, input: CreateMediaBlock) {
    const parsed = CreateMediaBlockSchema.parse(input);
    return this.#sql.begin(async (transaction) => {
      const section = (await transaction<{ id: string }[]>`
        select portfolio_section.id from portfolio_section
        where portfolio_section.user_id = ${userId}
          and portfolio_section.portfolio_id = ${portfolioId}
          and portfolio_section.id = ${sectionId}
        for update
      `)[0];
      if (!section) throw new MediaError(404, "section not found");

      const asset = (await transaction<AssetRow[]>`
        select * from media_asset where id = ${parsed.assetId} and user_id = ${userId}
      `)[0];
      if (!asset) throw new MediaError(404, "asset not found");

      // 놓을 자리. 지정한 블록 뒤, 아니면 맨 뒤.
      const anchor = parsed.afterBlockId
        ? (await transaction<{ order_no: number }[]>`
          select order_no from block
          where user_id = ${userId} and portfolio_section_id = ${sectionId}
            and id = ${parsed.afterBlockId}
        `)[0]
        : undefined;
      const last = (await transaction<{ order_no: number | null }[]>`
        select max(order_no) as order_no from block
        where user_id = ${userId} and portfolio_section_id = ${sectionId}
      `)[0];
      const at = anchor ? anchor.order_no + 1 : Number(last?.order_no ?? -1) + 1;

      // 뒤엣것을 한 칸씩 민다. `order_no`가 섹션 안에서 유일해야 한다.
      await transaction`
        update block set order_no = order_no + 1
        where user_id = ${userId} and portfolio_section_id = ${sectionId} and order_no >= ${at}
      `;

      // 내보낼 수 있는 폭을 블록에 구워 둔다 — 배포 스냅샷이 그 시점의 지면을
      // 그대로 얼려야 하고, 나중에 변형이 달라져도 나간 페이지가 흔들리면 안 된다.
      const variants = (await transaction<{ width: number }[]>`
        select width from media_variant where media_asset_id = ${asset.id} order by width
      `).map(({ width }) => width);
      const content = PortfolioMediaSchema.parse({
        assetId: asset.id,
        alt: parsed.alt,
        ...(parsed.caption === undefined ? {} : { caption: parsed.caption }),
        frame: parsed.frame,
        width: asset.width,
        height: asset.height,
        variants,
      });
      const block = (await transaction<{ id: string }[]>`
        insert into block (user_id, portfolio_section_id, kind, content, order_no, locked)
        values (${userId}, ${sectionId}, 'media',
                ${transaction.json(content as unknown as JSONValue)}, ${at}, true)
        returning id
      `)[0];
      if (!block) throw new Error("media block insert failed");

      // 사용자가 직접 놓은 것이라 잠긴 채로 들어간다 — 다시 추출해도 지워지지
      // 않는다(P3). 이력에도 한 줄 남아 04c에서 되돌릴 수 있다.
      await transaction`
        insert into revision (user_id, portfolio_id, block_id, actor, change_kind, summary, \`before\`, after)
        values (
          ${userId}, ${portfolioId}, ${block.id}, 'user', 'edit', '이미지를 놓았습니다',
          null, ${transaction.json(content as unknown as JSONValue)}
        )
      `;
      return { blockId: block.id, sectionId, assetId: asset.id };
    });
  }
}
