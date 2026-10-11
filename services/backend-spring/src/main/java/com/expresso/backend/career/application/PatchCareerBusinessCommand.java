package com.expresso.backend.career.application;

import java.util.*;
import com.expresso.backend.career.domain.*;

public record PatchCareerBusinessCommand(Optional<String> title, Optional<PropertyDelta> propertyValues,
                                        Optional<CareerRecordStatus> status,Optional<List<CareerRelationTargets>> relations) {
    public PatchCareerBusinessCommand(Optional<String> title,Optional<PropertyDelta> values,Optional<CareerRecordStatus> status){this(title,values,status,Optional.empty());}
    public PatchCareerBusinessCommand {
        Objects.requireNonNull(title); Objects.requireNonNull(propertyValues); Objects.requireNonNull(status);Objects.requireNonNull(relations);relations=relations.map(CareerRelationTargets::validate);
        if(title.isEmpty() && propertyValues.isEmpty() && status.isEmpty() && relations.isEmpty()) throw new IllegalArgumentException("빈 PATCH입니다");
    }
    public record PropertyDelta(List<PropertyValue> set, List<String> unsetPropertyIds) {
        public PropertyDelta {
            set=List.copyOf(set); unsetPropertyIds=List.copyOf(unsetPropertyIds);
            if(set.size()>50 || unsetPropertyIds.size()>50) throw new IllegalArgumentException("property delta는 각 50개까지 허용됩니다");
            var setIds=new HashSet<String>(); var unsetIds=new HashSet<String>();
            for(var value:set) if(!setIds.add(value.propertyDefinitionId())) throw new IllegalArgumentException("중복 set ID입니다");
            for(var id:unsetPropertyIds) {
                PropertyValue.requireUuid(id,"unsetPropertyIds");
                if(!unsetIds.add(id) || setIds.contains(id)) throw new IllegalArgumentException("중복 또는 set과 겹치는 unset ID입니다");
            }
        }
        public List<PropertyValue> apply(List<PropertyValue> stored) {
            // canonical 값만 사용합니다. 기존 순서를 유지하고 신규 ID만 뒤에 추가합니다.
            var merged=new LinkedHashMap<String,PropertyValue>();
            stored.forEach(value -> merged.put(value.propertyDefinitionId(),value));
            unsetPropertyIds.forEach(merged::remove); // 저장값에 없는 ID의 unset은 no-op입니다.
            set.forEach(value -> merged.put(value.propertyDefinitionId(),value));
            return List.copyOf(merged.values());
        }
    }
    public CareerRecordChangeSet changesFor(CareerRecord record) {
        return new CareerRecordChangeSet(title,propertyValues.map(delta -> delta.apply(record.propertyValues())),status);
    }
}
