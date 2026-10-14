package com.expresso.backend.career.application;

import java.math.BigDecimal;
import java.util.*;
import com.expresso.backend.career.domain.*;
import com.expresso.backend.career.application.PatchCareerBusinessCommand.PropertyDelta;

public final class CareerPropertyMutationValues {
    private CareerPropertyMutationValues() {}
    public record Conversion(String kind, PropertyValue value) {}
    public static Conversion convert(PropertyValue before, PropertyDefinition target) {
        try { return convertValue(before,target); }
        catch(IllegalArgumentException exception) { return new Conversion("unmapped",null); }
    }
    private static Conversion convertValue(PropertyValue before, PropertyDefinition target) {
        var type=target.type().wireName(); var id=target.id();
        if((before instanceof SelectPropertyValue || before instanceof MultiSelectPropertyValue) && Set.of("select","multi_select").contains(type)) {
            var ids=before instanceof SelectPropertyValue select ? select.value()==null?List.<String>of():List.of(select.value()) : ((MultiSelectPropertyValue)before).value();
            var allowed=new HashSet<String>();
            if(target.config().get("options") instanceof List<?> options) for(var raw:options) if(raw instanceof Map<?,?> option && option.get("id") instanceof String optionId) allowed.add(optionId);
            var kept=ids.stream().filter(allowed::contains).toList();
            var lossy=kept.size()!=ids.size() || (type.equals("select") && kept.size()>1);
            PropertyValue after=type.equals("select") ? new SelectPropertyValue(id,kept.isEmpty()?null:kept.getFirst()) : new MultiSelectPropertyValue(id,kept);
            return new Conversion(lossy?"lossy":before.type().wireName().equals(type)?"exact":"safe",after);
        }
        if(before.type().wireName().equals(type)) return new Conversion("exact",rebind(before,id));
        if(before instanceof AssetPropertyValue asset && Set.of("file","media").contains(type)) return new Conversion("safe",new AssetPropertyValue(id,PropertyValueType.valueOf(type.toUpperCase(Locale.ROOT)),asset.value()));
        if(type.equals("number")) {
            if(before instanceof CheckboxPropertyValue checkbox) return new Conversion("safe",new NumberPropertyValue(id,checkbox.value()?BigDecimal.ONE:BigDecimal.ZERO));
            if(before instanceof TextualPropertyValue text && text.value().trim().matches("[+-]?(?:[0-9]+(?:\\.[0-9]*)?|\\.[0-9]+)(?:[eE][+-]?[0-9]+)?")) return new Conversion("safe",new NumberPropertyValue(id,new BigDecimal(text.value().trim())));
        }
        if(type.equals("checkbox")) {
            if(before instanceof NumberPropertyValue number) return new Conversion("lossy",new CheckboxPropertyValue(id,number.value().signum()!=0));
            if(before instanceof TextualPropertyValue text && text.value().trim().matches("(?i:true|false)")) return new Conversion("safe",new CheckboxPropertyValue(id,Boolean.parseBoolean(text.value().trim())));
        }
        if(type.equals("date") && before instanceof TextualPropertyValue text && text.value().matches("[0-9]{4}-(?:0[1-9]|1[0-2])(?:-[0-9]{2})?")) {
            var month=text.value().length()==7;
            return new Conversion(month?"lossy":"safe",new DatePropertyValue(id,DatePropertyValue.Precision.DAY,text.value()+(month?"-01":""),null,null));
        }
        if(Set.of("text","url","email","phone").contains(type)) {
            String text=null; var kind="safe";
            if(before instanceof TextualPropertyValue value) text=value.value();
            if(before instanceof NumberPropertyValue value) text=value.value().toPlainString();
            if(before instanceof CheckboxPropertyValue value) text=Boolean.toString(value.value());
            if(before instanceof SelectPropertyValue value) text=value.value();
            if(before instanceof DatePropertyValue value) {text=value.start();kind=value.end()==null && value.timezone()==null?"safe":"lossy";}
            if(before instanceof MultiSelectPropertyValue value) {text=String.join(", ",value.value());kind="lossy";}
            if(before instanceof AssetPropertyValue value) {text=String.join(", ",value.value());kind="lossy";}
            if(text!=null) return new Conversion(kind,new TextualPropertyValue(id,PropertyValueType.valueOf(type.toUpperCase(Locale.ROOT)),text));
        }
        if(Set.of("select","multi_select").contains(type) && before instanceof TextualPropertyValue text && target.config().get("options") instanceof List<?> options
                && options.stream().anyMatch(raw -> raw instanceof Map<?,?> option && text.value().equals(option.get("id")))) {
            return new Conversion("lossy",type.equals("select")?new SelectPropertyValue(id,text.value()):new MultiSelectPropertyValue(id,List.of(text.value())));
        }
        return new Conversion("unmapped",null);
    }
    private static PropertyValue rebind(PropertyValue value,String id) {
        return switch(value) {
            case TextualPropertyValue text -> new TextualPropertyValue(id,text.type(),text.value());
            case NumberPropertyValue number -> new NumberPropertyValue(id,number.value());
            case CheckboxPropertyValue checkbox -> new CheckboxPropertyValue(id,checkbox.value());
            case SelectPropertyValue select -> new SelectPropertyValue(id,select.value());
            case MultiSelectPropertyValue multi -> new MultiSelectPropertyValue(id,multi.value());
            case AssetPropertyValue asset -> new AssetPropertyValue(id,asset.type(),asset.value());
            case DatePropertyValue date -> new DatePropertyValue(id,date.precision(),date.start(),date.end(),date.timezone());
        };
    }
    public static PropertyDelta delta(String kind,PropertyDefinition source,PropertyDefinition target,PropertyValue defaultValue,
                                      boolean confirmLossy,List<PropertyValue> values,PropertyValue tombstone) {
        var current=values.stream().filter(value -> value.propertyDefinitionId().equals(target.id())).findFirst().orElse(null);
        if(kind.equals("deletion")) {if(current!=null && !confirmLossy)throw new CareerCommandException(409,"LOSSY_CONFIRMATION_REQUIRED");return new PropertyDelta(List.of(),List.of(target.id()));}
        if(kind.equals("default")) return new PropertyDelta(current==null?List.of(Objects.requireNonNull(defaultValue)):List.of(),List.of());
        if(kind.equals("restoration")) {
            if(current!=null || tombstone==null) return new PropertyDelta(List.of(),List.of());
            var restored=convert(tombstone,target);
            if(!restored.kind().equals("exact")) throw new CareerCommandException(409,"RESTORATION_DEFINITION_CHANGED");
            return new PropertyDelta(List.of(restored.value()),List.of());
        }
        if(!kind.equals("conversion")) throw new IllegalArgumentException("mutation kind 오류입니다");
        if(current==null) return new PropertyDelta(List.of(),List.of());
        if(current.type().wireName().equals(target.type().wireName()) || current.type().wireName().equals(source.type().wireName())) {
            var result=convert(current,target);
            if(result.kind().equals("unmapped")) throw new CareerCommandException(409,"UNSUPPORTED_PROPERTY_CONVERSION");
            if(result.kind().equals("lossy") && !confirmLossy) throw new CareerCommandException(409,"LOSSY_CONFIRMATION_REQUIRED");
            return new PropertyDelta(List.of(result.value()),List.of());
        }
        throw new CareerCommandException(409,"CONVERSION_SOURCE_CHANGED");
    }
}
