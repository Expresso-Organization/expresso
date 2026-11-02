package com.expresso.backend.career.infrastructure;

import java.time.Clock;
import java.util.List;
import jakarta.servlet.*;
import jakarta.servlet.http.*;
import java.io.IOException;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.boot.autoconfigure.condition.*;
import org.springframework.context.annotation.*;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;
import org.springframework.web.filter.OncePerRequestFilter;
import org.springframework.web.servlet.HandlerExceptionResolver;
import com.mongodb.client.*;
import tools.jackson.databind.json.JsonMapper;
import com.expresso.backend.career.application.*;
import com.expresso.backend.career.http.CareerCommandErrors;
import com.expresso.backend.career.infrastructure.mongo.MongoCareerCommandRepository;

@Configuration(proxyBeanMethods=false)
@ConditionalOnProperty(name="career.writer.enabled",havingValue="true")
public class CareerWriterConfiguration {
    @Bean Clock careerClock() {return Clock.systemUTC();}
    @Bean(destroyMethod="close") MongoClient careerMongoClient(@Value("${career.writer.mongo-uri}") String uri) {return MongoClients.create(uri);}
    @Bean MongoCareerCommandRepository careerRepository(MongoClient client,@Value("${career.writer.database}") String database,Clock clock) {
        if(database.isBlank()) throw new IllegalArgumentException("database 이름이 필요합니다");
        return new MongoCareerCommandRepository(client,client.getDatabase(database),clock);
    }
    @Bean CareerCommandService careerCommands(MongoCareerCommandRepository repository,Clock clock,@Value("${career.writer.move-secret}") String secret) {
        return new CareerCommandService(repository,clock,new CareerMoveTokens(secret));
    }
    @Bean @ConditionalOnWebApplication(type=ConditionalOnWebApplication.Type.SERVLET)
    SecurityFilterChain careerSecurity(HttpSecurity http,MongoCareerCommandRepository repository,
                                      @Qualifier("handlerExceptionResolver") HandlerExceptionResolver resolver) throws Exception {
        var json=JsonMapper.builder().build();
        var filter=new OncePerRequestFilter() {
            @Override protected void doFilterInternal(HttpServletRequest request,HttpServletResponse response,FilterChain chain) throws ServletException,IOException {
                var header=request.getHeader("Authorization");
                if(header!=null) {
                    try {
                        if(!header.regionMatches(true,0,"Bearer ",0,7)) throw new CareerCommandException(401,"UNAUTHENTICATED");
                        var actor=repository.authenticate(header.substring(7));
                        SecurityContextHolder.getContext().setAuthentication(new UsernamePasswordAuthenticationToken(actor,null,List.of()));
                    } catch(CareerCommandException exception) {
                        response.setStatus(401); response.setContentType("application/json"); response.getWriter().write(json.writeValueAsString(CareerCommandErrors.body(401,"Authentication required"))); return;
                    } catch(Exception exception) {
                        // 인증 storage 장애도 controller와 같은 advice·JSON envelope로 반환합니다.
                        resolver.resolveException(request,response,null,exception); return;
                    }
                }
                chain.doFilter(request,response);
            }
        };
        return http.csrf(csrf -> csrf.disable()).sessionManagement(s -> s.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
                .requestCache(cache -> cache.disable()).formLogin(form -> form.disable()).httpBasic(basic -> basic.disable()).logout(logout -> logout.disable())
                .authorizeHttpRequests(auth -> auth.requestMatchers("/v1/career/records","/v1/career/records/**").authenticated().anyRequest().denyAll())
                .exceptionHandling(errors -> errors.authenticationEntryPoint((request,response,error) -> {response.setStatus(401);response.setContentType("application/json");response.getWriter().write(json.writeValueAsString(CareerCommandErrors.body(401,"Authentication required")));}))
                .addFilterBefore(filter,UsernamePasswordAuthenticationFilter.class).build();
    }
}
