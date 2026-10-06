package com.expresso.backend.career.application;

import java.util.List;

import com.expresso.backend.career.domain.CareerRecord;

public record CareerRecordPage(List<CareerRecord> records, boolean hasNextPage, String nextCursor) {

	public CareerRecordPage {
		records = List.copyOf(records);
		if (hasNextPage != (nextCursor != null)) {
			throw new IllegalArgumentException("다음 페이지 존재 여부와 nextCursor가 일치해야 합니다");
		}
	}
}
