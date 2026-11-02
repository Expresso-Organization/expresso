package com.expresso.backend.career.infrastructure.mongo;

import java.util.*;
import org.bson.Document;
import tools.jackson.core.StreamReadFeature;
import tools.jackson.databind.DeserializationFeature;
import tools.jackson.databind.json.JsonMapper;
import com.expresso.backend.career.application.*;
import com.expresso.backend.career.application.CareerCommandRepository.MutationJob;
import com.expresso.backend.career.domain.*;

/** 작업의 원문 계획과 별개로 고정된 개인 옵션의 정확한 byte hash와 소유 범위를 검증합니다. */
final class MongoCareerMutationPrivateOptions {
    private static final JsonMapper JSON=JsonMapper.builder().enable(StreamReadFeature.STRICT_DUPLICATE_DETECTION).enable(DeserializationFeature.FAIL_ON_TRAILING_TOKENS).build();
    private static final Set<String> FIELDS=Set.of("userId","categoryId","propertyId","optionId","rawLabel","version");
    static List<Document> rows(String user,MutationJob job) {
        var raw=job.privateOptionSnapshotJson();var fingerprint=job.privateOptionSnapshotFingerprint();
        var dependent=privateDependent(job.target()) || (job.source()!=null&&privateDependent(job.source()));
        if(raw==null&&fingerprint==null) {if(dependent)throw new CareerCommandException(409,"PRIVATE_OPTION_SNAPSHOT_REQUIRED");return List.of();}
        try {
            if(raw==null||raw.getBytes(java.nio.charset.StandardCharsets.UTF_8).length>2097152||fingerprint==null||!fingerprint.matches("[a-f0-9]{64}")||!CareerMoveTokens.hash(raw).equals(fingerprint))throw new IllegalArgumentException();
            var nodes=JSON.readTree(raw);if(!nodes.isArray()||nodes.size()>10000)throw new IllegalArgumentException();
            var result=new ArrayList<Document>();var ids=new HashSet<String>();var labels=new HashSet<String>();String previousLabel=null;String previousOption=null;
            // 타입 전환 뒤 남은 개인 옵션도 같은 소유 범위와 고정된 원문으로 검증합니다.
            for(var node:nodes) {
                if(!node.isObject()||!new HashSet<>(node.propertyNames()).equals(FIELDS))throw new IllegalArgumentException();
                for(var key:List.of("userId","categoryId","propertyId","optionId","rawLabel"))if(!node.get(key).isString())throw new IllegalArgumentException();
                var owner=PropertyValue.requireUuid(node.get("userId").asText(),"userId");var category=PropertyValue.requireUuid(node.get("categoryId").asText(),"categoryId");
                var property=PropertyValue.requireUuid(node.get("propertyId").asText(),"propertyId");var option=PropertyValue.requireUuid(node.get("optionId").asText(),"optionId");var label=node.get("rawLabel").asText();
                if(!owner.equals(user)||!category.equals(job.categoryId())||!property.equals(job.target().id())||label.length()>200||!node.get("version").isIntegralNumber()||!node.get("version").canConvertToLong()||node.get("version").asLong()!=1L)throw new IllegalArgumentException();
                if(!ids.add(property+":"+option)||!labels.add(property+":"+label))throw new IllegalArgumentException();
                if(previousLabel!=null&&(previousLabel.compareTo(label)>0||(previousLabel.equals(label)&&previousOption.compareTo(option)>=0)))throw new IllegalArgumentException();previousLabel=label;previousOption=option;
                result.add(new Document("userId",owner).append("categoryId",category).append("propertyId",property).append("optionId",option).append("rawLabel",label).append("version",1L));
            }
            if(!canonical(result).equals(raw))throw new IllegalArgumentException();
            return List.copyOf(result);
        }catch(CareerCommandException error){throw error;}catch(RuntimeException error){throw new CareerCommandException(409,"PRIVATE_OPTION_SNAPSHOT_CHANGED");}
    }
    private static String canonical(List<Document> rows) {
        var result=new StringJoiner(",","[","]");
        for(var row:rows)result.add("{\"categoryId\":"+quote(row.getString("categoryId"))+",\"optionId\":"+quote(row.getString("optionId"))+",\"propertyId\":"+quote(row.getString("propertyId"))+",\"rawLabel\":"+quote(row.getString("rawLabel"))+",\"userId\":"+quote(row.getString("userId"))+",\"version\":1}");
        return result.toString();
    }
    // 최소 snapshot의 문자열만 JSON.stringify와 같은 UTF-16 이스케이프 규칙으로 비교합니다.
    private static String quote(String text) {
        var result=new StringBuilder("\"");
        for(int i=0;i<text.length();i++) {
            var value=text.charAt(i);
            switch(value) {
                case '"' -> result.append("\\\"");case '\\' -> result.append("\\\\");
                case '\b' -> result.append("\\b");case '\f' -> result.append("\\f");case '\n' -> result.append("\\n");case '\r' -> result.append("\\r");case '\t' -> result.append("\\t");
                default -> {
                    if(value<0x20||(Character.isHighSurrogate(value)&&(i+1==text.length()||!Character.isLowSurrogate(text.charAt(i+1))))||(Character.isLowSurrogate(value)&&(i==0||!Character.isHighSurrogate(text.charAt(i-1)))))result.append(String.format(Locale.ROOT,"\\u%04x",(int)value));else result.append(value);
                }
            }
        }
        return result.append('"').toString();
    }
    private static boolean privateDependent(PropertyDefinition definition) {return Set.of(PropertyDefinitionType.SELECT,PropertyDefinitionType.MULTI_SELECT).contains(definition.type())&&Boolean.TRUE.equals(definition.config().get("legacyFreeformTags"));}
}