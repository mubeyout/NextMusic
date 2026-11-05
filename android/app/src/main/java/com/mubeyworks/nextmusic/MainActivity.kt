package com.mubeyworks.nextmusic

import android.app.role.RoleManager
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.PowerManager
import android.provider.Settings
import com.facebook.react.ReactActivity
import com.facebook.react.ReactActivityDelegate
import com.facebook.react.defaults.DefaultNewArchitectureEntryPoint.fabricEnabled
import com.facebook.react.defaults.DefaultReactActivityDelegate

class MainActivity : ReactActivity() {

  /**
   * Returns the name of the main component registered from JavaScript. This is used to schedule
   * rendering of the component.
   */
  override fun getMainComponentName(): String = "NextMusic"

  /**
   * lx47:启动期按持久化主题即时切换原生 window 底色。
   * styles.xml 的 windowBackground 只能写死一色;一加上转场/重建期间原生层
   * 先于 JS 绘制,浅色用户看到深底一闪(深色反向)。这里 onCreate 期读 MMKV
   * settings 决定用深/浅 windowBackground。
   */
  override fun onCreate(savedInstanceState: Bundle?) {
    setTheme(if (ThemePrefs.isDark(this)) R.style.AppTheme else R.style.AppThemeLight)
    super.onCreate(savedInstanceState)
    // 1105 车机:后台播放保活 + 默认音乐应用(老板令)
    requestCarOptimizations()
  }

  /**
   * 1105 车机:请求电池优化白名单(后台播放不被杀) + 默认音乐角色(语音「播放音乐」识别)
   * 仅车机形态触发(屏宽>=1400dp),手机/TV 不打扰
   */
  private fun requestCarOptimizations() {
    val isCar = resources.configuration.screenWidthDp >= 1400
    if (!isCar) return
    // 1) 电池优化白名单(一次性,系统弹窗)
    val pm = getSystemService(Context.POWER_SERVICE) as? PowerManager
    if (pm != null && !pm.isIgnoringBatteryOptimizations(packageName)) {
      try {
        startActivity(Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS, Uri.parse("package:$packageName")))
      } catch (_: Exception) { /* 部分 ROM 拦截 */ }
    }
    // 2) 默认音乐应用角色(Android 10+)
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
      try {
        val rm = getSystemService(Context.ROLE_SERVICE) as? RoleManager
        if (rm != null && rm.isRoleAvailable("android.app.role.MUSIC") && !rm.isRoleHeld("android.app.role.MUSIC")) {
          startActivity(rm.createRequestRoleIntent("android.app.role.MUSIC"))
        }
      } catch (_: Exception) { /* 部分 ROM 无 RoleManager */ }
    }
  }

  /**
   * Returns the instance of the {@link ReactActivityDelegate}. We use the {@link DefaultReactActivityDelegate}
   * which allows to enable the New Architecture with the {@link Fabric} boolean flag we overrode.
   */
  override fun createReactActivityDelegate(): ReactActivityDelegate =
      DefaultReactActivityDelegate(this, mainComponentName, fabricEnabled)
}
