package com.mubeyworks.nextmusic

import kotlin.math.PI
import kotlin.math.abs
import kotlin.math.cos
import kotlin.math.exp
import kotlin.math.sin

/**
 * ViPER4Android 招牌效果复刻（lx50）——纯算法实现，无闭源二进制。
 *
 * 1. FireBass（Viper 低音）：心理声学低音增强。提取 <120Hz 基频，非线性生成
 *    2/3 次谐波（耳机发不出 40Hz 但能发 80/120Hz——大脑把谐波“脑补”成低音），
 *    谐波与干信号按比例混合。mode: 0=natural(轻度), 1=pure bass(重),
 *    2=clarity(中高频谐波,人声/乐器细节)。
 * 2. DCV（Dynamic System / 动态低电平细节）：软扩展器——小信号增益大、
 *    大信号增益 1（低于阈值的细节被抬起，响度感增强不破动态）。
 * 3. Cure+（Crossfeed 交叉馈送）：L 侧少量延迟+衰减混入 R 侧（反向亦然），
 *    模拟扬声器听音的串音，缓解耳机"超中央内压"声场。
 * 4. AnxLimiter（恒定限幅器）：软拐点 RMS 压缩 + 硬上限 brickwall，
 *    多效果叠加防爆音。
 *
 * 全部单精度浮点、逐样本无分配；onFlush 由宿主调用 state 清零。
 */
object ViperFx {

    // ---------- Fire Bass ----------
    class FireBass {
        var mode = 1            // 0 natural / 1 pure bass / 2 clarity
        var intensity = 0.5f    // 0~1
        // 谐波提取滤波器状态（2ch × [x1,x2,y1,y2]）
        private val lpState = Array(2) { FloatArray(4) }
        private val hpState = Array(2) { FloatArray(4) }
        private var lpB0 = 0f; private var lpB1 = 0f; private var lpB2 = 0f
        private var lpA1 = 0f; private var lpA2 = 0f
        private var hpB0 = 0f; private var hpB1 = 0f; private var hpB2 = 0f
        private var hpA1 = 0f; private var hpA2 = 0f

        fun init(sr: Int) {
            fun set(f: Double, q: Double, hp: Boolean) {
                val w0 = 2.0 * PI * f / sr; val cw = cos(w0); val alpha = sin(w0) / (2 * q)
                val a0 = 1 + alpha
                if (hp) {
                    hpB0 = ((1 + cw) / 2 / a0).toFloat(); hpB1 = (-(1 + cw) / a0).toFloat(); hpB2 = hpB0
                    hpA1 = (-2 * cw / a0).toFloat(); hpA2 = ((1 - cw) / a0).toFloat()
                } else {
                    lpB0 = ((1 - cw) / 2 / a0).toFloat(); lpB1 = ((1 - cw) / a0).toFloat(); lpB2 = lpB0
                    lpA1 = (-2 * cw / a0).toFloat(); lpA2 = ((1 + cw) / a0).toFloat()
                }
            }
            // 低音模式: 提取 <120Hz; clarity: 提取 1.5k~6kHz 中高频
            set(120.0, 0.7, false)
            set(if (mode == 2) 1500.0 else 120.0, 0.7, true)
        }

        private fun biquad(x: Float, st: FloatArray, b0: Float, b1: Float, b2: Float, a1: Float, a2: Float): Float {
            val y = b0 * x + b1 * st[0] + b2 * st[1] - a1 * st[2] - a2 * st[3]
            st[1] = st[0]; st[0] = x; st[3] = st[2]; st[2] = y
            return y
        }

        /** 逐样本；返回叠加了谐波激发的输出 */
        fun process(x: Float, ch: Int): Float {
            val k = intensity
            if (k < 0.01f) return x
            val band: Float = if (mode == 2) {
                // clarity: 带通 1.5k~6k 的中高频 → 谐波密度增强(人声/乐器"亮")
                val hp = biquad(x, hpState[ch], hpB0, hpB1, hpB2, hpA1, hpA2)
                biquad(hp, lpState[ch], lpB0, lpB1, lpB2, lpA1, lpA2).let {
                    // 用更高截止的低通近似 6k 带通上限:直接弱化
                    it * 0.6f
                }
            } else {
                // bass: <120Hz 基频
                biquad(biquad(x, hpState[ch], hpB0, hpB1, hpB2, hpA1, hpA2), lpState[ch], lpB0, lpB1, lpB2, lpA1, lpA2)
            }
            // 非线性谐波生成: soft saturation(双曲正切近似)产生 2/3 次谐波
            val drive = if (mode == 1) 3.0f else 1.8f
            val harmonics = (kotlin.math.tanh(band * drive) - kotlin.math.tanh(band * drive * 0.15f)) * 0.85f
            val mix = if (mode == 2) 0.9f else 0.75f
            return x + harmonics * k * mix
        }

        fun clear() { lpState.forEach { it.fill(0f) }; hpState.forEach { it.fill(0f) } }
    }

    // ---------- DCV 动态细节 ----------
    class Dcv {
        var enable = false
        var intensity = 0.5f      // 0~1
        // 包络跟随(attack 快 release 慢)
        private var env = 0f
        private var makeup = 1f

        /** 逐样本软扩展: |x|<thr 时 gain = 1+k*(1-|x|/thr) */
        fun process(x: Float): Float {
            if (!enable || intensity < 0.01f) return x
            val thr = 0.28f
            env = kotlin.math.max(abs(x), env * 0.9995f)
            val gain = if (env < thr) 1f + intensity * (1f - env / thr) * 0.9f else 1f
            // 平滑 makeup 防抽动
            makeup += (gain - makeup) * 0.0003f
            return x * makeup
        }

        fun clear() { env = 0f; makeup = 1f }
    }

    // ---------- Cure+ Crossfeed ----------
    class Cure {
        var enable = false
        var strength = 0.5f       // 0~1 (V4A Cure+ 0~100%)
        private var delayL = FloatArray(64); private var delayR = FloatArray(64)
        private var idx = 0
        private var dSamples = 16   // ~0.36ms @44.1k(V4A 典型 250~350μs)

        fun init(sr: Int) {
            dSamples = (sr * 0.00032f).toInt().coerceIn(8, 60)
        }

        /** 立体声交叉馈送:out = x - k*delay(对侧) + k*delay(本侧串音) */
        fun process(l: Float, r: Float, out: FloatArray) {
            if (!enable || strength < 0.01f) { out[0] = l; out[1] = r; return }
            val k = strength * 0.28f
            // 读对侧延迟历史
            val dl = delayL[idx]; val dr = delayR[idx]
            // 标准 crossfeed(Jan Meier 变体): 本侧 - k*对侧延迟 + 本侧低通延迟微量
            out[0] = l - k * dr + 0.10f * k * dl
            out[1] = r - k * dl + 0.10f * k * dr
            delayL[idx] = l; delayR[idx] = r
            idx = (idx + 1) % delayL.size.coerceAtMost(delayR.size)
        }

        fun clear() { delayL.fill(0f); delayR.fill(0f); idx = 0 }
    }

    // ---------- AnxLimiter 恒定限幅 ----------
    class AnxLimiter {
        var enable = false
        var ceiling = 0.95f       // 输出上限
        private var g = 1f
        private var env = 0f

        /** 逐样本: RMS 包络 → 超过 ceiling 的部分按 1/x 增益压缩(attack 快,release 慢) */
        fun process(x: Float): Float {
            if (!enable) return x
            env = kotlin.math.max(abs(x), env * 0.9992f)
            if (env > ceiling) {
                val target = ceiling / env
                g += (target - g) * 0.05f          // 平滑逼近,不喘息
            } else {
                g += (1f - g) * 0.0008f            // 慢恢复
            }
            val y = x * g
            return when {                          // brickwall 硬上限
                y > ceiling -> ceiling
                y < -ceiling -> -ceiling
                else -> y
            }
        }

        fun clear() { g = 1f; env = 0f }
    }

    /** 便捷: 全链默认关闭态 */
    class Chain {
        val bass = FireBass()
        val dcv = Dcv()
        val cure = Cure()
        val limiter = AnxLimiter()
        var anyActive = false

        fun init(sr: Int) { bass.init(sr); cure.init(sr) }

        fun stereoFrame(l0: Float, r0: Float, out: FloatArray) {
            var l = l0; var r = r0
            if (bass.intensity > 0.01f) { l = bass.process(l, 0); r = bass.process(r, 1) }
            if (dcv.enable) { l = dcv.process(l); r = dcv.process(r) }
            if (cure.enable) cure.process(l, r, out) else { out[0] = l; out[1] = r }
            if (limiter.enable) { out[0] = limiter.process(out[0]); out[1] = limiter.process(out[1]) }
        }

        fun clear() { bass.clear(); dcv.clear(); cure.clear(); limiter.clear() }
    }
}
