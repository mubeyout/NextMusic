// UploadSheet —— 我的曲库上传 UI(P1b):进行态队列 sheet + 最小化浮条 + 完成卡 + 空态主动作
// 形态:手机/web=底部 sheet;HD(TV)=居中模态卡。行级进度/重试(品红错误色),并发 2 在 UploadQueue。
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, Modal, TouchableOpacity, Platform, ActivityIndicator, Pressable, Animated } from 'react-native';
import SafX from 'react-native-saf-x';
import { Icon } from '../theme/Icon';
import { C } from '../theme/tokens';
import { toast } from '../components/Dialog';
import {
  getUploadStore, subscribeUpload, enqueueUpload, retryFailed, retryItem,
  minimizeUpload, openUploadSheet, closeFinished, dismissUpload,
} from '../state/UploadQueue';
import type { UpBatch, UpItem } from '../state/UploadQueue';
import { store as httpStore } from '../services/server';

const IS_HD = (Platform.OS === 'android' && ((Platform as { constants?: { Product?: string } }).constants?.Product?.includes?.('box') ?? false))
  || (Platform.OS === 'web' && typeof navigator !== 'undefined' && /Android TV|levision|HD\b/i.test(navigator.userAgent));

/** 选文件并批量入队(空态主钮/设备音乐屏共用);web 走 input,native 走 SAF */
export function pickAndUpload() {
  if (!httpStore.token) { toast('请先登录服务器'); return; }
  if (Platform.OS === 'web') {
    const input = document.createElement('input');
    input.type = 'file';
    input.multiple = true;
    input.accept = '.mp3,.flac,.m4a,.ogg,.wav,.ape,audio/*';
    input.onchange = () => {
      const files = Array.from(input.files || []);
      const items = files
        .filter(f => /\.(mp3|flac|m4a|ogg|wav|ape)$/i.test(f.name))
        .map(f => ({ uri: URL.createObjectURL(f), name: f.name, mime: f.type || undefined }));
      if (!items.length) { toast('未选择音频文件'); return; }
      enqueueUpload(items);
    };
    input.click();
    return;
  }
  SafX.openDocument({ multiple: true })
    .then(docs => {
      const items = (docs || []).filter(Boolean).map(d => ({ uri: d.uri, name: d.name || d.uri.split('/').pop() || 'audio', mime: d.type }));
      if (!items.length) return;
      enqueueUpload(items);
    })
    .catch(() => { /* 用户取消 */ });
}

// A3b(质感整改):行进度条 200ms width 过渡(spec⑧),替代瞬时跳变
function AnimBar({ pct, trackStyle, fillStyle }: { pct: number; trackStyle: unknown; fillStyle: unknown }) {
  const v = useRef(new Animated.Value(pct)).current;
  useEffect(() => { Animated.timing(v, { toValue: pct, duration: 200, useNativeDriver: false }).start(); }, [pct, v]);
  return (
    <View style={trackStyle as never}>
      <Animated.View style={[fillStyle as never, { width: v.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }) }]} />
    </View>
  );
}

function useStore() {
  const [, force] = useState(0);
  useEffect(() => subscribeUpload(() => force(n => n + 1)), []);
  return getUploadStore();
}

// A3a(质感整改):完成卡弹入 240ms 0.96→1(spec⑧;prefers-reduced-motion 停动画)
function FinishCard({ batch: b, failed, onGo }: { batch: UpBatch; failed: UpItem[]; onGo: () => void }) {
  const sc = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    let reduce = false;
    try { reduce = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { /* ignore */ }
    if (reduce) return;
    sc.setValue(0.96);
    Animated.timing(sc, { toValue: 1, duration: 240, useNativeDriver: false }).start();
  }, [sc, b.id]);
  return (
    <Modal transparent visible onRequestClose={closeFinished}>
      <Pressable style={u.backdrop} onPress={closeFinished}>
        <Pressable style={[u.sheet, IS_HD && u.sheetHD, { transform: [{ scale: sc }] }] as never} onPress={() => {}}>
          {/* A1(LEO 整改 spec):三态——全失败=错误卡/全跳过=已在库卡/有成功=加入卡(治「0 首已加入+扫描完成」逻辑矛盾) */}
          {(b.summary?.uploaded || 0) === 0 ? (
            <>
              {failed.length && !(b.summary?.skipped) ? (
                <View style={[u.doneIcon, u.doneIconErr]}><Icon name="cloud" size={26} color="#E8618C" /></View>
              ) : (
                <View style={u.doneIcon}><Icon name="cloud" size={26} color={C.brand} /></View>
              )}
              <Text style={u.doneT1}>{failed.length && !(b.summary?.skipped) ? '上传失败' : `${b.summary?.skipped || 0} 首已在曲库`}</Text>
              <Text style={u.doneT2}>
                {failed.length && !(b.summary?.skipped)
                  ? '没有文件成功到达服务器,检查网络后重试全部。'
                  : '同名歌曲已存在,未重复上传。想传新的请先在曲库删除或改名。'}
              </Text>
            </>
          ) : (
            <>
              <View style={u.doneIcon}><Icon name="cloud" size={26} color={C.brand} /></View>
              <Text style={u.doneT1}>{b.summary?.uploaded || 0} 首已加入你的专辑墙</Text>
              <Text style={u.doneT2}>
                服务器扫描完成{b.byDirSplit ? `：${b.byDirSplit.id3Full} 首 ID3 完整 · ${b.byDirSplit.byDir} 首按文件夹分组` : ''}{b.summary?.skipped ? ` · ${b.summary.skipped} 首已在库跳过` : ''}{failed.length ? ` · ${failed.length} 首失败可重试` : ''}
              </Text>
            </>
          )}
          {b.stats ? <Text style={u.doneStat}>曲库统计已更新：{b.stats.songs} 首 · {b.stats.albums} 专辑</Text> : null}
          {failed.length ? (
            <TouchableOpacity style={[u.retryAllBtn, (b.summary?.uploaded || 0) === 0 && b.summary?.skipped ? u.retryAllMain : null]} onPress={retryFailed}>
              <Text style={[u.retryAllT, (b.summary?.uploaded || 0) === 0 && b.summary?.skipped ? u.retryAllMainT : null]}>{(b.summary?.uploaded || 0) === 0 && !(b.summary?.skipped) ? '重试全部' : `重试失败 ${failed.length} 首`}</Text>
            </TouchableOpacity>
          ) : null}
          <TouchableOpacity style={u.doneGo} onPress={onGo}>
            <Text style={u.doneGoT}>查看专辑墙</Text><Icon name="chevronright" size={12} color={C.brand} />
          </TouchableOpacity>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

export function useUploadSheet(onDone?: () => void) {
  const s = useStore();
  const doneRef = useRef(onDone);
  doneRef.current = onDone;
  const b = s.batch;
  const SheetView = useCallback(() => {
    if (!b) return null;
    const doneCount = b.items.filter(i => i.st === 'done' || i.st === 'skip').length;
    const failed = b.items.filter(i => i.st === 'fail');
    const upCount = b.items.filter(i => i.st === 'up').length;
    const total = b.items.length;
    // ── 完成卡 ──
    if (s.finishedOpen && b.doneAt) {
      return <FinishCard batch={b} failed={failed} onGo={() => { closeFinished(); dismissUpload(); doneRef.current?.(); }} />;
    }
    // ── 最小化浮条 ──
    if (s.minimized) {
      return (
        <TouchableOpacity style={u.mini} onPress={openUploadSheet} activeOpacity={0.85}>
          <ActivityIndicator size="small" color={C.brand} />
          <Text style={u.miniT}>{b.doneAt ? `上传完成 · ${b.summary?.uploaded ?? 0}/${total}` : `上传 ${doneCount}/${total}`}</Text>
          <Icon name="chevronright" size={13} color={C.text3} />
        </TouchableOpacity>
      );
    }
    // ── 进行态 sheet ──
    const progOverall = total ? b.items.reduce((n, i) => n + (i.st === 'done' || i.st === 'skip' ? 1 : i.prog), 0) / total : 0;
    return (
      <Modal transparent visible onRequestClose={minimizeUpload}>
        <Pressable style={u.backdrop} onPress={minimizeUpload}>
          <Pressable style={[u.sheet, IS_HD && u.sheetHD]} onPress={() => {}}>
            <View style={u.sheetHead}>
              <Text style={u.sheetT}>正在上传</Text>
              <Text style={u.sheetC}>{doneCount}/{total} · 可最小化</Text>
            </View>
            <AnimBar pct={progOverall} trackStyle={u.barTrack} fillStyle={u.barFill} />
            <Text style={u.barSub}>总进度 {Math.round(progOverall * 100)}%{failed.length ? ` · 失败 ${failed.length}` : ''}</Text>
            <View style={{ maxHeight: 300 } as never}>
              <View>
                {b.items.map(it => (
                  <View key={it.key} style={u.qRow}>
                    <View style={[u.qCvs, { backgroundColor: 'rgba(255,255,255,.06)' }]}><Icon name="music" size={14} color={C.text3} /></View>
                    <View style={u.qMid}>
                      <Text style={u.qName} numberOfLines={1}>{it.name}</Text>
                      {it.st === 'up' ? (
                        <AnimBar pct={it.prog} trackStyle={u.qBarTrack} fillStyle={u.qBarFill} />
                      ) : (
                        <Text style={[u.qSub, it.st === 'fail' && { color: '#E8618C' }]} numberOfLines={1}>
                          {it.st === 'wait' ? '排队中' : it.st === 'done' ? '已完成' : it.st === 'skip' ? '已在曲库 · 跳过' : (it.reason || '失败')}
                        </Text>
                      )}
                    </View>
                    {it.st === 'up' ? <Text style={u.qPct}>{Math.round(it.prog * 100)}%</Text>
                      : it.st === 'fail' ? <TouchableOpacity onPress={() => retryItem(it.key)}><Text style={u.qRetry}>重试</Text></TouchableOpacity>
                      : it.st === 'done' ? <Icon name="play" size={13} color={C.brand} /> : null}
                  </View>
                ))}
              </View>
            </View>
            <View style={u.sheetFoot}>
              <TouchableOpacity style={u.minBtn} onPress={minimizeUpload}><Text style={u.minBtnT}>最小化</Text></TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    );
  }, [b, s.minimized, s.finishedOpen]);
  const EmptyAction = useCallback(() => (
    <TouchableOpacity style={u.emptyBtn} onPress={pickAndUpload} activeOpacity={0.85}>
      <Icon name="cloud" size={12} color="#04120a" />
      <Text style={u.emptyBtnT}>上传到曲库</Text>
    </TouchableOpacity>
  ), []);
  return { View: SheetView, EmptyAction };
}

const u = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,.55)', justifyContent: IS_HD ? 'center' : 'flex-end', alignItems: 'center' },
  sheet: { width: '92%' as never, maxWidth: 480, backgroundColor: '#151517', borderRadius: 18, borderWidth: 1, borderColor: C.stroke, padding: 18, paddingBottom: 14 },
  sheetHD: { width: 560, maxWidth: 560 },
  sheetHead: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  sheetT: { color: C.text, fontSize: 15, fontWeight: '800', flex: 1 },
  sheetC: { color: C.text3, fontSize: 11 },
  barTrack: { height: 5, borderRadius: 5, backgroundColor: 'rgba(255,255,255,.08)', overflow: 'hidden' },
  barFill: { height: '100%', backgroundColor: C.brand, borderRadius: 5 },
  barSub: { color: C.text3, fontSize: 10.5, marginTop: 5, marginBottom: 6 },
  qRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 7 },
  qCvs: { width: 34, height: 34, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  qMid: { flex: 1, minWidth: 0 },
  qName: { color: C.text, fontSize: 12, lineHeight: 16 },
  qBarTrack: { height: 3, borderRadius: 3, backgroundColor: 'rgba(255,255,255,.08)', marginTop: 5, overflow: 'hidden' },
  qBarFill: { height: '100%', backgroundColor: C.brand },
  qSub: { color: C.text3, fontSize: 10, marginTop: 2 },
  qPct: { color: C.brand, fontSize: 10.5, fontWeight: '700', width: 36, textAlign: 'right' },
  qRetry: { color: C.text2, fontSize: 10.5, borderWidth: 1, borderColor: C.stroke, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3 },
  sheetFoot: { flexDirection: 'row', justifyContent: 'center', marginTop: 10 },
  minBtn: { borderWidth: 1, borderColor: C.stroke, borderRadius: 999, paddingHorizontal: 22, paddingVertical: 8 },
  minBtnT: { color: C.text2, fontSize: 12, fontWeight: '600' },
  // 迷你浮条
  mini: { position: 'absolute', bottom: 18, left: 16, right: 16, flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#151517', borderWidth: 1, borderColor: C.stroke, borderRadius: 999, paddingHorizontal: 16, paddingVertical: 11, shadowColor: '#000', shadowOpacity: 0.5, shadowRadius: 12, elevation: 8 },
  miniT: { flex: 1, color: C.text2, fontSize: 12, fontWeight: '600' },
  // 完成卡
  doneIcon: { width: 56, height: 56, borderRadius: 16, backgroundColor: 'rgba(30,215,96,.08)', borderWidth: 1, borderColor: 'rgba(30,215,96,.2)', alignItems: 'center', justifyContent: 'center', marginBottom: 10 },
  doneIconErr: { backgroundColor: 'rgba(232,97,140,.08)', borderColor: 'rgba(232,97,140,.25)' },
  retryAllMain: { backgroundColor: '#E8618C', borderWidth: 0 },
  retryAllMainT: { color: '#fff' },
  doneT1: { color: C.text, fontSize: 15.5, fontWeight: '800', textAlign: 'center' },
  doneT2: { color: C.text3, fontSize: 11.5, lineHeight: 17, textAlign: 'center', marginTop: 6, maxWidth: 260 },
  doneStat: { color: C.text3, fontSize: 10.5, marginTop: 10, textAlign: 'center' },
  retryAllBtn: { marginTop: 12, borderWidth: 1, borderColor: C.stroke, borderRadius: 999, paddingHorizontal: 20, paddingVertical: 8 },
  retryAllT: { color: C.text2, fontSize: 12, fontWeight: '700' },
  doneGo: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 14, alignSelf: 'center' },
  doneGoT: { color: C.brand, fontSize: 13, fontWeight: '700' },
  // 空态主钮
  emptyBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: C.brand, borderRadius: 999, paddingHorizontal: 20, paddingVertical: 9, marginTop: 10 },
  emptyBtnT: { color: '#04120a', fontSize: 12.5, fontWeight: '800' },
});
