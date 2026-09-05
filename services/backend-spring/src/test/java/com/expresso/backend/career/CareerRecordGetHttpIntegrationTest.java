package com.expresso.backend.career;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.nio.charset.StandardCharsets;
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
import org.springframework.test.web.servlet.MvcResult;

import com.expresso.backend.TestcontainersConfiguration;

@Import(TestcontainersConfiguration.class)
@AutoConfigureMockMvc
@SpringBootTest
class CareerRecordGetHttpIntegrationTest {

	private static final String RECORDS = "career_records";
	private static final String SESSIONS = "identity_sessions";
	private static final String USERS = "users";
	private static final String USER_ID = "bc2f9791-0bb1-4a31-a23d-ea720f31284d";
	private static final String OTHER_USER_ID = "945969f8-c8e5-469b-8119-bab71fa5aa60";
	private static final String ACCESS_TOKEN = "exps_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
	private static final String TOKEN_HASH = "74b2c367c4d415397a6bc46772e8af855235d2c0866bc7dbefdbc2105fde56fc";
	private static final String RECORD_ID = "10ecce84-8d6b-4b76-87de-ec76729f9b90";
	private static final String MISSING_RECORD_ID = "45e37ac7-076e-4cd0-a932-e723a7c650af";
	private static final String CATEGORY_ID = "475106fc-bf88-4a73-9c27-66c648733936";
	private static final String PROPERTY_DEFINITION_ID = "fd1061b5-d8db-5a5a-8855-51530c98db3f";
	private static final String PARAGRAPH_ID = "fb122c86-7db8-41c3-a9d9-7a12c4758b08";
	private static final Instant UPDATED_AT = Instant.parse("2026-09-03T08:15:30.123Z");

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
	void returnsOwnedCanonicalRecordAndStrongEtagWhileIgnoringLegacyValues() throws Exception {
		mongoTemplate.getCollection(RECORDS).insertOne(canonicalRecord(USER_ID, 7)
				.append("properties", new Document("role", "Legacy property"))
				.append("bodyMd", "Legacy body"));

		authenticatedGet(RECORD_ID)
				.andExpect(status().isOk())
				.andExpect(header().string(HttpHeaders.ETAG, "\"v7\""))
				.andExpect(jsonPath("$.data.id").value(RECORD_ID))
				.andExpect(jsonPath("$.data.categoryId").value(CATEGORY_ID))
				.andExpect(jsonPath("$.data.title").value("Canonical title"))
				.andExpect(jsonPath("$.data.propertyValues[0].propertyDefinitionId")
						.value(PROPERTY_DEFINITION_ID))
				.andExpect(jsonPath("$.data.propertyValues[0].type").value("text"))
				.andExpect(jsonPath("$.data.propertyValues[0].value").value("Canonical property"))
				.andExpect(jsonPath("$.data.blockBody.schemaVersion").value(1))
				.andExpect(jsonPath("$.data.blockBody.type").value("doc"))
				.andExpect(jsonPath("$.data.blockBody.content[0].id").value(PARAGRAPH_ID))
				.andExpect(jsonPath("$.data.blockBody.content[0].type").value("paragraph"))
				.andExpect(jsonPath("$.data.blockBody.content[0].attrs").isMap())
				.andExpect(jsonPath("$.data.blockBody.content[0].text[0].text").value("Canonical body"))
				.andExpect(jsonPath("$.data.version").value(7))
				.andExpect(jsonPath("$.data.updatedAt").value(UPDATED_AT.toString()))
				.andExpect(jsonPath("$.data.properties").doesNotExist())
				.andExpect(jsonPath("$.data.bodyMd").doesNotExist())
				.andExpect(jsonPath("$.data.status").doesNotExist())
				.andExpect(jsonPath("$.data.origin").doesNotExist());
	}

	@Test
	void returnsRecursiveRichAndUnknownBlocksWithoutUsingLegacyBody() throws Exception {
		var record = canonicalRecord(USER_ID, 7);
		record.put("blockBody", CareerRichBlockBodyTestFixture.richAndUnknownBody());
		record.put("bodyMd", "이 legacy 본문은 응답에 사용하면 안 됩니다");
		mongoTemplate.getCollection(RECORDS).insertOne(record);

		authenticatedGet(RECORD_ID)
				.andExpect(status().isOk())
				.andExpect(header().string(HttpHeaders.ETAG, "\"v7\""))
				.andExpect(jsonPath("$.data.blockBody.content[0].type").value("heading1"))
				.andExpect(jsonPath("$.data.blockBody.content[0].attrs.sourceMarkdown").value("# 결제 안정화"))
				.andExpect(jsonPath("$.data.blockBody.content[0].text[0].marks[0].type").value("bold"))
				.andExpect(jsonPath("$.data.blockBody.content[1].content[0].content[0].text[0].text")
						.value("장애율을 30% 낮춤"))
				.andExpect(jsonPath("$.data.blockBody.content[8].type").value("future.timeline"))
				.andExpect(jsonPath("$.data.blockBody.content[8].attrs.nullable").value(org.hamcrest.Matchers.nullValue()))
				.andExpect(jsonPath("$.data.blockBody.content[8].attrs.layout.axis.position").value("top"))
				.andExpect(jsonPath("$.data.blockBody.content[8].text[0].marks[0].attrs.future").value(true))
				.andExpect(jsonPath("$.data.bodyMd").doesNotExist());
	}

	@Test
	void returnsTheSamePublicNotFoundMeaningForMissingAndOtherUsersRecords() throws Exception {
		mongoTemplate.getCollection(RECORDS).insertOne(canonicalRecord(OTHER_USER_ID, 1));

		var missing = authenticatedGet(MISSING_RECORD_ID)
				.andExpect(status().isNotFound())
				.andReturn();
		var otherUsers = authenticatedGet(RECORD_ID)
				.andExpect(status().isNotFound())
				.andReturn();

		assertThat(publicError(missing)).isEqualTo(publicError(otherUsers));
		assertThat(publicError(missing)).isEqualTo(new Document()
				.append("code", "NOT_FOUND")
				.append("message", "Resource not found"));
	}

	@Test
	void hidesLegacyOnlyRecordWithoutConvertingIt() throws Exception {
		var legacyOnly = baseRecord(USER_ID, 1)
				.append("properties", new Document("role", "Legacy property"))
				.append("bodyMd", "Legacy body");
		mongoTemplate.getCollection(RECORDS).insertOne(legacyOnly);

		authenticatedGet(RECORD_ID)
				.andExpect(status().isNotFound())
				.andExpect(jsonPath("$.error.code").value("NOT_FOUND"));
	}

	@Test
	void exposesPartialCanonicalRecordAsInternalDataError() throws Exception {
		var partial = baseRecord(USER_ID, 1)
				.append("propertyValues", List.of())
				.append("properties", new Document())
				.append("bodyMd", "");
		mongoTemplate.getCollection(RECORDS).insertOne(partial);

		assertInternalError(authenticatedGet(RECORD_ID).andReturn());
	}

	@Test
	void exposesMalformedCanonicalRecordAsInternalDataError() throws Exception {
		var malformed = canonicalRecord(USER_ID, 1);
		malformed.get("blockBody", Document.class).put("content", List.of(new Document()
				.append("id", PARAGRAPH_ID)
				.append("type", "paragraph")
				.append("attrs", new Document())
				.append("content", List.of(new Document()
						.append("id", "c2ae930e-5c93-4488-9652-60c388d5e590")
						.append("type", "paragraph")
						.append("attrs", new Document())))));
		mongoTemplate.getCollection(RECORDS).insertOne(malformed);

		assertInternalError(authenticatedGet(RECORD_ID).andReturn());
	}

	@Test
	void rejectsInvalidRecordIdAndRequiresAuthentication() throws Exception {
		authenticatedGet("not-a-uuid")
				.andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.error.code").value("VALIDATION_ERROR"));

		mockMvc.perform(get("/v1/career/records/{recordId}", RECORD_ID))
				.andExpect(status().isUnauthorized())
				.andExpect(jsonPath("$.error.code").value("AUTH_REQUIRED"));
	}

	private org.springframework.test.web.servlet.ResultActions authenticatedGet(String recordId) throws Exception {
		return mockMvc.perform(get("/v1/career/records/{recordId}", recordId)
				.header(HttpHeaders.AUTHORIZATION, "Bearer " + ACCESS_TOKEN));
	}

	private static void assertInternalError(MvcResult result) {
		assertThat(result.getResponse().getStatus()).isEqualTo(500);
		assertThat(publicError(result)).isEqualTo(new Document()
				.append("code", "INTERNAL_ERROR")
				.append("message", "Internal server error"));
	}

	private static Document publicError(MvcResult result) {
		var responseJson = new String(result.getResponse().getContentAsByteArray(), StandardCharsets.UTF_8);
		var error = Document.parse(responseJson).get("error", Document.class);
		return new Document("code", error.getString("code"))
				.append("message", error.getString("message"));
	}

	private static Document canonicalRecord(String ownerId, long version) {
		return baseRecord(ownerId, version)
				.append("propertyValues", List.of(new Document()
						.append("propertyDefinitionId", PROPERTY_DEFINITION_ID)
						.append("type", "text")
						.append("value", "Canonical property")))
				.append("blockBody", new Document()
						.append("schemaVersion", 1)
						.append("type", "doc")
						.append("content", List.of(new Document()
								.append("id", PARAGRAPH_ID)
								.append("type", "paragraph")
								.append("attrs", new Document())
								.append("text", List.of(new Document("text", "Canonical body"))))))
				.append("editorSchemaVersion", 1)
				.append("properties", new Document())
				.append("bodyMd", "");
	}

	private static Document baseRecord(String ownerId, long version) {
		return new Document("_id", RECORD_ID)
				.append("userId", ownerId)
				.append("categoryId", CATEGORY_ID)
				.append("title", "Canonical title")
				.append("status", "draft")
				.append("origin", "manual")
				.append("version", version)
				.append("updatedAt", Date.from(UPDATED_AT))
				.append("deletedAt", null)
				.append("purgeAfter", null);
	}

	private void insertIdentity() {
		mongoTemplate.getCollection(USERS).insertOne(new Document("_id", USER_ID)
				.append("email", "career-get@example.com")
				.append("displayName", "조회 테스트 사용자")
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
