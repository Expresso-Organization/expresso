package com.expresso.backend.operations;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.*;
import org.springframework.core.annotation.Order;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.web.SecurityFilterChain;

@Configuration(proxyBeanMethods=false)
@Profile("operations")
class OperationsConfiguration {
    @Bean OperationsSettings operationsSettings(
            @Value("${server.address}") String address, @Value("${server.port}") int port,
            @Value("${career.runtime.mongo-uri}") String uri, @Value("${career.runtime.database}") String database,
            @Value("${career.runtime.replica-set}") String replicaSet,
            @Value("${career.writer.enabled}") String writer, @Value("${career.integration.enabled}") String integration,
            @Value("${career.writer.move-secret}") String move, @Value("${career.integration.ai-secret}") String ai,
            @Value("${career.integration.interview-secret}") String interview) {
        return new OperationsSettings(address, port, uri, database, replicaSet, writer, integration, move, ai, interview);
    }
    @Bean(destroyMethod="close") OperationsMongoReadiness operationsMongoReadiness(OperationsSettings settings) {
        return new OperationsMongoReadiness(settings);
    }
    @Bean @Order(0) SecurityFilterChain operationsHealthSecurity(HttpSecurity http) throws Exception {
        return stateless(http.securityMatcher("/health/live", "/health/ready"))
                .authorizeHttpRequests(auth -> auth.anyRequest().permitAll()).build();
    }
    @Bean @Order(10)
    @ConditionalOnProperty(name="career.writer.enabled", havingValue="false", matchIfMissing=true)
    SecurityFilterChain operationsDisabledWriterSecurity(HttpSecurity http) throws Exception {
        return stateless(http).authorizeHttpRequests(auth -> auth.anyRequest().denyAll())
                .exceptionHandling(errors -> errors.authenticationEntryPoint((request, response, error) -> response.setStatus(403))).build();
    }
    private HttpSecurity stateless(HttpSecurity http) {
        return http.csrf(csrf -> csrf.disable()).sessionManagement(s -> s.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
                .requestCache(cache -> cache.disable()).formLogin(form -> form.disable()).httpBasic(basic -> basic.disable())
                .logout(logout -> logout.disable());
    }
}
