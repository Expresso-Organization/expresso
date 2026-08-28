import { randomUUID } from "node:crypto";
import type { AuthSession, AuthenticatedUser, IssuedIdentitySession, Login, Signup, SocialAuthSession } from "@expresso/contracts";
import { mongoCollections, type UserDoc } from "@expresso/database";
import type { ClientSession } from "mongodb";
import type { MongoContext } from "../../platform/mongodb.js";
import { inTransaction, type MongoTransaction } from "../../platform/mongo-transaction.js";
import type { IdentityApi } from "./index.js";
import { IdentityError, type IdentityPrincipal, type IssueIdentitySessionInput } from "./public.js";
import type { GoogleIdentity } from "./google.js";
import { hashPassword, verifyPassword } from "./password.js";
import { createAccessToken, hashAccessToken, isAccessToken } from "./token.js";
import { requireActiveUser } from "./mongo-user-guard.js";

const emailCollation = { locale: "en", strength: 1, normalization: true };
const duplicate = (error: unknown) => (error as { code?: number })?.code === 11000;

export class MongoIdentityService implements IdentityApi {
  constructor(readonly context: MongoContext) {}

  async #user(account: UserDoc, session?: ClientSession): Promise<AuthenticatedUser> {
    const plan = await mongoCollections(this.context.db).plans.findOne({ _id: account.planId }, session ? { session } : {});
    if (!plan) throw new Error("account plan is not installed");
    return { id: account._id, email: account.email, displayName: account.displayName, planCode: plan.code };
  }

  async #session(tx: MongoTransaction, input: IssueIdentitySessionInput): Promise<IssuedIdentitySession> {
    const ttl = input.ttlMs ?? 30 * 86_400_000;
    if (!Number.isSafeInteger(ttl) || ttl <= 0 || ttl > 90 * 86_400_000) throw new RangeError("session TTL must be between 1ms and 90 days");
    const accessToken = createAccessToken();
    const sessionId = randomUUID();
    const expiresAt = new Date(Date.now() + ttl);
    await mongoCollections(tx.db).identitySessions.insertOne({ _id: sessionId, userId: input.userId, tokenHash: hashAccessToken(accessToken), expiresAt, revokedAt: null, createdAt: new Date() }, { session: tx.session });
    return { sessionId, accessToken, expiresAt: expiresAt.toISOString() };
  }

  issueSession(input: IssueIdentitySessionInput): Promise<IssuedIdentitySession> {
    return inTransaction(this.context, async tx => {
      await requireActiveUser(tx, input.userId);
      return this.#session(tx, input);
    });
  }

  async signup(input: Signup): Promise<AuthSession> {
    const passwordHash = await hashPassword(input.password);
    try {
      return await inTransaction(this.context, async tx => {
        const collections = mongoCollections(tx.db);
        const plan = await collections.plans.findOne({ code: "free" }, { session: tx.session });
        if (!plan) throw new Error("free plan is not installed");
        const account: UserDoc = { _id: randomUUID(), email: input.email, displayName: input.displayName, planId: plan._id, passwordHash, createdAt: new Date(), deletionRequestedAt: null, lifecycleVersion: 0 };
        await collections.users.insertOne(account, { session: tx.session });
        return { user: await this.#user(account, tx.session), session: await this.#session(tx, { userId: account._id }) };
      });
    } catch (error) { if (duplicate(error)) throw new IdentityError(409, "email is already registered"); throw error; }
  }

  async login(input: Login): Promise<AuthSession> {
    const account = await mongoCollections(this.context.db).users.findOne({ email: input.email }, { collation: emailCollation });
    const matches = await verifyPassword(input.password, account?.passwordHash ?? null);
    if (!account || !matches || account.deletionRequestedAt) throw new IdentityError(401, "email or password is incorrect");
    return inTransaction(this.context, async tx => {
      await requireActiveUser(tx, account._id);
      return { user: await this.#user(account, tx.session), session: await this.#session(tx, { userId: account._id }) };
    });
  }

  async signInWithGoogle(identity: GoogleIdentity): Promise<SocialAuthSession> {
    try {
      return await inTransaction(this.context, async tx => {
        const collections = mongoCollections(tx.db);
        const linked = await collections.identityOauthAccounts.findOne({ provider: "google", providerAccountId: identity.subject }, { session: tx.session });
        if (linked) {
          await requireActiveUser(tx, linked.userId);
          const account = await collections.users.findOne({ _id: linked.userId }, { session: tx.session });
          await collections.identityOauthAccounts.updateOne({ _id: linked._id }, { $set: { email: identity.email, lastLoginAt: new Date() } }, { session: tx.session });
          return { user: await this.#user(account!, tx.session), session: await this.#session(tx, { userId: linked.userId }), created: false };
        }
        if (!identity.emailVerified) throw new IdentityError(401, "google account email is not verified");
        const owner = await collections.users.findOne({ email: identity.email }, { session: tx.session, collation: emailCollation });
        if (owner) throw new IdentityError(409, "email belongs to a password account", { reason: "password_confirmation_required", email: identity.email });
        const plan = await collections.plans.findOne({ code: "free" }, { session: tx.session });
        if (!plan) throw new Error("free plan is not installed");
        const account: UserDoc = { _id: randomUUID(), email: identity.email, displayName: (identity.displayName?.trim() || identity.email.split("@")[0] || identity.email).slice(0, 200), planId: plan._id, passwordHash: null, deletionRequestedAt: null, createdAt: new Date(), lifecycleVersion: 0 };
        await collections.users.insertOne(account, { session: tx.session });
        await collections.identityOauthAccounts.insertOne({ _id: randomUUID(), userId: account._id, provider: "google", providerAccountId: identity.subject, email: identity.email, linkedAt: new Date(), lastLoginAt: new Date() }, { session: tx.session });
        return { user: await this.#user(account, tx.session), session: await this.#session(tx, { userId: account._id }), created: true };
      });
    } catch (error) {
      if (duplicate(error)) throw new IdentityError(409, "email belongs to a password account", { reason: "password_confirmation_required", email: identity.email });
      throw error;
    }
  }

  async linkGoogle(identity: GoogleIdentity, password: string): Promise<SocialAuthSession> {
    if (!identity.emailVerified) throw new IdentityError(401, "google account email is not verified");
    const account = await mongoCollections(this.context.db).users.findOne({ email: identity.email }, { collation: emailCollation });
    const matches = await verifyPassword(password, account?.passwordHash ?? null);
    if (!account || !matches || account.deletionRequestedAt) throw new IdentityError(401, "password is incorrect");
    try {
      return await inTransaction(this.context, async tx => {
        await requireActiveUser(tx, account._id);
        await mongoCollections(tx.db).identityOauthAccounts.insertOne({ _id: randomUUID(), userId: account._id, provider: "google", providerAccountId: identity.subject, email: identity.email, linkedAt: new Date(), lastLoginAt: new Date() }, { session: tx.session });
        return { user: await this.#user(account, tx.session), session: await this.#session(tx, { userId: account._id }), created: false };
      });
    } catch (error) { if (duplicate(error)) throw new IdentityError(409, "google account is already linked elsewhere"); throw error; }
  }

  async verifyAccessToken(accessToken: string): Promise<IdentityPrincipal | null> {
    if (!isAccessToken(accessToken)) return null;
    const collections = mongoCollections(this.context.db);
    const session = await collections.identitySessions.findOneAndUpdate(
      { tokenHash: hashAccessToken(accessToken), revokedAt: null, expiresAt: { $gt: new Date() } },
      { $set: { lastSeenAt: new Date() } }, { returnDocument: "after" },
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
