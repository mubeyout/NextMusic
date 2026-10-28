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
        "uiMode" to when (reactContext.resources.configuration.uiMode and Configuration.UI_MODE_TYPE_MASK) {
            Configuration.UI_MODE_TYPE_CAR -> "car"
            Configuration.UI_MODE_TYPE_TELEVISION -> "tv"
            else -> "normal"
        },
    )
}
