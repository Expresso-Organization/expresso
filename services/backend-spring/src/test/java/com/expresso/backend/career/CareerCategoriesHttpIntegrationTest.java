package com.expresso.backend.career;

import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.List;

import org.bson.Document;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.data.mongodb.core.MongoTemplate;
import org.springframework.http.MediaType;
import org.springframework.test.json.JsonCompareMode;
import org.springframework.test.web.servlet.MockMvc;

import com.expresso.backend.CareerTestSecurityConfiguration;
import com.expresso.backend.TestcontainersConfiguration;
import com.expresso.backend.career.application.CareerCategoryRepository;
import com.mongodb.client.MongoCollection;

@Import({ TestcontainersConfiguration.class, CareerTestSecurityConfiguration.class })
@AutoConfigureMockMvc
@SpringBootTest
class CareerCategoriesHttpIntegrationTest {

	private static final String COLLECTION = "career_categories";
	private static final String EXPERIENCE_ID = "475106fc-bf88-4a73-9c27-66c648733936";
	private static final String PROJECT_ID = "af5510dc-9717-4f1e-b0f9-4afd79aafe0f";
	private static final String OFFICIAL_ROLE_ID = "6c663539-48c1-5d12-939d-f100fac993c1";
	private static final String LEGACY_0009_ROLE_ID = "1c768bad-2c1f-5cee-86c5-a43574f0e256";

	@Autowired
	private MockMvc mockMvc;

	@Autowired
	private MongoTemplate mongoTemplate;

	@Autowired
	private CareerCategoryRepository categoryRepository;

	@BeforeEach
	void clearCategories() {
		categories().deleteMany(new Document());
	}

	@Test
	void returnsCanonicalRichDefinitionsWithEveryContractField() throws Exception {
		var canonicalDefinitions = List.of(
				canonicalDefinition(OFFICIAL_ROLE_ID, "role", "담당 역할", "text", true, true,
						new Document(), 0, 3, null),
				canonicalDefinition("10000000-0000-4000-8000-000000000002", "related", "관련 기록", "relation",
						false, false,
						new Document("targetCategoryId", PROJECT_ID)
								.append("inversePropertyId", null)
								.append("cardinality", "multiple")
								.append("deletePolicy", "nullify"),
						1, 2, "2026-09-05T08:00:00Z"));
		var experience = category(EXPERIENCE_ID, "experience", "경험", true, 0)
				.append("propertyDefinitions", canonicalDefinitions)
				.append("propertySchemaV2", List.of(
						v2Definition(OFFICIAL_ROLE_ID, "role", "이전 이름", "text", 0)));
		categories().insertOne(experience);

		mockMvc.perform(get("/v1/career/categories"))
				.andExpect(status().isOk())
				.andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_JSON))
				.andExpect(content().json("""
						{
						  "data": [{
						    "id": "475106fc-bf88-4a73-9c27-66c648733936",
						    "key": "experience",
						    "name": "경험",
						    "propertyDefinitions": [
						      {
						        "id": "6c663539-48c1-5d12-939d-f100fac993c1",
						        "key": "role",
						        "name": "담당 역할",
						        "type": "text",
						        "required": true,
						        "system": true,
						        "config": {},
						        "order": 0,
						        "version": 3,
						        "deletedAt": null
						      },
						      {
						        "id": "10000000-0000-4000-8000-000000000002",
						        "key": "related",
						        "name": "관련 기록",
						        "type": "relation",
						        "required": false,
						        "system": false,
						        "config": {
						          "targetCategoryId": "af5510dc-9717-4f1e-b0f9-4afd79aafe0f",
						          "inversePropertyId": null,
						          "cardinality": "multiple",
						          "deletePolicy": "nullify"
						        },
						        "order": 1,
						        "version": 2,
						        "deletedAt": "2026-09-05T08:00:00Z"
						      }
						    ]
						  }]
						}
						""", JsonCompareMode.STRICT));
	}

	@Test
	void prefersV2OfficialIdentityOverLegacy0009DefinitionsAndExcludesTitle() throws Exception {
		var experience = category(EXPERIENCE_ID, "experience", "경험", true, 0)
				.append("propertyDefinitions", List.of(
						legacy0009Definition(LEGACY_0009_ROLE_ID, "role", "예전 역할", "text")))
				.append("propertySchema", new Document("role", legacyDefinition(OFFICIAL_ROLE_ID, "역할", "text")))
				.append("propertySchemaV2", List.of(
						v2Definition("10000000-0000-4000-8000-000000000001", "title", "제목", "title", 0),
						v2Definition(OFFICIAL_ROLE_ID, "role", "담당 역할", "text", 1)
								.append("system", false)
								.append("version", 4)
								.append("deletedAt", "2026-09-06T09:00:00Z")));
		categories().insertOne(experience);

		mockMvc.perform(get("/v1/career/categories"))
				.andExpect(status().isOk())
				.andExpect(content().json("""
						{
						  "data": [{
						    "id": "475106fc-bf88-4a73-9c27-66c648733936",
						    "key": "experience",
						    "name": "경험",
						    "propertyDefinitions": [{
						      "id": "6c663539-48c1-5d12-939d-f100fac993c1",
						      "key": "role",
						      "name": "담당 역할",
						      "type": "text",
						      "required": false,
						      "system": false,
						      "config": {},
						      "order": 1,
						      "version": 4,
						      "deletedAt": "2026-09-06T09:00:00Z"
						    }]
						  }]
						}
						""", JsonCompareMode.STRICT));
	}

	@Test
	void fallsBackToPropertySchemaWithOfficialIdsAndCanonicalTypeNames() throws Exception {
		var experience = category(EXPERIENCE_ID, "experience", "경험", true, 0)
				.append("propertyDefinitions", List.of(
						legacy0009Definition(LEGACY_0009_ROLE_ID, "role", "예전 역할", "text")))
				.append("propertySchema", new Document()
						.append("role", legacyDefinition(OFFICIAL_ROLE_ID, "역할", "text"))
						.append("skills", legacyDefinition("10000000-0000-4000-8000-000000000003", "기술", "tags"))
						.append("featured", legacyDefinition("10000000-0000-4000-8000-000000000004", "대표", "boolean")));
		categories().insertOne(experience);

		mockMvc.perform(get("/v1/career/categories"))
				.andExpect(status().isOk())
				.andExpect(content().json("""
						{
						  "data": [{
						    "id": "475106fc-bf88-4a73-9c27-66c648733936",
						    "key": "experience",
						    "name": "경험",
						    "propertyDefinitions": [
						      { "id": "6c663539-48c1-5d12-939d-f100fac993c1", "key": "role", "name": "역할", "type": "text", "required": false, "system": true, "config": {}, "order": 0, "version": 1, "deletedAt": null },
						      { "id": "10000000-0000-4000-8000-000000000003", "key": "skills", "name": "기술", "type": "multi_select", "required": false, "system": true, "config": { "options": [] }, "order": 1, "version": 1, "deletedAt": null },
						      { "id": "10000000-0000-4000-8000-000000000004", "key": "featured", "name": "대표", "type": "checkbox", "required": false, "system": true, "config": {}, "order": 2, "version": 1, "deletedAt": null }
						    ]
						  }]
						}
						""", JsonCompareMode.STRICT));
	}

	@Test
	void rejectsConflictingOfficialIdsBetweenV2AndPropertySchema() {
		var experience = category(EXPERIENCE_ID, "experience", "경험", true, 0)
				.append("propertySchema", new Document("role",
						legacyDefinition("10000000-0000-4000-8000-000000000099", "역할", "text")))
				.append("propertySchemaV2", List.of(v2Definition(OFFICIAL_ROLE_ID, "role", "역할", "text", 0)));
		categories().insertOne(experience);

		assertThatThrownBy(categoryRepository::findSystemCategories)
				.isInstanceOf(IllegalStateException.class)
				.hasMessageContaining("propertySchema와 propertySchemaV2의 id가 일치하지 않습니다");
	}

	@Test
	void returnsOnlySystemCategoriesInExistingOrder() throws Exception {
		var project = category(PROJECT_ID, "project", "프로젝트", true, 1)
				.append("propertyDefinitions", List.of());
		var custom = category("3f939b13-c553-4d46-90db-75390644bed5", "custom", "사용자", false, -1)
				.append("propertySchemaV2", List.of(
						v2Definition("7d177c17-906f-50ec-90d6-47c76554f011", "note", "메모", "text", 0)));
		var experience = category(EXPERIENCE_ID, "experience", "경험", true, 0)
				.append("propertyDefinitions", List.of())
				.append("propertySchema", new Document());

		// 삽입 순서와 무관하게 기존 sortOrder, _id 정책으로 반환되어야 합니다.
		categories().insertMany(List.of(project, custom, experience));

		mockMvc.perform(get("/v1/career/categories"))
				.andExpect(status().isOk())
				.andExpect(content().json("""
						{
						  "data": [
						    { "id": "475106fc-bf88-4a73-9c27-66c648733936", "key": "experience", "name": "경험", "propertyDefinitions": [] },
						    { "id": "af5510dc-9717-4f1e-b0f9-4afd79aafe0f", "key": "project", "name": "프로젝트", "propertyDefinitions": [] }
						  ]
						}
						""", JsonCompareMode.STRICT));
	}

	@Test
	void returnsAnEmptyDataArrayWhenThereAreNoSystemCategories() throws Exception {
		mockMvc.perform(get("/v1/career/categories"))
				.andExpect(status().isOk())
				.andExpect(content().json("{\"data\":[]}", JsonCompareMode.STRICT));
	}

	private static Document category(String id, String key, String name, boolean system, int sortOrder) {
		return new Document("_id", id)
				.append("key", key)
				.append("name", name)
				.append("isSystem", system)
				.append("sortOrder", sortOrder)
				.append("icon", "legacy-icon")
				.append("defaultView", "table");
	}

	private static Document canonicalDefinition(
			String id,
			String key,
			String name,
			String type,
			boolean required,
			boolean system,
			Document config,
			int order,
			int version,
			String deletedAt) {
		return new Document("id", id)
				.append("key", key)
				.append("name", name)
				.append("type", type)
				.append("required", required)
				.append("system", system)
				.append("config", config)
				.append("order", order)
				.append("version", version)
				.append("deletedAt", deletedAt);
	}

	private static Document v2Definition(String id, String key, String name, String type, int order) {
		return canonicalDefinition(id, key, name, type, false, true, new Document(), order, 1, null);
	}

	private static Document legacy0009Definition(String id, String key, String label, String type) {
		return new Document("id", id)
				.append("key", key)
				.append("label", label)
				.append("type", type)
				.append("required", false)
				.append("system", true);
	}

	private static Document legacyDefinition(String id, String label, String type) {
		return new Document("id", id)
				.append("label", label)
				.append("type", type)
				.append("required", false)
				.append("system", true);
	}

	private MongoCollection<Document> categories() {
		return mongoTemplate.getCollection(COLLECTION);
	}

}
