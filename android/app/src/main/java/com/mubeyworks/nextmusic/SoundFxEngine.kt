package com.mubeyworks.nextmusic

import com.facebook.react.bridge.ReadableArray
import com.facebook.react.bridge.ReadableMap
import android.content.Context
import androidx.media3.common.audio.AudioProcessor
import java.util.concurrent.atomic.AtomicInteger
import java.util.concurrent.Executors

/**
 * 音效配置中心：JS 侧（soundfx.ts）通过 NativeModules.SoundFx.setConfig 写入，
 * SoundFxProcessor（ExoPlayer AudioProcessor 注入）在播放线程按 version 增量读取。
 *
 * 真 IR 卷积：混响 IR 从 assets/sfx/filters/ 异步加载（后台线程 parse/重采样/分区 FFT），
 * 构建完成后 version++，音频线程零阻塞地取 currentConvolver；构建完成前用 Freeverb 近似垫底。
 *
 * 2026-08-29：IR 缓存改为 map（tag=id@rate），首次播放后后台预加载全部 13 个 IR——
 * 之后切混响瞬时命中（零断档）；选“关闭”不再清空卷积器（缓存常驻，约 3-5MB 内存）。
 */
object SoundFxEngine {

    data class Config(
        val eqGains: FloatArray = FloatArray(10),          // dB，-12~+12
        val reverbId: String = "none",
        val reverbMain: Float = 1f,                         // DRY 0~3
        val reverbSend: Float = 0f,                         // WET 0~3
        val pannerEnable: Boolean = false,
        val pannerSpeed: Int = 25,                          // 1~50
        val pannerDistance: Int = 5,                        // 1~30
    )

    @Volatile
    var config = Config()
        private set

    val version = AtomicInteger(0)

    @Volatile
    var processorAttached = false

    @Volatile
    private var appContext: Context? = null

    // ---------- IR 卷积缓存 ----------
    // currentConvolver：当前激活的一个（音频线程读）；irCache：全部已构建 IR（切回瞬时命中）
    @Volatile
    var currentConvolver: IrConvolver.Stereo? = null
        private set

    @Volatile
    private var irReadyTag: String = "none@0"

    @Volatile
    private var irBuildingTag: String = ""

    private val irCache = java.util.concurrent.ConcurrentHashMap<String, IrConvolver.Stereo>()

    private val preloadedRates =
        java.util.Collections.newSetFromMap(java.util.concurrent.ConcurrentHashMap<Int, Boolean>())

    private val irExecutor = Executors.newSingleThreadExecutor { r -> Thread(r, "SoundFx-IrLoader").apply { isDaemon = true } }

    /** 由 react-native-audio-pro 补丁通过反射调用（lib 模块不能编译期依赖 app 类） */
    @JvmStatic
    fun createProcessor(context: Context): AudioProcessor {
        appContext = context.applicationContext
        return SoundFxProcessor()
    }

    fun update(eq: ReadableArray?, reverb: ReadableMap?, panner: ReadableMap?) {
        val gains = FloatArray(10)
        if (eq != null) {
            for (i in 0 until minOf(10, eq.size())) {
                gains[i] = eq.getDouble(i).toFloat().coerceIn(-12f, 12f)
            }
        }
        val rid = reverb?.getString("id") ?: "none"
        val main = (reverb?.getDouble("mainGain") ?: 1.0).toFloat().coerceIn(0f, 3f)
        val send = (reverb?.getDouble("sendGain") ?: 0.0).toFloat().coerceIn(0f, 3f)
        val pEnable = panner?.getBoolean("enable") ?: false
        val pSpeed = (panner?.getInt("speed") ?: 25).coerceIn(1, 50)
        val pDist = (panner?.getInt("distance") ?: 5).coerceIn(1, 30)
        config = Config(gains, rid, main, send, pEnable, pSpeed, pDist)
        version.incrementAndGet()
    }

    /**
     * 音频线程调用：返回 true 表示已有可用卷积器（currentConvolver 非 null 且匹配）。
     * 1) 缓存命中 → 瞬时激活（预加载后常态，零构建等待）
     * 2) 同 tag 已就绪（none / 此前构建失败）→ 不重复构建，走 Freeverb 回退
     * 3) 不一致 → 后台构建（CAS 去重），并顺带调度全量预加载
     */
    fun ensureConvolver(id: String, sampleRate: Int): Boolean {
        val tag = "$id@$sampleRate"
        val ctx = appContext ?: return false
        irCache[tag]?.let {
            currentConvolver = it
            irReadyTag = tag
            return true
        }
        if (tag == irReadyTag) return currentConvolver != null
        if (irBuildingTag != tag) {
            irBuildingTag = tag
            irExecutor.execute {
                val conv = buildIr(ctx, id, sampleRate)
                synchronized(this) {
                    if (irBuildingTag == tag) irBuildingTag = ""
                    irReadyTag = tag
                    currentConvolver = conv
                    version.incrementAndGet() // 让音频线程重新拾取
                }
            }
            schedulePreloadAll(ctx, sampleRate)
        }
        return false
    }

    /** 单个 IR 构建（解析+重采样+分区 FFT），成功则进缓存；失败返回 null（不缓存，下次触发重试） */
    private fun buildIr(ctx: Context, id: String, sampleRate: Int): IrConvolver.Stereo? {
        var conv: IrConvolver.Stereo? = null
        try {
            val t0 = System.currentTimeMillis()
            val file = IrConvolver.IR_FILES[id]
            if (file != null) {
                ctx.assets.open("sfx/filters/$file").use { ins ->
                    val (il, ir) = IrConvolver.loadStereoIr(ins, sampleRate)
                    conv = IrConvolver.Stereo(il, ir)
                }
            }
            val dt = System.currentTimeMillis() - t0
            val c = conv
            android.util.Log.d(
                "AudioProFx",
                if (c != null) "IR loaded: $file ${c.irSamples}smp/${c.partitions}parts @${sampleRate}Hz in ${dt}ms"
                else "IR none for id=$id (${dt}ms)"
            )
            if (c != null) irCache["$id@$sampleRate"] = c
        } catch (e: Throwable) {
            android.util.Log.w("AudioProFx", "IR load failed for $id", e)
        }
        return conv
    }

    /** 首次播放后：把该采样率下全部 IR 预构建进缓存（同队列串行，当前 IR 优先构建） */
    private fun schedulePreloadAll(ctx: Context, sampleRate: Int) {
        if (!preloadedRates.add(sampleRate)) return
        irExecutor.execute {
            var n = 0
            for (id in IrConvolver.IR_FILES.keys) {
                val tag = "$id@$sampleRate"
                if (!irCache.containsKey(tag)) {
                    buildIr(ctx, id, sampleRate)?.let { n++ }
                }
            }
            android.util.Log.d("AudioProFx", "IR preload done @${sampleRate}Hz: +$n built, cache=${irCache.size}")
        }
    }
}
