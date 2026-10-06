package com.expresso.backend.career.application;

import java.time.Clock;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.UUID;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.expresso.backend.career.domain.PropertyDefinition;
import com.expresso.backend.career.domain.PropertyDefinitionType;

@Service
public class CareerCategoryCreateService {

	private static final int MAX_CUSTOM_CATEGORIES = 100;
	private final CareerCategoryCreateRepository repository;
	private final Clock clock;

	public CareerCategoryCreateService(CareerCategoryCreateRepository repository, Clock clock) {
		this.repository = Objects.requireNonNull(repository, "repository는 null일 수 없습니다");
		this.clock = Objects.requireNonNull(clock, "clock은 null일 수 없습니다");
	}

	@Transactional
	public CareerPropertyCategorySnapshot create(
			String userId,
			String key,
			String name,
			String icon,
			String defaultView,
			Map<String, Map<String, Object>> requestedSchema) {
		var customCount = repository.countOwnedCustomCategories(userId);
		if (customCount >= MAX_CUSTOM_CATEGORIES) {
			throw new CareerPropertyDefinitionConflictException("Career Category는 최대 100개까지 생성할 수 있습니다");
		}
		if (repository.existsOwnedCategoryKey(userId, key)) {
			throw new CareerPropertyDefinitionConflictException("같은 key의 Career Category가 이미 존재합니다");
		}

		var categoryId = UUID.randomUUID().toString();
		var legacy = new LinkedHashMap<String, Object>();
		var v2 = new ArrayList<CareerPropertyDefinitionV2Snapshot>();
		var canonical = new ArrayList<PropertyDefinition>();
		var order = 0;
		for (var entry : requestedSchema.entrySet()) {
			var source = entry.getValue();
			var propertyId = source.get("id") instanceof String suppliedId
					? suppliedId : UUID.randomUUID().toString();
			var label = (String) source.get("label");
			var legacyType = (String) source.get("type");
			var required = (Boolean) source.get("required");
			var system = (Boolean) source.get("system");
			var canonicalType = PropertyDefinitionType.fromStoredName(legacyType);
			var config = canonicalType == PropertyDefinitionType.MULTI_SELECT
					? Map.<String, Object>of("options", List.of()) : Map.<String, Object>of();
			legacy.put(entry.getKey(), Map.of(
					"id", propertyId,
					"label", label,
					"type", legacyType,
					"required", required,
					"system", system));
			v2.add(new CareerPropertyDefinitionV2Snapshot(
					propertyId, entry.getKey(), label, canonicalType.wireName(), required, system,
					config, order, 1, null));
			canonical.add(new PropertyDefinition(
					propertyId, entry.getKey(), label, canonicalType, required, system,
					config, order, 1, null));
			order++;
		}

		var category = new CareerPropertyCategorySnapshot(
				categoryId, userId, key, name, icon, defaultView, false,
				java.util.Collections.unmodifiableMap(legacy), List.copyOf(v2), List.copyOf(canonical),
				1, Math.toIntExact(7 + customCount), 1);
		repository.insert(category, clock.instant().truncatedTo(ChronoUnit.MILLIS));
		return category;
	}
}
