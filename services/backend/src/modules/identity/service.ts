import { type IdentityPrincipal, type IssueIdentitySessionInput, IdentityError } from "./public.js";
export { type IdentityPrincipal, type IssueIdentitySessionInput, IdentityError } from "./public.js";
import { randomUUID } from "node:crypto";
import type {
  AuthSession,
  AuthenticatedUser,
  IssuedIdentitySession,
  Login,
  PlanCode,
  Signup,
  SocialAuthSession,
} from "@expresso/contracts";
import type { SqlTag } from "../../platform/mysql.js";

import type { GoogleIdentity } from "./google.js";
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

function toAuthenticatedUser(row: CredentialRow): AuthenticatedUser {
  return {
    id: row.id,
    email: row.email,
    displayName: row.display_name,
    planCode: row.plan_code,
  };
}

interface CredentialRow {
  id: string;
  email: string;
  display_name: string;
  plan_code: PlanCode;
  password_hash: string | null;
  deletion_requested_at: Date | string | null;
}

/** postgres.js가 유일 제약 위반에 붙이는 SQLSTATE. */
const UNIQUE_VIOLATION = "23505";

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as { code?: unknown }).code === UNIQUE_VIOLATION
  );
}

/**
 * 표시 이름이 없는 Google 계정도 있다. 그때는 이메일 앞부분을 쓴다 —
 * `display_name`은 not null이고, 빈 문자열로 계정을 만들 수는 없다.
 */
function displayNameFor(identity: GoogleIdentity): string {
  const fromProvider = identity.displayName?.trim();
  if (fromProvider) return fromProvider.slice(0, 200);
  const localPart = identity.email.split("@")[0] ?? "";
  return (localPart.length > 0 ? localPart : identity.email).slice(0, 200);
}

export class IdentityService {
  readonly #sql: SqlTag;

  constructor(sql: SqlTag) {
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
    // 이메일이 이미 있으면 새 줄이 생기지 않는다 — 우리가 만든 id 로 다시 읽어
    // 방금 만든 계정인지 가려낸다.
    const newUserId = randomUUID();
    await this.#sql`
      insert ignore into \`user\` (id, email, display_name, plan_id, password_hash)
      select ${newUserId}, ${input.email}, ${input.displayName}, plan.id, ${passwordHash}
      from plan
      where plan.code = 'free'
    `;
    const rows = await this.#sql<CredentialRow[]>`
      select
        account.id,
        account.email as email,
        account.display_name,
        plan.code as plan_code,
        account.password_hash,
        account.deletion_requested_at
      from \`user\` as account
      join plan on plan.id = account.plan_id
      where account.id = ${newUserId}
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
        account.email as email,
        account.display_name,
        plan.code as plan_code,
        account.password_hash,
        account.deletion_requested_at
      from \`user\` as account
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

  /**
   * Google으로 들어온다.
   *
   * **이메일이 아니라 `sub`로 찾는다.** 이미 이어 둔 계정이면 그 사람이고, 그때는
   * 이메일이 무엇으로 바뀌어 있든 상관없다.
   *
   * 처음 보는 `sub`인데 같은 이메일의 계정이 이미 있으면 **세션을 주지 않는다.**
   * 이 서비스에는 이메일 인증이 없어서 "주소가 같으니 같은 사람"이 성립하지
   * 않는다 — 남의 주소로 먼저 가입해 둔 계정에 진짜 주인을 넣어 주는 셈이 된다.
   * 409로 되돌려 비밀번호를 확인받는다(`linkGoogle`).
   */
  async signInWithGoogle(identity: GoogleIdentity): Promise<SocialAuthSession> {
    const linked = await this.#sql<CredentialRow[]>`
      select
        account.id,
        account.email as email,
        account.display_name,
        plan.code as plan_code,
        account.password_hash,
        account.deletion_requested_at
      from identity_oauth_account as oauth
      join \`user\` as account on account.id = oauth.user_id
      join plan on plan.id = account.plan_id
      where oauth.provider = 'google'
        and oauth.provider_account_id = ${identity.subject}
    `;

    const existing = linked[0];
    if (existing) {
      if (existing.deletion_requested_at !== null) {
        throw new IdentityError(401, "account is pending deletion");
      }
      await this.#sql`
        update identity_oauth_account
        set last_login_at = now(6), email = ${identity.email}
        where provider = 'google' and provider_account_id = ${identity.subject}
      `;
      return {
        user: toAuthenticatedUser(existing),
        session: await this.issueSession({ userId: existing.id }),
        created: false,
      };
    }

    // Google이 이 주소를 보증하지 않으면 우리도 근거가 없다.
    if (!identity.emailVerified) {
      throw new IdentityError(401, "google account email is not verified");
    }

    const owner = await this.#sql<{ id: string }[]>`
      select id from \`user\` where email = ${identity.email}
    `;
    if (owner[0]) {
      throw new IdentityError(409, "email belongs to a password account", {
        reason: "password_confirmation_required",
        email: identity.email,
      });
    }

    return this.#createAccountFromGoogle(identity);
  }

  /**
   * 비밀번호를 확인하고 잇는다. 확인이 곧 소유 증명이다.
   */
  async linkGoogle(
    identity: GoogleIdentity,
    password: string,
  ): Promise<SocialAuthSession> {
    if (!identity.emailVerified) {
      throw new IdentityError(401, "google account email is not verified");
    }

    const rows = await this.#sql<CredentialRow[]>`
      select
        account.id,
        account.email as email,
        account.display_name,
        plan.code as plan_code,
        account.password_hash,
        account.deletion_requested_at
      from \`user\` as account
      join plan on plan.id = account.plan_id
      where account.email = ${identity.email}
    `;

    const account = rows[0];
    // login()과 같은 이유로 계정이 없을 때도 같은 해시 비용을 치른다.
    const matches = await verifyPassword(password, account?.password_hash ?? null);
    if (!account || !matches || account.deletion_requested_at !== null) {
      throw new IdentityError(401, "password is incorrect");
    }

    try {
      await this.#sql`
        insert into identity_oauth_account
          (user_id, provider, provider_account_id, email, last_login_at)
        values (${account.id}, 'google', ${identity.subject}, ${identity.email}, now(6))
      `;
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
      // 이 Google 계정이 이미 남에게 붙어 있거나, 이 사용자가 이미 다른 Google을 달았다.
      throw new IdentityError(409, "google account is already linked elsewhere");
    }

    return {
      user: toAuthenticatedUser(account),
      session: await this.issueSession({ userId: account.id }),
      created: false,
    };
  }

  /**
   * 처음 보는 사람. 비밀번호 없는 계정으로 만든다(`password_hash`는 null).
   *
   * 계정과 연결을 한 트랜잭션에 넣는다 — 둘 중 하나만 남으면 다음 로그인이
   * 같은 이메일에 막혀 영영 못 들어온다.
   */
  async #createAccountFromGoogle(
    identity: GoogleIdentity,
  ): Promise<SocialAuthSession> {
    const created = await this.#sql.begin(async (tx) => {
      const newUserId = randomUUID();
      await tx`
        insert ignore into \`user\` (id, email, display_name, plan_id, password_hash)
        select ${newUserId}, ${identity.email}, ${displayNameFor(identity)}, plan.id, null
        from plan
        where plan.code = 'free'
      `;
      const rows = await tx<CredentialRow[]>`
        select
          account.id,
          account.email as email,
          account.display_name,
          plan.code as plan_code,
          account.password_hash,
          account.deletion_requested_at
        from \`user\` as account
        join plan on plan.id = account.plan_id
        where account.id = ${newUserId}
      `;

      const account = rows[0];
      if (!account) {
        const [freePlan] = await tx<{ id: string }[]>`
          select id from plan where code = 'free'
        `;
        if (!freePlan) throw new Error("free plan is not installed");
        // 같은 순간에 같은 이메일이 들어왔다. 비밀번호 확인 경로로 보낸다.
        throw new IdentityError(409, "email belongs to a password account", {
          reason: "password_confirmation_required",
          email: identity.email,
        });
      }

      await tx`
        insert into identity_oauth_account
          (user_id, provider, provider_account_id, email, last_login_at)
        values (${account.id}, 'google', ${identity.subject}, ${identity.email}, now(6))
      `;
      return account;
    });

    return {
      user: toAuthenticatedUser(created),
      session: await this.issueSession({ userId: created.id }),
      created: true,
    };
  }

  async verifyAccessToken(accessToken: string): Promise<IdentityPrincipal | null> {
    if (!isAccessToken(accessToken)) return null;

    // MySQL 은 CTE 안에서 갱신하지 못한다 — 세션을 찾아 읽고, 본 시각은 따로 찍는다.
    const tokenHash = hashAccessToken(accessToken);
    const rows = await this.#sql<AuthenticatedSessionRow[]>`
      select
        session.id as session_id,
        account.id as user_id,
        account.email as email,
        account.display_name,
        plan.code as plan_code
      from identity_session as session
      join \`user\` as account on account.id = session.user_id
      join plan on plan.id = account.plan_id
      where session.token_hash = ${tokenHash}
        and session.revoked_at is null
        and session.expires_at > now(6)
        and account.deletion_requested_at is null
    `;
    if (rows[0]) {
      await this.#sql`
        update identity_session set last_seen_at = now(6) where id = ${rows[0].session_id}
      `;
    }
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
      set revoked_at = now(6)
      where id = ${sessionId}
        and user_id = ${userId}
        and revoked_at is null
      returning id
    `;
    return rows.length === 1;
  }
}
