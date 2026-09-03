package com.expresso.backend.identity.application;

import java.util.Optional;

public interface OpaqueSessionAuthenticator {

	Optional<String> authenticate(String accessToken);

}
