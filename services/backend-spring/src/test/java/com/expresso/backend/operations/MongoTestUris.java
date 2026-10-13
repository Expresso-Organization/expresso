package com.expresso.backend.operations;

import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import com.mongodb.ConnectionString;

// 테스트 credential만 교체하고 host·path·query 원문은 보존합니다. URI를 로그에 출력하지 않습니다.
final class MongoTestUris {
    static String replaceCredentials(String uri, String user, String password) {
        var bare = withoutCredentials(uri);
        int start = bare.indexOf("://") + 3;
        return bare.substring(0, start) + encoded(user) + ":" + encoded(password) + "@" + bare.substring(start);
    }
    static String withoutCredentials(String uri) {
        try { new ConnectionString(uri); }
        catch (RuntimeException error) { throw new IllegalArgumentException("Invalid test Mongo URI"); }
        int start = uri.indexOf("://") + 3, end = uri.length();
        for (int i = start; i < uri.length(); i++) {
            if (uri.charAt(i) == '/' || uri.charAt(i) == '?') { end = i; break; }
        }
        var authority = uri.substring(start, end);
        int userInfo = authority.lastIndexOf('@');
        return uri.substring(0, start) + authority.substring(userInfo + 1) + uri.substring(end);
    }
    private static String encoded(String value) { return URLEncoder.encode(value, StandardCharsets.UTF_8).replace("+", "%20"); }
    private MongoTestUris() {}
}
