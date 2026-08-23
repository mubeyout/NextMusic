package com.mubeyworks.nextmusic

import android.content.ContentUris
import android.provider.MediaStore
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.WritableArray

// 设备音乐扫描：MediaStore.Audio 查询（READ_EXTERNAL_STORAGE / READ_MEDIA_AUDIO 授权后可用）
// 返回 content:// uri + 系统解析好的元数据（标题/歌手/专辑/时长）
class MusicScannerModule(reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {
    override fun getName() = "MusicScanner"

    @ReactMethod
    fun scan(promise: Promise) {
        try {
            val ctx = reactApplicationContext
            val collection = MediaStore.Audio.Media.EXTERNAL_CONTENT_URI
            val projection = arrayOf(
                MediaStore.Audio.Media._ID,
                MediaStore.Audio.Media.TITLE,
                MediaStore.Audio.Media.ARTIST,
                MediaStore.Audio.Media.ALBUM,
                MediaStore.Audio.Media.DURATION,
                MediaStore.Audio.Media.SIZE,
                MediaStore.Audio.Media.DATE_MODIFIED,
                MediaStore.Audio.Media.DATA,
            )
            val list: WritableArray = Arguments.createArray()
            ctx.contentResolver.query(
                collection, projection, null, null,
                "${MediaStore.Audio.Media.DATE_MODIFIED} DESC"
            )?.use { c ->
                while (c.moveToNext()) {
                    val id = c.getLong(0)
                    val durationMs = c.getLong(4)
                    // 过滤极短音频（<10s 的提示音/音效）
                    if (durationMs in 1 until 10000) continue
                    val m = Arguments.createMap()
                    m.putString("uri", ContentUris.withAppendedId(collection, id).toString())
                    m.putString("name", c.getString(1) ?: "")
                    m.putString("singer", c.getString(2)?.takeIf { it != "<unknown>" } ?: "本地音乐")
                    m.putString("album", c.getString(3) ?: "")
                    m.putDouble("durationMs", durationMs.toDouble())
                    m.putDouble("size", c.getLong(5).toDouble())
                    m.putDouble("mtime", c.getLong(6).toDouble())
                    m.putString("path", c.getString(7) ?: "")
                    list.pushMap(m)
                }
            }
            promise.resolve(list)
        } catch (e: Exception) {
            promise.reject("SCAN_ERROR", e.message ?: "media store query failed", e)
        }
    }
}
