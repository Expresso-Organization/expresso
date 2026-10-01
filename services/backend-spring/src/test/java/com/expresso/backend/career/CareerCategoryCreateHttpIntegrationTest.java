package com.expresso.backend.career;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.Date;
import java.util.List;
import java.util.UUID;

import org.bson.Document;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.context.annotation.Primary;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.data.mongodb.core.MongoTemplate;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.MockMvc;

import com.expresso.backend.TestcontainersConfiguration;

@Import({ TestcontainersConfiguration.class, CareerCategoryCreateHttpIntegrationTest.TestClockConfiguration.class })
@AutoConfigureMockMvc
@SpringBootTest
@TestPropertySource(properties = "spring.data.mongodb.auto-index-creation=false")
class CareerCategoryCreateHttpIntegrationTest {

	private static final String USER_ID = "10000000-0000-4000-8000-000000000001";
	private static final String SUPPLIED_PROPERTY_ID = "10000000-0000-4000-8000-000000000002";
	private static final String TOKEN = "exps_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
	private static final String TOKEN_HASH = "74b2c367c4d415397a6bc46772e8af855235d2c0866bc7dbefdbc2105fde56fc";
	private static final Instant NOW = Instant.parse("2026-09-26T06:00:00Z");

	@Autowired MockMvc mockMvc;
	@Autowired MongoTemplate mongoTemplate;

	@BeforeEach
	void prepare() {
		for (var collection : List.of(
				"career_records", "career_categories", "career_views", "outbox_events",
				"identity_sessions", "users")) {
			mongoTemplate.getCollection(collection).deleteMany(new Document());
		}
		mongoTemplate.getCollection("users").insertOne(new Document("_id", USER_ID)
				.append("email", "category-create@example.com")
				.append("displayName", "카테고리 생성 사용자")
				.append("planId", "ea9b17b9-0a6a-42c3-8f0c-86801bc9e313")
				.append("passwordHash", null)
				.append("deletionRequestedAt", null)
				.append("createdAt", Date.from(NOW))
				.append("lifecycleVersion", 0));
		mongoTemplate.getCollection("identity_sessions").insertOne(new Document("_id", UUID.randomUUID().toString())
				.append("userId", USER_ID)
				.append("tokenHash", TOKEN_HASH)
				.append("expiresAt", Date.from(NOW.plusSeconds(3600)))
				.append("revokedAt", null)
				.append("lastSeenAt", null)
				.append("createdAt", Date.from(NOW)));
	}

	@Test
	void createsOneCompleteCustomCategoryWithTheFastifyStorageAndWireSemantics() throws Exception {
		mockMvc.perform(post("/v1/career/categories")
				.header(HttpHeaders.AUTHORIZATION, "Bearer " + TOKEN)
				.contentType(MediaType.APPLICATION_JSON)
				.content("""
						{
						  "key": "custom_projects",
						  "name": "  사용자 프로젝트  ",
						  "icon": "  sparkles  ",
						  "defaultView": "gallery",
						  "propertySchema": {
						    "impact": {
						      "id": "%s",
						      "label": "성과",
						      "type": "number",
						      "required": false,
						      "system": false
						    },
						    "tools": {
						      "label": "도구",
						      "type": "tags"
						    }
						  }
						}
						""".formatted(SUPPLIED_PROPERTY_ID)))
				.andExpect(status().isCreated())
				.andExpect(header().string(HttpHeaders.ETAG, "\"v1\""))
				.andExpect(jsonPath("$.data.id").isNotEmpty())
				.andExpect(jsonPath("$.data.key").value("custom_projects"))
				.andExpect(jsonPath("$.data.name").value("사용자 프로젝트"))
				.andExpect(jsonPath("$.data.icon").value("sparkles"))
				.andExpect(jsonPath("$.data.defaultView").value("gallery"))
				.andExpect(jsonPath("$.data.isSystem").value(false))
				.andExpect(jsonPath("$.data.propertySchema.impact.id").value(SUPPLIED_PROPERTY_ID))
				.andExpect(jsonPath("$.data.propertySchemaV2[0].id").value(SUPPLIED_PROPERTY_ID))
				.andExpect(jsonPath("$.data.propertySchemaV2[0].type").value("number"))
				.andExpect(jsonPath("$.data.propertySchemaV2[1].type").value("multi_select"))
				.andExpect(jsonPath("$.data.schemaVersion").value(1))
				.andExpect(jsonPath("$.data.sortOrder").value(7))
				.andExpect(jsonPath("$.data.recordCount").value(0))
				.andExpect(jsonPath("$.data.version").value(1));

		var stored = mongoTemplate.getCollection("career_categories")
				.find(new Document("userId", USER_ID).append("key", "custom_projects")).first();
		assertThat(stored).isNotNull();
		assertThat(stored.getString("_id")).matches("^[0-9a-f-]{36}$");
		assertThat(stored.getString("name")).isEqualTo("사용자 프로젝트");
		assertThat(stored.getString("icon")).isEqualTo("sparkles");
		assertThat(stored.getBoolean("isSystem")).isFalse();
		assertThat(stored.getInteger("sortOrder")).isEqualTo(7);
		assertThat(stored.get("version", Number.class).longValue()).isEqualTo(1);
		assertThat(stored.get("schemaVersion", Number.class).longValue()).isEqualTo(1);
		assertThat(stored.getDate("updatedAt")).isEqualTo(Date.from(NOW));
		assertThat(stored.containsKey("createdAt")).isFalse();

		var legacy = stored.get("propertySchema", Document.class);
		var impact = legacy.get("impact", Document.class);
		var tools = legacy.get("tools", Document.class);
		assertThat(impact.getString("id")).isEqualTo(SUPPLIED_PROPERTY_ID);
		assertThat(tools.getString("id")).isNotBlank();
		assertThat(tools.getBoolean("required")).isFalse();
		assertThat(tools.getBoolean("system")).isFalse();
		assertThat(stored.getList("propertySchemaV2", Document.class)).hasSize(2);
		assertThat(stored.getList("propertyDefinitions", Document.class)).hasSize(2);
		assertThat(stored.getList("propertySchemaV2", Document.class)).allMatch(
				definition -> !"title".equals(definition.getString("type")));
		assertThat(stored.getList("propertyDefinitions", Document.class)).allMatch(
				definition -> !"title".equals(definition.getString("type")));
		assertThat(mongoTemplate.getCollection("career_records").countDocuments()).isZero();
		assertThat(mongoTemplate.getCollection("career_views").countDocuments()).isZero();
		assertThat(mongoTemplate.getCollection("outbox_events").countDocuments()).isZero();
	}

	@Test
	void rejectsInvalidOrDuplicateRequestsWithoutCreatingAnotherCategory() throws Exception {
		var first = """
				{
				  "key":"duplicate_key",
				  "name":"첫 카테고리",
				  "icon":"folder",
				  "defaultView":"table"
				}
				""";
		mockMvc.perform(post("/v1/career/categories")
				.header(HttpHeaders.AUTHORIZATION, "Bearer " + TOKEN)
				.contentType(MediaType.APPLICATION_JSON).content(first))
				.andExpect(status().isCreated());
		mockMvc.perform(post("/v1/career/categories")
				.header(HttpHeaders.AUTHORIZATION, "Bearer " + TOKEN)
				.contentType(MediaType.APPLICATION_JSON).content(first.replace("첫 카테고리", "중복 카테고리")))
				.andExpect(status().isConflict());
		mockMvc.perform(post("/v1/career/categories")
				.header(HttpHeaders.AUTHORIZATION, "Bearer " + TOKEN)
				.contentType(MediaType.APPLICATION_JSON)
				.content(first.replace("duplicate_key", "Invalid-Key")))
				.andExpect(status().isBadRequest());
		assertThat(mongoTemplate.getCollection("career_categories")
				.countDocuments(new Document("userId", USER_ID))).isEqualTo(1);
	}

	@TestConfiguration(proxyBeanMethods = false)
	static class TestClockConfiguration {
		@Bean
		@Primary
		Clock categoryCreateClock() {
			return Clock.fixed(NOW, ZoneOffset.UTC);
		}
	}
}
