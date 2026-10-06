package com.expresso.backend.security;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.Map;
import java.util.Objects;
import java.util.UUID;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.security.core.AuthenticationException;
import org.springframework.security.web.AuthenticationEntryPoint;
import org.springframework.stereotype.Component;

import tools.jackson.databind.ObjectMapper;

@Component
public class ApiAuthenticationEntryPoint implements AuthenticationEntryPoint {

	private final ObjectMapper objectMapper;

	public ApiAuthenticationEntryPoint(ObjectMapper objectMapper) {
		this.objectMapper = Objects.requireNonNull(objectMapper, "objectMapper는 null일 수 없습니다");
	}

	@Override
	public void commence(
			HttpServletRequest request,
			HttpServletResponse response,
			AuthenticationException authenticationException) throws IOException {
		var requestId = request.getRequestId();
		if (requestId == null || requestId.isBlank()) {
			requestId = UUID.randomUUID().toString();
		}
		response.setStatus(HttpServletResponse.SC_UNAUTHORIZED);
		response.setCharacterEncoding(StandardCharsets.UTF_8.name());
		response.setContentType(MediaType.APPLICATION_JSON_VALUE);
		response.setHeader(HttpHeaders.WWW_AUTHENTICATE, "Bearer");
		response.setHeader("x-request-id", requestId);
		objectMapper.writeValue(response.getOutputStream(), Map.of(
				"error", Map.of(
						"code", "AUTH_REQUIRED",
						"message", "Authentication required",
						"requestId", requestId)));
	}

}
