package com.expresso.backend.career.mutation;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Clock;
import java.util.List;
import jakarta.servlet.*;
import jakarta.servlet.http.*;
import org.springframework.boot.autoconfigure.condition.*;
import org.springframework.context.annotation.*;
import org.springframework.core.annotation.Order;
import org.springframework.core.env.Environment;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;
import org.springframework.web.filter.OncePerRequestFilter;
import tools.jackson.databind.json.JsonMapper;
import com.expresso.backend.career.application.CareerCommandException;
import com.expresso.backend.career.http.CareerCommandErrors;
import com.expresso.backend.career.infrastructure.mongo.MongoCareerCommandRepository;

@Configuration(proxyBeanMethods=false)
@ConditionalOnProperty(name={"career.writer.enabled","career.property-mutation.enabled"},havingValue="true")
public class CareerPropertyMutationConfiguration {
    @Bean CareerPropertyMutationCredentials careerPropertyMutationCredentials(Clock clock,Environment environment) {
        var secret=environment.getRequiredProperty("career.property-mutation.secret");
        for(var setting:List.of("career.integration.ai-secret","career.integration.interview-secret","career.product.service-secret")) {
            var other=environment.getProperty(setting);
            if(other!=null && MessageDigest.isEqual(secret.getBytes(StandardCharsets.UTF_8),other.getBytes(StandardCharsets.UTF_8)))throw new IllegalArgumentException("mutation key는 producer key와 달라야 합니다");
        }
        return new CareerPropertyMutationCredentials(secret,clock);
    }
    @Bean CareerPropertyMutationHttpService careerPropertyMutationHttp(MongoCareerCommandRepository repository,Clock clock) {return new CareerPropertyMutationHttpService(repository,clock);}
    @Bean @Order(1) @ConditionalOnWebApplication(type=ConditionalOnWebApplication.Type.SERVLET)
    SecurityFilterChain careerPropertyMutationSecurity(HttpSecurity http,CareerPropertyMutationCredentials credentials) throws Exception {
        var json=JsonMapper.builder().build();var filter=new OncePerRequestFilter() {
            @Override protected void doFilterInternal(HttpServletRequest request,HttpServletResponse response,FilterChain chain) throws ServletException,IOException {
                try {
                    var header=request.getHeader("Authorization");
                    if(header==null||!header.regionMatches(true,0,"Bearer ",0,7))throw new CareerCommandException(401,"UNAUTHENTICATED");
                    var actor=credentials.authenticate(header.substring(7));SecurityContextHolder.getContext().setAuthentication(new UsernamePasswordAuthenticationToken(actor,null,List.of()));
                } catch(CareerCommandException error) {response.setStatus(401);response.setContentType("application/json");response.getWriter().write(json.writeValueAsString(CareerCommandErrors.body(401,"Authentication required")));return;}
                chain.doFilter(request,response);
            }
        };
        return http.securityMatcher("/internal/career/property-mutations/**").csrf(csrf->csrf.disable()).sessionManagement(s->s.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
            .requestCache(cache->cache.disable()).formLogin(form->form.disable()).httpBasic(basic->basic.disable()).logout(logout->logout.disable())
            .authorizeHttpRequests(auth->auth.requestMatchers("/internal/career/property-mutations/receipt","/internal/career/property-mutations/read","/internal/career/property-mutations/commit").authenticated().anyRequest().denyAll())
            .addFilterBefore(filter,UsernamePasswordAuthenticationFilter.class).build();
    }
}
