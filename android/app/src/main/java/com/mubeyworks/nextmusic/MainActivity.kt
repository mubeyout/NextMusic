package com.mubeyworks.nextmusic

import android.app.role.RoleManager
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.PowerManager
import android.provider.Settings
import android.util.Log
import android.view.KeyEvent
import com.facebook.react.ReactActivity
import com.facebook.react.ReactActivityDelegate
import com.facebook.react.ReactApplication
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
   * 批18(1112 老板令 1554):真遥控器 DPAD/OK 全链路——TV logcat 考古实锤:
   * 1) 真遥控器(小米蓝牙语音遥控器 dev75 Keyboard 接口)发的就是标准 DPAD keycode 19-23:
   *    老板三次按键会话(00:02/00:04/00:15)WindowManager 全记成 "Unhandled key: win=...
   *    MainActivity"——keyCode=20 x32(含长按 repeat 序列)+ keyCode=23 x4,事件全部
   *    送达了焦点窗口但 app 从没消费过(方向键批14d 根本没实现,CENTER 链路见下)
   * 2) 已装 v185 APK dex 里 "onDPADCenter" 0 命中——批14d 的 dispatchKeyEvent 代码根本没进包
   *    (构建时源码竞态坏包;且批14d 的 reactDelegate?.reactHost?.get()?.get() 取值链与
   *    RN 0.87 实际 API 不符——ReactHost.currentReactContext 是直接 val,没有 .get(),故其
   *    Kotlin 编译从未成功,装出去的一直是批14d 之前的旧源产物)
   * 3) WebView 被 patch-webview-focus 设为 isFocusable=false(推屏沙箱防吞焦点的副作用),
   *    原生 DPAD 永远到不了页面——而页面 real16 分区导航/确认键栈等的是页面内 keydown 事件
   * 修:Activity 层拦 TV 键族 {DPAD_UP/DOWN/LEFT/RIGHT/CENTER(19-23)+ENTER(66)+
   * NUMPAD_ENTER(160)+BUTTON_A(96)} 的 ACTION_DOWN/UP(含 repeat),经 RN bridge emit
   * "onTVKey" {keyCode, action(0=down/1=up), repeat, repeatCount} → WebShell 合成 Chrome 74
   * 可用的 KeyboardEvent 注入页面 document(页面侧 real16 分区导航+real15/14 确认键栈消费)。
   * ReactContext 取值走 (application as ReactApplication).reactHost.currentReactContext
   * ——ReloadModule.kt 同款仓内已验证链(ReactHost.kt: currentReactContext 直接 val)。
   */
  override fun dispatchKeyEvent(event: KeyEvent): Boolean {
    val a = event.action
    if ((a == KeyEvent.ACTION_DOWN || a == KeyEvent.ACTION_UP) && event.keyCode in TV_KEY_CODES) {
      val kc = event.keyCode
      Log.d("NM-TVKey", "kc=" + kc + " act=" + a + " rep=" + event.repeatCount + " dev=" + event.deviceId)
      val ctx = (application as? ReactApplication)?.reactHost?.currentReactContext as? ReactContext
      if (ctx != null) {
        val params = Arguments.createMap().apply {
          putInt("keyCode", kc)
          putInt("action", if (a == KeyEvent.ACTION_DOWN) 0 else 1)
          putBoolean("repeat", event.repeatCount > 0)
          putInt("repeatCount", event.repeatCount)
        }
        ctx.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
            .emit("onTVKey", params)
        // DPAD 族+BUTTON_A 消费掉(WebView 不可焦点原生 key 事件收不到;事件已 emit,消费防
        // RN/系统焦点搜索乱跳);ENTER 族放行不消费(手机外接键盘 TextInput 需要 Enter 键;
        // TV 上 RN 侧无人消费事件会自然落到 unhandled——但 JS 链路已 emit,注入照常工作)
        return kc != KeyEvent.KEYCODE_ENTER && kc != KeyEvent.KEYCODE_NUMPAD_ENTER
      }
      Log.w("NM-TVKey", "reactContext null (boot?) — kc=" + kc + " emit skipped")
    }
    return super.dispatchKeyEvent(event)
  }

  /** 批18:TV 遥控器键族——DPAD 4 向+确认(23)+蓝牙遥控/键盘的 Enter 族(66/160)+手柄 A(96) */
  private val TV_KEY_CODES = setOf(
    KeyEvent.KEYCODE_DPAD_UP, KeyEvent.KEYCODE_DPAD_DOWN,
    KeyEvent.KEYCODE_DPAD_LEFT, KeyEvent.KEYCODE_DPAD_RIGHT,
    KeyEvent.KEYCODE_DPAD_CENTER,
    KeyEvent.KEYCODE_ENTER, KeyEvent.KEYCODE_NUMPAD_ENTER, KeyEvent.KEYCODE_BUTTON_A,
  )

  private fun requestCarOptimizations() {
    val isCar = resources.configuration.screenWidthDp >= 1400
    if (!isCar) return
    val pm = getSystemService(Context.POWER_SERVICE) as? PowerManager
    if (pm != null && !pm.isIgnoringBatteryOptimizations(packageName)) {
      try {
        startActivity(Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS, Uri.parse("package:" + packageName)))
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
