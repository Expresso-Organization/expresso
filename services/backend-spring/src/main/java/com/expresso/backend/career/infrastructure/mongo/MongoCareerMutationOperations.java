package com.expresso.backend.career.infrastructure.mongo;

import java.math.BigDecimal;
import java.time.*;
import java.util.*;
import com.mongodb.client.*;
import org.bson.Document;
import org.bson.types.Decimal128;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;
import com.expresso.backend.career.application.*;
import com.expresso.backend.career.application.CareerCommandRepository.*;
import com.expresso.backend.career.domain.*;

/** canonical commit와 같은 session에서만 사용되는 mutation metadata 매핑입니다. */
final class MongoCareerMutationOperations {
    private final MongoDatabase db;private final ClientSession session;private final String user;private final Clock clock;
    private final JsonMapper json=JsonMapper.builder().build();
    MongoCareerMutationOperations(MongoDatabase db,ClientSession session,String user,Clock clock) {this.db=db;this.session=session;this.user=user;this.clock=clock;}
    MutationJob job(String id,String lease,String fingerprint) {
        var raw=db.getCollection("career_property_mutations").find(session,leaseFilter(id,lease,fingerprint)).first();
        if(raw==null) throw new CareerCommandException(409,"MUTATION_LEASE_LOST");
        var planJson=raw.getString("planJson");
        if(!CareerMoveTokens.hash(planJson).equals(fingerprint)) throw new CareerCommandException(409,"MUTATION_PLAN_CHANGED");
        var plan=json.readTree(planJson);var operation=plan.get("operation");
        if(!user.equals(plan.get("userId").asText()) || !raw.getString("categoryId").equals(plan.get("categoryId").asText())) throw new CareerCommandException(409,"MUTATION_SCOPE_CHANGED");
        var target=definition(operation.get("target"));var source=operation.get("source").isNull()?null:definition(operation.get("source"));
        JsonNode snapshotTarget=null;var uniqueIds=new HashSet<String>();
        for(var definition:plan.get("definitions")) {if(!uniqueIds.add(definition.get("id").asText()))throw new CareerCommandException(409,"MUTATION_PLAN_CHANGED");if(definition.get("id").asText().equals(target.id()))snapshotTarget=definition;}
        if(!semanticEqual(snapshotTarget,operation.get("target")))throw new CareerCommandException(409,"MUTATION_PLAN_CHANGED");
        var kind=operation.get("kind").asText();
        if(!Set.of("default","conversion","deletion","restoration").contains(kind) || !raw.getString("propertyId").equals(target.id())
                || (source!=null && !source.id().equals(target.id())) || (kind.equals("default")!=(source==null))
                || (kind.equals("deletion")!=(target.deletedAt()!=null))) throw new CareerCommandException(409,"MUTATION_PLAN_CHANGED");
        var category=db.getCollection("career_categories").find(session,new Document("_id",raw.getString("categoryId")).append("userId",user).append("isSystem",false)).first();
        if(category==null || !semanticEqual(plan.get("definitions"),json.valueToTree(category.get("propertySchemaV2")))) throw new CareerCommandException(409,"CATEGORY_SCHEMA_CHANGED");
        var recordIds=new ArrayList<String>();plan.get("recordIds").forEach(node -> recordIds.add(node.asText()));
        return new MutationJob(id,raw.getString("categoryId"),plan.get("categoryVersion").asLong(),plan.get("schemaVersion").asLong(),plan.get("definitions").toString(),kind,source,target,
                operation.get("defaultValue").isNull()?null:wireValue(operation.get("defaultValue")),operation.get("confirmLossy").asBoolean(),List.copyOf(recordIds),fingerprint,raw.getString("privateOptionSnapshotJson"),raw.getString("privateOptionSnapshotFingerprint"));
    }
    private Document leaseFilter(String id,String lease,String fingerprint) {return new Document("_id",id).append("userId",user).append("status","running").append("active",true).append("leaseToken",lease).append("operationFingerprint",fingerprint).append("leaseUntil",new Document("$gt",Date.from(clock.instant())));}
    void guard(MutationJob job,String lease) {
        var result=db.getCollection("career_property_mutations").updateOne(session,leaseFilter(job.id(),lease,job.operationFingerprint()),new Document("$inc",new Document("commitFence",1L)));
        if(result.getMatchedCount()!=1) throw new CareerCommandException(409,"MUTATION_LEASE_LOST");
    }
    MutationReceipt receipt(String mutationId,String recordId) {
        var raw=db.getCollection("career_property_mutation_receipts").find(session,new Document("userId",user).append("mutationId",mutationId).append("recordId",recordId)).first();
        return raw==null?null:new MutationReceipt(raw.getString("operationFingerprint"),new MongoCareerRecordProjector().project(raw.get("response",Document.class)),raw.getBoolean("changed"));
    }
    PropertyValue tombstone(String recordId,MutationJob job) {
        if(!job.kind().equals("restoration")) return null;
        var propertyId=job.target().id();
        PropertyValue.requireUuid(propertyId,"propertyId");
        var raw=db.getCollection("career_records").find(session,new Document("_id",recordId).append("userId",user).append("deletedAt",null)).first();
        var values=raw==null?null:raw.get("propertyValueTombstones",Document.class);
        if(values==null || !values.containsKey(propertyId)) return null;
        try {
            var envelope=values.get(propertyId,Document.class);
            var deletionId=PropertyValue.requireUuid(envelope.getString("deletionMutationId"),"deletionMutationId");
            var deletion=db.getCollection("career_property_mutations").find(session,new Document("_id",deletionId).append("userId",user).append("categoryId",job.categoryId()).append("propertyId",propertyId)).first();
            if(deletion==null || !CareerMoveTokens.hash(deletion.getString("planJson")).equals(deletion.getString("operationFingerprint"))) throw invalidTombstone();
            var deletionPlan=json.readTree(deletion.getString("planJson"));var operation=deletionPlan.get("operation");var target=operation.get("target");
            var deletedDefinition=definition(target);var source=job.source();
            var provenance=new Document(envelope);provenance.remove("value");var bound=json.valueToTree(provenance);
            if(source==null || source.deletedAt()==null || !operation.get("kind").asText().equals("deletion")
                    || !deletionPlan.get("userId").asText().equals(user) || !deletionPlan.get("categoryId").asText().equals(job.categoryId())
                    || !deletionPlan.get("recordIds").isArray() || !containsId(deletionPlan.get("recordIds"),recordId)
                    || !propertyId.equals(envelope.getString("propertyDefinitionId")) || !job.categoryId().equals(envelope.getString("categoryId"))
                    || !semanticEqual(bound.get("categoryVersion"),deletionPlan.get("categoryVersion")) || !semanticEqual(bound.get("schemaVersion"),deletionPlan.get("schemaVersion"))
                    || !semanticEqual(bound.get("definitionVersion"),target.get("version")) || !semanticEqual(bound.get("deletedAt"),target.get("deletedAt"))
                    || !semanticEqual(bound.get("type"),target.get("type")) || !semanticEqual(bound.get("config"),target.get("config"))
                    || !deletedDefinition.id().equals(propertyId) || source.version()!=deletedDefinition.version() || !source.deletedAt().equals(deletedDefinition.deletedAt())
                    || source.type()!=deletedDefinition.type() || !semanticEqual(json.valueToTree(source.config()),target.get("config"))
                    || job.target().type()!=source.type() || !semanticEqual(json.valueToTree(job.target().config()),target.get("config"))) throw invalidTombstone();
            var value=MongoCareerRecordProjector.projectPropertyValue(envelope.get("value",Document.class));
            var timestampAlias=!source.system()&&Set.of(PropertyDefinitionType.CREATED_TIME,PropertyDefinitionType.UPDATED_TIME).contains(source.type())&&value instanceof DatePropertyValue date&&date.precision()==DatePropertyValue.Precision.DATETIME&&date.end()==null;
            if(!value.propertyDefinitionId().equals(propertyId) || (!timestampAlias&&!value.type().wireName().equals(source.type().wireName()))) throw invalidTombstone();
            return value;
        } catch(CareerCommandException error) {throw error;}
        catch(RuntimeException error) {throw invalidTombstone();}
    }
    private static boolean containsId(JsonNode nodes,String id) {for(var node:nodes)if(id.equals(node.asText()))return true;return false;}
    private static CareerCommandException invalidTombstone() {return new CareerCommandException(409,"RESTORATION_TOMBSTONE_CHANGED");}
    void tombstone(CareerRecord record,MutationJob job,PropertyValue value) {
        var propertyId=job.target().id();
        var path="propertyValueTombstones."+PropertyValue.requireUuid(propertyId,"propertyId");
        Document envelope=null;
        if(value!=null) {
            // 원본 ISO 문자열과 BSON canonical 값을 그대로 보관해 정밀도·배열 순서를 유지합니다.
            JsonNode definition=null;for(var candidate:json.readTree(job.definitionsJson()))if(propertyId.equals(candidate.get("id").asText()))definition=candidate;
            if(!job.kind().equals("deletion") || definition==null || job.target().deletedAt()==null) throw invalidTombstone();
            envelope=new Document("propertyDefinitionId",propertyId).append("deletionMutationId",job.id()).append("definitionVersion",job.target().version())
                    .append("type",job.target().type().wireName()).append("config",Document.parse(json.writeValueAsString(job.target().config())))
                    .append("categoryId",job.categoryId()).append("categoryVersion",job.categoryVersion()).append("schemaVersion",job.schemaVersion())
                    .append("deletedAt",definition.get("deletedAt").asText()).append("value",MongoCareerRecordWriter.writePropertyValue(value));
        }
        var update=value==null?new Document("$unset",new Document(path,"")):new Document("$set",new Document(path,envelope));
        var result=db.getCollection("career_records").updateOne(session,new Document("_id",record.id()).append("userId",user).append("version",record.version()).append("deletedAt",null),update);
        if(result.getMatchedCount()!=1) throw CareerCommandException.stale();
    }
    void remember(MutationJob job,CareerRecord record,boolean changed) {remember(job,record,changed,null);}
    void remember(MutationJob job,CareerRecord record,boolean changed,Document relationRestoration) {
        var response=new Document("_id",record.id()).append("userId",user).append("categoryId",record.categoryId());
        response.putAll(new MongoCareerRecordWriter().writeUpdate(record).get("$set",Document.class));
        var receipt=new Document("_id",UUID.randomUUID().toString()).append("userId",user).append("mutationId",job.id()).append("recordId",record.id()).append("operationFingerprint",job.operationFingerprint()).append("response",response).append("changed",changed).append("createdAt",Date.from(clock.instant()));
        if(relationRestoration!=null)receipt.append("relationRestoration",relationRestoration);
        db.getCollection("career_property_mutation_receipts").insertOne(session,receipt);
    }
    private PropertyDefinition definition(JsonNode raw) {
        return new PropertyDefinition(raw.get("id").asText(),raw.get("key").asText(),raw.get("name").asText(),PropertyDefinitionType.fromStoredName(raw.get("type").asText()),raw.get("required").asBoolean(),raw.get("system").asBoolean(),json.convertValue(raw.get("config"),Map.class),raw.get("order").asInt(),raw.get("version").asLong(),raw.get("deletedAt").isNull()?null:Instant.parse(raw.get("deletedAt").asText()));
    }
    private PropertyValue wireValue(JsonNode node) {
        var raw=Document.parse(node.toString());
        if(raw.getString("type").equals("number")) raw.put("value",new Decimal128(new BigDecimal(raw.getString("value"))));
        return MongoCareerRecordProjector.projectPropertyValue(raw);
    }
    private static boolean semanticEqual(JsonNode left,JsonNode right) {
        if(left==null || right==null) return left==right;
        if(left.isNumber() && right.isNumber()) return left.decimalValue().compareTo(right.decimalValue())==0;
        if(left.isArray() && right.isArray()) {if(left.size()!=right.size())return false;for(int i=0;i<left.size();i++)if(!semanticEqual(left.get(i),right.get(i)))return false;return true;}
        if(left.isObject() && right.isObject()) {if(left.size()!=right.size())return false;for(var key:left.propertyNames())if(!semanticEqual(left.get(key),right.get(key)))return false;return true;}
        return left.equals(right);
    }
}
