package com.mubeyworks.nextmusic

import android.os.Bundle
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
  }

  /**
   * Returns the instance of the {@link ReactActivityDelegate}. We use the {@link DefaultReactActivityDelegate}
   * which allows to enable the New Architecture with the {@link Fabric} boolean flag we overrode.
   */
  override fun createReactActivityDelegate(): ReactActivityDelegate =
      DefaultReactActivityDelegate(this, mainComponentName, fabricEnabled)
}
