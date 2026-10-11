package com.expresso.backend.career.mutation;

import java.time.Instant;
import java.util.Objects;

/** 사용자 세션 Actor와 구별되는 단일 job·record 범위의 서비스 주체입니다. */
public record MutationServiceActor(CareerPropertyMutationScope scope,Instant expiresAt) {
    public MutationServiceActor {Objects.requireNonNull(scope);Objects.requireNonNull(expiresAt);}
}
