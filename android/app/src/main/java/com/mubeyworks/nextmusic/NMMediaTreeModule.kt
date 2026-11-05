package com.mubeyworks.nextmusic

import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.Promise
import com.facebook.react.modules.core.DeviceEventManagerModule

/**
 * JS→原生 内容树推送 + 原生→JS 点播请求
 * JS: NativeModules.NMMediaTree.setMediaLibraryTree(json)
 * 原生点播(媒体中心 onAddMediaItems 拦截) → DeviceEventEmitter 'NMMediaTreePlay' {mediaId}
 */
class NMMediaTreeModule(reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {

    companion object {
        const val NAME = "NMMediaTree"
        const val EVENT_PLAY = "NMMediaTreePlay"
        @Volatile private var ctx: ReactApplicationContext? = null

        /** 媒体中心点歌 → 通知 JS 层接管播放(队列上下文由 JS 反查树快照) */
        fun emitPlayRequest(mediaId: String) {
            val c = ctx ?: return
            val body = Arguments.createMap().apply { putString("mediaId", mediaId) }
            c.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java).emit(EVENT_PLAY, body)
        }
    }

    init { ctx = reactContext }

    override fun getName(): String = NAME

    /** JS 推整树快照(全量替换) */
    @ReactMethod
    fun setMediaLibraryTree(json: String, promise: Promise) {
        try {
            MediaTreeStore.replace(json)
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("E_TREE", "setMediaLibraryTree failed: " + e.message, e)
        }
    }

    override fun invalidate() { ctx = null; super.invalidate() }
}
