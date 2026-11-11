// Renders frames of the villa film with headless Chromium.
// usage: node render.mjs <startFrame> <endFrame> <outDir> [scale] [step]
//    or: node render.mjs <f1,f2,f3> - <outDir>   (individual frames)
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); } catch { ({ chromium } = require('/opt/node-tools/node_modules/playwright')); }

const [start = 0, end = 1500, out = 'frames', scale = 1, step = 1] = process.argv.slice(2);
const root = path.dirname(new URL(import.meta.url).pathname);
const types = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.jpg': 'image/jpeg', '.woff2': 'font/woff2', '.json': 'application/json' };
const server = http.createServer((req, res) => {
  const p = path.join(root, decodeURIComponent(req.url.split('?')[0]));
  if (!p.startsWith(root) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'content-type': types[path.extname(p)] || 'application/octet-stream' }); fs.createReadStream(p).pipe(res);
});
await new Promise(r => server.listen(0, r));
const port = server.address().port;
fs.mkdirSync(out, { recursive: true });
const s = Number(scale);
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl'] });
const page = await browser.newPage({ viewport: { width: Math.round(1920 * s), height: Math.round(1080 * s) } });
page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') console.log('[page]', m.text()); });
page.on('pageerror', e => console.log('[pageerror]', e.message));
await page.goto(`http://localhost:${port}/index.html?scale=${s}&f=${parseInt(start)}`);
await page.waitForFunction('window.READY === true', null, { timeout: 180000 });
const t0 = Date.now();
const list = String(start).includes(',') ? String(start).split(',').map(Number) : Array.from({ length: Math.ceil((end - start) / step) }, (_, i) => Number(start) + i * step);
page.setDefaultTimeout(300000);
for (const f of list) {
  const file = path.join(out, `f_${String(f).padStart(5, '0')}.jpg`);
  if (fs.existsSync(file)) continue;
  await page.evaluate(f => window.renderFrame(f), f);
  await page.screenshot({ path: file + '.tmp.jpg', type: 'jpeg', quality: 95 });
  fs.renameSync(file + '.tmp.jpg', file);
  if (f % 25 === 0 || list.length < 20) console.log(`frame ${f}  ${((Date.now() - t0) / 1000).toFixed(0)}s`);
}
await browser.close(); server.close();
