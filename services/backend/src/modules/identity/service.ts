import { randomUUID } from "node:crypto";
import {
  AUTH_MAIL_RESEND_INTERVAL_MS, EMAIL_VERIFICATION_TTL_MS, PASSWORD_RESET_TTL_MS, SESSION_POLICY, TERMS_VERSION,
  type AuthSession, type AuthenticatedUser, type IssuedIdentitySession, type Login, type PasswordResetConfirm, type SocialAuthSession,
} from "@expresso/contracts";
import { mongoCollections, type IdentityTokenDoc, type UserDoc } from "@expresso/database";
import type { ClientSession } from "mongodb";
import type { MongoContext } from "../../platform/mongodb.js";
import { inTransaction, type MongoTransaction } from "../../platform/mongo-transaction.js";
import { MailDeliveryError, type Mailer } from "../../platform/mail/client.js";
import { LogMailer } from "../../platform/mail/log.js";
import type { IdentityApi } from "./index.js";
import { IdentityError, type IdentityPrincipal, type IssueIdentitySessionInput, type SignupInput } from "./public.js";
import type { GoogleIdentity } from "./google.js";
import { emailVerificationMail, passwordResetMail } from "./mail.js";
import { hashPassword, verifyPassword } from "./password.js";
import { createAccessToken, createOneTimeToken, hashAccessToken, isAccessToken, isOneTimeToken, type OneTimeTokenKind } from "./token.js";
import { requireActiveUser } from "./mongo-user-guard.js";

const emailCollation = { locale: "en", strength: 1, normalization: true };
const duplicate = (error: unknown) => (error as { code?: number })?.code === 11000;

export interface IdentityServiceOptions {
  /** 없으면 로그로만 남기는 메일러. 테스트와 개발이 여기로 돈다. */
  mailer?: Mailer | undefined;
  /** 메일 안의 링크가 가리키는 웹 주소. */
  appBaseUrl?: string | undefined;
  /** 로그. 가입 직후 인증 메일 실패처럼 사용자에게 보이지 않는 실패를 남긴다. */
  warn?: ((line: string) => void) | undefined;
}

export class IdentityService implements IdentityApi {
  readonly #mailer: Mailer;
  readonly #appBaseUrl: string;
  readonly #warn: (line: string) => void;

  constructor(readonly context: MongoContext, options: IdentityServiceOptions = {}) {
    this.#mailer = options.mailer ?? new LogMailer();
    this.#appBaseUrl = (options.appBaseUrl ?? "http://localhost:3000").replace(/\/$/, "");
    this.#warn = options.warn ?? ((line) => console.warn(line));
  }

  async #user(account: UserDoc, session?: ClientSession): Promise<AuthenticatedUser> {
    const plan = await mongoCollections(this.context.db).plans.findOne({ _id: account.planId }, session ? { session } : {});
    if (!plan) throw new Error("account plan is not installed");
    return {
      id: account._id, email: account.email, displayName: account.displayName, planCode: plan.code,
      emailVerifiedAt: account.emailVerifiedAt?.toISOString() ?? null,
    };
  }

  /** 동의 기록. 사용자가 읽은 판이 지금 묻는 판과 같을 때만 라우트를 통과하므로 여기서는 시각만 찍는다. */
  #terms(termsVersion: number | undefined): Pick<UserDoc, "termsAcceptedAt" | "termsVersion"> {
    return termsVersion === undefined ? { termsAcceptedAt: null, termsVersion: null } : { termsAcceptedAt: new Date(), termsVersion };
  }

  async #session(tx: MongoTransaction, input: IssueIdentitySessionInput): Promise<IssuedIdentitySession> {
    const persistent = input.persistent ?? true;
    const idleTtlMs = (persistent ? SESSION_POLICY.persistent : SESSION_POLICY.ephemeral).idleMs;
    const accessToken = createAccessToken();
    const sessionId = randomUUID();
    const now = Date.now();
    const expiresAt = new Date(now + idleTtlMs);
    const absoluteExpiresAt = new Date(now + SESSION_POLICY.absoluteMs);
    await mongoCollections(tx.db).identitySessions.insertOne(
      { _id: sessionId, userId: input.userId, tokenHash: hashAccessToken(accessToken), expiresAt, absoluteExpiresAt, idleTtlMs, revokedAt: null, createdAt: new Date(now) },
      { session: tx.session },
    );
    return { sessionId, accessToken, expiresAt: expiresAt.toISOString(), persistent };
  }

  issueSession(input: IssueIdentitySessionInput): Promise<IssuedIdentitySession> {
    return inTransaction(this.context, async tx => {
      await requireActiveUser(tx, input.userId);
      return this.#session(tx, input);
    });
  }

  async signup(input: SignupInput): Promise<AuthSession> {
    const passwordHash = await hashPassword(input.password);
    let result: AuthSession;
    try {
      result = await inTransaction(this.context, async tx => {
        const collections = mongoCollections(tx.db);
        const plan = await collections.plans.findOne({ code: "free" }, { session: tx.session });
        if (!plan) throw new Error("free plan is not installed");
        const account: UserDoc = {
          _id: randomUUID(), email: input.email, displayName: input.displayName, planId: plan._id, passwordHash,
          createdAt: new Date(), deletionRequestedAt: null, lifecycleVersion: 0, emailVerifiedAt: null, ...this.#terms(input.termsVersion),
        };
        await collections.users.insertOne(account, { session: tx.session });
        return { user: await this.#user(account, tx.session), session: await this.#session(tx, { userId: account._id, persistent: input.persistent }) };
      });
    } catch (error) { if (duplicate(error)) throw new IdentityError(409, "email is already registered"); throw error; }

    // 인증 메일은 가입을 막지 않는다. 실패하면 로그에 남기고, 사용자는 앱 안에서 다시 보낼 수 있다.
    try { await this.#sendVerification(result.user.id, result.user.email); }
    catch (error) { this.#warn(JSON.stringify({ level: "warn", message: "verification mail after signup failed", userId: result.user.id, reason: error instanceof MailDeliveryError ? error.reason : "unexpected" })); }
    return result;
  }

  async login(input: Login): Promise<AuthSession> {
    const account = await mongoCollections(this.context.db).users.findOne({ email: input.email }, { collation: emailCollation });
    const matches = await verifyPassword(input.password, account?.passwordHash ?? null);
    if (!account || !matches || account.deletionRequestedAt) throw new IdentityError(401, "email or password is incorrect");
    return inTransaction(this.context, async tx => {
      await requireActiveUser(tx, account._id);
      return { user: await this.#user(account, tx.session), session: await this.#session(tx, { userId: account._id, persistent: input.persistent }) };
    });
  }

  async signInWithGoogle(identity: GoogleIdentity, persistent = true): Promise<SocialAuthSession> {
    try {
      return await inTransaction(this.context, async tx => {
        const collections = mongoCollections(tx.db);
        const linked = await collections.identityOauthAccounts.findOne({ provider: "google", providerAccountId: identity.subject }, { session: tx.session });
        if (linked) {
          await requireActiveUser(tx, linked.userId);
          const account = await collections.users.findOne({ _id: linked.userId }, { session: tx.session });
          await collections.identityOauthAccounts.updateOne({ _id: linked._id }, { $set: { email: identity.email, lastLoginAt: new Date() } }, { session: tx.session });
          return { user: await this.#user(account!, tx.session), session: await this.#session(tx, { userId: linked.userId, persistent }), created: false };
        }
        if (!identity.emailVerified) throw new IdentityError(401, "google account email is not verified");
        const owner = await collections.users.findOne({ email: identity.email }, { session: tx.session, collation: emailCollation });
        if (owner) throw new IdentityError(409, "email belongs to a password account", { reason: "password_confirmation_required", email: identity.email });
        const plan = await collections.plans.findOne({ code: "free" }, { session: tx.session });
        if (!plan) throw new Error("free plan is not installed");
        // Google이 이 주소를 확인했다(`emailVerified`를 위에서 봤다). 동의는 가입 화면의 "계속하면 동의" 문장으로 받았다.
        const account: UserDoc = {
          _id: randomUUID(), email: identity.email, displayName: (identity.displayName?.trim() || identity.email.split("@")[0] || identity.email).slice(0, 200),
          planId: plan._id, passwordHash: null, deletionRequestedAt: null, createdAt: new Date(), lifecycleVersion: 0,
          emailVerifiedAt: new Date(), ...this.#terms(TERMS_VERSION),
        };
        await collections.users.insertOne(account, { session: tx.session });
        await collections.identityOauthAccounts.insertOne({ _id: randomUUID(), userId: account._id, provider: "google", providerAccountId: identity.subject, email: identity.email, linkedAt: new Date(), lastLoginAt: new Date() }, { session: tx.session });
        return { user: await this.#user(account, tx.session), session: await this.#session(tx, { userId: account._id, persistent }), created: true };
      });
    } catch (error) {
      if (duplicate(error)) throw new IdentityError(409, "email belongs to a password account", { reason: "password_confirmation_required", email: identity.email });
      throw error;
    }
  }

  async linkGoogle(identity: GoogleIdentity, password: string, persistent = true): Promise<SocialAuthSession> {
    if (!identity.emailVerified) throw new IdentityError(401, "google account email is not verified");
    const account = await mongoCollections(this.context.db).users.findOne({ email: identity.email }, { collation: emailCollation });
    const matches = await verifyPassword(password, account?.passwordHash ?? null);
    if (!account || !matches || account.deletionRequestedAt) throw new IdentityError(401, "password is incorrect");
    try {
      return await inTransaction(this.context, async tx => {
        await requireActiveUser(tx, account._id);
        const collections = mongoCollections(tx.db);
        await collections.identityOauthAccounts.insertOne({ _id: randomUUID(), userId: account._id, provider: "google", providerAccountId: identity.subject, email: identity.email, linkedAt: new Date(), lastLoginAt: new Date() }, { session: tx.session });
        // 같은 주소를 Google이 확인했고 비밀번호로 소유도 증명했다. 인증이 아직이면 여기서 끝난다.
        if (!account.emailVerifiedAt) {
          account.emailVerifiedAt = new Date();
          await collections.users.updateOne({ _id: account._id }, { $set: { emailVerifiedAt: account.emailVerifiedAt } }, { session: tx.session });
        }
        return { user: await this.#user(account, tx.session), session: await this.#session(tx, { userId: account._id, persistent }), created: false };
      });
    } catch (error) { if (duplicate(error)) throw new IdentityError(409, "google account is already linked elsewhere"); throw error; }
  }

  /**
   * 일회용 토큰 발급. 같은 사람 · 같은 종류의 최신 발급이 간격 안이면 `null` — 부르는 쪽이
   * 조용히 넘길지(재설정) 429로 답할지(인증) 정한다.
   */
  async #issueOneTimeToken(userId: string, kind: OneTimeTokenKind, ttlMs: number): Promise<{ id: string; token: string } | null> {
    const collections = mongoCollections(this.context.db);
    const latest = await collections.identityTokens.findOne({ userId, kind }, { sort: { createdAt: -1 }, projection: { createdAt: 1 } });
    if (latest && Date.now() - latest.createdAt.getTime() < AUTH_MAIL_RESEND_INTERVAL_MS) return null;
    const token = createOneTimeToken(kind);
    const doc: IdentityTokenDoc = { _id: randomUUID(), userId, kind, tokenHash: hashAccessToken(token), expiresAt: new Date(Date.now() + ttlMs), usedAt: null, createdAt: new Date() };
    await collections.identityTokens.insertOne(doc);
    return { id: doc._id, token };
  }

  /** 토큰을 원자적으로 소비한다. 살아 있고 안 쓴 것만 `usedAt`이 찍히며, 두 요청이 동시에 와도 하나만 통과한다. */
  async #consumeOneTimeToken(kind: OneTimeTokenKind, token: string): Promise<IdentityTokenDoc> {
    if (!isOneTimeToken(kind, token)) throw new IdentityError(400, "invalid or expired token");
    const consumed = await mongoCollections(this.context.db).identityTokens.findOneAndUpdate(
      { kind, tokenHash: hashAccessToken(token), usedAt: null, expiresAt: { $gt: new Date() } },
      { $set: { usedAt: new Date() } }, { returnDocument: "after" },
    );
    if (!consumed) throw new IdentityError(400, "invalid or expired token");
    return consumed;
  }

  async #sendVerification(userId: string, email: string): Promise<"sent" | "throttled"> {
    const issued = await this.#issueOneTimeToken(userId, "email_verification", EMAIL_VERIFICATION_TTL_MS);
    if (!issued) return "throttled";
    await this.#mailer.send({ ...emailVerificationMail(email, issued.token, { appBaseUrl: this.#appBaseUrl }, EMAIL_VERIFICATION_TTL_MS / 3_600_000), idempotencyKey: issued.id });
    return "sent";
  }

  /**
   * 재설정 요청. 가입 여부를 응답으로 흘리지 않는다 — 계정이 없어도, 삭제 대기여도, 60초 안의
   * 재요청이어도 아무 말 없이 돌아온다. 메일이 가는 경우만 다르다.
   */
  async requestPasswordReset(email: string): Promise<void> {
    const account = await mongoCollections(this.context.db).users.findOne({ email }, { collation: emailCollation });
    if (!account || account.deletionRequestedAt) return;
    const issued = await this.#issueOneTimeToken(account._id, "password_reset", PASSWORD_RESET_TTL_MS);
    if (!issued) return;
    try {
      await this.#mailer.send({ ...passwordResetMail(account.email, issued.token, { appBaseUrl: this.#appBaseUrl }, PASSWORD_RESET_TTL_MS / 60_000), idempotencyKey: issued.id });
    } catch (error) {
      if (error instanceof MailDeliveryError) throw new IdentityError(503, "mail delivery failed");
      throw error;
    }
  }

  /**
   * 재설정 확인. 비밀번호 갱신 · 기존 세션 전부 취소 · 새 세션 발급을 한 트랜잭션에 넣는다 —
   * 둘 중 하나만 남으면 옛 비밀번호로 열린 세션이 살거나, 비밀번호는 바뀌었는데 들어올 수 없다.
   */
  async confirmPasswordReset(input: PasswordResetConfirm): Promise<AuthSession> {
    const consumed = await this.#consumeOneTimeToken("password_reset", input.token);
    const passwordHash = await hashPassword(input.password);
    return inTransaction(this.context, async tx => {
      await requireActiveUser(tx, consumed.userId);
      const collections = mongoCollections(tx.db);
      const account = await collections.users.findOne({ _id: consumed.userId }, { session: tx.session });
      if (!account) throw new IdentityError(400, "invalid or expired token");
      await collections.users.updateOne({ _id: account._id }, { $set: { passwordHash } }, { session: tx.session });
      await collections.identitySessions.updateMany({ userId: account._id, revokedAt: null }, { $set: { revokedAt: new Date() } }, { session: tx.session });
      account.passwordHash = passwordHash;
      return { user: await this.#user(account, tx.session), session: await this.#session(tx, { userId: account._id, persistent: input.persistent }) };
    });
  }

  /** 인증 메일 재발송. 이미 인증이면 409, 60초 안이면 429. */
  async requestEmailVerification(userId: string): Promise<void> {
    const account = await mongoCollections(this.context.db).users.findOne({ _id: userId, deletionRequestedAt: null });
    if (!account) throw new IdentityError(401, "account is pending deletion");
    if (account.emailVerifiedAt) throw new IdentityError(409, "email is already verified");
    let outcome: "sent" | "throttled";
    try { outcome = await this.#sendVerification(account._id, account.email); }
    catch (error) {
      if (error instanceof MailDeliveryError) throw new IdentityError(503, "mail delivery failed");
      throw error;
    }
    if (outcome === "throttled") throw new IdentityError(429, "verification mail was sent recently");
  }

  async confirmEmailVerification(token: string): Promise<AuthenticatedUser> {
    const consumed = await this.#consumeOneTimeToken("email_verification", token);
    const collections = mongoCollections(this.context.db);
    // 이미 인증된 계정의 옛 링크도 성공으로 답한다 — 사용자가 고칠 것이 없는 상황이다.
    const account = await collections.users.findOneAndUpdate(
      { _id: consumed.userId, deletionRequestedAt: null },
      [{ $set: { emailVerifiedAt: { $ifNull: ["$emailVerifiedAt", "$$NOW"] } } }],
      { returnDocument: "after" },
    );
    if (!account) throw new IdentityError(400, "invalid or expired token");
    return this.#user(account);
  }

  async verifyAccessToken(accessToken: string): Promise<IdentityPrincipal | null> {
    if (!isAccessToken(accessToken)) return null;
    const collections = mongoCollections(this.context.db);
    // 활동 기준 연장. 새 만료 = min(now + idle, 절대 상한). 0009 이전 문서는 두 필드가 없어
    // 유지 모드(30일) · `createdAt + 90일`로 읽는다 — 배포 전 세션이 그대로 살아 있게.
    const session = await collections.identitySessions.findOneAndUpdate(
      { tokenHash: hashAccessToken(accessToken), revokedAt: null, expiresAt: { $gt: new Date() } },
      [{
        $set: {
          lastSeenAt: "$$NOW",
          expiresAt: {
            $min: [
              { $add: ["$$NOW", { $ifNull: ["$idleTtlMs", SESSION_POLICY.persistent.idleMs] }] },
              { $ifNull: ["$absoluteExpiresAt", { $add: ["$createdAt", SESSION_POLICY.absoluteMs] }] },
            ],
          },
        },
      }],
      { returnDocument: "after" },
    );
    if (!session) return null;
    const account = await collections.users.findOne({ _id: session.userId, deletionRequestedAt: null });
    if (!account) return null;
    return { sessionId: session._id, user: await this.#user(account) };
  }

  async revokeOwnedSession(userId: string, sessionId: string): Promise<boolean> {
    const result = await mongoCollections(this.context.db).identitySessions.updateOne(
      { _id: sessionId, userId, revokedAt: null }, { $set: { revokedAt: new Date() } },
    );
    return result.modifiedCount === 1;
  }
}

export { IdentityService as MongoIdentityService };
