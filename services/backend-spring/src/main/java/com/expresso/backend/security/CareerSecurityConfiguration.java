package com.expresso.backend.security;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.annotation.Order;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;

import com.expresso.backend.identity.application.OpaqueSessionAuthenticator;

@Configuration(proxyBeanMethods = false)
public class CareerSecurityConfiguration {

	@Bean
	@Order(1)
	SecurityFilterChain careerSecurityFilterChain(
			HttpSecurity http,
			OpaqueSessionAuthenticator sessionAuthenticator,
			ApiAuthenticationEntryPoint authenticationEntryPoint) throws Exception {
		var authenticationFilter = new OpaqueSessionAuthenticationFilter(sessionAuthenticator);
		return http
				.securityMatcher("/v1/career/**")
				.csrf(AbstractHttpConfigurer::disable)
				.formLogin(AbstractHttpConfigurer::disable)
				.httpBasic(AbstractHttpConfigurer::disable)
				.logout(AbstractHttpConfigurer::disable)
				.requestCache(AbstractHttpConfigurer::disable)
				.sessionManagement(session -> session
						.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
				.exceptionHandling(exceptions -> exceptions
						.authenticationEntryPoint(authenticationEntryPoint))
				.authorizeHttpRequests(authorize -> authorize
						.anyRequest().authenticated())
				.addFilterBefore(authenticationFilter, UsernamePasswordAuthenticationFilter.class)
				.build();
	}

}
