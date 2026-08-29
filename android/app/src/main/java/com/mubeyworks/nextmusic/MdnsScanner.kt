package com.mubeyworks.nextmusic

import android.content.Context
import android.net.wifi.WifiManager
import android.os.SystemClock
import android.util.Log
import java.io.ByteArrayOutputStream
import java.net.DatagramPacket
import java.net.DatagramSocket
import java.net.InetAddress
import java.net.InetSocketAddress
import java.net.SocketTimeoutException
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicBoolean

/**
 * 手写 mDNS 客户端（lx33）：QU 查询（legacy unicast，从临时端口收单播应答，无需抢 5353），
 * 解析 PTR/SRV/TXT/A 并关联出完整设备信息。Chromecast(_googlecast._tcp) 与 AirPlay(_raop._tcp) 共用。
 *
 * 与 SSDP 同套路：MulticastLock 防省电丢包、按 instance 去重、后台线程收包。
 */

data class MdnsDevice(
    val service: String,   // 服务类型（不带 local 后缀），如 _googlecast._tcp / _raop._tcp
    val instance: String,  // 实例名（原始）
    val name: String,      // 展示名（googlecast 取 TXT.fn；raop 取 @ 后段）
    val host: String,      // SRV target（备用）
    val ip: String,        // A 记录
    val port: Int,         // SRV 端口
    val txt: Map<String, String>,
)

class MdnsScanner(
    private val context: Context,
    private val onDevice: (MdnsDevice) -> Unit,
    private val onEnd: (() -> Unit)? = null,
) {
    companion object {
        const val TAG = "NMMdns"
        const val MDNS_ADDR = "224.0.0.251"
        const val MDNS_PORT = 5353
        const val WINDOW_MS = 7000
    }

    private val running = AtomicBoolean(false)
    private val exec = Executors.newSingleThreadExecutor { r ->
        Thread(r, "nmdns-worker").apply { isDaemon = true }
    }
    private var multicastLock: WifiManager.MulticastLock? = null

    // instance -> 聚合状态
    private class Entry {
        var name: String = ""
        var host: String = ""
        var ip: String = ""
        var port: Int = 0
        val txt = HashMap<String, String>()
        var service = ""
        var emitted = false
    }

    private val entries = ConcurrentHashMap<String, Entry>()
    private val ptrTargets = ConcurrentHashMap.newKeySet<String>() // 待补查 ANY 的实例名

    fun start(services: List<String>) {
        if (!running.compareAndSet(false, true)) return
        entries.clear()
        ptrTargets.clear()
        exec.execute { scanLoop(services) }
    }

    fun stop() { running.set(false) }

    private fun scanLoop(services: List<String>) {
        var socket: DatagramSocket? = null
        try {
            val wifi = context.applicationContext.getSystemService(Context.WIFI_SERVICE) as? WifiManager
            multicastLock = wifi?.createMulticastLock("nm-mdns")?.apply {
                setReferenceCounted(false); acquire()
            }
            socket = DatagramSocket(null).apply {
                reuseAddress = true
                bind(InetSocketAddress(0))
                soTimeout = 900
            }
            val group = InetAddress.getByName(MDNS_ADDR)
            val t0 = SystemClock.elapsedRealtime()
            var lastFire = 0L
            while (running.get() && SystemClock.elapsedRealtime() - t0 < WINDOW_MS) {
                if (SystemClock.elapsedRealtime() - lastFire > 2800) {
                    lastFire = SystemClock.elapsedRealtime()
                    // 服务 PTR 查询 + 新发现实例的 ANY 补查
                    for (svc in services) sendQuery(socket, group, dnsName(svc), 0x0C)
                    for (inst in ptrTargets) sendQuery(socket, group, inst, 0xFF)
                }
                while (running.get()) {
                    val buf = ByteArray(4096)
                    val pkt = DatagramPacket(buf, buf.size)
                    try { socket.receive(pkt) } catch (e: SocketTimeoutException) { break }
                    try { parse(buf, pkt.length) } catch (t: Throwable) { Log.w(TAG, "parse fail", t) }
                }
            }
        } catch (t: Throwable) {
            Log.w(TAG, "mdns scan failed", t)
        } finally {
            try { socket?.close() } catch (_: Throwable) {}
            try { multicastLock?.release() } catch (_: Throwable) {}
            multicastLock = null
            running.set(false)
            onEnd?.invoke()
        }
    }

    private fun dnsName(svc: String): String = svc.removeSuffix(".local") + ".local"

    private fun sendQuery(socket: DatagramSocket, group: InetAddress, qname: String, qtype: Int) {
        val labels = qname.split('.').filter { it.isNotEmpty() }
        val out = ByteArrayOutputStream()
        fun u16(v: Int) { out.write(v shr 8); out.write(v and 0xFF) }
        // header：id=0 flags=0(legacy 单播查询) qd=1
        u16(0); u16(0); u16(1); u16(0); u16(0); u16(0)
        for (l in labels) { out.write(l.length); out.write(l.toByteArray(Charsets.US_ASCII)) }
        out.write(0)
        u16(qtype)
        u16(0x8001) // QU | IN：请求单播应答
        val data = out.toByteArray()
        try { socket.send(DatagramPacket(data, data.size, group, MDNS_PORT)) } catch (t: Throwable) {
            Log.w(TAG, "query send fail", t)
        }
    }

    // ---------------- DNS 报文解析 ----------------

    private fun readName(buf: ByteArray, start: Int): Pair<String, Int> {
        val sb = StringBuilder()
        var pos = start
        var jumps = 0
        var endPos = -1
        while (true) {
            if (pos >= buf.size) break
            val len = buf[pos].toInt() and 0xFF
            if (len == 0) { pos++; if (endPos < 0) endPos = pos; break }
            if (len and 0xC0 == 0xC0) { // 压缩指针
                if (pos + 1 >= buf.size) break
                val ptr = ((len and 0x3F) shl 8) or (buf[pos + 1].toInt() and 0xFF)
                if (endPos < 0) endPos = pos + 2
                if (++jumps > 16) break
                pos = ptr
                continue
            }
            if (pos + 1 + len > buf.size) break
            if (sb.isNotEmpty()) sb.append('.')
            sb.append(String(buf, pos + 1, len, Charsets.UTF_8))
            pos += 1 + len
        }
        return Pair(sb.toString(), if (endPos < 0) pos else endPos)
    }

    private fun entry(instance: String): Entry = entries.computeIfAbsent(instance) { Entry().apply { name = it } }

    private fun parse(buf: ByteArray, len: Int) {
        if (len < 12) return
        fun u16(o: Int) = ((buf[o].toInt() and 0xFF) shl 8) or (buf[o + 1].toInt() and 0xFF)
        fun u32(o: Int) = (u16(o) shl 16) or u16(o + 2)
        val qd = u16(4); val an = u16(6); val ns = u16(8); val ar = u16(10)
        var pos = 12
        repeat(qd) { // 跳过 question 区
            val (_, p) = readName(buf, pos); pos = p + 4
        }
        val total = an + ns + ar
        repeat(total) {
            if (pos >= len) return
            val (name, p0) = readName(buf, pos)
            pos = p0
            if (pos + 10 > len) return
            val type = u16(pos); val rdlen = u16(pos + 8)
            val rdata = pos + 10
            pos = rdata + rdlen
            val lower = name.lowercase()
            when (type) {
                12 -> { // PTR：service -> instance
                    if (lower.endsWith("_googlecast._tcp.local")) {
                        val (inst, _) = readName(buf, rdata)
                        if (inst.isNotEmpty()) {
                            val e = entry(inst); e.service = "_googlecast._tcp"
                            ptrTargets.add(inst)
                        }
                    } else if (lower.endsWith("_raop._tcp.local")) {
                        val (inst, _) = readName(buf, rdata)
                        if (inst.isNotEmpty()) {
                            val e = entry(inst); e.service = "_raop._tcp"
                            ptrTargets.add(inst)
                        }
                    }
                }
                33 -> { // SRV
                    if (rdata + 6 <= rdata + rdlen) {
                        val port = u16(rdata + 4)
                        val (target, _) = readName(buf, rdata + 6)
                        val e = entry(name)
                        e.port = port; e.host = target
                    }
                }
                16 -> { // TXT
                    val e = entry(name)
                    var p = rdata
                    while (p < rdata + rdlen) {
                        val l = buf[p].toInt() and 0xFF
                        if (l == 0 || p + 1 + l > rdata + rdlen) break
                        val kv = String(buf, p + 1, l, Charsets.UTF_8)
                        val i = kv.indexOf('=')
                        if (i > 0) e.txt[kv.substring(0, i)] = kv.substring(i + 1)
                        p += 1 + l
                    }
                }
                1 -> { // A
                    if (rdlen == 4) {
                        val ip = "${buf[rdata].toInt() and 0xFF}.${buf[rdata + 1].toInt() and 0xFF}.${buf[rdata + 2].toInt() and 0xFF}.${buf[rdata + 3].toInt() and 0xFF}"
                        val e = entry(name)
                        e.ip = ip
                        // SRV target 的 A 记录也归给对应实例
                        if (e.host.isEmpty()) {
                            for ((inst, en2) in entries) if (en2.host.equals(name, true)) en2.ip = ip
                        }
                    }
                }
            }
        }
        // SRV target IP 兜底：A 记录匹配 host
        // 汇总发射
        for ((inst, e) in entries) {
            if (e.emitted || e.port == 0 || e.ip.isEmpty() || e.service.isEmpty()) continue
            e.emitted = true
            val disp = when {
                e.service == "_googlecast._tcp" -> e.txt["fn"]?.takeIf { it.isNotBlank() } ?: prettyInstance(inst)
                else -> prettyInstance(inst)
            }
            onDevice(
                MdnsDevice(
                    service = e.service,
                    instance = inst,
                    name = disp,
                    host = e.host,
                    ip = e.ip,
                    port = e.port,
                    txt = e.txt,
                )
            )
        }
    }

    private fun prettyInstance(inst: String): String {
        // raop 实例名 "58D55D7F4C5A@Living Room" → "Living Room"；转义 \032 等还原
        val raw = if (inst.contains('@')) inst.substringAfter('@') else inst
        return raw.replace("\\\\", "\\").ifBlank { inst }
    }
}
