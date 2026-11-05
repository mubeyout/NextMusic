package com.mubeyworks.nextmusic

import android.net.Uri
import androidx.annotation.OptIn
import androidx.media3.common.MediaItem
import androidx.media3.common.MediaMetadata
import androidx.media3.common.util.UnstableApi
import androidx.media3.session.LibraryResult
import androidx.media3.session.MediaLibraryService
import androidx.media3.session.MediaSession
import com.google.common.collect.ImmutableList
import com.google.common.util.concurrent.Futures
import com.google.common.util.concurrent.ListenableFuture
import dev.rnap.reactnativeaudiopro.AudioProMediaLibrarySessionCallback

/**
 * NextMusic 媒体内容树实现（车机媒体中心浏览+点播）。
 * 树数据源=MediaTreeStore(JS services/mediaTree.ts 推送的曲库快照,LEO 规格 1105:
 * root 四分类 songs/playlists/artists/albums,单层≤100,空库四分类空列表不崩)。
 * 点播=onAddMediaItems 拦截转发 JS(playSong 带父容器队列上下文),播放态由 session 状态回推。
 * 注:browsable/playable flag 在 MediaMetadata 上(media3 1.6,@UnstableApi)。
 */
@OptIn(UnstableApi::class)
class NMMediaLibraryCallback : AudioProMediaLibrarySessionCallback() {

    private fun toItem(n: MediaTreeStore.Node): MediaItem {
        val meta = MediaMetadata.Builder()
            .setTitle(n.title)
            .setSubtitle(n.subtitle)
            .setArtist(n.subtitle) // 车机播放条歌手行
            .setDescription(n.description)
            .setIsBrowsable(n.browsable)
            .setIsPlayable(!n.browsable)
            .apply { if (n.durationMs > 0) setDurationMs(n.durationMs) }
            .apply { n.iconUri?.let { setArtworkUri(Uri.parse(it)) } }
            .build()
        return MediaItem.Builder()
            .setMediaId(n.mediaId)
            .setMediaMetadata(meta)
            .build()
    }

    override fun onGetLibraryRoot(
        session: MediaLibraryService.MediaLibrarySession,
        controller: MediaSession.ControllerInfo,
        params: MediaLibraryService.LibraryParams?,
    ): ListenableFuture<LibraryResult<MediaItem>> {
        val root = MediaItem.Builder()
            .setMediaId("root")
            .setMediaMetadata(
                MediaMetadata.Builder()
                    .setTitle("NextMusic")
                    .setSubtitle(MediaTreeStore.rootSubtitle().ifEmpty { null })
                    .setMediaType(MediaMetadata.MEDIA_TYPE_FOLDER_MIXED)
                    .setIsBrowsable(true)
                    .setIsPlayable(false)
                    .build()
            )
            .build()
        return Futures.immediateFuture(LibraryResult.ofItem(root, null))
    }

    override fun onGetChildren(
        session: MediaLibraryService.MediaLibrarySession,
        controller: MediaSession.ControllerInfo,
        parentId: String,
        page: Int,
        pageSize: Int,
        params: MediaLibraryService.LibraryParams?,
    ): ListenableFuture<LibraryResult<ImmutableList<MediaItem>>> {
        val all = MediaTreeStore.childNodes(parentId).map { toItem(it) }
        // 分页:媒体中心惯例单层≤100;page<0/pageSize<=0 视为全量(截100兜底)
        val sliced = if (page >= 0 && pageSize > 0) {
            all.drop(page * pageSize).take(pageSize)
        } else {
            all.take(100)
        }
        return Futures.immediateFuture(LibraryResult.ofItemList(ImmutableList.copyOf(sliced), null))
    }

    override fun onGetItem(
        session: MediaLibraryService.MediaLibrarySession,
        controller: MediaSession.ControllerInfo,
        mediaId: String,
    ): ListenableFuture<LibraryResult<MediaItem>> {
        val node = MediaTreeStore.find(mediaId)
            ?: return Futures.immediateFuture(LibraryResult.ofError(LibraryResult.RESULT_ERROR_BAD_VALUE))
        return Futures.immediateFuture(LibraryResult.ofItem(toItem(node), null))
    }

    /**
     * 媒体中心点歌拦截:树内叶子(无 uri,mediaId 命中 store)→emit JS 接管(playSong+队列上下文);
     * 其余(app 内正常播放,item 带 uri)→父类透传。
     * 返回空列表=JS 播放后 session 状态更新,媒体中心 UI 跟随。
     */
    override fun onAddMediaItems(
        mediaSession: MediaSession,
        controller: MediaSession.ControllerInfo,
        mediaItems: List<MediaItem>,
    ): ListenableFuture<List<MediaItem>> {
        val hit = mediaItems.firstOrNull { it.localConfiguration == null && MediaTreeStore.find(it.mediaId) != null }
        if (hit != null) {
            NMMediaTreeModule.emitPlayRequest(hit.mediaId)
            return Futures.immediateFuture(emptyList())
        }
        return super.onAddMediaItems(mediaSession, controller, mediaItems)
    }
}
