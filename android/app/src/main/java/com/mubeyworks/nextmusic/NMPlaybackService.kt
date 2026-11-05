package com.mubeyworks.nextmusic

import androidx.media3.session.MediaLibraryService
import dev.rnap.reactnativeaudiopro.AudioProPlaybackService

/**
 * 内容树版播放服务:继承 audio-pro 库 service(DSP 注入/保活/通知全继承),
 * 仅换 MediaLibrarySession callback → NM 内容树(媒体中心可浏览 NM 曲库)。
 * Manifest 注册此类(替换库 service 声明,intent-filter 原样保留)。
 */
class NMPlaybackService : AudioProPlaybackService() {
    override fun createLibrarySessionCallback(): MediaLibraryService.MediaLibrarySession.Callback =
        NMMediaLibraryCallback()
}
