// Unit-Tests für Import und Sicherung: node tests/unit.mjs
import assert from 'node:assert/strict';
import { parseCards, detectDelimiter, decodeText } from '../js/importer.js';
import { mergeById, validateBackup, buildBackup, sanitizeBackup, mergeProgress } from '../js/backup.js';

let n = 0;
const t = (name, f) => { f(); n++; };

t('Tabulator (Quizlet-Export)', () => {
  const r = parseCards('holiday\tFerien\nto arrive\tankommen\n');
  assert.equal(r.delimiter, 'tab');
  assert.deepEqual(r.rows.map((x) => [x.term, x.definition]), [['holiday', 'Ferien'], ['to arrive', 'ankommen']]);
});
t('Semikolon mit Leerzeichen', () => {
  const r = parseCards('luggage ; Gepäck\ncolour;Farbe');
  assert.equal(r.delimiter, 'semicolon');
  assert.equal(r.rows[0].term, 'luggage');
  assert.equal(r.rows[1].definition, 'Farbe');
});
t('Bindestrich-Varianten, aber nicht in Wörtern', () => {
  const r = parseCards('well-known - bekannt\nmother-in-law – Schwiegermutter\nto look forward to — sich freuen auf');
  assert.equal(r.delimiter, 'dash');
  assert.deepEqual(r.rows.map((x) => x.term), ['well-known', 'mother-in-law', 'to look forward to']);
  assert.equal(r.rows[2].definition, 'sich freuen auf');
});
t('CSV mit Anführungszeichen und Komma in der Bedeutung', () => {
  const r = parseCards('"to get","bekommen, werden"\nto go,gehen', { delimiter: 'comma' });
  assert.equal(r.rows[0].term, 'to get');
  assert.equal(r.rows[0].definition, 'bekommen, werden');
});
t('Unvollständige Zeilen markiert, Leerzeilen ignoriert', () => {
  const r = parseCards('holiday;Ferien\n\nonlyword\n;nurBedeutung');
  assert.equal(r.rows.length, 3);
  assert.deepEqual(r.rows.map((x) => x.ok), [true, false, false]);
  assert.deepEqual(r.rows.map((x) => x.line), [1, 3, 4]);
});
t('Spalten tauschen und Überschrift überspringen', () => {
  const r = parseCards('Deutsch;Englisch\nFerien;holiday', { swap: true, skipHeader: true });
  assert.deepEqual([r.rows[0].term, r.rows[0].definition], ['holiday', 'Ferien']);
  assert.equal(r.rows.length, 1);
});
t('Mehrfache Leerzeichen und BOM bereinigt, Windows-Zeilenenden', () => {
  const r = parseCards('﻿to  arrive\t  ankommen \r\nx\ty\r\n');
  assert.equal(r.rows[0].term, 'to arrive');
  assert.equal(r.rows[0].definition, 'ankommen');
  assert.equal(r.rows.length, 2);
});
t('Gleichheitszeichen erkannt', () => {
  assert.equal(detectDelimiter('cat = Katze\ndog = Hund'), 'equals');
});
t('Zusammenführen: neuer gewinnt, unbekannt wird hinzugefügt', () => {
  const a = [{ id: '1', v: 'alt', updatedAt: '2026-01-01' }, { id: '2', v: 'x', updatedAt: '2026-05-01' }];
  const b = [{ id: '1', v: 'neu', updatedAt: '2026-02-01' }, { id: '2', v: 'älter', updatedAt: '2026-01-01' }, { id: '3', v: 'n', updatedAt: '2026-01-01' }];
  const m = mergeById(a, b);
  assert.equal(m.added, 1);
  assert.equal(m.updated, 1);
  const byId = Object.fromEntries(m.rows.map((r) => [r.id, r.v]));
  assert.deepEqual(byId, { 1: 'neu', 2: 'x', 3: 'n' });
});
t('Sicherung prüfen', () => {
  assert.ok(validateBackup({}));
  const ok = buildBackup({ sets: [], cards: [], progress: [] }, 1, '0.2.0', new Date('2026-10-31'));
  assert.equal(validateBackup(ok), null);
  assert.equal(ok.exportedAt, '2026-10-31T00:00:00.000Z');
});
t('CSV: Feld über mehrere Zeilen', () => {
  const r = parseCards('"to run","laufen,\nrennen"\nto go,gehen', { delimiter: 'comma' });
  assert.equal(r.rows.length, 2);
  assert.equal(r.rows[0].definition, 'laufen, rennen');
  assert.equal(r.rows[1].line, 3);
});
t('CSV: einzelnes offenes Anführungszeichen zerstört nichts', () => {
  const r = parseCards('"hello;Hallo\nbye;tschüss', { delimiter: 'semicolon' });
  assert.equal(r.rows.length, 2);
  assert.equal(r.rows[1].term, 'bye');
  assert.equal(r.rows[0].definition, 'Hallo');
});
t('Windows-1252 (Excel) wird erkannt', () => {
  const bytes = new Uint8Array([0x47, 0xe4, 0x72, 0x74, 0x65, 0x6e, 0x3b, 0x67, 0x61, 0x72, 0x64, 0x65, 0x6e]); // Gärten;garden
  const d = decodeText(bytes.buffer);
  assert.equal(d.encoding, 'windows-1252');
  assert.equal(d.text, 'Gärten;garden');
  assert.equal(decodeText(new TextEncoder().encode('Gärten').buffer).encoding, 'utf-8');
});
t('Sicherung bereinigen: gefährliche ids und falsche Typen', () => {
  const c = sanitizeBackup({
    sets: [{ id: 'x" onclick="alert(1)', name: 'böse' }, { id: 'ok-1', name: 42, termLang: '<b>' }],
    cards: [{ id: 'c1', setId: 'ok-1', term: { a: 1 }, definition: 'x' }],
    progress: [{ id: 'p1', cardId: 'c1', updatedAt: '2026-01-01' }, { id: 'p2', cardId: 'c1', updatedAt: '2026-02-01' }],
  });
  assert.equal(c.sets.length, 1);
  assert.equal(c.sets[0].name, 'Ohne Namen');
  assert.equal(c.sets[0].termLang, 'en-GB');
  assert.equal(c.cards[0].term, '');
  assert.equal(c.progress.length, 1);
  assert.equal(c.progress[0].id, 'p2');
});
t('Lernstand zusammenführen pro Karte', () => {
  const m = mergeProgress([{ id: 'a', cardId: 'c1', updatedAt: '2026-01-01' }], [{ id: 'b', cardId: 'c1', updatedAt: '2026-03-01' }]);
  assert.deepEqual(m.removeIds, ['a']);
  assert.equal(m.rows[0].id, 'b');
});
console.log(`ok: ${n} Unit-Tests`);
