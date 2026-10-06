package com.expresso.backend.identity.infrastructure.mongo;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.Date;

import org.bson.Document;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.data.mongodb.core.MongoTemplate;

import com.expresso.backend.TestcontainersConfiguration;

@Import(TestcontainersConfiguration.class)
@SpringBootTest
class MongoOpaqueSessionAuthenticatorTest {

	private static final String SESSIONS = "identity_sessions";
	private static final String USERS = "users";
	private static final String ACCESS_TOKEN = "exps_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
	private static final String TOKEN_HASH = "74b2c367c4d415397a6bc46772e8af855235d2c0866bc7dbefdbc2105fde56fc";
	private static final String USER_ID = "bc2f9791-0bb1-4a31-a23d-ea720f31284d";
	private static final String SESSION_ID = "10ecce84-8d6b-4b76-87de-ec76729f9b90";
	private static final Instant NOW = Instant.parse("2026-09-03T05:00:00Z");

	@Autowired
	private MongoTemplate mongoTemplate;

	private MongoOpaqueSessionAuthenticator authenticator;

	@BeforeEach
	void setUp() {
		mongoTemplate.getCollection(SESSIONS).deleteMany(new Document());
		mongoTemplate.getCollection(USERS).deleteMany(new Document());
		authenticator = new MongoOpaqueSessionAuthenticator(
				mongoTemplate,
				Clock.fixed(NOW, ZoneOffset.UTC));
	}

	@Test
	void authenticatesAValidSessionAndReturnsItsExactUserId() {
		insertActiveUser();
		insertSession(Date.from(NOW.plusSeconds(60)), null, TOKEN_HASH);

		var authenticatedUserId = authenticator.authenticate(ACCESS_TOKEN);

		assertEquals(USER_ID, authenticatedUserId.orElseThrow());
		var stored = mongoTemplate.getCollection(SESSIONS).find(new Document("_id", SESSION_ID)).first();
		assertEquals(Date.from(NOW), stored.getDate("lastSeenAt"));
	}

	@Test
	void rejectsAMalformedTokenEvenIfItsHashExists() {
		insertActiveUser();
		insertSession(
				Date.from(NOW.plusSeconds(60)),
				null,
				"9280312c4f9ace6158010ea83cca69a734dacd3f574060e2f5caae757da12b79");

		assertTrue(authenticator.authenticate("not-a-session").isEmpty());
	}

	@Test
	void rejectsANonexistentSession() {
		insertActiveUser();

		assertTrue(authenticator.authenticate(ACCESS_TOKEN).isEmpty());
	}

	@Test
	void rejectsAnExpiredSession() {
		insertActiveUser();
		insertSession(Date.from(NOW.minusSeconds(1)), null, TOKEN_HASH);

		assertTrue(authenticator.authenticate(ACCESS_TOKEN).isEmpty());
	}

	@Test
	void rejectsARevokedSession() {
		insertActiveUser();
		insertSession(Date.from(NOW.plusSeconds(60)), Date.from(NOW.minusSeconds(1)), TOKEN_HASH);

		assertTrue(authenticator.authenticate(ACCESS_TOKEN).isEmpty());
	}

	@Test
	void rejectsASessionWhoseUserDoesNotExist() {
		insertSession(Date.from(NOW.plusSeconds(60)), null, TOKEN_HASH);

		assertTrue(authenticator.authenticate(ACCESS_TOKEN).isEmpty());
	}

	@Test
	void rejectsASessionWhoseUserIsPendingDeletion() {
		insertUser(Date.from(NOW.minusSeconds(1)));
		insertSession(Date.from(NOW.plusSeconds(60)), null, TOKEN_HASH);

		assertTrue(authenticator.authenticate(ACCESS_TOKEN).isEmpty());
	}

	private void insertActiveUser() {
		insertUser(null);
	}

	private void insertUser(Date deletionRequestedAt) {
		mongoTemplate.getCollection(USERS).insertOne(new Document("_id", USER_ID)
				.append("email", "career-auth@example.com")
				.append("displayName", "인증 사용자")
				.append("planId", "ea9b17b9-0a6a-42c3-8f0c-86801bc9e313")
				.append("passwordHash", null)
				.append("deletionRequestedAt", deletionRequestedAt)
				.append("createdAt", Date.from(NOW.minusSeconds(3_600)))
				.append("lifecycleVersion", 0));
	}

	private void insertSession(Date expiresAt, Date revokedAt, String tokenHash) {
		mongoTemplate.getCollection(SESSIONS).insertOne(new Document("_id", SESSION_ID)
				.append("userId", USER_ID)
				.append("tokenHash", tokenHash)
				.append("expiresAt", expiresAt)
				.append("revokedAt", revokedAt)
				.append("lastSeenAt", null)
				.append("createdAt", Date.from(NOW.minusSeconds(300))));
	}

}
