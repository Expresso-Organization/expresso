package com.expresso.backend.career.infrastructure.mongo;

import java.time.Instant;
import java.util.Date;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Optional;

import org.bson.Document;
import org.springframework.data.mongodb.core.FindAndModifyOptions;
import org.springframework.data.mongodb.core.MongoTemplate;
import org.springframework.data.mongodb.core.query.Criteria;
import org.springframework.data.mongodb.core.query.Query;
import org.springframework.data.mongodb.core.query.Update;
import org.springframework.stereotype.Repository;

import com.expresso.backend.career.application.CareerCategoryMoveCategorySnapshot;
import com.expresso.backend.career.application.CareerCategoryMovePlan;
import com.expresso.backend.career.application.CareerCategoryMoveRecordSnapshot;
import com.expresso.backend.career.application.CareerCategoryMoveRepository;
import com.expresso.backend.career.application.CareerUnmappedProperties;
import com.expresso.backend.career.application.CareerUnmappedPropertyEnvelope;
import com.expresso.backend.career.application.CareerUnmappedPropertyProvenance;
import com.expresso.backend.career.application.CareerUnmappedPropertyReason;
import com.expresso.backend.career.domain.CareerRecord;

@Repository
public class MongoCareerCategoryMoveRepository implements CareerCategoryMoveRepository {

	private final MongoTemplate mongoTemplate;
	private final MongoCareerRecordProjector recordProjector = new MongoCareerRecordProjector();

	public MongoCareerCategoryMoveRepository(MongoTemplate mongoTemplate) {
		this.mongoTemplate = mongoTemplate;
	}

	@Override
	public Optional<CareerCategoryMoveRecordSnapshot> findOwnedRecord(String userId, String recordId) {
		var query = Query.query(Criteria.where("_id").is(recordId).and("userId").is(userId).and("deletedAt").is(null));
		var document = mongoTemplate.findOne(query, Document.class, "career_records");
		if (document == null) return Optional.empty();
		return Optional.of(new CareerCategoryMoveRecordSnapshot(recordProjector.project(document), readUnmapped(document)));
	}

	@Override
	public Optional<CareerCategoryMoveCategorySnapshot> findReadableCategory(String userId, String categoryId) {
		var owner = new Criteria().orOperator(Criteria.where("isSystem").is(true), Criteria.where("userId").is(userId));
		var query = Query.query(new Criteria().andOperator(Criteria.where("_id").is(categoryId), owner));
		var document = mongoTemplate.findOne(query, Document.class, "career_categories");
		if (document == null) return Optional.empty();
		var version = document.get("schemaVersion") instanceof Number number
				? number.longValue() : ((Number) document.get("version")).longValue();
		return Optional.of(new CareerCategoryMoveCategorySnapshot(MongoCareerCategoryProjector.project(document), version));
	}

	@Override
	public Optional<CareerRecord> move(
			CareerCategoryMoveRecordSnapshot current,
			String targetCategoryId,
			CareerCategoryMovePlan plan,
			CareerUnmappedProperties unmapped,
			Instant changedAt) {
		var record = current.record();
		var query = Query.query(Criteria.where("_id").is(record.id()).and("userId").is(record.ownerId())
				.and("categoryId").is(record.categoryId()).and("deletedAt").is(null).and("version").is(record.version()));
		var update = new Update()
				.set("categoryId", targetCategoryId)
				.set("propertyValues", MongoCareerRecordWriter.writePropertyValues(plan.propertyValues()))
				.set("unmappedProperties", writeUnmapped(unmapped.values()))
				.set("computedProperties", new Document())
				.set("computedAt", null)
				.set("updatedAt", Date.from(changedAt))
				.inc("version", 1)
				.inc("referenceVersion", 1);
		var stored = mongoTemplate.findAndModify(query, update,
				FindAndModifyOptions.options().returnNew(true), Document.class, "career_records");
		return Optional.ofNullable(stored).map(recordProjector::project);
	}

	private static Document writeUnmapped(Map<String, CareerUnmappedPropertyEnvelope> values) {
		var result = new Document();
		values.forEach((id, envelope) -> result.append(id, new Document("sourceCategoryId", envelope.sourceCategoryId())
				.append("propertyValue", MongoCareerRecordWriter.writePropertyValue(envelope.propertyValue()))
				.append("provenance", new Document("sourcePropertyKey", envelope.provenance().sourcePropertyKey())
						.append("sourcePropertyName", envelope.provenance().sourcePropertyName())
						.append("sourcePropertyDefinitionVersion", envelope.provenance().sourcePropertyDefinitionVersion())
						.append("preservedAt", Date.from(envelope.provenance().preservedAt()))
						.append("sourceRecordVersion", envelope.provenance().sourceRecordVersion())
						.append("reason", envelope.provenance().reason().wireName()))));
		return result;
	}

	private static Map<String, CareerUnmappedPropertyEnvelope> readUnmapped(Document record) {
		var raw = record.get("unmappedProperties");
		if (raw == null) return Map.of();
		if (!(raw instanceof Map<?, ?> map)) throw new IllegalStateException("unmappedProperties는 객체여야 합니다");
		var result = new LinkedHashMap<String, CareerUnmappedPropertyEnvelope>();
		for (var entry : map.entrySet()) {
			if (!(entry.getKey() instanceof String id) || !(entry.getValue() instanceof Document envelope)) {
				throw new IllegalStateException("unmappedProperties 항목이 올바르지 않습니다");
			}
			var provenance = envelope.get("provenance", Document.class);
			if (provenance == null) throw new IllegalStateException("unmappedProperties provenance가 필요합니다");
			result.put(id, new CareerUnmappedPropertyEnvelope(
					envelope.getString("sourceCategoryId"),
					MongoCareerRecordProjector.projectPropertyValue(envelope.get("propertyValue", Document.class)),
					new CareerUnmappedPropertyProvenance(
							provenance.getString("sourcePropertyKey"), provenance.getString("sourcePropertyName"),
							((Number) provenance.get("sourcePropertyDefinitionVersion")).longValue(),
							provenance.getDate("preservedAt").toInstant(),
							((Number) provenance.get("sourceRecordVersion")).longValue(),
							CareerUnmappedPropertyReason.fromWireName(provenance.getString("reason")))));
		}
		return Map.copyOf(result);
	}
}
