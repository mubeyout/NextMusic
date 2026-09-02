// WebView sandbox HTML builder.
// Hosts: lxserver musicSdk (virtual CommonJS modules) + LX custom source scripts.
// All HTTP goes through the RN bridge (native fetch, no CORS).
import { VFILES } from './sdk-modules.generated';
import { PAKO_JS, CRYPTOJS_JS } from './prelude.generated';

// Shim source: plain ES5-ish JS. No backticks / template literals inside (it is
// embedded in a TS template literal below).
const SHIM = `
var __nativePost = function (m) { try { ReactNativeWebView.postMessage(JSON.stringify(m)); } catch (e) {} };
(function () { var origLog = console.log, origErr = console.error, origWarn = console.warn;
  console.log = function () { var a = Array.prototype.slice.call(arguments).map(function (x) { return typeof x === 'object' ? JSON.stringify(x).slice(0, 400) : String(x); }).join(' '); __nativePost({ t: 'log', line: 'L ' + a }); origLog.apply(console, arguments); };
  console.error = function () { var a = Array.prototype.slice.call(arguments).map(function (x) { return typeof x === 'object' ? JSON.stringify(x).slice(0, 400) : String(x); }).join(' '); __nativePost({ t: 'log', line: 'E ' + a }); origErr.apply(console, arguments); };
  console.warn = function () { var a = Array.prototype.slice.call(arguments).map(function (x) { return typeof x === 'object' ? JSON.stringify(x).slice(0, 400) : String(x); }).join(' '); __nativePost({ t: 'log', line: 'W ' + a }); origWarn.apply(console, arguments); };
})();
__nativePost({ t: 'log', line: 'BOOT shim-start' });
var __bridge = (function () {
  var httpWaiters = {};
  var seq = 1;
  function post(m) { __nativePost(m); }
  window.__lxhttpResp = function (payloadStr) {
    var m;
    try { m = JSON.parse(payloadStr); } catch (e) { return; }
    var w = httpWaiters[m.hid]; if (!w) return; delete httpWaiters[m.hid];
    if (m.err) return w.cb(new Error(String(m.err)));
    var body = m.bodyB64 != null ? __buf.from(m.bodyB64, 'base64') : (m.bodyText == null ? '' : m.bodyText);
    if (typeof body === 'string') { try { body = JSON.parse(body); } catch (e) {} }
    w.cb(null, { statusCode: m.statusCode, statusMessage: '', headers: m.headers, body: body });
  };
  function httpReq(url, opts, cb) {
    var hid = 'h' + (seq++);
    httpWaiters[hid] = { cb: cb };
    post({ t: 'http', hid: hid, url: url, method: opts.method || 'get', headers: opts.headers || {}, body: opts.__body == null ? null : String(opts.__body), bodyEnc: opts.__bodyEnc || 'utf8' });
    return function () { delete httpWaiters[hid]; };
  }
  return { post: post, httpReq: httpReq };
})();

// ---------- Buffer ----------
var __buf = (function () {
  var te = new TextEncoder(), td = new TextDecoder('utf-8');
  function fromStr(s, enc) {
    enc = (enc || 'utf8').toLowerCase();
    if (enc === 'utf8' || enc === 'utf-8') return new Uint8Array(te.encode(s));
    if (enc === 'base64') { var bin = atob(s.replace(/[^A-Za-z0-9+/=]/g, '')); var u = new Uint8Array(bin.length); for (var i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return u; }
    if (enc === 'hex') { var h = s.replace(/[^0-9a-fA-F]/g, ''); var o = new Uint8Array(h.length >> 1); for (var j = 0; j < o.length; j++) o[j] = parseInt(h.substr(j * 2, 2), 16); return o; }
    if (enc === 'binary' || enc === 'latin1') { var b = new Uint8Array(s.length); for (var k = 0; k < s.length; k++) b[k] = s.charCodeAt(k) & 0xff; return b; }
    return new Uint8Array(te.encode(s));
  }
  function toStr(u, enc) {
    enc = (enc || 'utf8').toLowerCase();
    if (enc === 'utf8' || enc === 'utf-8') return td.decode(u);
    if (enc === 'base64') { var s = ''; for (var i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000)); return btoa(s); }
    if (enc === 'hex') { var h = ''; for (var j = 0; j < u.length; j++) h += (u[j] < 16 ? '0' : '') + u[j].toString(16); return h; }
    var out = ''; for (var k = 0; k < u.length; k += 0x8000) out += String.fromCharCode.apply(null, u.subarray(k, k + 0x8000)); return out;
  }
  function mk(u) {
    u.__isB = true;
    u.toString = function (enc) { return toStr(u, enc); };
    return u;
  }
  var Buffer = {
    from: function (d, enc) {
      if (d && d.__isB) return mk(new Uint8Array(d));
      if (typeof d === 'string') return mk(fromStr(d, enc));
      if (d && typeof d === 'object' && typeof d.length === 'number') {
        var u = new Uint8Array(d.length);
        for (var fi = 0; fi < d.length; fi++) u[fi] = d[fi];
        return mk(u);
      }
      return mk(new Uint8Array(0));
    },
    alloc: function (n) { return mk(new Uint8Array(n)); },
    isBuffer: function (x) { return !!x && x.__isB === true; },
    concat: function (list) {
      var len = 0; for (var i = 0; i < list.length; i++) len += list[i].length;
      var out = new Uint8Array(len), o = 0;
      for (var j = 0; j < list.length; j++) { out.set(list[j], o); o += list[j].length; }
      return mk(out);
    },
  };
  Buffer.prototype = Uint8Array.prototype;
  return Buffer;
})();
var Buffer = __buf;

// ---------- crypto (node-style over CryptoJS) ----------
var __crypto = (function () {
  var CJ = window.CryptoJS;
  function u2w(u) {
    var words = [];
    for (var i = 0; i < u.length; i++) {
      var w = i >>> 2;
      words[w] = (words[w] || 0) + ((u[i] & 0xff) << (24 - (i % 4) * 8));
    }
    return CJ.lib.WordArray.create(words, u.length);
  }
  function w2u(wa) {
    var out = new Uint8Array(wa.sigBytes);
    for (var i = 0; i < out.length; i++) out[i] = (wa.words[i >>> 2] >>> (24 - (i % 4) * 8)) & 0xff;
    return out;
  }
  function asU(d) {
    if (typeof d === 'string') return __buf.from(d);
    if (d && typeof d === 'object' && typeof d.length === 'number') {
      if (d.__isB) return d;
      var au = new Uint8Array(d.length);
      for (var ai = 0; ai < d.length; ai++) au[ai] = d[ai];
      return au;
    }
    return new Uint8Array(0);
  }
  var hashes = { md5: CJ.MD5, sha1: CJ.SHA1, sha256: CJ.SHA256 };
  function createHash(alg) {
    var fn = hashes[alg]; if (!fn) throw new Error('hash not supported: ' + alg);
    var parts = [];
    return {
      update: function (d) { parts.push(asU(d)); return this; },
      digest: function (enc) {
        var len = 0; parts.forEach(function (p) { len += p.length; });
        var all = new Uint8Array(len), o = 0;
        parts.forEach(function (p) { all.set(p, o); o += p.length; });
        var h = fn(u2w(all));
        return enc === 'base64' ? h.toString(CJ.enc.Base64) : h.toString(CJ.enc.Hex);
      },
    };
  }
  function parseAlg(alg) {
    var m = /^aes-(\\d+)-(cbc|ecb)$/.exec(alg);
    if (!m) throw new Error('cipher not supported: ' + alg);
    return { bits: +m[1], mode: m[2] };
  }
  function createCipheriv(alg, key, iv) {
    var a = parseAlg(alg);
    var chunks = [];
    function enc(d) {
      var r = CJ.AES.encrypt(u2w(asU(d)), u2w(asU(key)), {
        mode: a.mode === 'ecb' ? CJ.mode.ECB : CJ.mode.CBC,
        iv: a.mode === 'ecb' ? undefined : u2w(asU(iv)),
        padding: CJ.pad.Pkcs7,
      });
      return __buf.from(w2u(r.ciphertext));
    }
    return { update: function (d) { var c = enc(d); chunks.push(c); return c; }, final: function () { return __buf.alloc(0); } };
  }
  function createDecipheriv(alg, key, iv) {
    var a = parseAlg(alg);
    function dec(d) {
      var u = asU(d);
      var r = CJ.AES.decrypt(CJ.lib.CipherParams.create({ ciphertext: u2w(u) }), u2w(asU(key)), {
        mode: a.mode === 'ecb' ? CJ.mode.ECB : CJ.mode.CBC,
        iv: a.mode === 'ecb' ? undefined : u2w(asU(iv)),
        padding: CJ.pad.Pkcs7,
      });
      return __buf.from(w2u(r));
    }
    return { update: function (d) { return dec(d); }, final: function () { return __buf.alloc(0); } };
  }
  function randomBytes(n) { return __buf.from(w2u(CJ.lib.WordArray.random(n))); }

  // ---------- RSA (BigInt) ----------
  function b2big(u) {
    var h = ''; for (var i = 0; i < u.length; i++) h += (u[i] < 16 ? '0' : '') + u[i].toString(16);
    return h.length ? BigInt('0x' + h) : 0n;
  }
  function big2b(b, len) {
    var h = b.toString(16); if (h.length % 2) h = '0' + h;
    var out = new Uint8Array(len);
    var by = h.length / 2;
    for (var i = 0; i < by; i++) out[len - by + i] = parseInt(h.substr(i * 2, 2), 16);
    return out;
  }
  function modPow(b, e, m) {
    var r = 1n; b %= m;
    while (e > 0n) { if (e & 1n) r = (r * b) % m; b = (b * b) % m; e >>= 1n; }
    return r;
  }
  function parseRsaPublic(pem) {
    var b64 = pem.replace(/-----[^-]+-----/g, '').replace(/\\s+/g, '');
    var bin = atob(b64), der = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) der[i] = bin.charCodeAt(i);
    var o = { p: 0 };
    function tl() { var t = der[o.p++], l = der[o.p++]; if (l & 0x80) { var n = l & 0x7f; l = 0; for (var i = 0; i < n; i++) l = (l << 8) | der[o.p++]; } return { t: t, l: l }; }
    function skip() { var x = tl(); o.p += x.l; }
    function rdInt() { var x = tl(); if (x.t !== 0x02) { o.p += x.l; return null; } var v = der.subarray(o.p, o.p + x.l); o.p += x.l; return v; }
    tl(); skip();  // outer SEQ header, then AlgId SEQ content (OID + NULL)
    tl(); o.p++;   // BITSTRING header, unused-bits byte
    tl();          // inner SEQ header
    var n = rdInt(), e = rdInt();
    if (!n || !e) throw new Error('bad rsa public key');
    while (n.length && n[0] === 0) n = n.subarray(1);
    return { n: b2big(n), e: b2big(e), k: n.length };
  }
  function publicEncrypt(arg1, buf) {
    var pem = typeof arg1 === 'string' ? arg1 : arg1.key;
    var padding = typeof arg1 === 'string' ? 1 : (arg1.padding || 1); // default PKCS1
    var key = parseRsaPublic(pem);
    var m = asU(buf), em = new Uint8Array(key.k);
    if (padding === 3) { em.set(m, key.k - m.length); }
    else { // PKCS1 v1.5 type 2
      em[0] = 0; em[1] = 2;
      for (var i = 2; i < key.k - m.length - 1; i++) em[i] = 1 + Math.floor(Math.random() * 255);
      em[key.k - m.length - 1] = 0;
      em.set(m, key.k - m.length);
    }
    return __buf.from(big2b(modPow(b2big(em), key.e, key.n), key.k));
  }
  return {
    createHash: createHash, createCipheriv: createCipheriv, createDecipheriv: createDecipheriv,
    publicEncrypt: publicEncrypt, randomBytes: randomBytes,
    constants: { RSA_NO_PADDING: 3, RSA_PKCS1_PADDING: 1 },
  };
})();

// ---------- zlib (pako, node callback style) ----------
var __zlib = (function () {
  var P = window.pako;
  function cbify(fn) {
    return function (buf, cb) {
      try { cb(null, __buf.from(fn(new Uint8Array(buf)))); }
      catch (e) { cb(e); }
    };
  }
  return { inflate: cbify(P.inflate), inflateRaw: cbify(P.inflateRaw), deflate: cbify(P.deflate), deflateRaw: cbify(P.deflateRaw), gunzip: cbify(P.ungzip) };
})();

// ---------- needle bridge ----------
var __needle = (function () {
  function urlencode(obj) {
    var p = [];
    for (var k in obj) if (Object.prototype.hasOwnProperty.call(obj, k)) p.push(encodeURIComponent(k) + '=' + encodeURIComponent(obj[k]));
    return p.join('&');
  }
  function request(method, url, data, opts, cb) {
    opts = opts || {};
    var headers = {};
    for (var k in (opts.headers || {})) headers[k] = opts.headers[k];
    var body = null, bodyEnc = 'utf8';
    if (opts.form != null && typeof opts.form === 'object') {
      body = urlencode(opts.form);
      if (!headers['Content-Type'] && !headers['content-type']) headers['Content-Type'] = 'application/x-www-form-urlencoded';
    } else if (opts.formData != null && typeof opts.formData === 'object') {
      body = urlencode(opts.formData);
      if (!headers['Content-Type'] && !headers['content-type']) headers['Content-Type'] = 'application/x-www-form-urlencoded';
    } else if (opts.json === true && data != null) {
      body = JSON.stringify(data);
      if (!headers['Content-Type'] && !headers['content-type']) headers['Content-Type'] = 'application/json';
    } else if (typeof data === 'string') {
      body = data;
    } else if (data != null && typeof data === 'object') {
      body = JSON.stringify(data);
      if (!headers['Content-Type'] && !headers['content-type']) headers['Content-Type'] = 'application/json';
    } else if (data && data.__isB) {
      body = data.toString('base64'); bodyEnc = 'b64';
    }
    var abort = __bridge.httpReq(url, { method: method, headers: headers, __body: body, __bodyEnc: bodyEnc }, function (err, resp) {
      if (!err && resp && resp.body && typeof resp.body === 'object' && resp.body.code != null && resp.body.code !== 200 && resp.body.code !== 0) {
        console.log('HTTP code!=200', method, url, JSON.stringify(resp.body).slice(0, 200));
      }
      cb(err, resp);
    });
    return { request: { abort: function () { abort && abort(); } } };
  }
  return { request: request };
})();

// ---------- module loader ----------
var __mods = {}, __cache = {};
function __norm(base, id) {
  var parts = (base ? base.split('/') : []);
  parts.pop();
  var seg = id.split('/');
  for (var i = 0; i < seg.length; i++) {
    var s = seg[i];
    if (s === '.' || s === '') continue;
    if (s === '..') parts.pop();
    else parts.push(s);
  }
  var p = parts.join('/');
  return p.replace(/^(server\\/modules\\/utils\\/|modules\\/utils\\/|server\\/common\\/|common\\/|server\\/)/, '');
}
function __resolve(base, id) {
  if (id === 'request') return 'request';
  if (id === 'crypto' || id === 'zlib' || id === 'dns' || id === 'tunnel' || id === 'iconv-lite' || id === 'buffer' || id === 'needle' || id === 'events') return id;
  var p = __norm(base, id);
  var cands = [];
  var cur = p;
  for (var i = 0; i < 7; i++) {
    cands.push(cur, cur + '.js', cur + '/index.js', cur.replace(/\\.min$/, '') + '.js');
    if (cur === 'index') cands.push('utils/index.js');
    var seg = cur.split('/')[0];
    if (cur.indexOf('/') < 0) break;
    if (['server', 'modules', 'utils', 'common', 'musicSdk', 'lyricUtils'].indexOf(seg) < 0) break;
    cur = cur.slice(seg.length + 1);
  }
  for (var j = 0; j < cands.length; j++) {
    if (__mods[cands[j]] != null || cands[j] === 'request') return cands[j];
  }
  return null;
}
var __shims = {
  crypto: __crypto,
  zlib: __zlib,
  buffer: __buf,
  needle: __needle,
  dns: { lookup: function (h, o, cb) { cb(new Error('dns not available')); } },
  tunnel: {},
  'iconv-lite': { decode: function (b) { return b.toString('utf8'); }, encode: function (s) { return __buf.from(s); } },
  events: { EventEmitter: function () { var h = {}; return { on: function (n, f) { (h[n] = h[n] || []).push(f); }, emit: function (n) { (h[n] || []).forEach(function (f) { f(); }); } }; } },
};
function __req(base, id) {
  var key = __resolve(base, id);
  if (key === 'request') return __requestModule;
  if (key && __shims[key]) return __shims[key];
  if (!key || __mods[key] == null) {
    console.warn('[loader] unresolved module "' + id + '" from ' + base);
    return {};
  }
  if (__cache[key]) return __cache[key].exports;
  var mod = { exports: {} };
  __cache[key] = mod;
  var fn = new Function('exports', 'require', 'module', '__filename', '__dirname', __mods[key]);
  var dir = key.split('/'); dir.pop();
  fn(mod.exports, function (sub) { return __req(key, sub); }, mod, key, dir.join('/'));
  return mod.exports;
}

// ---------- request module (musicSdk-compatible httpFetch) ----------
var __requestModule = (function () {
  var defaultHeaders = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' };
  // 限流保护：对网易 weapi 域名走全局串行队列（对齐 lxserver 全局串行策略，防 406 操作频繁）
  var wyQueue = Promise.resolve(), wyLast = 0;
  function httpFetch(url, options) {
    options = options || {};
    var headers = {};
    for (var k in defaultHeaders) headers[k] = defaultHeaders[k];
    for (var k2 in (options.headers || {})) headers[k2] = options.headers[k2];
    var isWy = /music\.163\.com/.test(url);
    var cancelled = false, rejectFn = null;
    var run = function () {
      if (isWy) {
        var wait = Math.max(0, wyLast + 350 - Date.now());
        return new Promise(function (r) { setTimeout(r, wait); }).then(function () { wyLast = Date.now(); });
      }
      return Promise.resolve();
    };
    if (isWy) wyQueue = wyQueue.then(run, run);
    var gate = isWy ? wyQueue : Promise.resolve();
    var obj = {
      promise: new Promise(function (resolve, reject) {
        rejectFn = reject;
        gate.then(function () {
          if (cancelled) return;
          __needle.request(options.method || 'get', url, options.body != null ? options.body : null, {
            headers: headers,
            json: options.format === 'json' ? false : options.json,
            form: options.form, formData: options.formData,
          }, function (err, resp) {
            if (cancelled) return;
            if (err) return reject(err);
            resolve(resp);
          });
        });
      }),
      cancelHttp: function () { cancelled = true; if (rejectFn) { try { rejectFn(new Error('取消请求')); } catch (e) {} } },
    };
    return obj;
  }
  function http(url, options, cb) {
    if (typeof options === 'function') { cb = options; options = {}; }
    httpFetch(url, options).promise.then(function (r) { cb(null, r, r.body); }, function (e) { cb(e, null, null); });
  }
  function httpGet(url, options, callback) {
    if (typeof options === 'function') { callback = options; options = {}; }
    http(url, Object.assign({}, options, { method: 'get' }), callback);
  }
  function httpPost(url, data, options, callback) {
    if (typeof options === 'function') { callback = options; options = {}; }
    options.body = typeof data === 'object' && !(data && data.__isB) ? JSON.stringify(data) : data;
    http(url, Object.assign({}, options, { method: 'post' }), callback);
  }
  function http_jsonp(url, options, callback) {
    if (typeof options === 'function') { callback = options; options = {}; }
    var cbName = 'jsonpCallback';
    if (url.indexOf('?') < 0) url += '?';
    url += '&' + (options.jsonpCallback || 'callback') + '=' + cbName;
    httpGet(url, options, function (err, resp, body) {
      if (!err && typeof body === 'string') {
        try { body = JSON.parse(body.replace(new RegExp('^' + cbName + '\\\\((\\\\{.*\\\\})\\\\)$'), '$1')); } catch (e) {}
      }
      callback(err, resp, body);
    });
  }
  return { httpFetch: httpFetch, http: http, httpGet: httpGet, httpPost: httpPost, http_jsonp: http_jsonp, cancelHttp: function () {} };
})();

// ---------- musicSdk ----------
var __sdk = null;
function sdk() {
  if (!__sdk) {
    var m = __req('', 'musicSdk/index.js');
    __sdk = m.default || m;
  }
  return __sdk;
}

// ---------- LX custom source host ----------
var __userApis = {};
function __lxRequest() {
  return function (url, options, callback) {
    options = options || {};
    var method = options.method || 'get';
    var headers = options.headers || {};
    var body = null;
    if (options.form) {
      var p = [];
      for (var k in options.form) p.push(encodeURIComponent(k) + '=' + encodeURIComponent(options.form[k]));
      body = p.join('&');
    } else if (options.body != null) {
      body = typeof options.body === 'object' ? JSON.stringify(options.body) : options.body;
    } else if (options.json === true && options.data != null) {
      body = JSON.stringify(options.data);
    }
    var cancel = __bridge.httpReq(url, { method: method, headers: headers, __body: body, __bodyEnc: 'utf8' }, function (err, resp) {
      if (err) return callback(err, null, null);
      callback(null, { statusCode: resp.statusCode, headers: resp.headers, body: resp.body }, resp.body);
    });
    return cancel;
  };
}
function initUserApi(id, script) {
  return new Promise(function (resolve, reject) {
    var handlers = {}, registered = {}, timer = null;
    var lx = {
      version: '2.0.0', env: 'mobile', platform: 'android',
      currentScriptInfo: { id: id },
      EVENT_NAMES: { request: 'request', inited: 'inited', updateAlert: 'updateAlert' },
      request: __lxRequest(),
      utils: {
        buffer: {
          from: function (d, e) { return __buf.from(d, e); },
          bufToString: function (b, f) { return b.toString(f); },
        },
        crypto: {
          md5: function (s) { return __crypto.createHash('md5').update(String(s == null ? '' : s)).digest('hex'); },
          aesEncrypt: function (buf, mode, key, iv) {
            var c = __crypto.createCipheriv('aes-' + (key.length * 8) + '-' + mode, key, iv);
            return __buf.concat([c.update(buf), c.final()]);
          },
          rsaEncrypt: function (buf, key) { return __crypto.publicEncrypt(key, buf); },
          randomBytes: function (n) { return __crypto.randomBytes(n); },
        },
        zlib: {
          inflate: function (b) { return new Promise(function (res, rej) { __zlib.inflate(b, function (e, r) { e ? rej(e) : res(r); }); }); },
          deflate: function (b) { return new Promise(function (res, rej) { __zlib.deflate(b, function (e, r) { e ? rej(e) : res(r); }); }); },
        },
      },
      send: function (name, data) {
        if (name === 'inited') {
          registered = (data && data.sources) || {};
          if (timer) clearTimeout(timer);
          resolve({ sources: registered });
        } else if (name === 'updateAlert') {
          // vc88：LX 预埋更新协议——脚本自检发现新版（自带 version 端点比对新版），
          // 转发宿主弹窗一键覆盖；inited 通常已 resolve，这里只广播不再当错误
          try { __bridge.post({ t: 'sourceUpdate', id: id, info: { log: (data && data.log) || '', updateUrl: (data && data.updateUrl) || '' } }); } catch (e) {}
        }
      },
      on: function (name, handler) { if (name === 'request') handlers.request = handler; },
    };
    var prevLx = window.lx, prevBuf = window.Buffer;
    window.lx = lx; window.Buffer = __buf;
    try {
      timer = setTimeout(function () { reject(new Error('初始化超时：脚本未调用 lx.send("inited")')); }, 8000);
      new Function(script)();
    } catch (e) {
      clearTimeout(timer);
      window.lx = prevLx; window.Buffer = prevBuf;
      reject(e);
      return;
    }
    __userApis[id] = { lx: lx, handler: function () { return handlers.request && handlers.request.apply(null, arguments); }, registered: registered };
  });
}
function userApiUrl(id, source, musicInfo, type) {
  var api = __userApis[id];
  if (!api) return Promise.reject(new Error('音源未加载'));
  return Promise.resolve(api.handler({ action: 'musicUrl', source: source, info: { musicInfo: musicInfo, type: type } }))
    .then(function (r) { return JSON.parse(JSON.stringify(r == null ? {} : r)); });
}

// ---------- RPC dispatch ----------
window.__lxcmd = function (id, payloadStr) {
  var p = JSON.parse(payloadStr);
  Promise.resolve().then(function () {
    if (p.k === 'ping') return 'pong';
    if (p.k === 'sdk') {
      var obj = sdk();
      for (var i = 0; i < p.path.length - 1; i++) obj = obj[p.path[i]];
      var last = p.path[p.path.length - 1];
      var fn = obj ? obj[last] : null;
      if (typeof fn !== 'function') throw new Error('sdk method not found: ' + p.path.join('.'));
      var r = fn.apply(obj, p.args || []);
      // 坑75：lxserver 源模块部分方法（wy/kg/kw getLyric 等）返回 request 包装对象 {promise, cancelHttp}；
      // RPC 边界 JSON 序列化会杀死 thenable（变成 {promise:{}}），必须在沙箱内解包成裸 Promise
      if (r && r.promise && typeof r.promise.then === 'function') r = r.promise;
      return r;
    }
    if (p.k === 'userApiInit') return initUserApi(p.id, p.script);
    if (p.k === 'userApiUrl') return userApiUrl(p.id, p.source, p.musicInfo, p.type);
    throw new Error('unknown command ' + p.k);
  }).then(
    function (r) { __bridge.post({ t: 'rpc', id: id, ok: true, data: r === undefined ? null : JSON.parse(JSON.stringify(r)) }); },
    function (e) { __bridge.post({ t: 'rpc', id: id, ok: false, error: String((e && e.message) || e) + ' || ' + String((e && e.stack) || '').split('\\n').slice(0, 4).join(' <- ') }); }
  );
};

window.addEventListener('error', function (e) { __nativePost({ t: 'log', line: 'JS error: ' + e.message + ' @' + (e.filename||'') + ':' + e.lineno }); });
window.addEventListener('unhandledrejection', function (e) { __nativePost({ t: 'log', line: 'JS reject: ' + String(e.reason && e.reason.message || e.reason) }); });
__bridge.post({ t: 'ready' });
`;

function pageHtml(vfiles: unknown): string {
  const files = JSON.stringify(vfiles);
  return `<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;padding:0}</style></head><body>
<script>${PAKO_JS}</script>
<script>${CRYPTOJS_JS}</script>
<script>var __VFILES = ${files};</script>
<script>${SHIM.replace('__mods = {}', '__mods = __VFILES')}</script>
</body></html>`;
}

/** musicSdk 页：完整平台 SDK 虚拟模块。 */
export function buildSandboxHtml(): string {
  return pageHtml(VFILES);
}

/** 自定义音源页：同一 SHIM（bridge/buffer/crypto/zlib），不带 musicSdk 模块。
 *  lx35：音源脚本与 musicSdk 物理隔离，脚本再怎么污染全局也只影响本页。 */
export function buildUserApiHtml(): string {
  return pageHtml({});
}
