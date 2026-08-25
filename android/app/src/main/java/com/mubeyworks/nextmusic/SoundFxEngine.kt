package com.mubeyworks.nextmusic

import com.facebook.react.bridge.ReadableArray
import com.facebook.react.bridge.ReadableMap
import androidx.media3.common.audio.AudioProcessor
import java.util.concurrent.atomic.AtomicInteger

/**
 * 音效配置中心：JS 侧（soundfx.ts）通过 NativeModules.SoundFx.setConfig 写入，
 * SoundFxProcessor（ExoPlayer AudioProcessor 注入）在播放线程按 version 增量读取。
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

    /** 由 react-native-audio-pro 补丁通过反射调用（lib 模块不能编译期依赖 app 类） */
    @JvmStatic
    fun createProcessor(): AudioProcessor = SoundFxProcessor()

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
}
