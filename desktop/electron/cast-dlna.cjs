/**
 * 桌面版 DLNA 投屏（老板 2026-09-14：桌面版保留投屏）
 * 纯 Node 零依赖：SSDP M-SEARCH 发现 → DESCRIPTION XML 解析 → AVTransport/RenderingControl SOAP 控制。
 * 接口对齐原生 NMDlna（audioroute.ts 的 D 接口），事件经 webContents 推给 renderer。
 */
const dgram = require('dgram');
const http = require('http');

const SSDP_ADDR = '239.255.255.250';
const SSDP_PORT = 1900;
const SCAN_MS = 5000; // 单轮扫描窗口

let sock = null;            // 共享 SSDP socket
let scanTimer = null;
let scanning = false;
const found = new Map();    // uuid -> device（本轮已上报）
let sendFn = () => {};      // 事件出口（main.cjs 注入 webContents.send）

function setSender(fn) { sendFn = fn; }

function emit(channel, payload) { try { sendFn(channel, payload); } catch { /* window gone */ } }

// ---------- SSDP 发现 ----------

function startDiscovery() {
  if (scanning) return;
  scanning = true;
  found.clear();
  if (!sock) {
    sock = dgram.createSocket({ type: 'udp4', reuseAddr: true });
    sock.on('message', (msg, rinfo) => onSsdp(msg, rinfo));
    sock.on('error', () => { /* 网络栈异常时静默:扫描空列表走「未发现设备」分支 */ });
  }
  const bind = (cb) => { try { sock.bind(cb); } catch { cb && cb(); } };
  bind(() => {
    const search = () => {
      for (const st of [
        'urn:schemas-upnp-org:device:MediaRenderer:1',
        'urn:schemas-upnp-org:device:MediaRenderer:2',
        'ssdp:all',
      ]) {
        const pkt = ['M-SEARCH * HTTP/1.1', `HOST: ${SSDP_ADDR}:${SSDP_PORT}`, `ST: ${st}`, 'MAN: "ssdp:discover"', 'MX: 3', '', ''].join('\r\n');
        try { sock.send(pkt, SSDP_PORT, SSDP_ADDR); } catch { /* ignore */ }
      }
    };
    search();
    // MX=3 内设备陆续应答;3s 再补一轮,防首轮丢包
    setTimeout(search, 3000).unref?.();
  });
  clearTimeout(scanTimer);
  scanTimer = setTimeout(() => {
    scanning = false;
    emit('dlna.scanEnd', {});
    try { sock && sock.close(); } catch { /* ignore */ }
    sock = null;
  }, SCAN_MS);
}

function stopDiscovery() {
  clearTimeout(scanTimer);
  scanning = false;
  try { sock && sock.close(); } catch { /* ignore */ }
  sock = null;
}

async function onSsdp(msg) {
  const text = msg.toString();
  const loc = /LOCATION:\s*(\S+)/i.exec(text)?.[1];
  const usn = /USN:\s*(\S+)/i.exec(text)?.[1] || loc || '';
  const uuid = /uuid:([0-9a-fA-F-]{36})/.exec(usn)?.[1] || usn;
  if (!loc || found.has(uuid)) return;
  found.set(uuid, null); // 先占位防并发重复
  const dev = await parseDescription(loc, uuid).catch(() => null);
  if (!dev) { found.delete(uuid); return; }
  found.set(uuid, dev);
  emit('dlna.found', dev);
}

/** 拉取并解析设备描述 XML:friendlyName + AVTransport/RenderingControl controlURL */
async function parseDescription(loc, uuid) {
  const xml = await httpGet(loc, 4000);
  const name = /<friendlyName>([^<]+)<\/friendlyName>/i.exec(xml)?.[1]?.trim();
  const svcBlocks = xml.match(/<service>[\s\S]*?<\/service>/gi) || [];
  let controlUrl = '', rcUrl = '';
  for (const b of svcBlocks) {
    const type = /<serviceType>([^<]+)<\/serviceType>/i.exec(b)?.[1] || '';
    const url = /<controlURL>([^<]+)<\/controlURL>/i.exec(b)?.[1]?.trim() || '';
    if (/AVTransport/.test(type) && !controlUrl) controlUrl = url;
    if (/RenderingControl/.test(type) && !rcUrl) rcUrl = url;
  }
  if (!controlUrl) return null; // 不是渲染器
  const abs = (u) => new URL(u, loc).toString();
  return { uuid, name: name || 'DLNA 设备', host: new URL(loc).hostname, port: Number(new URL(loc).port) || 80, controlUrl: abs(controlUrl), rcUrl: rcUrl ? abs(rcUrl) : '' };
}

// ---------- HTTP / SOAP ----------

function httpGet(url, timeout) {
  return new Promise((resolve, reject) => {
    const req = http.get(url, { timeout }, (res) => {
      let buf = '';
      res.on('data', (c) => { buf += c; });
      res.on('end', () => resolve(buf));
    });
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
    req.on('error', reject);
  });
}

function soap(url, service, action, args) {
  const body = `<?xml version="1.0" encoding="utf-8"?><s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/" s:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/"><s:Body><u:${action} xmlns:u="${service}">${args}</u:${action}></s:Body></s:Envelope>`;
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const req = http.request({
      hostname: u.hostname, port: u.port || 80, path: u.pathname + u.search,
      method: 'POST', timeout: 5000,
      headers: {
        'Content-Type': 'text/xml; charset="utf-8"',
        SOAPACTION: `"${service}#${action}"`,
        'Content-Length': Buffer.byteLength(body),
      },
    }, (res) => {
      let buf = '';
      res.on('data', (c) => { buf += c; });
      res.on('end', () => resolve(buf));
    });
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
    req.on('error', reject);
    req.end(body);
  });
}

const AVT = 'urn:schemas-upnp-org:service:AVTransport:1';
const RCT = 'urn:schemas-upnp-org:service:RenderingControl:1';
const IID = '<InstanceID>0</InstanceID>';

// ---------- 控制接口（对齐 NMDlna） ----------

async function cast(dev, url, title, artist) {
  const meta = `<DIDL-Lite xmlns="urn:schemas-upnp-org:metadata-1-0/DIDL-Lite/" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:upnp="urn:schemas-upnp-org:metadata-1-0/upnp/"><item><dc:title>${esc(title)}</dc:title><dc:creator>${esc(artist)}</dc:creator><upnp:class>object.item.audioItem.musicTrack</upnp:class></item></DIDL-Lite>`;
  await soap(dev.controlUrl, AVT, 'SetAVTransportURI', `${IID}<CurrentURI>${esc(url)}</CurrentURI><CurrentURIMetaData>${esc(meta)}</CurrentURIMetaData>`);
  await soap(dev.controlUrl, AVT, 'Play', `${IID}<Speed>1</Speed>`);
  return true;
}
const play = (dev) => soap(dev.controlUrl, AVT, 'Play', `${IID}<Speed>1</Speed>`).then(() => true).catch(() => false);
const pause = (dev) => soap(dev.controlUrl, AVT, 'Pause', IID).then(() => true).catch(() => false);
const stop = (dev) => soap(dev.controlUrl, AVT, 'Stop', IID).then(() => true).catch(() => false);
const seek = (dev, sec) => soap(dev.controlUrl, AVT, 'Seek', `${IID}<Unit>REL_TIME</Unit><Target>${fmtTime(sec)}</Target>`).then(() => true).catch(() => false);

async function getPosition(dev) {
  const xml = await soap(dev.controlUrl, AVT, 'GetPositionInfo', IID);
  return {
    pos: parseTime(/<RelTime>([^<]+)<\/RelTime>/i.exec(xml)?.[1]),
    dur: parseTime(/<TrackDuration>([^<]+)<\/TrackDuration>/i.exec(xml)?.[1]),
    state: 'PLAYING',
  };
}

async function getTransportState(dev) {
  const xml = await soap(dev.controlUrl, AVT, 'GetTransportInfo', IID);
  return /<CurrentTransportState>([^<]+)</i.exec(xml)?.[1] || 'STOPPED';
}

async function getVolume(dev) {
  if (!dev.rcUrl) return 50;
  const xml = await soap(dev.rcUrl, RCT, 'GetVolume', `${IID}<Channel>Master</Channel>`);
  return Number(/<CurrentVolume>(\d+)</i.exec(xml)?.[1] || 50);
}
const setVolume = (dev, vol) => dev.rcUrl
  ? soap(dev.rcUrl, RCT, 'SetVolume', `${IID}<Channel>Master</Channel><DesiredVolume>${Math.round(vol)}</DesiredVolume>`).then(() => true).catch(() => false)
  : Promise.resolve(false);

/** TCP 直连探活（对齐 lx42 兜底:传入 [{host,port}] 返回可达下标数组） */
function probeTcp(targets) {
  const net = require('net');
  return Promise.all(targets.map(({ host, port }) => new Promise((ok) => {
    const s = net.connect({ host, port, timeout: 1200 });
    s.on('connect', () => { s.destroy(); ok(true); });
    s.on('timeout', () => { s.destroy(); ok(false); });
    s.on('error', () => ok(false));
  }))).then((arr) => arr.map((v, i) => [v, i]).filter(([v]) => v).map(([, i]) => i));
}

// ---------- utils ----------
const esc = (s = '') => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const parseTime = (hms) => {
  if (!hms) return 0;
  const p = String(hms).split(':').map(Number);
  return (p[0] || 0) * 3600 + (p[1] || 0) * 60 + (p[2] || 0);
};
const fmtTime = (sec) => {
  const s = Math.max(0, Math.floor(sec));
  return `${String(Math.floor(s / 3600)).padStart(2, '0')}:${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
};

module.exports = {
  setSender, startDiscovery, stopDiscovery, cast, play, pause, stop, seek,
  getPosition, getTransportState, getVolume, setVolume, probeTcp,
};
