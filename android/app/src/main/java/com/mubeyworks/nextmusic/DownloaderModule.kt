package com.mubeyworks.nextmusic

import android.os.Environment
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.ReadableMap
import com.facebook.react.modules.core.DeviceEventManagerModule
import okhttp3.OkHttpClient
import okhttp3.Request
import java.io.File
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit

// 原生流式下载：OkHttp GET → 边下边写文件 → 进度事件（替代 blob-util，兼容 New Arch）
class DownloaderModule(reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {
    override fun getName() = "Downloader"

    private val exec = Executors.newFixedThreadPool(4)
    private val client = OkHttpClient.Builder()
        .connectTimeout(15, TimeUnit.SECONDS)
        .readTimeout(30, TimeUnit.SECONDS)
        .followRedirects(true)
        .build()

    companion object {
        private val cancelled = ConcurrentHashMap<String, Boolean>()
        fun cancel(key: String) { cancelled[key] = true }
    }

    @ReactMethod
    fun cancelDownload(key: String) { cancelled[key] = true }

    @ReactMethod
    fun download(key: String, url: String, filePath: String, headers: ReadableMap?, promise: Promise) {
        exec.execute {
            val tmp = File("$filePath.part")
            try {
                val rb = Request.Builder().url(url)
                headers?.let { h ->
                    val iter = h.keySetIterator()
                    while (iter.hasNextKey()) {
                        val k = iter.nextKey()
                        rb.header(k, h.getString(k) ?: continue)
                    }
                }
                val resp = client.newCall(rb.build()).execute()
                if (!resp.isSuccessful) {
                    resp.close()
                    tmp.delete()
                    promise.reject("HTTP_" + resp.code, "HTTP ${resp.code}")
                    return@execute
                }
                val body = resp.body ?: run {
                    resp.close(); tmp.delete()
                    promise.reject("EMPTY", "响应为空"); return@execute
                }
                val total = body.contentLength()
                tmp.parentFile?.mkdirs()
                var received = 0L
                var lastEmit = 0L
                body.byteStream().use { input ->
                    tmp.outputStream().use { out ->
                        val buf = ByteArray(64 * 1024)
                        while (true) {
                            if (cancelled[key] == true) {
                                tmp.delete()
                                promise.reject("CANCELLED", "已取消")
                                return@execute
                            }
                            val n = input.read(buf)
                            if (n < 0) break
                            out.write(buf, 0, n)
                            received += n
                            val now = System.currentTimeMillis()
                            if (now - lastEmit > 250) {
                                lastEmit = now
                                emitProgress(key, received, total)
                            }
                        }
                        out.flush()
                    }
                }
                resp.close()
                if (received == 0L) {
                    tmp.delete()
                    promise.reject("EMPTY", "下载内容为空")
                    return@execute
                }
                val target = File(filePath)
                if (target.exists()) target.delete()
                if (!tmp.renameTo(target)) {
                    // 跨目录 rename 失败时复制
                    tmp.copyTo(target, overwrite = true)
                    tmp.delete()
                }
                emitProgress(key, received, received)
                promise.resolve((if (target.length() > 0) target.length() else received).toDouble())
            } catch (e: Exception) {
                tmp.delete()
                promise.reject("DL_ERROR", e.message ?: "下载失败", e)
            } finally {
                cancelled.remove(key)
            }
        }
    }

    private fun emitProgress(key: String, received: Long, total: Long) {
        val m = Arguments.createMap()
        m.putString("key", key)
        m.putDouble("received", received.toDouble())
        m.putDouble("total", total.toDouble())
        try {
            reactApplicationContext
                .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
                .emit("DownloaderProgress", m)
        } catch (_: IllegalStateException) { /* catalyst 未就绪 */ }
    }
}
