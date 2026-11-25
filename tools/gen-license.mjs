#!/usr/bin/env node
// gen-license.mjs —— [1125 商业化] NM- 授权码签发器(Ed25519, 与 RN licenseCore verifyCompactCode 字节级同径)
// 用法: node tools/gen-license.mjs --tier pro [--days 0=永久] [--count 5] [--key /path/license-key.pem]
// 输出: NM-<b64url(body)>.<b64url(sig)>  (body=JSON{v,tier,exp,features,limits,iat})
import { readFileSync } from 'node:fs';
import { generateKeyPairSync, sign } from 'node:crypto';
import { argv, exit } from 'node:process';

const args = Object.fromEntries(argv.slice(2).map((a, i, arr) => (a.startsWith('--') ? [a.slice(2), arr[i + 1]] : [])).filter(p => p.length));
const tier = args.tier || 'pro';
const days = Number(args.days ?? 0);
const count = Math.min(Number(args.count ?? 1), 50);
const keyPath = args.key || '/root/.nextmusic/license-key.pem';

const FEATURES = {
  pro: ['eq_custom', 'lyrics_deep', 'webdav_backup', 'library_brand'],
  family: ['eq_custom', 'lyrics_deep', 'webdav_backup', 'library_brand'],
  trial: ['eq_custom', 'lyrics_deep', 'webdav_backup', 'library_brand'],
  m1_beta: ['eq_custom', 'lyrics_deep', 'webdav_backup', 'library_brand'],
};
const LIMITS = { pro: { devices: 5 }, family: { devices: 30 }, trial: { devices: 5 }, m1_beta: { devices: 99 } };

if (!FEATURES[tier]) { console.error('tier 必须是 pro/family/trial/m1_beta'); exit(1); }

let priv;
try {
  priv = readFileSync(keyPath); // PKCS8 PEM
} catch {
  // 无私钥: 生成新对(打印公钥供两端配置)
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  priv = privateKey.export({ type: 'pkcs8', format: 'pem' });
  console.error('[gen] 未找到私钥,已生成新密钥对。公钥(B64, 配置到 config license.pubkey 与 RN LICENSE_PUBKEY_B64):');
  console.error(publicKey.export({ type: 'spki', format: 'der' }).toString('base64'));
}

const b64u = (buf) => buf.toString('base64url');
const iat = Date.now();
const exp = days > 0 ? iat + days * 86400000 : null;

for (let i = 0; i < count; i++) {
  const payload = { v: 2, tier, iat, ...(exp ? { exp } : {}), features: FEATURES[tier], limits: LIMITS[tier], seq: i + 1 };
  const body = Buffer.from(JSON.stringify(payload), 'utf-8');
  const sig = sign(null, body, priv);
  console.log('NM-' + b64u(body) + '.' + b64u(sig));
}
