import { randomBytes, scrypt, timingSafeEqual, type ScryptOptions } from "node:crypto";

function derive(
  password: string,
  salt: Buffer,
  keylen: number,
  options: ScryptOptions,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, keylen, options, (error, key) => {
      if (error) reject(error);
      else resolve(key);
    });
  });
}

const COST = 16_384;
const BLOCK_SIZE = 8;
const PARALLELIZATION = 1;
const SALT_BYTES = 16;
const KEY_BYTES = 64;

const STORED_PATTERN =
  /^scrypt\$(?<cost>\d+)\$(?<blockSize>\d+)\$(?<parallelization>\d+)\$(?<salt>[0-9a-f]{32})\$(?<key>[0-9a-f]{128})$/;

async function deriveKey(
  password: string,
  salt: Buffer,
  cost: number,
  blockSize: number,
  parallelization: number,
): Promise<Buffer> {
  return derive(password.normalize("NFKC"), salt, KEY_BYTES, {
    N: cost,
    r: blockSize,
    p: parallelization,
    // scrypt memory use is roughly 128 * N * r bytes; give node room for it.
    maxmem: 256 * cost * blockSize,
  });
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_BYTES);
  const key = await deriveKey(password, salt, COST, BLOCK_SIZE, PARALLELIZATION);
  return [
    "scrypt",
    COST,
    BLOCK_SIZE,
    PARALLELIZATION,
    salt.toString("hex"),
    key.toString("hex"),
  ].join("$");
}

export async function verifyPassword(
  password: string,
  stored: string | null,
): Promise<boolean> {
  const match = stored ? STORED_PATTERN.exec(stored) : null;
  if (!match?.groups) {
    // Spend comparable time on unknown accounts so login cannot enumerate emails.
    await deriveKey(password, randomBytes(SALT_BYTES), COST, BLOCK_SIZE, PARALLELIZATION);
    return false;
  }

  const { cost, blockSize, parallelization, salt, key } = match.groups;
  const expected = Buffer.from(key!, "hex");
  const actual = await deriveKey(
    password,
    Buffer.from(salt!, "hex"),
    Number.parseInt(cost!, 10),
    Number.parseInt(blockSize!, 10),
    Number.parseInt(parallelization!, 10),
  );
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
