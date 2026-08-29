package com.mubeyworks.nextmusic

import android.util.Log
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReadableMap
import com.facebook.react.bridge.WritableMap
import com.facebook.react.modules.core.DeviceEventManagerModule
import java.io.BufferedInputStream
import java.io.BufferedOutputStream
import java.io.ByteArrayOutputStream
import java.net.DatagramPacket
import java.net.DatagramSocket
import java.net.InetAddress
import java.net.InetSocketAddress
import java.net.Socket
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.util.UUID
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.atomic.AtomicLong
import java.util.concurrent.atomic.AtomicReference

/**
 * AirPlay 音频投送（lx33）：经典 RAOP 协议，手机作音频源实时推流（L16/44.1k 裸 PCM，同 pyatv 方案，
 * 无需 ALAC 编码器；AirPlay 2 音箱普遍兼容经典音频流）。
 *
 * - 发现：mDNS _raop._tcp（MdnsScanner）
 * - 会话：RTSP/TCP（OPTIONS→ANNOUNCE(SDP)→SETUP→RECORD→FLUSH），TEARDOWN 收尾
 * - 音频：RTP/UDP 352 帧/包（≈8ms），首包 0xE0 后续 0x60；同步包 0xD4 每秒（首个 0x90）
 *   打到 receiver control_port；timing 口应答 receiver 的对时请求（0xD2→0xD3）
 * - 数据源：SoundFxProcessor 输出端 tap（DSP 后 PCM，任意 sink 采样率线性重采样到 44.1k 立体声）；
 *   tap 激活时本机输出静音（扬声器不出声，防双唱）
 * - 音量：SET_PARAMETER volume（dB，0..-30）
 */
class AirPlayModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    override fun getName() = "NMAirPlay"

    companion object {
        const val TAG = "NMAirPlay"
        const val SAMPLE_RATE = 44100
        const val FRAMES_PER_PACKET = 352
        const val LATENCY_SAMPLES = 11025 // 0.25s：同步包第一个字段的提前量
        const val BYTES_PER_FRAME = 4 // L16 立体声 16bit
        const val PACKET_US = FRAMES_PER_PACKET * 1_000_000L / SAMPLE_RATE
        const val RING_FRAMES = SAMPLE_RATE * 3 // 3s 环形缓冲（容 1-2s 抖动）

        // ---- PCM tap 入口（SoundFxProcessor 音频线程调用，绝不阻塞）----
        private val sessionRef = AtomicReference<RaopSession?>(null)

        fun tap(buf: ByteBuffer, channels: Int, rate: Int) {
            val s = sessionRef.get() ?: return
            try { s.feed(buf, channels, rate) } catch (t: Throwable) { Log.w(TAG, "tap err", t) }
        }

        val tapActive: Boolean get() = sessionRef.get() != null

        fun ntpNow(): Long {
            val now = System.currentTimeMillis()
            val sec = now / 1000 + 0x83AA7E80L
            val frac = (now % 1000) * 0x100000000L / 1000
            return (sec shl 32) or frac
        }
    }

    private val exec = Executors.newCachedThreadPool { r ->
        Thread(r, "nmairplay-worker").apply { isDaemon = true }
    }

    private fun emit(event: String, arg: Any?) {
        reactApplicationContext.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
            ?.emit(event, arg)
    }

    // ---------------- 发现 ----------------

    private var scanner: MdnsScanner? = null

    @com.facebook.react.bridge.ReactMethod
    fun startDiscovery() {
        if (scanner != null) return
        val s = MdnsScanner(reactApplicationContext.applicationContext, onDevice = { d ->
            if (d.service != "_raop._tcp") return@MdnsScanner
            val map: WritableMap = Arguments.createMap().apply {
                putString("uuid", "raop:${d.instance}")
                putString("name", d.name)
                putString("host", d.ip)
                putInt("port", d.port)
            }
            Log.d(TAG, "airplay device: ${d.name} @ ${d.ip}:${d.port}")
            emit("airplay.found", map)
        }, onEnd = {
            scanner = null
            emit("airplay.scanEnd", null)
        })
        scanner = s
        s.start(listOf("_raop._tcp.local"))
    }

    @com.facebook.react.bridge.ReactMethod
    fun stopDiscovery() {
        scanner?.stop()
        scanner = null
    }

    // ---------------- RAOP 会话 ----------------

    private inner class RaopSession(dev: ReadableMap) {
        val host = dev.getString("host") ?: ""
        val port = if (dev.hasKey("port")) dev.getInt("port") else 7000
        val sessionId = (System.currentTimeMillis() and 0xFFFFFFFFL).toInt()
        val dacpId = UUID.randomUUID().toString().replace("-", "").uppercase().take(16)
        val activeRemote = (System.currentTimeMillis() and 0xFFFFFFFFL).toInt()

        var sock: Socket? = null
        var out: BufferedOutputStream? = null
        var input: BufferedInputStream? = null
        var cseq = 0
        private val rtspLock = Any() // 请求/应答串行化：避免 setVolume 与 feedback 线程交叉读写

        // 对端端口（SETUP 应答解析）
        var serverPort = 0
        var controlPort = 0
        var timingPort = 0
        var rtspSession = ""

        // 本地 UDP
        var audioSock: DatagramSocket? = null
        var controlSock: DatagramSocket? = null
        var timingSock: DatagramSocket? = null
        var peer: InetAddress? = null

        // 音频状态
        var seq = (System.currentTimeMillis() and 0xFFFF).toInt()
        var startRtpTs = (System.currentTimeMillis() * SAMPLE_RATE / 1000).toInt() and 0x7FFFFFFF
        var rtpTs = startRtpTs // 已发送的最后一包时间戳
        var ssrc = sessionId
        var firstAudio = true
        @Volatile var running = true
        var volumePct = -1.0 // 未设置

        // 环形缓冲（输出域：44.1k 立体声 16bit BE 字节）
        val ring = ByteArray(RING_FRAMES * BYTES_PER_FRAME)
        var wPos = 0
        var rPos = 0

        // 重采样状态（sinkRate -> 44100）
        var resPrevL = 0.0
        var resPrevR = 0.0
        var resP = 1.0 // 下一个输出样本在输入域的位置（相对当前输入样本索引，>=1 表示无待插值）
        var resRate = 0

        val paceThread = Thread({ paceLoop() }, "nmairplay-pace")
        val syncThread = Thread({ syncLoop() }, "nmairplay-sync")
        val timingThread = Thread({ timingLoop() }, "nmairplay-timing")
        val feedbackThread = Thread({ feedbackLoop() }, "nmairplay-keepalive")

        // ---------------- RTSP ----------------

        private fun localIp(): String = sock?.localAddress?.hostAddress ?: "0.0.0.0"
        private val uri get() = "rtsp://${localIp()}/$sessionId"

        fun rtsp(method: String, extraHeaders: Map<String, String> = emptyMap(), body: ByteArray? = null, contentType: String? = null, path: String? = null): Triple<Int, Map<String, String>, String> = synchronized(rtspLock) {
            val o = out ?: throw RuntimeException("rtsp: closed")
            val b = ByteArrayOutputStream()
            fun w(s: String) = b.write(s.toByteArray(Charsets.ISO_8859_1))
            w("$method ${path ?: uri} RTSP/1.0\r\n")
            w("CSeq: ${++cseq}\r\n")
            w("User-Agent: AirPlay/550.10\r\n")
            w("DACP-ID: $dacpId\r\n")
            w("Active-Remote: $activeRemote\r\n")
            w("Client-Instance: $dacpId\r\n")
            for ((k, v) in extraHeaders) w("$k: $v\r\n")
            if (body != null) {
                w("Content-Length: ${body.size}\r\n")
                w("Content-Type: $contentType\r\n")
            }
            w("\r\n")
            b.write(body ?: ByteArray(0))
            synchronized(o) { o.write(b.toByteArray()); o.flush() }

            // 读应答（行头 + Content-Length 体）
            val headers = HashMap<String, String>()
            val inp = input ?: throw RuntimeException("rtsp: closed")
            var status = -1
            synchronized(inp) {
                var line = readLine(inp)
                if (line.isEmpty()) line = readLine(inp) // 容忍前导空行
                status = Regex("RTSP/1\\.0 (\\d+)").find(line)?.groupValues?.get(1)?.toInt() ?: -1
                while (true) {
                    val h = readLine(inp)
                    if (h.isEmpty()) break
                    val idx = h.indexOf(':')
                    if (idx > 0) headers[h.substring(0, idx).trim().lowercase()] = h.substring(idx + 1).trim()
                }
                val cl = headers["content-length"]?.toIntOrNull() ?: 0
                val respBody = if (cl > 0) {
                    val bb = ByteArray(cl)
                    var got = 0
                    while (got < cl) {
                        val n = inp.read(bb, got, cl - got)
                        if (n < 0) break
                        got += n
                    }
                    String(bb, 0, got, Charsets.ISO_8859_1)
                } else ""
                Triple(status, headers, respBody)
            }
        }

        private fun readLine(inp: BufferedInputStream): String {
            val sb = StringBuilder()
            while (true) {
                val c = inp.read()
                if (c < 0 || c == '\n'.code) break
                if (c != '\r'.code) sb.append(c.toChar())
            }
            return sb.toString()
        }

        fun handshake() {
            sock = Socket().apply {
                tcpNoDelay = true
                connect(InetSocketAddress(host, port), 5000)
                soTimeout = 8000
            }
            out = BufferedOutputStream(sock!!.getOutputStream())
            input = BufferedInputStream(sock!!.getInputStream())
            peer = InetAddress.getByName(host)

            audioSock = DatagramSocket().apply { soTimeout = 200 }
            controlSock = DatagramSocket().apply { soTimeout = 200 }
            timingSock = DatagramSocket()

            val (st1, _, _) = rtsp("OPTIONS")
            if (st1 != 200) throw RuntimeException("airplay: OPTIONS $st1")

            val sdp = buildString {
                append("v=0\r\n")
                append("o=iTunes $sessionId 0 IN IP4 ${localIp()}\r\n")
                append("s=iTunes\r\n")
                append("c=IN IP4 $host\r\n")
                append("t=0 0\r\n")
                append("m=audio 0 RTP/AVP 96\r\n")
                append("a=rtpmap:96 L16/$SAMPLE_RATE/2\r\n")
                append("a=fmtp:96 $FRAMES_PER_PACKET 0 16 40 10 14 2 255 0 0 $SAMPLE_RATE\r\n")
            }.toByteArray(Charsets.ISO_8859_1)
            val (st2, _, _) = rtsp("ANNOUNCE", body = sdp, contentType = "application/sdp")
            if (st2 != 200) throw RuntimeException("airplay: ANNOUNCE $st2（设备可能要求加密/配对）")

            val transport = "RTP/AVP/UDP;unicast;interleaved=0-1;mode=record;" +
                "control_port=${controlSock!!.localPort};timing_port=${timingSock!!.localPort}"
            val (st3, h3, _) = rtsp("SETUP", mapOf("Transport" to transport))
            if (st3 != 200) throw RuntimeException("airplay: SETUP $st3")
            val respTransport = h3["transport"] ?: ""
            fun tparam(k: String): Int = Regex("$k=(\\d+)").find(respTransport)?.groupValues?.get(1)?.toIntOrNull() ?: 0
            serverPort = tparam("server_port")
            controlPort = tparam("control_port")
            timingPort = tparam("timing_port")
            rtspSession = h3["session"]?.substringBefore(';') ?: ""
            if (serverPort == 0) throw RuntimeException("airplay: no server_port in SETUP response")

            val (st4, _, _) = rtsp(
                "RECORD",
                mapOf("Range" to "npt=0-", "Session" to rtspSession),
            )
            if (st4 != 200) throw RuntimeException("airplay: RECORD $st4")
            val (st5, _, _) = rtsp(
                "FLUSH",
                mapOf("Range" to "npt=0-", "Session" to rtspSession, "RTP-Info" to "seq=$seq;rtptime=$rtpTs"),
            )
            if (st5 != 200) Log.w(TAG, "airplay: FLUSH $st5（忽略）")

            // 会话音量拉满（音量由 App 音量条控制）
            try { setVolumeInternal(100.0) } catch (_: Throwable) {}
        }

        fun setVolumeInternal(pct: Double) {
            val db = if (pct >= 99.5) 0.0 else -30.0 * (100.0 - pct) / 100.0
            val body = "volume: ${"%.2f".format(db)}\r\n".toByteArray(Charsets.ISO_8859_1)
            val (st, _, _) = rtsp("SET_PARAMETER", mapOf("Session" to rtspSession, "Content-Type" to "text/parameters"), body, "text/parameters")
            if (st != 200) throw RuntimeException("airplay: SET_PARAMETER $st")
            volumePct = pct
        }

        fun teardown() {
            running = false
            try { rtsp("TEARDOWN", mapOf("Session" to rtspSession)) } catch (_: Throwable) {}
            try { sock?.close() } catch (_: Throwable) {}
            try { audioSock?.close() } catch (_: Throwable) {}
            try { controlSock?.close() } catch (_: Throwable) {}
            try { timingSock?.close() } catch (_: Throwable) {}
        }

        // ---------------- PCM 供给（音频线程；tap 调用）----------------

        @Synchronized
        fun feed(buf: ByteBuffer, channels: Int, rate: Int) {
            if (!running) return
            buf.order(ByteOrder.nativeOrder())
            val rem = buf.remaining()
            val frames = rem / 2 / channels
            if (frames <= 0) return
            val shorts = ShortArray(frames * channels)
            buf.asShortBuffer().get(shorts) // 消费整个 buffer 的读视图

            if (rate == SAMPLE_RATE && channels == 2) {
                // 快路径：直接 BE 写环
                synchronized(ring) {
                    var i = 0
                    while (i + 1 < shorts.size) {
                        putBE((shorts[i].toInt() and 0xFFFF), (shorts[i + 1].toInt() and 0xFFFF))
                        i += 2
                    }
                }
                return
            }
            // 重采样（任意率 -> 44100）+ 单声道转立体声
            if (resRate != rate) { resRate = rate; resPrevL = 0.0; resPrevR = 0.0; resP = 1.0 }
            val step = rate.toDouble() / SAMPLE_RATE
            synchronized(ring) {
                for (f in 0 until frames) {
                    val curL: Double
                    val curR: Double
                    if (channels == 1) { curL = shorts[f] / 32768.0; curR = curL }
                    else { curL = shorts[f * 2] / 32768.0; curR = shorts[f * 2 + 1] / 32768.0 }
                    // 发射 resP 到 1 之间的插值输出
                    var p = resP
                    while (p < 1.0) {
                        val t = p
                        val l = resPrevL + (curL - resPrevL) * t
                        val r = resPrevR + (curR - resPrevR) * t
                        putBE((l * 32767.0).toInt().coerceIn(-32768, 32767), (r * 32767.0).toInt().coerceIn(-32768, 32767))
                        p += step
                    }
                    resP = p - 1.0
                    resPrevL = curL; resPrevR = curR
                }
            }
        }

        private fun putBE(l: Int, r: Int) {
            // 满则丢最老一帧（保持低延迟）
            if (filledFrames() >= RING_FRAMES) {
                rPos = (rPos + BYTES_PER_FRAME) % ring.size
            }
            ring[wPos] = (l shr 8).toByte(); ring[(wPos + 1) % ring.size] = (l and 0xFF).toByte()
            ring[(wPos + 2) % ring.size] = (r shr 8).toByte(); ring[(wPos + 3) % ring.size] = (r and 0xFF).toByte()
            wPos = (wPos + BYTES_PER_FRAME) % ring.size
        }

        private fun filledFrames(): Int {
            val f = wPos - rPos
            return (if (f < 0) f + ring.size else f) / BYTES_PER_FRAME
        }

        @Synchronized
        private fun takePacket(out: ByteArray): Boolean { // false = 缓冲空，发静音包
            val n = FRAMES_PER_PACKET * BYTES_PER_FRAME
            synchronized(ring) {
                if (rPos == wPos) return false
                var i = 0
                while (i < n) {
                    out[i] = ring[rPos]
                    rPos = (rPos + 1) % ring.size
                    if (rPos == wPos) { // 环空：剩余补零
                        i++
                        while (i < n) { out[i] = 0; i++ }
                        return true
                    }
                    i++
                }
                return true
            }
        }

        // ---------------- 线程 ----------------

        private fun paceLoop() {
            val payload = ByteArray(FRAMES_PER_PACKET * BYTES_PER_FRAME)
            var next = System.nanoTime()
            try {
                while (running) {
                    val now = System.nanoTime()
                    val waitUs = (next - now) / 1000
                    if (waitUs > 1500) {
                        Thread.sleep((waitUs - 1200) / 1000, ((waitUs - 1200) % 1000).toInt() * 1000)
                        continue
                    }
                    if (waitUs < -100_000) next = now // 落后超 100ms：重同步时钟
                    val got = takePacket(payload)
                    if (!got) java.util.Arrays.fill(payload, 0)

                    val pkt = ByteArray(12 + payload.size)
                    pkt[0] = 0x80.toByte()
                    pkt[1] = (if (firstAudio) 0xE0 else 0x60).toByte()
                    firstAudio = false
                    pkt[2] = ((seq shr 8) and 0xFF).toByte(); pkt[3] = (seq and 0xFF).toByte()
                    seq = (seq + 1) and 0xFFFF
                    pkt[4] = ((rtpTs shr 24) and 0xFF).toByte(); pkt[5] = ((rtpTs shr 16) and 0xFF).toByte()
                    pkt[6] = ((rtpTs shr 8) and 0xFF).toByte(); pkt[7] = (rtpTs and 0xFF).toByte()
                    pkt[8] = ((ssrc shr 24) and 0xFF).toByte(); pkt[9] = ((ssrc shr 16) and 0xFF).toByte()
                    pkt[10] = ((ssrc shr 8) and 0xFF).toByte(); pkt[11] = (ssrc and 0xFF).toByte()
                    System.arraycopy(payload, 0, pkt, 12, payload.size)
                    rtpTs += FRAMES_PER_PACKET
                    audioSock?.send(DatagramPacket(pkt, pkt.size, peer, serverPort))
                    next += PACKET_US
                }
            } catch (t: Throwable) {
                if (running) { Log.w(TAG, "pace loop died", t); onTransportDead() }
            }
        }

        private fun syncLoop() {
            var first = true
            try {
                while (running) {
                    // 第一个字段：当前已发送时间戳 - latency（提前量）；NTP 对应“现在”的 RTP 域时间
                    val rtpNow = rtpTs
                    val ntp = ntpNow()
                    val sec = (ntp shr 32).toInt()
                    val frac = (ntp and 0xFFFFFFFFL).toInt()
                    val pkt = ByteArray(20)
                    pkt[0] = (if (first) 0x90 else 0x80).toByte()
                    pkt[1] = 0xD4.toByte()
                    pkt[2] = 0x00; pkt[3] = 0x07
                    writeU32(pkt, 4, rtpNow - LATENCY_SAMPLES)
                    writeU32(pkt, 8, sec)
                    writeU32(pkt, 12, frac)
                    writeU32(pkt, 16, rtpNow)
                    first = false
                    controlSock?.send(DatagramPacket(pkt, pkt.size, peer, controlPort))
                    var slept = 0
                    while (running && slept < 1000) { Thread.sleep(100); slept += 100 }
                }
            } catch (t: Throwable) {
                if (running) { Log.w(TAG, "sync loop died", t); onTransportDead() }
            }
        }

        private fun timingLoop() {
            // 应答 receiver 的对时请求（0xD2 -> 0xD3），从 timing socket 单播回源
            val buf = ByteArray(64)
            try {
                timingSock?.soTimeout = 500
                while (running) {
                    val p: DatagramPacket
                    try { p = DatagramPacket(buf, buf.size); timingSock?.receive(p) } catch (_: java.net.SocketTimeoutException) { continue }
                    if (p.length < 32) continue
                    if ((buf[1].toInt() and 0xFF) != 0xD2) continue
                    val resp = ByteArray(32)
                    resp[0] = buf[0]; resp[1] = 0xD3.toByte(); resp[2] = 0x00; resp[3] = 0x07
                    // reftime = 请求 sendtime；recv/send = now
                    System.arraycopy(buf, 20, resp, 8, 8)  // 请求 sendtime(sec+frac) 在偏移 20
                    val ntp = ntpNow()
                    writeU32(resp, 16, (ntp shr 32).toInt())
                    writeU32(resp, 20, (ntp and 0xFFFFFFFFL).toInt())
                    writeU32(resp, 24, (ntp shr 32).toInt())
                    writeU32(resp, 28, (ntp and 0xFFFFFFFFL).toInt())
                    timingSock?.send(DatagramPacket(resp, resp.size, p.address, p.port))
                }
            } catch (t: Throwable) {
                if (running) Log.w(TAG, "timing loop died", t)
            }
        }

        private fun feedbackLoop() {
            try {
                while (running) {
                    var slept = 0
                    while (running && slept < 25000) { Thread.sleep(500); slept += 500 }
                    if (!running) break
                    try { rtsp("POST", mapOf("Session" to rtspSession), path = "/feedback") } catch (_: Throwable) { break }
                }
            } catch (_: InterruptedException) {}
        }

        private fun writeU32(b: ByteArray, off: Int, v: Int) {
            b[off] = ((v ushr 24) and 0xFF).toByte(); b[off + 1] = ((v ushr 16) and 0xFF).toByte()
            b[off + 2] = ((v ushr 8) and 0xFF).toByte(); b[off + 3] = (v and 0xFF).toByte()
        }

        fun onTransportDead() {
            running = false
            Log.w(TAG, "airplay transport dead")
            stopInternal()
            emit("airplay.lost", null)
        }

        fun stopInternal() {
            running = false
            try { teardown() } catch (_: Throwable) {}
        }
    }

    private var current: RaopSession? = null

    @com.facebook.react.bridge.ReactMethod
    fun start(dev: ReadableMap, p: Promise) {
        exec.execute {
            try {
                current?.stopInternal()
                val s = RaopSession(dev)
                s.handshake()
                sessionRef.set(s)
                current = s
                s.paceThread.start()
                s.syncThread.start()
                s.timingThread.start()
                s.feedbackThread.start()
                Log.d(TAG, "airplay session up: ${dev.getString("name")} @ ${dev.getString("host")}:${s.serverPort}")
                p.resolve(true)
            } catch (t: Throwable) {
                p.reject("E_AIRPLAY", t)
            }
        }
    }

    @com.facebook.react.bridge.ReactMethod
    fun stop(p: Promise) {
        exec.execute {
            val s = current
            current = null
            sessionRef.set(null)
            s?.stopInternal()
            p.resolve(true)
        }
    }

    @com.facebook.react.bridge.ReactMethod
    fun setVolume(pct: Double, p: Promise) {
        exec.execute {
            val s = current ?: run { p.reject("E_VOL", "no session"); return@execute }
            try {
                s.setVolumeInternal(pct)
                p.resolve(true)
            } catch (t: Throwable) { p.reject("E_VOL", t) }
        }
    }

    @com.facebook.react.bridge.ReactMethod
    fun getVolume(p: Promise) {
        val s = current
        if (s == null) { p.reject("E_VOL", "no session"); return }
        p.resolve((s.volumePct.takeIf { it >= 0 } ?: 100.0).toInt())
    }

    @com.facebook.react.bridge.ReactMethod
    fun isActive(p: Promise) {
        p.resolve(current != null && current!!.running)
    }
}
