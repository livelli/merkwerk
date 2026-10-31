// Startet die App unter /merkwerk/ (wie GitHub Pages), prüft Laden, Offline-Start und Datenbank.
const { chromium } = require('playwright');
const http = require('http'); const fs = require('fs'); const path = require('path');
const root = path.resolve(__dirname, '..');
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (!p.startsWith('/merkwerk/')) { res.writeHead(404); return res.end(); }
  p = p.slice('/merkwerk'.length); if (p.endsWith('/')) p += 'index.html';
  const f = path.join(root, p);
  if (!f.startsWith(root) || !fs.existsSync(f)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': types[path.extname(f)] || 'application/octet-stream' });
  fs.createReadStream(f).pipe(res);
}).listen(8765);
(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  // Google Fonts im Test blockieren (kein Netz nötig)
  await ctx.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
  await page.goto('http://localhost:8765/merkwerk/');
  await page.waitForFunction(() => navigator.serviceWorker.controller || navigator.serviceWorker.ready.then(() => true), null, { timeout: 10000 });
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload(); // jetzt vom Service Worker kontrolliert
  const title = await page.textContent('#h-heute');
  await page.click('.tab[data-view="mehr"]');
  const ver = await page.textContent('#f-version');
  const schema = await page.textContent('#f-schema');
  const stores = await page.evaluate(() => new Promise((r) => { const q = indexedDB.open('merkwerk'); q.onsuccess = () => r([...q.result.objectStoreNames]); }));
  await ctx.setOffline(true);
  await page.reload();
  const offlineTitle = await page.textContent('#h-heute').catch(() => null);
  const offlineVisible = await page.isVisible('#view-mehr');
  const status = await page.textContent('#net-status');
  await page.screenshot({ path: path.join(process.env.SHOT_DIR || '/tmp', 'merkwerk-phase0.png') });
  await browser.close(); server.close();
  const result = { title, ver, schema, stores, offlineTitle, offlineVisible, status, errors };
  console.log(JSON.stringify(result, null, 1));
  const ok = title === 'Heute' && ver && schema === 'v1' && stores.length === 4 && offlineTitle === 'Heute' && offlineVisible && errors.length === 0;
  console.log(ok ? 'SMOKE OK' : 'SMOKE FEHLER');
  process.exit(ok ? 0 : 1);
})().catch((e) => { console.error(e); server.close(); process.exit(1); });
