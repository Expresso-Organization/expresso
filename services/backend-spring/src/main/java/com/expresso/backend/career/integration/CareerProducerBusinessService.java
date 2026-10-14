package com.expresso.backend.career.integration;

import java.lang.reflect.*;
import java.time.Clock;
import java.util.*;
import org.bson.Document;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;
import com.expresso.backend.career.application.*;
import com.expresso.backend.career.application.CareerCommandRepository.*;
import com.expresso.backend.career.domain.CareerRecord;
import com.expresso.backend.career.dto.CareerBusinessRecordData;
import com.expresso.backend.career.http.CareerBusinessInput;
import com.expresso.backend.career.infrastructure.mongo.MongoCareerCommandRepository;

public final class CareerProducerBusinessService {
    public record Result(CareerBusinessRecordData data,boolean replayed) {}
    private final MongoCareerCommandRepository repository;
    private final Clock clock;
    private final CareerMoveTokens tokens;
    private final JsonMapper json=JsonMapper.builder().build();
    public CareerProducerBusinessService(MongoCareerCommandRepository repository,Clock clock,CareerMoveTokens tokens) {this.repository=repository;this.clock=clock;this.tokens=tokens;}
    public Result commit(ServiceActor actor,JsonNode request,String match) {
        var fields=Set.of("producer","userId","sourceId","operationId","fingerprint","leaseToken"); CareerBusinessInput.fields(request,fields,fields);
        var scope=CareerProducerScope.from(request); var lease=CareerBusinessInput.uuid(request.get("leaseToken"));
        if(!scope.equals(actor.scope())) throw new CareerCommandException(403,"PRODUCER_SCOPE_MISMATCH");
        return repository.serviceTransaction(actor,tx -> {
            var source=tx.source(); var intent=boundIntent(source,scope); var business=intent.get("business");
            if(business==null || business.isNull()) throw new CareerCommandException(409,"PRODUCER_BUSINESS_MISSING");
            var kind=CareerBusinessInput.text(business.get("kind"));
            long expected=0;
            if(kind.equals("patch")) {
                CareerBusinessInput.fields(business,Set.of("kind","recordId","expectedVersion","expectedCategoryVersion","patches"),Set.of("kind","recordId","expectedVersion","expectedCategoryVersion","patches"));
                var recordId=CareerBusinessInput.uuid(business.get("recordId"));
                if(scope.producer().equals("ai-proposal") && !recordId.equals(source.getString("recordId"))) throw new CareerCommandException(409,"PRODUCER_SOURCE_CHANGED");
                expected=version(business.get("expectedVersion"));
                if(CareerBusinessInput.version(match)!=expected) throw CareerCommandException.stale();
            } else if(kind.equals("create")) {
                CareerBusinessInput.fields(business,Set.of("kind","expectedCategoryVersion","input"),Set.of("kind","expectedCategoryVersion","input"));
                if(!scope.producer().equals("interview")) throw new CareerCommandException(403,"PRODUCER_CREATE_FORBIDDEN");
            } else throw new IllegalArgumentException("business kind 오류입니다");
            var receipt=tx.operations().replay(scope.receiptKey());
            if(receipt!=null) {
                if(!receipt.requestHash().equals(scope.fingerprint())) throw new CareerCommandException(409,"IDEMPOTENCY_CONFLICT");
                tx.guardReplay(receipt.record()); return new Result(CareerBusinessRecordData.from(receipt.record()),true);
            }
            tx.guardLease(lease);
            var categoryVersion=version(business.get("expectedCategoryVersion"));
            var ops=scopedOperations(tx.operations(),categoryVersion);
            CareerCommandRepository scoped=new CareerCommandRepository() {
                @Override public <T> T transaction(Actor b1Actor,java.util.function.Function<Operations,T> work) {
                    if(!scope.userId().equals(b1Actor.userId())) throw new CareerCommandException(403,"PRODUCER_SCOPE_MISMATCH");
                    return work.apply(ops);
                }
            };
            var commands=new CareerCommandService(scoped,clock,tokens);
            // B1의 aggregate 생성에만 userId를 전달합니다. 세션 인증과 일반 transaction을 호출하지 않습니다.
            var b1Actor=new Actor(scope.userId(),"service-producer"); CareerRecord result;
            if(kind.equals("create")) {
                tx.guardInterview(source,source.getString("kind"),null);
                result=commands.create(b1Actor,CareerBusinessInput.create(business.get("input")),scope.receiptKey()); tx.interviewOrigin(result);
            } else {
                var id=CareerBusinessInput.uuid(business.get("recordId")); var patches=business.get("patches");
                if(patches==null || !patches.isArray() || patches.size()<1 || patches.size()>2) throw new IllegalArgumentException("patch 배열 범위 오류입니다");
                if(scope.producer().equals("interview")) tx.guardInterview(source,source.getString("kind"),id);
                // 모든 patch를 먼저 파싱하여 일부 입력만 실행하는 일을 막습니다.
                var parsed=new ArrayList<PatchCareerBusinessCommand>(); for(var patch:patches) parsed.add(CareerBusinessInput.patch(patch));
                result=null; for(var patch:parsed) {result=commands.patch(b1Actor,id,expected,patch); expected=result.version();}
            }
            tx.operations().remember(scope.receiptKey(),scope.fingerprint(),result);
            var response=new Result(CareerBusinessRecordData.from(result),false);
            tx.rememberResult(lease,Document.parse(json.writeValueAsString(response))); return response;
        });
    }
    private static long version(JsonNode value) {
        if(value==null || !value.isIntegralNumber() || !value.canConvertToLong()) throw new IllegalArgumentException("version은 정수여야 합니다");
        var version=value.asLong(); if(version<1 || version>CareerRecord.MAX_VERSION) throw new IllegalArgumentException("version 범위 오류입니다"); return version;
    }
    private Operations scopedOperations(Operations delegate,long categoryVersion) {
        return (Operations)Proxy.newProxyInstance(Operations.class.getClassLoader(),new Class<?>[]{Operations.class},(proxy,method,args) -> {
            // create의 기존 사용자 receipt는 외부 producer receipt로 대체합니다.
            if(method.getName().equals("replay")) return null;
            if(method.getName().equals("remember")) return null;
            try {
                var value=method.invoke(delegate,args);
                if(method.getName().equals("category") && ((Category)value).categoryVersion()!=categoryVersion) throw new CareerCommandException(409,"CATEGORY_SCHEMA_CHANGED");
                return value;
            } catch(InvocationTargetException error) {throw error.getCause();}
        });
    }
    private JsonNode boundIntent(Document source,CareerProducerScope scope) {
        var current=source.get("writerIntegration",Document.class); Document stored=null;
        if(current!=null && scope.operationId().equals(current.getString("operationId"))) stored=current;
        if(stored==null && source.get("writerIntegrationHistory") instanceof List<?> history) for(var item:history) {
            if(item instanceof Document candidate && scope.operationId().equals(candidate.getString("operationId"))) {stored=candidate;break;}
        }
        if(stored==null) throw new CareerCommandException(409,"PRODUCER_SCOPE_MISMATCH");
        var intent=json.readTree(stored.toJson());
        if(!scope.equals(CareerProducerScope.from(intent))) throw new CareerCommandException(409,"PRODUCER_SCOPE_MISMATCH");
        if(!intent.has("business") || !intent.has("document")) throw new CareerCommandException(409,"PRODUCER_INTENT_INVALID");
        var binding=json.createObjectNode();
        for(var field:List.of("producer","userId","sourceId","operationId","business","document")) binding.set(field,intent.get(field));
        if(!CareerMoveTokens.hash(json.writeValueAsString(canonical(binding))).equals(scope.fingerprint())) throw new CareerCommandException(409,"PRODUCER_FINGERPRINT_MISMATCH");
        return intent;
    }
    private static Object canonical(JsonNode node) {
        if(node.isNull()) return List.of("null");
        if(node.isObject()) {var result=new TreeMap<String,Object>(); for(var key:node.propertyNames()) result.put(key,canonical(node.get(key))); return List.of("object",result.entrySet().stream().map(entry -> List.of(entry.getKey(),entry.getValue())).toList());}
        if(node.isArray()) {var result=new ArrayList<Object>(); for(var item:node) result.add(canonical(item)); return List.of("array",result);}
        if(node.isString()) return List.of("string",node.asText()); if(node.isBoolean()) return List.of("boolean",node.asBoolean());
        if(node.isNumber()) {
            var value=node.asDouble(); if(!Double.isFinite(value)) throw new IllegalArgumentException("intent 숫자는 유한해야 합니다");
            // JSON 숫자 표기와 정수형 BSON 차이를 제거하고 Node의 binary64와 같은 바이트를 사용합니다.
            return List.of("number",String.format("%016x",Double.doubleToLongBits(value==0?0:value)));
        }
        throw new IllegalArgumentException("intent JSON 형식 오류입니다");
    }
}
