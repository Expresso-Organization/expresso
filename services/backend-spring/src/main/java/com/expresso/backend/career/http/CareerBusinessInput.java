package com.expresso.backend.career.http;

import java.math.BigDecimal;
import java.util.*;
import tools.jackson.databind.JsonNode;
import com.expresso.backend.career.application.CreateCareerBusinessCommand;
import com.expresso.backend.career.application.PatchCareerBusinessCommand;
import com.expresso.backend.career.domain.*;

public final class CareerBusinessInput {
    private CareerBusinessInput() {}
    public static void fields(JsonNode input,Set<String> allowed,Set<String> required) {
        if(input==null || !input.isObject()) throw new IllegalArgumentException("JSON object가 필요합니다");
        var keys=new HashSet<String>(); input.propertyNames().forEach(keys::add);
        if(!allowed.containsAll(keys) || !keys.containsAll(required)) throw new IllegalArgumentException("입력 필드가 올바르지 않습니다");
    }
    public static String text(JsonNode value) {
        if(value==null || !value.isString()) throw new IllegalArgumentException("문자열이 필요합니다"); return value.asText();
    }
    public static String uuid(JsonNode value) { return uuid(text(value)); }
    public static String uuid(String value) {
        return PropertyValue.requireUuid(value,"id");
    }
    public static long version(String etag) {
        if(etag==null || !etag.matches("\"v[1-9][0-9]*\"")) throw new IllegalArgumentException("If-Match가 필요합니다");
        var version=Long.parseLong(etag.substring(2,etag.length()-1));
        if(version>CareerRecord.MAX_VERSION) throw new IllegalArgumentException("If-Match 범위 오류입니다"); return version;
    }
    public static CreateCareerBusinessCommand create(JsonNode input) {
        fields(input,Set.of("categoryId","title","propertyValues"),Set.of("categoryId"));
        var category=uuid(input.get("categoryId"));
        if(input.has("title")) {
            if(!input.has("propertyValues")) throw new IllegalArgumentException("duplicate에는 propertyValues가 필요합니다");
            return new CreateCareerBusinessCommand(category,text(input.get("title")),values(input.get("propertyValues")),CreateCareerBusinessCommand.Mode.DUPLICATE);
        }
        if(input.has("propertyValues")) return new CreateCareerBusinessCommand(category,"",values(input.get("propertyValues")),CreateCareerBusinessCommand.Mode.GROUPED);
        return CreateCareerBusinessCommand.empty(category);
    }
    public static PatchCareerBusinessCommand patch(JsonNode input) {
        fields(input,Set.of("title","propertyValues","status"),Set.of());
        Optional<PatchCareerBusinessCommand.PropertyDelta> delta=Optional.empty();
        if(input.has("propertyValues")) {
            var value=input.get("propertyValues");
            fields(value,Set.of("set","unsetPropertyIds"),Set.of("set","unsetPropertyIds"));
            delta=Optional.of(new PatchCareerBusinessCommand.PropertyDelta(values(value.get("set")),ids(value.get("unsetPropertyIds"),50)));
        }
        return new PatchCareerBusinessCommand(input.has("title")?Optional.of(text(input.get("title"))):Optional.empty(),delta,
                input.has("status")?Optional.of(CareerRecordStatus.fromWireName(text(input.get("status")))):Optional.empty());
    }
    public static List<PropertyValue> values(JsonNode input) {
        if(input==null || !input.isArray() || input.size()>50) throw new IllegalArgumentException("값 배열은 최대 50개입니다");
        var result=new ArrayList<PropertyValue>(); var ids=new HashSet<String>();
        for(var value:input) {
            fields(value,Set.of("propertyDefinitionId","type","value"),Set.of("propertyDefinitionId","type","value"));
            var id=uuid(value.get("propertyDefinitionId")); if(!ids.add(id)) throw new IllegalArgumentException("중복 definition ID입니다");
            var type=PropertyValueType.valueOf(text(value.get("type")).toUpperCase(Locale.ROOT));
            if(!type.wireName().equals(text(value.get("type")))) throw new IllegalArgumentException("type은 소문자여야 합니다");
            var raw=value.get("value");
            PropertyValue parsed=switch(type) {
                case TEXT,URL,EMAIL,PHONE -> new TextualPropertyValue(id,type,text(raw));
                case NUMBER -> {
                    var decimal=text(raw);
                    if(decimal.length()>6200 || !decimal.matches("-?(?:0|[1-9][0-9]*)(?:\\.[0-9]+)?")) throw new IllegalArgumentException("일반 십진 표기가 필요합니다");
                    yield new NumberPropertyValue(id,new BigDecimal(decimal));
                }
                case CHECKBOX -> {if(!raw.isBoolean()) throw new IllegalArgumentException("boolean이 필요합니다"); yield new CheckboxPropertyValue(id,raw.asBoolean());}
                case SELECT -> new SelectPropertyValue(id,raw.isNull()?null:uuid(raw));
                case MULTI_SELECT -> new MultiSelectPropertyValue(id,ids(raw,100));
                case FILE,MEDIA -> new AssetPropertyValue(id,type,ids(raw,100));
                case DATE -> {
                    var precision=text(raw.get("precision"));
                    var keys=precision.equals("datetime")?Set.of("precision","start","end","timezone"):Set.of("precision","start","end");
                    fields(raw,keys,keys);
                    var parsedPrecision=DatePropertyValue.Precision.valueOf(precision.toUpperCase(Locale.ROOT));
                    if(!parsedPrecision.name().toLowerCase(Locale.ROOT).equals(precision)) throw new IllegalArgumentException("precision 오류입니다");
                    yield new DatePropertyValue(id,parsedPrecision,text(raw.get("start")),raw.get("end").isNull()?null:text(raw.get("end")),precision.equals("datetime")&&!raw.get("timezone").isNull()?text(raw.get("timezone")):null);
                }
            };
            result.add(parsed);
        }
        return List.copyOf(result);
    }
    public static List<String> ids(JsonNode input,int max) {
        if(input==null || !input.isArray() || input.size()>max) throw new IllegalArgumentException("ID 배열 범위 오류입니다");
        var result=new ArrayList<String>(); for(var item:input) result.add(uuid(item)); return List.copyOf(result);
    }
}
