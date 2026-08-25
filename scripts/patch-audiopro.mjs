#!/usr/bin/env node
/**
 * react-native-audio-pro 补丁（幂等，postinstall 自动执行）
 *  1. AudioProPlaybackService: 覆写 buildAudioSink 注入 SoundFxProcessor（media3 1.6 正道；反射 app 类避免 lib→app 编译依赖）
 *  2. AudioProController: 新增 setPlaybackPitch（保留当前速度）+ play() 恢复音调
 *  3. AudioProModule: 暴露 setPlaybackPitch @ReactMethod
 */
import { readFileSync, writeFileSync } from 'node:fs';

const base = 'node_modules/react-native-audio-pro/android/src/main/java/dev/rnap/reactnativeaudiopro/';

function patch(file, marker, from, to) {
  const p = base + file;
  let s = readFileSync(p, 'utf8');
  if (s.includes(marker)) {
    console.log(`[patch-audiopro] ${file} ${marker}: already patched`);
    return;
  }
  const i = s.indexOf(from);
  if (i < 0) throw new Error(`[patch-audiopro] ${file} ${marker}: anchor not found:\n${from}`);
  s = s.slice(0, i) + to + s.slice(i + from.length);
  writeFileSync(p, s);
  console.log(`[patch-audiopro] ${file} ${marker}: patched`);
}

// 1) 注入 DSP 处理器（覆写 buildAudioSink）
patch(
  'AudioProPlaybackService.kt',
  '[NextMusic-FX:renderers]',
  '\t\tval player =\n\t\t\tExoPlayer.Builder(this)\n',
  [
    '\t\t// [NextMusic-FX:renderers] 均衡器 DSP 注入：反射加载 app 的 SoundFxEngine（避免 lib→app 编译依赖）',
    '\t\t// media3 1.6：覆写 buildAudioSink 把自定义 AudioProcessor 挂进管线（Sonic 变速/变调仍由 sink 内建处理）',
    '\t\tvar fxRenderersFactory: androidx.media3.exoplayer.DefaultRenderersFactory = androidx.media3.exoplayer.DefaultRenderersFactory(this)',
    '\t\ttry {',
    '\t\t\tval fxProcessor = Class.forName("com.mubeyworks.nextmusic.SoundFxEngine")',
    '\t\t\t\t.getMethod("createProcessor").invoke(null) as androidx.media3.common.audio.AudioProcessor',
    '\t\t\tfxRenderersFactory = object : androidx.media3.exoplayer.DefaultRenderersFactory(this) {',
    '\t\t\t\toverride fun buildAudioSink(context: android.content.Context, enableFloatOutput: Boolean, enableAudioTrackPlaybackParams: Boolean): androidx.media3.exoplayer.audio.AudioSink? {',
    '\t\t\t\t\treturn androidx.media3.exoplayer.audio.DefaultAudioSink.Builder(context)',
    '\t\t\t\t\t\t.setEnableFloatOutput(enableFloatOutput)',
    '\t\t\t\t\t\t.setEnableAudioTrackPlaybackParams(enableAudioTrackPlaybackParams)',
    '\t\t\t\t\t\t.setAudioProcessors(arrayOf(fxProcessor))',
    '\t\t\t\t\t\t.build()',
    '\t\t\t\t}',
    '\t\t\t}',
    '\t\t\tandroid.util.Log.d("AudioProFx", "SoundFx processor attached to ExoPlayer")',
    '\t\t} catch (e: Throwable) {',
    '\t\t\tandroid.util.Log.w("AudioProFx", "SoundFx processor unavailable", e)',
    '\t\t}',
    '\t\tval player =',
    '\t\t\tExoPlayer.Builder(this, fxRenderersFactory)\n',
  ].join('\n'),
);

// 2a) 音调状态变量
patch(
  'AudioProController.kt',
  '[NextMusic-FX:pitch-var]',
  '\tprivate var activePlaybackSpeed: Float = 1.0f\n',
  '\tprivate var activePlaybackSpeed: Float = 1.0f\n\tprivate var activePlaybackPitch: Float = 1.0f // [NextMusic-FX:pitch-var]\n',
);

// 2b) setPlaybackPitch 方法（插在 setVolume 前；controller 方法无注解）
patch(
  'AudioProController.kt',
  '[NextMusic-FX:pitch-fn]',
  '\tfun setVolume(volume: Float) {\n',
  [
    '\t// [NextMusic-FX:pitch-fn] 音调升降（保留当前速度；Sonic 由 ExoPlayer 内建处理）',
    '\tfun setPlaybackPitch(pitch: Float) {',
    '\t\tensureSession()',
    '\t\tactivePlaybackPitch = pitch',
    '\t\trunOnUiThread {',
    '\t\t\tlog("Setting playback pitch to", pitch)',
    '\t\t\tenginerBrowser?.playbackParameters = androidx.media3.common.PlaybackParameters(activePlaybackSpeed, pitch)',
    '\t\t}',
    '\t}',
    '',
    '\tfun setVolume(volume: Float) {\n',
  ].join('\n'),
);

// 2c) play() 恢复音调
patch(
  'AudioProController.kt',
  '[NextMusic-FX:pitch-restore]',
  '\t\t\t\tit.setPlaybackSpeed(opts.speed)\n',
  [
    '\t\t\t\tit.setPlaybackSpeed(opts.speed)',
    '\t\t\t\t// [NextMusic-FX:pitch-restore] 恢复音调设置（服务/播放器重建后不丢）',
    '\t\t\t\tif (activePlaybackPitch != 1.0f) {',
    '\t\t\t\t\tit.playbackParameters = androidx.media3.common.PlaybackParameters(opts.speed, activePlaybackPitch)',
    '\t\t\t\t}\n',
  ].join('\n'),
);

// 3) JS 桥（anchor 含 @ReactMethod 注解行，插在注解之前避免注解重复）
patch(
  'AudioProModule.kt',
  '[NextMusic-FX:pitch-bridge]',
  '\t@ReactMethod\n\tfun setVolume(volume: Double) {\n',
  [
    '\t@ReactMethod // [NextMusic-FX:pitch-bridge]',
    '\tfun setPlaybackPitch(pitch: Double) {',
    '\t\tAudioProController.setPlaybackPitch(pitch.toFloat())',
    '\t}',
    '',
    '\t@ReactMethod\n\tfun setVolume(volume: Double) {\n',
  ].join('\n'),
);

console.log('[patch-audiopro] done');
