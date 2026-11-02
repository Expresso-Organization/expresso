package com.expresso.backend.career.infrastructure.mongo;

import java.util.HashSet;
import com.mongodb.client.*;
import org.bson.Document;
import tools.jackson.core.StreamReadFeature;
import tools.jackson.databind.DeserializationFeature;
import tools.jackson.databind.json.JsonMapper;
import com.expresso.backend.career.application.*;
import com.expresso.backend.career.mutation.CareerPropertyMutationScope;

/** receipt 재조회는 lease와 독립적이지만 DB 소유 job·불변 plan 범위를 같은 session에서 확인합니다. */
final class MongoCareerMutationScope {
    private final MongoDatabase db;private final ClientSession session;
    private final JsonMapper json=JsonMapper.builder().enable(StreamReadFeature.STRICT_DUPLICATE_DETECTION).enable(DeserializationFeature.FAIL_ON_TRAILING_TOKENS).build();
    MongoCareerMutationScope(MongoDatabase db,ClientSession session) {this.db=db;this.session=session;}
    void validate(CareerPropertyMutationScope scope) {
        try {
            var raw=db.getCollection("career_property_mutations").find(session,new Document("_id",scope.mutationId()).append("userId",scope.userId()).append("operationFingerprint",scope.operationFingerprint())).first();
            if(raw==null||!CareerMoveTokens.hash(raw.getString("planJson")).equals(scope.operationFingerprint()))throw invalid();
            var plan=json.readTree(raw.getString("planJson"));var members=plan.get("recordIds");
            if(!scope.userId().equals(plan.get("userId").asText())||!raw.getString("categoryId").equals(plan.get("categoryId").asText())||!members.isArray()||members.size()>10000)throw invalid();
            var unique=new HashSet<String>();
            for(var member:members)if(!member.isString()||!unique.add(com.expresso.backend.career.http.CareerBusinessInput.uuid(member)))throw invalid();
            if(!unique.contains(scope.recordId()))throw invalid();
        } catch(CareerCommandException error) {throw error;}
        catch(RuntimeException error) {throw invalid();}
    }
    private static CareerCommandException invalid() {return new CareerCommandException(409,"MUTATION_SCOPE_CHANGED");}
}
