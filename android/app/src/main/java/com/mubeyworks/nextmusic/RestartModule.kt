package com.mubeyworks.nextmusic

import android.content.Intent
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

/**
 * 重启应用：主题切换等需要重新加载 StyleSheet 的场景。
 * launch intent + 清任务栈 + 进程退出，系统会立即以全新任务拉起。
 */
class RestartModule(reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {
    override fun getName() = "AppRestart"

    @ReactMethod
    fun restart() {
        val ctx = reactApplicationContext.applicationContext
        val pm = ctx.packageManager
        val intent = pm.getLaunchIntentForPackage(ctx.packageName)
        if (intent != null) {
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK)
            ctx.startActivity(intent)
        }
        Runtime.getRuntime().exit(0)
    }
}
