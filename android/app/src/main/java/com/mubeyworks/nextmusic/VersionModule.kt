package com.mubeyworks.nextmusic

import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule

// 版本信息：直接读 BuildConfig（build.gradle 是唯一真源，JS 侧无需手动同步）
class VersionModule(reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {
    override fun getName() = "AppVersionInfo"

    override fun getConstants(): Map<String, Any> = mapOf(
        "versionName" to BuildConfig.VERSION_NAME,
        "versionCode" to BuildConfig.VERSION_CODE.toLong(),
    )
}
