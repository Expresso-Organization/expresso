package com.expresso.backend;

import org.springframework.boot.SpringApplication;

public class TestBackendSpringApplication {

	public static void main(String[] args) {
		SpringApplication.from(BackendSpringApplication::main).with(TestcontainersConfiguration.class).run(args);
	}

}
