package com.mubeyworks.nextmusic

import android.graphics.RenderEffect
import android.graphics.Shader
import android.os.Build
import android.view.View
import android.view.ViewGroup
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.R as FbR

/**
 * 背景模糊：对指定 nativeID 的 RN 视图施加/移除 RenderEffect 模糊（毛玻璃蒙版）。
 * 仅 API 31+ 生效（RenderEffect 门槛）；低版本自动降级为纯蒙版（无操作，不崩溃）。
 * RN 侧 nativeID 存于 view.getTag(R.id.view_tag_native_id)，遍历查找。
 */
class BlurModule(private val ctx: ReactApplicationContext) : ReactContextBaseJavaModule(ctx) {

    override fun getName() = "NMBlur"

    @ReactMethod
    fun setBlur(nativeId: String, enabled: Boolean) {
        val act = ctx.currentActivity ?: return
        act.runOnUiThread {
            val target = findByNativeId(act.window.decorView, nativeId) ?: return@runOnUiThread
            if (Build.VERSION.SDK_INT >= 31) {
                target.setRenderEffect(
                    if (enabled) RenderEffect.createBlurEffect(24f, 24f, Shader.TileMode.CLAMP)
                    else null
                )
            }
        }
    }

    private fun findByNativeId(v: View, id: String): View? {
        if ((v.getTag(FbR.id.view_tag_native_id) as? String) == id) return v
        if (v is ViewGroup) {
            for (i in 0 until v.childCount) {
                findByNativeId(v.getChildAt(i), id)?.let { return it }
            }
        }
        return null
    }
}
