import { randomUUID } from "node:crypto";

import { CONSENT_POLICY_VERSION, type CareerCategory, type CareerProperties, type CareerPropertyValueV2, type DummyAccount } from "@expresso/contracts";
import { mongoCollections, stableCareerId, type AdminAuditEventDoc } from "@expresso/database";

import type { MongoContext } from "../../platform/mongodb.js";
import { inTransaction } from "../../platform/mongo-transaction.js";
import { purgeUserNow } from "../account-lifecycle/index.js";
import { CareerError, multiSelectValueByNames, selectValueByName, type CareerService } from "../career/index.js";
import type { ConsentService } from "../consent/index.js";
import type { IdentityPrincipal, IdentityService } from "../identity/index.js";
import { PERSONAS, personaEmail, type Persona, type PersonaPropertyValue, type PersonaRecord } from "./personas/index.js";

export class AdminError extends Error {
  constructor(readonly statusCode: number, message: string) {
    super(message);
    this.name = "AdminError";
  }
}

export interface AdminServiceDependencies {
  identity: Pick<IdentityService, "createDummyAccount" | "setRole" | "actAs" | "stopActing">;
  career: Pick<CareerService, "listCategories" | "createRecord" | "getRecord" | "updateRecord" | "saveProfile" | "replaceTargets">;
  consent: Pick<ConsentService, "grant">;
}

/** 더미 계정 ID는 원본 키에서 정한다. 다시 채워도 같은 ID라 대신 로그인 중인 세션이 그대로 이어진다. */
const dummyUserId = (key: string) => stableCareerId(`dummy-account:${key}`);

/** `"2021-03/2023-02"` · `"2023-03/"` · `"2023-03"` → 날짜 범위 값. 달의 첫날로 적는다. */
function dateValue(raw: string) {
  const [start, end] = raw.split("/");
  return { type: "date" as const, value: { start: `${start}-01`, end: end ? `${end}-01` : null, timezone: null } };
}

/**
 * 관리자 기능. 더미 계정을 저장소의 원본(`personas/`)으로 만들고 지우며, 관리자 본인 세션을
 * 더미 계정으로 돌린다. 모든 동작은 `admin_audit_events`에 한 행씩 남긴다.
 *
 * 계정 · 동의 · 기록은 각 모듈의 서비스로 만든다. 기록을 DB에 직접 넣으면 카테고리 스키마 검증과
 * 선택지 추가를 건너뛴다.
 */
export class AdminService {
  constructor(readonly context: MongoContext, readonly deps: AdminServiceDependencies) {}

  async #audit(event: Omit<AdminAuditEventDoc, "_id" | "at">): Promise<void> {
    await mongoCollections(this.context.db).adminAuditEvents.insertOne({ _id: randomUUID(), ...event, at: new Date() });
  }

  #persona(key: string): Persona {
    const persona = PERSONAS.find((item) => item.key === key);
    if (!persona) throw new AdminError(404, "dummy persona not found");
    return persona;
  }

  async listDummies(): Promise<DummyAccount[]> {
    const db = mongoCollections(this.context.db);
    const keys = PERSONAS.map(({ key }) => key);
    const accounts = await db.users.find({ dummyKey: { $in: keys } }).toArray();
    const starts = await db.adminAuditEvents.aggregate<{ _id: string; at: Date; actorUserId: string | null }>([
      { $match: { action: "impersonation.start", dummyKey: { $in: keys } } },
      { $sort: { at: -1 } },
      { $group: { _id: "$dummyKey", at: { $first: "$at" }, actorUserId: { $first: "$actorUserId" } } },
    ]).toArray();
    const actorIds = starts.map(({ actorUserId }) => actorUserId).filter((id): id is string => id !== null);
    const actors = new Map((await db.users.find({ _id: { $in: actorIds } }).project<{ _id: string; displayName: string }>({ displayName: 1 }).toArray()).map((user) => [user._id, user.displayName]));
    return Promise.all(PERSONAS.map(async (persona): Promise<DummyAccount> => {
      const account = accounts.find((item) => item.dummyKey === persona.key);
      const start = starts.find((item) => item._id === persona.key);
      const recordCount = account ? (await this.deps.career.listCategories(account._id)).reduce((sum, category) => sum + category.recordCount, 0) : 0;
      return {
        key: persona.key, displayName: persona.displayName, email: personaEmail(persona), headline: persona.headline,
        sourceRecordCount: persona.records.length,
        account: account ? { userId: account._id, recordCount, createdAt: account.createdAt.toISOString() } : null,
        lastImpersonation: start ? { at: start.at.toISOString(), adminDisplayName: start.actorUserId ? actors.get(start.actorUserId) ?? null : null } : null,
      };
    }));
  }

  async #summary(key: string): Promise<DummyAccount> {
    return (await this.listDummies()).find((item) => item.key === key)!;
  }

  async createDummy(actor: IdentityPrincipal, key: string): Promise<DummyAccount> {
    const persona = this.#persona(key);
    await this.#build(persona);
    await this.#audit({ actorUserId: actor.owner.userId, action: "dummy.create", targetUserId: dummyUserId(key), dummyKey: key });
    return this.#summary(key);
  }

  /** 계정의 모든 데이터를 지우고 원본으로 다시 만든다. 생성한 포트폴리오도 함께 지워진다. */
  async refillDummy(actor: IdentityPrincipal, key: string): Promise<DummyAccount> {
    const persona = this.#persona(key);
    await this.#purge(key);
    await this.#build(persona);
    await this.#audit({ actorUserId: actor.owner.userId, action: "dummy.refill", targetUserId: dummyUserId(key), dummyKey: key });
    return this.#summary(key);
  }

  async deleteDummy(actor: IdentityPrincipal, key: string): Promise<DummyAccount> {
    this.#persona(key);
    await this.#purge(key);
    await this.#audit({ actorUserId: actor.owner.userId, action: "dummy.delete", targetUserId: dummyUserId(key), dummyKey: key });
    return this.#summary(key);
  }

  async startImpersonation(actor: IdentityPrincipal, key: string): Promise<void> {
    this.#persona(key);
    const account = await mongoCollections(this.context.db).users.findOne({ dummyKey: key, deletionRequestedAt: null });
    if (!account) throw new AdminError(404, "dummy account not found");
    const previous = await this.deps.identity.actAs(actor.sessionId, account._id);
    // 다른 더미 계정에서 바로 옮겨 왔으면 그 대신 로그인은 여기서 끝난 것이다.
    if (previous) await this.#auditEnd(actor, previous);
    await this.#audit({ actorUserId: actor.owner.userId, action: "impersonation.start", targetUserId: account._id, dummyKey: key });
  }

  async #auditEnd(actor: IdentityPrincipal, targetUserId: string): Promise<void> {
    const target = await mongoCollections(this.context.db).users.findOne({ _id: targetUserId }, { projection: { dummyKey: 1 } });
    await this.#audit({ actorUserId: actor.owner.userId, action: "impersonation.end", targetUserId, dummyKey: target?.dummyKey ?? null });
  }

  /** 대신 로그인을 끝낸다. 대신 로그인 중이 아니었으면 아무것도 하지 않는다. */
  async endImpersonation(actor: IdentityPrincipal): Promise<void> {
    const targetUserId = await this.deps.identity.stopActing(actor.sessionId);
    if (targetUserId) await this.#auditEnd(actor, targetUserId);
  }

  /** CLI 전용. 행위자가 서버 운영자이므로 `actorUserId`는 null로 남긴다. */
  async setRole(email: string, role: "user" | "admin"): Promise<"changed" | "unchanged"> {
    const changed = await this.deps.identity.setRole(email, role);
    if (!changed) return "unchanged";
    await this.#audit({ actorUserId: null, action: role === "admin" ? "admin.grant" : "admin.revoke", targetUserId: changed.userId, dummyKey: null });
    return "changed";
  }

  async #purge(key: string): Promise<void> {
    const account = await mongoCollections(this.context.db).users.findOne({ dummyKey: key }, { projection: { _id: 1 } });
    if (!account) return;
    await inTransaction(this.context, (tx) => purgeUserNow(tx, account._id));
  }

  async #build(persona: Persona): Promise<void> {
    const userId = await this.deps.identity.createDummyAccount({
      id: dummyUserId(persona.key), dummyKey: persona.key, email: personaEmail(persona), displayName: persona.displayName, planCode: "team",
    });
    await this.deps.consent.grant(userId, ["job_posting_analysis", "career_records"], CONSENT_POLICY_VERSION);
    await this.deps.career.saveProfile(userId, { ...persona.profile, targetRoles: [...persona.profile.targetRoles] });

    const categoryByKey = new Map((await this.deps.career.listCategories(userId)).map((category) => [category.key, category]));
    const created = new Map<PersonaRecord, string>();
    for (const [index, record] of persona.records.entries()) {
      const category = categoryByKey.get(record.category);
      if (!category) throw new Error(`category ${record.category} is missing for ${persona.key}`);
      const properties = await this.#properties(userId, category, record);
      // 같은 원본 줄은 같은 키 — 중간에 끊긴 만들기를 다시 돌려도 기록이 겹치지 않는다.
      const { record: saved } = await this.deps.career.createRecord(userId, stableCareerId(`dummy-record:${persona.key}:${index}`), { categoryId: category.id, title: record.title, properties, bodyMd: record.body });
      const status = record.status ?? "organized";
      if (status !== saved.status) await this.#write(userId, saved.id, saved.version, (version) => this.deps.career.updateRecord(userId, saved.id, version, { status }));
      created.set(record, saved.id);
    }

    const byRef = new Map(persona.records.flatMap((record) => record.ref ? [[record.ref, created.get(record)!] as const] : []));
    for (const record of persona.records) {
      const category = categoryByKey.get(record.category)!;
      for (const [key, value] of Object.entries(record.props ?? {})) {
        const definition = category.propertySchemaV2.find((item) => item.key === key && item.deletedAt === null);
        if (definition?.type !== "relation") continue;
        const sourceId = created.get(record)!;
        const targetIds = (value as { refs: readonly string[] }).refs.map((ref) => byRef.get(ref)!);
        const current = await this.deps.career.getRecord(userId, sourceId);
        await this.#write(userId, sourceId, current.version, (version) => this.deps.career.replaceTargets(userId, sourceId, definition.id, targetIds, version));
      }
    }
  }

  /**
   * 기록 버전을 조건으로 쓴다. 만드는 동안에도 워커의 계산(`career.computation`)과 관계 연결이
   * 기록 버전을 올린다. 412를 받으면 최신 버전을 다시 읽어 쓴다. 다시 읽은 버전이 실패한 버전과
   * 같으면 버전 때문이 아니므로 오류를 그대로 낸다.
   */
  async #write<T>(userId: string, recordId: string, version: number, write: (version: number) => Promise<T>): Promise<T> {
    for (let current = version; ;) {
      try { return await write(current); }
      catch (error) {
        if (!(error instanceof CareerError) || error.statusCode !== 412) throw error;
        const latest = (await this.deps.career.getRecord(userId, recordId)).version;
        if (latest === current) throw error;
        current = latest;
      }
    }
  }

  /** 원본의 이름 · 문자열 값을 카테고리 정의에 맞는 V2 값으로 바꾼다. 관계는 기록을 다 만든 뒤 잇는다. */
  async #properties(userId: string, category: CareerCategory, record: PersonaRecord): Promise<CareerProperties> {
    const properties: CareerProperties = {};
    for (const [key, raw] of Object.entries(record.props ?? {}) as [string, PersonaPropertyValue][]) {
      const definition = category.propertySchemaV2.find((item) => item.key === key && item.deletedAt === null);
      if (!definition) throw new Error(`unknown property ${record.category}.${key}`);
      if (definition.type === "relation") continue;
      if (definition.type === "text" || definition.type === "url") properties[key] = { type: definition.type, value: raw as string };
      else if (definition.type === "date") properties[key] = dateValue(raw as string);
      else if (definition.type === "select" || definition.type === "multi_select") {
        const value: CareerPropertyValueV2 | null = await inTransaction(this.context, async (tx) => definition.type === "select"
          ? selectValueByName(tx, userId, category.id, key, raw as string)
          : multiSelectValueByNames(tx, userId, category.id, key, raw as readonly string[]));
        if (!value) throw new Error(`property ${record.category}.${key} cannot take options`);
        properties[key] = value;
      } else throw new Error(`property type ${definition.type} is not supported in personas`);
    }
    return properties;
  }
}
