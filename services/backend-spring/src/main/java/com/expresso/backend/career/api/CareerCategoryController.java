package com.expresso.backend.career.api;

import java.util.List;

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
			List<TextPropertyDefinitionResponse> propertyDefinitions) {

		private static CareerCategoryResponse from(CareerCategory category) {
			return new CareerCategoryResponse(
					category.id(),
					category.key(),
					category.name(),
					category.propertyDefinitions().stream()
							.map(TextPropertyDefinitionResponse::from)
							.toList());
		}
	}

	public record TextPropertyDefinitionResponse(
			String id,
			String key,
			String label,
			String type,
			boolean required,
			boolean system) {

		private static TextPropertyDefinitionResponse from(PropertyDefinition definition) {
			return new TextPropertyDefinitionResponse(
					definition.id(),
					definition.key(),
					definition.label(),
					definition.type().name().toLowerCase(),
					definition.required(),
					definition.system());
		}
	}

}
