package com.expresso.backend.career.infrastructure.mongo;

import java.util.List;
import java.util.Optional;

import org.bson.Document;
import org.springframework.data.domain.Sort;
import org.springframework.data.mongodb.core.MongoTemplate;
import org.springframework.data.mongodb.core.query.Criteria;
import org.springframework.data.mongodb.core.query.Query;
import org.springframework.stereotype.Repository;

import com.expresso.backend.career.application.CareerCategoryRepository;
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

}
