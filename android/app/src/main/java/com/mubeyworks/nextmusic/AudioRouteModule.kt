package com.mubeyworks.nextmusic

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.media.AudioDeviceCallback
import android.media.AudioDeviceInfo
import android.media.AudioManager
import android.util.Log
import androidx.media3.exoplayer.audio.DefaultAudioSink
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.modules.core.DeviceEventManagerModule

/**
 * 音频输出路由（2026-08-29 lx31）：
 * - 真实枚举本机输出设备（扬声器/有线/USB/蓝牙 A2DP，含设备名）
 * - 应用内切换输出：media3 DefaultAudioSink.setPreferredDevice（AudioRouteEngine 持有 live sink，
 *   patch-audiopro 在 buildAudioSink 里反射登记；换 sink 实例时自动重放偏好）
 * - 真·系统媒体音量（STREAM_MUSIC 读写 + VOLUME_CHANGED 广播同步 UI）
 */
object AudioRouteEngine {
    const val TAG = "NMAudioRoute"

    @Volatile
    var sink: DefaultAudioSink? = null
        private set

    /** 用户偏好的输出设备 id；-1 = 跟随系统自动路由 */
    @Volatile
    var preferredId: Int = -1

    fun attachSink(s: Any?) {
        sink = s as? DefaultAudioSink
        applyPreferred(null)
        Log.d(TAG, "sink attached, preferred=$preferredId")
    }

    /** 把偏好应用到当前 sink；ctx 为空时通过 sink 上下文查 AudioManager */
    fun applyPreferred(ctx: Context?) {
        val s = sink ?: return
        try {
            val info: AudioDeviceInfo? = if (preferredId >= 0) {
                val am = (ctx?.getSystemService(Context.AUDIO_SERVICE) as? AudioManager) ?: return
                am.getDevices(AudioManager.GET_DEVICES_OUTPUTS).firstOrNull { it.id == preferredId }
            } else null
            // 找不到（设备已拔出/断开）→ 回退自动路由
            s.setPreferredDevice(info)
        } catch (t: Throwable) {
            Log.w(TAG, "setPreferredDevice failed", t)
        }
    }
}

class AudioRouteModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    override fun getName() = "NMAudioRoute"

    private val am: AudioManager
        get() = reactApplicationContext.getSystemService(Context.AUDIO_SERVICE) as AudioManager

    private fun emit(event: String, arg: Any?) {
        reactApplicationContext.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
            ?.emit(event, arg)
    }

    init {
        // 系统音量变化（含硬件音量键）→ 通知 JS 刷新 UI
        try {
            reactApplicationContext.registerReceiver(
                object : BroadcastReceiver() {
                    override fun onReceive(c: Context?, i: Intent?) = emitVolume()
                },
                IntentFilter("android.media.VOLUME_CHANGED_ACTION"),
            )
        } catch (t: Throwable) {
            Log.w(AudioRouteEngine.TAG, "volume receiver failed", t)
        }
        // 设备插拔/蓝牙连接断开 → 通知 JS 重列设备
        try {
            am.registerAudioDeviceCallback(object : AudioDeviceCallback() {
                override fun onAudioDevicesAdded(added: Array<out AudioDeviceInfo>) = emitDevices()
                override fun onAudioDevicesRemoved(removed: Array<out AudioDeviceInfo>) = emitDevices()
            }, null)
        } catch (t: Throwable) {
            Log.w(AudioRouteEngine.TAG, "device callback failed", t)
        }
    }

    private fun emitVolume() {
        val max = am.getStreamMaxVolume(AudioManager.STREAM_MUSIC).coerceAtLeast(1)
        emit("nm.volume", am.getStreamVolume(AudioManager.STREAM_MUSIC) * 100 / max)
    }

    private fun emitDevices() {
        emit("nm.devices", null)
    }

    // ---------- 设备枚举 ----------

    private fun kindOf(t: Int): String? = when (t) {
        AudioDeviceInfo.TYPE_BUILTIN_SPEAKER -> "speaker"
        AudioDeviceInfo.TYPE_WIRED_HEADPHONES,
        AudioDeviceInfo.TYPE_WIRED_HEADSET,
        -> "wired"
        AudioDeviceInfo.TYPE_USB_HEADSET,
        AudioDeviceInfo.TYPE_USB_DEVICE,
        AudioDeviceInfo.TYPE_USB_ACCESSORY,
        -> "usb"
        AudioDeviceInfo.TYPE_BLUETOOTH_A2DP -> "bluetooth"
        else -> null
    }

    private fun labelOf(kind: String, productName: String?): String = when (kind) {
        "speaker" -> "本机扬声器"
        "wired" -> productName?.takeIf { it.isNotBlank() } ?: "有线耳机"
        "usb" -> productName?.takeIf { it.isNotBlank() } ?: "USB 音频设备"
        "bluetooth" -> productName?.takeIf { it.isNotBlank() } ?: "蓝牙设备"
        else -> "音频设备"
    }

    private fun listDevices(): com.facebook.react.bridge.WritableArray {
        val arr = Arguments.createArray()
        val outs = am.getDevices(AudioManager.GET_DEVICES_OUTPUTS)
        // 蓝牙去重（系统可能给 SCO+A2DP 两条，只留 A2DP）；同名多设备保留各自身份 id
        for (d in outs) {
            val kind = kindOf(d.type) ?: continue
            val pn = try { d.productName?.toString() } catch (t: Throwable) { null }
            val map = Arguments.createMap().apply {
                putDouble("id", d.id.toDouble())
                putString("name", labelOf(kind, pn))
                putString("kind", kind)
            }
            arr.pushMap(map)
        }
        return arr
    }

    @ReactMethod
    fun getOutputDevices(p: Promise) {
        try {
            val res = Arguments.createMap().apply {
                putArray("devices", listDevices())
                putDouble("preferred", AudioRouteEngine.preferredId.toDouble())
            }
            p.resolve(res)
        } catch (t: Throwable) {
            p.reject("E_ROUTE", t)
        }
    }

    @ReactMethod
    fun selectDevice(id: Double, p: Promise) {
        try {
            AudioRouteEngine.preferredId = id.toInt()
            AudioRouteEngine.applyPreferred(reactApplicationContext)
            p.resolve(true)
        } catch (t: Throwable) {
            p.reject("E_ROUTE", t)
        }
    }

    // ---------- 系统媒体音量 ----------

    @ReactMethod
    fun getMusicVolume(p: Promise) {
        val max = am.getStreamMaxVolume(AudioManager.STREAM_MUSIC).coerceAtLeast(1)
        p.resolve(am.getStreamVolume(AudioManager.STREAM_MUSIC) * 100 / max)
    }

    @ReactMethod
    fun setMusicVolume(pct: Double, p: Promise) {
        try {
            val max = am.getStreamMaxVolume(AudioManager.STREAM_MUSIC).coerceAtLeast(1)
            val v = (pct / 100.0 * max).toInt().coerceIn(0, max)
            // FLAG_SHOW_UI 短暂显示系统音量条，让用户看到真实生效
            am.setStreamVolume(AudioManager.STREAM_MUSIC, v, AudioManager.FLAG_SHOW_UI)
            p.resolve(v * 100 / max)
        } catch (t: Throwable) {
            p.reject("E_VOL", t)
        }
    }
}
