/**
 * Crypto parity test: the PWA's WebCrypto module (utils/crypto.ts) vs the native @noble/ciphers module.
 * Run: cd native && npm run test:crypto
 */
import { webcrypto } from 'node:crypto';
import * as web from '../../utils/crypto.ts';
import * as native from '../src/lib/crypto.ts';

// Node exposes WebCrypto as globalThis.crypto already (>=19); make sure btoa/atob exist too (Node has them).
if (!(globalThis as { crypto?: unknown }).crypto) (globalThis as { crypto: unknown }).crypto = webcrypto;
native.setRandomSource((n) => webcrypto.getRandomValues(new Uint8Array(n)));

let failures = 0;
let checks = 0;
function ok(name: string, cond: boolean, detail = '') {
  checks++;
  if (!cond) {
    failures++;
    console.error(`FAIL  ${name} ${detail}`);
  } else {
    console.log(`ok    ${name}`);
  }
}

const samples = [
  'Buy milk',
  '',
  'x',
  'Call mum at 6pm :)',
  'Emoji 💪🔥 and Arabic مرحبا and Malayalam നമസ്കാരം',
  'a'.repeat(500),
  'line one\nline two\n- subtask',
  'quotes "double" \'single\' \\ backslash',
];

async function main() {
  // 1. key formats
  const webKey = await web.generateKey();
  const webExported = await web.exportKey(webKey);
  const nativeKeyFromWeb = native.importKey(webExported);
  ok('web key -> native importKey length 32', nativeKeyFromWeb.length === 32);
  ok('native exportKey(import(web)) round trips', native.exportKey(nativeKeyFromWeb) === webExported);
  const nativeKey = native.generateKey();
  const nativeExported = native.exportKey(nativeKey);
  const webKeyFromNative = await web.importKey(nativeExported);
  ok('native key -> web importKey -> exportKey equal', (await web.exportKey(webKeyFromNative)) === nativeExported);

  // 2. web encrypts, native decrypts
  for (const s of samples) {
    const ct = await web.encrypt(s, webKey);
    ok(`web->native "${s.slice(0, 20)}"`, native.decrypt(ct, nativeKeyFromWeb) === s);
    ok(`isEncrypted parity (web ct) "${s.slice(0, 10)}"`, native.isEncrypted(ct) === web.isEncrypted(ct));
  }

  // 3. native encrypts, web decrypts
  for (const s of samples) {
    const ct = native.encrypt(s, nativeKey);
    ok(`native prefix e1: "${s.slice(0, 20)}"`, ct.startsWith('e1:'));
    ok(`native->web "${s.slice(0, 20)}"`, (await web.decrypt(ct, webKeyFromNative)) === s);
    ok(`isEncrypted parity (native ct) "${s.slice(0, 10)}"`, native.isEncrypted(ct) === web.isEncrypted(ct));
  }

  // 4. fixed vector: same key + IV -> identical ciphertext on both sides (web has no IV hook, so compare via decrypt of a
  //    native fixed-IV blob, and check the layout: iv first, tag last).
  const fixedKey = new Uint8Array(32).map((_, i) => i);
  const fixedIv = new Uint8Array(12).map((_, i) => 100 + i);
  const fixedCt = native.encrypt('fixed vector', fixedKey, fixedIv);
  const raw = native.base64ToBytes(fixedCt.slice(3));
  ok('layout: iv || ct || tag', raw.length === 12 + new TextEncoder().encode('fixed vector').length + 16);
  ok('layout: iv is first 12 bytes', Array.from(raw.slice(0, 12)).join() === Array.from(fixedIv).join());
  const webFixed = await web.importKey(native.exportKey(fixedKey));
  ok('fixed vector decrypts on web', (await web.decrypt(fixedCt, webFixed)) === 'fixed vector');

  // 5. legacy (no prefix) blobs
  const legacy = (await web.encrypt('legacy text', webKey)).slice(3);
  ok('legacy no-prefix web->native', native.decrypt(legacy, nativeKeyFromWeb) === 'legacy text');
  ok('legacy isEncrypted parity', native.isEncrypted(legacy) === web.isEncrypted(legacy));

  // 6. failure modes: wrong key throws on both
  const wrongNative = native.generateKey();
  const ct = native.encrypt('secret', nativeKey);
  let nativeThrew = false;
  try { native.decrypt(ct, wrongNative); } catch { nativeThrew = true; }
  let webThrew = false;
  try { await web.decrypt(ct, await web.importKey(native.exportKey(wrongNative))); } catch { webThrew = true; }
  ok('wrong key throws (native)', nativeThrew);
  ok('wrong key throws (web)', webThrew);
  let tampered = false;
  try {
    const bytes = native.base64ToBytes(ct.slice(3));
    bytes[bytes.length - 1] ^= 1;
    native.decrypt('e1:' + native.bytesToBase64(bytes), nativeKey);
  } catch { tampered = true; }
  ok('tampered tag throws (native)', tampered);

  // 7. isEncrypted + shared id parity on plain strings
  for (const s of ['', 'short', 'hello world this is plain text', 'QUJDREVGR0hJSktMTU5PUFFSU1RVVldYWVo=', 'e1:abc', 'Buy milk and eggs from the store today']) {
    ok(`isEncrypted("${s.slice(0, 18)}") parity`, native.isEncrypted(s) === web.isEncrypted(s));
  }
  ok('sharedKeyId parity', native.generateSharedKeyId('b', 'a') === web.generateSharedKeyId('b', 'a'));

  // 8. base64 against btoa for every length mod 3 and binary data
  for (let len = 0; len < 40; len++) {
    const b = webcrypto.getRandomValues(new Uint8Array(len));
    let bin = '';
    for (const x of b) bin += String.fromCharCode(x);
    if (native.bytesToBase64(b) !== btoa(bin)) { failures++; console.error('FAIL base64 encode len', len); }
    const back = native.base64ToBytes(btoa(bin));
    if (Array.from(back).join() !== Array.from(b).join()) { failures++; console.error('FAIL base64 decode len', len); }
  }
  checks += 80;

  console.log(`\n${checks - failures}/${checks} checks passed`);
  if (failures) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
