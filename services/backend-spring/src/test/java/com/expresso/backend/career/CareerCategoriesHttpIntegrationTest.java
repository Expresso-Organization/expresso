package com.expresso.backend.career;

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
import com.mongodb.client.MongoCollection;

@Import({ TestcontainersConfiguration.class, CareerTestSecurityConfiguration.class })
@AutoConfigureMockMvc
@SpringBootTest
class CareerCategoriesHttpIntegrationTest {

	private static final String COLLECTION = "career_categories";
	private static final String EXPERIENCE_ID = "475106fc-bf88-4a73-9c27-66c648733936";
	private static final String PROJECT_ID = "af5510dc-9717-4f1e-b0f9-4afd79aafe0f";
	private static final String ROLE_DEFINITION_ID = "1c768bad-2c1f-5cee-86c5-a43574f0e256";

	@Autowired
	private MockMvc mockMvc;

	@Autowired
	private MongoTemplate mongoTemplate;

	@BeforeEach
	void clearCategories() {
		categories().deleteMany(new Document());
	}

	@Test
	void returnsOnlySystemCategoriesAndTextDefinitionsInTheOpenApiShape() throws Exception {
		var project = category(PROJECT_ID, "project", "프로젝트", true, 1, List.of());
		var custom = category("3f939b13-c553-4d46-90db-75390644bed5", "custom", "사용자", false, -1,
				List.of(textDefinition("7d177c17-906f-50ec-90d6-47c76554f011", "note", "메모")));
		var experience = category(EXPERIENCE_ID, "experience", "경험", true, 0, List.of(
				definition("60da6098-9aa8-5358-a82b-fdbd1421fddd", "skills", "기술", "tags"),
				textDefinition(ROLE_DEFINITION_ID, "role", "역할")));

		// 삽입 순서와 무관하게 기존 sortOrder, _id 정책으로 반환되어야 합니다.
		categories().insertMany(List.of(project, custom, experience));

		mockMvc.perform(get("/v1/career/categories"))
				.andExpect(status().isOk())
				.andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_JSON))
				.andExpect(content().json("""
						{
						  "data": [
						    {
						      "id": "475106fc-bf88-4a73-9c27-66c648733936",
						      "key": "experience",
						      "name": "경험",
						      "propertyDefinitions": [
						        {
						          "id": "1c768bad-2c1f-5cee-86c5-a43574f0e256",
						          "key": "role",
						          "label": "역할",
						          "type": "text",
						          "required": false,
						          "system": true
						        }
						      ]
						    },
						    {
						      "id": "af5510dc-9717-4f1e-b0f9-4afd79aafe0f",
						      "key": "project",
						      "name": "프로젝트",
						      "propertyDefinitions": []
						    }
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

	private static Document category(String id, String key, String name, boolean system, int sortOrder,
			List<Document> definitions) {
		return new Document("_id", id)
				.append("key", key)
				.append("name", name)
				.append("isSystem", system)
				.append("sortOrder", sortOrder)
				.append("propertyDefinitions", definitions)
				.append("icon", "legacy-icon")
				.append("defaultView", "table");
	}

	private static Document textDefinition(String id, String key, String label) {
		return definition(id, key, label, "text");
	}

	private static Document definition(String id, String key, String label, String type) {
		return new Document("id", id)
				.append("key", key)
				.append("label", label)
				.append("type", type)
				.append("required", false)
				.append("system", true);
	}

	private MongoCollection<Document> categories() {
		return mongoTemplate.getCollection(COLLECTION);
	}

}
