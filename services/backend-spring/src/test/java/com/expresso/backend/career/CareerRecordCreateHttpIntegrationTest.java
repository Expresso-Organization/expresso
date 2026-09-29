package com.expresso.backend.career;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.Date;
import java.util.List;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ExecutionException;

import org.bson.BsonType;
import org.bson.Document;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.data.mongodb.core.MongoTemplate;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;

import com.expresso.backend.TestcontainersConfiguration;
import com.mongodb.client.model.Filters;
import com.mongodb.client.model.IndexOptions;
import com.mongodb.client.model.Indexes;

@Import(TestcontainersConfiguration.class)
@AutoConfigureMockMvc
@SpringBootTest
class CareerRecordCreateHttpIntegrationTest {

	private static final String RECORDS = "career_records";
	private static final String CATEGORIES = "career_categories";
	private static final String SESSIONS = "identity_sessions";
	private static final String USERS = "users";
	private static final String USER_A = "bc2f9791-0bb1-4a31-a23d-ea720f31284d";
	private static final String USER_B = "945969f8-c8e5-469b-8119-bab71fa5aa60";
	private static final String TOKEN_A = "exps_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
	private static final String TOKEN_B = "exps_BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB";
	private static final String TOKEN_HASH_A = "74b2c367c4d415397a6bc46772e8af855235d2c0866bc7dbefdbc2105fde56fc";
	private static final String TOKEN_HASH_B = "4cecfa26ce4ad4dc26e6749811123eeddcc7ea316db694261c34c523c8b78641";
	private static final String CATEGORY_A = "475106fc-bf88-4a73-9c27-66c648733936";
	private static final String CATEGORY_B = "af5510dc-9717-4f1e-b0f9-4afd79aafe0f";
	private static final String CUSTOM_CATEGORY = "63cff240-cb45-463e-b82f-ab14163bd2a9";
	private static final String SELECT_DEFINITION = "6e968418-a0ed-48db-9e29-4abf4d53da13";
	private static final String MULTI_SELECT_DEFINITION = "bc3aac56-ebc5-443e-82d7-8e1e5064d2e7";
	private static final String NUMBER_DEFINITION = "a17003fd-31af-4a3e-93f5-c972b4df0d49";
	private static final String FORMULA_DEFINITION = "280d62de-bdfd-4d19-94db-f31faeef831a";
	private static final String OPTION_A = "f356df61-6677-466f-8d61-5aefbb3ac1d8";
	private static final String OPTION_B = "80ce7650-289f-465d-9b07-a845f36bc162";
	private static final String IDEMPOTENCY_KEY = "career-create-test-key-0001";
	private static final String DUPLICATE_IDEMPOTENCY_KEY = "career-duplicate-test-key-0001";

	@Autowired
	private MockMvc mockMvc;

	@Autowired
	private MongoTemplate mongoTemplate;

	@BeforeEach
	void prepareDatabase() {
		for (var collection : List.of(RECORDS, CATEGORIES, SESSIONS, USERS, "outbox_events")) {
			mongoTemplate.getCollection(collection).deleteMany(new Document());
		}
		mongoTemplate.getCollection(RECORDS).createIndex(
				Indexes.ascending("userId", "createIdempotencyKey"),
				new IndexOptions()
						.name("record_create_idempotency_unique")
						.unique(true)
						.partialFilterExpression(Filters.type("createIdempotencyKey", BsonType.STRING)));
		insertIdentity(USER_A, TOKEN_HASH_A);
		insertIdentity(USER_B, TOKEN_HASH_B);
		insertCategory(CATEGORY_A, true);
		insertCategory(CATEGORY_B, true);
	}

	@Test
	void createsGroupedRecordInOwnedCustomCategoryWithCanonicalAndLegacySnapshots() throws Exception {
		insertCustomCategory(USER_A);
		var body = "{\"categoryId\":\"" + CUSTOM_CATEGORY + "\",\"propertyValues\":[{"
				+ "\"propertyDefinitionId\":\"" + SELECT_DEFINITION + "\","
				+ "\"type\":\"select\",\"value\":\"" + OPTION_A + "\"}]}";

		var result = createRaw(TOKEN_A, IDEMPOTENCY_KEY, body)
				.andExpect(status().isCreated())
				.andExpect(header().string(HttpHeaders.ETAG, "\"v1\""))
				.andExpect(jsonPath("$.data.categoryId").value(CUSTOM_CATEGORY))
				.andExpect(jsonPath("$.data.propertyValues[0].propertyDefinitionId").value(SELECT_DEFINITION))
				.andExpect(jsonPath("$.data.propertyValues[0].type").value("select"))
				.andExpect(jsonPath("$.data.propertyValues[0].value").value(OPTION_A))
				.andReturn();

		var recordId = responseData(result).getString("id");
		var stored = mongoTemplate.getCollection(RECORDS).find(new Document("_id", recordId)).first();
		assertThat(stored).isNotNull();
		assertThat(stored.getList("propertyValues", Document.class)).containsExactly(
				new Document("propertyDefinitionId", SELECT_DEFINITION)
						.append("type", "select").append("value", OPTION_A));
		assertThat(stored.get("properties", Document.class)).isEqualTo(
				new Document("stage", new Document("type", "select").append("value", OPTION_A)));
		assertThat(stored.getString("bodyMd")).isEmpty();

		var event = mongoTemplate.getCollection("outbox_events")
				.find(new Document("idempotencyKey", "career-record-create:" + recordId + ":v1")).first();
		assertThat(event).isNotNull();
		var payload = event.get("payload", Document.class);
		assertThat(payload.getList("changedPropertyIds", String.class))
				.containsExactlyInAnyOrder(SELECT_DEFINITION, FORMULA_DEFINITION);
		assertThat(payload.get("sourcePropertyVersions", Document.class))
				.isEqualTo(new Document(SELECT_DEFINITION, 3L).append(FORMULA_DEFINITION, 5L));
	}

	@Test
	void createsGroupedRecordWithExistingMultiSelectOption() throws Exception {
		insertCustomCategory(USER_A);
		var body = "{\"categoryId\":\"" + CUSTOM_CATEGORY + "\",\"propertyValues\":[{"
				+ "\"propertyDefinitionId\":\"" + MULTI_SELECT_DEFINITION + "\","
				+ "\"type\":\"multi_select\",\"value\":[\"" + OPTION_B + "\"]}]}";

		var result = createRaw(TOKEN_A, IDEMPOTENCY_KEY, body)
				.andExpect(status().isCreated())
				.andExpect(jsonPath("$.data.propertyValues[0].value[0]").value(OPTION_B))
				.andReturn();
		var stored = mongoTemplate.getCollection(RECORDS)
				.find(new Document("_id", responseData(result).getString("id"))).first();
		assertThat(stored.get("properties", Document.class)).isEqualTo(
				new Document("skills", new Document("type", "multi_select").append("value", List.of(OPTION_B))));
	}

	@Test
	void rejectsInaccessibleOrInvalidGroupedInitialPropertyWithoutWritingAnything() throws Exception {
		insertCustomCategory(USER_B);
		var validValue = "[{\"propertyDefinitionId\":\"" + SELECT_DEFINITION
				+ "\",\"type\":\"select\",\"value\":\"" + OPTION_A + "\"}]";
		createRaw(TOKEN_A, IDEMPOTENCY_KEY,
				"{\"categoryId\":\"" + CUSTOM_CATEGORY + "\",\"propertyValues\":" + validValue + "}")
				.andExpect(status().isNotFound());

		mongoTemplate.getCollection(CATEGORIES).deleteMany(new Document());
		insertCustomCategory(USER_A);
		for (var invalidValues : List.of(
				"[{\"propertyDefinitionId\":\"" + SELECT_DEFINITION
						+ "\",\"type\":\"select\",\"value\":\"00000000-0000-4000-8000-000000000001\"}]",
				"[{\"propertyDefinitionId\":\"" + SELECT_DEFINITION
						+ "\",\"type\":\"multi_select\",\"value\":[\"" + OPTION_A + "\"]}]",
				"[{\"propertyDefinitionId\":\"" + FORMULA_DEFINITION
						+ "\",\"type\":\"select\",\"value\":\"" + OPTION_A + "\"}]")) {
			createRaw(TOKEN_A, "career-create-invalid-" + Math.abs(invalidValues.hashCode()),
					"{\"categoryId\":\"" + CUSTOM_CATEGORY + "\",\"propertyValues\":" + invalidValues + "}")
					.andExpect(status().isBadRequest());
		}
		assertThat(mongoTemplate.getCollection(RECORDS).countDocuments()).isZero();
		assertThat(mongoTemplate.getCollection("outbox_events").countDocuments()).isZero();
	}

	@Test
	void replaysSameGroupedRequestAndRejectsDifferentInitialValue() throws Exception {
		insertCustomCategory(USER_A);
		var firstBody = groupedSelectBody(OPTION_A);
		var secondBody = groupedSelectBody(OPTION_B);
		var first = responseData(createRaw(TOKEN_A, IDEMPOTENCY_KEY, firstBody)
				.andExpect(status().isCreated()).andReturn());
		var replay = responseData(createRaw(TOKEN_A, IDEMPOTENCY_KEY, firstBody)
				.andExpect(status().isOk()).andReturn());
		assertThat(replay).isEqualTo(first);

		createRaw(TOKEN_A, IDEMPOTENCY_KEY, secondBody)
				.andExpect(status().isConflict());
		assertThat(mongoTemplate.getCollection(RECORDS).countDocuments()).isEqualTo(1);
		assertThat(mongoTemplate.getCollection("outbox_events").countDocuments()).isEqualTo(1);
	}

	@Test
	void concurrentSameGroupedRequestsCreateOneRecordAndOneOutboxEvent() throws Exception {
		insertCustomCategory(USER_A);
		var body = groupedSelectBody(OPTION_A);
		var first = CompletableFuture.supplyAsync(() -> createRawWithoutCheckedException(
				TOKEN_A, IDEMPOTENCY_KEY, body));
		var second = CompletableFuture.supplyAsync(() -> createRawWithoutCheckedException(
				TOKEN_A, IDEMPOTENCY_KEY, body));

		var results = List.of(await(first), await(second));
		assertThat(results).extracting(result -> result.getResponse().getStatus())
				.containsExactlyInAnyOrder(201, 200);
		assertThat(results).extracting(result -> responseData(result).getString("id"))
				.containsOnly(responseData(results.getFirst()).getString("id"));
		assertThat(mongoTemplate.getCollection(RECORDS).countDocuments()).isEqualTo(1);
		assertThat(mongoTemplate.getCollection("outbox_events").countDocuments()).isEqualTo(1);
	}

	@Test
	void duplicatesLegacyCreatePayloadWithFastifyCompatibleCanonicalState() throws Exception {
		insertCustomCategory(USER_A);
		var body = "{\"categoryId\":\"" + CUSTOM_CATEGORY + "\","
				+ "\"title\":\"원본 기록 복제\","
				+ "\"properties\":{"
				+ "\"stage\":{\"type\":\"select\",\"value\":\"" + OPTION_A + "\"},"
				+ "\"skills\":[\"새 태그\"],"
				+ "\"budget\":123.45},"
				+ "\"bodyMd\":\"# 저장된 레거시 본문\"}";

		var first = createRaw(TOKEN_A, DUPLICATE_IDEMPOTENCY_KEY, body)
				.andExpect(status().isCreated())
				.andExpect(jsonPath("$.data.title").value("원본 기록 복제"))
				.andReturn();
		var replay = createRaw(TOKEN_A, DUPLICATE_IDEMPOTENCY_KEY, body)
				.andExpect(status().isOk()).andReturn();
		assertThat(responseData(replay)).isEqualTo(responseData(first));

		var recordId = responseData(first).getString("id");
		var stored = mongoTemplate.getCollection(RECORDS).find(new Document("_id", recordId)).first();
		assertThat(stored).isNotNull();
		assertThat(stored.getString("title")).isEqualTo("원본 기록 복제");
		assertThat(stored.getString("bodyMd")).isEqualTo("# 저장된 레거시 본문");
		assertThat(stored.get("properties", Document.class)).isEqualTo(new Document()
				.append("stage", new Document("type", "select").append("value", OPTION_A))
				.append("skills", List.of("새 태그"))
				.append("budget", 123.45));
		assertThat(stored.getList("propertyValues", Document.class)).hasSize(3);
		assertThat(stored.getList("propertyValues", Document.class)).contains(
				new Document("propertyDefinitionId", SELECT_DEFINITION)
						.append("type", "select").append("value", OPTION_A));
		var storedSkills = stored.getList("propertyValues", Document.class).stream()
				.filter(value -> MULTI_SELECT_DEFINITION.equals(value.getString("propertyDefinitionId")))
				.findFirst().orElseThrow();
		var materializedOptionId = storedSkills.getList("value", String.class).getFirst();
		java.util.UUID.fromString(materializedOptionId);
		var storedNumber = stored.getList("propertyValues", Document.class).stream()
				.filter(value -> NUMBER_DEFINITION.equals(value.getString("propertyDefinitionId")))
				.findFirst().orElseThrow();
		assertThat(storedNumber.get("value", org.bson.types.Decimal128.class).toString()).isEqualTo("123.45");
		var storedCategory = mongoTemplate.getCollection(CATEGORIES)
				.find(new Document("_id", CUSTOM_CATEGORY)).first();
		var storedMultiDefinition = storedCategory.getList("propertyDefinitions", Document.class).stream()
				.filter(definition -> MULTI_SELECT_DEFINITION.equals(definition.getString("id")))
				.findFirst().orElseThrow();
		assertThat(storedMultiDefinition.get("config", Document.class).getList("options", Document.class))
				.contains(new Document("id", materializedOptionId).append("name", "새 태그"));
		assertThat(stored.get("blockBody", Document.class).getList("content", Document.class)).hasSize(1);
		assertThat(mongoTemplate.getCollection("career_document_snapshots")
				.countDocuments(new Document("recordId", recordId))).isZero();
		var event = mongoTemplate.getCollection("outbox_events")
				.find(new Document("idempotencyKey", "career-record-create:" + recordId + ":v1")).first();
		assertThat(event).isNotNull();
		assertThat(event.get("payload", Document.class).getList("changedPropertyIds", String.class))
				.containsExactlyInAnyOrder(
						SELECT_DEFINITION, MULTI_SELECT_DEFINITION, NUMBER_DEFINITION, FORMULA_DEFINITION);

		var changedBody = body.replace("새 태그", "다른 태그");
		createRaw(TOKEN_A, DUPLICATE_IDEMPOTENCY_KEY, changedBody)
				.andExpect(status().isConflict());
		assertThat(mongoTemplate.getCollection(RECORDS).countDocuments()).isEqualTo(1);
		var categoryAfterConflict = mongoTemplate.getCollection(CATEGORIES)
				.find(new Document("_id", CUSTOM_CATEGORY)).first();
		var optionsAfterConflict = categoryAfterConflict.getList("propertyDefinitions", Document.class).stream()
				.filter(definition -> MULTI_SELECT_DEFINITION.equals(definition.getString("id")))
				.findFirst().orElseThrow().get("config", Document.class).getList("options", Document.class);
		assertThat(optionsAfterConflict).noneMatch(option -> "다른 태그".equals(option.getString("name")));
	}

	@Test
	void rejectsInvalidDuplicatePropertiesWithoutWritingRecordCategoryOrOutbox() throws Exception {
		insertCustomCategory(USER_A);
		var categoryBefore = mongoTemplate.getCollection(CATEGORIES)
				.find(new Document("_id", CUSTOM_CATEGORY)).first();
		var body = "{\"categoryId\":\"" + CUSTOM_CATEGORY + "\","
				+ "\"title\":\"복제 실패\","
				+ "\"properties\":{\"skills\":[\"추가되면 안 됨\"],\"unknown\":\"값\"},"
				+ "\"bodyMd\":\"본문\"}";

		createRaw(TOKEN_A, "duplicate-invalid-properties-key", body)
				.andExpect(status().isBadRequest());

		assertThat(mongoTemplate.getCollection(RECORDS).countDocuments()).isZero();
		assertThat(mongoTemplate.getCollection("outbox_events").countDocuments()).isZero();
		assertThat(mongoTemplate.getCollection(CATEGORIES)
				.find(new Document("_id", CUSTOM_CATEGORY)).first()).isEqualTo(categoryBefore);
	}

	@Test
	void createsCanonicalEmptyRecordAndWritesOnlyRequiredLegacyCompatibility() throws Exception {
		var result = create(TOKEN_A, IDEMPOTENCY_KEY, CATEGORY_A)
				.andExpect(status().isCreated())
				.andExpect(header().string(HttpHeaders.ETAG, "\"v1\""))
				.andExpect(jsonPath("$.data.id").isNotEmpty())
				.andExpect(jsonPath("$.data.categoryId").value(CATEGORY_A))
				.andExpect(jsonPath("$.data.title").value(""))
				.andExpect(jsonPath("$.data.propertyValues").isArray())
				.andExpect(jsonPath("$.data.propertyValues.length()").value(0))
				.andExpect(jsonPath("$.data.blockBody.schemaVersion").value(1))
				.andExpect(jsonPath("$.data.blockBody.type").value("doc"))
				.andExpect(jsonPath("$.data.blockBody.content.length()").value(1))
				.andExpect(jsonPath("$.data.blockBody.content[0].id").isNotEmpty())
				.andExpect(jsonPath("$.data.blockBody.content[0].type").value("paragraph"))
				.andExpect(jsonPath("$.data.blockBody.content[0].attrs").isMap())
				.andExpect(jsonPath("$.data.blockBody.content[0].content").isEmpty())
				.andExpect(jsonPath("$.data.blockBody.content[0].text.length()").value(0))
				.andExpect(jsonPath("$.data.version").value(1))
				.andExpect(jsonPath("$.data.updatedAt").isNotEmpty())
				.andReturn();

		var response = Document.parse(result.getResponse().getContentAsString()).get("data", Document.class);
		assertThat(response.keySet()).containsExactlyInAnyOrder(
				"id", "categoryId", "title", "propertyValues", "blockBody", "version", "updatedAt");
		java.util.UUID.fromString(response.getString("id"));
		Instant.parse(response.getString("updatedAt"));
		var responseParagraph = response.get("blockBody", Document.class)
				.getList("content", Document.class)
				.getFirst();
		java.util.UUID.fromString(responseParagraph.getString("id"));
		var stored = mongoTemplate.getCollection(RECORDS).find(new Document("_id", response.getString("id"))).first();

		assertThat(stored).isNotNull();
		assertThat(stored.getString("userId")).isEqualTo(USER_A);
		assertThat(stored.getString("title")).isEmpty();
		assertThat(stored.getList("propertyValues", Document.class)).isEmpty();
		var storedBlockBody = stored.get("blockBody", Document.class);
		assertThat(storedBlockBody.getInteger("schemaVersion")).isEqualTo(1);
		assertThat(storedBlockBody.getString("type")).isEqualTo("doc");
		assertThat(storedBlockBody.getList("content", Document.class)).hasSize(1);
		assertThat(stored.getInteger("editorSchemaVersion")).isEqualTo(1);
		assertThat(stored.getString("status")).isEqualTo("draft");
		assertThat(stored.getString("origin")).isEqualTo("manual");
		assertThat(stored.get("properties", Document.class)).isEmpty();
		assertThat(stored.getString("bodyMd")).isEmpty();
		assertThat(stored.getString("createIdempotencyKey")).isEqualTo(IDEMPOTENCY_KEY);
		assertThat(stored.getString("createRequestHash"))
				.isEqualTo("d6537a3f4d3acb10cd411a7692594b8bf98a86fa9d0984bf5b43b6b1463f38b7");
	}

	@Test
	void replaysSameUserKeyAndRequestWithoutCreatingAnotherRecord() throws Exception {
		var first = responseData(create(TOKEN_A, IDEMPOTENCY_KEY, CATEGORY_A)
				.andExpect(status().isCreated())
				.andReturn());
		var replay = responseData(create(TOKEN_A, IDEMPOTENCY_KEY, CATEGORY_A)
				.andExpect(status().isOk())
				.andExpect(header().string(HttpHeaders.ETAG, "\"v1\""))
				.andReturn());

		assertThat(replay).isEqualTo(first);
		assertThat(mongoTemplate.getCollection(RECORDS).countDocuments()).isEqualTo(1);
	}

	@Test
	void rejectsSameUserAndKeyWithDifferentCategory() throws Exception {
		create(TOKEN_A, IDEMPOTENCY_KEY, CATEGORY_A).andExpect(status().isCreated());

		create(TOKEN_A, IDEMPOTENCY_KEY, CATEGORY_B)
				.andExpect(status().isConflict())
				.andExpect(jsonPath("$.error.code").value("CONFLICT"))
				.andExpect(jsonPath("$.error.message").value("Request conflicts with current state"))
				.andExpect(jsonPath("$.error.requestId").isNotEmpty());
	}

	@Test
	void scopesTheSameKeyToTheAuthenticatedUser() throws Exception {
		var first = responseData(create(TOKEN_A, IDEMPOTENCY_KEY, CATEGORY_A)
				.andExpect(status().isCreated()).andReturn());
		var second = responseData(create(TOKEN_B, IDEMPOTENCY_KEY, CATEGORY_A)
				.andExpect(status().isCreated()).andReturn());

		assertThat(second.getString("id")).isNotEqualTo(first.getString("id"));
		assertThat(mongoTemplate.getCollection(RECORDS).countDocuments()).isEqualTo(2);
	}

	@Test
	void rejectsMissingOrNonSystemCategory() throws Exception {
		insertCategory("3f939b13-c553-4d46-90db-75390644bed5", false);

		create(TOKEN_A, IDEMPOTENCY_KEY, "97a83517-c548-428b-a483-fe5f062f758f")
				.andExpect(status().isNotFound())
				.andExpect(jsonPath("$.error.code").value("NOT_FOUND"));
		create(TOKEN_A, "career-create-test-key-0002", "3f939b13-c553-4d46-90db-75390644bed5")
				.andExpect(status().isNotFound())
				.andExpect(jsonPath("$.error.code").value("NOT_FOUND"));
	}

	@Test
	void rejectsInvalidHeaderAndBody() throws Exception {
		mockMvc.perform(post("/v1/career/records")
				.header(HttpHeaders.AUTHORIZATION, "Bearer " + TOKEN_A)
				.contentType(MediaType.APPLICATION_JSON)
				.content("{\"categoryId\":\"" + CATEGORY_A + "\"}"))
				.andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.error.code").value("VALIDATION_ERROR"));

		create(TOKEN_A, "too-short", CATEGORY_A)
				.andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.error.code").value("VALIDATION_ERROR"));

		createRaw(TOKEN_A, IDEMPOTENCY_KEY, "{\"categoryId\":\"" + CATEGORY_A + "\",\"ownerId\":\"" + USER_B + "\"}")
				.andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.error.code").value("VALIDATION_ERROR"));

		createRaw(TOKEN_A, IDEMPOTENCY_KEY, "{\"categoryId\":\"1-1-1-1-1\"}")
				.andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.error.code").value("VALIDATION_ERROR"));
	}

	@Test
	void requiresValidOpaqueAuthentication() throws Exception {
		mockMvc.perform(post("/v1/career/records")
				.header("Idempotency-Key", IDEMPOTENCY_KEY)
				.contentType(MediaType.APPLICATION_JSON)
				.content("{\"categoryId\":\"" + CATEGORY_A + "\"}"))
				.andExpect(status().isUnauthorized())
				.andExpect(jsonPath("$.error.code").value("AUTH_REQUIRED"));

		create("exps_CCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC", IDEMPOTENCY_KEY, CATEGORY_A)
				.andExpect(status().isUnauthorized())
				.andExpect(jsonPath("$.error.code").value("AUTH_REQUIRED"));
	}

	@Test
	void concurrentSameRequestsCreateOnlyOneRecord() throws Exception {
		var first = CompletableFuture.supplyAsync(() -> createWithoutCheckedException(TOKEN_A, IDEMPOTENCY_KEY, CATEGORY_A));
		var second = CompletableFuture.supplyAsync(() -> createWithoutCheckedException(TOKEN_A, IDEMPOTENCY_KEY, CATEGORY_A));

		var results = List.of(await(first), await(second));
		assertThat(results).extracting(result -> result.getResponse().getStatus())
				.containsExactlyInAnyOrder(201, 200);
		assertThat(results).extracting(result -> responseData(result).getString("id"))
				.hasSize(2)
				.containsOnly(responseData(results.getFirst()).getString("id"));
		assertThat(mongoTemplate.getCollection(RECORDS).countDocuments()).isEqualTo(1);
	}

	private org.springframework.test.web.servlet.ResultActions create(String token, String key, String categoryId)
			throws Exception {
		return createRaw(token, key, "{\"categoryId\":\"" + categoryId + "\"}");
	}

	private org.springframework.test.web.servlet.ResultActions createRaw(String token, String key, String body)
			throws Exception {
		return mockMvc.perform(post("/v1/career/records")
				.header(HttpHeaders.AUTHORIZATION, "Bearer " + token)
				.header("Idempotency-Key", key)
				.contentType(MediaType.APPLICATION_JSON)
				.content(body));
	}

	private MvcResult createWithoutCheckedException(String token, String key, String categoryId) {
		try {
			return create(token, key, categoryId).andReturn();
		}
		catch (Exception error) {
			throw new IllegalStateException("동시 생성 HTTP 요청을 실행할 수 없습니다", error);
		}
	}

	private static MvcResult await(CompletableFuture<MvcResult> future) throws Exception {
		try {
			return future.get();
		}
		catch (ExecutionException error) {
			if (error.getCause() instanceof Exception cause) {
				throw cause;
			}
			throw error;
		}
	}

	private static Document responseData(MvcResult result) {
		var responseJson = new String(result.getResponse().getContentAsByteArray(), StandardCharsets.UTF_8);
		return Document.parse(responseJson).get("data", Document.class);
	}

	private void insertIdentity(String userId, String tokenHash) {
		mongoTemplate.getCollection(USERS).insertOne(new Document("_id", userId)
				.append("email", userId + "@example.com")
				.append("displayName", "생성 테스트 사용자")
				.append("planId", "ea9b17b9-0a6a-42c3-8f0c-86801bc9e313")
				.append("passwordHash", null)
				.append("deletionRequestedAt", null)
				.append("createdAt", new Date())
				.append("lifecycleVersion", 0));
		mongoTemplate.getCollection(SESSIONS).insertOne(new Document("_id", java.util.UUID.randomUUID().toString())
				.append("userId", userId)
				.append("tokenHash", tokenHash)
				.append("expiresAt", Date.from(Instant.now().plusSeconds(600)))
				.append("revokedAt", null)
				.append("lastSeenAt", null)
				.append("createdAt", new Date()));
	}

	private void insertCategory(String categoryId, boolean system) {
		mongoTemplate.getCollection(CATEGORIES).insertOne(new Document("_id", categoryId)
				.append("key", "category-" + categoryId)
				.append("name", "생성 테스트 카테고리")
				.append("isSystem", system)
				.append("sortOrder", 0)
				.append("propertyDefinitions", List.of())
				.append("propertySchema", new Document())
				.append("icon", "briefcase")
				.append("defaultView", "table"));
	}

	private MvcResult createRawWithoutCheckedException(String token, String key, String body) {
		try {
			return createRaw(token, key, body).andReturn();
		}
		catch (Exception error) {
			throw new IllegalStateException("동시 grouped 생성 HTTP 요청을 실행할 수 없습니다", error);
		}
	}

	private void insertCustomCategory(String ownerId) {
		var definitions = List.of(
				definition(SELECT_DEFINITION, "stage", "select", 3,
						new Document("options", List.of(option(OPTION_A, "지원"), option(OPTION_B, "합격")))),
				definition(MULTI_SELECT_DEFINITION, "skills", "multi_select", 2,
						new Document("options", List.of(option(OPTION_A, "Java"), option(OPTION_B, "Spring")))),
				definition(NUMBER_DEFINITION, "budget", "number", 4, new Document()),
				definition(FORMULA_DEFINITION, "score", "formula", 5, new Document()));
		mongoTemplate.getCollection(CATEGORIES).insertOne(new Document("_id", CUSTOM_CATEGORY)
				.append("userId", ownerId)
				.append("key", "custom-grouped")
				.append("name", "그룹 생성 테스트")
				.append("isSystem", false)
				.append("sortOrder", 10)
				.append("propertyDefinitions", definitions)
				.append("propertySchemaV2", definitions)
				.append("propertySchema", new Document())
				.append("icon", "briefcase")
				.append("defaultView", "table"));
	}

	private static Document definition(String id, String key, String type, long version, Document config) {
		return new Document("id", id).append("key", key).append("name", key)
				.append("type", type).append("required", false).append("system", false)
				.append("config", config).append("order", 0).append("version", version)
				.append("deletedAt", null);
	}

	private static Document option(String id, String name) {
		return new Document("id", id).append("name", name).append("color", "gray");
	}

	private static String groupedSelectBody(String optionId) {
		return "{\"categoryId\":\"" + CUSTOM_CATEGORY + "\",\"propertyValues\":[{"
				+ "\"propertyDefinitionId\":\"" + SELECT_DEFINITION + "\","
				+ "\"type\":\"select\",\"value\":\"" + optionId + "\"}]}";
	}

}
