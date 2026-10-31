// Sicherung als Datei: Export und Zusammenführen beim Einlesen.
// Reine Funktionen, mit Node testbar.

export const BACKUP_FORMAT = 'merkwerk-backup';

export function buildBackup({ sets, cards, progress }, schemaVersion, appVersion, now = new Date()) {
  return {
    format: BACKUP_FORMAT,
    schemaVersion,
    appVersion,
    exportedAt: now.toISOString(),
    sets,
    cards,
    progress,
  };
}

export function validateBackup(data) {
  if (!data || data.format !== BACKUP_FORMAT) return 'Das ist keine Merkwerk-Sicherung.';
  if (!Array.isArray(data.sets) || !Array.isArray(data.cards)) return 'Die Sicherung ist unvollständig.';
  if (typeof data.schemaVersion !== 'number') return 'Die Sicherung hat keine Versionsnummer.';
  return null;
}

// Führt zwei Listen zusammen: pro id gewinnt der Datensatz mit dem neueren updatedAt.
export function mergeById(existing, incoming) {
  const map = new Map(existing.map((r) => [r.id, r]));
  let added = 0;
  let updated = 0;
  for (const r of incoming) {
    if (!r || !r.id) continue;
    const old = map.get(r.id);
    if (!old) { map.set(r.id, r); added++; }
    else if ((r.updatedAt || '') > (old.updatedAt || '')) { map.set(r.id, r); updated++; }
  }
  return { rows: [...map.values()], added, updated };
}

// Prüft und bereinigt die Datensätze einer Sicherung, damit eine kaputte oder manipulierte
// Datei weder die App lahmlegen noch etwas einschleusen kann.
const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
const LANG_RE = /^[a-z]{2}(-[A-Z]{2})?$/;
const str = (v, max = 2000) => (typeof v === 'string' ? v.slice(0, max) : '');
const iso = (v) => (typeof v === 'string' && !Number.isNaN(Date.parse(v)) ? v : null);
const EPOCH = new Date(0).toISOString();

export function sanitizeBackup(data) {
  const sets = (data.sets || []).filter((s) => s && ID_RE.test(s.id)).map((s) => ({
    id: s.id,
    name: str(s.name, 200).trim() || 'Ohne Namen',
    folder: str(s.folder, 200),
    termLang: LANG_RE.test(s.termLang) ? s.termLang : 'en-GB',
    defLang: LANG_RE.test(s.defLang) ? s.defLang : 'de-DE',
    createdAt: iso(s.createdAt) || EPOCH,
    updatedAt: iso(s.updatedAt) || EPOCH,
    deletedAt: iso(s.deletedAt),
  }));
  const cards = (data.cards || []).filter((c) => c && ID_RE.test(c.id) && ID_RE.test(c.setId)).map((c) => ({
    id: c.id,
    setId: c.setId,
    term: str(c.term),
    definition: str(c.definition),
    position: Number.isFinite(c.position) ? c.position : 0,
    createdAt: iso(c.createdAt) || EPOCH,
    updatedAt: iso(c.updatedAt) || EPOCH,
    deletedAt: iso(c.deletedAt),
  }));
  // Lernstand: höchstens einer pro Karte (der neueste).
  const byCard = new Map();
  for (const p of data.progress || []) {
    if (!p || !ID_RE.test(p.id) || !ID_RE.test(p.cardId)) continue;
    const row = { ...p, updatedAt: iso(p.updatedAt) || EPOCH };
    const old = byCard.get(p.cardId);
    if (!old || row.updatedAt > old.updatedAt) byCard.set(p.cardId, row);
  }
  return { sets, cards, progress: [...byCard.values()] };
}

// Lernstand zusammenführen: pro Karte gewinnt der neuere (unabhängig von der id).
export function mergeProgress(existing, incoming) {
  const byCard = new Map(existing.map((p) => [p.cardId, p]));
  const removeIds = [];
  for (const p of incoming) {
    const old = byCard.get(p.cardId);
    if (!old) byCard.set(p.cardId, p);
    else if ((p.updatedAt || '') > (old.updatedAt || '')) {
      if (old.id !== p.id) removeIds.push(old.id);
      byCard.set(p.cardId, p);
    }
  }
  return { rows: [...byCard.values()], removeIds };
}
