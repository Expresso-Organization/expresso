package com.expresso.backend.career;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.time.Instant;
import java.util.ArrayList;
import java.util.Date;
import java.util.List;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ExecutionException;

import org.bson.Document;
import org.bson.types.Decimal128;
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

@Import(TestcontainersConfiguration.class)
@AutoConfigureMockMvc
@SpringBootTest
class CareerRecordPatchHttpIntegrationTest {

	private static final String RECORDS = "career_records";
	private static final String CATEGORIES = "career_categories";
	private static final String SESSIONS = "identity_sessions";
	private static final String USERS = "users";
	private static final String USER_ID = "bc2f9791-0bb1-4a31-a23d-ea720f31284d";
	private static final String OTHER_USER_ID = "945969f8-c8e5-469b-8119-bab71fa5aa60";
	private static final String ACCESS_TOKEN = "exps_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
	private static final String TOKEN_HASH = "74b2c367c4d415397a6bc46772e8af855235d2c0866bc7dbefdbc2105fde56fc";
	private static final String RECORD_ID = "10ecce84-8d6b-4b76-87de-ec76729f9b90";
	private static final String MISSING_RECORD_ID = "45e37ac7-076e-4cd0-a932-e723a7c650af";
	private static final String CATEGORY_ID = "475106fc-bf88-4a73-9c27-66c648733936";
	private static final String PROPERTY_DEFINITION_ID = "6c663539-48c1-5d12-939d-f100fac993c1";
	private static final String NUMBER_PROPERTY_DEFINITION_ID = "10000000-0000-4000-8000-000000000002";
	private static final String OPTION_ID = "20000000-0000-4000-8000-000000000001";
	private static final String OTHER_OPTION_ID = "20000000-0000-4000-8000-000000000002";
	private static final String UNKNOWN_OPTION_ID = "20000000-0000-4000-8000-000000000003";
	private static final String ASSET_ID = "30000000-0000-4000-8000-000000000001";
	private static final String UNKNOWN_PROPERTY_DEFINITION_ID = "6ae7a3c3-e0f0-4b88-8fe8-da3da27d0dd8";
	private static final String PARAGRAPH_ID = "fb122c86-7db8-41c3-a9d9-7a12c4758b08";
	private static final Instant UPDATED_AT = Instant.parse("2026-09-01T08:15:30.123Z");

	@Autowired
	private MockMvc mockMvc;

	@Autowired
	private MongoTemplate mongoTemplate;

	@BeforeEach
	void prepareDatabase() {
		for (var collection : List.of(RECORDS, CATEGORIES, SESSIONS, USERS)) {
			mongoTemplate.getCollection(collection).deleteMany(new Document());
		}
		insertIdentity(USER_ID, TOKEN_HASH);
		insertSystemCategory();
	}

	@Test
	void updatesTitleAtomicallyAndReturnsTheNextEtag() throws Exception {
		mongoTemplate.getCollection(RECORDS).insertOne(canonicalRecord(USER_ID, 1));
		mongoTemplate.getCollection(CATEGORIES).deleteMany(new Document());

		patchRecord(ACCESS_TOKEN, RECORD_ID, "\"v1\"", "{\"title\":\"Updated title\"}")
				.andExpect(status().isOk())
				.andExpect(header().string(HttpHeaders.ETAG, "\"v2\""))
				.andExpect(jsonPath("$.data.title").value("Updated title"))
				.andExpect(jsonPath("$.data.version").value(2));

		var stored = mongoTemplate.getCollection(RECORDS).find(new Document("_id", RECORD_ID)).first();
		assertThat(stored).isNotNull();
		assertThat(stored.getString("title")).isEqualTo("Updated title");
		assertThat(stored.getInteger("version")).isEqualTo(2);
		assertThat(stored.getDate("updatedAt").toInstant()).isAfter(UPDATED_AT);
		assertThat(stored.get("properties", Document.class)).isEqualTo(new Document("legacy", "keep"));
		assertThat(stored.getString("bodyMd")).isEqualTo("legacy body stays");
	}

	@Test
	void updatesPropertyValuesOnlyWhenEveryDefinitionBelongsToTheSystemCategory() throws Exception {
		mongoTemplate.getCollection(RECORDS).insertOne(canonicalRecord(USER_ID, 1));
		var body = "{\"propertyValues\":[{\"propertyDefinitionId\":\"" + PROPERTY_DEFINITION_ID
				+ "\",\"type\":\"text\",\"value\":\"Updated property\"}]}";

		patchRecord(ACCESS_TOKEN, RECORD_ID, "\"v1\"", body)
				.andExpect(status().isOk())
				.andExpect(header().string(HttpHeaders.ETAG, "\"v2\""))
				.andExpect(jsonPath("$.data.propertyValues[0].value").value("Updated property"));

		var stored = mongoTemplate.getCollection(RECORDS).find(new Document("_id", RECORD_ID)).first();
		assertThat(stored).isNotNull();
		assertThat(stored.getList("propertyValues", Document.class).getFirst().getString("value"))
				.isEqualTo("Updated property");
		assertThat(stored.get("properties", Document.class)).isEqualTo(new Document("legacy", "keep"));
	}

	@Test
	void rejectsPropertyValueOutsideTheCurrentSystemCategory() throws Exception {
		mongoTemplate.getCollection(RECORDS).insertOne(canonicalRecord(USER_ID, 1));
		var body = "{\"propertyValues\":[{\"propertyDefinitionId\":\"" + UNKNOWN_PROPERTY_DEFINITION_ID
				+ "\",\"type\":\"text\",\"value\":\"Unknown\"}]}";

		patchRecord(ACCESS_TOKEN, RECORD_ID, "\"v1\"", body)
				.andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.error.code").value("VALIDATION_ERROR"));

		assertStoredVersionAndTitle(1, "Original title");
	}

	@Test
	void updatesBlockBodyWithoutChangingLegacyBodyMd() throws Exception {
		mongoTemplate.getCollection(RECORDS).insertOne(canonicalRecord(USER_ID, 1));
		var body = "{\"blockBody\":{"
				+ "\"schemaVersion\":1,\"type\":\"doc\",\"content\":[{"
				+ "\"id\":\"" + PARAGRAPH_ID + "\",\"type\":\"paragraph\",\"attrs\":{},"
				+ "\"text\":[{\"text\":\"Updated body\"}]}]}}";

		patchRecord(ACCESS_TOKEN, RECORD_ID, "\"v1\"", body)
				.andExpect(status().isOk())
				.andExpect(header().string(HttpHeaders.ETAG, "\"v2\""))
				.andExpect(jsonPath("$.data.blockBody.content[0].text[0].text").value("Updated body"));

		var stored = mongoTemplate.getCollection(RECORDS).find(new Document("_id", RECORD_ID)).first();
		assertThat(stored).isNotNull();
		assertThat(stored.get("blockBody", Document.class)
				.getList("content", Document.class).getFirst()
				.getList("text", Document.class).getFirst().getString("text")).isEqualTo("Updated body");
		assertThat(stored.getString("bodyMd")).isEqualTo("legacy body stays");
	}

	@Test
	void roundTripsEveryWritablePropertyValueThroughPatchMongoAndGet() throws Exception {
		mongoTemplate.getCollection(RECORDS).insertOne(canonicalRecord(USER_ID, 1));
		mongoTemplate.getCollection(CATEGORIES).updateOne(
				new Document("_id", CATEGORY_ID),
				new Document("$set", new Document("propertyDefinitions", allWritableDefinitions())));
		var values = allWritableValues();
		var body = new Document("propertyValues", values).toJson();

		patchRecord(ACCESS_TOKEN, RECORD_ID, "\"v1\"", body)
				.andExpect(status().isOk())
				.andExpect(header().string(HttpHeaders.ETAG, "\"v2\""))
				.andExpect(jsonPath("$.data.propertyValues[1].value").value("42.5000"))
				.andExpect(jsonPath("$.data.propertyValues[4].value[2]").value(OTHER_OPTION_ID))
				.andExpect(jsonPath("$.data.propertyValues[5].value.precision").value("month"))
				.andExpect(jsonPath("$.data.propertyValues[5].value.end").value("2026-12"))
				.andExpect(jsonPath("$.data.propertyValues[7].value.timezone").value("Asia/Seoul"))
				.andExpect(jsonPath("$.data.propertyValues[12].type").value("media"));

		var stored = mongoTemplate.getCollection(RECORDS).find(new Document("_id", RECORD_ID)).first();
		assertThat(stored).isNotNull();
		assertThat(stored.getList("propertyValues", Document.class)).hasSize(13);
		assertThat(stored.getList("propertyValues", Document.class).get(1).get("value"))
				.isInstanceOf(Decimal128.class);
		assertThat(stored.get("properties", Document.class)).isEqualTo(new Document("legacy", "keep"));

		mockMvc.perform(get("/v1/career/records/{recordId}", RECORD_ID)
				.header(HttpHeaders.AUTHORIZATION, "Bearer " + ACCESS_TOKEN))
				.andExpect(status().isOk())
				.andExpect(header().string(HttpHeaders.ETAG, "\"v2\""))
				.andExpect(jsonPath("$.data.propertyValues[5].value.end").value("2026-12"))
				.andExpect(jsonPath("$.data.propertyValues[7].value.timezone").value("Asia/Seoul"));

		patchRecord(ACCESS_TOKEN, RECORD_ID, "\"v2\"", body)
				.andExpect(status().isOk())
				.andExpect(header().string(HttpHeaders.ETAG, "\"v2\""))
				.andExpect(jsonPath("$.data.version").value(2));
	}

	@Test
	void rejectsASelectOptionThatDoesNotBelongToItsDefinition() throws Exception {
		mongoTemplate.getCollection(RECORDS).insertOne(canonicalRecord(USER_ID, 1));
		mongoTemplate.getCollection(CATEGORIES).updateOne(
				new Document("_id", CATEGORY_ID),
				new Document("$set", new Document("propertyDefinitions", allWritableDefinitions())));
		var body = new Document("propertyValues", List.of(new Document()
				.append("propertyDefinitionId", id(4))
				.append("type", "select")
				.append("value", UNKNOWN_OPTION_ID))).toJson();

		patchRecord(ACCESS_TOKEN, RECORD_ID, "\"v1\"", body)
				.andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.error.code").value("VALIDATION_ERROR"));

		assertStoredVersionAndTitle(1, "Original title");
	}

	@Test
	void preservesAPlainDecimalStringAndScaleThroughHttpAndDecimal128() throws Exception {
		mongoTemplate.getCollection(RECORDS).insertOne(canonicalRecord(USER_ID, 1));
		mongoTemplate.getCollection(CATEGORIES).updateOne(
				new Document("_id", CATEGORY_ID),
				new Document("$set", new Document("propertyDefinitions", List.of(
						canonicalDefinition(id(2), "number", "숫자", "number", 0)))));
		var decimal = "123456789012345678.1234567890123400";
		var body = "{\"propertyValues\":[{\"propertyDefinitionId\":\"" + id(2)
				+ "\",\"type\":\"number\",\"value\":\"" + decimal + "\"}]}";

		patchRecord(ACCESS_TOKEN, RECORD_ID, "\"v1\"", body)
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.data.propertyValues[0].value").value(decimal));

		var stored = mongoTemplate.getCollection(RECORDS).find(new Document("_id", RECORD_ID)).first();
		assertThat(stored).isNotNull();
		assertThat(stored.getList("propertyValues", Document.class).getFirst()
				.get("value", Decimal128.class).toString()).isEqualTo(decimal);
	}

	@Test
	void rejectsJsonNumbersAndNonPlainDecimalStrings() throws Exception {
		mongoTemplate.getCollection(RECORDS).insertOne(canonicalRecord(USER_ID, 1));
		mongoTemplate.getCollection(CATEGORIES).updateOne(
				new Document("_id", CATEGORY_ID),
				new Document("$set", new Document("propertyDefinitions", List.of(
						canonicalDefinition(id(2), "number", "숫자", "number", 0)))));

		for (var value : List.of("123.45", "\"1e3\"", "\"NaN\"", "\"Infinity\"")) {
			var body = "{\"propertyValues\":[{\"propertyDefinitionId\":\"" + id(2)
					+ "\",\"type\":\"number\",\"value\":" + value + "}]}";
			patchRecord(ACCESS_TOKEN, RECORD_ID, "\"v1\"", body)
					.andExpect(status().isBadRequest())
					.andExpect(jsonPath("$.error.code").value("VALIDATION_ERROR"));
		}

		assertStoredVersionAndTitle(1, "Original title");
	}

	@Test
	void rejectsMalformedJsonAsAValidationError() throws Exception {
		mongoTemplate.getCollection(RECORDS).insertOne(canonicalRecord(USER_ID, 1));

		patchRecord(ACCESS_TOKEN, RECORD_ID, "\"v1\"", "{\"propertyValues\":[")
				.andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.error.code").value("VALIDATION_ERROR"));

		assertStoredVersionAndTitle(1, "Original title");
	}

	@Test
	void roundTripsRichAndUnknownBlockBodyWithOneVersionIncrementAndNoOpReplay() throws Exception {
		mongoTemplate.getCollection(RECORDS).insertOne(canonicalRecord(USER_ID, 1));
		var requestBody = CareerRichBlockBodyTestFixture.patchBody(
				CareerRichBlockBodyTestFixture.richAndUnknownBody());

		patchRecord(ACCESS_TOKEN, RECORD_ID, "\"v1\"", requestBody)
				.andExpect(status().isOk())
				.andExpect(header().string(HttpHeaders.ETAG, "\"v2\""))
				.andExpect(jsonPath("$.data.blockBody.content[0].type").value("heading1"))
				.andExpect(jsonPath("$.data.blockBody.content[0].text[1].marks[0].attrs.href")
						.value("https://example.com/evidence"))
				.andExpect(jsonPath("$.data.blockBody.content[2].content[0].content[1].content[0].text[0].text")
						.value("30% 감소"))
				.andExpect(jsonPath("$.data.blockBody.content[8].type").value("future.timeline"))
				.andExpect(jsonPath("$.data.blockBody.content[8].content[0].text[0].text")
						.value("미래 블록의 중첩 본문"));

		var firstStored = mongoTemplate.getCollection(RECORDS).find(new Document("_id", RECORD_ID)).first();
		assertThat(firstStored).isNotNull();
		assertThat(firstStored.getString("bodyMd")).isEqualTo("legacy body stays");
		assertThat(firstStored.get("blockBody", Document.class).getList("content", Document.class)).hasSize(9);
		var firstUpdatedAt = firstStored.getDate("updatedAt");

		patchRecord(ACCESS_TOKEN, RECORD_ID, "\"v2\"", requestBody)
				.andExpect(status().isOk())
				.andExpect(header().string(HttpHeaders.ETAG, "\"v2\""))
				.andExpect(jsonPath("$.data.version").value(2));

		var replayed = mongoTemplate.getCollection(RECORDS).find(new Document("_id", RECORD_ID)).first();
		assertThat(replayed).isNotNull();
		assertThat(replayed.getDate("updatedAt")).isEqualTo(firstUpdatedAt);
	}

	@Test
	void acceptsAnEmptyRootBlockBody() throws Exception {
		mongoTemplate.getCollection(RECORDS).insertOne(canonicalRecord(USER_ID, 1));

		patchRecord(ACCESS_TOKEN, RECORD_ID, "\"v1\"",
				"{\"blockBody\":{\"schemaVersion\":1,\"type\":\"doc\",\"content\":[]}}")
				.andExpect(status().isOk())
				.andExpect(header().string(HttpHeaders.ETAG, "\"v2\""))
				.andExpect(jsonPath("$.data.blockBody.content").isEmpty());
	}

	@Test
	void rejectsMalformedRichBlockBodiesAsValidationErrors() throws Exception {
		mongoTemplate.getCollection(RECORDS).insertOne(canonicalRecord(USER_ID, 1));
		var duplicateId = "{\"blockBody\":{\"schemaVersion\":1,\"type\":\"doc\",\"content\":[{"
				+ "\"id\":\"" + PARAGRAPH_ID + "\",\"type\":\"future.container\",\"attrs\":{},\"content\":[{"
				+ "\"id\":\"" + PARAGRAPH_ID + "\",\"type\":\"paragraph\",\"attrs\":{}}]}]}}";

		patchRecord(ACCESS_TOKEN, RECORD_ID, "\"v1\"", duplicateId)
				.andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.error.code").value("VALIDATION_ERROR"));

		var knownInvariantViolation = "{\"blockBody\":{\"schemaVersion\":1,\"type\":\"doc\",\"content\":[{"
				+ "\"id\":\"" + PARAGRAPH_ID + "\",\"type\":\"paragraph\",\"attrs\":{},\"content\":[{"
				+ "\"id\":\"c2ae930e-5c93-4488-9652-60c388d5e590\",\"type\":\"paragraph\",\"attrs\":{}}]}]}}";

		patchRecord(ACCESS_TOKEN, RECORD_ID, "\"v1\"", knownInvariantViolation)
				.andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.error.code").value("VALIDATION_ERROR"));

		assertStoredVersionAndTitle(1, "Original title");
	}

	@Test
	void rejectsTextValueForANonTextCanonicalDefinition() throws Exception {
		mongoTemplate.getCollection(RECORDS).insertOne(canonicalRecord(USER_ID, 1));
		mongoTemplate.getCollection(CATEGORIES).updateOne(
				new Document("_id", CATEGORY_ID),
				new Document("$set", new Document("propertyDefinitions", List.of(
						canonicalDefinition(PROPERTY_DEFINITION_ID, "role", "역할", "text", 0),
						canonicalDefinition(NUMBER_PROPERTY_DEFINITION_ID, "score", "점수", "number", 1)))));
		var body = "{\"propertyValues\":[{\"propertyDefinitionId\":\"" + NUMBER_PROPERTY_DEFINITION_ID
				+ "\",\"type\":\"text\",\"value\":\"숫자 Definition에 쓸 수 없는 값\"}]}";

		patchRecord(ACCESS_TOKEN, RECORD_ID, "\"v1\"", body)
				.andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.error.code").value("VALIDATION_ERROR"));

		assertStoredVersionAndTitle(1, "Original title");
	}

	@Test
	void rejectsRichBlockBodySafetyLimitViolationsAsValidationErrors() throws Exception {
		mongoTemplate.getCollection(RECORDS).insertOne(canonicalRecord(USER_ID, 1));

		for (var blockBody : List.of(depthThirtyThreeBody(), attrsDepthSeventeenBody(), overFourMibBody())) {
			patchRecord(ACCESS_TOKEN, RECORD_ID, "\"v1\"", CareerRichBlockBodyTestFixture.patchBody(blockBody))
					.andExpect(status().isBadRequest())
					.andExpect(jsonPath("$.error.code").value("VALIDATION_ERROR"));
		}

		assertStoredVersionAndTitle(1, "Original title");
	}

	@Test
	void changesThreeCanonicalFieldsWithOneVersionIncrement() throws Exception {
		mongoTemplate.getCollection(RECORDS).insertOne(canonicalRecord(USER_ID, 4));
		var body = "{"
				+ "\"title\":\"All updated\","
				+ "\"propertyValues\":[],"
				+ "\"blockBody\":{\"schemaVersion\":1,\"type\":\"doc\",\"content\":[{"
				+ "\"id\":\"" + PARAGRAPH_ID + "\",\"type\":\"paragraph\",\"attrs\":{},\"text\":[]}]}}";

		patchRecord(ACCESS_TOKEN, RECORD_ID, "\"v4\"", body)
				.andExpect(status().isOk())
				.andExpect(header().string(HttpHeaders.ETAG, "\"v5\""))
				.andExpect(jsonPath("$.data.title").value("All updated"))
				.andExpect(jsonPath("$.data.propertyValues.length()").value(0))
				.andExpect(jsonPath("$.data.blockBody.content[0].text.length()").value(0))
				.andExpect(jsonPath("$.data.version").value(5));
	}

	@Test
	void keepsVersionAndUpdatedAtForAnActualNoOp() throws Exception {
		mongoTemplate.getCollection(RECORDS).insertOne(canonicalRecord(USER_ID, 3));

		patchRecord(ACCESS_TOKEN, RECORD_ID, "\"v3\"", "{\"title\":\"Original title\"}")
				.andExpect(status().isOk())
				.andExpect(header().string(HttpHeaders.ETAG, "\"v3\""))
				.andExpect(jsonPath("$.data.version").value(3))
				.andExpect(jsonPath("$.data.updatedAt").value(UPDATED_AT.toString()));

		var stored = mongoTemplate.getCollection(RECORDS).find(new Document("_id", RECORD_ID)).first();
		assertThat(stored).isNotNull();
		assertThat(stored.getInteger("version")).isEqualTo(3);
		assertThat(stored.getDate("updatedAt").toInstant()).isEqualTo(UPDATED_AT);
	}

	@Test
	void rejectsStaleVersionWithoutChangingData() throws Exception {
		mongoTemplate.getCollection(RECORDS).insertOne(canonicalRecord(USER_ID, 2));

		patchRecord(ACCESS_TOKEN, RECORD_ID, "\"v1\"", "{\"title\":\"Stale update\"}")
				.andExpect(status().isPreconditionFailed())
				.andExpect(jsonPath("$.error.code").value("PRECONDITION_FAILED"));

		assertStoredVersionAndTitle(2, "Original title");
	}

	@Test
	void hidesMissingOtherUsersAndLegacyOnlyRecordsAsNotFound() throws Exception {
		patchRecord(ACCESS_TOKEN, MISSING_RECORD_ID, "\"v1\"", "{\"title\":\"Missing\"}")
				.andExpect(status().isNotFound());

		mongoTemplate.getCollection(RECORDS).insertOne(canonicalRecord(OTHER_USER_ID, 1));
		patchRecord(ACCESS_TOKEN, RECORD_ID, "\"v1\"", "{\"title\":\"Other user\"}")
				.andExpect(status().isNotFound());

		mongoTemplate.getCollection(RECORDS).deleteMany(new Document());
		var legacyOnly = canonicalRecord(USER_ID, 1);
		legacyOnly.remove("propertyValues");
		legacyOnly.remove("blockBody");
		mongoTemplate.getCollection(RECORDS).insertOne(legacyOnly);
		patchRecord(ACCESS_TOKEN, RECORD_ID, "\"v1\"", "{\"title\":\"Legacy\"}")
				.andExpect(status().isNotFound());
	}

	@Test
	void returnsInternalErrorForMalformedCanonicalData() throws Exception {
		var malformed = canonicalRecord(USER_ID, 1);
		malformed.get("blockBody", Document.class).put("schemaVersion", 2);
		mongoTemplate.getCollection(RECORDS).insertOne(malformed);

		patchRecord(ACCESS_TOKEN, RECORD_ID, "\"v1\"", "{\"title\":\"Malformed\"}")
				.andExpect(status().isInternalServerError())
				.andExpect(jsonPath("$.error.code").value("INTERNAL_ERROR"));
	}

	@Test
	void rejectsInvalidRecordIdEtagAndBodyAndRequiresAuthentication() throws Exception {
		patchRecord(ACCESS_TOKEN, "not-a-uuid", "\"v1\"", "{\"title\":\"Invalid\"}")
				.andExpect(status().isBadRequest());
		patchRecord(ACCESS_TOKEN, RECORD_ID, null, "{\"title\":\"Invalid\"}")
				.andExpect(status().isBadRequest());
		patchRecord(ACCESS_TOKEN, RECORD_ID, "v1", "{\"title\":\"Invalid\"}")
				.andExpect(status().isBadRequest());
		patchRecord(ACCESS_TOKEN, RECORD_ID, "\"v0\"", "{\"title\":\"Invalid\"}")
				.andExpect(status().isBadRequest());
		patchRecord(ACCESS_TOKEN, RECORD_ID, "\"v1\"", "{}")
				.andExpect(status().isBadRequest());
		patchRecord(ACCESS_TOKEN, RECORD_ID, "\"v1\"", "{\"categoryId\":\"" + CATEGORY_ID + "\"}")
				.andExpect(status().isBadRequest());

		mockMvc.perform(patch("/v1/career/records/{recordId}", RECORD_ID)
				.header(HttpHeaders.IF_MATCH, "\"v1\"")
				.contentType(MediaType.APPLICATION_JSON)
				.content("{\"title\":\"No authentication\"}"))
				.andExpect(status().isUnauthorized())
				.andExpect(jsonPath("$.error.code").value("AUTH_REQUIRED"));
	}

	@Test
	void letsOnlyOneConcurrentRequestWinForTheSameVersion() throws Exception {
		mongoTemplate.getCollection(RECORDS).insertOne(canonicalRecord(USER_ID, 1));
		var first = CompletableFuture.supplyAsync(() -> patchWithoutCheckedException("Concurrent A"));
		var second = CompletableFuture.supplyAsync(() -> patchWithoutCheckedException("Concurrent B"));

		var results = List.of(await(first), await(second));
		assertThat(results).extracting(result -> result.getResponse().getStatus())
				.containsExactlyInAnyOrder(200, 412);
		assertThat(mongoTemplate.getCollection(RECORDS).countDocuments()).isEqualTo(1);
		var stored = mongoTemplate.getCollection(RECORDS).find(new Document("_id", RECORD_ID)).first();
		assertThat(stored).isNotNull();
		assertThat(stored.getInteger("version")).isEqualTo(2);
		assertThat(stored.getString("title")).isIn("Concurrent A", "Concurrent B");
	}

	private static Document canonicalRecord(String ownerId, int version) {
		return new Document("_id", RECORD_ID)
				.append("userId", ownerId)
				.append("categoryId", CATEGORY_ID)
				.append("title", "Original title")
				.append("status", "draft")
				.append("origin", "manual")
				.append("propertyValues", List.of(new Document()
						.append("propertyDefinitionId", PROPERTY_DEFINITION_ID)
						.append("type", "text")
						.append("value", "Original property")))
				.append("blockBody", blockBody("Original body"))
				.append("editorSchemaVersion", 1)
				.append("properties", new Document("legacy", "keep"))
				.append("bodyMd", "legacy body stays")
				.append("version", version)
				.append("updatedAt", Date.from(UPDATED_AT))
				.append("deletedAt", null)
				.append("purgeAfter", null);
	}

	private static Document blockBody(String text) {
		return new Document("schemaVersion", 1)
				.append("type", "doc")
				.append("content", List.of(new Document()
						.append("id", PARAGRAPH_ID)
						.append("type", "paragraph")
						.append("attrs", new Document())
						.append("text", List.of(new Document("text", text)))));
	}

	private static Document depthThirtyThreeBody() {
		Document current = new Document("id", blockId(33))
				.append("type", "future.container")
				.append("attrs", new Document());
		for (var depth = 32; depth >= 1; depth--) {
			current = new Document("id", blockId(depth))
					.append("type", "future.container")
					.append("attrs", new Document())
					.append("content", List.of(current));
		}
		return new Document("schemaVersion", 1).append("type", "doc").append("content", List.of(current));
	}

	private static Document attrsDepthSeventeenBody() {
		Document attrs = new Document();
		for (var depth = 1; depth < 17; depth++) {
			attrs = new Document("nested", attrs);
		}
		var block = new Document("id", PARAGRAPH_ID)
				.append("type", "future.container")
				.append("attrs", attrs);
		return new Document("schemaVersion", 1).append("type", "doc").append("content", List.of(block));
	}

	private static Document overFourMibBody() {
		var text = new ArrayList<Document>();
		for (var index = 0; index < 29; index++) {
			text.add(new Document("text", "가".repeat(49_000)));
		}
		var block = new Document("id", PARAGRAPH_ID)
				.append("type", "paragraph")
				.append("attrs", new Document())
				.append("text", text);
		return new Document("schemaVersion", 1).append("type", "doc").append("content", List.of(block));
	}

	private static String blockId(int index) {
		return "00000000-0000-4000-8000-%012d".formatted(index);
	}

	private org.springframework.test.web.servlet.ResultActions patchRecord(
			String token,
			String recordId,
			String ifMatch,
			String body) throws Exception {
		var request = patch("/v1/career/records/{recordId}", recordId)
				.header(HttpHeaders.AUTHORIZATION, "Bearer " + token)
				.contentType(MediaType.APPLICATION_JSON)
				.content(body);
		if (ifMatch != null) {
			request.header(HttpHeaders.IF_MATCH, ifMatch);
		}
		return mockMvc.perform(request);
	}

	private MvcResult patchWithoutCheckedException(String title) {
		try {
			return patchRecord(ACCESS_TOKEN, RECORD_ID, "\"v1\"", "{\"title\":\"" + title + "\"}")
					.andReturn();
		}
		catch (Exception error) {
			throw new IllegalStateException("동시 PATCH HTTP 요청을 실행할 수 없습니다", error);
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

	private void assertStoredVersionAndTitle(int version, String title) {
		var stored = mongoTemplate.getCollection(RECORDS).find(new Document("_id", RECORD_ID)).first();
		assertThat(stored).isNotNull();
		assertThat(stored.getInteger("version")).isEqualTo(version);
		assertThat(stored.getString("title")).isEqualTo(title);
	}

	private void insertSystemCategory() {
		mongoTemplate.getCollection(CATEGORIES).insertOne(new Document("_id", CATEGORY_ID)
				.append("key", "experience")
				.append("name", "경력")
				.append("isSystem", true)
				.append("sortOrder", 0)
				.append("propertyDefinitions", List.of(new Document()
						.append("id", PROPERTY_DEFINITION_ID)
						.append("key", "role")
						.append("label", "역할")
						.append("type", "text")
						.append("required", false)
						.append("system", true)))
				.append("propertySchema", new Document("role", new Document()
						.append("id", PROPERTY_DEFINITION_ID)
						.append("label", "역할")
						.append("type", "text")
						.append("required", false)
						.append("system", true)))
				.append("icon", "briefcase")
				.append("defaultView", "table"));
	}

	private static Document canonicalDefinition(String id, String key, String name, String type, int order) {
		return canonicalDefinition(id, key, name, type, new Document(), order);
	}

	private static Document canonicalDefinition(
			String id, String key, String name, String type, Document config, int order) {
		return new Document("id", id)
				.append("key", key)
				.append("name", name)
				.append("type", type)
				.append("required", false)
				.append("system", true)
				.append("config", config)
				.append("order", order)
				.append("version", 1)
				.append("deletedAt", null);
	}

	private static List<Document> allWritableDefinitions() {
		var options = new Document("options", List.of(
				new Document("id", OPTION_ID).append("name", "Java"),
				new Document("id", OTHER_OPTION_ID).append("name", "java")));
		return List.of(
				canonicalDefinition(id(1), "text", "텍스트", "text", 0),
				canonicalDefinition(id(2), "number", "숫자", "number", 1),
				canonicalDefinition(id(3), "checkbox", "체크", "checkbox", 2),
				canonicalDefinition(id(4), "select", "선택", "select", options, 3),
				canonicalDefinition(id(5), "multiSelect", "다중 선택", "multi_select", options, 4),
				canonicalDefinition(id(6), "month", "월", "date", 5),
				canonicalDefinition(id(7), "day", "일", "date", 6),
				canonicalDefinition(id(8), "datetime", "시각", "date", 7),
				canonicalDefinition(id(9), "url", "URL", "url", 8),
				canonicalDefinition(id(10), "email", "이메일", "email", 9),
				canonicalDefinition(id(11), "phone", "전화", "phone", 10),
				canonicalDefinition(id(12), "file", "파일", "file", 11),
				canonicalDefinition(id(13), "media", "미디어", "media", 12));
	}

	private static List<Document> allWritableValues() {
		return List.of(
				propertyValue(1, "text", "본문"),
				propertyValue(2, "number", "42.5000"),
				propertyValue(3, "checkbox", true),
				propertyValue(4, "select", OPTION_ID),
				propertyValue(5, "multi_select", List.of(OPTION_ID, OPTION_ID, OTHER_OPTION_ID)),
				propertyValue(6, "date", new Document("precision", "month")
						.append("start", "2026-09").append("end", "2026-12")),
				propertyValue(7, "date", new Document("precision", "day")
						.append("start", "2026-09-05").append("end", "2026-09-30")),
				propertyValue(8, "date", new Document("precision", "datetime")
						.append("start", "2026-09-05T09:30:00+09:00").append("end", null)
						.append("timezone", "Asia/Seoul")),
				propertyValue(9, "url", "https://example.com"),
				propertyValue(10, "email", "career@example.com"),
				propertyValue(11, "phone", "+82-10-1234-5678"),
				propertyValue(12, "file", List.of(ASSET_ID)),
				propertyValue(13, "media", List.of(ASSET_ID)));
	}

	private static Document propertyValue(int suffix, String type, Object value) {
		return new Document("propertyDefinitionId", id(suffix))
				.append("type", type)
				.append("value", value);
	}

	private static String id(int suffix) {
		return "10000000-0000-4000-8000-%012d".formatted(suffix);
	}

	private void insertIdentity(String userId, String tokenHash) {
		mongoTemplate.getCollection(USERS).insertOne(new Document("_id", userId)
				.append("email", userId + "@example.com")
				.append("displayName", "수정 테스트 사용자")
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

}
