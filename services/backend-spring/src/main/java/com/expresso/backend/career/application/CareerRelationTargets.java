package com.expresso.backend.career.application;
import java.util.*;
import com.expresso.backend.career.domain.PropertyValue;
/** business 값 배열과 분리된 기존 관계 대상 교체 명령입니다. */
public record CareerRelationTargets(String propertyId,List<String> targetIds) {
    public CareerRelationTargets {PropertyValue.requireUuid(propertyId,"propertyId");targetIds=List.copyOf(targetIds);if(targetIds.size()>1000)throw new IllegalArgumentException("관계 대상은 최대 1000개입니다");targetIds.forEach(id->PropertyValue.requireUuid(id,"targetId"));}
    public static List<CareerRelationTargets> validate(List<CareerRelationTargets> relations){relations=List.copyOf(relations);if(relations.size()>50||relations.stream().map(CareerRelationTargets::propertyId).distinct().count()!=relations.size())throw new IllegalArgumentException("관계 definition은 중복 없이 최대 50개입니다");return relations;}
}