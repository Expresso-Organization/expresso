package com.expresso.backend.career.application;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Clock;
import java.time.temporal.ChronoUnit;
import java.util.LinkedHashMap;
import java.util.Objects;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.expresso.backend.career.domain.CareerRecord;

@Service
public class CareerCategoryMoveService {

	private final CareerCategoryMoveRepository repository;
	private final CareerCategoryMovePlanner planner;
	private final CareerCategoryMovePreviewSigner signer;
	private final CareerComputationOutbox computationOutbox;
	private final Clock clock;

	public CareerCategoryMoveService(
			CareerCategoryMoveRepository repository,
			CareerCategoryMovePlanner planner,
			CareerCategoryMovePreviewSigner signer,
			CareerComputationOutbox computationOutbox,
			Clock clock) {
		this.repository = Objects.requireNonNull(repository, "repository는 null일 수 없습니다");
		this.planner = Objects.requireNonNull(planner, "planner는 null일 수 없습니다");
		this.signer = Objects.requireNonNull(signer, "signer는 null일 수 없습니다");
		this.computationOutbox = Objects.requireNonNull(computationOutbox, "computationOutbox는 null일 수 없습니다");
		this.clock = Objects.requireNonNull(clock, "clock은 null일 수 없습니다");
	}

	public CareerCategoryMovePreview preview(String userId, String recordId, String targetCategoryId) {
		var state = state(userId, recordId, targetCategoryId);
		var now = clock.instant().truncatedTo(ChronoUnit.MILLIS);
		var plan = planner.plan(
				state.record().record(), state.source().category(), state.target().category(),
				state.record().unmappedProperties(), now);
		var token = token(state, plan);
		return new CareerCategoryMovePreview(
				recordId,
				state.source().category().id(),
				targetCategoryId,
				state.record().record().version(),
				state.source().schemaVersion(),
				state.target().schemaVersion(),
				plan.conversions(), plan.unmappedProperties(), signer.sign(token, now));
	}

	@Transactional
	public CareerRecord commit(
			String userId,
			String recordId,
			long ifMatchVersion,
			CommitCareerCategoryMoveCommand command) {
		if (ifMatchVersion != command.expectedVersion()) {
			throw new CareerRecordValidationException("If-Match와 expectedVersion이 일치해야 합니다");
		}
		var state = state(userId, recordId, command.targetCategoryId());
		if (state.record().record().version() != ifMatchVersion) {
			throw new CareerRecordPreconditionFailedException();
		}
		var now = clock.instant().truncatedTo(ChronoUnit.MILLIS);
		var plan = planner.plan(
				state.record().record(), state.source().category(), state.target().category(),
				state.record().unmappedProperties(), now);
		if (!signer.verify(command.previewToken(), token(state, plan), now)) {
			throw new CareerCategoryMoveConflictException("Category move preview가 만료되었거나 현재 상태와 다릅니다");
		}
		var remaining = new LinkedHashMap<>(plan.unmappedProperties());
		for (var id : command.discardUnmappedPropertyIds()) {
			if (!remaining.containsKey(id)) {
				throw new CareerRecordValidationException("discard 대상이 현재 unmappedProperties에 없습니다");
			}
			remaining.remove(id);
		}
		var stored = repository.move(
				state.record(), command.targetCategoryId(), plan,
				new CareerUnmappedProperties(remaining), now)
				.orElseThrow(CareerRecordPreconditionFailedException::new);
		if (!plan.computationPropertyIds().isEmpty()) {
			computationOutbox.append(new CareerComputationEvent(
					userId, recordId, plan.computationPropertyIds(), stored.version(), plan.targetPropertyVersions()));
		}
		return stored;
	}

	private MoveState state(String userId, String recordId, String targetCategoryId) {
		var record = repository.findOwnedRecord(userId, recordId)
				.orElseThrow(CareerRecordNotFoundException::new);
		if (record.record().categoryId().equals(targetCategoryId)) {
			throw new CareerRecordValidationException("현재 Category와 같은 Category로 이동할 수 없습니다");
		}
		var source = repository.findReadableCategory(userId, record.record().categoryId())
				.orElseThrow(CareerRecordNotFoundException::new);
		var target = repository.findReadableCategory(userId, targetCategoryId)
				.orElseThrow(CareerRecordNotFoundException::new);
		return new MoveState(record, source, target);
	}

	private static CareerCategoryMoveToken token(MoveState state, CareerCategoryMovePlan plan) {
		return new CareerCategoryMoveToken(
				state.record().record().ownerId(), state.record().record().id(),
				state.source().category().id(), state.target().category().id(),
				state.record().record().version(), state.source().schemaVersion(), state.target().schemaVersion(),
				digest(plan));
	}

	private static String digest(CareerCategoryMovePlan plan) {
		var canonical = new StringBuilder();
		plan.conversions().forEach(conversion -> canonical.append(conversion.sourcePropertyId()).append('|')
				.append(conversion.targetPropertyId()).append('|').append(conversion.kind()).append(';'));
		plan.unmappedProperties().keySet().stream().sorted().forEach(id -> canonical.append("u:").append(id).append(';'));
		try {
			return java.util.HexFormat.of().formatHex(
					MessageDigest.getInstance("SHA-256").digest(canonical.toString().getBytes(StandardCharsets.UTF_8)));
		}
		catch (NoSuchAlgorithmException exception) {
			throw new IllegalStateException("SHA-256을 사용할 수 없습니다", exception);
		}
	}

	private record MoveState(
			CareerCategoryMoveRecordSnapshot record,
			CareerCategoryMoveCategorySnapshot source,
			CareerCategoryMoveCategorySnapshot target) {
	}
}
