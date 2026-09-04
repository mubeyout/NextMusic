package com.mubeyworks.nextmusic

import java.io.InputStream
import java.nio.ByteBuffer
import java.nio.ByteOrder
import kotlin.math.ceil
import kotlin.math.cos
import kotlin.math.max
import kotlin.math.sin
import kotlin.math.sqrt

/**
 * 真 IR 卷积引擎 —— 复刻 lxserver Web 播放器的 ConvolverNode 用法：
 *  - IR 文件来自 lxserver public/music/assets/medias/filters/（44.1/48kHz，2/4ch，最长 4s）
 *  - 4 声道 IR 下混 stereo：(FL+BL)/2 / (FR+BR)/2
 *  - 48kHz IR 线性重采样到处理采样率
 *  - 能量归一化对齐 Web Audio ConvolverNode normalize=true 默认行为
 *  - uniform partitioned overlap-save + 频域延迟线（FDL）：
 *    每 N=1024 样本块只需 1 次 FFT + M 次复数 MAC + 1 次 IFFT（每声道）
 *    4s IR @44.1kHz ≈ 173 分区，实测开销远低于实时预算
 *
 * 湿声链：y = mainGain·x + sendGain·conv(x)，与 lxserver dry/wet 一致
 */
object IrConvolver {

    /** reverb id → IR 文件名（与 lxserver reverbOptions 一一对应；扩展名 .ir 规避 aapt2 对 wav 的打包损坏） */
    val IR_FILES = mapOf(
        "telephone" to "filter-telephone.ir",
        "church" to "s2_r4_bd.ir",
        "hall" to "bright-hall.ir",
        "cinema" to "cinema-diningroom.ir",
        "dining" to "dining-living-true-stereo.ir",
        "living" to "living-bedroom-leveled.ir",
        "spreader" to "spreader50-65ms.ir",
        "stereo" to "cardiod-35-10-spread.ir",
        "matrix1" to "matrix-reverb1.ir",
        "matrix2" to "matrix-reverb2.ir",
        "cardiod" to "cardiod-35-10-spread.ir",
        "magnetic" to "tim-omni-35-10-magnetic.ir",
        "spring" to "feedback-spring.ir",
        // lx51:Ssssakurrra KuGou-viper IR 包(浮点/24bit wav 已转 PCM16@44.1k,峰值归一;
        // 必须用 .ir 后缀——坑116:aapt2 会压缩损坏 assets 里的 .wav)
        "v_clear" to "Clear_.ir",               // 清澈增强
        "v_creek" to "Clear_石涧树林.ir",         // 石涧树林(自然空间)
        "v_resound2" to "Resound_立体声效增强_02.ir", // 立体声增强
        "v_surround" to "resound_立体声效环绕.ir", // 立体声环绕
        "v_valley" to "宽场混响_山谷.ir",          // 山谷宽场混响
        "v_presence" to "混响-临场.ir",           // 临场感
    )

    // ---------- WAV 解析（PCM16，RIFF） ----------
    class WavData(val sampleRate: Int, val channels: Int, val frames: Int, val pcm: ShortArray)

    fun parseWav(input: InputStream): WavData {
        val bytes = input.readBytes()
        var p = 0
        fun u32(): Int { val v = (bytes[p].toInt() and 0xFF) or ((bytes[p + 1].toInt() and 0xFF) shl 8) or ((bytes[p + 2].toInt() and 0xFF) shl 16) or ((bytes[p + 3].toInt() and 0xFF) shl 24); p += 4; return v }
        fun u16(): Int { val v = (bytes[p].toInt() and 0xFF) or ((bytes[p + 1].toInt() and 0xFF) shl 8); p += 2; return v }
        require(bytes.size >= 44 && String(bytes, 0, 4) == "RIFF") { "not RIFF" }
        p = 4; u32() // size
        require(String(bytes, p, 4) == "WAVE") { "not WAVE" }; p += 4
        var rate = 44100; var ch = 2; var bits = 16; var dataOff = -1; var dataLen = 0
        while (p + 8 <= bytes.size) {
            val id = String(bytes, p, 4); p += 4 // 读 chunk id 后必须推进 p（切片不消耗游标）
            val sz = u32()
            val body = p
            when (id) {
                "fmt " -> {
                    val audioFormat = u16(); ch = u16(); rate = u32(); u32(); u16(); bits = u16()
                    require(audioFormat == 1 || audioFormat == 3) { "unsupported format $audioFormat" }
                    require(bits == 16 && audioFormat == 1) { "only PCM16 supported (got $bits/$audioFormat)" }
                }
                "data" -> { dataOff = body; dataLen = sz }
            }
            p = body + sz + (sz and 1) // chunk 对齐
        }
        require(dataOff >= 0) { "no data chunk" }
        val frames = max(1, dataLen / (2 * ch))
        val buf = ByteBuffer.wrap(bytes, dataOff, frames * 2 * ch).order(ByteOrder.LITTLE_ENDIAN)
        val pcm = ShortArray(frames * ch)
        for (i in pcm.indices) pcm[i] = buf.short
        return WavData(rate, ch, frames, pcm)
    }

    /** 下混 stereo + 重采样 + 尾部静音裁剪 + 能量归一化 */
    fun loadStereoIr(input: InputStream, targetRate: Int): Pair<FloatArray, FloatArray> {
        val w = parseWav(input)
        val n = w.frames
        // 1) 下混 stereo
        val l = FloatArray(n); val r = FloatArray(n)
        when (w.channels) {
            1 -> for (i in 0 until n) { l[i] = w.pcm[i] / 32768f; r[i] = l[i] }
            2 -> for (i in 0 until n) { l[i] = w.pcm[i * 2] / 32768f; r[i] = w.pcm[i * 2 + 1] / 32768f }
            4 -> for (i in 0 until n) { // (FL+BL)/2, (FR+BR)/2，Web Audio quad→stereo 惯例
                l[i] = (w.pcm[i * 4] + w.pcm[i * 4 + 2]) / 2f / 32768f
                r[i] = (w.pcm[i * 4 + 1] + w.pcm[i * 4 + 3]) / 2f / 32768f
            }
            else -> for (i in 0 until n) { var acc = 0f; for (c in 0 until w.channels) acc += w.pcm[i * w.channels + c]; l[i] = acc / w.channels / 32768f; r[i] = l[i] }
        }
        // 2) 重采样（48k→44.1k 等）
        val li: FloatArray; val ri: FloatArray
        if (w.sampleRate != targetRate) {
            val ratio = w.sampleRate.toDouble() / targetRate
            val m = ceil(n / ratio).toInt()
            li = FloatArray(m); ri = FloatArray(m)
            for (i in 0 until m) {
                val src = i * ratio
                val i0 = src.toInt(); val i1 = minOf(i0 + 1, n - 1); val f = (src - i0).toFloat()
                li[i] = l[i0] * (1 - f) + l[i1] * f
                ri[i] = r[i0] * (1 - f) + r[i1] * f
            }
        } else { li = l; ri = r }
        // 3) 尾部裁剪（|h| < peak·1e-3 连续尾部砍掉，省 CPU）
        var peak = 0f
        for (v in li) if (kotlin.math.abs(v) > peak) peak = kotlin.math.abs(v)
        for (v in ri) if (kotlin.math.abs(v) > peak) peak = kotlin.math.abs(v)
        var end = li.size
        val thr = peak * 1e-3f
        outer@ while (end > 0) {
            for (i in (end - 1) downTo max(0, end - 1024)) {
                if (kotlin.math.abs(li[i]) > thr || kotlin.math.abs(ri[i]) > thr) { end = i + 1; break@outer }
            }
            end -= 1024
        }
        // 4) 能量归一化（对齐 ConvolverNode normalize 默认）
        var e = 0f
        for (i in 0 until end) e += li[i] * li[i] + ri[i] * ri[i]
        val norm = if (e > 0f) 1f / sqrt(e / 2f) else 1f
        val ol = FloatArray(end); val or = FloatArray(end)
        for (i in 0 until end) { ol[i] = li[i] * norm; or[i] = ri[i] * norm }
        return Pair(ol, or)
    }

    // ---------- FFT（迭代 radix-2） ----------
    class Fft(val n: Int) {
        private val levels = Integer.numberOfTrailingZeros(n)
        private val cosT = FloatArray(n / 2) { cos(2.0 * Math.PI * it / n).toFloat() }
        private val sinT = FloatArray(n / 2) { sin(2.0 * Math.PI * it / n).toFloat() }
        private val rev = IntArray(n) { Integer.reverse(it) ushr (32 - levels) }

        fun transform(re: FloatArray, im: FloatArray) {
            val n = this.n
            for (i in 0 until n) {
                val j = rev[i]
                if (j > i) {
                    var t = re[i]; re[i] = re[j]; re[j] = t
                    t = im[i]; im[i] = im[j]; im[j] = t
                }
            }
            var size = 2
            while (size <= n) {
                val half = size / 2
                val step = n / size
                var i = 0
                while (i < n) {
                    var k = 0
                    for (j in i until i + half) {
                        val l = j + half
                        val tre = re[l] * cosT[k] - im[l] * sinT[k]
                        val tim = re[l] * sinT[k] + im[l] * cosT[k]
                        re[l] = re[j] - tre; im[l] = im[j] - tim
                        re[j] += tre; im[j] += tim
                        k += step
                    }
                    i += size
                }
                size = size shl 1
            }
        }

        fun inverse(re: FloatArray, im: FloatArray) {
            transform(im, re) // 交换 re/im 实现逆变换
            val s = 1f / n
            for (i in 0 until n) { re[i] *= s; im[i] *= s }
        }
    }

    /** 单声道 partitioned overlap-save 卷积器（一个实例 = 一个输出通道） */
    class Channel(ir: FloatArray, blockN: Int = 1024) {
        private val n = blockN
        private val f = n * 2
        private val m = max(1, ceil(ir.size / n.toDouble()).toInt())
        private val fft = Fft(f)
        private val hRe = Array(m) { FloatArray(f) }
        private val hIm = Array(m) { FloatArray(f) }
        private val fdlRe = Array(m) { FloatArray(f) }
        private val fdlIm = Array(m) { FloatArray(f) }
        private var fdlPos = 0
        private val inBlockRe = FloatArray(f)
        private val inBlockIm = FloatArray(f)
        private val hist = FloatArray(n)
        private val outRe = FloatArray(f)
        private val outIm = FloatArray(f)
        private val ring = FloatArray(n)
        private var ringPos = 0
        private var inCount = 0
        private var accRe = FloatArray(f)
        private var accIm = FloatArray(f)

        init {
            // IR 分区预 FFT
            val tmpRe = FloatArray(f); val tmpIm = FloatArray(f)
            for (part in 0 until m) {
                val off = part * n
                val len = minOf(n, ir.size - off)
                System.arraycopy(ir, off, tmpRe, 0, len)
                java.util.Arrays.fill(tmpRe, len, f, 0f)
                java.util.Arrays.fill(tmpIm, 0, f, 0f)
                fft.transform(tmpRe, tmpIm)
                System.arraycopy(tmpRe, 0, hRe[part], 0, f)
                System.arraycopy(tmpIm, 0, hIm[part], 0, f)
            }
        }

        val partitions: Int get() = m

        /** 逐样本喂入并读出（输出滞后 n 样本 ≈ 23ms，混响场景无感） */
        fun process(x: Float): Float {
            // 读上一块对应的输出
            val y = ring[ringPos]
            // 累积输入块（overlap-save 布局：[hist n][new n]）
            val idx = n + inCount
            inBlockRe[idx] = x
            inCount++
            if (inCount == n) {
                // 移入历史 → FFT → FDL → MAC → IFFT → 取后 n
                System.arraycopy(inBlockRe, n, hist, 0, n)
                java.util.Arrays.fill(inBlockIm, 0, f, 0f)
                fft.transform(inBlockRe, inBlockIm)
                fdlPos = (fdlPos + 1) % m
                System.arraycopy(inBlockRe, 0, fdlRe[fdlPos], 0, f)
                System.arraycopy(inBlockIm, 0, fdlIm[fdlPos], 0, f)
                java.util.Arrays.fill(accRe, 0f); java.util.Arrays.fill(accIm, 0f)
                for (part in 0 until m) {
                    val d = (fdlPos - part + m) % m
                    val dr = fdlRe[d]; val di = fdlIm[d]
                    val hr = hRe[part]; val hi = hIm[part]
                    var k = 0
                    while (k < f) {
                        val xr = dr[k]; val xi = di[k]
                        accRe[k] += xr * hr[k] - xi * hi[k]
                        accIm[k] += xr * hi[k] + xi * hr[k]
                        k++
                    }
                }
                System.arraycopy(accRe, 0, outRe, 0, f)
                System.arraycopy(accIm, 0, outIm, 0, f)
                fft.inverse(outRe, outIm)
                System.arraycopy(outRe, n, ring, 0, n) // 取后半（无循环卷积污染）
                ringPos = 0
                // 准备下一块：history 保持在前半
                System.arraycopy(hist, 0, inBlockRe, 0, n)
                inCount = 0
            } else {
                ringPos++
            }
            return y
        }

        fun clear() {
            java.util.Arrays.fill(hist, 0f); java.util.Arrays.fill(ring, 0f)
            java.util.Arrays.fill(inBlockRe, 0f); java.util.Arrays.fill(inBlockIm, 0f)
            for (i in 0 until m) { java.util.Arrays.fill(fdlRe[i], 0f); java.util.Arrays.fill(fdlIm[i], 0f) }
            inCount = 0; ringPos = 0; fdlPos = 0
        }
    }

    /** 立体声卷积（对角：L×IR.L，R×IR.R —— Web Audio 2ch IR 语义） */
    class Stereo(irL: FloatArray, irR: FloatArray, blockN: Int = 1024) {
        private val chL = Channel(irL, blockN)
        private val chR = Channel(irR, blockN)
        val partitions: Int get() = chL.partitions
        val irSamples: Int = irL.size
        fun process(l: Float, r: Float): Pair<Float, Float> = Pair(chL.process(l), chR.process(r))
        fun clear() { chL.clear(); chR.clear() }
    }
}
