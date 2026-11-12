package com.mubeyworks.nextmusic

import android.app.role.RoleManager
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.PowerManager
import android.provider.Settings
import android.view.KeyEvent
import android.view.WindowManager
import com.facebook.react.ReactActivity
import com.facebook.react.ReactActivityDelegate
import com.facebook.react.defaults.DefaultNewArchitectureEntryPoint.fabricEnabled
import com.facebook.react.defaults.DefaultReactActivityDelegate
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.ReactContext
import com.facebook.react.modules.core.DeviceEventManagerModule

class MainActivity : ReactActivity() {

  override fun getMainComponentName(): String = "NextMusic"

  override fun onCreate(savedInstanceState: Bundle?) {
    setTheme(if (ThemePrefs.isDark(this)) R.style.AppTheme else R.style.AppThemeLight)
    super.onCreate(savedInstanceState)
    requestCarOptimizations()
  }

  /**
   * 批14d(1112 老板令 TV 遥控器修复):RN WebView 层会拦截 DPAD 方向键和确认键,
   * 导致 WebView 内的 JS spatialFocus 和 keydown handler 收不到事件。
   * 修法:在 Activity 层 override dispatchKeyEvent,把 DPAD_CENTER(keycode 23)
   * 转发为 JS evaluateJavaScript click()。同时不拦截方向键(让 RN WebView 自己处理)。
   */
  override fun dispatchKeyEvent(event: KeyEvent): Boolean {
    if (event.action == KeyEvent.ACTION_DOWN && event.keyCode == KeyEvent.KEYCODE_DPAD_CENTER) {
      // 通过 RN bridge 发送事件到 JS 层
      val reactContext = reactDelegate?.reactHost?.get()?.currentReactContext?.get() as? ReactContext
      if (reactContext != null) {
        reactContext
            .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
            .emit("onDPADCenter", null)
        return true // 消费掉事件,防止 RN 层拦截
      }
    }
    return super.dispatchKeyEvent(event)
  }

  private fun requestCarOptimizations() {
    val isCar = resources.configuration.screenWidthDp >= 1400
    if (!isCar) return
    val pm = getSystemService(Context.POWER_SERVICE) as? PowerManager
    if (pm != null && !pm.isIgnoringBatteryOptimizations(packageName)) {
      try {
        startActivity(Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS, Uri.parse("package:$packageName")))
      } catch (_: Exception) { }
    }
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
      try {
        val rm = getSystemService(Context.ROLE_SERVICE) as? RoleManager
        if (rm != null && rm.isRoleAvailable("android.app.role.MUSIC") && !rm.isRoleHeld("android.app.role.MUSIC")) {
          startActivity(rm.createRequestRoleIntent("android.app.role.MUSIC"))
        }
      } catch (_: Exception) { }
    }
  }

  override fun createReactActivityDelegate(): ReactActivityDelegate =
      DefaultReactActivityDelegate(this, mainComponentName, fabricEnabled)
}
