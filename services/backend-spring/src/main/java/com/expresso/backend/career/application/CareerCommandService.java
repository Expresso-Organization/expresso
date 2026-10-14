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
        var hash = CareerMoveTokens.hash(json.writeValueAsString(List.of(command.categoryId(), command.title(), command.mode().name(),
                command.propertyValues().stream().map(com.expresso.backend.career.dto.CareerBusinessRecordData.PropertyValueData::from).toList())));
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
            var changed = new TreeSet<>(ids(record.propertyValues()));
            if (!record.title().isEmpty()) category.business().propertyDefinitions().stream()
                    .filter(d -> d.deletedAt() == null && d.type() == PropertyDefinitionType.TITLE).forEach(d -> changed.add(d.id()));
            computation(tx, record, List.copyOf(changed), category, "create");
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
            var after = stored.business().apply(changes.changesFor(stored.business()), clock.instant());
            if (after == stored.business()) return after;
            tx.guardCategory(category);
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
            if (!changed.isEmpty()) {
                if (changes.propertyValues().isPresent()) {
                    var versions=category.business().propertyDefinitions().stream().filter(d -> changed.contains(d.id()))
                            .collect(Collectors.toMap(PropertyDefinition::id, PropertyDefinition::version));
                    tx.computation(after,List.copyOf(changed),versions,"patch");
                } else computation(tx, after, List.copyOf(changed), category, "patch");
            }
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
            return new MovePreview(tokens.sign(binding(actor, stored, source, target), now), targetId, expected, now.plusSeconds(900),
                    plan.conversions(), plan.unmappedProperties().keySet().stream().sorted().toList());
        });
    }
    public CareerRecord move(Actor actor, String id, long expected, String targetId, String token) {
        return repository.transaction(actor, tx -> {
            var stored = expected(tx.record(id, false), expected);
            var source = tx.category(stored.business().categoryId()); var target = tx.category(targetId);
            if (source.business().id().equals(targetId)) throw new IllegalArgumentException("같은 category로 이동할 수 없습니다");
            var issued = tokens.verify(token, binding(actor, stored, source, target), clock.instant());
            var plan = planner.plan(stored.business(), source.business(), target.business(), stored.unmapped(), issued);
            validateMove(target, plan);
            tx.guardCategory(source); tx.guardCategory(target);
            tx.guardActive(List.of(id));
            var after = CareerWriterPolicy.advance(stored.business(), targetId, plan.propertyValues(), clock.instant());
            tx.save(stored, after, null, null, plan.unmappedProperties(), true);
            tx.computation(after, plan.computationPropertyIds(), plan.targetPropertyVersions(), "move");
            return after;
        });
    }
    public CareerRecord relation(Actor actor, String id, long expected, String propertyId, List<String> rawTargets) {
        if (rawTargets.size() > 1000) throw new IllegalArgumentException("관계 대상은 최대 1000개입니다");
        var targets = rawTargets.stream().map(value -> PropertyValue.requireUuid(value,"targetId")).distinct().sorted().toList();
        if (targets.contains(id)) throw new IllegalArgumentException("자기 자신을 연결할 수 없습니다");
        return repository.transaction(actor, tx -> {
            var source = expected(tx.record(id, false), expected);
            var category = tx.category(source.business().categoryId());
            var definition = relationDefinition(category, propertyId);
            if (definition.cardinality().equals("single") && targets.size() > 1) throw new IllegalArgumentException("단일 관계입니다");
            var records = new LinkedHashMap<String, StoredRecord>();
            var inverses = new HashMap<String, RelationDefinition>();
            for (var targetId : targets) {
                var target = tx.record(targetId, false);
                if (!target.business().categoryId().equals(definition.targetCategoryId())) throw new IllegalArgumentException("대상 category가 일치하지 않습니다");
                records.put(targetId, target);
                if (definition.inversePropertyId() != null) {
                    var targetCategory = tx.category(target.business().categoryId());
                    var inverse = relationDefinition(targetCategory, definition.inversePropertyId());
                    if (!inverse.targetCategoryId().equals(source.business().categoryId())) throw new CareerCommandException(409, "INVERSE_CATEGORY_CHANGED");
                    if (inverse.cardinality().equals("single") && tx.edges(targetId, definition.inversePropertyId()).stream().anyMatch(edge -> !edge.targetRecordId().equals(id))) {
                        throw new CareerCommandException(409, "INVERSE_RELATION_CONFLICT");
                    }
                    tx.guardCategory(targetCategory); inverses.put(targetId, inverse);
                }
            }
            var existing = tx.edges(id, propertyId);
            if (existing.stream().map(Edge::targetRecordId).sorted().toList().equals(targets)) return source.business();
            tx.guardCategory(category);
            var guarded = new TreeSet<>(targets); guarded.add(id);
            // 제거되는 inverse도 휴지통·purge와 같은 원장에서 경쟁합니다.
            for (var edge : existing) if (edge.inversePropertyId() != null && !records.containsKey(edge.targetRecordId())) {
                try {
                    records.put(edge.targetRecordId(), tx.record(edge.targetRecordId(), false)); guarded.add(edge.targetRecordId());
                } catch (CareerCommandException exception) {
                    // 기존 main/#35처럼 휴지통·삭제 대상의 edge도 제거할 수 있습니다.
                    if (exception.status() != 404) throw exception;
                }
            }
            tx.guardActive(List.copyOf(guarded));
            for (var edge : existing) {
                tx.removeEdge(edge);
                if (edge.inversePropertyId() != null) tx.removeEdge(new Edge(edge.targetRecordId(), edge.inversePropertyId(), id, null, edge.cardinality(), edge.deletePolicy()));
            }
            for (var targetId : targets) {
                tx.insertEdge(new Edge(id, propertyId, targetId, definition.inversePropertyId(), definition.cardinality(), definition.deletePolicy()));
                if (definition.inversePropertyId() != null) {
                    var inverse = inverses.get(targetId);
                    tx.insertEdge(new Edge(targetId, definition.inversePropertyId(), id, propertyId, inverse.cardinality(), inverse.deletePolicy()));
                }
            }
            var after = CareerWriterPolicy.advance(source.business(), source.business().categoryId(), source.business().propertyValues(), clock.instant());
            tx.save(source, after, null, null, source.unmapped(), false);
            computation(tx, after, List.of(propertyId), category, "relation:" + propertyId);
            var inverseChanges = new TreeMap<String, Set<String>>();
            for (var edge : existing) if (edge.inversePropertyId() != null && records.containsKey(edge.targetRecordId())) inverseChanges.computeIfAbsent(edge.targetRecordId(), k -> new TreeSet<>()).add(edge.inversePropertyId());
            if (definition.inversePropertyId() != null) for (var targetId : targets) inverseChanges.computeIfAbsent(targetId, k -> new TreeSet<>()).add(definition.inversePropertyId());
            inverseChanges.forEach((targetId, properties) -> tx.computation(records.get(targetId).business(), List.copyOf(properties), Map.of(),
                    "inverse:" + id + ":" + propertyId + ":v" + after.version()));
            return after;
        });
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
