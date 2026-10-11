package com.expresso.backend.career.infrastructure.mongo;

import java.time.*;
import java.util.*;
import org.bson.Document;
import com.mongodb.client.*;
import com.expresso.backend.career.application.*;
import com.expresso.backend.career.domain.CareerRecord;
import com.expresso.backend.career.integration.CareerProducerScope;

/** business, outbox, receipt, source를 한 session으로 묶는 integration 전용 경계입니다. */
public final class MongoCareerProducerOperations {
    private final MongoDatabase db;
    private final ClientSession session;
    private final Clock clock;
    private final CareerProducerScope scope;
    private final CareerCommandRepository.Operations operations;
    public MongoCareerProducerOperations(MongoDatabase db,ClientSession session,Clock clock,CareerProducerScope scope,CareerCommandRepository.Operations operations) {this.db=db;this.session=session;this.clock=clock;this.scope=scope;this.operations=operations;}
    public CareerCommandRepository.Operations operations() {return operations;}
    public Document source() {
        var row=db.getCollection(scope.collection()).find(session,owner()).first();
        if(row==null) throw CareerCommandException.missing(); return row;
    }
    private Document owner() {return new Document("_id",scope.sourceId()).append("userId",scope.userId());}
    public void guardReplay(CareerRecord record) {
        if(!record.userId().equals(scope.userId()) || db.getCollection("career_records").find(session,new Document("_id",record.id()).append("userId",scope.userId())).first()==null) throw CareerCommandException.missing();
        // 현재 intent와 과거 영수증 모두 source purge와 같은 쓰기 원장에서 경쟁합니다.
        var result=db.getCollection(scope.collection()).updateOne(session,owner(),new Document("$inc",new Document("writerIntegration.fence",1)));
        if(result.getMatchedCount()!=1) throw CareerCommandException.missing();
    }
    private String timestamp() {return new java.time.format.DateTimeFormatterBuilder().appendInstant(3).toFormatter().format(clock.instant());}
    private Document lease(String token) {
        return owner().append("writerIntegration.operationId",scope.operationId()).append("writerIntegration.fingerprint",scope.fingerprint()).append("writerIntegration.state","running")
                .append("writerIntegration.leaseToken",token).append("writerIntegration.leaseUntil",new Document("$gt",timestamp()));
    }
    public void guardLease(String token) {
        var row=source();
        if(!(row.get("writerIntegration") instanceof Document intent) || !(intent.get("leaseUntil") instanceof String expiry)) throw new CareerCommandException(409,"PRODUCER_LEASE_LOST");
        try {if(!Instant.parse(expiry).isAfter(clock.instant())) throw new IllegalArgumentException();}
        catch(IllegalArgumentException error) {throw new CareerCommandException(409,"PRODUCER_LEASE_LOST");}
        var result=db.getCollection(scope.collection()).updateOne(session,lease(token),new Document("$inc",new Document("writerIntegration.fence",1)).append("$set",new Document("writerIntegration.updatedAt",timestamp())));
        if(result.getMatchedCount()!=1) throw new CareerCommandException(409,"PRODUCER_LEASE_LOST");
    }
    public void rememberResult(String token,Document result) {
        var saved=db.getCollection(scope.collection()).updateOne(session,lease(token),new Document("$set",new Document("writerIntegration.businessResult",result).append("writerIntegration.updatedAt",timestamp())));
        if(saved.getMatchedCount()!=1) throw new CareerCommandException(409,"PRODUCER_LEASE_LOST");
    }
    private void guard(String collection,Document filter) {
        var result=db.getCollection(collection).updateOne(session,filter,new Document("$inc",new Document("writeVersion",1L)));
        if(result.getMatchedCount()!=1) throw new CareerCommandException(409,"INTERVIEW_SOURCE_CHANGED");
    }
    public void guardInterview(Document source,String kind,String recordId) {
        if(!Boolean.TRUE.equals(source.get("active"))) throw new CareerCommandException(409,"INTERVIEW_SOURCE_CHANGED");
        var answerId=source.getString("answerId"); var questionId=source.getString("questionId"); var sessionId=source.getString("sessionId");
        var answerVersion=source.get("answerVersion");
        if(answerId==null || questionId==null || sessionId==null || !(answerVersion instanceof Number number) || number.longValue()<1 || !Objects.equals(recordId,source.getString("recordId"))) throw new CareerCommandException(409,"INTERVIEW_SOURCE_CHANGED");
        guard("interview_sessions",new Document("_id",sessionId).append("userId",scope.userId()));
        guard("questions",new Document("_id",questionId).append("userId",scope.userId()).append("interviewSessionId",sessionId).append("active",true));
        if(!(source.get("input") instanceof Document input) || !(input.get("inputType") instanceof String inputType) || !(input.get("transcript") instanceof String transcript)) throw new CareerCommandException(409,"INTERVIEW_SOURCE_CHANGED");
        var answer=new Document("_id",answerId).append("userId",scope.userId()).append("questionId",questionId).append("version",number.longValue()).append("inputType",inputType).append("transcript",transcript);
        if(kind.equals("answer")) {
            answer.append("writerPending",true).append("writerOperationId",scope.operationId()).append("requestHash",source.getString("requestHash"));
            answer.append("createdRecordId",recordId);
            if(recordId!=null) guard("career_records",new Document("_id",recordId).append("userId",scope.userId()).append("origin","interview").append("deletedAt",null));
        } else if(kind.equals("cleanup")) {
            if(recordId==null) throw new CareerCommandException(409,"INTERVIEW_SOURCE_CHANGED");
            answer.append("writerPending",new Document("$ne",true)).append("createdRecordId",recordId);
            // 요청의 CAS 버전과 별개로 원래 Answer에 고정된 버전을 같은 transaction에서 검증합니다.
            var expected=source.get("writerIntegration",Document.class).get("business",Document.class).get("expectedVersion",Number.class);
            var original=db.getCollection("answers").find(session,answer).first();
            if(original==null) throw new CareerCommandException(409,"INTERVIEW_SOURCE_CHANGED");
            if(!(original.get("recordVersion") instanceof Number bound) || bound.doubleValue()!=expected.longValue()) throw CareerCommandException.stale();
            answer.append("recordVersion",expected.longValue());
            guard("career_records",new Document("_id",recordId).append("userId",scope.userId()).append("origin","interview").append("deletedAt",null).append("status",new Document("$ne","verified")));
        } else throw new CareerCommandException(409,"INTERVIEW_SOURCE_CHANGED");
        guard("answers",answer);
    }
    public void interviewOrigin(CareerRecord record) {
        var saved=db.getCollection("career_records").updateOne(session,new Document("_id",record.id()).append("userId",scope.userId()),new Document("$set",new Document("origin","interview")));
        if(saved.getMatchedCount()!=1) throw CareerCommandException.missing();
    }
    public void validateProductSource(Document source,String kind,String recordId,boolean fresh) {
        if(!scope.producer().equals("career-product"))throw new CareerCommandException(403,"PRODUCER_SCOPE_MISMATCH");
        if(!scope.sourceId().equals(scope.operationId())||!scope.sourceId().equals(source.getString("_id"))||!scope.userId().equals(source.getString("userId"))||!kind.equals(source.getString("kind"))||!source.containsKey("recordId")||!Objects.equals(recordId,source.get("recordId"))||!scope.fingerprint().equals(source.getString("requestHash"))||!(source.get("inputHash") instanceof String inputHash)||!inputHash.matches("[a-f0-9]{64}")||!(source.get("inputIdempotencyKey") instanceof String inputKey)||inputKey.length()<8||inputKey.length()>200||!(source.get("active") instanceof Boolean)||fresh&&!Boolean.TRUE.equals(source.get("active")))throw new CareerCommandException(409,"PRODUCER_SOURCE_CHANGED");
    }
    public void guardProductSource(Document source,String kind,String recordId) {
        validateProductSource(source,kind,recordId,true);
        var filter=owner().append("active",true).append("kind",kind).append("recordId",recordId).append("requestHash",scope.fingerprint()).append("inputHash",source.getString("inputHash")).append("inputIdempotencyKey",source.getString("inputIdempotencyKey"));
        var result=db.getCollection(scope.collection()).updateOne(session,filter,new Document("$inc",new Document("writerIntegration.fence",1L)));
        if(result.getMatchedCount()!=1)throw new CareerCommandException(409,"PRODUCER_SOURCE_CHANGED");
    }
    public void requireProductCreateCategory(String categoryId) {
        var filter=new Document("_id",categoryId).append("deletedAt",null).append("$or",List.of(new Document("userId",scope.userId()),new Document("userId",null).append("isSystem",true)));
        if(db.getCollection("career_categories").find(session,filter).first()==null)throw CareerCommandException.missing();
    }
}
