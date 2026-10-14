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
        // 공유 system category의 job가 다른 사용자 전체를 잠그지 않도록 custom 소유권을 먼저 확인합니다.
        var category=db.getCollection("career_categories").find(session,new Document("_id",categoryId).append("userId",user).append("isSystem",false)).first();
        if(category==null)return;
        var fenced=db.getCollection("career_categories").updateOne(session,new Document("_id",categoryId).append("userId",user).append("isSystem",false).append("version",category.get("version")),new Document("$inc",new Document("writeVersion",1L)));
        if(fenced.getMatchedCount()!=1)throw new CareerCommandException(409,"CATEGORY_SCHEMA_CHANGED");
        var job=db.getCollection("career_property_mutations").find(session,new Document("userId",user).append("categoryId",categoryId).append("active",true).append("status",new Document("$in",List.of("pending","running","failed")))).first();
        if(job!=null)throw new CareerCommandException(409,"CAREER_PROPERTY_MUTATION_ACTIVE",Map.of("mutationId",job.getString("_id"),"status",job.getString("status"),"retryable",job.getString("status").equals("failed")));
        guarded.add(categoryId);
    }
}