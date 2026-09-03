package com.expresso.backend.career.infrastructure.mongo;

import java.util.List;

import org.bson.Document;
import org.springframework.data.domain.Sort;
import org.springframework.data.mongodb.core.MongoTemplate;
import org.springframework.data.mongodb.core.query.Criteria;
import org.springframework.data.mongodb.core.query.Query;
import org.springframework.stereotype.Repository;

import com.expresso.backend.career.application.CareerCategoryRepository;
import com.expresso.backend.career.domain.CareerCategory;
import com.expresso.backend.career.domain.PropertyDefinition;
import com.expresso.backend.career.domain.PropertyDefinitionType;

@Repository
public class MongoCareerCategoryRepository implements CareerCategoryRepository {

	private static final String COLLECTION = "career_categories";

	private final MongoTemplate mongoTemplate;

	public MongoCareerCategoryRepository(MongoTemplate mongoTemplate) {
		this.mongoTemplate = mongoTemplate;
	}

	@Override
	public List<CareerCategory> findSystemCategories() {
		var query = Query.query(Criteria.where("isSystem").is(true))
				.with(Sort.by(Sort.Order.asc("sortOrder"), Sort.Order.asc("_id")));
		return mongoTemplate.find(query, Document.class, COLLECTION).stream()
				.map(MongoCareerCategoryRepository::mapCategory)
				.toList();
	}

	@Override
	public boolean existsSystemCategory(String categoryId) {
		var query = Query.query(Criteria.where("_id").is(categoryId)
				.and("isSystem").is(true));
		return mongoTemplate.exists(query, COLLECTION);
	}

	private static CareerCategory mapCategory(Document document) {
		return new CareerCategory(
				document.getString("_id"),
				document.getString("key"),
				document.getString("name"),
				mapTextDefinitions(document.getList("propertyDefinitions", Document.class, List.of())));
	}

	private static List<PropertyDefinition> mapTextDefinitions(List<Document> definitions) {
		return definitions.stream()
				.filter(definition -> "text".equals(definition.getString("type")))
				.map(MongoCareerCategoryRepository::mapTextDefinition)
				.toList();
	}

	private static PropertyDefinition mapTextDefinition(Document definition) {
		return new PropertyDefinition(
				definition.getString("id"),
				definition.getString("key"),
				definition.getString("label"),
				PropertyDefinitionType.TEXT,
				definition.getBoolean("required"),
				definition.getBoolean("system"));
	}

}
