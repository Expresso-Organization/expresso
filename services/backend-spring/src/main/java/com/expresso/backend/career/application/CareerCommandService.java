package com.expresso.backend.career.application;

import java.time.Clock;
import java.time.Instant;
import java.util.*;
import java.util.stream.Collectors;
import com.expresso.backend.career.domain.*;
import com.expresso.backend.career.application.CareerCommandRepository.*;
import tools.jackson.databind.json.JsonMapper;

public final class CareerCommandService {
    private final CareerCommandRepository repository;
    private final Clock clock;
    private final CareerMoveTokens tokens;
    private final CareerCategoryMovePlanner planner = new CareerCategoryMovePlanner();
    private final JsonMapper json = JsonMapper.builder().build();
    public CareerCommandService(CareerCommandRepository repository, Clock clock, CareerMoveTokens tokens) {
        this.repository = repository; this.clock = clock; this.tokens = tokens;
    }
    public CareerRecord create(Actor actor, CreateCareerBusinessCommand command, String key) {
        if (key == null || !key.matches("[A-Za-z0-9._~:+/\\-]{16,128}")) throw new IllegalArgumentException("Idempotency-Key 형식이 올바르지 않습니다");
        // 값 DTO의 고정 필드 순서와 숫자 문자열을 사용해 key 순서에 영향받지 않는 hash를 만듭니다.
        var hashInput=new ArrayList<Object>(List.of(command.categoryId(),command.title(),command.mode().name(),command.propertyValues().stream().map(com.expresso.backend.career.dto.CareerBusinessRecordData.PropertyValueData::from).toList()));
        // 관계가 없는 기존 생성 요청의 receipt hash는 그대로 유지합니다.
        if(!command.initialRelations().isEmpty())hashInput.add(command.initialRelations().stream().sorted(Comparator.comparing(CareerRelationTargets::propertyId)).map(relation->List.of(relation.propertyId(),relation.targetIds().stream().distinct().sorted().toList())).toList());
        var hash=CareerMoveTokens.hash(json.writeValueAsString(hashInput));
        return repository.transaction(actor, tx -> {
            var replay = tx.replay(key);
            if (replay != null) {
                if (!replay.requestHash().equals(hash)) throw new CareerCommandException(409, "IDEMPOTENCY_CONFLICT");
                return replay.record();
            }
            var category = tx.category(command.categoryId());
            CareerValueValidation.validate(category.business(), command.propertyValues());
            tx.guardCategory(category);
            var record = new CareerRecord(UUID.randomUUID().toString(), actor.userId(), command.categoryId(), command.title(),
                    command.propertyValues(), CareerRecordStatus.DRAFT, 1, clock.instant());
            tx.insert(record);
            var relationChanges=stageRelations(tx,new StoredRecord(record,null,null,0L,Map.of()),category,command.initialRelations());
            var changed = new TreeSet<>(ids(record.propertyValues()));
            if (!record.title().isEmpty()) category.business().propertyDefinitions().stream()
                    .filter(d -> d.deletedAt() == null && d.type() == PropertyDefinitionType.TITLE).forEach(d -> changed.add(d.id()));
            changed.addAll(relationChanges.changedIds());
            computation(tx, record, List.copyOf(changed), category, "create");
            inverseComputations(tx,relationChanges,"inverse-create:"+record.id()+":v"+record.version());
            tx.remember(key, hash, record);
            return record;
        });
    }
    public CareerRecord patch(Actor actor, String id, long expected, PatchCareerBusinessCommand changes) {
        return repository.transaction(actor, tx -> {
            var stored = expected(tx.record(id, false), expected);
            var category = tx.category(stored.business().categoryId());
            changes.propertyValues().ifPresent(delta -> CareerValueValidation.validate(category.business(), delta.set()));
            changes.status().ifPresent(status -> CareerWriterPolicy.validateStatusTransition(stored.business().status(), status));
            tx.guardCategory(category);
            var after = stored.business().apply(changes.changesFor(stored.business()), clock.instant());
            var relationChanges=stageRelations(tx,stored,category,changes.relations().orElse(List.of()));
            if(after==stored.business()&&!relationChanges.changed())return after;
            if(after==stored.business())after=CareerWriterPolicy.advance(after,after.categoryId(),after.propertyValues(),clock.instant());
            tx.save(stored, after, null, null, stored.unmapped(), false);
            var changed = new TreeSet<String>();
            if (changes.propertyValues().isPresent()) {
                var oldValues = stored.business().propertyValues().stream().collect(Collectors.toMap(PropertyValue::propertyDefinitionId, v -> v));
                var nextValues = after.propertyValues().stream().collect(Collectors.toMap(PropertyValue::propertyDefinitionId, v -> v));
                changed.addAll(oldValues.keySet()); changed.addAll(nextValues.keySet());
                changed.removeIf(key -> Objects.equals(oldValues.get(key), nextValues.get(key)));
            }
            if (!after.title().equals(stored.business().title())) category.business().propertyDefinitions().stream()
                    .filter(d -> d.deletedAt() == null && d.type() == PropertyDefinitionType.TITLE).forEach(d -> changed.add(d.id()));
            changed.addAll(relationChanges.changedIds());
            if (!changed.isEmpty()) {
                if (changes.propertyValues().isPresent()) {
                    var versions=category.business().propertyDefinitions().stream().filter(d -> changed.contains(d.id()))
                            .collect(Collectors.toMap(PropertyDefinition::id, PropertyDefinition::version));
                    tx.computation(after,List.copyOf(changed),versions,"patch");
                } else computation(tx, after, List.copyOf(changed), category, "patch");
            }
            inverseComputations(tx,relationChanges,"inverse-patch:"+id+":v"+after.version());
            return after;
        });
    }
    public CareerRecord trash(Actor actor, String id, long expected) {
        return repository.transaction(actor, tx -> {
            var stored = expected(tx.record(id, false), expected);
            var now = clock.instant();
            var after = CareerWriterPolicy.advance(stored.business(), stored.business().categoryId(), stored.business().propertyValues(), now);
            tx.save(stored, after, now, now.plusSeconds(30L * 24 * 60 * 60), stored.unmapped(), false);
            return after;
        });
    }
    public CareerRecord restore(Actor actor, String id, long expected) {
        return repository.transaction(actor, tx -> {
            var stored = expected(tx.record(id, true), expected);
            if (stored.purgeAfter() == null || !stored.purgeAfter().isAfter(clock.instant())) throw new CareerCommandException(409, "RESTORE_EXPIRED");
            var after = CareerWriterPolicy.advance(stored.business(), stored.business().categoryId(), stored.business().propertyValues(), clock.instant());
            tx.save(stored, after, null, null, stored.unmapped(), false);
            return after;
        });
    }
    public record MovePreview(String previewToken, String targetCategoryId, long version, Instant expiresAt,
                              List<CareerPropertyConversion> conversions, List<String> unmappedPropertyIds) {}
    public MovePreview previewMove(Actor actor, String id, long expected, String targetId) {
        return repository.transaction(actor, tx -> {
            var stored = expected(tx.record(id, false), expected);
            var source = tx.category(stored.business().categoryId()); var target = tx.category(targetId);
            if (source.business().id().equals(targetId)) throw new IllegalArgumentException("같은 category로 이동할 수 없습니다");
            var now = clock.instant();
            var plan = planner.plan(stored.business(), source.business(), target.business(), stored.unmapped(), now);
            validateMove(target, plan);
            tx.validateUnmappedMove(stored, plan.unmappedProperties());
            return new MovePreview(tokens.sign(binding(actor, stored, source, target), now), targetId, expected, now.plusSeconds(900),
                    plan.conversions(), plan.unmappedProperties().keySet().stream().sorted().toList());
        });
    }
    public CareerRecord move(Actor actor, String id, long expected, String targetId, String token) {
        return move(actor,id,expected,targetId,token,List.of());
    }
    public CareerRecord move(Actor actor,String id,long expected,String targetId,String token,List<String> discardUnmappedPropertyIds) {
        if(discardUnmappedPropertyIds.size()>200)throw new IllegalArgumentException("discard ID는 최대 200개입니다");
        var discard=discardUnmappedPropertyIds.stream().map(value -> PropertyValue.requireUuid(value,"discardUnmappedPropertyId")).toList();
        return repository.transaction(actor, tx -> {
            var stored = expected(tx.record(id, false), expected);
            var source = tx.category(stored.business().categoryId()); var target = tx.category(targetId);
            if (source.business().id().equals(targetId)) throw new IllegalArgumentException("같은 category로 이동할 수 없습니다");
            var issued = tokens.verify(token, binding(actor, stored, source, target), clock.instant());
            var plan = planner.plan(stored.business(), source.business(), target.business(), stored.unmapped(), issued);
            validateMove(target, plan);
            tx.validateUnmappedMove(stored, plan.unmappedProperties());
            // preview와 같은 plan의 unmapped 값에만 명시적인 삭제를 적용합니다.
            var unmapped=new TreeMap<>(plan.unmappedProperties());
            if(discard.stream().anyMatch(propertyId -> !unmapped.containsKey(propertyId)))throw new IllegalArgumentException("discard ID가 preview의 unmapped 범위를 벗어났습니다");
            discard.forEach(unmapped::remove);
            tx.guardCategory(source); tx.guardCategory(target);
            tx.guardActive(List.of(id));
            var after = CareerWriterPolicy.advance(stored.business(), targetId, plan.propertyValues(), clock.instant());
            tx.save(stored, after, null, null, unmapped, true);
            tx.computation(after, plan.computationPropertyIds(), plan.targetPropertyVersions(), "move");
            return after;
        });
    }
    public CareerRecord relation(Actor actor,String id,long expected,String propertyId,List<String> rawTargets) {
        var input=new CareerRelationTargets(propertyId,rawTargets);
        return repository.transaction(actor,tx->{
            var source=expected(tx.record(id,false),expected);var category=tx.category(source.business().categoryId());
            var changes=stageRelations(tx,source,category,List.of(input));if(!changes.changed())return source.business();
            var after=CareerWriterPolicy.advance(source.business(),source.business().categoryId(),source.business().propertyValues(),clock.instant());tx.save(source,after,null,null,source.unmapped(),false);
            computation(tx,after,List.copyOf(changes.changedIds()),category,"relation:"+propertyId);inverseComputations(tx,changes,"inverse:"+id+":"+propertyId+":v"+after.version());return after;
        });
    }
    private record RelationChanges(Set<String> changedIds,Map<String,StoredRecord> records,Map<String,Set<String>> inverses) {boolean changed(){return !changedIds.isEmpty();}}
    private static String relatedRecord(Edge edge,String recordId){return edge.sourceRecordId().equals(recordId)?edge.targetRecordId():edge.sourceRecordId();}
    private static String relatedProperty(Edge edge,String recordId){return edge.sourceRecordId().equals(recordId)?edge.inversePropertyId():edge.sourcePropertyId();}
    private RelationChanges stageRelations(Operations tx,StoredRecord source,Category category,List<CareerRelationTargets> requests) {
        var changedIds=new TreeSet<String>();var allRecords=new TreeMap<String,StoredRecord>();var inverseChanges=new TreeMap<String,Set<String>>();var id=source.business().id();
        for(var request:requests) {
            var propertyId=request.propertyId();var targets=request.targetIds().stream().distinct().sorted().toList();if(targets.contains(id))throw new IllegalArgumentException("자기 자신을 연결할 수 없습니다");
            var definition=relationDefinition(category,propertyId);if(definition.cardinality().equals("single")&&targets.size()>1)throw new IllegalArgumentException("단일 관계입니다");
            var records=new LinkedHashMap<String,StoredRecord>();var inverses=new HashMap<String,RelationDefinition>();
            for(var targetId:targets) {
                var target=tx.record(targetId,false);if(!target.business().categoryId().equals(definition.targetCategoryId()))throw new IllegalArgumentException("대상 category가 일치하지 않습니다");records.put(targetId,target);
                var targetCategory=tx.category(target.business().categoryId());tx.guardCategory(targetCategory);
                if(definition.inversePropertyId()!=null) {
                    var inverse=relationDefinition(targetCategory,definition.inversePropertyId());if(!inverse.targetCategoryId().equals(source.business().categoryId()))throw new CareerCommandException(409,"INVERSE_CATEGORY_CHANGED");
                    if(inverse.cardinality().equals("single")&&tx.edges(targetId,definition.inversePropertyId()).stream().anyMatch(edge->!relatedRecord(edge,targetId).equals(id)))throw new CareerCommandException(409,"INVERSE_RELATION_CONFLICT");
                    inverses.put(targetId,inverse);
                }
            }
            var existing=tx.edges(id,propertyId);tx.guardCategory(category);if(existing.stream().map(edge->relatedRecord(edge,id)).distinct().sorted().toList().equals(targets))continue;
            var guarded=new TreeSet<>(targets);guarded.add(id);
            // 기존 관계 제거는 휴지통의 대상을 되살리지 않으며 활성 대상의 reference 원장에서 경쟁합니다.
            for(var edge:existing)if(!records.containsKey(relatedRecord(edge,id))) {
                var targetId=relatedRecord(edge,id);StoredRecord target;
                try{target=tx.record(targetId,false);}catch(CareerCommandException error){if(error.status()!=404)throw error;continue;}
                tx.guardCategory(tx.category(target.business().categoryId()));records.put(targetId,target);guarded.add(targetId);
            }
            tx.guardActive(List.copyOf(guarded));
            for(var edge:existing){tx.removeEdge(edge);if(edge.inversePropertyId()!=null)tx.removeEdge(new Edge(edge.targetRecordId(),edge.inversePropertyId(),edge.sourceRecordId(),null,edge.cardinality(),edge.deletePolicy()));}
            for(var targetId:targets){tx.insertEdge(new Edge(id,propertyId,targetId,definition.inversePropertyId(),definition.cardinality(),definition.deletePolicy()));if(definition.inversePropertyId()!=null){var inverse=inverses.get(targetId);tx.insertEdge(new Edge(targetId,definition.inversePropertyId(),id,propertyId,inverse.cardinality(),inverse.deletePolicy()));}}
            changedIds.add(propertyId);allRecords.putAll(records);
            for(var edge:existing)if(relatedProperty(edge,id)!=null&&records.containsKey(relatedRecord(edge,id)))inverseChanges.computeIfAbsent(relatedRecord(edge,id),ignored->new TreeSet<>()).add(relatedProperty(edge,id));
            if(definition.inversePropertyId()!=null)for(var targetId:targets)inverseChanges.computeIfAbsent(targetId,ignored->new TreeSet<>()).add(definition.inversePropertyId());
        }
        return new RelationChanges(changedIds,allRecords,inverseChanges);
    }
    private void inverseComputations(Operations tx,RelationChanges changes,String suffix){changes.inverses().forEach((targetId,properties)->tx.computation(changes.records().get(targetId).business(),List.copyOf(properties),Map.of(),suffix));}
    public record LinkResult(RecordLink link,long version) {}
    public LinkResult createLink(Actor actor,String id,long expected,String targetId,String relation) {
        PropertyValue.requireUuid(id,"recordId");PropertyValue.requireUuid(targetId,"toRecordId");
        if(id.equals(targetId) || !Set.of("related","parent","duplicate_of").contains(relation))throw new IllegalArgumentException("record link 입력이 올바르지 않습니다");
        return repository.transaction(actor,tx->{
            var source=expected(tx.record(id,false),expected);var target=tx.record(targetId,false);
            var category=tx.category(source.business().categoryId());var targetCategory=tx.category(target.business().categoryId());
            var ordered=relation.equals("parent")?List.of(id,targetId):List.of(id,targetId).stream().sorted().toList();
            var existing=tx.recordLink(ordered.getFirst(),ordered.getLast(),relation);
            // 고유 tuple 자체가 기존 링크 API의 receipt입니다. 재시도는 새 가드나 business 값을 쓰지 않습니다.
            if(existing!=null)return new LinkResult(existing,source.business().version());
            tx.guardCategory(category);if(!category.business().id().equals(targetCategory.business().id()))tx.guardCategory(targetCategory);
            tx.guardActive(List.of(id,targetId));
            var link=new RecordLink(UUID.randomUUID().toString(),ordered.getFirst(),ordered.getLast(),relation);tx.insertRecordLink(link);
            return new LinkResult(link,source.business().version());
        });
    }
    public List<RecordLink> listLinks(Actor actor,String id) {
        PropertyValue.requireUuid(id,"recordId");return repository.transaction(actor,tx->{tx.record(id,false);return tx.recordLinks(id);});
    }
    private record RelationDefinition(String targetCategoryId, String inversePropertyId, String cardinality, String deletePolicy) {}
    private static RelationDefinition relationDefinition(Category category, String id) {
        var property = category.business().propertyDefinitions().stream().filter(d -> d.id().equals(id) && d.deletedAt() == null && d.type() == PropertyDefinitionType.RELATION)
                .findFirst().orElseThrow(() -> new IllegalArgumentException("relation definition이 없습니다"));
        var config = property.config();
        var target = (String) config.get("targetCategoryId"); var inverse = (String) config.get("inversePropertyId");
        var cardinality = (String) config.get("cardinality"); var deletePolicy = (String) config.get("deletePolicy");
        if (target == null || !Set.of("single", "multiple").contains(cardinality) || !Set.of("restrict", "nullify").contains(deletePolicy)
                || !config.containsKey("inversePropertyId")) throw new IllegalArgumentException("relation config가 올바르지 않습니다");
        UUID.fromString(target); if (inverse != null) UUID.fromString(inverse);
        return new RelationDefinition(target, inverse, cardinality, deletePolicy);
    }
    private static StoredRecord expected(StoredRecord record, long expected) {
        if (expected < 1 || expected > CareerRecord.MAX_VERSION) throw new IllegalArgumentException("expected version 범위 오류입니다");
        if (record.business().version() != expected) throw CareerCommandException.stale();
        return record;
    }
    private static List<String> ids(List<PropertyValue> values) { return values.stream().map(PropertyValue::propertyDefinitionId).distinct().sorted().toList(); }
    private static void computation(Operations tx, CareerRecord record, List<String> changed, Category category, String suffix) {
        var ids = new TreeSet<>(changed);
        category.business().propertyDefinitions().stream().filter(d -> d.deletedAt() == null && (d.type() == PropertyDefinitionType.FORMULA || d.type() == PropertyDefinitionType.ROLLUP)).forEach(d -> ids.add(d.id()));
        if (ids.isEmpty()) return;
        var versions = category.business().propertyDefinitions().stream().filter(d -> ids.contains(d.id())).collect(Collectors.toMap(PropertyDefinition::id, PropertyDefinition::version));
        tx.computation(record, List.copyOf(ids), versions, suffix);
    }
    private void validateMove(Category target, CareerCategoryMovePlan plan) {
        CareerValueValidation.validate(target.business(), plan.propertyValues());
        // 중복 target mapping은 aggregate 검증으로 거부하여 값을 덮어쓰지 않습니다.
        new CareerRecord(target.business().id(), target.business().id(), target.business().id(), "", plan.propertyValues(), CareerRecordStatus.DRAFT, 1, Instant.EPOCH);
    }
    private String binding(Actor actor, StoredRecord stored, Category source, Category target) {
        return actor.userId() + ":" + stored.business().id() + ":" + stored.business().version() + ":" + source.business().id() + ":" + target.business().id()
                + ":" + source.schemaVersion() + ":" + target.schemaVersion() + ":" + source.categoryVersion() + ":" + target.categoryVersion()
                + ":" + CareerMoveTokens.hash(json.writeValueAsString(List.of(source.business(), target.business(), new TreeMap<>(stored.unmapped()))));
    }
}
