package com.mubeyworks.nextmusic

import android.util.Log
import org.json.JSONObject

/**
 * 媒体内容树缓存（车机/系统媒体中心浏览数据源）
 * JS 侧(services/mediaTree.ts)构建快照后经 NMMediaTreeModule.setMediaLibraryTree 推入;
 * NMMediaLibraryCallback 的 onGetRoot/onGetChildren 同步读此缓存。
 * 协议:{"subtitle":"...","children":{"root":[node...],"songs":[...],"pl:xx":[...]}}
 * node:{mediaId,title,subtitle,description,iconUri,durationMs,browsable}
 */
object MediaTreeStore {
    private const val TAG = "NMMediaTree"

    data class Node(
        val mediaId: String,
        val title: String,
        val subtitle: String?,
        val description: String?,
        val iconUri: String?,
        val durationMs: Long,
        val browsable: Boolean,
    ) {
        val playable: Boolean get() = !browsable
    }

    @Volatile private var subtitle: String = ""
    @Volatile private var children: Map<String, List<Node>> = emptyMap()
    @Volatile private var byId: Map<String, Node> = emptyMap()

    /** JS 推送整树(全量替换;失败抛异常由 Module 回给 JS) */
    @Synchronized fun replace(json: String) {
        val root = JSONObject(json)
        val subs = root.optJSONObject("children") ?: JSONObject()
        val map = mutableMapOf<String, List<Node>>()
        val ids = mutableMapOf<String, Node>()
        val it = subs.keys()
        while (it.hasNext()) {
            val key = it.next()
            val arr = subs.optJSONArray(key) ?: continue
            val list = mutableListOf<Node>()
            for (i in 0 until arr.length()) {
                val o = arr.optJSONObject(i) ?: continue
                val n = Node(
                    mediaId = o.optString("mediaId"),
                    title = o.optString("title", ""),
                    subtitle = o.optString("subtitle").takeIf { it.isNotEmpty() && it != "null" },
                    description = o.optString("description").takeIf { it.isNotEmpty() && it != "null" },
                    iconUri = o.optString("iconUri").takeIf { it.isNotEmpty() && it != "null" },
                    durationMs = o.optLong("durationMs", 0L),
                    browsable = o.optBoolean("browsable", false),
                )
                if (n.mediaId.isNotEmpty()) { list.add(n); ids[n.mediaId] = n }
            }
            map[key] = list
        }
        subtitle = root.optString("subtitle", "")
        children = map
        byId = ids
        Log.d(TAG, "tree replaced: parents=" + map.size + " nodes=" + ids.size)
    }

    fun rootSubtitle(): String = subtitle

    /** root 恒有四分类兜底(JS 未推/空库时媒体中心不空壳不崩) */
    fun childNodes(parentId: String): List<Node> {
        children[parentId]?.let { return it }
        if (parentId == "root") return DEFAULT_ROOT
        return emptyList()
    }

    fun find(mediaId: String): Node? = byId[mediaId]

    // 与 src/screens 中文案同源的默认四分类(空态兜底,children 空数组=空列表)
    private val DEFAULT_ROOT = listOf(
        Node("songs", "全部歌曲", null, null, null, 0L, true),
        Node("playlists", "歌单", null, null, null, 0L, true),
        Node("artists", "歌手", null, null, null, 0L, true),
        Node("albums", "专辑", null, null, null, 0L, true),
    )
}
