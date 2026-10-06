package com.expresso.backend.security;

import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.not;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.time.Instant;
import java.util.Date;
import java.util.Map;

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
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.security.core.annotation.AuthenticationPrincipal;

import com.expresso.backend.TestcontainersConfiguration;

@Import({ TestcontainersConfiguration.class, CareerOpaqueSessionSecurityIntegrationTest.SecurityProbeController.class })
@AutoConfigureMockMvc
@SpringBootTest
class CareerOpaqueSessionSecurityIntegrationTest {

	private static final String SESSIONS = "identity_sessions";
	private static final String USERS = "users";
	private static final String ACCESS_TOKEN = "exps_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
	private static final String TOKEN_HASH = "74b2c367c4d415397a6bc46772e8af855235d2c0866bc7dbefdbc2105fde56fc";
	private static final String USER_ID = "bc2f9791-0bb1-4a31-a23d-ea720f31284d";
	private static final String SESSION_ID = "10ecce84-8d6b-4b76-87de-ec76729f9b90";

	@Autowired
	private MockMvc mockMvc;

	@Autowired
	private MongoTemplate mongoTemplate;

	@BeforeEach
	void clearIdentityData() {
		mongoTemplate.getCollection(SESSIONS).deleteMany(new Document());
		mongoTemplate.getCollection(USERS).deleteMany(new Document());
	}

	@Test
	void requiresBearerAuthenticationForTheProductionCareerCategoriesEndpoint() throws Exception {
		expectAuthRequired(mockMvc.perform(get("/v1/career/categories")));
	}

	@Test
	void givesMalformedAndUnknownCredentialsTheSamePublicAuthenticationFailure() throws Exception {
		expectAuthRequired(mockMvc.perform(get("/v1/career/security-probe")
				.header(HttpHeaders.AUTHORIZATION, "Bearer secret-invalid-token")))
				.andExpect(content().string(not(containsString("secret-invalid-token"))));

		expectAuthRequired(mockMvc.perform(get("/v1/career/security-probe")
				.header(HttpHeaders.AUTHORIZATION,
						"Bearer exps_BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB")));
	}

	@Test
	void doesNotRevealWhetherASessionIsExpiredOrRevoked() throws Exception {
		insertActiveUser();
		insertSession(Date.from(Instant.now().minusSeconds(60)), null);
		expectAuthRequired(authenticatedProbe());

		mongoTemplate.getCollection(SESSIONS).deleteMany(new Document());
		insertSession(Date.from(Instant.now().plusSeconds(60)), new Date());
		expectAuthRequired(authenticatedProbe());
	}

	@Test
	void exposesTheExactSessionUserIdAsAnAuthenticationPrincipal() throws Exception {
		insertActiveUser();
		insertSession(Date.from(Instant.now().plusSeconds(60)), null);

		authenticatedProbe()
				.andExpect(status().isOk())
				.andExpect(content().json("{\"userId\":\"" + USER_ID + "\"}"));
	}

	@Test
	void leavesRequestsOutsideTheCareerApiOutsideThisSecurityChain() throws Exception {
		insertActiveUser();
		insertSession(Date.from(Instant.now().plusSeconds(60)), null);

		mockMvc.perform(get("/security-scope-probe")
				.header(HttpHeaders.AUTHORIZATION, "Bearer " + ACCESS_TOKEN))
				.andExpect(status().isOk())
				.andExpect(content().string("outside-career:anonymous"));
	}

	private ResultActions authenticatedProbe() throws Exception {
		return mockMvc.perform(get("/v1/career/security-probe")
				.header(HttpHeaders.AUTHORIZATION, "Bearer " + ACCESS_TOKEN));
	}

	private static ResultActions expectAuthRequired(ResultActions result) throws Exception {
		return result
				.andExpect(status().isUnauthorized())
				.andExpect(header().exists("x-request-id"))
				.andExpect(content().contentTypeCompatibleWith("application/json"))
				.andExpect(jsonPath("$.error.code").value("AUTH_REQUIRED"))
				.andExpect(jsonPath("$.error.message").value("Authentication required"))
				.andExpect(jsonPath("$.error.requestId").isNotEmpty());
	}

	private void insertActiveUser() {
		mongoTemplate.getCollection(USERS).insertOne(new Document("_id", USER_ID)
				.append("email", "career-security@example.com")
				.append("displayName", "보안 테스트 사용자")
				.append("planId", "ea9b17b9-0a6a-42c3-8f0c-86801bc9e313")
				.append("passwordHash", null)
				.append("deletionRequestedAt", null)
				.append("createdAt", new Date())
				.append("lifecycleVersion", 0));
	}

	private void insertSession(Date expiresAt, Date revokedAt) {
		mongoTemplate.getCollection(SESSIONS).insertOne(new Document("_id", SESSION_ID)
				.append("userId", USER_ID)
				.append("tokenHash", TOKEN_HASH)
				.append("expiresAt", expiresAt)
				.append("revokedAt", revokedAt)
				.append("lastSeenAt", null)
				.append("createdAt", new Date()));
	}

	@RestController
	static class SecurityProbeController {

		@GetMapping("/v1/career/security-probe")
		Map<String, String> authenticatedUser(
				@AuthenticationPrincipal AuthenticatedUserPrincipal principal) {
			return Map.of("userId", principal.userId());
		}

		@GetMapping("/security-scope-probe")
		String outsideCareer(@AuthenticationPrincipal AuthenticatedUserPrincipal principal) {
			return "outside-career:" + (principal == null ? "anonymous" : principal.userId());
		}
	}

}
