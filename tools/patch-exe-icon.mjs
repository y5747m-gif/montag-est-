/**
 * تضمين أيقونة Windows داخل ملف EXE (تعديل موارد PE) — resedit بجافاسكربت خالص
 * الاستخدام: node tools/patch-exe-icon.mjs [exe] [ico]
 */
import fs from 'node:fs';
import path from 'node:path';
import { Data, NtExecutable, NtExecutableResource, Resource } from 'resedit';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const exePath = process.argv[2] || path.join(ROOT, 'dist', 'MontageStudio-win64.exe');
const icoPath = process.argv[3] || path.join(ROOT, 'assets', 'icon.ico');

const exeBuffer = fs.readFileSync(exePath);
const iconBuffer = fs.readFileSync(icoPath);

const exe = NtExecutable.from(exeBuffer);
const res = NtExecutableResource.from(exe);

const iconFile = Data.IconFile.from(new Uint8Array(iconBuffer));
const icons = iconFile.icons.map((item) => item.data);

Resource.IconGroupEntry.replaceIconsForResource(res.entries, 1, 1033, icons);

res.outputResource(exe);
fs.writeFileSync(exePath, Buffer.from(exe.generate()));
console.log(`✓ أُدرجت الأيقونة في ${path.relative(ROOT, exePath)} (${icons.length} مقاسًا)`);
