package com.expresso.backend.career.infrastructure.mongo;

import java.time.Clock;
import java.util.Date;
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
import com.expresso.backend.career.application.CareerComputationOutbox;
import com.expresso.backend.career.application.CareerComputationOutboxConflictException;

@Repository
public class MongoCareerComputationOutbox implements CareerComputationOutbox {

	private static final String COLLECTION = "outbox_events";
	private static final String TOPIC = "career.computation";

	private final MongoTemplate mongoTemplate;
	private final Clock clock;

	public MongoCareerComputationOutbox(MongoTemplate mongoTemplate, Clock clock) {
		this.mongoTemplate = Objects.requireNonNull(mongoTemplate, "mongoTemplate은 null일 수 없습니다");
		this.clock = Objects.requireNonNull(clock, "clock은 null일 수 없습니다");
	}

	@Override
	public void append(CareerComputationEvent event) {
		var now = Date.from(clock.instant());
		var idempotencyKey = "career-record:" + event.recordId() + ":v" + event.sourceRecordVersion();
		var payload = new Document("userId", event.userId())
				.append("recordId", event.recordId())
				.append("changedPropertyIds", event.changedPropertyIds())
				.append("sourceRecordVersion", event.sourceRecordVersion())
				.append("sourcePropertyVersions", new Document(event.sourcePropertyVersions()));
		var inserted = new Document("_id", UUID.randomUUID().toString())
				.append("userId", event.userId()).append("topic", TOPIC).append("payload", payload)
				.append("idempotencyKey", idempotencyKey).append("state", "pending").append("attempts", 0)
				.append("availableAt", now).append("createdAt", now).append("updatedAt", now);
		var insertOnly = new Update();
		inserted.forEach(insertOnly::setOnInsert);
		var stored = mongoTemplate.findAndModify(
				Query.query(Criteria.where("idempotencyKey").is(idempotencyKey)),
				insertOnly,
				FindAndModifyOptions.options().upsert(true).returnNew(true),
				Document.class,
				COLLECTION);
		if (stored == null || !TOPIC.equals(stored.getString("topic"))
				|| !Objects.equals(event.userId(), stored.getString("userId"))
				|| !payload.equals(stored.get("payload", Document.class))) {
			throw new CareerComputationOutboxConflictException();
		}
	}
}
