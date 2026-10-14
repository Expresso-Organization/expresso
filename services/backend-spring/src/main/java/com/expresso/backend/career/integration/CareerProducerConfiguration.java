package com.expresso.backend.career.integration;

import java.io.IOException;
import java.time.Clock;
import java.util.List;
import jakarta.servlet.*;
import jakarta.servlet.http.*;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.*;
import org.springframework.context.annotation.*;
import org.springframework.core.annotation.Order;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;
import org.springframework.web.filter.OncePerRequestFilter;
import tools.jackson.databind.json.JsonMapper;
import com.expresso.backend.career.application.*;
import com.expresso.backend.career.http.CareerCommandErrors;
import com.expresso.backend.career.infrastructure.mongo.MongoCareerCommandRepository;

@Configuration(proxyBeanMethods=false)
@ConditionalOnProperty(name={"career.writer.enabled","career.integration.enabled"},havingValue="true")
public class CareerProducerConfiguration {
    @Bean CareerProducerCredentials careerProducerCredentials(@Value("${career.integration.ai-secret}") String aiSecret,@Value("${career.integration.interview-secret}") String interviewSecret,Clock clock) {return new CareerProducerCredentials(aiSecret,interviewSecret,clock);}
    @Bean CareerProducerBusinessService careerProducerBusiness(MongoCareerCommandRepository repository,Clock clock,@Value("${career.writer.move-secret}") String secret) {return new CareerProducerBusinessService(repository,clock,new CareerMoveTokens(secret));}
    @Bean @Order(1) @ConditionalOnWebApplication(type=ConditionalOnWebApplication.Type.SERVLET)
    SecurityFilterChain careerProducerSecurity(HttpSecurity http,CareerProducerCredentials credentials) throws Exception {
        var json=JsonMapper.builder().build();
        var filter=new OncePerRequestFilter() {
            @Override protected void doFilterInternal(HttpServletRequest request,HttpServletResponse response,FilterChain chain) throws ServletException,IOException {
                try {
                    var header=request.getHeader("Authorization");
                    if(header==null || !header.regionMatches(true,0,"Bearer ",0,7)) throw new CareerCommandException(401,"UNAUTHENTICATED");
                    var actor=credentials.authenticate(header.substring(7));
                    SecurityContextHolder.getContext().setAuthentication(new UsernamePasswordAuthenticationToken(actor,null,List.of()));
                } catch(CareerCommandException error) {response.setStatus(401);response.setContentType("application/json");response.getWriter().write(json.writeValueAsString(CareerCommandErrors.body(401,"Authentication required")));return;}
                chain.doFilter(request,response);
            }
        };
        return http.securityMatcher("/internal/career/integration/**").csrf(csrf -> csrf.disable()).sessionManagement(s -> s.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
                .requestCache(cache -> cache.disable()).formLogin(form -> form.disable()).httpBasic(basic -> basic.disable()).logout(logout -> logout.disable())
                .authorizeHttpRequests(auth -> auth.requestMatchers("/internal/career/integration/business").authenticated().anyRequest().denyAll())
                .addFilterBefore(filter,UsernamePasswordAuthenticationFilter.class).build();
    }
}
