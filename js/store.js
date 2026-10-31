// Sets und Karten verwalten. Gelöschtes bekommt deletedAt (Papierkorb) statt sofort zu verschwinden.
import { getAll, get, getAllByIndex, write, getMeta, setMeta } from './db.js';

export const TRASH_DAYS = 30;
const DAY = 86400000;

export const uid = () =>
  (globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`);
const now = () => new Date().toISOString();

export const LANGS = [
  { code: 'en-GB', label: 'Englisch (UK)' },
  { code: 'en-US', label: 'Englisch (US)' },
  { code: 'de-DE', label: 'Deutsch' },
  { code: 'de-CH', label: 'Deutsch (CH)' },
  { code: 'fr-FR', label: 'Französisch' },
  { code: 'it-IT', label: 'Italienisch' },
  { code: 'es-ES', label: 'Spanisch' },
];
export const langLabel = (code) => LANGS.find((l) => l.code === code)?.label ?? code;

export async function listSets({ deleted = false } = {}) {
  const all = await getAll('sets');
  return all
    .filter((s) => (deleted ? !!s.deletedAt : !s.deletedAt))
    .sort((a, b) => (a.folder || '').localeCompare(b.folder || '', 'de') || a.name.localeCompare(b.name, 'de'));
}

export async function getSet(id) {
  const s = await get('sets', id);
  return s && !s.deletedAt ? s : null;
}

export async function getCards(setId) {
  const cards = await getAllByIndex('cards', 'setId', setId);
  return cards.filter((c) => !c.deletedAt).sort((a, b) => a.position - b.position);
}

export async function countCardsBySet() {
  const cards = await getAll('cards');
  const m = new Map();
  for (const c of cards) if (!c.deletedAt) m.set(c.setId, (m.get(c.setId) || 0) + 1);
  return m;
}

export async function activeCardCount() {
  const [sets, cards] = await Promise.all([getAll('sets'), getAll('cards')]);
  const live = new Set(sets.filter((s) => !s.deletedAt).map((s) => s.id));
  return cards.filter((c) => !c.deletedAt && live.has(c.setId)).length;
}

export async function listFolders() {
  const sets = await listSets();
  return [...new Set(sets.map((s) => s.folder).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'de'));
}

// Speichert ein Set mit seiner vollständigen Kartenliste.
// cards: [{id?, term, definition}] in gewünschter Reihenfolge. Fehlende alte Karten werden gelöscht markiert.
export async function saveSet(setData, cards) {
  const t = now();
  const existing = setData.id ? await get('sets', setData.id) : null;
  const set = {
    id: existing?.id ?? uid(),
    name: setData.name.trim() || 'Ohne Namen',
    folder: (setData.folder || '').trim(),
    termLang: setData.termLang || 'en-GB',
    defLang: setData.defLang || 'de-DE',
    createdAt: existing?.createdAt ?? t,
    updatedAt: t,
    deletedAt: null,
  };
  const old = existing ? await getAllByIndex('cards', 'setId', set.id) : [];
  const oldById = new Map(old.map((c) => [c.id, c]));
  const keep = new Set();
  const rows = [];
  cards
    .map((c) => ({ ...c, term: c.term.trim(), definition: c.definition.trim() }))
    .filter((c) => c.term || c.definition)
    .forEach((c, i) => {
      const prev = c.id ? oldById.get(c.id) : null;
      const id = prev?.id ?? uid();
      keep.add(id);
      const changed = !prev || prev.term !== c.term || prev.definition !== c.definition || prev.position !== i || prev.deletedAt;
      if (changed) {
        rows.push({ id, setId: set.id, term: c.term, definition: c.definition, position: i,
          createdAt: prev?.createdAt ?? t, updatedAt: t, deletedAt: null });
      }
    });
  for (const c of old) {
    if (!keep.has(c.id) && !c.deletedAt) rows.push({ ...c, deletedAt: t, updatedAt: t });
  }
  await write({ sets: [set], cards: rows });
  return set;
}

export async function trashSet(id) {
  const s = await get('sets', id);
  if (!s) return;
  const t = now();
  await write({ sets: [{ ...s, deletedAt: t, updatedAt: t }] });
}

export async function restoreSet(id) {
  const s = await get('sets', id);
  if (!s) return;
  await write({ sets: [{ ...s, deletedAt: null, updatedAt: now() }] });
}

// Endgültig löschen: Set, seine Karten und deren Lernstand.
export async function purgeSet(id) {
  const cards = await getAllByIndex('cards', 'setId', id);
  const progress = await getAll('progress');
  const cardIds = new Set(cards.map((c) => c.id));
  await write({}, {
    sets: [id],
    cards: [...cardIds],
    progress: progress.filter((p) => cardIds.has(p.cardId)).map((p) => p.id),
  });
}

export async function purgeOldTrash(today = Date.now()) {
  const trashed = await listSets({ deleted: true });
  for (const s of trashed) {
    if (today - Date.parse(s.deletedAt) > TRASH_DAYS * DAY) await purgeSet(s.id);
  }
}

export const daysLeftInTrash = (s, today = Date.now()) =>
  Math.max(0, TRASH_DAYS - Math.floor((today - Date.parse(s.deletedAt)) / DAY));

export async function exportAll() {
  const [sets, cards, progress] = await Promise.all([getAll('sets'), getAll('cards'), getAll('progress')]);
  return { sets, cards, progress };
}

export async function lastBackupAt() { return getMeta('lastBackupAt'); }
export async function markBackup() { return setMeta('lastBackupAt', now()); }
