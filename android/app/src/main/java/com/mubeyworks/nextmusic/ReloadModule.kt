package com.mubeyworks.nextmusic

import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

/**
 * lx48:主题热重载——RestartModule.restart() 会整 activity 重建+进程退出,
 * 用户看到"闪退再进"。这里走 ReactHost.reload():JS bundle 重载、模块级
 * StyleSheet 全部重建(新主题生效),但 Activity/进程/前台音频服务不动,
 * 视觉上只是界面以新配色刷新一次。掉电语义与 dev 菜单 reload 相同。
 */
class ReloadModule(reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {
  override fun getName() = "AppReload"

  @ReactMethod
  fun reload() {
    val ctx = reactApplicationContext
    val activity = ctx.currentActivity
    val app = activity?.application as? ReactApplication ?: return
    // 必须回主线程调(ReactHost.reload 有线程断言)
    android.os.Handler(android.os.Looper.getMainLooper()).post {
      try {
        app.reactHost.reload("theme-change")
      } catch (_: Throwable) { /* 兜底走旧重启 */ }
    }
  }
}
