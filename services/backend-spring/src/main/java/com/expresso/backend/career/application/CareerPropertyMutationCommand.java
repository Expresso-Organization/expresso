package com.expresso.backend.career.application;

import java.util.Objects;
import com.expresso.backend.career.domain.*;
import com.expresso.backend.career.application.PatchCareerBusinessCommand.PropertyDelta;

public record CareerPropertyMutationCommand(String mutationId,String recordId,long expectedVersion,String leaseToken,
                                            String operationFingerprint,PropertyDelta propertyValues) {
    public CareerPropertyMutationCommand {
        PropertyValue.requireUuid(mutationId,"mutationId");PropertyValue.requireUuid(recordId,"recordId");PropertyValue.requireUuid(leaseToken,"leaseToken");
        if(expectedVersion<1 || expectedVersion>CareerRecord.MAX_VERSION) throw new IllegalArgumentException("version 범위 오류입니다");
        if(operationFingerprint==null || !operationFingerprint.matches("[a-f0-9]{64}")) throw new IllegalArgumentException("fingerprint 오류입니다");
        Objects.requireNonNull(propertyValues);
    }
}
