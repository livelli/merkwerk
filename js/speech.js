// Vorlesen mit den Stimmen des Geräts.
let voices = [];
const listeners = new Set();

let settled = false;
function load() {
  if (!('speechSynthesis' in globalThis)) return;
  voices = speechSynthesis.getVoices();
  if (voices.length) settled = true;
  listeners.forEach((f) => f(voices));
}
if ('speechSynthesis' in globalThis) {
  load();
  speechSynthesis.addEventListener?.('voiceschanged', load);
  // Manche Geräte melden nie "voiceschanged": nach 2 Sekunden gilt der Stand als endgültig.
  setTimeout(() => { settled = true; load(); }, 2000);
}
export const voicesSettled = () => settled;

export const speechAvailable = () => 'speechSynthesis' in globalThis;
export const onVoices = (f) => { listeners.add(f); f(voices); };
export const voiceCount = () => voices.length;

// Beste Stimme für eine Sprache: exakt (en-GB), sonst gleiche Grundsprache (en-*).
export function voiceFor(lang) {
  const norm = (s) => s.replace('_', '-').toLowerCase();
  const l = norm(lang);
  return voices.find((v) => norm(v.lang) === l && v.localService)
    || voices.find((v) => norm(v.lang) === l)
    || voices.find((v) => norm(v.lang).startsWith(l.split('-')[0] + '-'))
    || null;
}

export function hasVoice(lang) { return !!voiceFor(lang); }

export function speak(text, lang) {
  if (!speechAvailable() || !text) return false;
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = lang;
  const v = voiceFor(lang);
  if (v) u.voice = v;
  u.rate = 0.95;
  speechSynthesis.speak(u);
  return true;
}
