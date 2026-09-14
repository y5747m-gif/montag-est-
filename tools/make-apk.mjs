/**
 * بناء APK لنظام أندرويد — نسخة الهاتف من Montage Studio كتطبيق مستقل يعمل بلا إنترنت
 *
 * السلسلة (كلها من npm بلا اعتماديات خارجية):
 *   - موقع مجمّع:     node tools/bundle-site.mjs mobile .tmp/apk-www
 *   - apktool.jar:    حزمة @postar/apktool-node  (بناء الموارد + smali → classes.dex)
 *   - apksigner.jar:  حزمة @postar/apktool-node  (توقيع v1+v2+v3)
 *   - JRE:            حزمة @termestra/runtime-linux-x64
 *
 * الاستخدام:  node tools/make-apk.mjs
 * الناتج:     downloads/MontageStudio.apk
 */
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { execFileSync } from 'node:child_process';
import { crc32 } from '../src/core/zip.js';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TMP = path.join(ROOT, '.tmp');
const TOOLS = path.join(TMP, 'android-tools');
const PROJECT = path.join(TMP, 'apk-project');
const WWW = path.join(TMP, 'apk-www');
const OUT_DIR = path.join(ROOT, 'downloads');
const JAVA_BIN = path.join(TMP, 'jre', 'bin', 'java');
const KEYTOOL = path.join(TMP, 'jre', 'bin', 'keytool');
const KEYSTORE = path.join(ROOT, 'tools', 'release.keystore');

const PKG = 'com.montagestudio.app';

function sh(cmd, args, opts = {}) {
  return execFileSync(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'], ...opts }).toString();
}
function findJar(dirName, jarName) {
  const bases = [path.join(ROOT, 'node_modules', dirName, 'package'), path.join(ROOT, 'node_modules', dirName)];
  for (const base of bases) {
    for (const c of [path.join(base, 'lib'), base]) {
      const f = path.join(c, jarName);
      if (fs.existsSync(f)) return f;
    }
  }
  throw new Error(`لم يتم العثور على ${jarName} — ثبّت ${dirName} أولًا`);
}

/* ============================ 1) تجهيز الأدوات ============================ */
console.log('— تجهيز الأدوات —');
fs.mkdirSync(TOOLS, { recursive: true });

// JRE من حزمة termestra (فك الضغط عند أول تشغيل)
if (!fs.existsSync(JAVA_BIN)) {
  const tgz = path.join(TMP, 'jre.tgz');
  if (!fs.existsSync(tgz)) {
    console.log('  تنزيل JRE من npm (مرة واحدة)…');
    sh('npm', ['pack', '@termestra/runtime-linux-x64', '--pack-destination', TMP], { cwd: TMP });
    const f = fs.readdirSync(TMP).find((x) => x.startsWith('termestra-runtime-linux-x64-') && x.endsWith('.tgz'));
    fs.copyFileSync(path.join(TMP, f), tgz);
  }
  console.log('  فك ضغط JRE…');
  fs.mkdirSync(path.join(TMP, 'jre-extract'), { recursive: true });
  sh('tar', ['-xzf', tgz, '-C', path.join(TMP, 'jre-extract')]);
  const runtime = path.join(TMP, 'jre-extract', 'package', 'runtime');
  fs.renameSync(runtime, path.join(TMP, 'jre'));
  fs.readdirSync(path.join(TMP, 'jre', 'bin')).forEach((b) => fs.chmodSync(path.join(TMP, 'jre', 'bin', b), 0o755));
}
console.log('  JRE ✓');

const APKTOOL_JAR = findJar('@postar/apktool-node', 'apktool.jar');
const APKTOOL_DIR = path.dirname(APKTOOL_JAR);
const resignJar = APKTOOL_DIR ? path.join(APKTOOL_DIR, "apksigner.jar") : path.join(TOOLS, "apksigner.jar");
if (!fs.existsSync(resignJar)) {
  const dir = path.join(ROOT, 'node_modules', '@postar/apktool-node', 'package', 'lib');
  fs.copyFileSync(path.join(dir, 'apksigner.jar'), resignJar);
}
console.log('  apktool + apksigner ✓');

/* ============================ 2) موقع مجمّع ============================ */
console.log('— تجميع الموقع —');
execFileSync('node', [path.join(ROOT, 'tools', 'bundle-site.mjs'), 'mobile', WWW], { cwd: ROOT, stdio: 'inherit' });

/* ============================ 3) صور PNG ============================ */
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const t = Buffer.from(type, 'ascii');
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([t, data])) >>> 0, 0);
  return Buffer.concat([len, t, data, crcBuf]);
}
function encodePNG(width, height, rgba) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; ihdr[9] = 6;
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y += 1) {
    raw[y * (width * 4 + 1)] = 0;
    rgba.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
  }
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}
function paeth(a, b, c) { const p = a + b - c; const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c); return pa <= pb && pa <= pc ? a : pb <= pc ? b : c; }
function decodePNG(buf) {
  let pos = 8, width = 0, height = 0, channels = 0;
  const idat = [];
  while (pos + 8 <= buf.length) {
    const len = buf.readUInt32BE(pos);
    const type = buf.toString('ascii', pos + 4, pos + 8);
    const data = buf.subarray(pos + 8, pos + 8 + len);
    if (type === 'IHDR') { width = data.readUInt32BE(0); height = data.readUInt32BE(4); channels = { 2: 3, 6: 4 }[data[9]]; }
    else if (type === 'IDAT') idat.push(data);
    else if (type === 'IEND') break;
    pos += 12 + len;
  }
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const stride = width * channels;
  const out = Buffer.alloc(width * height * 4);
  let prev = Buffer.alloc(stride);
  for (let y = 0; y < height; y += 1) {
    const f = raw[y * (stride + 1)];
    const line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    const cur = Buffer.alloc(stride);
    for (let i = 0; i < stride; i += 1) {
      const a = i >= channels ? cur[i - channels] : 0, b = prev[i], c = i >= channels ? prev[i - channels] : 0;
      let v = line[i];
      if (f === 1) v += a; else if (f === 2) v += b; else if (f === 3) v += (a + b) >> 1; else if (f === 4) v += paeth(a, b, c);
      cur[i] = v & 0xff;
    }
    if (channels === 4) cur.copy(out, y * width * 4);
    else for (let x = 0; x < width; x += 1) { out[(y * width + x) * 4] = cur[x * 3]; out[(y * width + x) * 4 + 1] = cur[x * 3 + 1]; out[(y * width + x) * 4 + 2] = cur[x * 3 + 2]; out[(y * width + x) * 4 + 3] = 255; }
    prev = cur;
  }
  return { width, height, rgba: out };
}
const LA = 3;
function lanczos(x) { if (x === 0) return 1; const ax = Math.abs(x); if (ax >= LA) return 0; const p = Math.PI * x; return (LA * Math.sin(p) * Math.sin(p / LA)) / (p * p); }
const cl = (v) => (v < 0 ? 0 : v > 255 ? 255 : v);
function resize(src, sw, sh, dw, dh) {
  const pre = Buffer.alloc(sw * sh * 4);
  for (let i = 0; i < sw * sh; i += 1) { const a = src[i * 4 + 3] / 255; pre[i * 4] = src[i * 4] * a; pre[i * 4 + 1] = src[i * 4 + 1] * a; pre[i * 4 + 2] = src[i * 4 + 2] * a; pre[i * 4 + 3] = src[i * 4 + 3]; }
  const tmp = Buffer.alloc(dw * sh * 4);
  for (let y = 0; y < sh; y += 1) for (let x = 0; x < dw; x += 1) {
    const c0 = (x + 0.5) * sw / dw - 0.5, s0 = Math.max(0, Math.floor(c0 - LA + 1)), s1 = Math.min(sw - 1, Math.ceil(c0 + LA));
    let r = 0, g = 0, b = 0, a = 0, w = 0;
    for (let sx = s0; sx <= s1; sx += 1) { const k = lanczos((sx - c0) * Math.min(1, dw / sw)); if (!k) continue; const si = (y * sw + sx) * 4; r += pre[si] * k; g += pre[si + 1] * k; b += pre[si + 2] * k; a += pre[si + 3] * k; w += k; }
    const di = (y * dw + x) * 4;
    tmp[di] = cl(r / w); tmp[di + 1] = cl(g / w); tmp[di + 2] = cl(b / w); tmp[di + 3] = cl(a / w);
  }
  const out = Buffer.alloc(dw * dh * 4);
  for (let y = 0; y < dh; y += 1) {
    const c0 = (y + 0.5) * sh / dh - 0.5, s0 = Math.max(0, Math.floor(c0 - LA + 1)), s1 = Math.min(sh - 1, Math.ceil(c0 + LA));
    for (let x = 0; x < dw; x += 1) {
      let r = 0, g = 0, b = 0, a = 0, w = 0;
      for (let sy = s0; sy <= s1; sy += 1) { const k = lanczos((sy - c0) * Math.min(1, dh / sh)); if (!k) continue; const si = (sy * dw + x) * 4; r += tmp[si] * k; g += tmp[si + 1] * k; b += tmp[si + 2] * k; a += tmp[si + 3] * k; w += k; }
      const di = (y * dw + x) * 4;
      out[di] = cl(r / w); out[di + 1] = cl(g / w); out[di + 2] = cl(b / w); out[di + 3] = cl(a / w);
      const al = out[di + 3] / 255;
      if (al > 0) { out[di] = cl(out[di] / al); out[di + 1] = cl(out[di + 1] / al); out[di + 2] = cl(out[di + 2] / al); }
    }
  }
  return out;
}

const masterIcon = decodePNG(fs.readFileSync(path.join(ROOT, 'assets', 'icon-512.png')));
function iconAt(size) {
  return encodePNG(size, size, resize(masterIcon.rgba, masterIcon.width, masterIcon.height, size, size));
}

/* ============================ 4) مشروع apktool ============================ */
console.log('— توليد مشروع أندرويد —');
fs.rmSync(PROJECT, { recursive: true, force: true });
for (const d of [
  path.join(PROJECT, 'smali', 'com', 'montagestudio', 'app'),
  path.join(PROJECT, 'res', 'mipmap-mdpi'), path.join(PROJECT, 'res', 'mipmap-hdpi'),
  path.join(PROJECT, 'res', 'mipmap-xhdpi'), path.join(PROJECT, 'res', 'mipmap-xxhdpi'),
  path.join(PROJECT, 'res', 'mipmap-xxxhdpi'), path.join(PROJECT, 'assets', 'www'),
  path.join(PROJECT, 'original', 'META-INF'),
]) fs.mkdirSync(d, { recursive: true });

// المانيفست
fs.writeFileSync(path.join(PROJECT, 'AndroidManifest.xml'), `<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android"
    package="${PKG}"
    android:versionCode="1"
    android:versionName="1.0">
    <uses-sdk android:minSdkVersion="24" android:targetSdkVersion="29" />
    <uses-permission android:name="android.permission.INTERNET" />
    <uses-feature android:name="android.hardware.microphone" android:required="false" />
    <application
        android:label="Montage Studio"
        android:icon="@mipmap/ic_launcher"
        android:allowBackup="true"
        android:hardwareAccelerated="true"
        android:usesCleartextTraffic="false"
        android:theme="@android:style/Theme.DeviceDefault.NoActionBar.Fullscreen">
        <activity
            android:name=".MainActivity"
            android:label="Montage Studio"
            android:configChanges="orientation|screenSize|keyboardHidden|screenLayout|smallestScreenSize"
            android:launchMode="singleTask"
            android:exported="true">
            <intent-filter>
                <action android:name="android.intent.action.MAIN" />
                <category android:name="android.intent.category.LAUNCHER" />
            </intent-filter>
        </activity>
    </application>
</manifest>
`);

// apktool.yml
fs.writeFileSync(path.join(PROJECT, 'apktool.yml'), `!!brut.androlib.meta.MetaInfo
apkFileName: MontageStudio.apk
compressionType: false
doNotCompress:
- resources.arsc
- png
isFrameworkApk: false
packageInfo:
  forcedPackageId: '127'
  renameManifestPackage: null
sdkInfo:
  minSdkVersion: '24'
  targetSdkVersion: '29'
sharedLibrary: false
sparseResources: false
unknownFiles: {}
usesFramework:
  ids:
  - 1
  tag: null
version: 2.9.3
versionInfo:
  versionCode: '1'
  versionName: '1.0'
`);

// الأيقونات بكثافات مختلفة
const densities = [['mdpi', 48], ['hdpi', 72], ['xhdpi', 96], ['xxhdpi', 144], ['xxxhdpi', 192]];
for (const [d, size] of densities) {
  fs.writeFileSync(path.join(PROJECT, 'res', `mipmap-${d}`, 'ic_launcher.png'), iconAt(size));
}

// كود التطبيق (smali) — WebView بملء الشاشة يحمّل الموقع المجمّع
fs.writeFileSync(path.join(PROJECT, 'smali', 'com', 'montagestudio', 'app', 'MainActivity.smali'), `.class public Lcom/montagestudio/app/MainActivity;
.super Landroid/app/Activity;
.source "MainActivity.java"

# instance fields
.field private webView:Landroid/webkit/WebView;

# direct methods
.method public constructor <init>()V
    .locals 0

    invoke-super {p0}, Landroid/app/Activity;-><init>()V

    return-void
.end method

.method protected onCreate(Landroid/os/Bundle;)V
    .locals 3

    invoke-super {p0, p1}, Landroid/app/Activity;->onCreate(Landroid/os/Bundle;)V

    new-instance v0, Landroid/webkit/WebView;
    invoke-direct {v0, p0}, Landroid/webkit/WebView;-><init>(Landroid/content/Context;)V

    iput-object v0, p0, Lcom/montagestudio/app/MainActivity;->webView:Landroid/webkit/WebView;

    invoke-virtual {v0}, Landroid/webkit/WebView;->getSettings()Landroid/webkit/WebSettings;
    move-result-object v1

    const/4 v2, 0x1

    invoke-virtual {v1, v2}, Landroid/webkit/WebSettings;->setJavaScriptEnabled(Z)V

    invoke-virtual {v1, v2}, Landroid/webkit/WebSettings;->setDomStorageEnabled(Z)V

    invoke-virtual {v1, v2}, Landroid/webkit/WebSettings;->setMediaPlaybackRequiresUserGesture(Z)V

    const/4 v2, 0x0

    invoke-virtual {v1, v2}, Landroid/webkit/WebSettings;->setAllowFileAccessFromFileURLs(Z)V

    invoke-virtual {v1, v2}, Landroid/webkit/WebSettings;->setAllowUniversalAccessFromFileURLs(Z)V

    new-instance v1, Lcom/montagestudio/app/AppWebViewClient;
    invoke-direct {v1, p0}, Lcom/montagestudio/app/AppWebViewClient;-><init>(Lcom/montagestudio/app/MainActivity;)V

    invoke-virtual {v0, v1}, Landroid/webkit/WebView;->setWebViewClient(Landroid/webkit/WebViewClient;)V

    invoke-virtual {p0, v0}, Landroid/app/Activity;->setContentView(Landroid/view/View;)V

    invoke-virtual {p0}, Landroid/app/Activity;->getWindow()Landroid/view/Window;
    move-result-object v1

    invoke-virtual {v1}, Landroid/view/Window;->getDecorView()Landroid/view/View;
    move-result-object v1

    const/16 v2, 0x1706

    invoke-virtual {v1, v2}, Landroid/view/View;->setSystemUiVisibility(I)V

    const-string v1, "file:///android_asset/www/index.html"

    invoke-virtual {v0, v1}, Landroid/webkit/WebView;->loadUrl(Ljava/lang/String;)V

    return-void
.end method

.method public onBackPressed()V
    .locals 2

    iget-object v0, p0, Lcom/montagestudio/app/MainActivity;->webView:Landroid/webkit/WebView;

    if-eqz v0, :cond_0

    invoke-virtual {v0}, Landroid/webkit/WebView;->canGoBack()Z

    move-result v1

    if-eqz v1, :cond_0

    invoke-virtual {v0}, Landroid/webkit/WebView;->goBack()V

    return-void

    :cond_0
    invoke-super {p0}, Landroid/app/Activity;->onBackPressed()V

    return-void
.end method

.method protected onPause()V
    .locals 1

    iget-object v0, p0, Lcom/montagestudio/app/MainActivity;->webView:Landroid/webkit/WebView;

    if-eqz v0, :cond_0

    invoke-virtual {v0}, Landroid/webkit/WebView;->onPause()V

    :cond_0
    invoke-super {p0}, Landroid/app/Activity;->onPause()V

    return-void
.end method

.method protected onResume()V
    .locals 1

    iget-object v0, p0, Lcom/montagestudio/app/MainActivity;->webView:Landroid/webkit/WebView;

    if-eqz v0, :cond_0

    invoke-virtual {v0}, Landroid/webkit/WebView;->onResume()V

    :cond_0
    invoke-super {p0}, Landroid/app/Activity;->onResume()V

    return-void
.end method
`);

fs.writeFileSync(path.join(PROJECT, 'smali', 'com', 'montagestudio', 'app', 'AppWebViewClient.smali'), `.class public Lcom/montagestudio/app/AppWebViewClient;
.super Landroid/webkit/WebViewClient;
.source "AppWebViewClient.java"

# instance fields
.field private final activity:Lcom/montagestudio/app/MainActivity;

# direct methods
.method public constructor <init>(Lcom/montagestudio/app/MainActivity;)V
    .locals 0

    invoke-super {p0}, Landroid/webkit/WebViewClient;-><init>()V

    iput-object p1, p0, Lcom/montagestudio/app/AppWebViewClient;->activity:Lcom/montagestudio/app/MainActivity;

    return-void
.end method

# virtual methods
.method public shouldOverrideUrlLoading(Landroid/webkit/WebView;Landroid/webkit/WebResourceRequest;)Z
    .locals 1

    const/4 v0, 0x0

    return v0
.end method

.method public shouldOverrideUrlLoading(Landroid/webkit/WebView;Ljava/lang/String;)Z
    .locals 1

    const/4 v0, 0x0

    return v0
.end method
`);

// الموقع المجمّع → assets/www
fs.cpSync(WWW, path.join(PROJECT, 'assets', 'www'), { recursive: true });

/* ============================ 5) البناء ============================ */
console.log('— apktool build —');
const unsigned = path.join(TMP, 'MontageStudio-unsigned.apk');
sh(JAVA_BIN, ['-jar', APKTOOL_JAR, 'b', PROJECT, '-o', unsigned, '--use-aapt2'], { cwd: TMP });
console.log('  تم البناء ✓');

/* ============================ 6) التوقيع ============================ */
console.log('— التوقيع —');
if (!fs.existsSync(KEYSTORE)) {
  console.log('  توليد مفتاح التوقيع (مرة واحدة)…');
  fs.mkdirSync(path.dirname(KEYSTORE), { recursive: true });
  sh(KEYTOOL, [
    '-genkeypair', '-v',
    '-keystore', KEYSTORE,
    '-alias', 'montage',
    '-keyalg', 'RSA', '-keysize', '2048', '-validity', '10000',
    '-storepass', 'montage2024', '-keypass', 'montage2024',
    '-dname', 'CN=Montage Studio, OU=Apps, O=Montage, C=EG',
  ]);
}

const signed = path.join(TMP, 'MontageStudio-signed.apk');
sh(JAVA_BIN, [
  '-jar', resignJar, 'sign',
  '--ks', KEYSTORE,
  '--ks-pass', 'pass:montage2024',
  '--key-pass', 'pass:montage2024',
  '--ks-key-alias', 'montage',
  '--out', signed,
  unsigned,
]);
console.log(sh(JAVA_BIN, ['-jar', resignJar, 'verify', '--print-certs', signed]).split('\n').slice(0, 3).join('\n'));

/* ============================ 7) الإخراج ============================ */
fs.mkdirSync(OUT_DIR, { recursive: true });
const outApk = path.join(OUT_DIR, 'MontageStudio.apk');
fs.copyFileSync(signed, outApk);
console.log(`\n✓ APK جاهز: ${path.relative(ROOT, outApk)} (${(fs.statSync(outApk).size / 1024 / 1024).toFixed(2)} ميجابايت)`);
