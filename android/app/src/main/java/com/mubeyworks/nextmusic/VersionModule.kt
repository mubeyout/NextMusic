package com.mubeyworks.nextmusic

import android.content.res.Configuration
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule

// 版本信息：直接读 BuildConfig（build.gradle 是唯一真源，JS 侧无需手动同步）
class VersionModule(reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {
    override fun getName() = "AppVersionInfo"

    override fun getConstants(): Map<String, Any> = mapOf(
        "versionName" to BuildConfig.VERSION_NAME,
        "versionCode" to BuildConfig.VERSION_CODE.toLong(),
        "flavor" to BuildConfig.FLAVOR, // phone / hd —— JS 层 UI 分流
        // 1028 车机适配:设备形态(tv=电视/car=车机/normal)——车机触摸直点输入框/底部 bar 让位要用
        // 1122 实锤:小米电视 uiMode=normal 且 1920x1080@320dpi=960dp 横屏,被宽屏兜底误判 car → 进 CarShell 旧车机壳;
        // 先查系统电视特征(television/leanback)优先判 tv,特征缺失再走宽屏车机兜底。
        "uiMode" to when (reactApplicationContext.resources.configuration.uiMode and Configuration.UI_MODE_TYPE_MASK) {
            Configuration.UI_MODE_TYPE_CAR -> "car"
            Configuration.UI_MODE_TYPE_TELEVISION -> "tv"
            else -> {
                val pm = reactApplicationContext.packageManager
                val isTv = pm.hasSystemFeature("android.hardware.type.television") ||
                    pm.hasSystemFeature("android.software.leanback")
                if (isTv) {
                    "tv"
                } else {
                    val cfg = reactApplicationContext.resources.configuration
                    if (cfg.screenWidthDp >= 900 && cfg.orientation == Configuration.ORIENTATION_LANDSCAPE && (cfg.uiMode and Configuration.UI_MODE_TYPE_MASK) == Configuration.UI_MODE_TYPE_NORMAL) "car" else "normal"
                }
            }
        },
    )
}
