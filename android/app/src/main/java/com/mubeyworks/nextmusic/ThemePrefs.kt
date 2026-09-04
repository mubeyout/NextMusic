package com.mubeyworks.nextmusic

import android.content.Context
import com.tencent.mmkv.MMKV

/**
 * lx47:原生侧读 MMKV settings 的 light/pureBlack,供 MainActivity 在 onCreate
 * 期(早于 React 渲染)决定 windowBackground 底色。只读不写。
 * MMKV.initialize 幂等;react-native-mmkv 的自动初始化晚于 Activity,这里先显式拉起。
 */
object ThemePrefs {
  @Volatile private var dark: Boolean? = null

  fun isDark(ctx: Context): Boolean {
    dark?.let { return it }
    val v = try {
      MMKV.initialize(ctx)
      val kv = MMKV.mmkvWithID("nextmusic")
      val json = kv?.decodeString("settings") ?: return true
      // 粗解析:{"light":true,...} → 浅色;无 light 或 false → 深色
      val m = Regex("\"light\"\\s*:\\s*(true|false)").find(json)
      m?.groupValues?.get(1) != "true"
    } catch (e: Throwable) {
      true
    }
    dark = v
    return v
  }
}
