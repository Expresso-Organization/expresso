package com.expresso.backend.career.dto;

import com.expresso.backend.career.application.CareerPropertyMutationService;

/** runtime route 없이 내부 포트의 business 응답만 직렬화합니다. */
public final class CareerPropertyMutationData {
    private CareerPropertyMutationData() {}
    public record Result(CareerBusinessRecordData data,boolean changed,boolean replayed) {
        public static Result from(CareerPropertyMutationService.Result result) {return new Result(CareerBusinessRecordData.from(result.record()),result.changed(),result.replayed());}
    }
    public record Read(CareerBusinessRecordData data,CareerBusinessRecordData.PropertyValueData tombstone) {
        public static Read from(CareerPropertyMutationService.Read result) {return new Read(CareerBusinessRecordData.from(result.record()),result.tombstone()==null?null:CareerBusinessRecordData.PropertyValueData.from(result.tombstone()));}
    }
}
