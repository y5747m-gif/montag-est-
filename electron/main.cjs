/**
 * Montage Studio — نقطة دخول Electron (نسخة ويندوز).
 *
 * التطبيق صفحات ويب ثابتة بلا أي اعتماديات. بدل تحميل الملفات عبر file://
 * نشغّل خادمًا محليًا صغيرًا على 127.0.0.1 بمنفذ حر — فيعمل التطبيق بنفس
 * بيئة المتصفح تمامًا (ES Modules، MediaRecorder، التخزين… ) وبأقصى توافق.
 * الخادم داخلي بالكامل ولا يقبل أي اتصال من خارج الجهاز.
 */
const { app, BrowserWindow, shell } = require('electron');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

// في التشغيل المُعبّأ (asar) الجذر هو جذر التطبيق؛ في التطوير هو جذر المستودع
const ROOT = path.join(__dirname, '..');

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

function createStaticServer(root) {
  return http.createServer((req, res) => {
    try {
      const url = new URL(req.url, 'http://127.0.0.1');
      let pathname = decodeURIComponent(url.pathname);
      if (pathname === '/') pathname = '/index.html';
      const filePath = path.join(root, path.normalize(pathname).replace(/^[/\\]+/, ''));
      if (!filePath.startsWith(root)) {
        res.writeHead(403).end('Forbidden');
        return;
      }
      fs.stat(filePath, (err, stat) => {
        if (err || !stat.isFile()) {
          res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('404');
          return;
        }
        res.writeHead(200, {
          'Content-Type': MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream',
          'Content-Length': stat.size,
          'Cache-Control': 'no-cache',
        });
        fs.createReadStream(filePath).pipe(res);
      });
    } catch {
      res.writeHead(500).end('500');
    }
  });
}

let server = null;
let mainWindow = null;

// نسخة واحدة فقط من التطبيق — الضغط مرة أخرى يُركّز النافذة الحالية
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.whenReady().then(async () => {
    server = createStaticServer(ROOT);
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const port = server.address().port;

    mainWindow = new BrowserWindow({
      width: 1440,
      height: 900,
      minWidth: 1024,
      minHeight: 600,
      show: false,
      backgroundColor: '#14161a',
      autoHideMenuBar: true,
      icon: path.join(ROOT, 'assets', 'icon.png'),
      webPreferences: {
        // التطبيق ويب نقي — لا حاجة لأي وصول إلى نظام التشغيل من الواجهة
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true,
        spellcheck: false,
      },
    });

    mainWindow.once('ready-to-show', () => mainWindow.show());

    // أي رابط خارجي يُفتح في المتصفح الافتراضي لا داخل التطبيق
    mainWindow.webContents.setWindowOpenHandler(({ url }) => {
      shell.openExternal(url);
      return { action: 'deny' };
    });

    mainWindow.loadURL(`http://127.0.0.1:${port}/`);
  });

  app.on('window-all-closed', () => {
    if (server) server.close();
    app.quit();
  });
}
