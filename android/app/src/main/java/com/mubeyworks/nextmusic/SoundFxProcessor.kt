package com.mubeyworks.nextmusic

import androidx.media3.common.C
import androidx.media3.common.audio.AudioProcessor
import androidx.media3.common.audio.BaseAudioProcessor
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.util.Arrays
import kotlin.math.PI
import kotlin.math.atan2
import kotlin.math.ceil
import kotlin.math.cos
import kotlin.math.pow
import kotlin.math.sin

/**
 * 均衡器与音效 DSP 处理器 —— 按 lxserver Web 播放器 sound-effects.js 的设计对齐实现：
 *  - 10 段 peaking EQ（31Hz~16kHz，Q=1.4，±12dB，Web Audio peaking 双二阶公式）
 *  - 环境混响 14 种（Freeverb 算法近似 lxserver 的 IR 卷积；电话=带通；室内=50/65ms 早反射扩散；立体声系=Haas 展宽）
 *  - DRY/WET 增益混合（对应 lxserver mainGain/sendGain，0~300%）
 *  - 3D 立体环绕（equal-power 声像旋转 + 距离衰减，复刻 PannerNode equalpower 语义）
 *  - 音调升降由 ExoPlayer PlaybackParameters(Sonic) 处理，不入本处理器
 *
 * 处理链：Source → [电话带通] → EQ → (dry/wet 混响混合) → 3D声像 → Sonic(速度/音调) → 输出
 */
class SoundFxProcessor internal constructor() : BaseAudioProcessor() {

    companion object {
        val FREQS = intArrayOf(31, 62, 125, 250, 500, 1000, 2000, 4000, 8000, 16000)
        const val EQ_Q = 1.4f
        const val EQ_BANDS = 10

        enum class Mode { FREEVERB, TELEPHONE, SPREADER, WIDEN }

        /** 混响预设：room/damp/wet 为 Freeverb 参数，mode 决定附加处理 */
        data class ReverbPreset(val room: Float, val damp: Float, val wet: Float, val mode: Mode = Mode.FREEVERB)

        // 对齐 lxserver reverbOptions（id/名称一一对应；算法近似 IR 效果）
        val REVERBS = mapOf(
            "church" to ReverbPreset(0.96f, 0.15f, 0.80f),
            "hall" to ReverbPreset(0.84f, 0.30f, 0.72f),
            "cinema" to ReverbPreset(0.90f, 0.55f, 0.68f),
            "dining" to ReverbPreset(0.50f, 0.62f, 0.45f),
            "living" to ReverbPreset(0.55f, 0.12f, 0.50f),
            "matrix1" to ReverbPreset(0.68f, 0.05f, 0.62f),
            "matrix2" to ReverbPreset(0.74f, 0.30f, 0.68f),
            "spring" to ReverbPreset(0.60f, 0.90f, 0.55f),
            "spreader" to ReverbPreset(0.35f, 0.30f, 0.45f, Mode.SPREADER),
            "stereo" to ReverbPreset(0.30f, 0.25f, 0.38f, Mode.WIDEN),
            "cardiod" to ReverbPreset(0.45f, 0.25f, 0.42f, Mode.WIDEN),
            "magnetic" to ReverbPreset(0.28f, 0.35f, 0.28f, Mode.WIDEN),
            "telephone" to ReverbPreset(0.30f, 0.10f, 0.35f, Mode.TELEPHONE),
        )

        // Freeverb 经典调谐（44.1kHz 基准，按采样率缩放）
        private val COMB_TUNINGS = intArrayOf(1116, 1188, 1277, 1356, 1422, 1491, 1557, 1617)
        private val ALLPASS_TUNINGS = intArrayOf(556, 441, 341, 225)
        private const val STEREO_SPREAD = 23
    }

    // ---------- 运行态 ----------
    private var sampleRate = 44100
    private var channels = 2
    private var cachedVersion = -1
    private var eqActive = false
    private var reverbId = "none"
    private var mainGain = 1f
    private var sendGain = 0f
    private var pannerEnable = false
    private var pannerSpeed = 25
    private var pannerDistance = 5

    // EQ 双二阶（DF1）：每声道每段 [x1, x2, y1, y2]
    private val b0 = FloatArray(EQ_BANDS); private val b1 = FloatArray(EQ_BANDS); private val b2 = FloatArray(EQ_BANDS)
    private val a1 = FloatArray(EQ_BANDS); private val a2 = FloatArray(EQ_BANDS)
    private val eqState = Array(2) { Array(EQ_BANDS) { FloatArray(4) } }

    // 电话带通（高通 300 + 低通 3400，Q=0.7）
    private val bpHP = Array(2) { FloatArray(4) }
    private val bpLP = Array(2) { FloatArray(4) }
    private var hpB0 = 0f; private var hpB1 = 0f; private var hpB2 = 0f; private var hpA1 = 0f; private var hpA2 = 0f
    private var lpB0 = 0f; private var lpB1 = 0f; private var lpB2 = 0f; private var lpA1 = 0f; private var lpA2 = 0f

    // Freeverb
    private lateinit var combsL: Array<Comb>; private lateinit var combsR: Array<Comb>
    private lateinit var allpassL: Array<Allpass>; private lateinit var allpassR: Array<Allpass>

    // 扩散/展宽延迟线
    private lateinit var delayL50: DelayLine; private lateinit var delayL65: DelayLine
    private lateinit var delayR50: DelayLine; private lateinit var delayR65: DelayLine
    private lateinit var delayWidenL: DelayLine; private lateinit var delayWidenR: DelayLine

    // 3D 声像（避免逐帧分配）
    private var pannerAngleDeg = 0.0
    private var degPerSample = 0.0
    private var panL = 1f
    private var panR = 1f

    // PCM 中转
    private var floatBuf = FloatArray(4096)

    init {
        SoundFxEngine.processorAttached = true
    }

    // ---------- 配置 ----------
    private fun maybeRefreshConfig() {
        val v = SoundFxEngine.version.get()
        if (v == cachedVersion) return
        cachedVersion = v
        val c = SoundFxEngine.config
        eqActive = c.eqGains.any { kotlin.math.abs(it) > 0.01f }
        reverbId = c.reverbId
        mainGain = c.reverbMain
        sendGain = c.reverbSend
        pannerEnable = c.pannerEnable
        pannerSpeed = c.pannerSpeed.coerceIn(1, 50)
        pannerDistance = c.pannerDistance.coerceIn(1, 30)
        recomputeEq(c.eqGains)
        degPerSample = 100.0 / (pannerSpeed * sampleRate) // 1°/(speed*10ms)，同 lxserver
    }

    private fun recomputeEq(gains: FloatArray) {
        for (i in 0 until EQ_BANDS) {
            val g = gains[i].coerceIn(-12f, 12f)
            val a = 10.0.pow(g / 40.0).toFloat()
            val w0 = (2.0 * PI * FREQS[i] / sampleRate).toFloat()
            val cw = cos(w0); val sw = sin(w0)
            val alpha = sw / (2f * EQ_Q)
            val a0 = 1f + alpha / a
            b0[i] = (1f + alpha * a) / a0
            b1[i] = (-2f * cw) / a0
            b2[i] = (1f - alpha * a) / a0
            a1[i] = (-2f * cw) / a0
            a2[i] = (1f - alpha / a) / a0
        }
    }

    // ---------- AudioProcessor 生命周期 ----------
    override fun onConfigure(inputAudioFormat: AudioProcessor.AudioFormat): AudioProcessor.AudioFormat {
        val enc = inputAudioFormat.encoding
        val ch = inputAudioFormat.channelCount
        // 非 16bit PCM / 声道数不支持 → 返回 NOT_SET 让本处理器旁路（不影响播放）
        if (enc != C.ENCODING_PCM_16BIT || ch !in 1..2) {
            return AudioProcessor.AudioFormat.NOT_SET
        }
        sampleRate = inputAudioFormat.sampleRate
        channels = ch
        allocDspState()
        cachedVersion = -1 // 强制下次刷新系数
        return inputAudioFormat
    }

    private fun allocDspState() {
        val scale = sampleRate / 44100.0
        fun size(t: Int) = ceil(t * scale).toInt().coerceAtLeast(4)

        combsL = Array(COMB_TUNINGS.size) { Comb(size(COMB_TUNINGS[it])) }
        combsR = Array(COMB_TUNINGS.size) { Comb(size(COMB_TUNINGS[it] + STEREO_SPREAD)) }
        allpassL = Array(ALLPASS_TUNINGS.size) { Allpass(size(ALLPASS_TUNINGS[it])) }
        allpassR = Array(ALLPASS_TUNINGS.size) { Allpass(size(ALLPASS_TUNINGS[it] + STEREO_SPREAD)) }

        val d50 = (sampleRate * 50 / 1000).coerceAtLeast(4)
        val d65 = (sampleRate * 65 / 1000).coerceAtLeast(4)
        val dWiden = (sampleRate * 18 / 1000).coerceAtLeast(4)
        delayL50 = DelayLine(d50); delayL65 = DelayLine(d65)
        delayR50 = DelayLine(d50); delayR65 = DelayLine(d65)
        delayWidenL = DelayLine(dWiden); delayWidenR = DelayLine(dWiden)

        computeTelephoneCoeffs()
    }

    private fun computeTelephoneCoeffs() {
        // 高通 300Hz（Q=0.7）
        run {
            val f = 300.0; val q = 0.7
            val w0 = 2.0 * PI * f / sampleRate; val cw = cos(w0); val alpha = sin(w0) / (2 * q)
            val a0 = 1f + alpha
            hpB0 = ((1f + cw) / 2f / a0).toFloat(); hpB1 = (-(1f + cw) / a0).toFloat(); hpB2 = hpB0
            hpA1 = (-2f * cw / a0).toFloat(); hpA2 = ((1f - cw) / a0).toFloat()
        }
        // 低通 3400Hz（Q=0.7）
        run {
            val f = 3400.0; val q = 0.7
            val w0 = 2.0 * PI * f / sampleRate; val cw = cos(w0); val alpha = sin(w0) / (2 * q)
            val a0 = 1f + alpha
            lpB0 = ((1f + cw) / 2f / a0).toFloat(); lpB1 = ((1f + cw) / a0).toFloat(); lpB2 = lpB0
            lpA1 = (-2f * cw / a0).toFloat(); lpA2 = ((1f - cw) / a0).toFloat()
        }
    }

    override fun queueInput(inputBuffer: ByteBuffer) {
        maybeRefreshConfig()
        val preset = REVERBS[reverbId]
        // 注：选“关闭”(none) 不再释放卷积器——IR 缓存常驻，切回瞬时命中（2026-08-29）
        val bypass = !eqActive && reverbId == "none" && !pannerEnable
        if (bypass) {
            val remaining = inputBuffer.remaining()
            val out = replaceOutputBuffer(remaining)
            // 防御：pipeline 偶发把上次未消费完的 output 回喂为本次 input（src==this 时 put 抛 IllegalArgumentException）。
            // 同体时数据已在 output 位，保持 position/limit 不动；正常路径整体转移。
            if (out !== inputBuffer) {
                out.put(inputBuffer)
                out.flip()
            }
            return
        }

        inputBuffer.order(ByteOrder.nativeOrder())
        val total = inputBuffer.remaining() / 2 // 总采样数（含声道交织）
        if (floatBuf.size < total) floatBuf = FloatArray(total)
        var p = 0
        while (inputBuffer.hasRemaining() && p < total) {
            floatBuf[p++] = inputBuffer.short / 32768f
        }

        if (channels == 2) {
            var i = 0
            while (i < total) {
                var l = floatBuf[i]; var r = floatBuf[i + 1]
                if (eqActive) { l = eq(l, 0); r = eq(r, 1) }
                var wl = 0f; var wr = 0f
                if (preset != null) {
                    if (SoundFxEngine.ensureConvolver(reverbId, sampleRate)) {
                        // 真 IR 卷积（与 lxserver ConvolverNode 同源 IR）
                        val conv = SoundFxEngine.currentConvolver
                        if (conv != null) {
                            val (cl, cr) = conv.process(l, r)
                            wl = cl; wr = cr
                        }
                    } else when (preset.mode) {
                        Mode.TELEPHONE -> { l = telephone(l, 0); r = telephone(r, 1) }
                        Mode.SPREADER -> {
                            wl = 0.6f * delayL50.read() + 0.4f * delayL65.read() + 0.35f * freeverb((l + r) * 0.5f, preset)
                            wr = 0.6f * delayR50.read() + 0.4f * delayR65.read() + 0.35f * freeverb((l + r) * 0.5f, preset)
                            delayL50.write(l); delayL65.write(r); delayR50.write(r); delayR65.write(l)
                        }
                        Mode.WIDEN -> {
                            wl = 0.32f * delayWidenL.read() + 0.8f * freeverb((l + r) * 0.5f, preset)
                            wr = 0.32f * delayWidenR.read() + 0.8f * freeverb((l + r) * 0.5f, preset)
                            delayWidenL.write(r); delayWidenR.write(l)
                        }
                        else -> { val fr = freeverb((l + r) * 0.5f, preset); wl = fr; wr = fr }
                    }
                }
                l = mainGain * l + sendGain * wl
                r = mainGain * r + sendGain * wr
                if (pannerEnable) { updatePanner(); l *= panL; r *= panR }
                floatBuf[i] = l.coerceIn(-1f, 1f)
                floatBuf[i + 1] = r.coerceIn(-1f, 1f)
                i += 2
            }
        } else {
            for (i in 0 until total) {
                var x = floatBuf[i]
                if (eqActive) x = eq(x, 0)
                if (preset != null) {
                    if (SoundFxEngine.ensureConvolver(reverbId, sampleRate)) {
                        val conv = SoundFxEngine.currentConvolver
                        x = if (conv != null) mainGain * x + sendGain * conv.process(x, x).first * 0.7f
                        else mainGain * x
                    } else {
                        if (preset.mode == Mode.TELEPHONE) x = telephone(x, 0)
                        x = mainGain * x + sendGain * freeverb(x, preset) * 0.7f
                    }
                }
                if (pannerEnable) { updatePanner(); x *= (panL + panR) * 0.5f }
                floatBuf[i] = x.coerceIn(-1f, 1f)
            }
        }

        val out = replaceOutputBuffer(total * 2)
        out.order(ByteOrder.nativeOrder())
        for (i in 0 until total) out.putShort((floatBuf[i] * 32767f).toInt().toShort())
        out.flip()
    }

    override fun onFlush() {
        eqState.forEach { ch -> ch.forEach { Arrays.fill(it, 0f) } }
        bpHP.forEach { Arrays.fill(it, 0f) }; bpLP.forEach { Arrays.fill(it, 0f) }
        if (this::combsL.isInitialized) {
            combsL.forEach { it.clear() }; combsR.forEach { it.clear() }
            allpassL.forEach { it.clear() }; allpassR.forEach { it.clear() }
        }
        if (this::delayL50.isInitialized) {
            delayL50.clear(); delayL65.clear(); delayR50.clear(); delayR65.clear()
            delayWidenL.clear(); delayWidenR.clear()
        }
        pannerAngleDeg = 0.0
        SoundFxEngine.currentConvolver?.clear()
    }

    // ---------- DSP 单元 ----------
    /** DF1 级联 peaking EQ；st=[x1,x2,y1,y2] */
    private fun eq(x: Float, ch: Int): Float {
        var s = x
        for (b in 0 until EQ_BANDS) {
            val st = eqState[ch][b]
            val y = b0[b] * s + b1[b] * st[0] + b2[b] * st[1] - a1[b] * st[2] - a2[b] * st[3]
            st[1] = st[0]; st[0] = s; st[3] = st[2]; st[2] = y
            s = y
        }
        return s
    }

    /** 电话音：300~3400Hz 带通 */
    private fun telephone(x: Float, ch: Int): Float {
        val h = bpHP[ch]
        val y1 = hpB0 * x + hpB1 * h[0] + hpB2 * h[1] - hpA1 * h[2] - hpA2 * h[3]
        h[1] = h[0]; h[0] = x; h[3] = h[2]; h[2] = y1
        val lp = bpLP[ch]
        val y2 = lpB0 * y1 + lpB1 * lp[0] + lpB2 * lp[1] - lpA1 * lp[2] - lpA2 * lp[3]
        lp[1] = lp[0]; lp[0] = y1; lp[3] = lp[2]; lp[2] = y2
        return y2
    }

    private fun freeverb(input: Float, preset: ReverbPreset): Float {
        val feedback = 0.7f + preset.room * 0.28f
        val damp = preset.damp.coerceIn(0f, 1f)
        var outL = 0f
        for (i in combsL.indices) outL += combsL[i].process(input, damp, feedback)
        var outR = 0f
        for (i in combsR.indices) outR += combsR[i].process(input, damp, feedback)
        var w = (outL + outR) * 0.0625f * preset.wet
        for (i in allpassL.indices) w = allpassL[i].process(w)
        return w
    }

    /** 复刻 Web Audio PannerNode(equalpower)：声源绕头旋转 + 距离衰减 */
    private fun updatePanner() {
        pannerAngleDeg = (pannerAngleDeg + degPerSample) % 360.0
        val rad = Math.toRadians(pannerAngleDeg)
        val nx = sin(rad); val nz = cos(rad)
        val radius = pannerDistance * 0.1f
        // 距离增益（inverse 模型，refDistance=1）
        val distGain = if (radius <= 1f) 1f else 1f / radius
        // 方位角（听者朝 -z）：azimuth = atan2(x, -z)，钳到 ±90（equalpower 不区分前后）
        var az = Math.toDegrees(atan2(nx.toDouble(), -nz.toDouble()))
        if (az > 90.0) az = 90.0
        if (az < -90.0) az = -90.0
        val x = ((az + 90.0) / 180.0 * PI / 2.0).toFloat()
        panL = cos(x) * distGain
        panR = sin(x) * distGain
    }

    // ---------- 延迟单元 ----------
    private class Comb(val size: Int) {
        private val buf = FloatArray(size); private var idx = 0; private var store = 0f
        fun process(input: Float, damp: Float, feedback: Float): Float {
            val out = buf[idx]
            store = out * damp + store * (1f - damp)
            buf[idx] = input + store * feedback
            if (++idx >= size) idx = 0
            return out
        }
        fun clear() { Arrays.fill(buf, 0f); idx = 0; store = 0f }
    }

    private class Allpass(val size: Int) {
        private val buf = FloatArray(size); private var idx = 0
        fun process(input: Float): Float {
            val out = buf[idx]
            buf[idx] = input + out * 0.5f
            if (++idx >= size) idx = 0
            return out - input
        }
        fun clear() { Arrays.fill(buf, 0f); idx = 0 }
    }

    private class DelayLine(val size: Int) {
        private val buf = FloatArray(size); private var idx = 0
        fun read(): Float = buf[idx]
        fun write(v: Float) { buf[idx] = v; if (++idx >= size) idx = 0 }
        fun clear() { Arrays.fill(buf, 0f); idx = 0 }
    }
}
