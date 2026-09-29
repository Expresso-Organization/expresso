package com.expresso.backend.career.infrastructure.mongo;

import java.util.List;
import java.util.Optional;
import java.util.Map;

import org.bson.Document;
import org.springframework.data.domain.Sort;
import org.springframework.data.mongodb.core.MongoTemplate;
import org.springframework.data.mongodb.core.query.Criteria;
import org.springframework.data.mongodb.core.query.Query;
import org.springframework.data.mongodb.core.query.Update;
import org.springframework.stereotype.Repository;

import com.expresso.backend.career.application.CareerCategoryRepository;
import com.expresso.backend.career.application.CareerDuplicatePropertiesMapper;
import com.expresso.backend.career.domain.CareerCategory;

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
				.map(MongoCareerCategoryProjector::project)
				.toList();
	}

	@Override
	public boolean existsSystemCategory(String categoryId) {
		var query = Query.query(Criteria.where("_id").is(categoryId)
				.and("isSystem").is(true));
		return mongoTemplate.exists(query, COLLECTION);
	}

	@Override
	public Optional<CareerCategory> findSystemCategoryById(String categoryId) {
		var query = Query.query(Criteria.where("_id").is(categoryId)
				.and("isSystem").is(true));
		var document = mongoTemplate.findOne(query, Document.class, COLLECTION);
		return Optional.ofNullable(document).map(MongoCareerCategoryProjector::project);
	}

	@Override
	public Optional<CareerCategory> findAccessibleCategoryById(String ownerId, String categoryId) {
		var query = Query.query(Criteria.where("_id").is(categoryId)
				.orOperator(
						new Criteria().andOperator(
								Criteria.where("isSystem").is(true),
								Criteria.where("userId").is(null)),
						Criteria.where("userId").is(ownerId)));
		var document = mongoTemplate.findOne(query, Document.class, COLLECTION);
		return Optional.ofNullable(document).map(MongoCareerCategoryProjector::project);
	}

	@Override
	public void addExactOptions(
			String categoryId,
			Map<String, List<CareerDuplicatePropertiesMapper.Option>> optionsByDefinitionId) {
		for (var entry : optionsByDefinitionId.entrySet()) {
			if (entry.getValue().isEmpty()) continue;
			var query = Query.query(Criteria.where("_id").is(categoryId)
					.and("propertyDefinitions.id").is(entry.getKey()));
			var options = entry.getValue().stream()
					.map(option -> new Document("id", option.id()).append("name", option.name()))
					.toArray();
			var update = new Update()
					.addToSet("propertyDefinitions.$[definition].config.options").each(options)
					.filterArray(Criteria.where("definition.id").is(entry.getKey()));
			var result = mongoTemplate.updateFirst(query, update, COLLECTION);
			if (result.getMatchedCount() != 1) {
				throw new IllegalStateException("option을 추가할 canonical PropertyDefinition을 찾을 수 없습니다");
			}
		}
	}

}
