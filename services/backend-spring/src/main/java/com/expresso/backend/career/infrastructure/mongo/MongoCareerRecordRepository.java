package com.expresso.backend.career.infrastructure.mongo;

import java.util.Objects;

import org.bson.Document;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.data.mongodb.core.MongoTemplate;
import org.springframework.data.mongodb.core.query.Criteria;
import org.springframework.data.mongodb.core.query.Query;
import org.springframework.stereotype.Repository;

import com.expresso.backend.career.application.CareerRecordIdempotencyConflictException;
import com.expresso.backend.career.application.CareerRecordRepository;
import com.expresso.backend.career.domain.CareerRecord;

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

	private CreateResult replay(Document existing, String requestHash) {
		if (!requestHash.equals(existing.getString("createRequestHash"))) {
			throw new CareerRecordIdempotencyConflictException();
		}
		return new CreateResult(projector.project(existing), false);
	}

	private Document findByIdempotencyKey(String ownerId, String idempotencyKey) {
		var query = Query.query(Criteria.where("userId").is(ownerId)
				.and("createIdempotencyKey").is(idempotencyKey));
		return mongoTemplate.findOne(query, Document.class, COLLECTION);
	}

}
