import { loadRuntimeConfig } from "../config/runtime-config.js";
import { AdminService } from "../modules/admin/index.js";
import { CareerService } from "../modules/career/index.js";
import { ConsentService } from "../modules/consent/index.js";
import { IdentityError, IdentityService } from "../modules/identity/index.js";
import { createMongoResource } from "../platform/mongodb.js";

/**
 * 관리자 지정 · 해제. 웹에는 이 길이 없다 — 서버에 들어올 수 있는 운영자만 관리자를 만든다.
 *
 *   pnpm --filter @expresso/backend admin grant <email>
 *   pnpm --filter @expresso/backend admin revoke <email>
 *
 * `services/backend/.env`의 MONGODB_URL · MONGODB_DATABASE로 붙는다. 바꾼 것은 관리 기록에 남는다.
 */
const [command, email] = process.argv.slice(2);
if ((command !== "grant" && command !== "revoke") || !email) {
  console.error("usage: admin grant|revoke <email>");
  process.exit(2);
}

const config = loadRuntimeConfig();
if (!config.mongodbUrl || !config.mongodbDatabase) throw new Error("MongoDB runtime configuration is missing");
const database = createMongoResource(config.mongodbUrl, { databaseName: config.mongodbDatabase });
try {
  const admin = new AdminService(database, { identity: new IdentityService(database), career: new CareerService(database), consent: new ConsentService(database) });
  const result = await admin.setRole(email, command === "grant" ? "admin" : "user");
  console.info(`${command} ${email}: ${result}`);
} catch (error) {
  if (!(error instanceof IdentityError)) throw error;
  console.error(`${command} ${email}: ${error.message}`);
  process.exitCode = 1;
} finally {
  await database.close();
}
