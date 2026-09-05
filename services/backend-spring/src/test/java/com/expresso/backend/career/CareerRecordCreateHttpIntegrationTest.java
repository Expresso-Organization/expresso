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
	private static final String IDEMPOTENCY_KEY = "career-create-test-key-0001";

	@Autowired
	private MockMvc mockMvc;

	@Autowired
	private MongoTemplate mongoTemplate;

	@BeforeEach
	void prepareDatabase() {
		for (var collection : List.of(RECORDS, CATEGORIES, SESSIONS, USERS)) {
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
				.andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.error.code").value("VALIDATION_ERROR"));
		create(TOKEN_A, "career-create-test-key-0002", "3f939b13-c553-4d46-90db-75390644bed5")
				.andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.error.code").value("VALIDATION_ERROR"));
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

}
