package com.regret.filesave;

import android.app.Activity;
import android.content.ContentResolver;
import android.content.Intent;
import android.net.Uri;

import androidx.activity.result.ActivityResult;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.IOException;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;

/**
 * 把一段文本交给系统的「另存为」，落成设备上的文件。
 *
 * 为什么需要它：Android WebView 不处理 {@code <a download href="blob:">}——点击既不下载也不报错，
 * 用户看到的是"按了没反应"（实测点完 /sdcard/Download 无新文件、logcat 无任何下载活动）。
 * Capacitor 自身的 60 个 Java 文件里没有任何 DownloadListener，这条路由没人接。
 *
 * 用 SAF 的 ACTION_CREATE_DOCUMENT 而不是往公共下载目录里写：不需要任何权限（API 24 到 36
 * 同一套代码），位置由用户自己选，还能存到 SD 卡或网盘；往 MediaStore 写则要为 API 29 以下
 * 再备一条需要存储权限的老路，那条路在本机无法验证。
 */
@CapacitorPlugin(name = "FileSave")
public class FileSavePlugin extends Plugin {

    /**
     * 同一时刻只允许一次保存。
     *
     * Capacitor 只记住"最后一次"活动回调对应的 {@link PluginCall}，并发保存会串味
     * （第二次的结果回给第一次的调用），因此第二次直接拒绝。
     */
    private boolean pending = false;

    @PluginMethod
    public void saveText(PluginCall call) {
        String fileName = call.getString("fileName");
        String text = call.getString("text");
        if (fileName == null || fileName.isEmpty() || text == null) {
            call.reject("fileName 与 text 必填");
            return;
        }
        if (pending) {
            call.reject("上一次保存还没结束");
            return;
        }

        Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT);
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        intent.setType(call.getString("mimeType", "application/json"));
        intent.putExtra(Intent.EXTRA_TITLE, fileName);

        pending = true;
        startActivityForResult(call, intent, "onSaveResult");
    }

    @ActivityCallback
    private void onSaveResult(PluginCall call, ActivityResult result) {
        pending = false;
        if (call == null) {
            return;
        }

        if (result.getResultCode() != Activity.RESULT_OK) {
            // 取消不是错误：JS 侧按 code 区分"用户放弃"与"保存失败"
            call.reject("已取消", "CANCELLED");
            return;
        }

        Intent data = result.getData();
        Uri uri = data == null ? null : data.getData();
        if (uri == null) {
            call.reject("没有拿到保存位置");
            return;
        }

        String text = call.getString("text", "");
        ContentResolver resolver = getContext().getContentResolver();
        try (OutputStream output = resolver.openOutputStream(uri)) {
            if (output == null) {
                call.reject("无法写入所选位置");
                return;
            }
            output.write(text.getBytes(StandardCharsets.UTF_8));
            output.flush();
        } catch (IOException error) {
            call.reject("写入失败：" + error.getMessage());
            return;
        }

        JSObject saved = new JSObject();
        saved.put("uri", uri.toString());
        call.resolve(saved);
    }
}
