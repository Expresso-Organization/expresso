package com.expresso.backend.career.application;

import java.util.Objects;

import org.springframework.stereotype.Service;

import com.expresso.backend.career.domain.CareerRecord;

@Service
public class CareerRecordQueryService implements GetCareerRecordUseCase {

	private final CareerRecordRepository recordRepository;

	public CareerRecordQueryService(CareerRecordRepository recordRepository) {
		this.recordRepository = Objects.requireNonNull(recordRepository, "recordRepository는 null일 수 없습니다");
	}

	@Override
	public CareerRecord get(String ownerId, String recordId) {
		Objects.requireNonNull(ownerId, "ownerId는 null일 수 없습니다");
		Objects.requireNonNull(recordId, "recordId는 null일 수 없습니다");
		return recordRepository.findOwnedCanonicalById(ownerId, recordId)
				.orElseThrow(CareerRecordNotFoundException::new);
	}

}
