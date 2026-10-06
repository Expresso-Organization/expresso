package com.expresso.backend;

import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.core.annotation.Order;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.web.SecurityFilterChain;

@TestConfiguration(proxyBeanMethods = false)
public class CareerTestSecurityConfiguration {

	@Bean
	@Order(0)
	SecurityFilterChain testSecurityFilterChain(HttpSecurity http) throws Exception {
		return http
				.securityMatcher("/v1/career/categories")
				.csrf(AbstractHttpConfigurer::disable)
				.authorizeHttpRequests(authorize -> authorize.anyRequest().permitAll())
				.build();
	}

}
