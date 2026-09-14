package com.expresso.backend.career;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.time.Instant;
import java.util.Date;
import java.util.List;

import org.bson.Document;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.data.mongodb.core.MongoTemplate;
import org.springframework.http.HttpHeaders;
import org.springframework.test.web.servlet.MockMvc;

import com.expresso.backend.TestcontainersConfiguration;

@Import(TestcontainersConfiguration.class)
@AutoConfigureMockMvc
@SpringBootTest
class CareerRecordListLifecycleHttpIntegrationTest {

	private static final String RECORDS = "career_records";
	private static final String SESSIONS = "identity_sessions";
	private static final String USERS = "users";
	private static final String USER_ID = "bc2f9791-0bb1-4a31-a23d-ea720f31284d";
	private static final String OTHER_USER_ID = "945969f8-c8e5-469b-8119-bab71fa5aa60";
	private static final String ACCESS_TOKEN = "exps_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
	private static final String TOKEN_HASH = "74b2c367c4d415397a6bc46772e8af855235d2c0866bc7dbefdbc2105fde56fc";
	private static final String CATEGORY_ID = "475106fc-bf88-4a73-9c27-66c648733936";
	private static final String OTHER_CATEGORY_ID = "849f2f11-d9cb-4d78-92ce-626874a575cf";
	private static final String RECORD_ID = "10000000-0000-4000-8000-000000000001";
	private static final Instant UPDATED_AT = Instant.parse("2026-09-14T04:00:00.000Z");

	@Autowired
	private MockMvc mockMvc;

	@Autowired
	private MongoTemplate mongoTemplate;

	@BeforeEach
	void prepareDatabase() {
		for (var collection : List.of(RECORDS, SESSIONS, USERS)) {
			mongoTemplate.getCollection(collection).deleteMany(new Document());
		}
		insertIdentity();
	}

	@Test
	void listsOnlyOwnedActiveCanonicalRecordsWithStableKeysetPagination() throws Exception {
		insertCanonical(recordId(1), USER_ID, CATEGORY_ID, UPDATED_AT, 1);
		insertCanonical(recordId(2), USER_ID, CATEGORY_ID, UPDATED_AT, 1);
		insertCanonical(recordId(3), USER_ID, CATEGORY_ID, UPDATED_AT, 1);
		insertCanonical(recordId(4), OTHER_USER_ID, CATEGORY_ID, UPDATED_AT.plusSeconds(10), 1);
		insertCanonical(recordId(5), USER_ID, OTHER_CATEGORY_ID, UPDATED_AT.plusSeconds(10), 1);
		insertCanonical(recordId(6), USER_ID, CATEGORY_ID, UPDATED_AT.plusSeconds(20), 1);
		mongoTemplate.getCollection(RECORDS).updateOne(
				new Document("_id", recordId(6)),
				new Document("$set", new Document("deletedAt", Date.from(UPDATED_AT.plusSeconds(30)))));

		var firstResult = list(CATEGORY_ID, "2", null)
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.data.length()").value(2))
				.andExpect(jsonPath("$.data[0].id").value(recordId(3)))
				.andExpect(jsonPath("$.data[1].id").value(recordId(2)))
				.andExpect(jsonPath("$.page.hasNextPage").value(true))
				.andExpect(jsonPath("$.page.nextCursor").isString())
				.andReturn();
		var firstPage = Document.parse(firstResult.getResponse().getContentAsString(StandardCharsets.UTF_8));
		var cursor = firstPage.get("page", Document.class).getString("nextCursor");

		list(CATEGORY_ID, "2", cursor)
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.data.length()").value(1))
				.andExpect(jsonPath("$.data[0].id").value(recordId(1)))
				.andExpect(jsonPath("$.page.hasNextPage").value(false))
				.andExpect(jsonPath("$.page.nextCursor").value(org.hamcrest.Matchers.nullValue()));
	}

	@Test
	void rejectsMissingCategoryAndCursorFromAnotherCategory() throws Exception {
		mockMvc.perform(get("/v1/career/records")
				.header(HttpHeaders.AUTHORIZATION, "Bearer " + ACCESS_TOKEN))
				.andExpect(status().isBadRequest());

		insertCanonical(RECORD_ID, USER_ID, CATEGORY_ID, UPDATED_AT, 1);
		insertCanonical(recordId(2), USER_ID, CATEGORY_ID, UPDATED_AT.minusSeconds(1), 1);
		var result = list(CATEGORY_ID, "1", null).andReturn();
		var page = Document.parse(result.getResponse().getContentAsString(StandardCharsets.UTF_8));
		var cursor = page.get("page", Document.class).getString("nextCursor");

		list(OTHER_CATEGORY_ID, "1", cursor)
				.andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.error.code").value("VALIDATION_ERROR"));
	}

	@Test
	void doesNotSilentlyOmitLegacyOnlyRecordFromCanonicalList() throws Exception {
		mongoTemplate.getCollection(RECORDS).insertOne(baseRecord(RECORD_ID, USER_ID, CATEGORY_ID, UPDATED_AT, 1));

		list(CATEGORY_ID, "50", null)
				.andExpect(status().isInternalServerError())
				.andExpect(jsonPath("$.error.code").value("INTERNAL_ERROR"));
	}

	@Test
	void trashesOnlyLifecycleFieldsWithVersionCas() throws Exception {
		insertCanonical(RECORD_ID, USER_ID, CATEGORY_ID, UPDATED_AT, 1);
		mongoTemplate.getCollection(RECORDS).updateOne(
				new Document("_id", RECORD_ID),
				new Document("$set", new Document("referenceVersion", 7)));

		var before = Instant.now();
		trash(RECORD_ID, "\"v1\"")
				.andExpect(status().isOk())
				.andExpect(header().string(HttpHeaders.ETAG, "\"v2\""))
				.andExpect(jsonPath("$.data.id").value(RECORD_ID))
				.andExpect(jsonPath("$.data.version").value(2))
				.andExpect(jsonPath("$.data.deletedAt").isString())
				.andExpect(jsonPath("$.data.purgeAfter").isString());

		var stored = storedRecord(RECORD_ID);
		var deletedAt = stored.getDate("deletedAt").toInstant();
		assertThat(deletedAt).isBetween(before.minusSeconds(1), Instant.now().plusSeconds(1));
		assertThat(stored.getDate("purgeAfter").toInstant()).isEqualTo(deletedAt.plus(Duration.ofDays(30)));
		assertThat(stored.get("version", Number.class).longValue()).isEqualTo(2);
		assertThat(stored.get("referenceVersion", Number.class).longValue()).isEqualTo(7);
		assertThat(stored.getList("propertyValues", Document.class)).hasSize(1);
		assertThat(stored.get("properties", Document.class)).isEqualTo(new Document("legacy", "keep"));

		trash(RECORD_ID, "\"v2\"").andExpect(status().isNotFound());
	}

	@Test
	void restoresEligibleRecordAndIncrementsRecordAndReferenceVersions() throws Exception {
		var deletedAt = Instant.now().minusSeconds(60);
		insertCanonical(RECORD_ID, USER_ID, CATEGORY_ID, UPDATED_AT, 6);
		var record = storedRecord(RECORD_ID);
		record.put("deletedAt", Date.from(deletedAt));
		record.put("purgeAfter", Date.from(Instant.now().plus(Duration.ofDays(29))));
		record.put("referenceVersion", 4);
		mongoTemplate.getCollection(RECORDS).replaceOne(new Document("_id", RECORD_ID), record);

		restore(RECORD_ID, "\"v6\"")
				.andExpect(status().isOk())
				.andExpect(header().string(HttpHeaders.ETAG, "\"v7\""))
				.andExpect(jsonPath("$.data.id").value(RECORD_ID))
				.andExpect(jsonPath("$.data.version").value(7));

		var restored = storedRecord(RECORD_ID);
		assertThat(restored.get("deletedAt")).isNull();
		assertThat(restored.get("purgeAfter")).isNull();
		assertThat(restored.get("version", Number.class).longValue()).isEqualTo(7);
		assertThat(restored.get("referenceVersion", Number.class).longValue()).isEqualTo(5);
		assertThat(restored.getList("propertyValues", Document.class)).hasSize(1);
	}

	@Test
	void returnsNotFoundForWrongLifecycleStateOrOwnerAndPreconditionForStaleVersion() throws Exception {
		insertCanonical(RECORD_ID, USER_ID, CATEGORY_ID, UPDATED_AT, 3);
		trash(RECORD_ID, "\"v2\"").andExpect(status().isPreconditionFailed());
		var active = storedRecord(RECORD_ID);
		assertThat(active.get("deletedAt")).isNull();
		assertThat(active.get("version", Number.class).longValue()).isEqualTo(3);

		restore(RECORD_ID, "\"v3\"").andExpect(status().isNotFound());
		mongoTemplate.getCollection(RECORDS).updateOne(
				new Document("_id", RECORD_ID),
				new Document("$set", new Document("userId", OTHER_USER_ID)));
		trash(RECORD_ID, "\"v3\"").andExpect(status().isNotFound());
	}

	@Test
	void rejectsExpiredRestoreAndVersionOverflowWithoutMutatingTheRecord() throws Exception {
		insertCanonical(RECORD_ID, USER_ID, CATEGORY_ID, UPDATED_AT, Long.MAX_VALUE);
		var record = storedRecord(RECORD_ID);
		record.put("deletedAt", Date.from(Instant.now().minus(Duration.ofDays(31))));
		record.put("purgeAfter", Date.from(Instant.now().minusSeconds(1)));
		record.put("referenceVersion", Long.MAX_VALUE);
		mongoTemplate.getCollection(RECORDS).replaceOne(new Document("_id", RECORD_ID), record);

		restore(RECORD_ID, "\"v" + Long.MAX_VALUE + "\"").andExpect(status().isNotFound());
		var expired = storedRecord(RECORD_ID);
		assertThat(expired.getDate("deletedAt")).isNotNull();
		assertThat(expired.get("version")).isEqualTo(Long.MAX_VALUE);

		mongoTemplate.getCollection(RECORDS).updateOne(
				new Document("_id", RECORD_ID),
				new Document("$set", new Document("deletedAt", null).append("purgeAfter", null)));
		trash(RECORD_ID, "\"v" + Long.MAX_VALUE + "\"")
				.andExpect(status().isInternalServerError())
				.andExpect(jsonPath("$.error.code").value("INTERNAL_ERROR"));
		assertThat(storedRecord(RECORD_ID).get("version")).isEqualTo(Long.MAX_VALUE);
	}

	@Test
	void rejectsReferenceVersionOverflowWithoutRestoringTheRecord() throws Exception {
		insertCanonical(RECORD_ID, USER_ID, CATEGORY_ID, UPDATED_AT, 8);
		var record = storedRecord(RECORD_ID);
		record.put("deletedAt", Date.from(Instant.now().minusSeconds(60)));
		record.put("purgeAfter", Date.from(Instant.now().plus(Duration.ofDays(29))));
		record.put("referenceVersion", Long.MAX_VALUE);
		mongoTemplate.getCollection(RECORDS).replaceOne(new Document("_id", RECORD_ID), record);

		restore(RECORD_ID, "\"v8\"")
				.andExpect(status().isInternalServerError())
				.andExpect(jsonPath("$.error.code").value("INTERNAL_ERROR"));

		var unchanged = storedRecord(RECORD_ID);
		assertThat(unchanged.getDate("deletedAt")).isNotNull();
		assertThat(unchanged.get("version")).isEqualTo(8L);
		assertThat(unchanged.get("referenceVersion")).isEqualTo(Long.MAX_VALUE);
	}

	private org.springframework.test.web.servlet.ResultActions list(
			String categoryId, String limit, String cursor) throws Exception {
		var request = get("/v1/career/records")
				.header(HttpHeaders.AUTHORIZATION, "Bearer " + ACCESS_TOKEN)
				.param("categoryId", categoryId)
				.param("limit", limit);
		if (cursor != null) request.param("cursor", cursor);
		return mockMvc.perform(request);
	}

	private org.springframework.test.web.servlet.ResultActions trash(String recordId, String ifMatch) throws Exception {
		return mockMvc.perform(delete("/v1/career/records/{recordId}", recordId)
				.header(HttpHeaders.AUTHORIZATION, "Bearer " + ACCESS_TOKEN)
				.header(HttpHeaders.IF_MATCH, ifMatch));
	}

	private org.springframework.test.web.servlet.ResultActions restore(String recordId, String ifMatch) throws Exception {
		return mockMvc.perform(post("/v1/career/records/{recordId}/restore", recordId)
				.header(HttpHeaders.AUTHORIZATION, "Bearer " + ACCESS_TOKEN)
				.header(HttpHeaders.IF_MATCH, ifMatch));
	}

	private Document insertCanonical(String id, String userId, String categoryId, Instant updatedAt, long version) {
		var record = baseRecord(id, userId, categoryId, updatedAt, version)
				.append("propertyValues", List.of(new Document()
						.append("propertyDefinitionId", "6c663539-48c1-5d12-939d-f100fac993c1")
						.append("type", "text")
						.append("value", "canonical")))
				.append("blockBody", new Document("schemaVersion", 1)
						.append("type", "doc")
						.append("content", List.of()))
				.append("editorSchemaVersion", 1)
				.append("properties", new Document("legacy", "keep"))
				.append("bodyMd", "legacy body");
		mongoTemplate.getCollection(RECORDS).insertOne(record);
		return record;
	}

	private static Document baseRecord(String id, String userId, String categoryId, Instant updatedAt, long version) {
		return new Document("_id", id)
				.append("userId", userId)
				.append("categoryId", categoryId)
				.append("title", "Record " + id)
				.append("status", "draft")
				.append("origin", "manual")
				.append("version", version)
				.append("updatedAt", Date.from(updatedAt))
				.append("deletedAt", null)
				.append("purgeAfter", null);
	}

	private Document storedRecord(String id) {
		var record = mongoTemplate.getCollection(RECORDS).find(new Document("_id", id)).first();
		assertThat(record).isNotNull();
		return record;
	}

	private static String recordId(int suffix) {
		return "10000000-0000-4000-8000-%012d".formatted(suffix);
	}

	private void insertIdentity() {
		mongoTemplate.getCollection(USERS).insertOne(new Document("_id", USER_ID)
				.append("email", "career-lifecycle@example.com")
				.append("displayName", "목록 테스트 사용자")
				.append("planId", "ea9b17b9-0a6a-42c3-8f0c-86801bc9e313")
				.append("passwordHash", null)
				.append("deletionRequestedAt", null)
				.append("createdAt", new Date())
				.append("lifecycleVersion", 0));
		mongoTemplate.getCollection(SESSIONS).insertOne(new Document("_id", java.util.UUID.randomUUID().toString())
				.append("userId", USER_ID)
				.append("tokenHash", TOKEN_HASH)
				.append("expiresAt", Date.from(Instant.now().plusSeconds(600)))
				.append("revokedAt", null)
				.append("lastSeenAt", null)
				.append("createdAt", new Date()));
	}
}
