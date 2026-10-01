package com.expresso.backend.career.api;

import java.time.Instant;
import java.util.List;
import java.util.Map;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.expresso.backend.career.application.ListCareerCategoriesUseCase;
import com.expresso.backend.career.domain.CareerCategory;
import com.expresso.backend.career.domain.PropertyDefinition;

@RestController
@RequestMapping("/v1/career")
public class CareerCategoryController {

	private final ListCareerCategoriesUseCase listCareerCategories;

	public CareerCategoryController(ListCareerCategoriesUseCase listCareerCategories) {
		this.listCareerCategories = listCareerCategories;
	}

	@GetMapping("/categories")
	public CareerCategoriesResponse listCategories() {
		return new CareerCategoriesResponse(listCareerCategories.list().stream()
				.map(CareerCategoryResponse::from)
				.toList());
	}

	public record CareerCategoriesResponse(List<CareerCategoryResponse> data) {
	}

	public record CareerCategoryResponse(
			String id,
			String key,
			String name,
			List<PropertyDefinitionResponse> propertyDefinitions) {

		private static CareerCategoryResponse from(CareerCategory category) {
			return new CareerCategoryResponse(
					category.id(),
					category.key(),
					category.name(),
					category.propertyDefinitions().stream()
							.map(PropertyDefinitionResponse::from)
							.toList());
		}
	}

	public record PropertyDefinitionResponse(
			String id,
			String key,
			String name,
			String type,
			boolean required,
			boolean system,
			Map<String, Object> config,
			int order,
			long version,
			Instant deletedAt) {

		private static PropertyDefinitionResponse from(PropertyDefinition definition) {
			return new PropertyDefinitionResponse(
					definition.id(),
					definition.key(),
					definition.name(),
					definition.type().wireName(),
					definition.required(),
					definition.system(),
					definition.config(),
					definition.order(),
					definition.version(),
					definition.deletedAt());
		}
	}

}
