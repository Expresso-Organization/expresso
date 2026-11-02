package com.expresso.backend.career.application;
import java.util.*;
import com.expresso.backend.career.domain.*;
public record CareerRelationPropertyMutationCommand(String mutationId,String recordId,long expectedVersion,String leaseToken,String operationFingerprint,List<String> targetRecordIds,Map<String,Long> targetRecordVersions) {
    public CareerRelationPropertyMutationCommand {
        PropertyValue.requireUuid(mutationId,"mutationId");PropertyValue.requireUuid(recordId,"recordId");PropertyValue.requireUuid(leaseToken,"leaseToken");
        if(expectedVersion<1||expectedVersion>CareerRecord.MAX_VERSION||operationFingerprint==null||!operationFingerprint.matches("[a-f0-9]{64}"))throw new IllegalArgumentException("mutation 범위 오류입니다");
        targetRecordIds=List.copyOf(targetRecordIds);targetRecordVersions=Map.copyOf(targetRecordVersions);
        if(targetRecordIds.size()>1000||new HashSet<>(targetRecordIds).size()!=targetRecordIds.size()||targetRecordVersions.size()>1000)throw new IllegalArgumentException("relation 대상 범위 오류입니다");
        targetRecordIds.forEach(id->PropertyValue.requireUuid(id,"targetRecordId"));targetRecordVersions.forEach((id,version)->{PropertyValue.requireUuid(id,"targetRecordId");if(version==null||version<1||version>CareerRecord.MAX_VERSION)throw new IllegalArgumentException("version 범위 오류입니다");});
    }
}