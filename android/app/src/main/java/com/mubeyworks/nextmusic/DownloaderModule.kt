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

    // vc82：公共音乐目录下载（MediaStore Music/NextMusic，Android 10+；文件管理器可见、卸载不删）
    @ReactMethod
    fun downloadPublic(key: String, url: String, displayName: String, mime: String, headers: ReadableMap?, promise: Promise) {
        if (android.os.Build.VERSION.SDK_INT < 29) { promise.reject("NO_API29", "此系统版本不支持公共目录，请改用应用私有目录"); return }
        exec.execute {
            val resolver = reactApplicationContext.contentResolver
            var uri: android.net.Uri? = null
            try {
                val values = android.content.ContentValues().apply {
                    put(android.provider.MediaStore.MediaColumns.DISPLAY_NAME, displayName)
                    put(android.provider.MediaStore.MediaColumns.MIME_TYPE, mime)
                    put(android.provider.MediaStore.MediaColumns.RELATIVE_PATH, android.os.Environment.DIRECTORY_MUSIC + "/NextMusic")
                    put(android.provider.MediaStore.MediaColumns.IS_PENDING, 1)
                }
                val collection = android.provider.MediaStore.Audio.Media.getContentUri(android.provider.MediaStore.VOLUME_EXTERNAL_PRIMARY)
                uri = resolver.insert(collection, values) ?: throw IllegalStateException("MediaStore 插入失败")
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
                    resp.close(); resolver.delete(uri, null, null)
                    promise.reject("HTTP_" + resp.code, "HTTP ${resp.code}")
                    return@execute
                }
                val body = resp.body ?: run {
                    resp.close(); resolver.delete(uri, null, null)
                    promise.reject("EMPTY", "响应为空"); return@execute
                }
                val total = body.contentLength()
                var received = 0L
                var lastEmit = 0L
                resolver.openOutputStream(uri).use { out ->
                    body.byteStream().use { input ->
                        val buf = ByteArray(64 * 1024)
                        while (true) {
                            if (cancelled[key] == true) {
                                resolver.delete(uri, null, null)
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
                    resolver.delete(uri, null, null)
                    promise.reject("EMPTY", "下载内容为空")
                    return@execute
                }
                val done = android.content.ContentValues().apply { put(android.provider.MediaStore.MediaColumns.IS_PENDING, 0) }
                resolver.update(uri, done, null, null)
                emitProgress(key, received, received)
                val m = Arguments.createMap()
                m.putString("uri", uri.toString())
                m.putDouble("size", received.toDouble())
                promise.resolve(m)
            } catch (e: Exception) {
                uri?.let { try { resolver.delete(it, null, null) } catch (_: Exception) {} }
                promise.reject("DL_ERROR", e.message ?: "下载失败", e)
            } finally {
                cancelled.remove(key)
            }
        }
    }

    // vc82：删除公共目录记录（MediaStore）
    @ReactMethod
    fun removePublic(uriStr: String, promise: Promise) {
        try {
            val n = reactApplicationContext.contentResolver.delete(android.net.Uri.parse(uriStr), null, null)
            promise.resolve(n > 0)
        } catch (e: Exception) {
            promise.reject("DEL_ERROR", e.message ?: "删除失败", e)
        }
    }

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
