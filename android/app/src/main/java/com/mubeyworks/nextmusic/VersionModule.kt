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
        // 1029 兕底:Flyme Auto 定制 ROM 常不报 UI_MODE_TYPE_CAR(实车元素小=150% 未触发实锤)——非 TV 且屏宽≥1400dp 判 car
        "uiMode" to when (reactApplicationContext.resources.configuration.uiMode and Configuration.UI_MODE_TYPE_MASK) {
            Configuration.UI_MODE_TYPE_CAR -> "car"
            Configuration.UI_MODE_TYPE_TELEVISION -> "tv"
            else -> {
                val cfg = reactApplicationContext.resources.configuration
                if (cfg.screenWidthDp >= 1400 && (cfg.uiMode and Configuration.UI_MODE_TYPE_MASK) == Configuration.UI_MODE_TYPE_NORMAL) "car" else "normal"
            }
        },
    )
}
