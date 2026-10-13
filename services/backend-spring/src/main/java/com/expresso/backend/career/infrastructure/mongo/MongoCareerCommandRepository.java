package com.expresso.backend.career.infrastructure.mongo;

import java.time.Clock;
import java.time.Instant;
import java.util.*;
import java.util.function.Function;
import com.mongodb.*;
import com.mongodb.client.*;
import com.mongodb.client.model.FindOneAndUpdateOptions;
import com.mongodb.client.model.ReturnDocument;
import org.bson.Document;
import com.expresso.backend.career.application.*;
import com.expresso.backend.career.application.CareerCommandRepository.*;
import com.expresso.backend.career.domain.*;

public final class MongoCareerCommandRepository implements CareerCommandRepository {
    private final MongoClient client;
    private final MongoDatabase db;
    private final Clock clock;
    private final MongoCareerRecordProjector projector = new MongoCareerRecordProjector();
    private final MongoCareerRecordWriter writer = new MongoCareerRecordWriter();
    public MongoCareerCommandRepository(MongoClient client, MongoDatabase db, Clock clock) { this.client=client; this.db=db; this.clock=clock; }
    public Actor authenticate(String token) {
        if (token == null || !token.matches("exps_[A-Za-z0-9_-]{43}")) throw new CareerCommandException(401,"UNAUTHENTICATED");
        var hash=CareerMoveTokens.hash(token);
        var session=db.getCollection("identity_sessions").find(sessionFilter(hash)).first();
        if(session==null || db.getCollection("users").find(new Document("_id",session.getString("userId")).append("deletionRequestedAt",null)).first()==null) throw new CareerCommandException(401,"UNAUTHENTICATED");
        return new Actor(session.getString("userId"),hash);
    }
    private Document sessionFilter(String hash) { return new Document("tokenHash",hash).append("revokedAt",null).append("expiresAt",new Document("$gt",Date.from(clock.instant()))); }
    @Override public <T> T transaction(Actor actor, Function<Operations,T> work) {
        try(var session=client.startSession()) {
            return session.withTransaction(() -> {
                // 인증 시점 이후의 revoke·사용자 삭제와 transaction 안에서 충돌하도록 guard를 갱신합니다.
                var authenticated=db.getCollection("identity_sessions").updateOne(session,sessionFilter(actor.tokenHash()).append("userId",actor.userId()),new Document("$set",new Document("lastSeenAt",Date.from(clock.instant()))));
                if(authenticated.getMatchedCount()!=1) throw new CareerCommandException(401,"UNAUTHENTICATED");
                var active=db.getCollection("users").updateOne(session,new Document("_id",actor.userId()).append("deletionRequestedAt",null),new Document("$inc",new Document("writeVersion",1L)));
                if(active.getMatchedCount()!=1) throw new CareerCommandException(401,"UNAUTHENTICATED");
                return work.apply(new MongoOperations(session,actor.userId()));
            },TransactionOptions.builder().readConcern(ReadConcern.SNAPSHOT).writeConcern(WriteConcern.MAJORITY).readPreference(ReadPreference.primary()).build());
        }
    }
    /** 사용자 세션 경로와 분리하여 동일 Mongo session 안에서 producer의 B1 작업을 수행합니다. */
    public <T> T serviceTransaction(com.expresso.backend.career.integration.ServiceActor actor, Function<MongoCareerProducerOperations,T> work) {
        try(var session=client.startSession()) {
            return session.withTransaction(() -> {
                if(!actor.expiresAt().isAfter(clock.instant())) throw new CareerCommandException(401,"UNAUTHENTICATED");
                var active=db.getCollection("users").updateOne(session,new Document("_id",actor.scope().userId()).append("deletionRequestedAt",null),new Document("$inc",new Document("writeVersion",1L)));
                if(active.getMatchedCount()!=1) throw new CareerCommandException(401,"UNAUTHENTICATED");
                return work.apply(new MongoCareerProducerOperations(db,session,clock,actor.scope(),new MongoOperations(session,actor.scope().userId())));
            },TransactionOptions.builder().readConcern(ReadConcern.SNAPSHOT).writeConcern(WriteConcern.MAJORITY).readPreference(ReadPreference.primary()).build());
        }
    }
    /** mutation credential을 사용자 세션으로 바꾸지 않고 job 범위를 같은 business transaction에서 검증합니다. */
    public <T> T serviceTransaction(com.expresso.backend.career.mutation.MutationServiceActor actor,Function<Operations,T> work) {
        try(var session=client.startSession()) {
            return session.withTransaction(() -> {
                if(!actor.expiresAt().isAfter(clock.instant()))throw new CareerCommandException(401,"UNAUTHENTICATED");
                var active=db.getCollection("users").updateOne(session,new Document("_id",actor.scope().userId()).append("deletionRequestedAt",null),new Document("$inc",new Document("writeVersion",1L)));
                if(active.getMatchedCount()!=1)throw new CareerCommandException(401,"UNAUTHENTICATED");
                new MongoCareerMutationScope(db,session).validate(actor.scope());
                return work.apply(new MongoOperations(session,actor.scope().userId(),true));
            },TransactionOptions.builder().readConcern(ReadConcern.SNAPSHOT).writeConcern(WriteConcern.MAJORITY).readPreference(ReadPreference.primary()).build());
        }
    }
    private final class MongoOperations implements Operations {
        private final ClientSession session;
        private final String user;
        private final boolean scopedMutationWorker;
        private String leasedMutationCategory;
        private final MongoCareerPropertyMutationBusinessGuard businessGuard;
        MongoOperations(ClientSession session,String user) {this(session,user,false);}
        MongoOperations(ClientSession session,String user,boolean scopedMutationWorker) {this.session=session;this.user=user;this.scopedMutationWorker=scopedMutationWorker;this.businessGuard=new MongoCareerPropertyMutationBusinessGuard(db,session,user);}
        private void guardBusinessCategory(String id) {if(!id.equals(leasedMutationCategory))businessGuard.fence(id);}
        private void guardBusinessRecord(String id) {
            var raw=records().find(session,new Document("_id",id).append("userId",user)).first();
            if(raw!=null)guardBusinessCategory(raw.getString("categoryId"));
        }
        private MongoCollection<Document> records() {return db.getCollection("career_records");}
        @Override public StoredRecord record(String id,boolean deleted) {
            var filter=new Document("_id",id).append("userId",user).append("deletedAt",deleted?new Document("$ne",null):null);
            var raw=records().find(session,filter).first();
            if(raw==null) throw CareerCommandException.missing();
            // missing와 명시적인 []를 구분합니다. 레거시 값을 canonical 입력으로 추정하지 않습니다.
            if(!raw.containsKey("propertyValues")) throw new CareerCommandException(409,"CANONICAL_VALUES_NOT_PREPARED");
            return new StoredRecord(projector.project(raw),instant(raw,"deletedAt"),instant(raw,"purgeAfter"),raw.get("referenceVersion") instanceof Number n?n.longValue():0,readUnmapped(raw.get("unmappedProperties")));
        }
        @Override public Category category(String id) {return category(id,null);}
        @Override public Category mutationCategory(MutationJob job) {return category(job.categoryId(),MongoCareerMutationPrivateOptions.rows(user,job));}
        private Category category(String id,List<Document> snapshot) {
            var raw=db.getCollection("career_categories").find(session,new Document("_id",id).append("deletedAt",null).append("$or",List.of(new Document("userId",user),new Document("userId",null)))).first();
            if(raw==null) throw CareerCommandException.missing();
            List<PropertyDefinition> definitions;
            if(raw.get("propertySchemaV2") instanceof List<?>) {
                definitions=raw.getList("propertySchemaV2",Document.class).stream().map(d -> new PropertyDefinition(d.getString("id"),d.getString("key"),d.getString("name"),PropertyDefinitionType.fromStoredName(d.getString("type")),d.getBoolean("required",false),d.getBoolean("system",false),d.get("config",Document.class),((Number)d.get("order")).intValue(),((Number)d.get("version")).longValue(),definitionDeletedAt(d))).toList();
            } else {
                // 기존 제품의 schema 편집을 따라 매번 읽습니다. V2 복사본을 DB에 게시하지 않습니다.
                var result=new ArrayList<PropertyDefinition>();
                raw.get("propertySchema",Document.class).forEach((key,value) -> {
                    var d=(Document)value;
                    if(d.getString("id")==null) throw new CareerCommandException(409,"BUSINESS_SCHEMA_NOT_PREPARED");
                    result.add(new PropertyDefinition(d.getString("id"),key,d.getString("label"),PropertyDefinitionType.fromStoredName(d.getString("type")),d.getBoolean("required",false),d.getBoolean("system",false),Map.of(),result.size(),1,null));
                });
                definitions=List.copyOf(result);
            }
            var options=new MongoCareerPrivatePropertyOptions(db,session,user);
            definitions=snapshot==null?options.overlay(id,definitions):options.overlaySnapshot(definitions,snapshot);
            var categoryVersion=((Number)raw.get("version")).longValue();
            var schemaVersion=raw.get("schemaVersion") instanceof Number n?n.longValue():categoryVersion;
            try {
                return new Category(new CareerCategory(id,raw.getString("key"),raw.getString("name"),definitions),schemaVersion,categoryVersion);
            } catch (IllegalArgumentException error) {
                if ("DUPLICATE_CANONICAL_DEFINITION".equals(error.getMessage())) throw new CareerCommandException(409,error.getMessage());
                throw error;
            }
        }
        @Override public void guardCategory(Category category) {
            guardBusinessCategory(category.business().id());
            var result=db.getCollection("career_categories").updateOne(session,new Document("_id",category.business().id()).append("version",category.categoryVersion()).append("deletedAt",null),new Document("$inc",new Document("writeVersion",1L)));
            if(result.getMatchedCount()!=1) throw new CareerCommandException(409,"CATEGORY_SCHEMA_CHANGED");
        }
        @Override public void guardActive(List<String> ids) {
            for(var id:new TreeSet<>(ids)) {
                var result=records().updateOne(session,new Document("_id",id).append("userId",user).append("deletedAt",null),new Document("$inc",new Document("referenceVersion",1L)));
                if(result.getMatchedCount()!=1) throw CareerCommandException.missing();
            }
        }
        @Override public void insert(CareerRecord record) {
            guardBusinessCategory(record.categoryId());
            var raw=new Document("_id",record.id()).append("userId",user).append("categoryId",record.categoryId());
            raw.putAll(writer.writeUpdate(record).get("$set",Document.class));
            // 현재 validator를 위한 storage 최소값입니다. aggregate/API/mutation의 소유 필드가 아닙니다.
            raw.append("origin","manual").append("properties",new Document()).append("bodyMd","").append("referenceVersion",0L);
            records().insertOne(session,raw);
        }
        @Override public void save(StoredRecord before,CareerRecord after,Instant deletedAt,Instant purgeAfter,Map<String,CareerUnmappedPropertyEnvelope> unmapped,boolean move) {
            guardBusinessCategory(before.business().categoryId());guardBusinessCategory(after.categoryId());
            var update=writer.writeUpdate(after);
            var set=update.get("$set",Document.class);
            if(move) {set.append("categoryId",after.categoryId()).append("unmappedProperties",writeUnmapped(unmapped));}
            if(!Objects.equals(before.deletedAt(),deletedAt)) {
                set.append("deletedAt",deletedAt==null?null:Date.from(deletedAt)).append("purgeAfter",purgeAfter==null?null:Date.from(purgeAfter));
                update.append("$inc",new Document("referenceVersion",1L));
            }
            var result=records().updateOne(session,new Document("_id",before.business().id()).append("userId",user).append("version",before.business().version()).append("deletedAt",before.deletedAt()==null?null:Date.from(before.deletedAt())),update);
            if(result.getMatchedCount()!=1) throw CareerCommandException.stale();
            if(!Objects.equals(before.deletedAt(),deletedAt)) {
                // lifecycle 변경과 같은 transaction에서 종속 계산의 보정 작업을 보장합니다.
                var now=Date.from(clock.instant());
                var payload=new Document("userId",user).append("targetRecordId",after.id()).append("targetRecordVersion",after.version());
                db.getCollection("outbox_events").insertOne(session,new Document("_id",UUID.randomUUID().toString()).append("userId",user)
                        .append("topic","career.computation.target-state").append("payload",payload)
                        .append("idempotencyKey","spring-career-target-state:"+after.id()+":v"+after.version()).append("state","pending").append("attempts",0)
                        .append("availableAt",now).append("createdAt",now).append("updatedAt",now));
            }
        }
        @Override public Replay replay(String key) {
            var raw=db.getCollection("career_command_idempotency").find(session,new Document("userId",user).append("key",key)).first();
            return raw==null?null:new Replay(raw.getString("requestHash"),projector.project(raw.get("response",Document.class)));
        }
        @Override public void remember(String key,String hash,CareerRecord record) {
            var response=new Document("_id",record.id()).append("userId",record.userId()).append("categoryId",record.categoryId()); response.putAll(writer.writeUpdate(record).get("$set",Document.class));
            db.getCollection("career_command_idempotency").insertOne(session,new Document("_id",UUID.randomUUID().toString()).append("userId",user).append("key",key).append("requestHash",hash).append("response",response).append("createdAt",Date.from(clock.instant())));
        }
        @Override public void computation(CareerRecord record,List<String> ids,Map<String,Long> versions,String suffix) {
            var now=Date.from(clock.instant());
            var payload=new Document("userId",user).append("recordId",record.id()).append("changedPropertyIds",ids).append("sourceRecordVersion",record.version());
            if(!versions.isEmpty()) payload.append("sourcePropertyVersions",new Document(versions));
            db.getCollection("outbox_events").insertOne(session,new Document("_id",UUID.randomUUID().toString()).append("userId",user).append("topic","career.computation").append("payload",payload)
                    .append("idempotencyKey","spring-career:"+record.id()+":v"+record.version()+":"+suffix).append("state","pending").append("attempts",0).append("availableAt",now).append("createdAt",now).append("updatedAt",now));
        }
        private MongoCareerRelationMutationOperations relationMutations() {return new MongoCareerRelationMutationOperations(db,session,user,clock,this);}
        @Override public Map<String,Object> relationMutationRead(String id,MutationJob job) {return relationMutations().read(id,job);}
        @Override public CareerPropertyMutationService.Result commitRelationMutation(MutationJob job,CareerRelationPropertyMutationCommand command) {return relationMutations().commit(job,command);}
        private MongoCareerMutationOperations mutations() {return new MongoCareerMutationOperations(db,session,user,clock);}
        @Override public MutationJob mutationJob(String id,String lease,String fingerprint) {
            var job=mutations().job(id,lease,fingerprint);
            // 기존 내부 mutation port도 DB lease를 검증한 뒤에만 같은 job의 business guard를 통과합니다.
            leasedMutationCategory=job.categoryId();return job;
        }
        @Override public MutationReceipt mutationReceipt(String id,String recordId) {return mutations().receipt(id,recordId);}
        @Override public void guardMutation(MutationJob job,String lease) {mutations().guard(job,lease);}
        @Override public PropertyValue mutationTombstone(String recordId,MutationJob job) {return mutations().tombstone(recordId,job);}
        @Override public void mutationTombstone(CareerRecord record,MutationJob job,PropertyValue value) {mutations().tombstone(record,job,value);}
        @Override public void rememberMutation(MutationJob job,CareerRecord record,boolean changed) {mutations().remember(job,record,changed);}
        @Override public RecordLink recordLink(String from,String to,String relation) {
            var raw=db.getCollection("record_links").find(session,new Document("userId",user).append("fromRecordId",from).append("toRecordId",to).append("relation",relation)).first();return raw==null?null:recordLink(raw);
        }
        private RecordLink recordLink(Document raw) {return new RecordLink(raw.getString("_id"),raw.getString("fromRecordId"),raw.getString("toRecordId"),raw.getString("relation"));}
        @Override public List<RecordLink> recordLinks(String id) {
            return db.getCollection("record_links").find(session,new Document("userId",user).append("$or",List.of(new Document("fromRecordId",id),new Document("toRecordId",id)))).sort(new Document("_id",1)).limit(1000).into(new ArrayList<>()).stream().map(this::recordLink).toList();
        }
        @Override public void insertRecordLink(RecordLink link) {
            guardBusinessRecord(link.fromRecordId());guardBusinessRecord(link.toRecordId());
            db.getCollection("record_links").insertOne(session,new Document("_id",link.id()).append("userId",user).append("fromRecordId",link.fromRecordId()).append("toRecordId",link.toRecordId()).append("relation",link.relation()).append("createdBy","user"));
        }
        private Document edgeFilter(Edge edge) {return new Document("userId",user).append("sourceRecordId",edge.sourceRecordId()).append("sourcePropertyId",edge.sourcePropertyId()).append("targetRecordId",edge.targetRecordId());}
        @Override public List<Edge> edges(String id,String propertyId) {
            var raw=db.getCollection("career_record_relations").find(session,new Document("userId",user).append("$or",List.of(new Document("sourceRecordId",id).append("sourcePropertyId",propertyId),new Document("targetRecordId",id).append("inversePropertyId",propertyId)))).limit(2001).into(new ArrayList<>());
            if(raw.size()>2000||raw.stream().map(edge->id.equals(edge.getString("sourceRecordId"))?edge.getString("targetRecordId"):edge.getString("sourceRecordId")).distinct().count()>1000) throw new CareerCommandException(409,"RELATION_TARGET_LIMIT");
            return raw.stream().map(d -> new Edge(d.getString("sourceRecordId"),d.getString("sourcePropertyId"),d.getString("targetRecordId"),d.getString("inversePropertyId"),d.getString("cardinality"),d.getString("deletePolicy"))).toList();
        }
        @Override public void removeEdge(Edge edge) {guardBusinessRecord(edge.sourceRecordId());db.getCollection("career_record_relations").deleteOne(session,edgeFilter(edge));}
        @Override public void insertEdge(Edge edge) {
            guardBusinessRecord(edge.sourceRecordId());
            var now=Date.from(clock.instant());
            var raw=edgeFilter(edge).append("_id",UUID.randomUUID().toString()).append("inversePropertyId",edge.inversePropertyId()).append("cardinality",edge.cardinality()).append("deletePolicy",edge.deletePolicy()).append("createdBy","user").append("createdAt",now).append("updatedAt",now);
            db.getCollection("career_record_relations").insertOne(session,raw);
        }
    }
    private static Instant instant(Document raw,String key) {return raw.getDate(key)==null?null:raw.getDate(key).toInstant();}
    private static Instant definitionDeletedAt(Document definition) {
        // V2 definition은 Fastify 계약대로 ISO 문자열을 저장합니다. record의 BSON Date와 구분합니다.
        var value=definition.get("deletedAt");
        if(value==null) return null;
        if(!(value instanceof String timestamp)) throw new IllegalStateException("PropertyDefinition deletedAt storage 타입이 올바르지 않습니다");
        try {return Instant.parse(timestamp);} catch(java.time.format.DateTimeParseException error) {
            throw new IllegalStateException("PropertyDefinition deletedAt storage 시각이 올바르지 않습니다",error);
        }
    }
    private static Map<String,CareerUnmappedPropertyEnvelope> readUnmapped(Object value) {
        if(value==null) return Map.of();
        if(!(value instanceof Document raw)) throw new IllegalStateException("unmapped shape가 올바르지 않습니다");
        var result=new TreeMap<String,CareerUnmappedPropertyEnvelope>();
        raw.forEach((id,item) -> {
            var envelope=(Document)item; var provenance=envelope.get("provenance",Document.class);
            result.put(id,new CareerUnmappedPropertyEnvelope(envelope.getString("sourceCategoryId"),MongoCareerRecordProjector.projectPropertyValue(envelope.get("propertyValue",Document.class)),
                    new CareerUnmappedPropertyProvenance(provenance.getString("sourcePropertyKey"),provenance.getString("sourcePropertyName"),((Number)provenance.get("sourcePropertyDefinitionVersion")).longValue(),Instant.parse(provenance.getString("preservedAt")),((Number)provenance.get("sourceRecordVersion")).longValue(),CareerUnmappedPropertyReason.fromWireName(provenance.getString("reason")))));
        });
        return new CareerUnmappedProperties(result).values();
    }
    private static Document writeUnmapped(Map<String,CareerUnmappedPropertyEnvelope> values) {
        var raw=new Document(); values.forEach((id,envelope) -> {
            var p=envelope.provenance();
            raw.append(id,new Document("sourceCategoryId",envelope.sourceCategoryId()).append("propertyValue",MongoCareerRecordWriter.writePropertyValue(envelope.propertyValue())).append("provenance",new Document("sourcePropertyKey",p.sourcePropertyKey()).append("sourcePropertyName",p.sourcePropertyName()).append("sourcePropertyDefinitionVersion",p.sourcePropertyDefinitionVersion()).append("preservedAt",p.preservedAt().toString()).append("sourceRecordVersion",p.sourceRecordVersion()).append("reason",p.reason().wireName())));
        }); return raw;
    }
}
