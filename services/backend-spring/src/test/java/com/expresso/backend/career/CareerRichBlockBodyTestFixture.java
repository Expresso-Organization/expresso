package com.expresso.backend.career;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;

import org.bson.Document;

final class CareerRichBlockBodyTestFixture {

	private CareerRichBlockBodyTestFixture() {
	}

	static Document richAndUnknownBody() {
		var fixtures = readFixtures();
		var rich = fixtures.get("richNested", Document.class);
		var unknown = fixtures.get("unknownBlock", Document.class);
		var content = new ArrayList<>(rich.getList("content", Document.class));
		content.addAll(unknown.getList("content", Document.class));
		return new Document("schemaVersion", 1)
				.append("type", "doc")
				.append("content", content);
	}

	static String patchBody(Document blockBody) {
		return new Document("blockBody", blockBody).toJson();
	}

	private static Document readFixtures() {
		var fixturePath = Path.of("..", "..", "packages", "contracts", "openapi", "fixtures",
				"career-rich-block-body-v1.json");
		try {
			return Document.parse(Files.readString(fixturePath));
		}
		catch (IOException error) {
			throw new IllegalStateException("공용 rich blockBody fixture를 읽을 수 없습니다", error);
		}
	}

}
