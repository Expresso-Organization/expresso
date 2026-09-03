package com.expresso.backend.security;

import java.security.Principal;
import java.util.Objects;

public record AuthenticatedUserPrincipal(String userId) implements Principal {

	public AuthenticatedUserPrincipal {
		Objects.requireNonNull(userId, "userId는 null일 수 없습니다");
	}

	@Override
	public String getName() {
		return userId;
	}

}
