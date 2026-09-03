package com.expresso.backend.career.api;

import java.util.UUID;

import jakarta.servlet.http.HttpServletRequest;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

import com.expresso.backend.career.application.CareerRecordCategoryNotAllowedException;
import com.expresso.backend.career.application.CareerRecordDataIntegrityException;
import com.expresso.backend.career.application.CareerRecordIdempotencyConflictException;
import com.expresso.backend.career.application.CareerRecordNotFoundException;

@RestControllerAdvice(assignableTypes = CareerRecordController.class)
public class CareerRecordExceptionHandler {

	@ExceptionHandler({ CareerRecordRequestValidationException.class,
			CareerRecordCategoryNotAllowedException.class,
			HttpMessageNotReadableException.class })
	ResponseEntity<ApiErrorResponse> badRequest(HttpServletRequest request) {
		return error(request, HttpStatus.BAD_REQUEST, "VALIDATION_ERROR", "Request validation failed");
	}

	@ExceptionHandler(CareerRecordIdempotencyConflictException.class)
	ResponseEntity<ApiErrorResponse> conflict(HttpServletRequest request) {
		return error(request, HttpStatus.CONFLICT, "CONFLICT", "Request conflicts with current state");
	}

	@ExceptionHandler(CareerRecordNotFoundException.class)
	ResponseEntity<ApiErrorResponse> notFound(HttpServletRequest request) {
		return error(request, HttpStatus.NOT_FOUND, "NOT_FOUND", "Resource not found");
	}

	@ExceptionHandler(CareerRecordDataIntegrityException.class)
	ResponseEntity<ApiErrorResponse> internalError(HttpServletRequest request) {
		return error(request, HttpStatus.INTERNAL_SERVER_ERROR, "INTERNAL_ERROR", "Internal server error");
	}

	private static ResponseEntity<ApiErrorResponse> error(
			HttpServletRequest request,
			HttpStatus status,
			String code,
			String message) {
		var requestId = request.getRequestId();
		if (requestId == null || requestId.isBlank()) {
			requestId = UUID.randomUUID().toString();
		}
		return ResponseEntity.status(status)
				.header("x-request-id", requestId)
				.body(new ApiErrorResponse(new ApiError(code, message, requestId)));
	}

	record ApiErrorResponse(ApiError error) {
	}

	record ApiError(String code, String message, String requestId) {
	}

}
