import { APP_VERSION } from './version.js';
import { openDb, count, getMeta, setMeta, SCHEMA_VERSION } from './db.js';

const $ = (id) => document.getElementById(id);

// ---------- Navigation ----------
const tabs = [...document.querySelectorAll('.tab')];
function show(view) {
  for (const t of tabs) {
    const on = t.dataset.view === view;
    if (on) t.setAttribute('aria-current', 'page');
    else t.removeAttribute('aria-current');
    $(`view-${t.dataset.view}`).hidden = !on;
  }
  try { localStorage.setItem('merkwerk.view', view); } catch {}
  if (view === 'mehr') renderFacts();
}
tabs.forEach((t) => t.addEventListener('click', () => show(t.dataset.view)));

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

function installDismissed() {
  try { return localStorage.getItem('merkwerk.installHint') === 'closed'; } catch { return false; }
}
function showInstallHint(text, withButton) {
  if (isStandalone() || installDismissed()) return;
  $('install-text').textContent = text;
  $('install-btn').hidden = !withButton;
  $('install-banner').hidden = false;
}
$('install-close').addEventListener('click', () => {
  $('install-banner').hidden = true;
  try { localStorage.setItem('merkwerk.installHint', 'closed'); } catch {}
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
  showInstallHint('Tippe unten auf Teilen und dann auf „Zum Home-Bildschirm“. Lege deine Sets erst danach an, sonst sind sie in der installierten App nicht da.', false);
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

// ---------- Speicher ----------
let persisted = null;
async function protectStorage() {
  if (!navigator.storage?.persist) return;
  persisted = await navigator.storage.persisted();
  if (!persisted) persisted = await navigator.storage.persist();
}

async function renderCounts() {
  try {
    const cards = await count('cards');
    $('c-new').textContent = String(cards);
  } catch {}
}

let voiceCount = 0;
function loadVoices() {
  if (!('speechSynthesis' in window)) return;
  voiceCount = speechSynthesis.getVoices().length;
  renderFacts();
}
if ('speechSynthesis' in window) {
  speechSynthesis.addEventListener?.('voiceschanged', loadVoices);
  loadVoices();
}

function renderFacts() {
  if (!$('f-version')) return;
  $('f-version').textContent = APP_VERSION;
  $('f-installed').textContent = isStandalone() ? 'ja' : 'nein, im Browser';
  $('f-offline').textContent = swReady ? 'ja' : 'noch nicht';
  $('f-persist').textContent = persisted === null ? 'unbekannt' : persisted ? 'ja' : 'nein';
  $('f-schema').textContent = `v${SCHEMA_VERSION}`;
  $('f-voices').textContent = 'speechSynthesis' in window ? String(voiceCount) : 'nicht verfügbar';
}

let startView = 'heute';
try { startView = localStorage.getItem('merkwerk.view') || 'heute'; } catch {}
show(['heute', 'sets', 'mehr'].includes(startView) ? startView : 'heute');

(async () => {
  try {
    await openDb();
    if (!(await getMeta('createdAt'))) await setMeta('createdAt', new Date().toISOString());
  } catch (e) {
    console.error(e);
  }
  await protectStorage().catch(() => {});
  await renderCounts();
  renderFacts();
})();
