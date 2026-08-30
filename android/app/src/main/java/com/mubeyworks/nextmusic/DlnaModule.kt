package com.mubeyworks.nextmusic

import android.content.Context
import android.net.Uri
import android.net.wifi.WifiManager
import android.os.SystemClock
import android.util.Log
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.ReadableMap
import com.facebook.react.bridge.WritableMap
import com.facebook.react.modules.core.DeviceEventManagerModule
import org.json.JSONArray
import org.xmlpull.v1.XmlPullParser
import java.io.ByteArrayInputStream
import java.net.DatagramPacket
import java.net.DatagramSocket
import java.net.InetSocketAddress
import java.net.Socket
import java.net.SocketTimeoutException
import java.net.URI
import java.net.URL
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.Executors

/**
 * DLNA 投屏（2026-08-29 lx31）：手机作为 DMC（控制器），把当前播放流 URL 推给 DMR（渲染器）。
 *
 * - 发现：SSDP M-SEARCH（AVTransport / rootdevice 双 ST），MulticastLock 防 AP 过滤组播；
 *   收到 LOCATION → 拉取设备描述 XML → 解析 friendlyName + AVTransport/RenderingControl controlURL
 * - 控制：AVTransport SOAP（SetAVTransportURI/Play/Pause/Stop/Seek/GetPositionInfo/GetTransportInfo）
 *        RenderingControl SOAP（GetVolume/SetVolume）
 *
 * 全部网络操作在后台线程；发现结果通过 'dlna.found' 事件推 JS（按 UDN 去重）。
 */
class DlnaModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    override fun getName() = "NMDlna"

    companion object {
        const val TAG = "NMDlna"
        const val SSDP_ADDR = "239.255.255.250"
        const val SSDP_PORT = 1900
        const val AV_TRANSPORT = "urn:schemas-upnp-org:service:AVTransport:1"
        const val RENDERING_CONTROL = "urn:schemas-upnp-org:service:RenderingControl:1"
    }

    private val exec = Executors.newCachedThreadPool { r ->
        Thread(r, "nmdlna-worker").apply { isDaemon = true }
    }

    @Volatile
    private var scanning = false

    private val seenUdn = ConcurrentHashMap.newKeySet<String>()

    private var multicastLock: WifiManager.MulticastLock? = null

    private fun emit(event: String, arg: Any?) {
        reactApplicationContext.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
            ?.emit(event, arg)
    }

    // ---------------- SSDP 发现 ----------------

    /** 直连探活（lx42）：组播被 AP/路由器压制时，对已知设备 host:port 并发 TCP connect 探测。
     *  入参 JSON: [{host,port},...]；返回可达下标数组的 JSON 字符串，如 "[0,2]" */
    @ReactMethod
    fun probeTcp(json: String, p: Promise) {
        exec.execute {
            try {
                val arr = JSONArray(json)
                val n = arr.length()
                val alive = BooleanArray(n)
                val threads = (0 until n).map { i ->
                    Thread {
                        try {
                            val o = arr.getJSONObject(i)
                            val h = o.getString("host")
                            val prt = o.getInt("port")
                            val s = Socket()
                            try {
                                s.connect(InetSocketAddress(h, prt), 900)
                                alive[i] = true
                            } finally { s.close() }
                        } catch (e: Exception) { alive[i] = false }
                    }.also { it.isDaemon = true; it.start() }
                }
                threads.forEach { it.join(2500) }
                val out = JSONArray()
                for (i in 0 until n) if (alive[i]) out.put(i)
                p.resolve(out.toString())
            } catch (e: Exception) {
                p.reject("probe", e.message)
            }
        }
    }

    @ReactMethod
    fun startDiscovery() {
        if (scanning) return
        scanning = true
        seenUdn.clear()
        exec.execute { discoveryLoop() }
    }

    @ReactMethod
    fun stopDiscovery() {
        scanning = false
    }

    private fun discoveryLoop() {
        var socket: DatagramSocket? = null
        try {
            val wifi =
                reactApplicationContext.applicationContext.getSystemService(Context.WIFI_SERVICE) as? WifiManager
            multicastLock = wifi?.createMulticastLock("nm-dlna")?.apply {
                setReferenceCounted(false)
                acquire()
            }
            socket = DatagramSocket(null).apply {
                reuseAddress = true
                bind(InetSocketAddress(0))
                soTimeout = 900
            }
            val sts = listOf(
                "urn:schemas-upnp-org:service:AVTransport:1",
                "upnp:rootdevice",
            )
            val t0 = SystemClock.elapsedRealtime()
            var sendIdx = 0
            while (scanning && SystemClock.elapsedRealtime() - t0 < 7000) {
                if (sendIdx < sts.size) {
                    sendMsearch(socket, sts[sendIdx])
                    sendIdx++
                }
                // 排空接收缓冲（超时即退出内层，继续外层窗口）
                while (scanning) {
                    val buf = ByteArray(4096)
                    val pkt = DatagramPacket(buf, buf.size)
                    try {
                        socket.receive(pkt)
                    } catch (e: SocketTimeoutException) {
                        break
                    }
                    val body = String(buf, 0, pkt.length, Charsets.ISO_8859_1)
                    val loc = Regex("(?im)^LOCATION:\\s*(\\S+)")
                        .find(body)?.groupValues?.get(1) ?: continue
                    fetchDevice(loc)
                }
            }
        } catch (t: Throwable) {
            Log.w(TAG, "discovery failed", t)
        } finally {
            try { socket?.close() } catch (_: Throwable) {}
            try { multicastLock?.release() } catch (_: Throwable) {}
            multicastLock = null
        }
        // 扫描结束事件（UI 停转圈）
        emit("dlna.scanEnd", null)
        scanning = false
    }

    private fun sendMsearch(socket: DatagramSocket, st: String) {
        val req = buildString {
            append("M-SEARCH * HTTP/1.1\r\n")
            append("HOST: $SSDP_ADDR:$SSDP_PORT\r\n")
            append("MAN: \"ssdp:discover\"\r\n")
            append("MX: 3\r\n")
            append("ST: $st\r\n")
            append("\r\n")
        }.toByteArray(Charsets.ISO_8859_1)
        val pkt = DatagramPacket(req, req.size, java.net.InetAddress.getByName(SSDP_ADDR), SSDP_PORT)
        repeat(2) {
            try { socket.send(pkt) } catch (t: Throwable) { Log.w(TAG, "msearch send fail", t) }
        }
    }

    /** 拉取设备描述 XML，解析 friendlyName / UDN / AVTransport & RenderingControl controlURL */
    private fun fetchDevice(location: String) {
        try {
            val xml = httpGet(location, 5000)
            var friendly = ""
            var udn = ""
            var avUrl: String? = null
            var rcUrl: String? = null
            val xpp = android.util.Xml.newPullParser().apply {
                setInput(ByteArrayInputStream(xml.toByteArray(Charsets.UTF_8)), "UTF-8")
            }
            var curServiceType = ""
            var curControlUrl = ""
            var event = xpp.eventType
            while (event != XmlPullParser.END_DOCUMENT) {
                when (event) {
                    XmlPullParser.START_TAG -> when (xpp.name.lowercase()) {
                        "servicetype" -> curServiceType = xpp.nextText().trim()
                        "controlurl" -> curControlUrl = xpp.nextText().trim()
                        "friendlyname" -> if (friendly.isEmpty()) friendly = xpp.nextText().trim()
                        "udn" -> if (udn.isEmpty()) udn = xpp.nextText().trim()
                    }
                    XmlPullParser.END_TAG -> {
                        if (xpp.name.lowercase() == "service" && curControlUrl.isNotEmpty()) {
                            val abs = resolveUrl(location, curControlUrl)
                            when {
                                curServiceType.contains("AVTransport", true) && avUrl == null -> avUrl = abs
                                curServiceType.contains("RenderingControl", true) && rcUrl == null -> rcUrl = abs
                            }
                            curServiceType = ""
                            curControlUrl = ""
                        }
                    }
                }
                event = xpp.next()
            }
            if (friendly.isEmpty()) friendly = "未知设备"
            if (udn.isEmpty()) udn = location // 无 UDN 时按 location 去重
            if (avUrl == null) return // 没有 AVTransport：不是可投屏渲染器
            if (!seenUdn.add(udn)) return
            val map: WritableMap = Arguments.createMap().apply {
                putString("uuid", udn)
                putString("name", friendly)
                putString("controlUrl", avUrl)
                putString("rcUrl", rcUrl ?: "")
            }
            Log.d(TAG, "DLNA renderer: $friendly @ $avUrl")
            emit("dlna.found", map)
        } catch (t: Throwable) {
            Log.w(TAG, "fetchDevice failed: $location", t)
        }
    }

    private fun resolveUrl(base: String, ref: String): String = try {
        URI(base).resolve(ref).toString()
    } catch (t: Throwable) {
        if (ref.startsWith("http")) ref else base.trimEnd('/') + "/" + ref.trimStart('/')
    }

    // ---------------- SOAP 控制 ----------------

    private fun xmlEsc(s: String): String = s
        .replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
        .replace("\"", "&quot;").replace("'", "&apos;")

    private fun soap(callUrl: String, serviceUrn: String, action: String, bodyInner: String): String {
        val body = "<s:Envelope xmlns:s=\"http://schemas.xmlsoap.org/soap/envelope/\" " +
            "s:encodingStyle=\"http://schemas.xmlsoap.org/soap/encoding/\"><s:Body>$bodyInner</s:Body></s:Envelope>"
        val conn = URL(callUrl).openConnection() as java.net.HttpURLConnection
        try {
            conn.requestMethod = "POST"
            conn.doOutput = true
            conn.connectTimeout = 5000
            conn.readTimeout = 10000
            conn.setRequestProperty("Content-Type", "text/xml; charset=\"utf-8\"")
            conn.setRequestProperty("SOAPAction", "\"$serviceUrn#$action\"")
            conn.outputStream.use { it.write(body.toByteArray(Charsets.UTF_8)) }
            val code = conn.responseCode
            val stream = if (code in 200..299) conn.inputStream else conn.errorStream
            val resp = stream?.readBytes()?.toString(Charsets.UTF_8) ?: ""
            if (code !in 200..299) throw RuntimeException("SOAP $action HTTP $code: ${resp.take(300)}")
            return resp
        } finally {
            conn.disconnect()
        }
    }

    private fun httpGet(url: String, timeoutMs: Int): String {
        val conn = URL(url).openConnection() as java.net.HttpURLConnection
        try {
            conn.connectTimeout = timeoutMs
            conn.readTimeout = timeoutMs
            conn.setRequestProperty("User-Agent", "NextMusic/3.4 DLNA")
            return conn.inputStream.readBytes().toString(Charsets.UTF_8)
        } finally {
            conn.disconnect()
        }
    }

    private fun didl(title: String, artist: String, url: String): String =
        "&lt;DIDL-Lite xmlns=\"urn:schemas-upnp-org:metadata-1-0/DIDL-Lite/\" " +
            "xmlns:dc=\"http://purl.org/dc/elements/1.1/\" " +
            "xmlns:upnp=\"urn:schemas-upnp-org:metadata-1-0/upnp/\"&gt;" +
            "&lt;item id=\"nm0\" parentID=\"0\" restricted=\"1\"&gt;" +
            "&lt;dc:title&gt;${xmlEsc(title)}&lt;/dc:title&gt;" +
            "&lt;dc:creator&gt;${xmlEsc(artist)}&lt;/dc:creator&gt;" +
            "&lt;upnp:class&gt;object.item.audioItem.musicTrack&lt;/upnp:class&gt;" +
            "&lt;res&gt;${xmlEsc(url)}&lt;/res&gt;" +
            "&lt;/item&gt;&lt;/DIDL-Lite&gt;"

    private fun fmtHms(sec: Int): String = String.format("%d:%02d:%02d", sec / 3600, (sec % 3600) / 60, sec % 60)

    private fun parseHms(s: String?): Int {
        if (s.isNullOrBlank()) return 0
        val parts = s.split(":").map { it.toIntOrNull() ?: 0 }
        return when (parts.size) {
            3 -> parts[0] * 3600 + parts[1] * 60 + parts[2]
            2 -> parts[0] * 60 + parts[1]
            else -> parts[0]
        }
    }

    /** JS 侧统一传 { controlUrl, rcUrl? }，原生只取字段 */
    private fun ctl(dev: ReadableMap): String = dev.getString("controlUrl") ?: ""
    private fun rc(dev: ReadableMap): String? = dev.getString("rcUrl")?.takeIf { it.isNotBlank() }

    @ReactMethod
    fun cast(dev: ReadableMap, url: String, title: String, artist: String, p: Promise) {
        exec.execute {
            try {
                val c = ctl(dev)
                // http/https 均按原样投给渲染器（失败会 reject 并回本机播放）
                val finalUrl = url
                soap(
                    c, AV_TRANSPORT, "SetAVTransportURI",
                    "<u:SetAVTransportURI xmlns:u=\"$AV_TRANSPORT\">" +
                        "<InstanceID>0</InstanceID><CurrentURI>${xmlEsc(finalUrl)}</CurrentURI>" +
                        "<CurrentURIMetaData>${didl(title, artist, finalUrl)}</CurrentURIMetaData>" +
                        "</u:SetAVTransportURI>",
                )
                soap(
                    c, AV_TRANSPORT, "Play",
                    "<u:Play xmlns:u=\"$AV_TRANSPORT\"><InstanceID>0</InstanceID><Speed>1</Speed></u:Play>",
                )
                // 切流验证（lx32）：SOAP 200 不代表渲染器真的切换了——部分渲染器加载新流失败时会继续播旧流，
                // 造成「App 显示新歌、设备还在放旧歌」的串台。轮询 TrackURI，连续 2 次仍指向别的流 → 判定失败
                if (!verifySwitch(c, finalUrl)) {
                    try {
                        soap(c, AV_TRANSPORT, "Stop", "<u:Stop xmlns:u=\"$AV_TRANSPORT\"><InstanceID>0</InstanceID></u:Stop>")
                    } catch (_: Throwable) {}
                    throw RuntimeException("renderer did not switch to the pushed stream")
                }
                p.resolve(true)
            } catch (t: Throwable) {
                p.reject("E_CAST", t)
            }
        }
    }

    /**
     * 验证渲染器已切到指定流（宽松优先，避免误杀慢加载的转码流）：
     * - TrackURI == 推送 URL → 通过
     * - TrackURI 非空且 != URL，且不在 TRANSITIONING（转码冷启动缓冲期可能暂报旧值），连续 2 次 → 失败
     * - 渲染器不上报 TrackURI → 「PLAYING 且起播位置 ≈ 0」启发式
     * - 16s 无定论（缓冲慢）→ 放行，交给轮询处理
     */
    private fun verifySwitch(c: String, url: String): Boolean {
        var mismatches = 0
        val t0 = SystemClock.elapsedRealtime()
        while (SystemClock.elapsedRealtime() - t0 < 16000) {
            try { Thread.sleep(800) } catch (_: InterruptedException) { return true }
            try {
                val posResp = soap(
                    c, AV_TRANSPORT, "GetPositionInfo",
                    "<u:GetPositionInfo xmlns:u=\"$AV_TRANSPORT\"><InstanceID>0</InstanceID><Track>1</Track></u:GetPositionInfo>",
                )
                val trackUri = unescapeXml(Regex("<TrackURI>([^<]*)</TrackURI>").find(posResp)?.groupValues?.get(1)?.trim() ?: "")
                if (trackUri.isNotEmpty()) {
                    if (trackUri.equals(url, ignoreCase = true)) return true
                    if (transportState(c) == "TRANSITIONING") continue // 缓冲中，旧值不算数
                    if (++mismatches >= 2) return false
                    continue
                }
                // 不上报 TrackURI 的渲染器：起播位置启发
                val rel = Regex("<RelTime>([^<]*)</RelTime>").find(posResp)?.groupValues?.get(1)
                if (parseHms(rel) in 0..8 && transportState(c) == "PLAYING") return true
            } catch (_: Throwable) { /* 单次查询失败下一轮重试 */ }
        }
        return true
    }

    private fun transportState(c: String): String = try {
        val stResp = soap(
            c, AV_TRANSPORT, "GetTransportInfo",
            "<u:GetTransportInfo xmlns:u=\"$AV_TRANSPORT\"><InstanceID>0</InstanceID></u:GetTransportInfo>",
        )
        Regex("<CurrentTransportState>([^<]+)</CurrentTransportState>").find(stResp)?.groupValues?.get(1) ?: ""
    } catch (_: Throwable) { "" }

    private fun unescapeXml(s: String): String = s
        .replace("&lt;", "<").replace("&gt;", ">").replace("&quot;", "\"")
        .replace("&apos;", "'").replace("&#39;", "'").replace("&amp;", "&")

    @ReactMethod
    fun play(dev: ReadableMap, p: Promise) = simpleAV(dev, "Play", "<InstanceID>0</InstanceID><Speed>1</Speed>", p)

    @ReactMethod
    fun pause(dev: ReadableMap, p: Promise) = simpleAV(dev, "Pause", "<InstanceID>0</InstanceID>", p)

    @ReactMethod
    fun stop(dev: ReadableMap, p: Promise) = simpleAV(dev, "Stop", "<InstanceID>0</InstanceID>", p)

    private fun simpleAV(dev: ReadableMap, action: String, args: String, p: Promise) {
        exec.execute {
            try {
                soap(ctl(dev), AV_TRANSPORT, action, "<u:$action xmlns:u=\"$AV_TRANSPORT\">$args</u:$action>")
                p.resolve(true)
            } catch (t: Throwable) {
                p.reject("E_AV", t)
            }
        }
    }

    @ReactMethod
    fun seek(dev: ReadableMap, sec: Double, p: Promise) {
        exec.execute {
            try {
                soap(
                    ctl(dev), AV_TRANSPORT, "Seek",
                    "<u:Seek xmlns:u=\"$AV_TRANSPORT\"><InstanceID>0</InstanceID>" +
                        "<Unit>REL_TIME</Unit><Target>${fmtHms(sec.toInt().coerceAtLeast(0))}</Target></u:Seek>",
                )
                p.resolve(true)
            } catch (t: Throwable) {
                p.reject("E_SEEK", t)
            }
        }
    }

    @ReactMethod
    fun getPosition(dev: ReadableMap, p: Promise) {
        exec.execute {
            try {
                val c = ctl(dev)
                val posResp = soap(
                    c, AV_TRANSPORT, "GetPositionInfo",
                    "<u:GetPositionInfo xmlns:u=\"$AV_TRANSPORT\"><InstanceID>0</InstanceID><Track>1</Track></u:GetPositionInfo>",
                )
                val stResp = soap(
                    c, AV_TRANSPORT, "GetTransportInfo",
                    "<u:GetTransportInfo xmlns:u=\"$AV_TRANSPORT\"><InstanceID>0</InstanceID></u:GetTransportInfo>",
                )
                val rel = Regex("<RelTime>([^<]+)</RelTime>").find(posResp)?.groupValues?.get(1)
                val dur = Regex("<TrackDuration>([^<]+)</TrackDuration>").find(posResp)?.groupValues?.get(1)
                val state = Regex("<CurrentTransportState>([^<]+)</CurrentTransportState>")
                    .find(stResp)?.groupValues?.get(1) ?: "UNKNOWN"
                val map = Arguments.createMap().apply {
                    putInt("pos", parseHms(rel))
                    putInt("dur", parseHms(dur))
                    putString("state", state)
                }
                p.resolve(map)
            } catch (t: Throwable) {
                p.reject("E_POS", t)
            }
        }
    }

    // ---------------- 渲染器音量（RenderingControl） ----------------

    @ReactMethod
    fun getVolume(dev: ReadableMap, p: Promise) {
        exec.execute {
            try {
                val url = rc(dev) ?: run { p.reject("E_RC", "no RenderingControl"); return@execute }
                val resp = soap(
                    url, RENDERING_CONTROL, "GetVolume",
                    "<u:GetVolume xmlns:u=\"$RENDERING_CONTROL\"><InstanceID>0</InstanceID><Channel>Master</Channel></u:GetVolume>",
                )
                val v = Regex("<CurrentVolume>([^<]+)</CurrentVolume>").find(resp)?.groupValues?.get(1)?.toIntOrNull() ?: 0
                p.resolve(v)
            } catch (t: Throwable) {
                p.reject("E_RC", t)
            }
        }
    }

    @ReactMethod
    fun setVolume(dev: ReadableMap, vol: Double, p: Promise) {
        exec.execute {
            try {
                val url = rc(dev) ?: run { p.reject("E_RC", "no RenderingControl"); return@execute }
                soap(
                    url, RENDERING_CONTROL, "SetVolume",
                    "<u:SetVolume xmlns:u=\"$RENDERING_CONTROL\"><InstanceID>0</InstanceID>" +
                        "<Channel>Master</Channel><DesiredVolume>${vol.toInt().coerceIn(0, 100)}</DesiredVolume></u:SetVolume>",
                )
                p.resolve(true)
            } catch (t: Throwable) {
                p.reject("E_RC", t)
            }
        }
    }
}
