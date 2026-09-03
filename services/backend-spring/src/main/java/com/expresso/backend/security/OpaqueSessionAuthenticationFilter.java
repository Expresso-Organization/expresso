package com.expresso.backend.security;

import java.io.IOException;
import java.util.List;
import java.util.Objects;
import java.util.regex.Pattern;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

import org.springframework.http.HttpHeaders;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.filter.OncePerRequestFilter;

import com.expresso.backend.identity.application.OpaqueSessionAuthenticator;

public class OpaqueSessionAuthenticationFilter extends OncePerRequestFilter {

	private static final Pattern BEARER_PATTERN = Pattern.compile(
			"^Bearer (exps_[A-Za-z0-9_-]{43})$",
			Pattern.CASE_INSENSITIVE);

	private final OpaqueSessionAuthenticator sessionAuthenticator;

	public OpaqueSessionAuthenticationFilter(OpaqueSessionAuthenticator sessionAuthenticator) {
		this.sessionAuthenticator = Objects.requireNonNull(
				sessionAuthenticator,
				"sessionAuthenticator는 null일 수 없습니다");
	}

	@Override
	protected void doFilterInternal(
			HttpServletRequest request,
			HttpServletResponse response,
			FilterChain filterChain) throws ServletException, IOException {
		if (SecurityContextHolder.getContext().getAuthentication() == null) {
			var accessToken = resolveAccessToken(request.getHeader(HttpHeaders.AUTHORIZATION));
			if (accessToken != null) {
				sessionAuthenticator.authenticate(accessToken).ifPresent(userId -> {
					var principal = new AuthenticatedUserPrincipal(userId);
					var authentication = UsernamePasswordAuthenticationToken.authenticated(
							principal,
							null,
							List.of());
					SecurityContextHolder.getContext().setAuthentication(authentication);
				});
			}
		}
		filterChain.doFilter(request, response);
	}

	private static String resolveAccessToken(String authorization) {
		if (authorization == null) {
			return null;
		}
		var match = BEARER_PATTERN.matcher(authorization);
		return match.matches() ? match.group(1) : null;
	}

}
