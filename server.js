/**
 * Montage Studio — خادم ملفات ثابت بسيط (بدون أي اعتماديات خارجية)
 * يقدّم تطبيق المحرر على المنفذ 5173 مع دعم كامل للـ ES Modules.
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 5173);
const HOST = process.env.HOST || '0.0.0.0';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.mp3': 'audio/mpeg',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/plain; charset=utf-8',
};

const server = http.createServer((req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    let pathname = decodeURIComponent(url.pathname);
    if (pathname === '/') pathname = '/index.html';
    // مسارات ودية للنسختين
    else if (pathname === '/mobile') pathname = '/mobile.html';
    else if (pathname === '/desktop') pathname = '/desktop.html';
    // تنزيل تطبيقات الجهاز
    else if (pathname === '/download/apk') {
      const apk = path.join(ROOT, 'downloads', 'MontageStudio.apk');
      if (fs.existsSync(apk)) {
        res.writeHead(200, {
          'Content-Type': 'application/vnd.android.package-archive',
          'Content-Length': fs.statSync(apk).size,
          'Content-Disposition': 'attachment; filename="MontageStudio.apk"',
          'Cache-Control': 'no-cache',
        });
        fs.createReadStream(apk).pipe(res);
        return;
      }
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('لم يُبنَ ملف APK بعد — شغّل: node tools/make-apk.mjs');
      return;
    } else if (pathname === '/download/exe') {
      const exe = path.join(ROOT, 'dist', 'MontageStudio-win64.exe');
      if (fs.existsSync(exe)) {
        res.writeHead(200, {
          'Content-Type': 'application/vnd.microsoft.portable-executable',
          'Content-Length': fs.statSync(exe).size,
          'Content-Disposition': 'attachment; filename="MontageStudio-win64.exe"',
          'Cache-Control': 'no-cache',
        });
        fs.createReadStream(exe).pipe(res);
        return;
      }
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('لم يُبنَ ملف EXE بعد — شغّل: node tools/make-exe.mjs');
      return;
    }
    const filePath = path.join(ROOT, path.normalize(pathname).replace(/^([/\\])+/, ''));
    if (!filePath.startsWith(ROOT)) {
      res.writeHead(403).end('Forbidden');
      return;
    }
    fs.stat(filePath, (err, stat) => {
      if (err || !stat.isFile()) {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('404 — غير موجود');
        return;
      }
      const ext = path.extname(filePath).toLowerCase();
      res.writeHead(200, {
        'Content-Type': MIME[ext] || 'application/octet-stream',
        'Content-Length': stat.size,
        'Cache-Control': 'no-cache',
        // تمكين الـ SharedArrayBuffer إن احتجنا لمحرّكات وسائط مستقبلية
        'Cross-Origin-Opener-Policy': 'same-origin',
        'Cross-Origin-Embedder-Policy': 'credentialless',
      });
      fs.createReadStream(filePath).pipe(res);
    });
  } catch (e) {
    res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' }).end('500 — خطأ داخلي');
  }
});

server.listen(PORT, HOST, () => {
  console.log(`▶ Montage Studio يعمل على http://localhost:${PORT}`);
});
