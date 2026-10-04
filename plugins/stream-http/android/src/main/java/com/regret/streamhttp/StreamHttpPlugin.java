package com.regret.streamhttp;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import java.util.Iterator;
import java.util.List;
import java.util.Map;

/**
 * 由原生层发请求，并把响应体**逐行**回调给 JS。
 *
 * 为什么需要它：打包版 WebView 的来源是 `https://localhost`，厂商不回 CORS 头时浏览器侧的
 * fetch 直接失败；而 Capacitor 自带的 `CapacitorHttp` 是**整包返回**（读完整段 body 才 resolve）。
 * 实测上游网关首字要 18.8 s、之后连续吐约 50 s，整包返回意味着这七十秒界面上什么都没有——
 * 这个插件把那七十秒变成"她正在写"。
 *
 * 用 `HttpURLConnection` 而不是 OkHttp：Capacitor 的 android 模块并未暴露 OkHttp，
 * 自己引一份等于多一个依赖；而 `HttpURLConnection` 的 `readLine()` 本来就是流式的。
 */
@CapacitorPlugin(name = "StreamHttp")
public class StreamHttpPlugin extends Plugin {

    /** 在飞的请求，供 abort 中断。id 由 JS 侧生成，因此事件可以精确归属。 */
    private final Map<String, HttpURLConnection> connections = new HashMap<>();

    @PluginMethod
    public void request(PluginCall call) {
        String id = call.getString("id");
        String url = call.getString("url");
        if (id == null || url == null) {
            call.reject("id 与 url 必填");
            return;
        }

        String method = call.getString("method", "POST");
        String body = call.getString("data");
        JSObject headers = call.getObject("headers", new JSObject());
        Integer connectTimeout = call.getInt("connectTimeout", 30000);
        Integer readTimeout = call.getInt("readTimeout", 180000);

        // 立刻回执：JS 侧拿到 id 才算"这次请求已受理"，事件在此之前就已开始监听
        call.resolve(new JSObject().put("id", id));

        Thread worker = new Thread(
            () -> run(id, url, method, body, headers, connectTimeout, readTimeout),
            "stream-http-" + id
        );
        worker.setDaemon(true);
        worker.start();
    }

    @PluginMethod
    public void abort(PluginCall call) {
        String id = call.getString("id");
        HttpURLConnection connection = id == null ? null : connections.remove(id);
        if (connection != null) {
            connection.disconnect();
        }
        call.resolve();
    }

    private void run(
        String id,
        String url,
        String method,
        String body,
        JSObject headers,
        int connectTimeout,
        int readTimeout
    ) {
        HttpURLConnection connection = null;
        try {
            connection = (HttpURLConnection) new URL(url).openConnection();
            connections.put(id, connection);
            connection.setRequestMethod(method);
            connection.setConnectTimeout(connectTimeout);
            connection.setReadTimeout(readTimeout);
            // 与整包路径保持一致：不自动跟随重定向，把 3xx 与 Location 交给上层判断
            connection.setInstanceFollowRedirects(false);

            if (headers != null) {
                // 用 keys() 而不是 keySet()：Android 平台的 org.json 在编译期只暴露前者的子集
                Iterator<String> names = headers.keys();
                while (names.hasNext()) {
                    String name = names.next();
                    String value = headers.getString(name);
                    if (value != null) {
                        connection.setRequestProperty(name, value);
                    }
                }
            }

            if (body != null) {
                byte[] payload = body.getBytes(StandardCharsets.UTF_8);
                connection.setDoOutput(true);
                connection.setFixedLengthStreamingMode(payload.length);
                try (OutputStream out = connection.getOutputStream()) {
                    out.write(payload);
                }
            }

            // getResponseCode() 在响应头到达时返回——这正是"首字之前"与"开始吐字"的分界线
            int status = connection.getResponseCode();
            emit("streamStart", new JSObject().put("id", id).put("status", status).put("headers", readHeaders(connection)));

            InputStream stream = status >= 400 ? connection.getErrorStream() : connection.getInputStream();
            if (stream != null) {
                try (BufferedReader reader = new BufferedReader(new InputStreamReader(stream, StandardCharsets.UTF_8))) {
                    String line;
                    while ((line = reader.readLine()) != null) {
                        emit("streamLine", new JSObject().put("id", id).put("line", line));
                    }
                }
            }
            emit("streamEnd", new JSObject().put("id", id));
        } catch (IOException error) {
            emit("streamError", new JSObject().put("id", id).put("message", String.valueOf(error.getMessage())));
        } finally {
            connections.remove(id);
            if (connection != null) {
                connection.disconnect();
            }
        }
    }

    private JSObject readHeaders(HttpURLConnection connection) {
        JSObject result = new JSObject();
        for (Map.Entry<String, List<String>> entry : connection.getHeaderFields().entrySet()) {
            String name = entry.getKey();
            List<String> values = entry.getValue();
            if (name == null || values == null || values.isEmpty()) {
                continue;
            }
            result.put(name, String.join(", ", values));
        }
        return result;
    }

    /**
     * 统一在主线程发事件。
     *
     * 请求跑在后台线程（读 body 会长时间阻塞），而事件出口面向 WebView——
     * 不切主线程的话，不同设备上的分发行为没有保证。
     */
    private void emit(String event, JSObject payload) {
        getBridge().executeOnMainThread(() -> notifyListeners(event, payload));
    }
}
