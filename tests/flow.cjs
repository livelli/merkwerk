// Ablauf-Test Phase 1: Set aus Liste, bearbeiten, Papierkorb, Sicherung. node tests/flow.cjs
const { chromium, devices } = require('playwright');
const http = require('http'); const fs = require('fs'); const path = require('path');
const root = path.resolve(__dirname, '..');
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.woff2': 'font/woff2', '.webmanifest': 'application/manifest+json' };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (!p.startsWith('/merkwerk/')) { res.writeHead(404); return res.end(); }
  p = p.slice('/merkwerk'.length); if (p.endsWith('/')) p += 'index.html';
  const f = path.join(root, p);
  if (!f.startsWith(root) || !fs.existsSync(f)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': types[path.extname(f)] || 'application/octet-stream' });
  fs.createReadStream(f).pipe(res);
}).listen(8767);
const shots = process.env.SHOT_DIR;
let page;
const visible = (sel) => page.waitForSelector(sel, { state: 'visible', timeout: 3000 }).then(() => true, () => false);
const check = (cond, msg) => { if (!cond) throw new Error('FEHLER: ' + msg); console.log('✓', msg); };
(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ ...devices['iPhone 13'], acceptDownloads: true });
  page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('dialog', (d) => d.accept());
  await page.goto('http://localhost:8767/merkwerk/');
  await page.click('.tab[data-view="sets"]');
  check(await visible('text=Noch keine Sets'), 'leere Set-Liste');
  await page.click('text=Neues Set aus Liste');
  await page.fill('#i-name', 'Unit 3 – Travel');
  await page.fill('#i-folder', 'Englisch B1');
  await page.fill('#i-text', 'holiday;Ferien\nto arrive;ankommen\nluggage;Gepäck\nkaputt\n<b>bold</b>;fett');
  check((await page.textContent('.summary')).includes('4 Wörter erkannt, 1 Zeile unvollständig'), 'Vorschau zählt richtig');
  if (shots) await page.screenshot({ path: path.join(shots, 'p1-import.png'), fullPage: true });
  await page.click('#i-save');
  await page.waitForSelector('.word-list');
  check((await page.locator('.word-list li').count()) === 4, '4 Wörter im Set');
  check(await visible('text=<b>bold</b>'), 'HTML wird als Text angezeigt (kein Einschleusen)');
  if (shots) await page.screenshot({ path: path.join(shots, 'p1-set.png'), fullPage: true });
  // Bearbeiten: ein Wort ändern, eins löschen, eins hinzufügen
  await page.click('text=Bearbeiten');
  await page.locator('.card-row .term').first().fill('holidays');
  await page.locator('.del-row').nth(3).click();
  await page.click('#add-row');
  await page.locator('.card-row .term').last().fill('colour');
  await page.locator('.card-row .def').last().fill('Farbe');
  await page.click('button[type=submit]');
  await page.waitForSelector('.word-list');
  const words = await page.locator('.word-list .t').allTextContents();
  check(JSON.stringify(words) === JSON.stringify(['holidays', 'to arrive', 'luggage', 'colour']), 'Bearbeiten gespeichert: ' + words.join(', '));
  // Halbe Zeile wird abgefangen
  await page.click('text=Bearbeiten');
  await page.click('#add-row');
  await page.locator('.card-row .term').last().fill('only term');
  await page.click('button[type=submit]');
  check((await page.textContent('#edit-msg')).includes('fehlt'), 'unvollständiges Wort wird gemeldet');
  await page.click('a[aria-label="Abbrechen"]');
  // Wörter anhängen
  await page.click('text=Importieren');
  await page.fill('#i-text', 'passport\tReisepass');
  await page.click('#i-save');
  await page.waitForSelector('.word-list');
  check((await page.locator('.word-list li').count()) === 5, 'Wort angehängt');
  // Liste mit Ordner
  await page.click('.tab[data-view="sets"]');
  check(await visible('text=Englisch B1'), 'Ordner sichtbar');
  check((await page.textContent('.set-item .cnt')).includes('5 Wörter'), 'Anzahl in Liste');
  // Heute
  await page.click('.tab[data-view="heute"]');
  await page.waitForFunction(() => document.querySelector('#c-new').textContent === '5', null, { timeout: 3000 }).catch(() => {});
  check((await page.textContent('#c-new')) === '5', 'Heute zählt 5 offene Wörter');
  check(await visible('text=noch keine Sicherung'), 'Sicherungs-Erinnerung');
  // Sicherung (Desktop-Weg: Download; im iPhone-Profil gibt es kein navigator.share in Chromium)
  await page.click('.tab[data-view="mehr"]');
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#backup-save')]);
  const backupPath = path.join(shots || '/tmp', 'backup.json');
  await dl.saveAs(backupPath);
  const backup = JSON.parse(fs.readFileSync(backupPath, 'utf8'));
  check(backup.format === 'merkwerk-backup' && backup.sets.length === 1 && backup.cards.filter((c) => !c.deletedAt).length === 5, 'Sicherung enthält Set und Wörter');
  // Papierkorb
  await page.click('.tab[data-view="sets"]');
  await page.click('.set-item');
  await page.click('#del-set');
  check(await visible('text=Papierkorb'), 'Löschen meldet Papierkorb');
  await page.click('.tab[data-view="mehr"]');
  check(await visible('text=noch 30 Tage'), 'Set im Papierkorb');
  await page.click('[data-restore]');
  await page.click('.tab[data-view="sets"]');
  check(await visible('text=Unit 3 – Travel'), 'wiederhergestellt');
  // Endgültig löschen und Sicherung wieder einlesen
  await page.click('.set-item'); await page.click('#del-set');
  await page.click('.tab[data-view="mehr"]');
  await page.click('[data-purge]');
  check(await visible('text=Der Papierkorb ist leer'), 'endgültig gelöscht');
  await page.setInputFiles('#backup-load', backupPath);
  await page.waitForFunction(() => document.querySelector('#backup-msg').textContent.includes('Eingelesen'));
  check((await page.textContent('#backup-msg')).includes('1 neue Sets'), 'Sicherung eingelesen');
  // Daten überleben Neuladen
  await page.goto('http://localhost:8767/merkwerk/#sets');
  check(await visible('text=Unit 3 – Travel'), 'Daten nach Neuladen da');
  // Falsche Datei
  fs.writeFileSync(path.join(shots || '/tmp', 'bad.json'), '{"a":1}');
  await page.click('.tab[data-view="mehr"]');
  await page.waitForFunction(() => document.querySelector('#backup-info').textContent.length > 0);
  await page.setInputFiles('#backup-load', path.join(shots || '/tmp', 'bad.json'));
  await page.waitForFunction(() => /keine Merkwerk-Sicherung/.test(document.querySelector('#backup-msg').textContent), null, { timeout: 5000 }).catch(() => {});
  const badMsg = await page.textContent('#backup-msg');
  check(badMsg.includes('keine Merkwerk-Sicherung'), 'falsche Datei abgelehnt: ' + badMsg);
  if (shots) await page.screenshot({ path: path.join(shots, 'p1-mehr.png'), fullPage: true });
  check(errors.length === 0, 'keine JavaScript-Fehler ' + errors.join('; '));
  await browser.close(); server.close();
  console.log('FLOW OK');
})().catch(async (e) => { console.error(e.message); server.close(); process.exit(1); });
