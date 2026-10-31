// Prüft: alle Dateien im Offline-Cache existieren, Versionen stimmen überein, Manifest gültig.
import { readFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
const sw = readFileSync('sw.js', 'utf8');
const shell = [...sw.matchAll(/^\s+'([^']+)',$/gm)].map((m) => m[1]).filter((p) => p !== './');
let fail = 0;
for (const p of shell) if (!existsSync(p)) { console.error('fehlt im Repo:', p); fail++; }
const swVer = sw.match(/CACHE_VERSION = '([^']+)'/)[1];
const appVer = readFileSync('js/version.js', 'utf8').match(/APP_VERSION = '([^']+)'/)[1];
if (swVer !== appVer) { console.error(`Version sw.js ${swVer} != version.js ${appVer}`); fail++; }
const man = JSON.parse(readFileSync('manifest.webmanifest', 'utf8'));
for (const i of man.icons) if (!existsSync(i.src)) { console.error('Icon fehlt:', i.src); fail++; }
if (man.start_url !== './' || man.scope !== './') { console.error('start_url/scope müssen relativ sein'); fail++; }
import { readdirSync } from 'node:fs';
for (const js of readdirSync('js').filter((f) => f.endsWith('.js')).map((f) => 'js/' + f)) if (!shell.includes(js)) { console.error('nicht im Cache:', js); fail++; }
for (const js of ['sw.js', ...shell.filter((p) => p.endsWith('.js'))]) {
  try { execFileSync(process.execPath, ['--check', js]); } catch { console.error('Syntaxfehler:', js); fail++; }
}
const html = readFileSync('index.html', 'utf8');
if (/https?:\/\//.test(html.replace(/<meta[^>]*>/g, ''))) { console.error('index.html lädt etwas von fremden Servern'); fail++; }
console.log(fail ? `${fail} Fehler` : `ok: ${shell.length} Dateien, Version ${appVer}`);
process.exit(fail ? 1 : 0);
