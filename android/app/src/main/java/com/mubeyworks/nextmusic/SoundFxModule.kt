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
        SoundFxEngine.update(
            config.getArray("eq"),
            config.getMap("reverb"),
            config.getMap("panner"),
        )
    }

    @ReactMethod
    fun isAttached(promise: Promise) {
        promise.resolve(SoundFxEngine.processorAttached)
    }
}
