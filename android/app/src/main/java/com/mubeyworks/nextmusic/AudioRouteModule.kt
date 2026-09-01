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
        Log.i(TAG, "sink attached, preferred=$preferredId")
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

    /** [1.0.5:route-watch] 实际路由设备 id（反射 DefaultAudioSink.audioTrack.getRoutedDevice，
     *  media3 1.6 字段名 audioTrack）；拿不到返回 -2 并留痕原因（无 sink/无 track/反射失败） */
    fun actualRoutedId(): Int {
        val s = sink ?: run { Log.i(TAG, "actualRoutedId: no sink attached"); return -2 }
        return try {
            val f = DefaultAudioSink::class.java.getDeclaredField("audioTrack")
            f.isAccessible = true
            val track = f.get(s) as? android.media.AudioTrack ?: run { Log.i(TAG, "actualRoutedId: no audioTrack"); return -2 }
            val dev = track.routedDevice ?: run { Log.i(TAG, "actualRoutedId: routedDevice null"); return -2 }
            dev.id
        } catch (t: Throwable) {
            Log.w(TAG, "actualRoutedId reflect failed: ${t.message}")
            -2
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
        // 设备插拔/蓝牙连接断开 → 通知 JS 重列设备；并启动抢路由哨兵（1.0.5）
        try {
            am.registerAudioDeviceCallback(object : AudioDeviceCallback() {
                override fun onAudioDevicesAdded(added: Array<out AudioDeviceInfo>) {
                    // 设备插拔/蓝牙重连后重放用户偏好,防止系统抢路由
                    AudioRouteEngine.applyPreferred(reactApplicationContext)
                    emitDevices()
                    scheduleRouteWatch()
                }
                override fun onAudioDevicesRemoved(removed: Array<out AudioDeviceInfo>) {
                    AudioRouteEngine.applyPreferred(reactApplicationContext)
                    emitDevices()
                    scheduleRouteWatch()
                }
            }, null)
        } catch (t: Throwable) {
            Log.w(AudioRouteEngine.TAG, "device callback failed", t)
        }
    }

    /** [1.0.5:route-watch] 抢路由哨兵：一加 ColorOS 实证——二路 A2DP（小爱音箱）上线后约 8s，
     *  MDM 主动 CREATE_AUDIO_PATCH 抢走媒体输出，无视 App 的 setPreferredDevice（且策略级
     *  setPreferredDeviceForStrategy 需 MODIFY_AUDIO_ROUTING 特权，API30 不跑/API34+ 空枪）。
     *  唯一能赢的姿势：重建 AudioTrack（新 track 初始化时自动重放存储的偏好）。
     *  设备变化后在 1.5~19s 窗口内延时多次比对 preferredId vs 实际路由（MDM 抢夺在 +8s 观测过，
     *  不能只查一次）；连续两次不符才通知 JS 重建（首次仅廉价重放偏好，多数 ROM 到这就够了）。 */
    private val routeWatchHandler = android.os.Handler(android.os.Looper.getMainLooper())
    private val routeWatchRunnables = ArrayList<Runnable>()
    @Volatile private var routeMismatchStreak = 0
    @Volatile private var routeWatchRearms = 0

    /** 设备变化触发首轮；rearm=true 为抢路由后追击轮（最多 3 轮，防与系统拉锯抽风） */
    private fun scheduleRouteWatch(rearm: Boolean = false) {
        synchronized(routeWatchRunnables) {
            if (rearm) {
                routeWatchRearms++
                if (routeWatchRearms > 3) {
                    Log.w(AudioRouteEngine.TAG, "route watch give up after $routeWatchRearms rounds (system keeps stealing)")
                    return
                }
                Log.i(AudioRouteEngine.TAG, "route watch re-arm round $routeWatchRearms")
            } else {
                routeWatchRearms = 0
            }
            routeWatchRunnables.forEach(routeWatchHandler::removeCallbacks)
            routeWatchRunnables.clear()
            routeMismatchStreak = 0
            longArrayOf(2000, 6000, 12000, 20000, 30000).forEach { d ->
                val r = Runnable { checkRouteSteal() }
                routeWatchRunnables.add(r)
                routeWatchHandler.postDelayed(r, d)
            }
        }
    }

    private fun checkRouteSteal() {
        val pref = AudioRouteEngine.preferredId
        if (pref < 0) { routeMismatchStreak = 0; return } // 跟随系统：系统路由就是用户要的
        val exists = am.getDevices(AudioManager.GET_DEVICES_OUTPUTS).any { it.id == pref }
        if (!exists) { routeMismatchStreak = 0; return } // 偏好设备已拔出/断开，applyPreferred 已回退自动
        val actual = AudioRouteEngine.actualRoutedId()
        // 每轮留痕：远程诊断靠这行日志看哨兵到底卡在哪一环
        Log.i(AudioRouteEngine.TAG, "route check: preferred=$pref actual=$actual streak=$routeMismatchStreak rearm=$routeWatchRearms")
        if (actual == -2 || actual == pref) { routeMismatchStreak = 0; return }
        routeMismatchStreak++
        Log.w(AudioRouteEngine.TAG, "route mismatch #$routeMismatchStreak: preferred=$pref actual=$actual -> re-apply")
        AudioRouteEngine.applyPreferred(reactApplicationContext)
        if (routeMismatchStreak >= 2) {
            Log.w(AudioRouteEngine.TAG, "route stolen (preferred=$pref actual=$actual) -> notify JS rebuild")
            try {
                val m = Arguments.createMap().apply {
                    putDouble("preferred", pref.toDouble())
                    putDouble("actual", actual.toDouble())
                }
                emit("nm.route.stolen", m)
            } catch (t: Throwable) {
                Log.w(AudioRouteEngine.TAG, "emit stolen failed", t)
            }
            routeMismatchStreak = 0 // JS 重建后重新计轮
            scheduleRouteWatch(rearm = true) // 追击：MDM 若在重建后再抢，继续兜（最多 3 轮）
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
            // [NextMusic:bt-route] API 34+:策略级路由双保险——部分 ROM(如 HyperOS)蓝牙连接时
            // 忽略 AudioTrack.setPreferredDevice,只有系统策略强制媒体输出才真正切到扬声器;
            // id<0(跟随系统)时清除策略偏好,交还系统自动路由。
            // 注:本仓 compileSdk 为 preview 渠道的 android-37,jar 缺此符号,只能反射调
            if (android.os.Build.VERSION.SDK_INT >= 34) {
                try {
                    val dev = if (id >= 0) {
                        am.getDevices(AudioManager.GET_DEVICES_OUTPUTS).firstOrNull { it.id == id.toInt() }
                    } else null
                    val attrs = android.media.AudioAttributes.Builder()
                        .setUsage(android.media.AudioAttributes.USAGE_MEDIA)
                        .setContentType(android.media.AudioAttributes.CONTENT_TYPE_MUSIC)
                        .build()
                    val adaCls = Class.forName("android.media.AudioDeviceAttributes")
                    if (dev != null) {
                        val ada = adaCls.getConstructor(android.media.AudioDeviceInfo::class.java).newInstance(dev)
                        val ok = AudioManager::class.java
                            .getMethod("setPreferredDeviceForStrategy", android.media.AudioAttributes::class.java, adaCls)
                            .invoke(am, attrs, ada)
                        Log.d(AudioRouteEngine.TAG, "strategy route -> id=${dev.id} type=${dev.type} ok=$ok")
                    } else {
                        AudioManager::class.java
                            .getMethod("clearPreferredDeviceForStrategy", android.media.AudioAttributes::class.java)
                            .invoke(am, attrs)
                        Log.d(AudioRouteEngine.TAG, "strategy route cleared (follow system)")
                    }
                } catch (t: Throwable) {
                    Log.w(AudioRouteEngine.TAG, "strategy route unavailable: ${t.message}")
                }
            }
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
