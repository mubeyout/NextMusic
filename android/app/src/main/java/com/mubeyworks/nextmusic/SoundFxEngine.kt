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

    // ---------- IR 卷积（当前激活的一个；切换混响时后台重建） ----------
    @Volatile
    var currentConvolver: IrConvolver.Stereo? = null
        private set

    @Volatile
    private var irReadyTag: String = "none@0"

    @Volatile
    private var irBuildingTag: String = ""

    private val irExecutor = Executors.newSingleThreadExecutor { r -> Thread(r, "SoundFx-IrLoader").apply { isDaemon = true } }

    /** 由 react-native-audio-pro 补丁通过反射调用（lib 模块不能编译期依赖 app 类） */
    @JvmStatic
    fun createProcessor(context: Context): AudioProcessor {
        appContext = context.applicationContext
        return SoundFxProcessor()
    }

    fun releaseConvolver() {
        synchronized(this) {
            currentConvolver = null
            irReadyTag = "none@0"
        }
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
     * 音频线程调用：若目标 IR 与当前不一致则调度后台构建（去重）。
     * 返回 true 表示已有可用卷积器（currentConvolver 非 null 且匹配）。
     */
    fun ensureConvolver(id: String, sampleRate: Int): Boolean {
        val tag = "$id@$sampleRate"
        val ctx = appContext ?: return false
        if (tag == irReadyTag) return currentConvolver != null
        // CAS 式占位：只有第一个发现不一致的调用能调度，防重复入队；
        // 构建完成/失败都把 irReadyTag 置为 tag（失败不重试，走 Freeverb 回退）
        if (irBuildingTag != tag) {
            irBuildingTag = tag
            irExecutor.execute {
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
                } catch (e: Throwable) {
                    android.util.Log.w("AudioProFx", "IR load failed for $id", e)
                }
                synchronized(this) {
                    if (irBuildingTag == tag) irBuildingTag = ""
                    irReadyTag = tag
                    currentConvolver = conv
                    version.incrementAndGet() // 让音频线程重新拾取
                }
            }
        }
        return false
    }
}
