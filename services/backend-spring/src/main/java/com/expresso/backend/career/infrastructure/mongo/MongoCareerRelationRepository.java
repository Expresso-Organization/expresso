package com.expresso.backend.career.infrastructure.mongo;

import java.time.Instant;
import java.util.ArrayList;
import java.util.Date;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.UUID;

import org.bson.Document;
import org.springframework.data.mongodb.core.FindAndModifyOptions;
import org.springframework.data.mongodb.core.MongoTemplate;
import org.springframework.data.mongodb.core.query.Criteria;
import org.springframework.data.mongodb.core.query.Query;
import org.springframework.data.mongodb.core.query.Update;
import org.springframework.stereotype.Repository;

import com.expresso.backend.career.application.CareerComputationEvent;
import com.expresso.backend.career.application.CareerRecordDataIntegrityException;
import com.expresso.backend.career.application.CareerRecordNotFoundException;
import com.expresso.backend.career.application.CareerRecordPreconditionFailedException;
import com.expresso.backend.career.application.CareerRecordValidationException;
import com.expresso.backend.career.application.CareerRelationConflictException;
import com.expresso.backend.career.application.CareerRelationRepository;
import com.expresso.backend.career.domain.CareerCategory;
import com.expresso.backend.career.domain.CareerRecord;
import com.expresso.backend.career.domain.PropertyDefinition;
import com.expresso.backend.career.domain.PropertyDefinitionType;

@Repository
public class MongoCareerRelationRepository implements CareerRelationRepository {

	private static final String RECORDS = "career_records";
	private static final String CATEGORIES = "career_categories";
	private static final String RELATIONS = "career_record_relations";

	private final MongoTemplate mongoTemplate;
	private final MongoCareerRecordProjector recordProjector = new MongoCareerRecordProjector();

	public MongoCareerRelationRepository(MongoTemplate mongoTemplate) {
		this.mongoTemplate = Objects.requireNonNull(mongoTemplate, "mongoTemplate은 null일 수 없습니다");
	}

	@Override
	public Replacement replaceTargets(
			String userId,
			String recordId,
			String propertyId,
			List<String> targetIds,
			long expectedVersion,
			Instant changedAt) {
		var sourceDocument = ownedActiveRecord(userId, recordId);
		if (version(sourceDocument) != expectedVersion) {
			throw new CareerRecordPreconditionFailedException();
		}
		var sourceCategory = readableCategory(userId, sourceDocument.getString("categoryId"));
		var definition = relationDefinition(sourceCategory, propertyId);
		if (definition.cardinality().equals("single") && targetIds.size() > 1) {
			throw new CareerRecordValidationException("single relation은 target을 하나만 허용합니다");
		}

		var targetDocuments = targetIds.isEmpty() ? List.<Document>of() : mongoTemplate.find(
				Query.query(Criteria.where("_id").in(targetIds).and("userId").is(userId).and("deletedAt").is(null)),
				Document.class,
				RECORDS);
		if (targetDocuments.size() != targetIds.size()) {
			throw new CareerRecordNotFoundException();
		}
		if (targetDocuments.stream().anyMatch(target -> !definition.targetCategoryId().equals(target.getString("categoryId")))) {
			throw new CareerRecordValidationException("relation target Category가 PropertyDefinition과 일치하지 않습니다");
		}

		var existingQuery = Query.query(Criteria.where("userId").is(userId)
				.and("sourceRecordId").is(recordId).and("sourcePropertyId").is(propertyId)).limit(1_001);
		var existing = mongoTemplate.find(existingQuery, Document.class, RELATIONS);
		if (existing.size() > 1_000) {
			throw new CareerRelationConflictException("relation target 한도를 초과한 기존 edge가 있습니다");
		}
		var existingIds = existing.stream().map(edge -> edge.getString("targetRecordId")).sorted().toList();
		if (existingIds.equals(targetIds)) {
			return new Replacement(project(sourceDocument), List.of());
		}
		var removedIds = existingIds.stream().filter(id -> !targetIds.contains(id)).toList();
		var removedTargets = removedIds.isEmpty() ? List.<Document>of() : mongoTemplate.find(
				Query.query(Criteria.where("_id").in(removedIds).and("userId").is(userId)
						.and("deletedAt").is(null)), Document.class, RECORDS);
		var addedTargets = targetDocuments.stream()
				.filter(target -> !existingIds.contains(target.getString("_id"))).toList();

		guardActiveRecord(userId, recordId);
		for (var targetId : targetIds) {
			guardActiveRecord(userId, targetId);
		}

		RelationDefinition inverse = null;
		if (definition.inversePropertyId() != null && !targetDocuments.isEmpty()) {
			var targetCategory = readableCategory(userId, definition.targetCategoryId());
			inverse = relationDefinition(targetCategory, definition.inversePropertyId());
			if (!sourceDocument.getString("categoryId").equals(inverse.targetCategoryId())) {
				throw new CareerRelationConflictException("inverse relation의 target Category가 변경되었습니다");
			}
			if (inverse.cardinality().equals("single")) {
				for (var targetId : targetIds) {
					var conflict = mongoTemplate.exists(Query.query(Criteria.where("userId").is(userId)
							.and("sourceRecordId").is(targetId)
							.and("sourcePropertyId").is(definition.inversePropertyId())
							.and("targetRecordId").ne(recordId)), RELATIONS);
					if (conflict) {
						throw new CareerRelationConflictException("inverse single relation에 이미 다른 target이 있습니다");
					}
				}
			}
		}

		if (!existing.isEmpty()) {
			mongoTemplate.remove(Query.query(Criteria.where("userId").is(userId)
					.and("sourceRecordId").is(recordId).and("sourcePropertyId").is(propertyId)), RELATIONS);
			for (var edge : existing) {
				var inversePropertyId = edge.getString("inversePropertyId");
				if (inversePropertyId != null) {
					mongoTemplate.remove(Query.query(Criteria.where("userId").is(userId)
							.and("sourceRecordId").is(edge.getString("targetRecordId"))
							.and("sourcePropertyId").is(inversePropertyId)
							.and("targetRecordId").is(recordId)), RELATIONS);
				}
			}
		}

		var storedAt = Date.from(changedAt);
		for (var target : targetDocuments) {
			mongoTemplate.insert(edge(
					userId, recordId, propertyId, target.getString("_id"), definition.inversePropertyId(),
					definition.cardinality(), definition.deletePolicy(), storedAt), RELATIONS);
			if (inverse != null) {
				mongoTemplate.insert(edge(
						userId, target.getString("_id"), definition.inversePropertyId(), recordId, propertyId,
						inverse.cardinality(), inverse.deletePolicy(), storedAt), RELATIONS);
			}
		}

		var updatedDocument = mongoTemplate.findAndModify(
				Query.query(Criteria.where("_id").is(recordId).and("userId").is(userId)
						.and("deletedAt").is(null).and("version").is(expectedVersion)),
				new Update().set("updatedAt", storedAt).inc("version", 1),
				FindAndModifyOptions.options().returnNew(true), Document.class, RECORDS);
		if (updatedDocument == null) {
			throw new CareerRecordPreconditionFailedException();
		}
		var updated = project(updatedDocument);
		return new Replacement(updated, computationEvents(
				userId, recordId, propertyId, sourceCategory, definition,
				addedTargets, removedTargets, updated.version()));
	}

	private List<CareerComputationEvent> computationEvents(
			String userId,
			String recordId,
			String propertyId,
			CareerCategory sourceCategory,
			RelationDefinition relation,
			List<Document> addedTargets,
			List<Document> removedTargets,
			long updatedVersion) {
		var changedIds = new ArrayList<String>();
		changedIds.add(propertyId);
		sourceCategory.propertyDefinitions().stream()
				.filter(definition -> definition.deletedAt() == null)
				.filter(definition -> definition.type() == PropertyDefinitionType.FORMULA
						|| definition.type() == PropertyDefinitionType.ROLLUP)
				.map(PropertyDefinition::id)
				.forEach(changedIds::add);
		var uniqueChangedIds = changedIds.stream().distinct().toList();
		var versions = new LinkedHashMap<String, Long>();
		for (var definition : sourceCategory.propertyDefinitions()) {
			if (definition.deletedAt() == null && uniqueChangedIds.contains(definition.id())) {
				versions.put(definition.id(), definition.version());
			}
		}
		var events = new ArrayList<CareerComputationEvent>();
		events.add(new CareerComputationEvent(
				userId, recordId, uniqueChangedIds, updatedVersion, versions,
				"career-relation:" + recordId + ":" + propertyId + ":" + recordId + ":v" + updatedVersion));
		if (relation.inversePropertyId() != null) {
			for (var target : java.util.stream.Stream.concat(addedTargets.stream(), removedTargets.stream()).toList()) {
				events.add(new CareerComputationEvent(
						userId, target.getString("_id"), List.of(relation.inversePropertyId()), version(target), null,
						"career-relation:" + recordId + ":" + propertyId + ":" + target.getString("_id")
								+ ":v" + updatedVersion));
			}
		}
		return List.copyOf(events);
	}

	private Document ownedActiveRecord(String userId, String recordId) {
		var document = mongoTemplate.findOne(Query.query(Criteria.where("_id").is(recordId)
				.and("userId").is(userId).and("deletedAt").is(null)), Document.class, RECORDS);
		if (document == null) {
			throw new CareerRecordNotFoundException();
		}
		return document;
	}

	private CareerCategory readableCategory(String userId, String categoryId) {
		var owner = new Criteria().orOperator(Criteria.where("isSystem").is(true), Criteria.where("userId").is(userId));
		var document = mongoTemplate.findOne(Query.query(new Criteria().andOperator(
				Criteria.where("_id").is(categoryId), owner)), Document.class, CATEGORIES);
		if (document == null) {
			throw new CareerRecordNotFoundException();
		}
		try {
			return MongoCareerCategoryProjector.project(document);
		}
		catch (IllegalArgumentException | IllegalStateException exception) {
			throw new CareerRecordDataIntegrityException(exception);
		}
	}

	private static RelationDefinition relationDefinition(CareerCategory category, String propertyId) {
		var property = category.propertyDefinitions().stream()
				.filter(definition -> definition.id().equals(propertyId) && definition.deletedAt() == null)
				.findFirst().orElseThrow(() -> new CareerRecordValidationException("relation PropertyDefinition을 찾을 수 없습니다"));
		if (property.type() != PropertyDefinitionType.RELATION) {
			throw new CareerRecordValidationException("PropertyDefinition type이 relation이 아닙니다");
		}
		var config = property.config();
		if (!config.keySet().equals(java.util.Set.of(
				"targetCategoryId", "inversePropertyId", "cardinality", "deletePolicy"))) {
			throw new CareerRecordValidationException("relation PropertyDefinition config가 올바르지 않습니다");
		}
		var targetCategoryId = uuid(config.get("targetCategoryId"), "targetCategoryId");
		var inversePropertyId = config.get("inversePropertyId") == null
				? null : uuid(config.get("inversePropertyId"), "inversePropertyId");
		var cardinality = enumValue(config.get("cardinality"), List.of("single", "multiple"), "cardinality");
		var deletePolicy = enumValue(config.get("deletePolicy"), List.of("restrict", "nullify"), "deletePolicy");
		return new RelationDefinition(targetCategoryId, inversePropertyId, cardinality, deletePolicy);
	}

	private void guardActiveRecord(String userId, String recordId) {
		var result = mongoTemplate.updateFirst(Query.query(Criteria.where("_id").is(recordId)
				.and("userId").is(userId).and("deletedAt").is(null)), new Update().inc("referenceVersion", 1), RECORDS);
		if (result.getMatchedCount() != 1) {
			throw new CareerRecordNotFoundException();
		}
	}

	private CareerRecord project(Document document) {
		try {
			return recordProjector.project(document);
		}
		catch (IllegalArgumentException | IllegalStateException exception) {
			throw new CareerRecordDataIntegrityException(exception);
		}
	}

	private static long version(Document document) {
		var value = document.get("version");
		if (value instanceof Number number) {
			return number.longValue();
		}
		throw new CareerRecordDataIntegrityException(new IllegalStateException("CareerRecord version은 정수여야 합니다"));
	}

	private static String uuid(Object value, String field) {
		if (!(value instanceof String text)) {
			throw new CareerRecordValidationException("relation " + field + "는 UUID 문자열이어야 합니다");
		}
		try {
			return UUID.fromString(text).toString();
		}
		catch (IllegalArgumentException exception) {
			throw new CareerRecordValidationException("relation " + field + "는 올바른 UUID여야 합니다");
		}
	}

	private static String enumValue(Object value, List<String> allowed, String field) {
		if (value instanceof String text && allowed.contains(text)) {
			return text;
		}
		throw new CareerRecordValidationException("relation " + field + " 값이 올바르지 않습니다");
	}

	private static Document edge(
			String userId,
			String sourceRecordId,
			String sourcePropertyId,
			String targetRecordId,
			String inversePropertyId,
			String cardinality,
			String deletePolicy,
			Date now) {
		return new Document("_id", UUID.randomUUID().toString()).append("userId", userId)
				.append("sourceRecordId", sourceRecordId).append("sourcePropertyId", sourcePropertyId)
				.append("targetRecordId", targetRecordId).append("inversePropertyId", inversePropertyId)
				.append("cardinality", cardinality).append("deletePolicy", deletePolicy).append("createdBy", "user")
				.append("createdAt", now).append("updatedAt", now);
	}

	private record RelationDefinition(
			String targetCategoryId,
			String inversePropertyId,
			String cardinality,
			String deletePolicy) {
	}
}
