package com.expresso.backend.career.infrastructure.mongo;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Instant;
import java.util.Date;
import java.util.List;
import java.util.Map;

import org.bson.Document;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.data.mongodb.core.MongoTemplate;

import com.expresso.backend.TestcontainersConfiguration;
import com.expresso.backend.career.application.CareerCategoryMovePlanner;
import com.expresso.backend.career.application.CareerUnmappedProperties;

@Import(TestcontainersConfiguration.class)
@SpringBootTest
class MongoCareerCategoryMoveRepositoryTest {

	private static final String USER_ID = "10000000-0000-4000-8000-000000000001";
	private static final String RECORD_ID = "10000000-0000-4000-8000-000000000002";
	private static final String SOURCE_ID = "10000000-0000-4000-8000-000000000003";
	private static final String TARGET_ID = "10000000-0000-4000-8000-000000000004";
	private static final String PROPERTY_ID = "10000000-0000-4000-8000-000000000005";
	private static final Instant NOW = Instant.parse("2026-09-14T09:00:00Z");

	@Autowired MongoTemplate mongoTemplate;
	@Autowired MongoCareerCategoryMoveRepository repository;
	@Autowired CareerCategoryMovePlanner planner;

	@BeforeEach
	void clean() {
		mongoTemplate.getCollection("career_records").deleteMany(new Document());
		mongoTemplate.getCollection("career_categories").deleteMany(new Document());
	}

	@Test
	void movesToAnOwnedCustomCategoryWithoutWritingLegacyProperties() {
		mongoTemplate.getCollection("career_categories").insertMany(List.of(category(SOURCE_ID), category(TARGET_ID)));
		var originalLegacy = new Document("role", new Document("type", "text").append("value", "legacy stays"));
		mongoTemplate.getCollection("career_records").insertOne(record(originalLegacy));

		var current = repository.findOwnedRecord(USER_ID, RECORD_ID).orElseThrow();
		var source = repository.findReadableCategory(USER_ID, SOURCE_ID).orElseThrow();
		var target = repository.findReadableCategory(USER_ID, TARGET_ID).orElseThrow();
		var plan = planner.plan(current.record(), source.category(), target.category(), current.unmappedProperties(), NOW);

		var moved = repository.move(current, TARGET_ID, plan, new CareerUnmappedProperties(Map.of()), NOW).orElseThrow();

		assertThat(moved.categoryId()).isEqualTo(TARGET_ID);
		assertThat(moved.version()).isEqualTo(2);
		var stored = mongoTemplate.getCollection("career_records").find(new Document("_id", RECORD_ID)).first();
		assertThat(stored).isNotNull();
		assertThat(stored.get("properties", Document.class)).isEqualTo(originalLegacy);
		assertThat(stored.get("computedProperties", Document.class)).isEmpty();
		assertThat(stored.get("computedAt")).isNull();
		assertThat(stored.getInteger("referenceVersion")).isEqualTo(2);
	}

	private static Document category(String id) {
		return new Document("_id", id).append("userId", USER_ID).append("isSystem", false)
				.append("key", id).append("name", id).append("schemaVersion", 1).append("version", 1)
				.append("propertyDefinitions", List.of(new Document("id", PROPERTY_ID).append("key", "role")
						.append("name", "역할").append("type", "text").append("required", false)
						.append("system", false).append("config", new Document()).append("order", 0)
						.append("version", 1).append("deletedAt", null)));
	}

	private static Document record(Document legacy) {
		return new Document("_id", RECORD_ID).append("userId", USER_ID).append("categoryId", SOURCE_ID)
				.append("title", "기록").append("propertyValues", List.of(new Document("propertyDefinitionId", PROPERTY_ID)
						.append("type", "text").append("value", "canonical")))
				.append("blockBody", new Document("schemaVersion", 1).append("type", "doc").append("content", List.of()))
				.append("version", 1).append("referenceVersion", 1).append("updatedAt", Date.from(NOW.minusSeconds(60)))
				.append("properties", legacy).append("bodyMd", "").append("status", "draft").append("origin", "manual")
				.append("deletedAt", null).append("computedProperties", new Document("old", 1)).append("computedAt", Date.from(NOW.minusSeconds(30)));
	}
}
