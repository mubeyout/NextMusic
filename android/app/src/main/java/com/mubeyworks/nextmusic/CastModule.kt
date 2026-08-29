package com.mubeyworks.nextmusic

import android.content.Context
import android.util.Log
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReadableMap
import com.facebook.react.bridge.WritableMap
import com.facebook.react.modules.core.DeviceEventManagerModule
import org.json.JSONObject
import java.io.BufferedInputStream
import java.io.BufferedOutputStream
import java.net.InetSocketAddress
import java.nio.ByteBuffer
import java.security.SecureRandom
import java.security.cert.X509Certificate
import java.util.concurrent.CompletableFuture
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit
import javax.net.ssl.SSLContext
import javax.net.ssl.SSLSocket
import javax.net.ssl.SSLSocketFactory
import javax.net.ssl.TrustManager
import javax.net.ssl.X509TrustManager

/**
 * Google Cast（Chromecast built-in）投屏（lx33）：手机作 sender，纯局域网 CASTV2 协议，不依赖 GMS。
 *
 * - 发现：mDNS _googlecast._tcp（MdnsScanner）
 * - 控制：TLS(:8009) + protobuf CastMessage 信封 + JSON 消息
 *   CONNECT → LAUNCH(CC1AD845 默认媒体接收器) → app 通道 CONNECT → LOAD(流 URL+元数据)
 *   播放/暂停/进度/音量/停止走 media/receiver 命名空间
 *
 * 与 NMDlna 同一套 JS 语义（cast/play/pause/stop/seek/getPosition/getVolume/setVolume）。
 */
class CastModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    override fun getName() = "NMCast"

    companion object {
        const val TAG = "NMCast"
        const val DEFAULT_RECEIVER_APP = "CC1AD845"
        const val NS_CONNECTION = "urn:x-cast:com.google.cast.tp.connection"
        const val NS_RECEIVER = "urn:x-cast:com.google.cast.receiver"
        const val NS_MEDIA = "urn:x-cast:com.google.cast.media"
        const val SOURCE_ID = "sender-0"
    }

    private val exec = Executors.newCachedThreadPool { r ->
        Thread(r, "nmcast-worker").apply { isDaemon = true }
    }

    private var scanner: MdnsScanner? = null

    private fun emit(event: String, arg: Any?) {
        reactApplicationContext.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
            ?.emit(event, arg)
    }

    // ---------------- 发现 ----------------

    @com.facebook.react.bridge.ReactMethod
    fun startDiscovery() {
        if (scanner != null) return
        val s = MdnsScanner(reactApplicationContext.applicationContext, onDevice = { d ->
            if (d.service != "_googlecast._tcp") return@MdnsScanner
            val map: WritableMap = Arguments.createMap().apply {
                putString("uuid", "cast:${d.instance}")
                putString("name", d.name)
                putString("host", d.ip)
                putInt("port", d.port)
            }
            Log.d(TAG, "cast device: ${d.name} @ ${d.ip}:${d.port}")
            emit("cast.found", map)
        }, onEnd = {
            scanner = null
            emit("cast.scanEnd", null)
        })
        scanner = s
        s.start(listOf("_googlecast._tcp.local"))
    }

    @com.facebook.react.bridge.ReactMethod
    fun stopDiscovery() {
        scanner?.stop()
        scanner = null
    }

    // ---------------- CASTV2 会话 ----------------

    private class Session {
        var socket: SSLSocket? = null
        var out: BufferedOutputStream? = null
        var devKey = ""                  // 设备 uuid：换设备必须重建会话
        var sessionId: String = ""       // receiver app session
        var transportId: String = ""     // app 虚拟通道
        var mediaSessionId: Long = -1
        var reqId = 0
        var volume: Double = 1.0         // 0..1（receiver 音量缓存）
        var closed = false
        val waiters = ConcurrentHashMap<Int, CompletableFuture<JSONObject>>() // requestId -> media/receiver status
    }

    private var session: Session? = null

    private fun trustAllFactory(): SSLSocketFactory {
        val tm = object : X509TrustManager {
            override fun checkClientTrusted(chain: Array<X509Certificate>, authType: String) {}
            override fun checkServerTrusted(chain: Array<X509Certificate>, authType: String) {}
            override fun getAcceptedIssuers(): Array<X509Certificate> = arrayOf()
        }
        val ctx = SSLContext.getInstance("TLS")
        ctx.init(null, arrayOf<TrustManager>(tm), SecureRandom())
        return ctx.socketFactory
    }

    private fun sendMsg(s: Session, ns: String, dest: String, json: JSONObject) {
        val sock = s.socket ?: throw RuntimeException("cast: no connection")
        val payload = json.toString().toByteArray(Charsets.UTF_8)
        val src = SOURCE_ID.toByteArray(Charsets.UTF_8)
        val dst = dest.toByteArray(Charsets.UTF_8)
        val nss = ns.toByteArray(Charsets.UTF_8)
        fun tagStr(field: Int) = ((field shl 3) or 2).toByte()
        val body = ByteBuffer.allocate(16 + src.size + dst.size + nss.size + payload.size + 16)
        body.put(0x08); body.put(0x00) // protocol_version = CASTV2_1_0
        body.put(tagStr(2)); body.put(src.size.toByte()); body.put(src)
        body.put(tagStr(3)); body.put(dst.size.toByte()); body.put(dst)
        body.put(tagStr(4)); body.put(nss.size.toByte()); body.put(nss)
        body.put(0x28); body.put(0x00) // payload_type = STRING
        body.put(tagStr(6))
        // 长度可能 >127：protobuf varint 编码写长度
        val lenBytes = ByteArray(4)
        var v = payload.size
        var li = 0
        while (true) {
            val b = (v and 0x7F)
            v = v shr 7
            lenBytes[li++] = if (v > 0) (b or 0x80).toByte() else b.toByte()
            if (v == 0) break
        }
        body.put(lenBytes, 0, li)
        body.put(payload)
        val frame = ByteArray(body.position())
        body.rewind(); body.get(frame)
        val framed = ByteBuffer.allocate(4 + frame.size)
        framed.putInt(frame.size)
        framed.put(frame)
        synchronized(sock) {
            s.out?.write(framed.array(), 0, framed.position())
            s.out?.flush()
        }
    }

    private fun nextReq(s: Session, payload: JSONObject, wait: Boolean): CompletableFuture<JSONObject>? {
        val id = ++s.reqId
        payload.put("requestId", id)
        val fut = if (wait) CompletableFuture<JSONObject>() else null
        if (fut != null) s.waiters[id] = fut
        return fut
    }

    private fun readerLoop(s: Session) {
        val buf = ByteArray(1 shl 16)
        var acc = ByteArray(1 shl 17)
        var accLen = 0
        try {
            val input = BufferedInputStream(s.socket!!.inputStream)
            while (!s.closed) {
                val n = try {
                    input.read(buf)
                } catch (e: java.net.SocketTimeoutException) {
                    continue // 空闲会话无流量，15s 读超时不算断连
                }
                if (n < 0) break
                if (accLen + n > acc.size) { acc = ByteArray(acc.size * 2) }
                System.arraycopy(buf, 0, acc, accLen, n)
                accLen += n
                var pos = 0
                while (accLen - pos >= 4) {
                    val len = ((acc[pos].toInt() and 0xFF) shl 24) or ((acc[pos + 1].toInt() and 0xFF) shl 16) or
                        ((acc[pos + 2].toInt() and 0xFF) shl 8) or (acc[pos + 3].toInt() and 0xFF)
                    if (len <= 0 || len > (1 shl 22)) { accLen = 0; break }
                    if (accLen - pos - 4 < len) break
                    handleMessage(s, acc, pos + 4, len)
                    pos += 4 + len
                }
                if (pos > 0) {
                    System.arraycopy(acc, pos, acc, 0, accLen - pos)
                    accLen -= pos
                }
            }
        } catch (t: Throwable) {
            if (!s.closed) Log.w(TAG, "cast reader died", t)
        }
        cleanupSession(s, notify = true)
    }

    private fun handleMessage(s: Session, buf: ByteArray, off: Int, len: Int) {
        var ns = ""
        var payload = ""
        var pos = off
        val end = off + len
        while (pos < end) {
            val tag = buf[pos].toInt() and 0xFF
            val field = tag shr 3
            val wire = tag and 7
            pos++
            when (wire) {
                0 -> { // varint
                    var v = 0L; var shift = 0
                    while (pos < end) {
                        val b = buf[pos].toInt() and 0xFF
                        v = v or ((b and 0x7F).toLong() shl shift)
                        pos++
                        if (b and 0x80 == 0) break
                        shift += 7
                    }
                    if (field == 1 || field == 5) { /* version / payload_type 忽略 */ }
                }
                2 -> { // length-delimited
                    var v = 0; var shift = 0
                    while (pos < end) {
                        val b = buf[pos].toInt() and 0xFF
                        v = v or ((b and 0x7F) shl shift)
                        pos++
                        if (b and 0x80 == 0) break
                        shift += 7
                    }
                    val l = v
                    if (pos + l > end) return
                    when (field) {
                        4 -> ns = String(buf, pos, l, Charsets.UTF_8)
                        6 -> payload = String(buf, pos, l, Charsets.UTF_8)
                    }
                    pos += l
                }
                else -> return
            }
        }
        if (payload.isEmpty()) return
        val json = try { JSONObject(payload) } catch (_: Throwable) { return }
        val type = json.optString("type")
        // 唤醒等待者（MEDIA_STATUS / RECEIVER_STATUS / VOLUME_STATUS 等都带 requestId）
        val rid = json.optInt("requestId", -1)
        if (rid >= 0) {
            val fut = s.waiters.remove(rid)
            fut?.complete(json)
        }
        when (type) {
            "RECEIVER_STATUS" -> {
                val vol = json.optJSONObject("status")?.optJSONObject("volume")?.optDouble("level")
                if (vol != null && !vol.isNaN()) s.volume = vol
                val apps = json.optJSONObject("status")?.optJSONArray("applications")
                if (apps != null) for (i in 0 until apps.length()) {
                    val app = apps.optJSONObject(i) ?: continue
                    if (app.optString("appId") == DEFAULT_RECEIVER_APP) {
                        s.sessionId = app.optString("sessionId", s.sessionId)
                        s.transportId = app.optString("transportId", s.transportId)
                    }
                }
            }
            "MEDIA_STATUS" -> {
                val st = json.optJSONArray("status")
                if (st != null && st.length() > 0) {
                    val m = st.optJSONObject(0) ?: return
                    val msid = m.optLong("mediaSessionId", -1)
                    if (msid >= 0) s.mediaSessionId = msid
                }
            }
            "CLOSE" -> { cleanupSession(s, notify = true) }
        }
    }

    private fun cleanupSession(s: Session, notify: Boolean) {
        if (s.closed) return
        s.closed = true
        for ((_, f) in s.waiters) f.completeExceptionally(RuntimeException("cast connection closed"))
        s.waiters.clear()
        try { s.socket?.close() } catch (_: Throwable) {}
        if (notify && s === session) {
            session = null
            emit("cast.lost", null)
        }
    }

    private fun devHost(dev: ReadableMap) = dev.getString("host") ?: ""
    private fun devPort(dev: ReadableMap) = if (dev.hasKey("port")) dev.getInt("port") else 8009

    /** 建立（或复用）与接收器的 app 会话 */
    private fun ensureSession(dev: ReadableMap): Session {
        val devKey = dev.getString("uuid") ?: "${devHost(dev)}:${devPort(dev)}"
        val cur = session
        if (cur != null && !cur.closed && cur.socket?.isConnected == true && cur.devKey == devKey) return cur
        if (cur != null && !cur.closed) cleanupSession(cur, notify = false)
        val s = Session().apply { this.devKey = devKey }
        val sock = trustAllFactory().createSocket() as SSLSocket
        sock.connect(InetSocketAddress(devHost(dev), devPort(dev)), 5000)
        sock.soTimeout = 15000
        sock.startHandshake()
        s.socket = sock
        s.out = BufferedOutputStream(sock.outputStream)
        session = s
        Thread({ readerLoop(s) }, "nmcast-reader").apply { isDaemon = true }.start()
        // 1) 连接 receiver 通道
        sendMsg(s, NS_CONNECTION, "receiver-0", JSONObject().put("type", "CONNECT"))
        // 2) 拉一次状态（音量；应答异步由 reader 喂回）
        run {
            val get = JSONObject().put("type", "GET_STATUS")
            val f = nextReq(s, get, true)
            sendMsg(s, NS_RECEIVER, "receiver-0", get)
            try { f?.get(4, TimeUnit.SECONDS) } catch (_: Throwable) {}
        }
        // 3) 启动默认媒体接收器并等 RECEIVER_STATUS
        val launch = JSONObject().put("type", "LAUNCH").put("appId", DEFAULT_RECEIVER_APP)
        val lf = nextReq(s, launch, true)
        sendMsg(s, NS_RECEIVER, "receiver-0", launch)
        val t0 = System.currentTimeMillis()
        while (System.currentTimeMillis() - t0 < 12000 && !s.closed) {
            try { lf!!.get(1, TimeUnit.SECONDS) } catch (_: Throwable) {}
            if (s.transportId.isNotEmpty()) break
            // 有些固件 LAUNCH 应答不带 requestId 匹配，主动再查一次状态
            val q = JSONObject().put("type", "GET_STATUS")
            val qf = nextReq(s, q, true)
            sendMsg(s, NS_RECEIVER, "receiver-0", q)
            try { qf!!.get(2, TimeUnit.SECONDS) } catch (_: Throwable) {}
        }
        if (s.transportId.isEmpty()) {
            cleanupSession(s, notify = false)
            throw RuntimeException("cast: launch receiver app timeout")
        }
        // 4) 连接 app 虚拟通道
        sendMsg(s, NS_CONNECTION, s.transportId, JSONObject().put("type", "CONNECT"))
        return s
    }

    // ---------------- 媒体控制 ----------------

    @com.facebook.react.bridge.ReactMethod
    fun cast(dev: ReadableMap, url: String, title: String, artist: String, contentType: String, p: Promise) {
        exec.execute {
            try {
                val s = ensureSession(dev)
                val media = JSONObject()
                    .put("contentId", url)
                    .put("streamType", "BUFFERED")
                    .put("contentType", contentType)
                val meta = JSONObject()
                    .put("metadataType", 3) // musicTrackMetadata
                    .put("title", title)
                    .put("artist", artist)
                media.put("metadata", meta)
                val load = JSONObject()
                    .put("type", "LOAD")
                    .put("autoplay", true)
                    .put("currentTime", 0.0)
                    .put("media", media)
                val lf = nextReq(s, load, true)
                sendMsg(s, NS_MEDIA, s.transportId, load)
                // 等 MEDIA_STATUS：拿到 mediaSessionId 且状态非 LOADING 即认为接单（起播有 BUFFERING 阶段）
                val t0 = System.currentTimeMillis()
                var ok = false
                while (System.currentTimeMillis() - t0 < 15000 && !s.closed) {
                    try {
                        val resp = lf!!.get(3, TimeUnit.SECONDS)
                        if (resp.optString("type") == "LOAD_FAILED") throw RuntimeException("cast: LOAD_FAILED")
                        val st = resp.optJSONArray("status")
                        if (st != null && st.length() > 0) {
                            val m = st.optJSONObject(0)
                            val state = m?.optString("playerState") ?: ""
                            if (m != null && m.optLong("mediaSessionId", -1) >= 0 &&
                                state != "LOADING"
                            ) { ok = true; break }
                        }
                    } catch (_: Throwable) { /* 继续等 */ }
                }
                if (!ok) throw RuntimeException("cast: load timeout")
                p.resolve(true)
            } catch (t: Throwable) {
                p.reject("E_CAST", t)
            }
        }
    }

    private fun mediaCmd(dev: ReadableMap, type: String, extra: JSONObject? = null, wait: Boolean = true, timeoutSec: Long = 8): CompletableFuture<JSONObject>? {
        val s = session ?: throw RuntimeException("cast: no session")
        if (s.mediaSessionId < 0) throw RuntimeException("cast: no media session")
        val cmd = JSONObject().put("type", type).put("mediaSessionId", s.mediaSessionId)
        extra?.let { for (k in it.keys()) cmd.put(k, it.get(k)) }
        val f = nextReq(s, cmd, wait)
        sendMsg(s, NS_MEDIA, s.transportId, cmd)
        return f
    }

    @com.facebook.react.bridge.ReactMethod
    fun play(dev: ReadableMap, p: Promise) = exec.execute {
        try { mediaCmd(dev, "PLAY"); p.resolve(true) } catch (t: Throwable) { p.reject("E_CAST", t) }
    }

    @com.facebook.react.bridge.ReactMethod
    fun pause(dev: ReadableMap, p: Promise) = exec.execute {
        try { mediaCmd(dev, "PAUSE"); p.resolve(true) } catch (t: Throwable) { p.reject("E_CAST", t) }
    }

    @com.facebook.react.bridge.ReactMethod
    fun seek(dev: ReadableMap, sec: Double, p: Promise) = exec.execute {
        try { mediaCmd(dev, "SEEK", JSONObject().put("currentTime", sec)); p.resolve(true) } catch (t: Throwable) { p.reject("E_CAST", t) }
    }

    @com.facebook.react.bridge.ReactMethod
    fun getPosition(dev: ReadableMap, p: Promise) = exec.execute {
        try {
            val f = mediaCmd(dev, "GET_STATUS")
            val resp = f?.get(timeoutSec, TimeUnit.SECONDS) ?: throw RuntimeException("cast: status timeout")
            val st = resp.optJSONArray("status")
            val m = st?.optJSONObject(0)
            val map = Arguments.createMap()
            map.putDouble("pos", (m?.optDouble("currentTime") ?: 0.0))
            map.putDouble("dur", m?.optJSONObject("media")?.optDouble("duration") ?: 0.0)
            map.putString("state", m?.optString("playerState") ?: "UNKNOWN")
            p.resolve(map)
        } catch (t: Throwable) { p.reject("E_POS", t) }
    }

    @com.facebook.react.bridge.ReactMethod
    fun getVolume(dev: ReadableMap, p: Promise) = exec.execute {
        val s = session ?: run { p.reject("E_VOL", "no session"); return@execute }
        p.resolve((s.volume * 100).toInt())
    }

    @com.facebook.react.bridge.ReactMethod
    fun setVolume(dev: ReadableMap, pct: Double, p: Promise) = exec.execute {
        try {
            val s = ensureSession(dev)
            val level = (pct / 100.0).coerceIn(0.0, 1.0)
            val cmd = JSONObject().put("type", "SET_VOLUME").put("volume", JSONObject().put("level", level))
            val f = nextReq(s, cmd, true)
            sendMsg(s, NS_RECEIVER, "receiver-0", cmd)
            try { f.get(4, TimeUnit.SECONDS) } catch (_: Throwable) {}
            s.volume = level
            p.resolve(true)
        } catch (t: Throwable) { p.reject("E_VOL", t) }
    }

    @com.facebook.react.bridge.ReactMethod
    fun stop(dev: ReadableMap, p: Promise) = exec.execute {
        val s = session
        if (s == null) { p.resolve(true); return@execute }
        try {
            if (s.mediaSessionId >= 0 && !s.closed) {
                try { mediaCmd(dev, "STOP") } catch (_: Throwable) {}
            }
            // 停掉 receiver 上挂着的默认媒体 app
            if (!s.closed && s.sessionId.isNotEmpty()) {
                val stopApp = JSONObject().put("type", "STOP").put("sessionId", s.sessionId)
                sendMsg(s, NS_RECEIVER, "receiver-0", stopApp)
                Thread.sleep(150)
            }
        } catch (_: Throwable) {
        } finally {
            cleanupSession(s, notify = false)
            p.resolve(true)
        }
    }
}
