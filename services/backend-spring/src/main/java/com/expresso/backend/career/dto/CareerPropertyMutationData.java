package com.expresso.backend.career.dto;
import java.util.Map;
import com.expresso.backend.career.application.CareerPropertyMutationService;
/** 내부 포트의 scalar와 relation 응답을 서로 다른 wire shape으로 직렬화합니다. */
public final class CareerPropertyMutationData {
    private CareerPropertyMutationData() {}
    public record Result(CareerBusinessRecordData data,boolean changed,boolean replayed) {
        public static Result from(CareerPropertyMutationService.Result result) {return new Result(CareerBusinessRecordData.from(result.record()),result.changed(),result.replayed());}
    }
    public sealed interface Read permits ScalarRead,RelationRead {
        CareerBusinessRecordData data();
        static Read from(CareerPropertyMutationService.Read result) {
            var data=CareerBusinessRecordData.from(result.record());
            return result.relation()==null?new ScalarRead(data,result.tombstone()==null?null:CareerBusinessRecordData.PropertyValueData.from(result.tombstone())):new RelationRead(data,result.relation());
        }
    }
    public record ScalarRead(CareerBusinessRecordData data,CareerBusinessRecordData.PropertyValueData tombstone) implements Read {}
    public record RelationRead(CareerBusinessRecordData data,Map<String,Object> relation) implements Read {}
}