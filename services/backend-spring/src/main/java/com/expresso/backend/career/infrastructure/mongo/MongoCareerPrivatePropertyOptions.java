package com.expresso.backend.career.infrastructure.mongo;

import java.util.*;
import com.mongodb.client.*;
import com.mongodb.client.model.Collation;
import org.bson.Document;
import com.expresso.backend.career.application.CareerCommandException;
import com.expresso.backend.career.domain.*;

/** 인증된 기록 소유자의 개인 옵션을 같은 session의 검증용 복사본에만 병합합니다. */
final class MongoCareerPrivatePropertyOptions {
    private final MongoDatabase db;
    private final ClientSession session;
    private final String user;
    MongoCareerPrivatePropertyOptions(MongoDatabase db,ClientSession session,String user) {this.db=db;this.session=session;this.user=user;}
    List<PropertyDefinition> overlay(String category,List<PropertyDefinition> definitions) {
        var privateOptions=db.getCollection("career_property_options").find(session,new Document("userId",user).append("categoryId",category))
                .collation(Collation.builder().locale("simple").build()).sort(new Document("propertyId",1).append("rawLabel",1)).into(new ArrayList<>());
        return definitions.stream().map(definition->overlay(definition,privateOptions)).toList();
    }
    List<PropertyDefinition> overlaySnapshot(List<PropertyDefinition> definitions,List<Document> rows) {return definitions.stream().map(definition->overlay(definition,rows)).toList();}
    private PropertyDefinition overlay(PropertyDefinition definition,List<Document> ledger) {
        if(definition.type()!=PropertyDefinitionType.SELECT && definition.type()!=PropertyDefinitionType.MULTI_SELECT)return definition;
        // 해당 속성의 개인 옵션이 없으면 일반 SELECT 정의를 그대로 검증합니다.
        if(ledger.stream().noneMatch(row->definition.id().equals(row.getString("propertyId"))))return definition;
        var config=new LinkedHashMap<String,Object>(definition.config());
        var source=config.get("options");
        if(config.containsKey("options") && !(source instanceof List<?>))throw conflict();
        var merged=new ArrayList<Map<String,Object>>();var ids=new HashMap<String,String>();var labels=new HashMap<String,String>();
        if(source instanceof List<?> options)for(var option:options) {
            if(!(option instanceof Map<?,?> raw))throw conflict();
            var copied=new LinkedHashMap<String,Object>();for(var entry:raw.entrySet()) {if(!(entry.getKey() instanceof String key))throw conflict();copied.put(key,entry.getValue());}
            var label=copied.get("label");var name=copied.get("name");
            if((copied.containsKey("label") && !(label instanceof String)) || (copied.containsKey("name") && !(name instanceof String)) || (copied.containsKey("label") && copied.containsKey("name") && !label.equals(name)))throw conflict();
            add(merged,ids,labels,copied,copied.get("id"),label==null?name:label);
        }
        for(var row:ledger)if(definition.id().equals(row.getString("propertyId"))) {
            if(!(row.get("version") instanceof Number version) || version.longValue()!=1L)throw conflict();
            var copied=new LinkedHashMap<String,Object>();
            if(row.get("metadata") instanceof Map<?,?> metadata)for(var entry:metadata.entrySet()) {if(!(entry.getKey() instanceof String key))throw conflict();copied.put(key,entry.getValue());}
            add(merged,ids,labels,copied,row.get("optionId"),row.get("rawLabel"));config.put("legacyFreeformTags",true);
        }
        config.put("options",List.copyOf(merged));
        return new PropertyDefinition(definition.id(),definition.key(),definition.name(),definition.type(),definition.required(),definition.system(),config,definition.order(),definition.version(),definition.deletedAt());
    }
    private static void add(List<Map<String,Object>> merged,Map<String,String> ids,Map<String,String> labels,Map<String,Object> option,Object rawId,Object rawLabel) {
        if(!(rawId instanceof String id) || !(rawLabel instanceof String label) || label.length()>200)throw conflict();
        try {PropertyValue.requireUuid(id,"optionId");}catch(IllegalArgumentException error){throw conflict();}
        if((ids.containsKey(id) && !ids.get(id).equals(label)) || (labels.containsKey(label) && !labels.get(label).equals(id)))throw conflict();
        if(ids.containsKey(id))return;
        // wire label과 내부 Move name은 같은 원문을 사용하며 정규화하지 않습니다.
        option.put("id",id);option.put("label",label);option.put("name",label);merged.add(option);ids.put(id,label);labels.put(label,id);
    }
    private static CareerCommandException conflict() {return new CareerCommandException(409,"PRIVATE_OPTION_MAPPING_CONFLICT");}
}
