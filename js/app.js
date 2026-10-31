import { APP_VERSION } from './version.js';
import { openDb, getMeta, setMeta, write, getAll, SCHEMA_VERSION } from './db.js';
import * as store from './store.js';
import { buildBackup, validateBackup, mergeById, sanitizeBackup, mergeProgress } from './backup.js';
import { renderList, renderSet, renderEdit, renderImport, h } from './views.js';
import { speechAvailable, onVoices, voiceCount } from './speech.js';

const $ = (id) => document.getElementById(id);
const BACKUP_REMIND_DAYS = 7;

// ---------- Navigation (über die Adresse, damit "Zurück" im Browser funktioniert) ----------
const tabs = [...document.querySelectorAll('.tab')];
const tabOf = (route) => (['heute', 'mehr'].includes(route) ? route : 'sets');
let flash = '';

export function go(route, message = '') {
  flash = message;
  if (location.hash === `#${route}`) render();
  else location.hash = route;
}

async function render() {
  const route = location.hash.slice(1) || 'heute';
  const [name, id] = route.split('/');
  const tab = tabOf(name);
  for (const t of tabs) {
    const on = t.dataset.view === tab;
    if (on) t.setAttribute('aria-current', 'page');
    else t.removeAttribute('aria-current');
    $(`view-${t.dataset.view}`).hidden = !on;
  }
  try { localStorage.setItem('merkwerk.route', route); } catch {}
  const el = $('view-sets');
  try {
    if (name === 'heute') await renderHeute();
    else if (name === 'mehr') await renderMehr();
    else if (name === 'set' && id) await renderSet(el, id, go);
    else if (name === 'edit' && id) await renderEdit(el, id, go);
    else if (name === 'import' && id) await renderImport(el, id, go);
    else await renderList(el);
  } catch (e) {
    console.error(e);
    el.innerHTML = `<h1 tabindex="-1">Hoppla</h1><p class="warn">Etwas ist schiefgelaufen: ${h(e.message)}</p>`;
  }
  const view = $(`view-${tab}`);
  if (flash) {
    const anchor = view.querySelector('.view-head') || view.querySelector('h1');
    anchor?.insertAdjacentHTML('afterend', `<p class="msg" role="status">${h(flash)}</p>`);
    flash = '';
  }
  view.querySelector('h1')?.focus({ preventScroll: true });
  window.scrollTo(0, 0);
}
tabs.forEach((t) => t.addEventListener('click', () => go(t.dataset.view)));
addEventListener('hashchange', render);

// ---------- Heute ----------
async function renderHeute() {
  const [cards, sets] = await Promise.all([store.activeCardCount(), store.listSets()]);
  $('c-new').textContent = String(cards);
  let html = '';
  const reminder = await backupReminder(cards);
  if (reminder) html += `<div class="warn">${reminder} <a href="#mehr">Jetzt sichern</a></div>`;
  if (!cards) {
    html += `<div class="empty"><p class="empty-title">Noch keine Vokabeln</p>
      <p>Lege unter „Sets“ dein erstes Set an. Danach steht hier deine Tagesportion: neue Wörter, Wiederholungen und wie lange es ungefähr dauert.</p></div>
      <a class="btn" href="#import/new">Erstes Set anlegen</a>`;
  } else {
    html += `<div class="empty"><p class="empty-title">${cards} ${cards === 1 ? 'Wort' : 'Wörter'} in ${sets.length} ${sets.length === 1 ? 'Set' : 'Sets'}</p>
      <p>Lernen und dein Lernplan kommen in Phase 2 und 3. Bis dahin kannst du Sets anlegen, prüfen und dir die Wörter vorlesen lassen.</p></div>`;
  }
  $('heute-body').innerHTML = html;
}

async function backupReminder(cards) {
  if (!cards) return '';
  const last = await store.lastBackupAt();
  if (!last) return 'Du hast noch keine Sicherung deiner Vokabeln gespeichert.';
  const days = Math.floor((Date.now() - Date.parse(last)) / 86400000);
  return days >= BACKUP_REMIND_DAYS ? `Deine letzte Sicherung ist ${days} Tage alt.` : '';
}

// ---------- Mehr: Sicherung, Papierkorb, Infos ----------
async function renderMehr() {
  const last = await store.lastBackupAt();
  $('backup-info').textContent = last
    ? `Letzte Sicherung: ${new Date(last).toLocaleString('de-CH', { dateStyle: 'medium', timeStyle: 'short' })}. Speichere sie z. B. in der Dateien-App oder in OneDrive.`
    : 'Noch keine Sicherung. Speichere regelmäßig eine, z. B. in der Dateien-App oder in OneDrive. Solange es noch keinen Abgleich zwischen Geräten gibt, ist das dein Schutz, falls das Handy die Daten verliert.';
  $('backup-msg').textContent = '';
  $('backup-msg').classList.remove('err');
  await renderTrash();
  renderFacts();
}

async function renderTrash() {
  const sets = await store.listSets({ deleted: true });
  const el = $('trash');
  if (!sets.length) { el.innerHTML = '<p class="hint">Der Papierkorb ist leer. Gelöschte Sets bleiben hier 30 Tage.</p>'; return; }
  el.innerHTML = sets.map((s) => `<div class="trash-item"><div class="name">${h(s.name)}<span class="left">noch ${store.daysLeftInTrash(s)} Tage</span></div>
    <button class="btn btn-small btn-ghost" type="button" data-restore="${h(s.id)}">Wiederherstellen</button>
    <button class="btn btn-small btn-danger" type="button" data-purge="${h(s.id)}" data-name="${h(s.name)}">Endgültig löschen</button></div>`).join('');
}
$('trash').addEventListener('click', async (e) => {
  const r = e.target.closest('[data-restore]');
  const p = e.target.closest('[data-purge]');
  if (r) { await store.restoreSet(r.dataset.restore); await renderTrash(); }
  if (p && confirm(`„${p.dataset.name}“ endgültig löschen? Das kann nicht rückgängig gemacht werden.`)) {
    await store.purgeSet(p.dataset.purge);
    await renderTrash();
  }
});

$('backup-save').addEventListener('click', async () => {
  const data = buildBackup(await store.exportAll(), SCHEMA_VERSION, APP_VERSION);
  const date = new Date().toISOString().slice(0, 10);
  const name = `merkwerk-sicherung-${date}.json`;
  const blob = new Blob([JSON.stringify(data, null, 1)], { type: 'application/json' });
  const file = new File([blob], name, { type: 'application/json' });
  const download = () => {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = name;
      document.body.append(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  };
  try {
    // iPhone: Teilen-Fenster ("In Dateien sichern"). Sonst normaler Download.
    if (navigator.canShare?.({ files: [file] }) && /iphone|ipad|android/i.test(navigator.userAgent)) {
      try {
        await navigator.share({ files: [file], title: 'Merkwerk-Sicherung' });
      } catch (err) {
        if (err?.name === 'AbortError') return; // Teilen abgebrochen
        download(); // z. B. NotAllowedError: auf normalen Download ausweichen
      }
    } else {
      download();
    }
    await store.markBackup();
    await renderMehr();
    $('backup-msg').textContent = 'Sicherung gespeichert.';
  } catch {
    $('backup-msg').classList.add('err');
    $('backup-msg').textContent = 'Die Sicherung konnte nicht gespeichert werden.';
  }
});

$('backup-load').addEventListener('change', async (e) => {
  const f = e.target.files[0];
  e.target.value = '';
  if (!f) return;
  const msg = $('backup-msg');
  msg.classList.remove('err');
  try {
    const data = JSON.parse(await f.text());
    const problem = validateBackup(data);
    if (problem) throw new Error(problem);
    if (data.schemaVersion > SCHEMA_VERSION) throw new Error('Die Sicherung stammt aus einer neueren App-Version. Bitte zuerst die App aktualisieren.');
    const clean = sanitizeBackup(data);
    const [sets, cards, progress] = await Promise.all([getAll('sets'), getAll('cards'), getAll('progress')]);
    const ms = mergeById(sets, clean.sets);
    const mc = mergeById(cards, clean.cards);
    const mp = mergeProgress(progress, clean.progress);
    try {
      await write({ sets: ms.rows, cards: mc.rows, progress: mp.rows }, { progress: mp.removeIds });
    } catch {
      throw new Error('Die Sicherung konnte nicht eingelesen werden. Deine bisherigen Daten sind unverändert.');
    }
    msg.textContent = `Eingelesen: ${ms.added} neue Sets, ${mc.added} neue Wörter, ${ms.updated + mc.updated} aktualisiert.`;
    await renderTrash();
  } catch (err) {
    msg.classList.add('err');
    msg.textContent = err instanceof SyntaxError ? 'Die Datei ist keine gültige Sicherung.' : err.message;
  }
});

// ---------- Online / Offline ----------
function renderNet() {
  const el = $('net-status');
  el.textContent = navigator.onLine ? '' : 'offline';
  el.classList.toggle('offline', !navigator.onLine);
}
addEventListener('online', renderNet);
addEventListener('offline', renderNet);
renderNet();

// ---------- Installation ----------
const isStandalone = () =>
  matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent) ||
  (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
let deferredPrompt = null;

// Der Hinweis lässt sich nur für die aktuelle Sitzung schließen, damit er wiederkommt,
// solange die App nicht installiert ist.
function installDismissed() {
  try { return sessionStorage.getItem('merkwerk.installHint') === 'closed'; } catch { return false; }
}
function showInstallHint(text, withButton) {
  if (isStandalone() || installDismissed()) return;
  $('install-text').textContent = text;
  $('install-btn').hidden = !withButton;
  $('install-banner').hidden = false;
}
$('install-close').addEventListener('click', () => {
  $('install-banner').hidden = true;
  try { sessionStorage.setItem('merkwerk.installHint', 'closed'); } catch {}
});
addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPrompt = e;
  showInstallHint('Installiere Merkwerk, damit deine Vokabeln sicher gespeichert bleiben und die App offline startet.', true);
});
$('install-btn').addEventListener('click', async () => {
  if (!deferredPrompt) return;
  deferredPrompt.prompt();
  await deferredPrompt.userChoice;
  deferredPrompt = null;
  $('install-banner').hidden = true;
});
if (isIos && !isStandalone()) {
  showInstallHint('Tippe auf das Teilen-Symbol (Quadrat mit Pfeil) und dann auf „Zum Home-Bildschirm“. Lege deine Sets erst danach an, sonst sind sie in der installierten App nicht da.', false);
}

// ---------- Service Worker (offline + Updates) ----------
let swReady = false;
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').then((reg) => {
    swReady = !!reg.active;
    navigator.serviceWorker.ready.then(() => { swReady = true; renderFacts(); });
    const offerUpdate = (worker) => {
      $('update-banner').hidden = false;
      $('update-btn').onclick = () => worker.postMessage('skipWaiting');
    };
    if (reg.waiting && navigator.serviceWorker.controller) offerUpdate(reg.waiting);
    // Installierte Apps (v. a. iPhone) laden selten neu: beim Zurückkehren nach Updates suchen.
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') reg.update().catch(() => {});
    });
    reg.addEventListener('updatefound', () => {
      const nw = reg.installing;
      nw.addEventListener('statechange', () => {
        if (nw.state === 'installed' && navigator.serviceWorker.controller) offerUpdate(nw);
      });
    });
  }).catch(() => {});
  // Nur nach einem Update neu laden, nicht beim allerersten Start.
  const hadController = !!navigator.serviceWorker.controller;
  let reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloading || !hadController) return;
    reloading = true;
    location.reload();
  });
}

// ---------- Infos ----------
let persisted = null;
async function protectStorage() {
  if (!navigator.storage?.persist) return;
  persisted = await navigator.storage.persisted();
  if (!persisted) persisted = await navigator.storage.persist();
}

function renderFacts() {
  $('f-version').textContent = APP_VERSION;
  $('f-installed').textContent = isStandalone() ? 'ja' : 'nein, im Browser';
  $('f-offline').textContent = swReady ? 'ja' : 'noch nicht';
  $('f-persist').textContent = persisted === null ? 'unbekannt' : persisted ? 'ja' : 'nein';
  $('f-schema').textContent = `v${SCHEMA_VERSION}`;
  $('f-voices').textContent = speechAvailable() ? String(voiceCount()) : 'nicht verfügbar';
}
onVoices(() => renderFacts());

// ---------- Start ----------
(async () => {
  try {
    await openDb();
    if (!(await getMeta('createdAt'))) await setMeta('createdAt', new Date().toISOString());
    await store.purgeOldTrash();
  } catch (e) {
    console.error(e);
  }
  await protectStorage().catch(() => {});
  if (!location.hash) {
    let saved = '';
    try { saved = localStorage.getItem('merkwerk.route') || ''; } catch {}
    // Nur Hauptbereiche wiederherstellen, keine halb ausgefüllten Formulare.
    if (['sets', 'mehr'].includes(saved)) history.replaceState(null, '', `#${saved}`);
  }
  await render();
})();
