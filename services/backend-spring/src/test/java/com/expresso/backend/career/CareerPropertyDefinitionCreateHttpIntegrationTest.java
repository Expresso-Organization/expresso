package com.expresso.backend.career;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.util.Date;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import org.bson.Document;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.context.annotation.Primary;
import org.springframework.data.mongodb.core.MongoTemplate;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;

import com.expresso.backend.TestcontainersConfiguration;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

@Import({ TestcontainersConfiguration.class, CareerPropertyDefinitionCreateHttpIntegrationTest.TestClockConfiguration.class })
@AutoConfigureMockMvc
@SpringBootTest
class CareerPropertyDefinitionCreateHttpIntegrationTest {

	private static final String USER_ID = "10000000-0000-4000-8000-000000000001";
	private static final String OTHER_USER_ID = "10000000-0000-4000-8000-000000000002";
	private static final String CATEGORY_ID = "10000000-0000-4000-8000-000000000003";
	private static final String SYSTEM_CATEGORY_ID = "10000000-0000-4000-8000-000000000004";
	private static final String ACTIVE_PROPERTY_ID = "10000000-0000-4000-8000-000000000005";
	private static final String DELETED_PROPERTY_ID = "10000000-0000-4000-8000-000000000006";
	private static final String TITLE_PROPERTY_ID = "10000000-0000-4000-8000-000000000007";
	private static final String NEW_PROPERTY_ID = "10000000-0000-4000-8000-000000000008";
	private static final String RECORD_ID = "10000000-0000-4000-8000-000000000009";
	private static final String TARGET_CATEGORY_ID = "10000000-0000-4000-8000-000000000010";
	private static final String INVERSE_PROPERTY_ID = "10000000-0000-4000-8000-000000000011";
	private static final String TARGET_RECORD_ID = "10000000-0000-4000-8000-000000000012";
	private static final String TARGET_VALUE_PROPERTY_ID = "10000000-0000-4000-8000-000000000013";
	private static final String ROLLUP_PROPERTY_ID = "10000000-0000-4000-8000-000000000014";
	private static final String TOKEN = "exps_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
	private static final String TOKEN_HASH = "74b2c367c4d415397a6bc46772e8af855235d2c0866bc7dbefdbc2105fde56fc";
	private static final Instant TEST_NOW = Instant.parse("2026-09-25T00:00:00Z");

	@Autowired MockMvc mockMvc;
	@Autowired MongoTemplate mongoTemplate;
	@Autowired MutableTestClock testClock;
	private final ObjectMapper objectMapper = new ObjectMapper();

	@BeforeEach
	void prepare() {
		testClock.set(TEST_NOW);
		for (var collection : List.of(
				"career_records", "career_categories", "career_record_relations", "outbox_events",
				"identity_sessions", "users")) {
			mongoTemplate.getCollection(collection).deleteMany(new Document());
		}
		insertIdentity();
		mongoTemplate.getCollection("career_categories").insertOne(customCategory(CATEGORY_ID, USER_ID, false));
		mongoTemplate.getCollection("career_categories").insertOne(customCategory(SYSTEM_CATEGORY_ID, USER_ID, true));
		mongoTemplate.getCollection("career_categories").insertOne(targetCategory());
		mongoTemplate.getCollection("career_records").insertOne(record());
	}

	@Test
	void createsARelationDefinitionWithAnAccessibleTargetAndCompatibleInverse() throws Exception {
		var config = new Document("targetCategoryId", TARGET_CATEGORY_ID)
				.append("inversePropertyId", INVERSE_PROPERTY_ID)
				.append("cardinality", "multiple")
				.append("deletePolicy", "nullify");
		var change = createChange(NEW_PROPERTY_ID, "related", "관련 기록", "relation", config);
		var token = response(preview(CATEGORY_ID, change).andExpect(status().isOk()).andReturn())
				.get("data").get("previewToken").asText();

		apply(CATEGORY_ID, change, token, "\"v7\"", "create-relation-property")
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.data.propertySchemaV2[3].id").value(NEW_PROPERTY_ID))
				.andExpect(jsonPath("$.data.propertySchemaV2[3].type").value("relation"))
				.andExpect(jsonPath("$.data.propertySchemaV2[3].config.targetCategoryId").value(TARGET_CATEGORY_ID))
				.andExpect(jsonPath("$.data.propertySchemaV2[3].config.inversePropertyId").value(INVERSE_PROPERTY_ID));

		var stored = storedCategory();
		assertThat(stored.getList("propertyDefinitions", Document.class).getLast())
				.containsEntry("id", NEW_PROPERTY_ID)
				.containsEntry("type", "relation")
				.containsEntry("config", config);

		mongoTemplate.getCollection("career_records").insertOne(record(TARGET_RECORD_ID, TARGET_CATEGORY_ID));
		mockMvc.perform(put("/v1/career/records/{recordId}/relations", RECORD_ID)
				.header(HttpHeaders.AUTHORIZATION, "Bearer " + TOKEN)
				.header(HttpHeaders.IF_MATCH, "\"v1\"")
				.contentType(MediaType.APPLICATION_JSON)
				.content(objectMapper.writeValueAsString(Map.of(
						"propertyId", NEW_PROPERTY_ID,
						"targetIds", List.of(TARGET_RECORD_ID)))))
				.andExpect(status().isOk())
				.andExpect(header().string(HttpHeaders.ETAG, "\"v2\""));
		assertThat(mongoTemplate.getCollection("career_record_relations").countDocuments(
				new Document("sourceRecordId", RECORD_ID).append("sourcePropertyId", NEW_PROPERTY_ID)))
				.isEqualTo(1);
	}

	@Test
	void rejectsRelationDefinitionsWithMissingTargetsOrIncompatibleInverses() throws Exception {
		var missingTarget = createChange(NEW_PROPERTY_ID, "missing_target", "없는 대상", "relation",
				new Document("targetCategoryId", UUID.randomUUID().toString())
						.append("inversePropertyId", null).append("cardinality", "multiple")
						.append("deletePolicy", "nullify"));
		preview(CATEGORY_ID, missingTarget).andExpect(status().isBadRequest());

		var incompatibleInverse = createChange(NEW_PROPERTY_ID, "bad_inverse", "잘못된 역관계", "relation",
				new Document("targetCategoryId", TARGET_CATEGORY_ID)
						.append("inversePropertyId", ACTIVE_PROPERTY_ID).append("cardinality", "multiple")
						.append("deletePolicy", "nullify"));
		preview(CATEGORY_ID, incompatibleInverse).andExpect(status().isBadRequest());
	}

	@Test
	void createsAFormulaDefinitionAndEnqueuesACompatibleComputationEvent() throws Exception {
		var config = new Document("source", "prop(\"" + ACTIVE_PROPERTY_ID + "\")")
				.append("ast", new Document("expression", new Document("propertyId", ACTIVE_PROPERTY_ID)))
				.append("diagnostics", List.of());
		var change = createChange(NEW_PROPERTY_ID, "computed", "계산값", "formula", config);
		var token = response(preview(CATEGORY_ID, change).andExpect(status().isOk()).andReturn())
				.get("data").get("previewToken").asText();

		apply(CATEGORY_ID, change, token, "\"v7\"", "create-formula-property")
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.data.propertySchemaV2[3].type").value("formula"));

		var stored = storedCategory().getList("propertyDefinitions", Document.class).getLast();
		assertThat(stored).containsEntry("id", NEW_PROPERTY_ID).containsEntry("config", config);
		var event = mongoTemplate.getCollection("outbox_events").find(new Document(
				"idempotencyKey", "career-computed-schema:" + CATEGORY_ID + ":" + NEW_PROPERTY_ID
						+ ":v5:" + RECORD_ID)).first();
		assertThat(event).isNotNull();
		assertThat(event.getString("topic")).isEqualTo("career.computation");
		assertThat(event.get("payload", Document.class))
				.containsEntry("recordId", RECORD_ID)
				.containsEntry("changedPropertyIds", List.of(NEW_PROPERTY_ID))
				.containsEntry("sourceRecordVersion", 1L)
				.containsEntry("sourcePropertyVersions", new Document(NEW_PROPERTY_ID, 1L));
	}

	@Test
	void rejectsUnsafeOrErroredFormulaConfigurationsWithoutMutation() throws Exception {
		var beforeCategory = storedCategory();
		for (var config : List.of(
				new Document("source", "eval('x')").append("ast", null).append("diagnostics", List.of()),
				new Document("source", "1 + true").append("ast", null).append("diagnostics", List.of(
						new Document("code", "invalid_operator").append("message", "타입 오류")
								.append("severity", "error").append("start", 0).append("end", 8))))) {
			preview(CATEGORY_ID, createChange(NEW_PROPERTY_ID, "invalid_formula", "잘못된 수식", "formula", config))
					.andExpect(status().isBadRequest());
		}
		assertThat(storedCategory()).isEqualTo(beforeCategory);
		assertThat(mongoTemplate.getCollection("outbox_events").countDocuments()).isZero();
	}

	@Test
	void createsARollupDefinitionAfterValidatingItsRelationAndTargetReferences() throws Exception {
		var relationConfig = new Document("targetCategoryId", TARGET_CATEGORY_ID)
				.append("inversePropertyId", null).append("cardinality", "multiple")
				.append("deletePolicy", "nullify");
		var relationChange = createChange(NEW_PROPERTY_ID, "related_for_rollup", "롤업 관계", "relation", relationConfig);
		var relationToken = response(preview(CATEGORY_ID, relationChange).andExpect(status().isOk()).andReturn())
				.get("data").get("previewToken").asText();
		apply(CATEGORY_ID, relationChange, relationToken, "\"v7\"", "create-rollup-relation")
				.andExpect(status().isOk());

		var config = new Document("relationPropertyId", NEW_PROPERTY_ID)
				.append("targetPropertyId", TARGET_VALUE_PROPERTY_ID).append("aggregation", "sum");
		var change = createChange(ROLLUP_PROPERTY_ID, "total", "합계", "rollup", config);
		var token = response(preview(CATEGORY_ID, change).andExpect(status().isOk()).andReturn())
				.get("data").get("previewToken").asText();
		apply(CATEGORY_ID, change, token, "\"v8\"", "create-rollup-property")
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.data.propertySchemaV2[4].type").value("rollup"));

		assertThat(storedCategory().getList("propertyDefinitions", Document.class).getLast())
				.containsEntry("id", ROLLUP_PROPERTY_ID).containsEntry("config", config);
		var event = mongoTemplate.getCollection("outbox_events").find(new Document(
				"idempotencyKey", "career-computed-schema:" + CATEGORY_ID + ":" + ROLLUP_PROPERTY_ID
						+ ":v6:" + RECORD_ID)).first();
		assertThat(event).isNotNull();
		assertThat(event.get("payload", Document.class))
				.containsEntry("changedPropertyIds", List.of(ROLLUP_PROPERTY_ID))
				.containsEntry("sourcePropertyVersions", new Document(ROLLUP_PROPERTY_ID, 1L));
	}

	@Test
	void rejectsRollupDefinitionsWithMissingRelationOrTargetReferences() throws Exception {
		var relationConfig = new Document("targetCategoryId", TARGET_CATEGORY_ID)
				.append("inversePropertyId", null).append("cardinality", "multiple")
				.append("deletePolicy", "nullify");
		var relationChange = createChange(NEW_PROPERTY_ID, "related_for_invalid_rollup", "롤업 관계", "relation",
				relationConfig);
		var relationToken = response(preview(CATEGORY_ID, relationChange).andExpect(status().isOk()).andReturn())
				.get("data").get("previewToken").asText();
		apply(CATEGORY_ID, relationChange, relationToken, "\"v7\"", "create-invalid-rollup-relation")
				.andExpect(status().isOk());
		var beforeCategory = storedCategory();
		for (var config : List.of(
				new Document("relationPropertyId", ACTIVE_PROPERTY_ID)
						.append("targetPropertyId", TARGET_VALUE_PROPERTY_ID).append("aggregation", "sum"),
				new Document("relationPropertyId", NEW_PROPERTY_ID)
						.append("targetPropertyId", UUID.randomUUID().toString()).append("aggregation", "sum"))) {
			preview(CATEGORY_ID, createChange(ROLLUP_PROPERTY_ID, "invalid_rollup", "잘못된 롤업", "rollup", config))
					.andExpect(status().isBadRequest());
		}
		assertThat(storedCategory()).isEqualTo(beforeCategory);
	}

	@Test
	void previewsAndAtomicallyAppendsTheCompleteDefinitionToBothCanonicalRepresentations() throws Exception {
		var change = createChange(NEW_PROPERTY_ID, "achievement", "성과", "text", new Document());
		var previewToken = preview(CATEGORY_ID, change)
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.data.categoryVersion").value(7))
				.andExpect(jsonPath("$.data.impact.affectedRecordCount").value(0))
				.andReturn();
		var token = response(previewToken).get("data").get("previewToken").asText();
		var beforeRecord = storedRecord();

		var applied = apply(CATEGORY_ID, change, token, "\"v7\"", "create-property-1")
				.andExpect(status().isOk())
				.andExpect(header().string(HttpHeaders.ETAG, "\"v8\""))
				.andExpect(jsonPath("$.data.id").value(CATEGORY_ID))
				.andExpect(jsonPath("$.data.key").value("custom"))
				.andExpect(jsonPath("$.data.name").value("사용자 카테고리"))
				.andExpect(jsonPath("$.data.icon").value("folder"))
				.andExpect(jsonPath("$.data.defaultView").value("table"))
				.andExpect(jsonPath("$.data.isSystem").value(false))
				.andExpect(jsonPath("$.data.propertySchema.role.id").value(ACTIVE_PROPERTY_ID))
				.andExpect(jsonPath("$.data.propertySchemaV2[0].type").value("title"))
				.andExpect(jsonPath("$.data.propertySchemaV2[3].id").value(NEW_PROPERTY_ID))
				.andExpect(jsonPath("$.data.propertySchemaV2[3].name").value("성과"))
				.andExpect(jsonPath("$.data.schemaVersion").value(5))
				.andExpect(jsonPath("$.data.sortOrder").value(2))
				.andExpect(jsonPath("$.data.recordCount").value(0))
				.andExpect(jsonPath("$.data.version").value(8))
				.andReturn();

		assertThat(response(applied).get("data").propertyNames()).containsExactlyInAnyOrder(
				"id", "key", "name", "icon", "defaultView", "isSystem", "propertySchema",
				"propertySchemaV2", "schemaVersion", "sortOrder", "recordCount", "version");
		var stored = storedCategory();
		assertThat(stored.get("version", Number.class).longValue()).isEqualTo(8);
		assertThat(stored.get("schemaVersion", Number.class).longValue()).isEqualTo(5);
		assertThat(stored.get("propertySchema", Document.class)).isEqualTo(customCategory(CATEGORY_ID, USER_ID, false)
				.get("propertySchema", Document.class));
		var canonical = stored.getList("propertyDefinitions", Document.class);
		var v2 = stored.getList("propertySchemaV2", Document.class);
		assertThat(canonical).extracting(document -> document.getString("id"))
				.containsExactly(ACTIVE_PROPERTY_ID, DELETED_PROPERTY_ID, NEW_PROPERTY_ID);
		assertThat(v2).extracting(document -> document.getString("id"))
				.containsExactly(TITLE_PROPERTY_ID, ACTIVE_PROPERTY_ID, DELETED_PROPERTY_ID, NEW_PROPERTY_ID);
		assertThat(canonical.get(2)).containsEntry("key", "achievement").containsEntry("name", "성과")
				.containsEntry("type", "text").containsEntry("required", false).containsEntry("system", false);
		assertThat(v2.get(3)).containsEntry("id", NEW_PROPERTY_ID).containsEntry("key", "achievement")
				.containsEntry("name", "성과");
		assertThat(storedRecord()).isEqualTo(beforeRecord);
	}

	@Test
	void previewsAndRenamesOnlyTheMatchingDefinitionWithoutChangingRecords() throws Exception {
		var change = new Document("kind", "rename")
				.append("propertyId", ACTIVE_PROPERTY_ID)
				.append("name", "담당 역할");
		var beforeCategory = storedCategory();
		var beforeRecord = storedRecord();
		var token = response(preview(CATEGORY_ID, change)
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.data.categoryVersion").value(7))
				.andExpect(jsonPath("$.data.change.kind").value("rename"))
				.andExpect(jsonPath("$.data.change.propertyId").value(ACTIVE_PROPERTY_ID))
				.andExpect(jsonPath("$.data.change.name").value("담당 역할"))
				.andExpect(jsonPath("$.data.impact.affectedRecordCount").value(1))
				.andReturn()).get("data").get("previewToken").asText();

		var first = apply(CATEGORY_ID, change, token, "\"v7\"", "rename-property-1")
				.andExpect(status().isOk())
				.andExpect(header().string(HttpHeaders.ETAG, "\"v8\""))
				.andExpect(jsonPath("$.data.propertySchema.role.label").value("역할"))
				.andExpect(jsonPath("$.data.propertySchemaV2[0].type").value("title"))
				.andExpect(jsonPath("$.data.propertySchemaV2[1].id").value(ACTIVE_PROPERTY_ID))
				.andExpect(jsonPath("$.data.propertySchemaV2[1].name").value("담당 역할"))
				.andExpect(jsonPath("$.data.propertySchemaV2[1].version").value(3))
				.andExpect(jsonPath("$.data.schemaVersion").value(5))
				.andExpect(jsonPath("$.data.version").value(8))
				.andReturn();
		var replay = apply(CATEGORY_ID, change, token, "\"v7\"", "rename-property-1")
				.andExpect(status().isOk())
				.andExpect(header().string(HttpHeaders.ETAG, "\"v8\""))
				.andReturn();
		assertThat(response(replay)).isEqualTo(response(first));
		apply(CATEGORY_ID, new Document("kind", "rename")
				.append("propertyId", ACTIVE_PROPERTY_ID).append("name", "다른 이름"),
				token, "\"v7\"", "rename-property-1")
				.andExpect(status().isConflict());

		var stored = storedCategory();
		assertThat(stored.get("propertySchema", Document.class))
				.isEqualTo(beforeCategory.get("propertySchema", Document.class));
		assertThat(stored.getList("propertySchemaV2", Document.class).getFirst())
				.containsEntry("id", TITLE_PROPERTY_ID)
				.containsEntry("key", "title")
				.containsEntry("name", "제목")
				.containsEntry("type", "title")
				.containsEntry("required", false)
				.containsEntry("system", true)
				.containsEntry("config", new Document())
				.containsEntry("order", 0)
				.containsEntry("version", 1L)
				.containsEntry("deletedAt", null);
		assertThat(stored.getList("propertyDefinitions", Document.class).getFirst())
				.containsEntry("id", ACTIVE_PROPERTY_ID)
				.containsEntry("name", "담당 역할")
				.containsEntry("key", "role")
				.containsEntry("type", "text")
				.containsEntry("required", false)
				.containsEntry("system", false)
				.containsEntry("config", new Document())
				.containsEntry("order", 1)
				.containsEntry("version", 3L);
		assertThat(stored.getDate("updatedAt").toInstant()).isEqualTo(TEST_NOW);
		assertThat(storedRecord()).isEqualTo(beforeRecord);
	}

	@Test
	void previewsAndReordersOnlyTheMatchingDefinitionWithoutChangingRecordsOrArrayPositions() throws Exception {
		var change = new Document("kind", "reorder")
				.append("propertyId", ACTIVE_PROPERTY_ID)
				.append("order", 9);
		var beforeCategory = storedCategory();
		var beforeRecord = storedRecord();
		var token = response(preview(CATEGORY_ID, change)
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.data.categoryVersion").value(7))
				.andExpect(jsonPath("$.data.change.kind").value("reorder"))
				.andExpect(jsonPath("$.data.change.propertyId").value(ACTIVE_PROPERTY_ID))
				.andExpect(jsonPath("$.data.change.order").value(9))
				.andExpect(jsonPath("$.data.impact.affectedRecordCount").value(1))
				.andReturn()).get("data").get("previewToken").asText();

		apply(CATEGORY_ID, change, token, "\"v7\"", "reorder-property-1")
				.andExpect(status().isOk())
				.andExpect(header().string(HttpHeaders.ETAG, "\"v8\""))
				.andExpect(jsonPath("$.data.propertySchema.role.label").value("역할"))
				.andExpect(jsonPath("$.data.propertySchemaV2[0].type").value("title"))
				.andExpect(jsonPath("$.data.propertySchemaV2[1].id").value(ACTIVE_PROPERTY_ID))
				.andExpect(jsonPath("$.data.propertySchemaV2[1].order").value(9))
				.andExpect(jsonPath("$.data.propertySchemaV2[1].version").value(3))
				.andExpect(jsonPath("$.data.schemaVersion").value(5))
				.andExpect(jsonPath("$.data.version").value(8));

		var stored = storedCategory();
		assertThat(stored.get("propertySchema", Document.class))
				.isEqualTo(beforeCategory.get("propertySchema", Document.class));
		assertThat(stored.getList("propertyDefinitions", Document.class))
				.extracting(document -> document.getString("id"))
				.containsExactly(ACTIVE_PROPERTY_ID, DELETED_PROPERTY_ID);
		assertThat(stored.getList("propertySchemaV2", Document.class))
				.extracting(document -> document.getString("id"))
				.containsExactly(TITLE_PROPERTY_ID, ACTIVE_PROPERTY_ID, DELETED_PROPERTY_ID);
		assertThat(stored.getList("propertyDefinitions", Document.class).getFirst())
				.containsEntry("id", ACTIVE_PROPERTY_ID)
				.containsEntry("name", "역할")
				.containsEntry("key", "role")
				.containsEntry("type", "text")
				.containsEntry("required", false)
				.containsEntry("system", false)
				.containsEntry("config", new Document())
				.containsEntry("order", 9)
				.containsEntry("version", 3L);
		assertThat(stored.getDate("updatedAt").toInstant()).isEqualTo(TEST_NOW);
		assertThat(storedRecord()).isEqualTo(beforeRecord);
	}

	@Test
	void rejectsRenameForAMissingDefinition() throws Exception {
		var beforeCategory = storedCategory();
		var beforeRecord = storedRecord();
		preview(CATEGORY_ID, new Document("kind", "rename")
				.append("propertyId", NEW_PROPERTY_ID).append("name", "없는 속성"))
				.andExpect(status().isNotFound());
		assertThat(storedCategory()).isEqualTo(beforeCategory);
		assertThat(storedRecord()).isEqualTo(beforeRecord);
	}

	@Test
	void generatesAnIdAndReplaysTheFirstResultWithoutAppendingOrVersioningAgain() throws Exception {
		var change = createChange(null, "generated", "서버 생성", "text", new Document());
		var token = response(preview(CATEGORY_ID, change).andExpect(status().isOk()).andReturn())
				.get("data").get("previewToken").asText();
		preview(CATEGORY_ID, change)
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.data.change.property.id").doesNotExist())
				.andExpect(jsonPath("$.data.change.property.order").doesNotExist());
		var first = apply(CATEGORY_ID, change, token, "\"v7\"", "replay-key-property")
				.andExpect(status().isOk()).andReturn();
		var firstBody = response(first);
		var generatedId = firstBody.get("data").get("propertySchemaV2").get(3).get("id").asText();
		assertThatCode(() -> UUID.fromString(generatedId)).doesNotThrowAnyException();

		var replay = apply(CATEGORY_ID, change, token, "\"v7\"", "replay-key-property")
				.andExpect(status().isOk())
				.andExpect(header().string(HttpHeaders.ETAG, "\"v8\""))
				.andReturn();
		assertThat(response(replay)).isEqualTo(firstBody);
		assertThat(storedCategory().get("version", Number.class).longValue()).isEqualTo(8);
		assertThat(storedCategory().getList("propertyDefinitions", Document.class))
				.filteredOn(document -> generatedId.equals(document.getString("id"))).hasSize(1);

		var conflictingChange = createChange(null, "different", "다른 요청", "text", new Document());
		apply(CATEGORY_ID, conflictingChange, token, "\"v7\"", "replay-key-property")
				.andExpect(status().isConflict());
		assertThat(storedCategory().get("version", Number.class).longValue()).isEqualTo(8);
	}

	@Test
	void rejectsDuplicateActiveOrDeletedIdentityAndLeavesCategoryAndRecordsUntouched() throws Exception {
		for (var conflictingChange : List.of(
				createChange(NEW_PROPERTY_ID, "role", "중복 key", "text", new Document()),
				createChange(ACTIVE_PROPERTY_ID, "another", "중복 active id", "text", new Document()),
				createChange(DELETED_PROPERTY_ID, "deleted_again", "중복 deleted id", "text", new Document()))) {
			var beforeCategory = storedCategory();
			var beforeRecord = storedRecord();
			var token = response(preview(CATEGORY_ID, conflictingChange).andExpect(status().isOk()).andReturn())
					.get("data").get("previewToken").asText();

			apply(CATEGORY_ID, conflictingChange, token, "\"v7\"", UUID.randomUUID().toString())
					.andExpect(status().isConflict());

			assertThat(storedCategory()).isEqualTo(beforeCategory);
			assertThat(storedRecord()).isEqualTo(beforeRecord);
		}
	}

	@Test
	void supportsOnlyCompleteRequiredFalseWritableDefinitionsForOwnedCustomCategories() throws Exception {
		for (var type : List.of("text", "number", "checkbox", "date", "url", "email", "phone", "file", "media")) {
			preview(CATEGORY_ID, createChange(NEW_PROPERTY_ID, "new_" + type, type, type, new Document()))
					.andExpect(status().isOk());
		}
		for (var type : List.of("select", "multi_select")) {
			preview(CATEGORY_ID, createChange(NEW_PROPERTY_ID, "new_" + type, type, type,
					new Document("options", List.of()))).andExpect(status().isOk());
		}
		for (var type : List.of("relation", "formula", "rollup", "created_time", "updated_time")) {
			preview(CATEGORY_ID, createChange(NEW_PROPERTY_ID, "new_" + type, type, type, new Document()))
					.andExpect(status().isBadRequest());
		}
		preview(CATEGORY_ID, createChange(NEW_PROPERTY_ID, "required", "필수", "text", new Document(), true))
				.andExpect(status().isBadRequest());
		preview(CATEGORY_ID, createChange(NEW_PROPERTY_ID, "defaulted", "기본값", "text",
				new Document("defaultValue", "x"))).andExpect(status().isBadRequest());
		preview(SYSTEM_CATEGORY_ID, createChange(NEW_PROPERTY_ID, "system", "시스템", "text", new Document()))
				.andExpect(status().isNotFound());

		mongoTemplate.getCollection("career_categories").updateOne(new Document("_id", CATEGORY_ID),
				new Document("$set", new Document("userId", OTHER_USER_ID)));
		preview(CATEGORY_ID, createChange(NEW_PROPERTY_ID, "foreign", "타인", "text", new Document()))
				.andExpect(status().isNotFound());
	}

	@Test
	void persistsEveryWritableTypeWithItsValidatedConfiguration() throws Exception {
		var types = List.of(
				Map.entry("text", new Document()),
				Map.entry("number", new Document()),
				Map.entry("checkbox", new Document()),
				Map.entry("select", new Document("options", List.of(
						new Document("id", "20000000-0000-4000-8000-000000000001").append("name", "선택지")))),
				Map.entry("multi_select", new Document("options", List.of(
						new Document("id", "20000000-0000-4000-8000-000000000002").append("name", "복수 선택지")))),
				Map.entry("date", new Document()),
				Map.entry("url", new Document()),
				Map.entry("email", new Document()),
				Map.entry("phone", new Document()),
				Map.entry("file", new Document()),
				Map.entry("media", new Document()));
		var expectedVersion = 7;
		for (var entry : types) {
			var id = UUID.randomUUID().toString();
			var change = createChange(id, "created_" + entry.getKey(), entry.getKey(), entry.getKey(), entry.getValue());
			var token = response(preview(CATEGORY_ID, change).andExpect(status().isOk()).andReturn())
					.get("data").get("previewToken").asText();
			apply(CATEGORY_ID, change, token, "\"v" + expectedVersion + "\"",
					"create-type-" + entry.getKey() + "-property")
					.andExpect(status().isOk());
			expectedVersion++;
			var stored = storedCategory().getList("propertyDefinitions", Document.class).stream()
					.filter(definition -> id.equals(definition.getString("id")))
					.findFirst().orElseThrow();
			assertThat(stored.getString("type")).isEqualTo(entry.getKey());
			assertThat(stored.get("config", Document.class)).isEqualTo(entry.getValue());
		}
	}

	@Test
	void rejectsStaleVersionWithoutChangingCategoryOrRecords() throws Exception {
		var change = createChange(NEW_PROPERTY_ID, "stale", "오래된 요청", "text", new Document());
		var token = response(preview(CATEGORY_ID, change).andExpect(status().isOk()).andReturn())
				.get("data").get("previewToken").asText();
		var beforeCategory = storedCategory();
		var beforeRecord = storedRecord();

		apply(CATEGORY_ID, change, token, "\"v6\"", "stale-key-property").andExpect(status().isConflict());

		assertThat(storedCategory()).isEqualTo(beforeCategory);
		assertThat(storedRecord()).isEqualTo(beforeRecord);
	}

	@Test
	void rejectsATamperedPreviewTokenWithoutChangingCategoryOrRecords() throws Exception {
		var change = createChange(NEW_PROPERTY_ID, "tampered", "변조 토큰", "text", new Document());
		var token = response(preview(CATEGORY_ID, change).andExpect(status().isOk()).andReturn())
				.get("data").get("previewToken").asText();
		var signatureStart = token.indexOf('.') + 1;
		var firstSignatureCharacter = token.charAt(signatureStart);
		var tampered = token.substring(0, signatureStart)
				+ (firstSignatureCharacter == 'A' ? 'B' : 'A')
				+ token.substring(signatureStart + 1);
		var beforeCategory = storedCategory();
		var beforeRecord = storedRecord();

		apply(CATEGORY_ID, change, tampered, "\"v7\"", "tampered-preview-key")
				.andExpect(status().isConflict());

		assertThat(storedCategory()).isEqualTo(beforeCategory);
		assertThat(storedRecord()).isEqualTo(beforeRecord);
	}

	@Test
	void rejectsAnExpiredPreviewTokenWithoutChangingCategoryOrRecords() throws Exception {
		var change = createChange(NEW_PROPERTY_ID, "expired", "만료 토큰", "text", new Document());
		var token = response(preview(CATEGORY_ID, change).andExpect(status().isOk()).andReturn())
				.get("data").get("previewToken").asText();
		var beforeCategory = storedCategory();
		var beforeRecord = storedRecord();
		testClock.advance(Duration.ofMinutes(16));

		apply(CATEGORY_ID, change, token, "\"v7\"", "expired-preview-key")
				.andExpect(status().isConflict());

		assertThat(storedCategory()).isEqualTo(beforeCategory);
		assertThat(storedRecord()).isEqualTo(beforeRecord);
	}

	private org.springframework.test.web.servlet.ResultActions preview(String categoryId, Document change) throws Exception {
		return mockMvc.perform(post("/v1/career/categories/{categoryId}/property-schema/preview", categoryId)
				.header(HttpHeaders.AUTHORIZATION, "Bearer " + TOKEN)
				.contentType(MediaType.APPLICATION_JSON)
				.content(objectMapper.writeValueAsString(change)));
	}

	private org.springframework.test.web.servlet.ResultActions apply(
			String categoryId,
			Document change,
			String previewToken,
			String ifMatch,
			String idempotencyKey) throws Exception {
		return mockMvc.perform(post("/v1/career/categories/{categoryId}/property-schema/apply", categoryId)
				.header(HttpHeaders.AUTHORIZATION, "Bearer " + TOKEN)
				.header(HttpHeaders.IF_MATCH, ifMatch)
				.header("Idempotency-Key", idempotencyKey)
				.contentType(MediaType.APPLICATION_JSON)
				.content(objectMapper.writeValueAsString(Map.of(
						"change", change,
						"previewToken", previewToken,
						"confirmLossy", false))));
	}

	private JsonNode response(MvcResult result) throws Exception {
		return objectMapper.readTree(result.getResponse().getContentAsString());
	}

	private static Document createChange(
			String id,
			String key,
			String name,
			String type,
			Document config) {
		return createChange(id, key, name, type, config, false);
	}

	private static Document createChange(
			String id,
			String key,
			String name,
			String type,
			Document config,
			boolean required) {
		var property = new Document("key", key).append("name", name).append("type", type)
				.append("required", required).append("system", false).append("config", config);
		if (id != null) {
			property.append("id", id);
		}
		return new Document("kind", "create").append("property", property);
	}

	private static Document customCategory(String id, String userId, boolean isSystem) {
		var title = definition(TITLE_PROPERTY_ID, "title", "제목", "title", false, true, new Document(), 0, 1, null);
		var active = definition(ACTIVE_PROPERTY_ID, "role", "역할", "text", false, false, new Document(), 1, 2, null);
		var deleted = definition(DELETED_PROPERTY_ID, "old", "삭제된 속성", "text", false, false, new Document(), 2, 3,
				"2026-09-20T00:00:00Z");
		return new Document("_id", id).append("userId", userId).append("key", "custom")
				.append("name", "사용자 카테고리").append("icon", "folder").append("defaultView", "table")
				.append("isSystem", isSystem).append("sortOrder", 2).append("version", 7).append("schemaVersion", 4)
				.append("propertySchema", new Document("role",
						new Document("id", ACTIVE_PROPERTY_ID).append("label", "역할").append("type", "text")
								.append("required", false).append("system", false)))
				.append("propertySchemaV2", List.of(title, active, deleted))
				.append("propertyDefinitions", List.of(active, deleted))
				.append("createdAt", new Date()).append("updatedAt", new Date());
	}

	private static Document targetCategory() {
		var inverse = definition(INVERSE_PROPERTY_ID, "back", "원본 기록", "relation", false, false,
				new Document("targetCategoryId", CATEGORY_ID).append("inversePropertyId", NEW_PROPERTY_ID)
						.append("cardinality", "multiple").append("deletePolicy", "nullify"),
				1, 1, null);
		var value = definition(TARGET_VALUE_PROPERTY_ID, "amount", "금액", "number", false, false,
				new Document(), 2, 1, null);
		return new Document("_id", TARGET_CATEGORY_ID).append("userId", USER_ID).append("key", "target")
				.append("name", "대상 카테고리").append("icon", "folder").append("defaultView", "table")
				.append("isSystem", false).append("sortOrder", 3).append("version", 1).append("schemaVersion", 1)
				.append("propertySchema", new Document()).append("propertySchemaV2", List.of(inverse, value))
				.append("propertyDefinitions", List.of(inverse, value))
				.append("createdAt", new Date()).append("updatedAt", new Date());
	}

	private static Document definition(
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
		return new Document("id", id).append("key", key).append("name", name).append("type", type)
				.append("required", required).append("system", system).append("config", config)
				.append("order", order).append("version", version).append("deletedAt", deletedAt);
	}

	private static Document record() {
		return record(RECORD_ID, CATEGORY_ID)
				.append("title", "기존 기록")
				.append("propertyValues", List.of(new Document("propertyDefinitionId", ACTIVE_PROPERTY_ID)
						.append("type", "text").append("value", "기존 값")))
				.append("blockBody", new Document("schemaVersion", 1).append("type", "doc").append("content", List.of()))
				.append("properties", new Document("role", "기존 값")).append("bodyMd", "")
				.append("status", "draft").append("origin", "manual").append("version", 1)
				.append("referenceVersion", 1)
				.append("updatedAt", new Date()).append("deletedAt", null);
	}

	private static Document record(String recordId, String categoryId) {
		return new Document("_id", recordId).append("userId", USER_ID).append("categoryId", categoryId)
				.append("title", "대상 기록").append("propertyValues", List.of())
				.append("blockBody", new Document("schemaVersion", 1).append("type", "doc").append("content", List.of()))
				.append("properties", new Document()).append("bodyMd", "")
				.append("status", "draft").append("origin", "manual").append("version", 1)
				.append("referenceVersion", 1).append("updatedAt", new Date()).append("deletedAt", null);
	}

	private Document storedCategory() {
		return mongoTemplate.getCollection("career_categories").find(new Document("_id", CATEGORY_ID)).first();
	}

	private Document storedRecord() {
		return mongoTemplate.getCollection("career_records").find(new Document("_id", RECORD_ID)).first();
	}

	private void insertIdentity() {
		mongoTemplate.getCollection("users").insertOne(new Document("_id", USER_ID).append("email", "property@example.com")
				.append("displayName", "속성 사용자").append("planId", "ea9b17b9-0a6a-42c3-8f0c-86801bc9e313")
				.append("passwordHash", null).append("deletionRequestedAt", null).append("createdAt", new Date())
				.append("lifecycleVersion", 0));
		mongoTemplate.getCollection("identity_sessions").insertOne(new Document("_id", UUID.randomUUID().toString())
				.append("userId", USER_ID).append("tokenHash", TOKEN_HASH)
				.append("expiresAt", Date.from(testClock.instant().plusSeconds(3600))).append("revokedAt", null)
				.append("lastSeenAt", null).append("createdAt", new Date()));
	}

	@TestConfiguration(proxyBeanMethods = false)
	static class TestClockConfiguration {

		@Bean
		@Primary
		MutableTestClock propertyCreateTestClock() {
			return new MutableTestClock(TEST_NOW);
		}
	}

	static final class MutableTestClock extends Clock {

		private Instant current;

		MutableTestClock(Instant current) {
			this.current = current;
		}

		void set(Instant current) {
			this.current = current;
		}

		void advance(Duration duration) {
			current = current.plus(duration);
		}

		@Override
		public ZoneId getZone() {
			return ZoneOffset.UTC;
		}

		@Override
		public Clock withZone(ZoneId zone) {
			if (!ZoneOffset.UTC.equals(zone)) {
				throw new IllegalArgumentException("테스트 Clock은 UTC만 지원합니다");
			}
			return this;
		}

		@Override
		public Instant instant() {
			return current;
		}
	}
}
