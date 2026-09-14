/**
 * 桌面版 Chromecast 投屏（老板 2026-09-14：桌面版保留投屏）
 * 依赖:bonjour-service(mDNS 发现,纯 JS) + castv2-client(Cast V2 协议,protobufjs 纯 JS)。
 * 接口对齐原生 NMCast(audioroute.ts 的 G 接口)。
 */
const { Bonjour } = require('bonjour-service');
const { Client, DefaultMediaReceiver } = require('castv2-client');

const SCAN_MS = 5000;
let browser = null;
let scanTimer = null;
const sessions = new Map(); // uuid -> { client, player }
let sendFn = () => {};

function setSender(fn) { sendFn = fn; }
function emit(channel, payload) { try { sendFn(channel, payload); } catch { /* window gone */ } }

function startDiscovery() {
  stopDiscovery();
  const bonjour = new Bonjour();
  const seen = new Map();
  browser = bonjour.find({ type: 'googlecast', protocol: 'tcp' }, (svc) => {
    const host = (svc.addresses || []).find((a) => a.includes('.')) || svc.addresses?.[0];
    if (!host) return;
    const uuid = svc.txt?.id || svc.name;
    const key = uuid || `${host}:${svc.port}`;
    if (seen.has(key)) return;
    seen.set(key, true);
    emit('cast.found', {
      uuid: key,
      name: svc.txt?.fn || svc.name || 'Chromecast',
      host,
      port: svc.port || 8009,
    });
  });
  scanTimer = setTimeout(() => {
    emit('cast.scanEnd', {});
    cleanup();
  }, SCAN_MS);
  // bonjour-service 停止浏览但不销毁实例(销毁会关 mDNS socket,影响后续扫描)
  function cleanup() {
    clearTimeout(scanTimer);
    try { browser && browser.stop(); } catch { /* ignore */ }
    try { bonjour && bonjour.destroy(); } catch { /* ignore */ }
    browser = null;
  }
}

function stopDiscovery() {
  clearTimeout(scanTimer);
  try { browser && browser.stop(); } catch { /* ignore */ }
  browser = null;
}

function devKey(dev) { return dev.uuid || `${dev.host}:${dev.port}`; }

async function launchPlayer(dev) {
  const key = devKey(dev);
  const s = sessions.get(key);
  if (s) return s;
  const client = new Client();
  const player = await new Promise((resolve, reject) => {
    client.connect({ host: dev.host, port: dev.port }, (err) => {
      if (err) return reject(err);
      client.launch(DefaultMediaReceiver, (err2, p) => (err2 ? reject(err2) : resolve(p)));
    });
  });
  client.on('error', () => closeSession(key));
  sessions.set(key, { client, player });
  return { client, player };
}

function closeSession(key) {
  const s = sessions.get(key);
  if (!s) return;
  sessions.delete(key);
  try { s.client.close(); } catch { /* ignore */ }
}

async function cast(dev, url, title, artist, contentType) {
  const { player } = await launchPlayer(dev);
  await new Promise((resolve, reject) => {
    player.load({
      contentId: url,
      contentType: contentType || 'audio/mpeg',
      streamType: 'BUFFERED', // 音源是可 seek 的 http 流
      metadata: { metadataType: 3, title: title || '未知歌曲', artist: artist || '' }, // 3 = MUSIC_TRACK
    }, { autoplay: true, currentTime: 0 }, (err) => (err ? reject(err) : resolve()));
  });
  return true;
}

const pcall = (dev, fn, ...args) => launchPlayer(dev)
  .then(({ player }) => new Promise((ok) => { try { player[fn](...args, () => ok(true)); } catch { ok(false); } }))
  .catch(() => false);
const play = (dev) => pcall(dev, 'play');
const pause = (dev) => pcall(dev, 'pause');
const stop = (dev) => {
  const key = devKey(dev);
  const s = sessions.get(key);
  if (!s) return Promise.resolve(true);
  return new Promise((ok) => { try { s.player.stop(() => { closeSession(key); ok(true); }, () => { closeSession(key); ok(true); }); } catch { closeSession(key); ok(true); } });
};
const seek = (dev, sec) => pcall(dev, 'seek', sec);

function getPosition(dev) {
  return launchPlayer(dev).then(({ player }) => new Promise((resolve, reject) => {
    try {
      player.getStatus((err, st) => {
        if (err) return reject(err);
        const t = st?.currentTime || 0;
        resolve({ pos: Math.floor(t), dur: Math.floor(st?.media?.duration || 0), state: st?.playerState === 'PAUSED' ? 'PAUSED' : 'PLAYING' });
      });
    } catch (e) { reject(e); }
  })).catch(() => ({ pos: 0, dur: 0, state: 'STOPPED' }));
}

function getVolume(dev) {
  return launchPlayer(dev).then(({ player }) => new Promise((resolve) => {
    try { player.getVolume((err, v) => resolve(err ? 50 : Math.round((v || 0) * 100))); } catch { resolve(50); }
  })).catch(() => 50);
}
function setVolume(dev, pct) {
  return launchPlayer(dev).then(({ player }) => new Promise((resolve) => {
    try { player.setVolume({ level: Math.min(1, Math.max(0, pct / 100)) }, (err) => resolve(!err)); } catch { resolve(false); }
  })).catch(() => false);
}

function closeAll() { for (const k of [...sessions.keys()]) closeSession(k); }

module.exports = {
  setSender, startDiscovery, stopDiscovery, cast, play, pause, stop, seek,
  getPosition, getVolume, setVolume, closeAll,
};
