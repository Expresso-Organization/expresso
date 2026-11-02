package com.expresso.backend.career.mutation;

import java.util.Set;
import tools.jackson.databind.JsonNode;
import com.expresso.backend.career.http.CareerBusinessInput;
import com.expresso.backend.career.application.CareerCommandException;

public record CareerPropertyMutationScope(String userId,String mutationId,String recordId,String operationFingerprint) {
    public CareerPropertyMutationScope {
        CareerBusinessInput.uuid(userId);CareerBusinessInput.uuid(mutationId);CareerBusinessInput.uuid(recordId);
        if(operationFingerprint==null || !operationFingerprint.matches("[a-f0-9]{64}"))throw new IllegalArgumentException("fingerprint 오류입니다");
    }
    public static CareerPropertyMutationScope from(JsonNode claims) {
        return new CareerPropertyMutationScope(CareerBusinessInput.uuid(claims.get("userId")),CareerBusinessInput.uuid(claims.get("mutationId")),CareerBusinessInput.uuid(claims.get("recordId")),CareerBusinessInput.text(claims.get("operationFingerprint")));
    }
    public void requireRequest(JsonNode request,Set<String> fields) {
        CareerBusinessInput.fields(request,fields,fields);
        var mutation=CareerBusinessInput.uuid(request.get("mutationId"));var record=CareerBusinessInput.uuid(request.get("recordId"));var fingerprint=CareerBusinessInput.text(request.get("operationFingerprint"));
        if(!fingerprint.matches("[a-f0-9]{64}"))throw new IllegalArgumentException("fingerprint 오류입니다");
        if(!mutationId.equals(mutation)||!recordId.equals(record)||!operationFingerprint.equals(fingerprint))throw new CareerCommandException(403,"MUTATION_SCOPE_MISMATCH");
    }
}
