package com.expresso.backend.identity.infrastructure.mongo;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Clock;
import java.util.HexFormat;
import java.util.Objects;
import java.util.Optional;
import java.util.regex.Pattern;

import org.bson.Document;
import org.springframework.data.mongodb.core.FindAndModifyOptions;
import org.springframework.data.mongodb.core.MongoTemplate;
import org.springframework.data.mongodb.core.query.Criteria;
import org.springframework.data.mongodb.core.query.Query;
import org.springframework.data.mongodb.core.query.Update;
import org.springframework.stereotype.Repository;

import com.expresso.backend.identity.application.OpaqueSessionAuthenticator;

@Repository
public class MongoOpaqueSessionAuthenticator implements OpaqueSessionAuthenticator {

	private static final String SESSIONS = "identity_sessions";
	private static final String USERS = "users";
	private static final Pattern ACCESS_TOKEN_PATTERN = Pattern.compile("^exps_[A-Za-z0-9_-]{43}$");

	private final MongoTemplate mongoTemplate;
	private final Clock clock;

	public MongoOpaqueSessionAuthenticator(MongoTemplate mongoTemplate, Clock clock) {
		this.mongoTemplate = Objects.requireNonNull(mongoTemplate, "mongoTemplate은 null일 수 없습니다");
		this.clock = Objects.requireNonNull(clock, "clock은 null일 수 없습니다");
	}

	@Override
	public Optional<String> authenticate(String accessToken) {
		Objects.requireNonNull(accessToken, "accessToken은 null일 수 없습니다");
		if (!ACCESS_TOKEN_PATTERN.matcher(accessToken).matches()) {
			return Optional.empty();
		}

		var now = java.util.Date.from(clock.instant());
		var sessionQuery = Query.query(Criteria.where("tokenHash").is(hash(accessToken))
				.and("revokedAt").is(null)
				.and("expiresAt").gt(now));
		var session = mongoTemplate.findAndModify(
				sessionQuery,
				new Update().set("lastSeenAt", now),
				FindAndModifyOptions.options().returnNew(true),
				Document.class,
				SESSIONS);
		if (session == null) {
			return Optional.empty();
		}

		var userId = session.getString("userId");
		if (userId == null) {
			return Optional.empty();
		}
		var activeUserQuery = Query.query(Criteria.where("_id").is(userId)
				.and("deletionRequestedAt").is(null));
		return mongoTemplate.exists(activeUserQuery, USERS)
				? Optional.of(userId)
				: Optional.empty();
	}

	private static String hash(String accessToken) {
		try {
			var digest = MessageDigest.getInstance("SHA-256");
			return HexFormat.of().formatHex(digest.digest(accessToken.getBytes(StandardCharsets.UTF_8)));
		}
		catch (NoSuchAlgorithmException error) {
			throw new IllegalStateException("SHA-256 해시 알고리즘을 사용할 수 없습니다", error);
		}
	}

}
