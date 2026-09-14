package com.expresso.backend.career;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

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
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;

import com.expresso.backend.TestcontainersConfiguration;

import tools.jackson.databind.ObjectMapper;

@Import(TestcontainersConfiguration.class)
@AutoConfigureMockMvc
@SpringBootTest
class CareerCategoryMoveHttpIntegrationTest {

	private static final String USER_ID = "10000000-0000-4000-8000-000000000001";
	private static final String RECORD_ID = "10000000-0000-4000-8000-000000000002";
	private static final String SOURCE_ID = "10000000-0000-4000-8000-000000000003";
	private static final String TARGET_ID = "10000000-0000-4000-8000-000000000004";
	private static final String SOURCE_PROPERTY_ID = "10000000-0000-4000-8000-000000000005";
	private static final String TARGET_PROPERTY_ID = "10000000-0000-4000-8000-000000000006";
	private static final String TOKEN = "exps_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
	private static final String TOKEN_HASH = "74b2c367c4d415397a6bc46772e8af855235d2c0866bc7dbefdbc2105fde56fc";

	@Autowired MockMvc mockMvc;
	@Autowired MongoTemplate mongoTemplate;
	private final ObjectMapper objectMapper = new ObjectMapper();

	@BeforeEach
	void prepare() {
		for (var collection : List.of("career_records", "career_categories", "identity_sessions", "users", "outbox_events")) {
			mongoTemplate.getCollection(collection).deleteMany(new Document());
		}
		insertIdentity();
		mongoTemplate.getCollection("career_categories").insertMany(List.of(category(SOURCE_ID, SOURCE_PROPERTY_ID), category(TARGET_ID, TARGET_PROPERTY_ID)));
		mongoTemplate.getCollection("career_records").insertOne(record());
	}

	@Test
	void previewsAndCommitsACustomCategoryMoveWithoutRewritingLegacyProperties() throws Exception {
		var previewResult = mockMvc.perform(post("/v1/career/records/{recordId}/move/preview", RECORD_ID)
				.header(HttpHeaders.AUTHORIZATION, "Bearer " + TOKEN).contentType(MediaType.APPLICATION_JSON)
				.content("{\"targetCategoryId\":\"" + TARGET_ID + "\"}"))
				.andExpect(status().isOk()).andExpect(jsonPath("$.data.unmappedProperties").isEmpty())
				.andReturn();
		var previewToken = objectMapper.readTree(previewResult.getResponse().getContentAsString()).get("data").get("previewToken").asText();

		mockMvc.perform(post("/v1/career/records/{recordId}/move", RECORD_ID)
				.header(HttpHeaders.AUTHORIZATION, "Bearer " + TOKEN).header(HttpHeaders.IF_MATCH, "\"v1\"")
				.contentType(MediaType.APPLICATION_JSON).content("{\"targetCategoryId\":\"" + TARGET_ID
						+ "\",\"previewToken\":\"" + previewToken + "\",\"expectedVersion\":1,\"discardUnmappedPropertyIds\":[]}"))
				.andExpect(status().isOk()).andExpect(header().string(HttpHeaders.ETAG, "\"v2\""))
				.andExpect(jsonPath("$.data.categoryId").value(TARGET_ID));

		var stored = mongoTemplate.getCollection("career_records").find(new Document("_id", RECORD_ID)).first();
		assertThat(stored).isNotNull();
		assertThat(stored.get("properties", Document.class)).isEqualTo(new Document("legacy", "unchanged"));
		var payload = mongoTemplate.getCollection("outbox_events").find().first().get("payload", Document.class);
		assertThat(payload.getList("changedPropertyIds", String.class)).containsExactly(SOURCE_PROPERTY_ID, TARGET_PROPERTY_ID);
		assertThat(payload.get("sourcePropertyVersions", Document.class).keySet()).containsExactly(TARGET_PROPERTY_ID);
	}

	private static Document category(String id, String propertyId) {
		return new Document("_id", id).append("userId", USER_ID).append("isSystem", false).append("key", id).append("name", id)
				.append("schemaVersion", 1).append("version", 1).append("propertyDefinitions", List.of(new Document("id", propertyId)
						.append("key", "role").append("name", "역할").append("type", "text").append("required", false)
						.append("system", false).append("config", new Document()).append("order", 0).append("version", 1).append("deletedAt", null)));
	}

	private static Document record() {
		return new Document("_id", RECORD_ID).append("userId", USER_ID).append("categoryId", SOURCE_ID).append("title", "기록")
				.append("propertyValues", List.of(new Document("propertyDefinitionId", SOURCE_PROPERTY_ID).append("type", "text").append("value", "값")))
				.append("blockBody", new Document("schemaVersion", 1).append("type", "doc").append("content", List.of()))
				.append("properties", new Document("legacy", "unchanged")).append("bodyMd", "").append("status", "draft").append("origin", "manual")
				.append("version", 1).append("referenceVersion", 1).append("updatedAt", new Date()).append("deletedAt", null);
	}

	private void insertIdentity() {
		mongoTemplate.getCollection("users").insertOne(new Document("_id", USER_ID).append("email", "move@example.com")
				.append("displayName", "이동 사용자").append("planId", "ea9b17b9-0a6a-42c3-8f0c-86801bc9e313")
				.append("passwordHash", null).append("deletionRequestedAt", null).append("createdAt", new Date()).append("lifecycleVersion", 0));
		mongoTemplate.getCollection("identity_sessions").insertOne(new Document("_id", java.util.UUID.randomUUID().toString())
				.append("userId", USER_ID).append("tokenHash", TOKEN_HASH).append("expiresAt", Date.from(Instant.now().plusSeconds(600)))
				.append("revokedAt", null).append("lastSeenAt", null).append("createdAt", new Date()));
	}
}
