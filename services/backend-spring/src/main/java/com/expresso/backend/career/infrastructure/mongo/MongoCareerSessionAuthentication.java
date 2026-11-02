package com.expresso.backend.career.infrastructure.mongo;

import java.time.Clock;
import java.time.Duration;
import java.util.Date;
import java.util.List;
import com.mongodb.client.ClientSession;
import com.mongodb.client.MongoDatabase;
import com.mongodb.client.model.FindOneAndUpdateOptions;
import com.mongodb.client.model.ReturnDocument;
import org.bson.Document;
import com.expresso.backend.career.application.CareerCommandException;

/** Fastify와 같은 활동 만료·관리자 대신 로그인 정책을 Mongo transaction에서도 재검증합니다. */
final class MongoCareerSessionAuthentication {
    // packages/contracts/src/identity.ts의 SESSION_POLICY와 이전 세션 fallback을 따릅니다.
    private static final long PERSISTENT_IDLE_MS=Duration.ofDays(30).toMillis();
    private static final long ABSOLUTE_MS=Duration.ofDays(90).toMillis();
    private final MongoDatabase db;
    private final Clock clock;
    MongoCareerSessionAuthentication(MongoDatabase db,Clock clock) {this.db=db;this.clock=clock;}

    String authenticate(String hash,ClientSession tx) {
        var now=Date.from(clock.instant());
        var absolute=new Document("$ifNull",List.of("$absoluteExpiresAt",new Document("$add",List.of("$createdAt",ABSOLUTE_MS))));
        var filter=new Document("tokenHash",hash).append("revokedAt",null).append("expiresAt",new Document("$gt",now))
                .append("$expr",new Document("$gt",List.of(absolute,now)));
        var update=List.of(new Document("$set",new Document("lastSeenAt","$$NOW").append("expiresAt",new Document("$min",List.of(
                new Document("$add",List.of("$$NOW",new Document("$ifNull",List.of("$idleTtlMs",PERSISTENT_IDLE_MS)))),absolute)))));
        var options=new FindOneAndUpdateOptions().returnDocument(ReturnDocument.AFTER);
        var sessions=db.getCollection("identity_sessions");
        var session=tx==null?sessions.findOneAndUpdate(filter,update,options):sessions.findOneAndUpdate(tx,filter,update,options);
        if(session==null)throw unauthenticated();
        var owner=findUser(session.getString("userId"),tx,false);
        if(owner==null)throw unauthenticated();
        if(tx!=null)fenceUser(owner.getString("_id"),tx,false);
        if(session.get("actingAsUserId") instanceof String actingAs) {
            var target="admin".equals(owner.getString("role"))?findUser(actingAs,tx,true):null;
            if(target!=null) {
                if(tx!=null)fenceUser(actingAs,tx,true);
                return actingAs;
            }
            // 권한이나 더미 상태가 바뀌면 Fastify처럼 대신 로그인을 풀고 세션 주인으로 돌아갑니다.
            var actingFilter=new Document("_id",session.getString("_id")).append("actingAsUserId",actingAs);
            var clear=new Document("$set",new Document("actingAsUserId",null).append("actingSince",null));
            if(tx==null)sessions.updateOne(actingFilter,clear);else sessions.updateOne(tx,actingFilter,clear);
        }
        return owner.getString("_id");
    }
    private Document userFilter(String id,boolean dummy) {
        var filter=new Document("_id",id).append("deletionRequestedAt",null);
        if(dummy)filter.append("dummyKey",new Document("$type","string"));
        return filter;
    }
    private Document findUser(String id,ClientSession tx,boolean dummy) {
        var users=db.getCollection("users");var filter=userFilter(id,dummy);
        return tx==null?users.find(filter).first():users.find(tx,filter).first();
    }
    private void fenceUser(String id,ClientSession tx,boolean dummy) {
        if(db.getCollection("users").updateOne(tx,userFilter(id,dummy),new Document("$inc",new Document("writeVersion",1L))).getMatchedCount()!=1)throw unauthenticated();
    }
    private static CareerCommandException unauthenticated() {return new CareerCommandException(401,"UNAUTHENTICATED");}
}
