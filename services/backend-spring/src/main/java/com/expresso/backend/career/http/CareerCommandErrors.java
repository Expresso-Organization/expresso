package com.expresso.backend.career.http;

import java.util.Map;
import java.util.UUID;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.web.bind.annotation.*;
import com.expresso.backend.career.application.CareerCommandException;

@RestControllerAdvice
@ConditionalOnProperty(name="career.writer.enabled",havingValue="true")
public final class CareerCommandErrors {
    public static Map<String,Object> body(int status,String detail) {
        var code=switch(status) {case 400 -> "VALIDATION_ERROR"; case 401 -> "AUTH_REQUIRED"; case 403 -> "FORBIDDEN"; case 404 -> "NOT_FOUND"; case 409 -> "CONFLICT"; case 412 -> "PRECONDITION_FAILED"; default -> "INTERNAL_ERROR";};
        return Map.of("error",Map.of("code",code,"message",detail,"requestId",UUID.randomUUID().toString()));
    }
    @ExceptionHandler(CareerCommandException.class) public ResponseEntity<?> command(CareerCommandException error) {
        var response=body(error.status(),error.code());
        if(!error.details().isEmpty()) {
            var fields=new java.util.LinkedHashMap<String,Object>();((Map<?,?>)response.get("error")).forEach((key,value)->fields.put((String)key,value));fields.put("details",error.details());response=Map.of("error",fields);
        }
        return ResponseEntity.status(error.status()).body(response);
    }
    @ExceptionHandler({IllegalArgumentException.class,HttpMessageNotReadableException.class}) public ResponseEntity<?> invalid(Exception error) {return ResponseEntity.badRequest().body(body(400,"Invalid business command"));}
    @ExceptionHandler(IllegalStateException.class) public ResponseEntity<?> exhausted(IllegalStateException error) {
        if(error.getMessage()!=null && error.getMessage().contains("version")) return ResponseEntity.status(409).body(body(409,"BUSINESS_VERSION_EXHAUSTED"));
        return failed(error);
    }
    @ExceptionHandler(Exception.class) public ResponseEntity<?> failed(Exception error) {
        org.slf4j.LoggerFactory.getLogger(CareerCommandErrors.class).error("Career command failed",error);
        return ResponseEntity.internalServerError().body(body(500,"Career command failed"));
    }
}
