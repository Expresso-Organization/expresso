import type {
  AuthSession,
  AuthenticatedUser,
  IssuedIdentitySession,
  Login,
  PlanCode,
  Signup,
} from "@expresso/contracts";
import type postgres from "postgres";

import { hashPassword, verifyPassword } from "./password.js";
import { createAccessToken, hashAccessToken, isAccessToken } from "./token.js";

const DEFAULT_SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1_000;
const MAX_SESSION_TTL_MS = 90 * 24 * 60 * 60 * 1_000;

interface IssuedSessionRow {
  id: string;
  expires_at: Date | string;
}

interface AuthenticatedSessionRow {
  session_id: string;
  user_id: string;
  email: string;
  display_name: string;
  plan_code: PlanCode;
}

interface RevokedSessionRow {
  id: string;
}

export interface IdentityPrincipal {
  sessionId: string;
  user: AuthenticatedUser;
}

function toAuthenticatedUser(row: CredentialRow): AuthenticatedUser {
  return {
    id: row.id,
    email: row.email,
    displayName: row.display_name,
    planCode: row.plan_code,
  };
}

export interface IssueIdentitySessionInput {
  userId: string;
  ttlMs?: number;
}

interface CredentialRow {
  id: string;
  email: string;
  display_name: string;
  plan_code: PlanCode;
  password_hash: string | null;
  deletion_requested_at: Date | string | null;
}

export class IdentityError extends Error {
  readonly statusCode: number;

  constructor(statusCode: number, message: string) {
    super(message);
    this.name = "IdentityError";
    this.statusCode = statusCode;
  }
}

export class IdentityService {
  readonly #sql: postgres.Sql;

  constructor(sql: postgres.Sql) {
    this.#sql = sql;
  }

  async issueSession(
    input: IssueIdentitySessionInput,
  ): Promise<IssuedIdentitySession> {
    const ttlMs = input.ttlMs ?? DEFAULT_SESSION_TTL_MS;
    if (!Number.isSafeInteger(ttlMs) || ttlMs <= 0 || ttlMs > MAX_SESSION_TTL_MS) {
      throw new RangeError("session TTL must be between 1ms and 90 days");
    }

    const accessToken = createAccessToken();
    const expiresAt = new Date(Date.now() + ttlMs);
    const rows = await this.#sql<IssuedSessionRow[]>`
      insert into identity_session (user_id, token_hash, expires_at)
      values (${input.userId}, ${hashAccessToken(accessToken)}, ${expiresAt})
      returning id, expires_at
    `;
    const session = rows[0];
    if (!session) throw new Error("identity session was not persisted");

    return {
      sessionId: session.id,
      accessToken,
      expiresAt: new Date(session.expires_at).toISOString(),
    };
  }

  /**
   * 10b 회원가입. 기본 카테고리 7종은 시스템 카테고리(user_id is null)이므로
   * 여기서 복제하지 않는다 — 가입 직후부터 목록에 그대로 보인다.
   */
  async signup(input: Signup): Promise<AuthSession> {
    const passwordHash = await hashPassword(input.password);
    const rows = await this.#sql<CredentialRow[]>`
      with created as (
        insert into "user" (email, display_name, plan_id, password_hash)
        select ${input.email}, ${input.displayName}, plan.id, ${passwordHash}
        from plan
        where plan.code = 'free'
        on conflict (email) do nothing
        returning id, email, display_name, plan_id, password_hash, deletion_requested_at
      )
      select
        created.id,
        created.email::text as email,
        created.display_name,
        plan.code as plan_code,
        created.password_hash,
        created.deletion_requested_at
      from created
      join plan on plan.id = created.plan_id
    `;

    const account = rows[0];
    if (!account) {
      // 'free' 요금제가 없으면 서버 구성 오류, 그 외에는 이메일 중복이다.
      const [freePlan] = await this.#sql<{ id: string }[]>`
        select id from plan where code = 'free'
      `;
      if (!freePlan) throw new Error("free plan is not installed");
      throw new IdentityError(409, "email is already registered");
    }

    return {
      user: toAuthenticatedUser(account),
      session: await this.issueSession({ userId: account.id }),
    };
  }

  async login(input: Login): Promise<AuthSession> {
    const rows = await this.#sql<CredentialRow[]>`
      select
        account.id,
        account.email::text as email,
        account.display_name,
        plan.code as plan_code,
        account.password_hash,
        account.deletion_requested_at
      from "user" as account
      join plan on plan.id = account.plan_id
      where account.email = ${input.email}
    `;

    const account = rows[0];
    // 존재하지 않는 계정에도 동일한 해시 비용을 치러 이메일 존재 여부를 흘리지 않는다.
    const matches = await verifyPassword(input.password, account?.password_hash ?? null);
    if (!account || !matches || account.deletion_requested_at !== null) {
      throw new IdentityError(401, "email or password is incorrect");
    }

    return {
      user: toAuthenticatedUser(account),
      session: await this.issueSession({ userId: account.id }),
    };
  }

  async verifyAccessToken(accessToken: string): Promise<IdentityPrincipal | null> {
    if (!isAccessToken(accessToken)) return null;

    const rows = await this.#sql<AuthenticatedSessionRow[]>`
      with valid_session as (
        select session.id, session.user_id
        from identity_session as session
        join "user" as account on account.id = session.user_id
        where session.token_hash = ${hashAccessToken(accessToken)}
          and session.revoked_at is null
          and session.expires_at > now()
          and account.deletion_requested_at is null
      ), touched_session as (
        update identity_session as session
        set last_seen_at = now()
        from valid_session
        where session.id = valid_session.id
        returning session.id, session.user_id
      )
      select
        touched_session.id as session_id,
        account.id as user_id,
        account.email::text as email,
        account.display_name,
        plan.code as plan_code
      from touched_session
      join "user" as account on account.id = touched_session.user_id
      join plan on plan.id = account.plan_id
    `;
    const session = rows[0];
    if (!session) return null;

    return {
      sessionId: session.session_id,
      user: {
        id: session.user_id,
        email: session.email,
        displayName: session.display_name,
        planCode: session.plan_code,
      },
    };
  }

  async revokeOwnedSession(userId: string, sessionId: string): Promise<boolean> {
    const rows = await this.#sql<RevokedSessionRow[]>`
      update identity_session
      set revoked_at = now()
      where id = ${sessionId}
        and user_id = ${userId}
        and revoked_at is null
      returning id
    `;
    return rows.length === 1;
  }
}
