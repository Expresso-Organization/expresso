package com.expresso.backend.career.integration;

import java.util.Set;
import com.expresso.backend.career.domain.PropertyValue;
import com.expresso.backend.career.http.CareerBusinessInput;
import tools.jackson.databind.JsonNode;

public record CareerProducerScope(String producer,String userId,String sourceId,String operationId,String fingerprint) {
    public CareerProducerScope {
        if(!Set.of("ai-proposal","interview","career-product").contains(producer)) throw new IllegalArgumentException("producer 형식 오류입니다");
        if(producer.equals("career-product")&&!java.util.Objects.equals(sourceId,operationId))throw new IllegalArgumentException("product source와 operation ID가 일치해야 합니다");
        PropertyValue.requireUuid(userId,"userId"); PropertyValue.requireUuid(sourceId,"sourceId"); PropertyValue.requireUuid(operationId,"operationId");
        if(fingerprint==null || !fingerprint.matches("[a-f0-9]{64}")) throw new IllegalArgumentException("fingerprint 형식 오류입니다");
    }
    public static CareerProducerScope from(JsonNode input) {
        return new CareerProducerScope(CareerBusinessInput.text(input.get("producer")),CareerBusinessInput.text(input.get("userId")),CareerBusinessInput.text(input.get("sourceId")),CareerBusinessInput.text(input.get("operationId")),CareerBusinessInput.text(input.get("fingerprint")));
    }
    public String collection() {return switch(producer){case "ai-proposal"->"career_ai_proposals";case "interview"->"interview_career_operations";case "career-product"->"career_product_operations";default->throw new IllegalArgumentException("producer 형식 오류입니다");};}
    public String receiptKey() {return "producer:"+producer+":"+userId+":"+operationId;}
}
