package com.expresso.backend.career;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.time.Instant;
import java.util.Date;
import java.util.List;
import java.util.concurrent.Executors;

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

import com.expresso.backend.TestcontainersConfiguration;

@Import(TestcontainersConfiguration.class)
@AutoConfigureMockMvc
@SpringBootTest
class CareerRelationPutHttpIntegrationTest {

	private static final String USER_ID = "10000000-0000-4000-8000-000000000001";
	private static final String OTHER_USER_ID = "10000000-0000-4000-8000-000000000002";
	private static final String SOURCE_CATEGORY_ID = "10000000-0000-4000-8000-000000000010";
	private static final String TARGET_CATEGORY_ID = "10000000-0000-4000-8000-000000000011";
	private static final String WRONG_CATEGORY_ID = "10000000-0000-4000-8000-000000000012";
	private static final String SOURCE_ID = "10000000-0000-4000-8000-000000000020";
	private static final String TARGET_B_ID = "10000000-0000-4000-8000-000000000021";
	private static final String TARGET_C_ID = "10000000-0000-4000-8000-000000000022";
	private static final String TARGET_D_ID = "10000000-0000-4000-8000-000000000023";
	private static final String RELATION_ID = "10000000-0000-4000-8000-000000000030";
	private static final String INVERSE_ID = "10000000-0000-4000-8000-000000000031";
	private static final String FORMULA_ID = "10000000-0000-4000-8000-000000000032";
	private static final String ROLLUP_ID = "10000000-0000-4000-8000-000000000033";
	private static final String TOKEN = "exps_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
	private static final String TOKEN_HASH = "74b2c367c4d415397a6bc46772e8af855235d2c0866bc7dbefdbc2105fde56fc";

	@Autowired MockMvc mockMvc;
	@Autowired MongoTemplate mongoTemplate;

	@BeforeEach
	void prepare() {
		for (var collection : List.of(
				"career_records", "career_categories", "career_record_relations",
				"identity_sessions", "users", "outbox_events")) {
			mongoTemplate.getCollection(collection).deleteMany(new Document());
		}
		insertIdentity();
		mongoTemplate.getCollection("career_categories").insertMany(List.of(
				sourceCategory(), targetCategory(), emptyCategory(WRONG_CATEGORY_ID)));
		mongoTemplate.getCollection("career_records").insertMany(List.of(
				record(SOURCE_ID, USER_ID, SOURCE_CATEGORY_ID, 1, 1, null),
				record(TARGET_B_ID, USER_ID, TARGET_CATEGORY_ID, 3, 4, null),
				record(TARGET_C_ID, USER_ID, TARGET_CATEGORY_ID, 4, 5, null),
				record(TARGET_D_ID, USER_ID, TARGET_CATEGORY_ID, 5, 6, null)));
	}

	@Test
	void replacesTargetsAndWritesFastifyCompatibleInverseEdgesAndOutbox() throws Exception {
		mockMvc.perform(put("/v1/career/records/{recordId}/relations", SOURCE_ID)
				.header(HttpHeaders.AUTHORIZATION, "Bearer " + TOKEN)
				.header(HttpHeaders.IF_MATCH, "\"v1\"")
				.contentType(MediaType.APPLICATION_JSON)
				.content(request(RELATION_ID, TARGET_C_ID, TARGET_B_ID, TARGET_B_ID)))
				.andExpect(status().isOk())
				.andExpect(header().string(HttpHeaders.ETAG, "\"v2\""));

		var source = storedRecord(SOURCE_ID);
		assertThat(source.get("version")).isEqualTo(2L);
		assertThat(source.get("referenceVersion")).isEqualTo(2L);
		assertThat(source.get("propertyValues")).isEqualTo(List.of());
		assertThat(source.get("properties")).isEqualTo(new Document("legacy", "unchanged"));
		assertThat(storedRecord(TARGET_B_ID).get("version")).isEqualTo(3L);
		assertThat(storedRecord(TARGET_B_ID).get("referenceVersion")).isEqualTo(5L);
		assertThat(storedRecord(TARGET_C_ID).get("version")).isEqualTo(4L);
		assertThat(storedRecord(TARGET_C_ID).get("referenceVersion")).isEqualTo(6L);

		var edges = mongoTemplate.getCollection("career_record_relations").find().into(new java.util.ArrayList<>());
		assertThat(edges).hasSize(4);
		assertThat(edges).filteredOn(edge -> SOURCE_ID.equals(edge.getString("sourceRecordId")))
				.extracting(edge -> edge.getString("targetRecordId"))
				.containsExactlyInAnyOrder(TARGET_B_ID, TARGET_C_ID);
		assertThat(edges).filteredOn(edge -> SOURCE_ID.equals(edge.getString("targetRecordId")))
				.extracting(edge -> edge.getString("sourceRecordId"))
				.containsExactlyInAnyOrder(TARGET_B_ID, TARGET_C_ID);

		var sourceEvent = outbox("career-relation:" + SOURCE_ID + ":" + RELATION_ID + ":" + SOURCE_ID + ":v2");
		var sourcePayload = sourceEvent.get("payload", Document.class);
		assertThat(sourcePayload.getList("changedPropertyIds", String.class))
				.containsExactly(RELATION_ID, FORMULA_ID, ROLLUP_ID);
		assertThat(sourcePayload.get("sourcePropertyVersions", Document.class))
				.isEqualTo(new Document(RELATION_ID, 1L).append(FORMULA_ID, 2L).append(ROLLUP_ID, 3L));
		var targetEvent = outbox("career-relation:" + SOURCE_ID + ":" + RELATION_ID + ":" + TARGET_B_ID + ":v2");
		assertThat(targetEvent.get("payload", Document.class)).doesNotContainKey("sourcePropertyVersions");
		assertThat(targetEvent.get("payload", Document.class).get("sourceRecordVersion")).isEqualTo(3L);
	}

	@Test
	void semanticNoOpDoesNotMutateRecordsEdgesOrOutbox() throws Exception {
		insertEdge(SOURCE_ID, RELATION_ID, TARGET_B_ID, INVERSE_ID);
		insertEdge(SOURCE_ID, RELATION_ID, TARGET_C_ID, INVERSE_ID);
		insertEdge(TARGET_B_ID, INVERSE_ID, SOURCE_ID, RELATION_ID);
		insertEdge(TARGET_C_ID, INVERSE_ID, SOURCE_ID, RELATION_ID);

		mockMvc.perform(put("/v1/career/records/{recordId}/relations", SOURCE_ID)
				.header(HttpHeaders.AUTHORIZATION, "Bearer " + TOKEN)
				.header(HttpHeaders.IF_MATCH, "\"v1\"")
				.contentType(MediaType.APPLICATION_JSON)
				.content(request(RELATION_ID, TARGET_C_ID, TARGET_B_ID, TARGET_B_ID)))
				.andExpect(status().isOk())
				.andExpect(header().string(HttpHeaders.ETAG, "\"v1\""));

		assertThat(storedRecord(SOURCE_ID).get("referenceVersion")).isEqualTo(1L);
		assertThat(storedRecord(TARGET_B_ID).get("referenceVersion")).isEqualTo(4L);
		assertThat(mongoTemplate.getCollection("career_record_relations").countDocuments()).isEqualTo(4);
		assertThat(mongoTemplate.getCollection("outbox_events").countDocuments()).isZero();
	}

	@Test
	void replacementRecomputesRemovedAndAddedTargetsWithoutChangingTheirVersions() throws Exception {
		insertEdge(SOURCE_ID, RELATION_ID, TARGET_B_ID, INVERSE_ID);
		insertEdge(SOURCE_ID, RELATION_ID, TARGET_C_ID, INVERSE_ID);
		insertEdge(TARGET_B_ID, INVERSE_ID, SOURCE_ID, RELATION_ID);
		insertEdge(TARGET_C_ID, INVERSE_ID, SOURCE_ID, RELATION_ID);

		mockMvc.perform(put("/v1/career/records/{recordId}/relations", SOURCE_ID)
				.header(HttpHeaders.AUTHORIZATION, "Bearer " + TOKEN)
				.header(HttpHeaders.IF_MATCH, "\"v1\"")
				.contentType(MediaType.APPLICATION_JSON)
				.content(request(RELATION_ID, TARGET_C_ID, TARGET_D_ID)))
				.andExpect(status().isOk());

		assertThat(storedRecord(TARGET_B_ID).get("referenceVersion")).isEqualTo(4L);
		assertThat(storedRecord(TARGET_B_ID).get("updatedAt")).isEqualTo(Date.from(Instant.EPOCH));
		assertThat(mongoTemplate.getCollection("career_record_relations")
				.countDocuments(new Document("sourceRecordId", SOURCE_ID).append("targetRecordId", TARGET_B_ID)))
				.isZero();
		assertThat(outbox("career-relation:" + SOURCE_ID + ":" + RELATION_ID + ":" + TARGET_B_ID + ":v2"))
				.isNotNull();
		assertThat(outbox("career-relation:" + SOURCE_ID + ":" + RELATION_ID + ":" + TARGET_D_ID + ":v2"))
				.isNotNull();
		assertThat(outbox("career-relation:" + SOURCE_ID + ":" + RELATION_ID + ":" + TARGET_C_ID + ":v2"))
				.isNull();
	}

	@Test
	void clearingRelationsRecomputesTheRemovedInverseTarget() throws Exception {
		insertEdge(SOURCE_ID, RELATION_ID, TARGET_B_ID, INVERSE_ID);
		insertEdge(TARGET_B_ID, INVERSE_ID, SOURCE_ID, RELATION_ID);

		mockMvc.perform(put("/v1/career/records/{recordId}/relations", SOURCE_ID)
				.header(HttpHeaders.AUTHORIZATION, "Bearer " + TOKEN)
				.header(HttpHeaders.IF_MATCH, "\"v1\"")
				.contentType(MediaType.APPLICATION_JSON)
				.content(request(RELATION_ID)))
				.andExpect(status().isOk());

		assertThat(outbox("career-relation:" + SOURCE_ID + ":" + RELATION_ID + ":" + TARGET_B_ID + ":v2"))
				.isNotNull();
		assertThat(mongoTemplate.getCollection("career_record_relations").countDocuments()).isZero();
	}

	@Test
	void rejectsStaleDeletedWrongCategoryAndOtherOwnerWritesWithoutPartialMutation() throws Exception {
		mockMvc.perform(put("/v1/career/records/{recordId}/relations", SOURCE_ID)
				.header(HttpHeaders.AUTHORIZATION, "Bearer " + TOKEN).header(HttpHeaders.IF_MATCH, "\"v9\"")
				.contentType(MediaType.APPLICATION_JSON).content(request(RELATION_ID, TARGET_B_ID)))
				.andExpect(status().isPreconditionFailed());

		mongoTemplate.getCollection("career_records").insertOne(
				record("10000000-0000-4000-8000-000000000024", USER_ID, WRONG_CATEGORY_ID, 1, 1, null));
		mockMvc.perform(put("/v1/career/records/{recordId}/relations", SOURCE_ID)
				.header(HttpHeaders.AUTHORIZATION, "Bearer " + TOKEN).header(HttpHeaders.IF_MATCH, "\"v1\"")
				.contentType(MediaType.APPLICATION_JSON)
				.content(request(RELATION_ID, "10000000-0000-4000-8000-000000000024")))
				.andExpect(status().isBadRequest());

		mongoTemplate.getCollection("career_records").insertOne(
				record("10000000-0000-4000-8000-000000000025", OTHER_USER_ID, TARGET_CATEGORY_ID, 1, 1, null));
		mockMvc.perform(put("/v1/career/records/{recordId}/relations", SOURCE_ID)
				.header(HttpHeaders.AUTHORIZATION, "Bearer " + TOKEN).header(HttpHeaders.IF_MATCH, "\"v1\"")
				.contentType(MediaType.APPLICATION_JSON)
				.content(request(RELATION_ID, "10000000-0000-4000-8000-000000000025")))
				.andExpect(status().isNotFound());

		mongoTemplate.getCollection("career_records").updateOne(
				new Document("_id", TARGET_D_ID), new Document("$set", new Document("deletedAt", new Date())));
		mockMvc.perform(put("/v1/career/records/{recordId}/relations", SOURCE_ID)
				.header(HttpHeaders.AUTHORIZATION, "Bearer " + TOKEN).header(HttpHeaders.IF_MATCH, "\"v1\"")
				.contentType(MediaType.APPLICATION_JSON).content(request(RELATION_ID, TARGET_D_ID)))
				.andExpect(status().isNotFound());

		assertThat(storedRecord(SOURCE_ID).get("version")).isEqualTo(1L);
		assertThat(mongoTemplate.getCollection("career_record_relations").countDocuments()).isZero();
		assertThat(mongoTemplate.getCollection("outbox_events").countDocuments()).isZero();
	}

	@Test
	void rejectsInverseSingleConflictWithoutPartialMutation() throws Exception {
		mongoTemplate.getCollection("career_categories").updateOne(
				new Document("_id", TARGET_CATEGORY_ID),
				new Document("$set", new Document("propertyDefinitions.0.config.cardinality", "single")));
		insertEdge(TARGET_B_ID, INVERSE_ID, TARGET_D_ID, RELATION_ID);

		mockMvc.perform(put("/v1/career/records/{recordId}/relations", SOURCE_ID)
				.header(HttpHeaders.AUTHORIZATION, "Bearer " + TOKEN).header(HttpHeaders.IF_MATCH, "\"v1\"")
				.contentType(MediaType.APPLICATION_JSON).content(request(RELATION_ID, TARGET_B_ID)))
				.andExpect(status().isConflict());

		assertThat(storedRecord(SOURCE_ID).get("version")).isEqualTo(1L);
		assertThat(storedRecord(SOURCE_ID).get("referenceVersion")).isEqualTo(1L);
		assertThat(mongoTemplate.getCollection("career_record_relations").countDocuments()).isEqualTo(1);
		assertThat(mongoTemplate.getCollection("outbox_events").countDocuments()).isZero();
	}

	@Test
	void concurrentRelationAndTargetTrashNeverLeaveAPartialEdgePairOrReturn500() throws Exception {
		try (var executor = Executors.newFixedThreadPool(2)) {
			var relation = executor.submit(() -> mockMvc.perform(put("/v1/career/records/{recordId}/relations", SOURCE_ID)
					.header(HttpHeaders.AUTHORIZATION, "Bearer " + TOKEN).header(HttpHeaders.IF_MATCH, "\"v1\"")
					.contentType(MediaType.APPLICATION_JSON).content(request(RELATION_ID, TARGET_B_ID)))
					.andReturn().getResponse().getStatus());
			var trash = executor.submit(() -> mockMvc.perform(delete("/v1/career/records/{recordId}", TARGET_B_ID)
					.header(HttpHeaders.AUTHORIZATION, "Bearer " + TOKEN).header(HttpHeaders.IF_MATCH, "\"v3\""))
					.andReturn().getResponse().getStatus());

			var relationStatus = relation.get();
			var trashStatus = trash.get();
			assertThat(relationStatus).isIn(200, 404, 412);
			assertThat(trashStatus).isIn(200, 412);
			var forwardCount = mongoTemplate.getCollection("career_record_relations").countDocuments(
					new Document("sourceRecordId", SOURCE_ID).append("targetRecordId", TARGET_B_ID));
			var inverseCount = mongoTemplate.getCollection("career_record_relations").countDocuments(
					new Document("sourceRecordId", TARGET_B_ID).append("targetRecordId", SOURCE_ID));
			assertThat(forwardCount).isEqualTo(inverseCount);
			assertThat(forwardCount).isIn(0L, 1L);
		}
	}

	private Document storedRecord(String id) {
		return mongoTemplate.getCollection("career_records").find(new Document("_id", id)).first();
	}

	private Document outbox(String key) {
		return mongoTemplate.getCollection("outbox_events").find(new Document("idempotencyKey", key)).first();
	}

	private void insertEdge(String sourceId, String propertyId, String targetId, String inverseId) {
		mongoTemplate.getCollection("career_record_relations").insertOne(new Document("_id", java.util.UUID.randomUUID().toString())
				.append("userId", USER_ID).append("sourceRecordId", sourceId).append("sourcePropertyId", propertyId)
				.append("targetRecordId", targetId).append("inversePropertyId", inverseId)
				.append("cardinality", "multiple").append("deletePolicy", "restrict").append("createdBy", "user")
				.append("createdAt", new Date()).append("updatedAt", new Date()));
	}

	private static String request(String propertyId, String... targetIds) {
		return "{\"propertyId\":\"" + propertyId + "\",\"targetIds\":["
				+ java.util.Arrays.stream(targetIds).map(id -> "\"" + id + "\"").collect(java.util.stream.Collectors.joining(","))
				+ "]}";
	}

	private static Document sourceCategory() {
		return category(SOURCE_CATEGORY_ID, List.of(
				definition(RELATION_ID, "related", "relation", 1,
						new Document("targetCategoryId", TARGET_CATEGORY_ID).append("inversePropertyId", INVERSE_ID)
								.append("cardinality", "multiple").append("deletePolicy", "restrict")),
				definition(FORMULA_ID, "formula", "formula", 2, new Document()),
				definition(ROLLUP_ID, "rollup", "rollup", 3, new Document())));
	}

	private static Document targetCategory() {
		return category(TARGET_CATEGORY_ID, List.of(
				definition(INVERSE_ID, "back", "relation", 1,
						new Document("targetCategoryId", SOURCE_CATEGORY_ID).append("inversePropertyId", RELATION_ID)
								.append("cardinality", "multiple").append("deletePolicy", "restrict"))));
	}

	private static Document emptyCategory(String id) {
		return category(id, List.of());
	}

	private static Document category(String id, List<Document> definitions) {
		return new Document("_id", id).append("userId", USER_ID).append("isSystem", false).append("key", id)
				.append("name", id).append("schemaVersion", 1).append("version", 1)
				.append("propertyDefinitions", definitions);
	}

	private static Document definition(String id, String key, String type, long version, Document config) {
		return new Document("id", id).append("key", key).append("name", key).append("type", type)
				.append("required", false).append("system", false).append("config", config)
				.append("order", (int) version - 1).append("version", version).append("deletedAt", null);
	}

	private static Document record(
			String id, String ownerId, String categoryId, long version, long referenceVersion, Date deletedAt) {
		return new Document("_id", id).append("userId", ownerId).append("categoryId", categoryId).append("title", id)
				.append("propertyValues", List.of()).append("blockBody", new Document("schemaVersion", 1).append("type", "doc")
						.append("content", List.of()))
				.append("properties", new Document("legacy", "unchanged")).append("bodyMd", "legacy")
				.append("status", "draft").append("origin", "manual").append("version", version)
				.append("referenceVersion", referenceVersion).append("updatedAt", Date.from(Instant.EPOCH))
				.append("deletedAt", deletedAt);
	}

	private void insertIdentity() {
		mongoTemplate.getCollection("users").insertMany(List.of(
				new Document("_id", USER_ID).append("email", "relation@example.com").append("displayName", "관계 사용자")
						.append("planId", "ea9b17b9-0a6a-42c3-8f0c-86801bc9e313").append("passwordHash", null)
						.append("deletionRequestedAt", null).append("createdAt", new Date()).append("lifecycleVersion", 0),
				new Document("_id", OTHER_USER_ID).append("email", "other-relation@example.com").append("displayName", "다른 사용자")
						.append("planId", "ea9b17b9-0a6a-42c3-8f0c-86801bc9e313").append("passwordHash", null)
						.append("deletionRequestedAt", null).append("createdAt", new Date()).append("lifecycleVersion", 0)));
		mongoTemplate.getCollection("identity_sessions").insertOne(new Document("_id", java.util.UUID.randomUUID().toString())
				.append("userId", USER_ID).append("tokenHash", TOKEN_HASH)
				.append("expiresAt", Date.from(Instant.now().plusSeconds(600))).append("revokedAt", null)
				.append("lastSeenAt", null).append("createdAt", new Date()));
	}
}
