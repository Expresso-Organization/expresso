package com.expresso.backend.career.integration;

import java.time.Instant;

/** 사용자 세션과 교환할 수 없는 단일 producer 작업의 권한입니다. */
public record ServiceActor(CareerProducerScope scope, Instant expiresAt) {}
