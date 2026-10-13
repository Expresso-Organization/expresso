package com.expresso.backend.career.dto;

import com.expresso.backend.career.application.CareerCommandRepository.RecordLink;

/** 공유 CareerRecordLinkSchema에 맞는 기록 관점의 응답입니다. */
public record CareerRecordLinkData(String id,String recordId,String relatedRecordId,String relation,String direction) {
    public static CareerRecordLinkData from(RecordLink link,String record) {
        var outgoing=link.fromRecordId().equals(record);
        return new CareerRecordLinkData(link.id(),record,outgoing?link.toRecordId():link.fromRecordId(),link.relation(),outgoing?"outgoing":"incoming");
    }
}
