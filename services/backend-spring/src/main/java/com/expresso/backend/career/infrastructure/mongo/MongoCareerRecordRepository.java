package com.expresso.backend.career.infrastructure.mongo;

import java.util.Objects;
import java.util.Optional;

import org.bson.Document;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.data.mongodb.core.FindAndModifyOptions;
import org.springframework.data.mongodb.core.MongoTemplate;
import org.springframework.data.mongodb.core.query.Criteria;
import org.springframework.data.mongodb.core.query.Query;
import org.springframework.data.mongodb.core.query.Update;
import org.springframework.stereotype.Repository;

import com.expresso.backend.career.application.CareerRecordDataIntegrityException;
import com.expresso.backend.career.application.CareerRecordIdempotencyConflictException;
import com.expresso.backend.career.application.CareerRecordRepository;
import com.expresso.backend.career.domain.CareerRecord;
import com.expresso.backend.career.domain.CareerRecordStatus;

@Repository
public class MongoCareerRecordRepository implements CareerRecordRepository {

	private static final String COLLECTION = "career_records";

	private final MongoTemplate mongoTemplate;
	private final MongoCareerRecordProjector projector = new MongoCareerRecordProjector();
	private final MongoCareerRecordWriter writer = new MongoCareerRecordWriter();

	public MongoCareerRecordRepository(MongoTemplate mongoTemplate) {
		this.mongoTemplate = Objects.requireNonNull(mongoTemplate, "mongoTemplate은 null일 수 없습니다");
	}

	@Override
	public CreateResult createOrReplay(CareerRecord newRecord, String idempotencyKey, String requestHash) {
		var existing = findByIdempotencyKey(newRecord.ownerId(), idempotencyKey);
		if (existing != null) {
			return replay(existing, requestHash);
		}

		try {
			mongoTemplate.insert(writer.write(newRecord, idempotencyKey, requestHash), COLLECTION);
			return new CreateResult(newRecord, true);
		}
		catch (DuplicateKeyException duplicateKey) {
			var concurrentWinner = findByIdempotencyKey(newRecord.ownerId(), idempotencyKey);
			if (concurrentWinner == null) {
				throw duplicateKey;
			}
			return replay(concurrentWinner, requestHash);
		}
	}

	@Override
	public Optional<CareerRecord> findOwnedCanonicalById(String ownerId, String recordId) {
		var query = Query.query(Criteria.where("_id").is(recordId)
				.and("userId").is(ownerId)
				.and("deletedAt").is(null));
		var document = mongoTemplate.findOne(query, Document.class, COLLECTION);
		if (document == null || isLegacyOnly(document)) {
			return Optional.empty();
		}
		return Optional.of(projectCanonicalData(document));
	}

	@Override
	public Optional<CareerRecord> updateOwnedCanonical(CareerRecord currentRecord, CareerRecord updatedRecord) {
		var query = Query.query(Criteria.where("_id").is(currentRecord.id())
				.and("userId").is(currentRecord.ownerId())
				.and("deletedAt").is(null)
				.and("version").is(currentRecord.version()));
		if (currentRecord.equals(updatedRecord)) {
			var unchanged = mongoTemplate.findOne(query, Document.class, COLLECTION);
			return unchanged == null ? Optional.empty() : Optional.of(projectCanonicalData(unchanged));
		}
		var update = new Update();
		if (!currentRecord.title().equals(updatedRecord.title())) {
			update.set("title", updatedRecord.title());
		}
		if (!currentRecord.propertyValues().equals(updatedRecord.propertyValues())) {
			update.set("propertyValues", MongoCareerRecordWriter.writePropertyValues(updatedRecord.propertyValues()));
		}
		if (!currentRecord.blockBody().equals(updatedRecord.blockBody())) {
			update.set("blockBody", MongoCareerRecordWriter.writeBlockBody(updatedRecord.blockBody()));
		}
		update.set("updatedAt", java.util.Date.from(updatedRecord.updatedAt())).inc("version", 1);
		var document = mongoTemplate.findAndModify(
				query,
				update,
				FindAndModifyOptions.options().returnNew(true),
				Document.class,
				COLLECTION);
		return document == null ? Optional.empty() : Optional.of(projectCanonicalData(document));
	}

	@Override
	public Optional<CareerRecord> updateOwnedStatus(
			CareerRecord currentRecord,
			CareerRecordStatus status,
			java.time.Instant changedAt) {
		var query = Query.query(Criteria.where("_id").is(currentRecord.id())
				.and("userId").is(currentRecord.ownerId())
				.and("deletedAt").is(null)
				.and("version").is(currentRecord.version()));
		var existing = mongoTemplate.findOne(query, Document.class, COLLECTION);
		if (existing == null) {
			return Optional.empty();
		}
		if (status.wireName().equals(existing.getString("status"))) {
			return Optional.of(projectCanonicalData(existing));
		}
		var update = new Update()
				.set("status", status.wireName())
				.set("updatedAt", java.util.Date.from(changedAt))
				.inc("version", 1);
		var document = mongoTemplate.findAndModify(
				query,
				update,
				FindAndModifyOptions.options().returnNew(true),
				Document.class,
				COLLECTION);
		return document == null ? Optional.empty() : Optional.of(projectCanonicalData(document));
	}

	private CreateResult replay(Document existing, String requestHash) {
		if (!requestHash.equals(existing.getString("createRequestHash"))) {
			throw new CareerRecordIdempotencyConflictException();
		}
		return new CreateResult(projector.project(existing), false);
	}

	private CareerRecord projectCanonicalData(Document document) {
		try {
			return projector.project(document);
		}
		catch (RuntimeException projectionError) {
			throw new CareerRecordDataIntegrityException(projectionError);
		}
	}

	private static boolean isLegacyOnly(Document document) {
		return !document.containsKey("propertyValues") && !document.containsKey("blockBody");
	}

	private Document findByIdempotencyKey(String ownerId, String idempotencyKey) {
		var query = Query.query(Criteria.where("userId").is(ownerId)
				.and("createIdempotencyKey").is(idempotencyKey));
		return mongoTemplate.findOne(query, Document.class, COLLECTION);
	}

}
