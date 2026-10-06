package com.expresso.backend.identity;

import java.time.Clock;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration(proxyBeanMethods = false)
public class IdentityConfiguration {

	@Bean
	Clock identityClock() {
		return Clock.systemUTC();
	}

}
