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

// 1) 注入 DSP 处理器（覆写 buildAudioSink；createProcessor 传 applicationContext 供 IR assets 加载）
patch(
  'AudioProPlaybackService.kt',
  '[NextMusic-FX:renderers]',
  '\t\tval player =\n\t\t\tExoPlayer.Builder(this)\n',
  [
    '\t\t// [NextMusic-FX:renderers] 均衡器 DSP 注入：反射加载 app 的 SoundFxEngine（避免 lib→app 编译依赖）',
    '\t\t// media3 1.6：覆写 buildAudioSink 把自定义 AudioProcessor 挂进管线（Sonic 变速/变调仍由 sink 内建处理）',
    '\t\tvar fxRenderersFactory: androidx.media3.exoplayer.DefaultRenderersFactory = androidx.media3.exoplayer.DefaultRenderersFactory(this)',
    '\t\ttry {',
    '\t\t\tval fxMethod = Class.forName("com.mubeyworks.nextmusic.SoundFxEngine")',
    '\t\t\t\t.getMethod("createProcessor", android.content.Context::class.java)',
    '\t\t\tval fxProcessor = fxMethod.invoke(null, applicationContext) as androidx.media3.common.audio.AudioProcessor',
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

// 1c) [NextMusic-FX:route] 音频输出路由：buildAudioSink 产出的 sink 登记到 AudioRouteEngine，
// 供应用内切设备（DefaultAudioSink.setPreferredDevice）使用；偏好在新 sink 上自动重放。
patch(
  'AudioProPlaybackService.kt',
  '[NextMusic-FX:route]',
  '\t\t\t\t\treturn androidx.media3.exoplayer.audio.DefaultAudioSink.Builder(context)\n\t\t\t\t\t\t.setEnableFloatOutput(enableFloatOutput)\n\t\t\t\t\t\t.setEnableAudioTrackPlaybackParams(enableAudioTrackPlaybackParams)\n\t\t\t\t\t\t.setAudioProcessors(arrayOf(fxProcessor))\n\t\t\t\t\t\t.build()\n',
  [
    '\t\t\t\t\tval nmSink = androidx.media3.exoplayer.audio.DefaultAudioSink.Builder(context)',
    '\t\t\t\t\t\t.setEnableFloatOutput(enableFloatOutput)',
    '\t\t\t\t\t\t.setEnableAudioTrackPlaybackParams(enableAudioTrackPlaybackParams)',
    '\t\t\t\t\t\t.setAudioProcessors(arrayOf(fxProcessor))',
    '\t\t\t\t\t\t.build()',
    '\t\t\t\t\t// [NextMusic-FX:route] 反射登记 sink（避免 lib→app 编译依赖）；换 sink 时重放设备偏好',
    '\t\t\t\t\ttry {',
    '\t\t\t\t\t\tClass.forName("com.mubeyworks.nextmusic.AudioRouteEngine")',
    '\t\t\t\t\t\t\t.getMethod("attachSink", Object::class.java).invoke(null, nmSink)',
    '\t\t\t\t\t} catch (_: Throwable) { }',
    '\t\t\t\t\treturn nmSink\n',
  ].join('\n'),
);

// 1b) 媒体库转码流超时调大：Emby 服务端转码冷启动（rclone 随机读 ape 尾 + ValidateEncoderOutput）可 >8s，
// 默认 8s read timeout 会反复断开重试。connect 15s / read 30s。
patch(
  'AudioProPlaybackService.kt',
  '[NextMusic-FX:timeouts]',
  '\t\t\t\tval httpDataSourceFactory = DefaultHttpDataSource.Factory()\n',
  [
    '\t\t\t\tval httpDataSourceFactory = DefaultHttpDataSource.Factory()',
    '\t\t\t\t// [NextMusic-FX:timeouts] 转码流冷启动可 >8s（rclone 随机读/ValidateEncoderOutput），默认 8s read timeout 会断开重试',
    '\t\t\t\t\t.setConnectTimeoutMs(15_000)',
    '\t\t\t\t\t.setReadTimeoutMs(30_000)',
    ''
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

// 5a) [NextMusic-FX:state-fn] 原生真状态查询（JS 重建/Activity 回收后 lib 的 internalStore 归零，
//     AudioPro.getState() 全是 JS 侧数据不可信；以进程级 Controller 为准）
patch(
  'AudioProController.kt',
  '[NextMusic-FX:state-fn]',
  '\t// [NextMusic-FX:pitch-fn] 音调升降（保留当前速度；Sonic 由 ExoPlayer 内建处理）\n',
  [
    '\t// [NextMusic-FX:state-fn] 原生真状态（JS 重建后 internalStore 归零，以进程级状态为准）',
    '\tfun nativePlaybackState(): String = if (flowLastEmittedState.isNotEmpty()) flowLastEmittedState else "IDLE"',
    '\tfun nativeActiveTrack(): com.facebook.react.bridge.ReadableMap? = activeTrack',
    '',
    '\t// [NextMusic-FX:pitch-fn] 音调升降（保留当前速度；Sonic 由 ExoPlayer 内建处理）\n',
  ].join('\n'),
);

// 5b) [NextMusic-FX:state-bridge] JS 桥：getNativeState(promise) 返回 {state, trackId?, trackTitle?, trackArtist?}
patch(
  'AudioProModule.kt',
  '[NextMusic-FX:state-bridge]',
  '\t@ReactMethod // [NextMusic-FX:pitch-bridge]\n',
  [
    '\t@ReactMethod // [NextMusic-FX:state-bridge]',
    '\tfun getNativeState(promise: com.facebook.react.bridge.Promise) {',
    '\t\tval m = com.facebook.react.bridge.Arguments.createMap()',
    '\t\tm.putString("state", AudioProController.nativePlaybackState())',
    '\t\tval t = AudioProController.nativeActiveTrack()',
    '\t\tif (t != null) {',
    '\t\t\tif (t.hasKey("id")) m.putString("trackId", t.getString("id") ?: "")',
    '\t\t\tif (t.hasKey("title")) m.putString("trackTitle", t.getString("title") ?: "")',
    '\t\t\tif (t.hasKey("artist")) m.putString("trackArtist", t.getString("artist") ?: "")',
    '\t\t}',
    '\t\tpromise.resolve(m)',
    '\t}',
    '',
    '\t@ReactMethod // [NextMusic-FX:pitch-bridge]\n',
  ].join('\n'),
);

console.log('[patch-audiopro] done');

// 4) [NextMusic-FX:artwork-optional] JS 侧：artwork 空/缺省合法化（Emby/Subsonic 等无封面歌曲会被上游强制校验拒播）
//    - validateFilePath: 空串跳过（消除误报）
//    - validateTrack: artwork 仅在有值时校验合法性
function patchJs(rel, marker, pairs) {
  const p = 'node_modules/react-native-audio-pro/' + rel;
  let s = readFileSync(p, 'utf8');
  if (s.includes(marker)) {
    console.log(`[patch-audiopro] ${rel} ${marker}: already patched`);
    return;
  }
  for (const [from, to] of pairs) {
    if (!s.includes(from) && s.includes(to)) continue; // 旧版已打但无 marker：跳过
    const i = s.indexOf(from);
    if (i < 0) throw new Error(`[patch-audiopro] ${rel}: anchor not found:\n${from}`);
    s = s.slice(0, i) + to + s.slice(i + from.length);
  }
  s = s.replace("'use strict';", `'use strict';\n/* ${marker} */`, 1);
  writeFileSync(p, s);
  console.log(`[patch-audiopro] ${rel} ${marker}: patched`);
}

const JS_PAIRS = [
  // validateFilePath: 空值跳过
  ["function validateFilePath(path) {\n  const supportedSchemes = ['http://', 'https://', 'file://'];\n  if (!supportedSchemes.some(scheme => path && path.startsWith(scheme))) {",
   "function validateFilePath(path) {\n  const supportedSchemes = ['http://', 'https://', 'file://'];\n  if (path && !supportedSchemes.some(scheme => path.startsWith(scheme))) {"],
  // validateTrack: artwork 仅在有值时校验
  ["  // 5. Artwork URL must be a non-empty string and valid\n  if (typeof track.artwork !== 'string' || !track.artwork.trim() || !isValidUrl(track.artwork)) {",
   "  // 5. Artwork URL must be valid if provided (NextMusic: empty allowed)\n  if (typeof track.artwork === 'string' && track.artwork.trim() && !isValidUrl(track.artwork)) {"],
];
patchJs('lib/commonjs/utils.js', '[NextMusic-FX:artwork-optional]', JS_PAIRS);
patchJs('lib/module/utils.js', '[NextMusic-FX:artwork-optional]', JS_PAIRS);
