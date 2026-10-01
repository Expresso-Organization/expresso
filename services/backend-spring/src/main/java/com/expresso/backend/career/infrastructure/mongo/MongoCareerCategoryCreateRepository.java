package com.expresso.backend.career.infrastructure.mongo;

import java.time.Instant;
import java.util.Date;

import org.bson.Document;
import org.springframework.data.mongodb.core.MongoTemplate;
import org.springframework.data.mongodb.core.query.Criteria;
import org.springframework.data.mongodb.core.query.Query;
import org.springframework.stereotype.Repository;

import com.expresso.backend.career.application.CareerCategoryCreateRepository;
import com.expresso.backend.career.application.CareerPropertyCategorySnapshot;
import com.expresso.backend.career.application.CareerPropertyDefinitionV2Snapshot;
import com.expresso.backend.career.domain.PropertyDefinition;

@Repository
public class MongoCareerCategoryCreateRepository implements CareerCategoryCreateRepository {

	private static final String COLLECTION = "career_categories";
	private final MongoTemplate mongoTemplate;

	public MongoCareerCategoryCreateRepository(MongoTemplate mongoTemplate) {
		this.mongoTemplate = mongoTemplate;
	}

	@Override
	public long countOwnedCustomCategories(String userId) {
		return mongoTemplate.count(Query.query(Criteria.where("userId").is(userId)), COLLECTION);
	}

	@Override
	public boolean existsOwnedCategoryKey(String userId, String key) {
		return mongoTemplate.exists(Query.query(Criteria.where("userId").is(userId).and("key").is(key)), COLLECTION);
	}

	@Override
	public void insert(CareerPropertyCategorySnapshot category, Instant updatedAt) {
		var document = new Document("_id", category.id())
				.append("userId", category.userId())
				.append("key", category.key())
				.append("name", category.name())
				.append("icon", category.icon())
				.append("defaultView", category.defaultView())
				.append("propertySchema", new Document(category.propertySchema()))
				.append("propertySchemaV2", category.propertySchemaV2().stream()
						.map(MongoCareerCategoryCreateRepository::v2Document).toList())
				.append("propertyDefinitions", category.propertyDefinitions().stream()
						.map(MongoCareerCategoryCreateRepository::canonicalDocument).toList())
				.append("schemaVersion", category.schemaVersion())
				.append("isSystem", false)
				.append("sortOrder", category.sortOrder())
				.append("version", category.version())
				.append("updatedAt", Date.from(updatedAt));
		mongoTemplate.insert(document, COLLECTION);
	}

	private static Document canonicalDocument(PropertyDefinition definition) {
		return new Document("id", definition.id())
				.append("key", definition.key())
				.append("name", definition.name())
				.append("type", definition.type().wireName())
				.append("required", definition.required())
				.append("system", definition.system())
				.append("config", new Document(definition.config()))
				.append("order", definition.order())
				.append("version", definition.version())
				.append("deletedAt", null);
	}

	private static Document v2Document(CareerPropertyDefinitionV2Snapshot definition) {
		return new Document("id", definition.id())
				.append("key", definition.key())
				.append("name", definition.name())
				.append("type", definition.type())
				.append("required", definition.required())
				.append("system", definition.system())
				.append("config", new Document(definition.config()))
				.append("order", definition.order())
				.append("version", definition.version())
				.append("deletedAt", null);
	}
}
