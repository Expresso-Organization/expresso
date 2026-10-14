package com.expresso.backend.career.infrastructure.mongo;

import java.time.*;
import java.util.*;
import com.mongodb.client.*;
import org.bson.Document;
import tools.jackson.databind.json.JsonMapper;
import com.expresso.backend.career.application.*;
import com.expresso.backend.career.application.CareerCommandRepository.*;
import com.expresso.backend.career.domain.*;

/** 관계 원장의 원본 edge, 복원 보관값, receipt와 outbox를 기존 business session에서 함께 변경합니다. */
final class MongoCareerRelationMutationOperations {
    private final MongoDatabase db;private final ClientSession session;private final String user;private final Clock clock;private final Operations tx;
    private final JsonMapper json=JsonMapper.builder().build();
    MongoCareerRelationMutationOperations(MongoDatabase db,ClientSession session,String user,Clock clock,Operations tx){this.db=db;this.session=session;this.user=user;this.clock=clock;this.tx=tx;}
    private MongoCollection<Document> edges(){return db.getCollection("career_record_relations");}
    private MongoCollection<Document> tombstones(){return db.getCollection("career_relation_property_tombstones");}
    private Document scope(String id,MutationJob job){return new Document("userId",user).append("recordId",id).append("propertyId",job.target().id());}
    private static CareerCommandException conflict(String message){return new CareerCommandException(409,message);}
    private record Relation(String targetCategoryId,String inversePropertyId,String cardinality,String deletePolicy){}
    private Relation relation(Map<String,?> config){
        try {
            var target=PropertyValue.requireUuid((String)config.get("targetCategoryId"),"targetCategoryId");var inverse=(String)config.get("inversePropertyId");if(inverse!=null)PropertyValue.requireUuid(inverse,"inversePropertyId");
            var cardinality=(String)config.get("cardinality");var policy=(String)config.get("deletePolicy");
            if(!config.containsKey("inversePropertyId")||!Set.of("single","multiple").contains(cardinality)||!Set.of("restrict","nullify").contains(policy))throw new IllegalArgumentException();
            return new Relation(target,inverse,cardinality,policy);
        }catch(RuntimeException error){throw conflict("RESTORATION_DEFINITION_CHANGED");}
    }
    private List<Document> forward(String id,String property){return limited(edges().find(session,new Document("userId",user).append("sourceRecordId",id).append("sourcePropertyId",property)).sort(new Document("_id",1)).limit(1001).into(new ArrayList<>()));}
    private static List<Document> limited(List<Document> values){if(values.size()>1000)throw conflict("RELATION_TARGET_LIMIT");return values;}
    private Document tuple(Document edge){return new Document("userId",user).append("sourceRecordId",edge.getString("sourceRecordId")).append("sourcePropertyId",edge.getString("sourcePropertyId")).append("targetRecordId",edge.getString("targetRecordId"));}
    private void validateEdge(Document edge){
        var required=Set.of("_id","userId","sourceRecordId","sourcePropertyId","targetRecordId","cardinality","deletePolicy","createdBy","createdAt","updatedAt");var allowed=new HashSet<>(required);allowed.add("inversePropertyId");
        if(!edge.keySet().containsAll(required)||!allowed.containsAll(edge.keySet())||!user.equals(edge.getString("userId")))throw conflict("RELATION_EDGE_CHANGED");
        try {for(var key:List.of("_id","userId","sourceRecordId","sourcePropertyId","targetRecordId"))PropertyValue.requireUuid(edge.getString(key),key);if(edge.get("inversePropertyId")!=null)PropertyValue.requireUuid(edge.getString("inversePropertyId"),"inversePropertyId");}
        catch(RuntimeException error){throw conflict("RELATION_EDGE_CHANGED");}
        if(!Set.of("single","multiple").contains(edge.getString("cardinality"))||!Set.of("restrict","nullify").contains(edge.getString("deletePolicy"))||!Set.of("user","ai").contains(edge.getString("createdBy"))||!(edge.get("createdAt") instanceof Date)||!(edge.get("updatedAt") instanceof Date))throw conflict("RELATION_EDGE_CHANGED");
    }
    private StoredRecord owned(String id,boolean restoration){
        try{return tx.record(id,false);}catch(CareerCommandException error){if(error.status()!=404||restoration)throw error;return tx.record(id,true);}
    }
    private PropertyDefinition inverseDefinition(Category category,String id,MutationJob job){
        var definition=category.business().propertyDefinitions().stream().filter(value->value.id().equals(id)&&value.type()==PropertyDefinitionType.RELATION&&!value.system()).findFirst().orElseThrow(()->conflict("RESTORATION_DEFINITION_CHANGED"));
        if(definition.deletedAt()!=null&&!(job.kind().equals("deletion")&&category.business().id().equals(job.categoryId())&&id.equals(job.target().id())))throw conflict("RESTORATION_DEFINITION_CHANGED");
        return definition;
    }
    private List<Document> inverseEdges(String id,String property,List<Document> forward){
        var found=new LinkedHashMap<String,Document>();
        for(var edge:limited(edges().find(session,new Document("userId",user).append("targetRecordId",id).append("inversePropertyId",property)).sort(new Document("_id",1)).limit(1001).into(new ArrayList<>()))){validateEdge(edge);found.put(edge.getString("_id"),edge);}
        for(var edge:forward){validateEdge(edge);var inverse=edge.getString("inversePropertyId");if(inverse==null)continue;
            var raw=edges().find(session,new Document("userId",user).append("sourceRecordId",edge.getString("targetRecordId")).append("sourcePropertyId",inverse).append("targetRecordId",id)).first();
            if(raw!=null){validateEdge(raw);found.put(raw.getString("_id"),raw);}
        }return limited(List.copyOf(found.values()));
    }
    private boolean belongs(Document edge,String record,String property){return record.equals(edge.getString("sourceRecordId"))&&property.equals(edge.getString("sourcePropertyId"))||record.equals(edge.getString("targetRecordId"))&&property.equals(edge.getString("inversePropertyId"));}
    private String relatedRecord(Document edge,String record){return record.equals(edge.getString("sourceRecordId"))?edge.getString("targetRecordId"):edge.getString("sourceRecordId");}
    private Document backup(String id,MutationJob job){
        if(!job.kind().equals("restoration"))return null;var raw=tombstones().find(session,scope(id,job)).first();if(raw==null)return null;
        try {
            var deletionId=PropertyValue.requireUuid(raw.getString("deletionMutationId"),"deletionMutationId");var deletion=db.getCollection("career_property_mutations").find(session,new Document("_id",deletionId).append("userId",user).append("categoryId",job.categoryId()).append("propertyId",job.target().id())).first();
            if(deletion==null||!CareerMoveTokens.hash(deletion.getString("planJson")).equals(deletion.getString("operationFingerprint")))throw new IllegalArgumentException();
            var plan=json.readTree(deletion.getString("planJson"));var operation=plan.get("operation");var target=operation.get("target");var member=false;for(var candidate:plan.get("recordIds"))if(id.equals(candidate.asText()))member=true;
            if(!member||!user.equals(plan.get("userId").asText())||!job.categoryId().equals(plan.get("categoryId").asText())||!operation.get("kind").asText().equals("deletion")||!target.get("id").asText().equals(job.target().id())||!target.get("type").asText().equals("relation")||target.get("deletedAt").isNull()||job.source()==null||job.source().type()!=PropertyDefinitionType.RELATION||job.source().deletedAt()==null)throw new IllegalArgumentException();
            if(!raw.getString("categoryId").equals(job.categoryId())||!number(raw,"definitionVersion",true).equals(target.get("version").asLong())||!raw.getString("deletedAt").equals(target.get("deletedAt").asText())||number(raw,"categoryVersion",true)!=plan.get("categoryVersion").asLong()||number(raw,"schemaVersion",true)!=plan.get("schemaVersion").asLong()||job.source().version()!=target.get("version").asLong()||!job.source().deletedAt().equals(Instant.parse(target.get("deletedAt").asText()))||!json.valueToTree(raw.get("config")).equals(target.get("config"))||!json.valueToTree(job.source().config()).equals(target.get("config"))||!relation(job.target().config()).equals(relation(raw.get("config",Document.class))))throw new IllegalArgumentException();
            number(raw,"sourceRecordVersion",true);var originalForward=raw.getList("forwardEdges",Document.class);var originalInverse=raw.getList("inverseEdges",Document.class);limited(originalForward);limited(originalInverse);
            var identities=new HashSet<String>();for(var edge:originalForward){validateEdge(edge);if(!id.equals(edge.getString("sourceRecordId"))||!job.target().id().equals(edge.getString("sourcePropertyId"))||!identities.add(edge.getString("_id")))throw new IllegalArgumentException();}
            for(var edge:originalInverse){validateEdge(edge);if(!id.equals(edge.getString("targetRecordId"))||!job.target().id().equals(edge.getString("inversePropertyId"))||!identities.add(edge.getString("_id")))throw new IllegalArgumentException();}
            var participants=participantIds(id,originalForward,originalInverse);var versions=raw.get("inverseRecordVersions",Document.class);var references=raw.get("inverseRecordReferenceVersions",Document.class);
            if(versions==null||references==null||!versions.keySet().equals(participants)||!references.keySet().equals(participants))throw new IllegalArgumentException();for(var participant:participants){number(versions,participant,true);number(references,participant,false);}
            var bindings=raw.getList("inverseDefinitionBindings",Document.class);if(bindings==null||bindings.size()>1000)throw new IllegalArgumentException();
            var bound=new HashSet<String>();for(var binding:bindings){var record=PropertyValue.requireUuid(binding.getString("recordId"),"recordId");PropertyValue.requireUuid(binding.getString("categoryId"),"categoryId");PropertyValue.requireUuid(binding.getString("definitionId"),"definitionId");number(binding,"categoryVersion",true);number(binding,"schemaVersion",true);number(binding,"version",true);relation(binding.get("config",Document.class));if(!participants.contains(record)||!bound.add(record+":"+binding.getString("definitionId")))throw new IllegalArgumentException();}
            for(var edge:originalForward)if(edge.getString("inversePropertyId")!=null&&!bound.contains(edge.getString("targetRecordId")+":"+edge.getString("inversePropertyId")))throw new IllegalArgumentException();
            for(var edge:originalInverse)if(!bound.contains(edge.getString("sourceRecordId")+":"+edge.getString("sourcePropertyId")))throw new IllegalArgumentException();
            return raw;
        }catch(RuntimeException error){throw conflict("RESTORATION_TOMBSTONE_CHANGED");}
    }
    private static Long number(Document raw,String key,boolean positive){var value=raw.get(key);if(!(value instanceof Number n)||n.doubleValue()!=n.longValue()||n.longValue()<(positive?1:0)||n.longValue()>CareerRecord.MAX_VERSION)throw new IllegalArgumentException();return n.longValue();}
    private Set<String> participantIds(String source,List<Document> forward,List<Document> inverse){var ids=new TreeSet<String>();for(var edge:forward){ids.add(edge.getString("sourceRecordId"));ids.add(edge.getString("targetRecordId"));}for(var edge:inverse){ids.add(edge.getString("sourceRecordId"));ids.add(edge.getString("targetRecordId"));}ids.remove(source);if(ids.size()>1000)throw conflict("RELATION_TARGET_LIMIT");return ids;}
    private Map<String,StoredRecord> participants(String source,List<Document> forward,List<Document> inverse,Document backup,boolean restoration){
        var ids=participantIds(source,forward,inverse);if(backup!=null)ids.addAll(backup.get("inverseRecordVersions",Document.class).keySet());var result=new TreeMap<String,StoredRecord>();for(var id:ids)result.put(id,owned(id,restoration));return result;
    }
    private Map<String,Long> versions(Map<String,StoredRecord> records){var result=new TreeMap<String,Long>();records.forEach((id,record)->result.put(id,record.business().version()));return result;}
    Map<String,Object> read(String id,MutationJob job){
        var current=forward(id,job.target().id());var inverse=inverseEdges(id,job.target().id(),current);var saved=backup(id,job);var records=participants(id,current,inverse,saved,job.kind().equals("restoration"));
        var result=new LinkedHashMap<String,Object>();result.put("edges",current.stream().map(this::wireEdge).toList());result.put("inverseEdges",inverse.stream().map(this::wireEdge).toList());result.put("targetRecordVersions",versions(records));result.put("tombstone",saved==null?null:wireBackup(saved));return result;
    }
    private Map<String,Object> wireEdge(Document raw){validateEdge(raw);var result=new LinkedHashMap<String,Object>(raw);result.put("id",result.remove("_id"));result.put("createdAt",raw.getDate("createdAt").toInstant().toString());result.put("updatedAt",raw.getDate("updatedAt").toInstant().toString());return result;}
    private Map<String,Object> wireBackup(Document raw){var result=new LinkedHashMap<String,Object>(raw);for(var key:List.of("_id","userId","categoryId","recordId","createdAt"))result.remove(key);result.put("forwardEdges",raw.getList("forwardEdges",Document.class).stream().map(this::wireEdge).toList());result.put("inverseEdges",raw.getList("inverseEdges",Document.class).stream().map(this::wireEdge).toList());return result;}
    CareerPropertyMutationService.Result commit(MutationJob job,CareerRelationPropertyMutationCommand command){
        var stored=tx.record(command.recordId(),false);var source=stored.business();if(!source.categoryId().equals(job.categoryId()))throw conflict("MUTATION_RECORD_MOVED");if(source.version()!=command.expectedVersion())throw CareerCommandException.stale();
        var category=tx.mutationCategory(job);if(category.categoryVersion()!=job.categoryVersion()||category.schemaVersion()!=job.schemaVersion())throw conflict("CATEGORY_SCHEMA_CHANGED");
        var definition=relation(job.target().config());var current=forward(source.id(),job.target().id());var inverse=inverseEdges(source.id(),job.target().id(),current);var saved=backup(source.id(),job);var records=participants(source.id(),current,inverse,saved,job.kind().equals("restoration"));
        if(!versions(records).equals(command.targetRecordVersions()))throw CareerCommandException.stale();
        var desired=job.kind().equals("deletion")?List.<String>of():saved==null?List.<String>of():union(saved.getList("forwardEdges",Document.class),saved.getList("inverseEdges",Document.class)).stream().map(edge->relatedRecord(edge,source.id())).distinct().sorted().toList();
        if(!desired.equals(command.targetRecordIds().stream().sorted().toList()))throw conflict("MUTATION_DELTA_MISMATCH");
        if(job.kind().equals("deletion"))return delete(job,command,stored,category,definition,current,inverse,records);
        return restore(job,command,stored,category,definition,current,inverse,records,saved);
    }
    private List<Document> bindings(String source,MutationJob job,Relation definition,List<Document> current,List<Document> incoming,Map<String,StoredRecord> records){
        var bindings=new TreeMap<String,Document>();
        for(var edge:current){
            validateEdge(edge);var target=records.get(edge.getString("targetRecordId"));
            if(!source.equals(edge.getString("sourceRecordId"))||!job.target().id().equals(edge.getString("sourcePropertyId"))||target==null||!target.business().categoryId().equals(definition.targetCategoryId())||!Objects.equals(edge.getString("inversePropertyId"),definition.inversePropertyId())||!edge.getString("cardinality").equals(definition.cardinality())||!edge.getString("deletePolicy").equals(definition.deletePolicy()))throw conflict("RELATION_EDGE_CHANGED");
            var targetCategory=tx.category(target.business().categoryId());tx.guardCategory(targetCategory);
            if(definition.inversePropertyId()!=null){
                var inverse=inverseDefinition(targetCategory,definition.inversePropertyId(),job);var semantics=relation(inverse.config());
                if(!semantics.targetCategoryId().equals(job.categoryId())||!Objects.equals(semantics.inversePropertyId(),job.target().id()))throw conflict("RESTORATION_DEFINITION_CHANGED");
                bindings.put(target.business().id()+":"+inverse.id(),binding(target,targetCategory,inverse));
            }
        }
        for(var edge:incoming){
            validateEdge(edge);var target=records.get(edge.getString("sourceRecordId"));
            if(!source.equals(edge.getString("targetRecordId"))||!job.target().id().equals(edge.getString("inversePropertyId"))||target==null||!target.business().categoryId().equals(definition.targetCategoryId())||!Objects.equals(edge.getString("sourcePropertyId"),definition.inversePropertyId()))throw conflict("RELATION_EDGE_CHANGED");
            var targetCategory=tx.category(target.business().categoryId());tx.guardCategory(targetCategory);var inverse=inverseDefinition(targetCategory,edge.getString("sourcePropertyId"),job);var semantics=relation(inverse.config());
            if(!semantics.targetCategoryId().equals(job.categoryId())||!Objects.equals(semantics.inversePropertyId(),job.target().id()))throw conflict("RESTORATION_DEFINITION_CHANGED");
            if(!edge.getString("cardinality").equals(semantics.cardinality())||!edge.getString("deletePolicy").equals(semantics.deletePolicy()))throw conflict("RELATION_EDGE_CHANGED");
            bindings.put(target.business().id()+":"+inverse.id(),binding(target,targetCategory,inverse));
        }
        return List.copyOf(bindings.values());
    }
    private Document binding(StoredRecord record,Category category,PropertyDefinition definition){return new Document("recordId",record.business().id()).append("categoryId",category.business().id()).append("categoryVersion",category.categoryVersion()).append("schemaVersion",category.schemaVersion()).append("definitionId",definition.id()).append("version",definition.version()).append("config",new Document(definition.config()));}
    private void fence(StoredRecord source,Map<String,StoredRecord> records,String generation){
        var all=new TreeMap<String,StoredRecord>(records);all.put(source.business().id(),source);
        for(var entry:all.entrySet()){
            var before=entry.getValue();if(before.referenceVersion()==CareerRecord.MAX_VERSION)throw conflict("RELATION_REFERENCE_VERSION_LIMIT");
            var filter=new Document("_id",entry.getKey()).append("userId",user).append("version",before.business().version()).append("deletedAt",before.deletedAt()==null?null:Date.from(before.deletedAt()));
            if(before.referenceVersion()==0)filter.append("$or",List.of(new Document("referenceVersion",0L),new Document("referenceVersion",new Document("$exists",false))));else filter.append("referenceVersion",before.referenceVersion());
            var changed=db.getCollection("career_records").updateOne(session,filter,new Document("$inc",new Document("referenceVersion",1L)));if(changed.getMatchedCount()!=1)throw CareerCommandException.stale();
            if(generation!=null)propagate(generation,"inverseRecordReferenceVersions",entry.getKey(),before.referenceVersion(),before.referenceVersion()+1);
        }
    }
    private void propagate(String generation,String field,String record,long before,long after){var path=field+"."+record;tombstones().updateMany(session,new Document("userId",user).append("deletionMutationId",generation).append(path,before),new Document("$set",new Document(path,after)));}
    private CareerPropertyMutationService.Result delete(MutationJob job,CareerRelationPropertyMutationCommand command,StoredRecord source,Category category,Relation definition,List<Document> current,List<Document> inverse,Map<String,StoredRecord> records){
        if((!current.isEmpty()||!inverse.isEmpty())&&!job.confirmLossy())throw conflict("LOSSY_CONFIRMATION_REQUIRED");
        if(tombstones().find(session,scope(source.business().id(),job)).first()!=null)throw conflict("RESTORATION_TOMBSTONE_CHANGED");
        var bindings=bindings(source.business().id(),job,definition,current,inverse,records);
        tx.guardCategory(category);tx.guardMutation(job,command.leaseToken());fence(source,records,job.id());
        var changed=!current.isEmpty()||!inverse.isEmpty();var after=changed?CareerWriterPolicy.advance(source.business(),source.business().categoryId(),source.business().propertyValues(),clock.instant()):source.business();
        for(var edge:union(current,inverse))if(edges().deleteOne(session,new Document(edge)).getDeletedCount()!=1)throw conflict("RELATION_EDGE_CHANGED");
        if(changed){tx.save(source,after,null,null,source.unmapped(),false);propagate(job.id(),"inverseRecordVersions",after.id(),source.business().version(),after.version());}
        var inverseVersions=new Document();var referenceVersions=new Document();records.forEach((id,record)->{inverseVersions.put(id,record.business().version());referenceVersions.put(id,record.referenceVersion()+1);});
        var deleted=json.readTree(job.definitionsJson()).get(0);for(var candidate:json.readTree(job.definitionsJson()))if(candidate.get("id").asText().equals(job.target().id()))deleted=candidate;
        var backup=scope(after.id(),job).append("_id",UUID.randomUUID().toString()).append("categoryId",job.categoryId()).append("deletionMutationId",job.id()).append("definitionVersion",job.target().version()).append("deletedAt",deleted.get("deletedAt").asText()).append("categoryVersion",job.categoryVersion()).append("schemaVersion",job.schemaVersion()).append("config",new Document(job.target().config())).append("sourceRecordVersion",after.version()).append("forwardEdges",current).append("inverseEdges",inverse).append("inverseDefinitionBindings",bindings).append("inverseRecordVersions",inverseVersions).append("inverseRecordReferenceVersions",referenceVersions).append("createdAt",Date.from(clock.instant()));
        tombstones().insertOne(session,backup);if(changed)computation(job,after,union(current,inverse),records);new MongoCareerMutationOperations(db,session,user,clock).remember(job,after,changed);return new CareerPropertyMutationService.Result(after,changed,false);
    }
    private List<Document> union(List<Document> first,List<Document> second){var merged=new TreeMap<String,Document>();for(var edge:first)merged.put(edge.getString("_id"),edge);for(var edge:second){var prior=merged.putIfAbsent(edge.getString("_id"),edge);if(prior!=null&&!prior.equals(edge))throw conflict("RELATION_EDGE_CHANGED");}return List.copyOf(merged.values());}
    private List<Document> journal(String generation,String property){
        var proven=new ArrayList<Document>();var receipts=db.getCollection("career_property_mutation_receipts").find(session,new Document("userId",user).append("relationRestoration.deletionMutationId",generation).append("relationRestoration.propertyId",property));
        for(var receipt:receipts){var job=db.getCollection("career_property_mutations").find(session,new Document("_id",receipt.getString("mutationId")).append("userId",user).append("propertyId",property)).first();if(job==null||!CareerMoveTokens.hash(job.getString("planJson")).equals(receipt.getString("operationFingerprint")))throw conflict("RESTORATION_TOMBSTONE_CHANGED");var plan=json.readTree(job.getString("planJson"));var valid=false;for(var id:plan.get("recordIds"))if(receipt.getString("recordId").equals(id.asText()))valid=true;if(!valid||!plan.get("operation").get("kind").asText().equals("restoration"))throw conflict("RESTORATION_TOMBSTONE_CHANGED");var raw=receipt.get("relationRestoration",Document.class);proven.addAll(raw.getList("forwardEdges",Document.class));proven.addAll(raw.getList("inverseEdges",Document.class));}
        for(var edge:proven)validateEdge(edge);return proven;
    }
    private void validateUnion(String source,String property,List<Document> original,List<Document> current,Relation definition,List<Document> proven){
        for(var edge:current)if(!proven.contains(edge))throw conflict("RESTORATION_RELATION_CHANGED");
        var merged=union(original,current);var targets=new HashSet<String>();var tuples=new HashSet<Document>();
        for(var edge:merged){validateEdge(edge);if(!belongs(edge,source,property)||!tuples.add(tuple(edge)))throw conflict("RESTORATION_RELATION_CHANGED");targets.add(relatedRecord(edge,source));}
        if(definition.cardinality().equals("single")&&targets.size()>1)throw conflict("INVERSE_RELATION_CONFLICT");
    }
    private CareerPropertyMutationService.Result restore(MutationJob job,CareerRelationPropertyMutationCommand command,StoredRecord source,Category category,Relation definition,List<Document> current,List<Document> inverse,Map<String,StoredRecord> records,Document backup){
        if(backup==null){if(!current.isEmpty()||!inverse.isEmpty())throw conflict("RESTORATION_TOMBSTONE_CHANGED");tx.guardCategory(category);tx.guardMutation(job,command.leaseToken());new MongoCareerMutationOperations(db,session,user,clock).remember(job,source.business(),false);return new CareerPropertyMutationService.Result(source.business(),false,false);}
        if(number(backup,"sourceRecordVersion",true)!=source.business().version())throw conflict("RESTORATION_SOURCE_CHANGED");
        var generation=backup.getString("deletionMutationId");var originals=backup.getList("forwardEdges",Document.class);var originalInverse=backup.getList("inverseEdges",Document.class);var proven=journal(generation,job.target().id());validateUnion(source.business().id(),job.target().id(),union(originals,originalInverse),union(current,inverse),definition,proven);
        var backupVersions=backup.get("inverseRecordVersions",Document.class);var backupReferences=backup.get("inverseRecordReferenceVersions",Document.class);
        for(var id:backupVersions.keySet()){var record=records.get(id);if(record==null||record.business().version()!=number(backupVersions,id,true)||record.referenceVersion()!=number(backupReferences,id,false))throw conflict("RESTORATION_TARGET_CHANGED");}
        bindings(source.business().id(),job,definition,originals,originalInverse,records);
        var guarded=new HashSet<String>();for(var binding:backup.getList("inverseDefinitionBindings",Document.class)){
            var record=records.get(binding.getString("recordId"));if(record==null||!record.business().categoryId().equals(binding.getString("categoryId")))throw conflict("RESTORATION_DEFINITION_CHANGED");var boundCategory=tx.category(record.business().categoryId());var boundDefinition=inverseDefinition(boundCategory,binding.getString("definitionId"),job);var semantics=relation(boundDefinition.config());if(!semantics.equals(relation(binding.get("config",Document.class)))||!semantics.targetCategoryId().equals(job.categoryId()))throw conflict("RESTORATION_DEFINITION_CHANGED");
            var outgoing=forward(record.business().id(),boundDefinition.id());var slot=union(outgoing,inverseEdges(record.business().id(),boundDefinition.id(),outgoing));var savedSlot=union(originals,originalInverse).stream().filter(edge->belongs(edge,record.business().id(),boundDefinition.id())).toList();
            var merged=union(slot,savedSlot);var targets=new HashSet<String>();for(var edge:merged){validateEdge(edge);if(!belongs(edge,record.business().id(),boundDefinition.id()))throw conflict("RESTORATION_RELATION_CHANGED");targets.add(relatedRecord(edge,record.business().id()));}if(semantics.cardinality().equals("single")&&targets.size()>1)throw conflict("INVERSE_RELATION_CONFLICT");if(guarded.add(boundCategory.business().id()))tx.guardCategory(boundCategory);
        }
        var missing=new ArrayList<Document>();for(var edge:union(originals,originalInverse)){var existing=edges().find(session,tuple(edge)).first();if(existing!=null&&!existing.equals(edge))throw conflict("RESTORATION_RELATION_CHANGED");if(existing==null){var sameId=edges().find(session,new Document("_id",edge.getString("_id"))).first();if(sameId!=null)throw conflict("RESTORATION_RELATION_CHANGED");missing.add(edge);}}
        tx.guardCategory(category);tx.guardMutation(job,command.leaseToken());fence(source,records,generation);var changed=!missing.isEmpty();var after=changed?CareerWriterPolicy.advance(source.business(),source.business().categoryId(),source.business().propertyValues(),clock.instant()):source.business();
        for(var edge:missing)edges().insertOne(session,new Document(edge));if(changed){tx.save(source,after,null,null,source.unmapped(),false);propagate(generation,"inverseRecordVersions",after.id(),source.business().version(),after.version());computation(job,after,union(originals,originalInverse),records);}
        if(tombstones().deleteOne(session,new Document("_id",backup.getString("_id")).append("userId",user).append("deletionMutationId",generation)).getDeletedCount()!=1)throw conflict("RESTORATION_TOMBSTONE_CHANGED");
        var journal=new Document("deletionMutationId",generation).append("propertyId",job.target().id()).append("forwardEdges",originals).append("inverseEdges",originalInverse);new MongoCareerMutationOperations(db,session,user,clock).remember(job,after,changed,journal);return new CareerPropertyMutationService.Result(after,changed,false);
    }
    private void computation(MutationJob job,CareerRecord source,List<Document> changed,Map<String,StoredRecord> records){
        tx.computation(source,List.of(job.target().id()),Map.of(job.target().id(),job.target().version()),"mutation:"+job.id());var changes=new TreeMap<String,Set<String>>();
        for(var edge:changed){
            if(!source.id().equals(edge.getString("sourceRecordId")))changes.computeIfAbsent(edge.getString("sourceRecordId"),ignored->new TreeSet<>()).add(edge.getString("sourcePropertyId"));
            if(edge.getString("inversePropertyId")!=null&&!source.id().equals(edge.getString("targetRecordId")))changes.computeIfAbsent(edge.getString("targetRecordId"),ignored->new TreeSet<>()).add(edge.getString("inversePropertyId"));
        }
        changes.forEach((id,properties)->{var record=records.get(id);if(record!=null)tx.computation(record.business(),List.copyOf(properties),Map.of(),"mutation-inverse:"+job.id()+":"+source.id()+":v"+source.version());});
    }

}