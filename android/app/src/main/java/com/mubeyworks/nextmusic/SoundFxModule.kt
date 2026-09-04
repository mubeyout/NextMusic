package com.mubeyworks.nextmusic

import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.ReadableMap

/**
 * 均衡器与音效桥接：JS → SoundFxEngine（配置）→ SoundFxProcessor（DSP 生效）
 * isAttached 用于诊断：确认 audio-pro 补丁是否成功把处理器挂进 ExoPlayer 管线
 */
class SoundFxModule(reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {
    override fun getName() = "SoundFx"

    @ReactMethod
    fun setConfig(config: ReadableMap) {
        // lx55 救砖:原生桥线程异常会直接杀进程(JS try-catch 拦不住 mqt_v_native)。
        // 任何坏配置在此吞掉——音效失效可接受,启动循环闪退不可接受。
        try {
            SoundFxEngine.update(
                config.getArray("eq"),
                config.getMap("reverb"),
                config.getMap("panner"),
                config.getMap("viper"),
            )
        } catch (t: Throwable) {
            android.util.Log.w("AudioProFx", "setConfig ignored bad payload", t)
        }
    }

    /** lx53 响度补偿：系统音量比例（JS 侧音量监听回写） */
    @ReactMethod
    fun setVolumeRatio(ratio: Double) {
        SoundFxEngine.setVolumeRatio(ratio.toFloat())
    }

    @ReactMethod
    fun isAttached(promise: Promise) {
        promise.resolve(SoundFxEngine.processorAttached)
    }
}
