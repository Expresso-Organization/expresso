package com.expresso.backend.career.infrastructure.mongo;

import java.util.*;
import com.mongodb.client.*;
import org.bson.Document;
import com.expresso.backend.career.application.CareerCommandException;

/** schema job와 같은 category 문서를 먼저 갱신하여 snapshot 사이의 쓰기 경쟁을 차단합니다. */
final class MongoCareerPropertyMutationBusinessGuard {
    private final MongoDatabase db;private final ClientSession session;private final String user;
    private final Set<String> guarded=new HashSet<>();
    MongoCareerPropertyMutationBusinessGuard(MongoDatabase db,ClientSession session,String user) {this.db=db;this.session=session;this.user=user;}
    void fence(String categoryId) {
        if(guarded.contains(categoryId))return;
        // 가입 때 복사된 기본 카테고리도 동일한 사용자 소유권과 쓰기 경계를 적용합니다.
        var category=db.getCollection("career_categories").find(session,new Document("_id",categoryId).append("userId",user).append("deletedAt",null)).first();
        if(category==null)throw CareerCommandException.missing();
        var fenced=db.getCollection("career_categories").updateOne(session,new Document("_id",categoryId).append("userId",user).append("deletedAt",null).append("version",category.get("version")),new Document("$inc",new Document("writeVersion",1L)));
        if(fenced.getMatchedCount()!=1)throw new CareerCommandException(409,"CATEGORY_SCHEMA_CHANGED");
        var job=db.getCollection("career_property_mutations").find(session,new Document("userId",user).append("categoryId",categoryId).append("active",true).append("status",new Document("$in",List.of("pending","running","failed")))).first();
        if(job!=null)throw new CareerCommandException(409,"CAREER_PROPERTY_MUTATION_ACTIVE",Map.of("mutationId",job.getString("_id"),"status",job.getString("status"),"retryable",job.getString("status").equals("failed")));
        guarded.add(categoryId);
    }
}
