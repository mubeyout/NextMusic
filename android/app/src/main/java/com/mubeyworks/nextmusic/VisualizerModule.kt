package com.mubeyworks.nextmusic

// lx112:系统输出频谱(Visualizer 全局会话)——真 FFT 驱动播放页水波(老板:律动要和频谱匹配,不要死的)
// 需 RECORD_AUDIO;权限由 JS 侧 PermissionsAndroid 请求
import android.media.audiofx.Visualizer
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.modules.core.DeviceEventManagerModule

class VisualizerModule(reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {
    private var viz: Visualizer? = null

    override fun getName() = "NMVisualizer"

    @ReactMethod
    fun start(promise: Promise) {
        try {
            if (viz != null) { promise.resolve(true); return }
            // lx115:优先播放 session(米电视全局混音采集恒零);拿不到回落全局
            val sessionId = try {
                dev.rnap.reactnativeaudiopro.AudioProPlaybackService.currentAudioSessionId()
            } catch (_: Throwable) { 0 }
            val v = if (sessionId != 0) Visualizer(sessionId) else Visualizer(0)
            v.captureSize = 256   // → 128 FFT bins
            v.setDataCaptureListener(object : Visualizer.OnDataCaptureListener {
                var last = 0L
                override fun onWaveFormDataCapture(viz: Visualizer, wave: ByteArray, samplingRate: Int) { /* 只用 FFT */ }
                override fun onFftDataCapture(viz: Visualizer, fft: ByteArray, samplingRate: Int) {
                    val now = System.currentTimeMillis()
                    if (now - last < 80) return // ~12fps 到 JS 足够驱动动画
                    last = now
                    val bins = Arguments.createArray()
                    for (b in 0 until 24) {
                        val i = 2 + b * 2 // fft[0]=DC [1]=Nyquist,跳过
                        if (i + 1 >= fft.size) break
                        val re = fft[i].toInt().toDouble()
                        val im = fft[i + 1].toInt().toDouble()
                        val mag = Math.sqrt(re * re + im * im)
                        bins.pushDouble(Math.min(1.0, mag / 180.0))
                    }
                    try {
                        reactApplicationContext
                            .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
                            .emit("NMVisualizer", Arguments.createMap().apply { putArray("bins", bins) })
                    } catch (_: Exception) { /* RN 上下文失效 */ }
                }
            }, 20000, false, true) // 20Hz 采集(JS 侧再节流 80ms)
            v.enabled = true
            viz = v
            promise.resolve(true)
        } catch (t: Throwable) {
            promise.reject("viz", t.message ?: "init failed")
        }
    }

    @ReactMethod
    fun stop() {
        try { viz?.enabled = false; viz?.release() } catch (_: Throwable) {}
        viz = null
    }
}
