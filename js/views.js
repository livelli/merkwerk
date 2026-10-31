// Bildschirme im Reiter "Sets": Liste, Set-Ansicht, Bearbeiten, Import.
import * as store from './store.js';
import { parseCards, DELIMITERS, decodeText } from './importer.js';
import { speak, voiceFor, speechAvailable, voiceCount, voicesSettled, onVoices } from './speech.js';

export const h = (s) => String(s ?? '').replace(/[&<>"']/g, (c) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const ICON = {
  back: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 18l-6-6 6-6"></path></svg>',
  speaker: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M11 5L6 9H3v6h3l5 4V5z"></path><path d="M15.5 8.5a5 5 0 010 7"></path></svg>',
  trash: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"></path></svg>',
  chev: '<svg viewBox="0 0 24 24" aria-hidden="true" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M9 6l6 6-6 6"></path></svg>',
};

const langOptions = (sel) => store.LANGS.map((l) =>
  `<option value="${l.code}"${l.code === sel ? ' selected' : ''}>${h(l.label)}</option>`).join('');

const backBtn = (href, label = 'Zurück') =>
  `<a class="icon-btn back" href="${href}" aria-label="${h(label)}">${ICON.back}</a>`;

function voiceWarning(set) {
  if (!speechAvailable()) return '<p class="warn">Dieses Gerät kann nicht vorlesen.</p>';
  if (!voiceCount()) {
    return voicesSettled()
      ? '<p class="warn">Auf diesem Gerät wurden keine Vorlese-Stimmen gefunden. Auf dem iPhone: Einstellungen → Bedienungshilfen → Gesprochene Inhalte → Stimmen.</p>'
      : '';
  }
  const notes = [];
  for (const lang of [...new Set([set.termLang, set.defLang])]) {
    const v = voiceFor(lang);
    if (!v) notes.push(`Für ${h(store.langLabel(lang))} hat dieses Gerät keine Vorlese-Stimme.`);
    else if (v.lang.replace('_', '-').toLowerCase() !== lang.toLowerCase()) {
      notes.push(`Keine Stimme für ${h(store.langLabel(lang))} gefunden, es wird ${h(v.lang)} verwendet (andere Aussprache).`);
    }
  }
  if (!notes.length) return '';
  return `<p class="warn">${notes.join(' ')} Auf dem iPhone kannst du Stimmen unter Einstellungen → Bedienungshilfen → Gesprochene Inhalte → Stimmen laden.</p>`;
}

// ---------- Liste ----------
export async function renderList(el) {
  const [sets, counts] = await Promise.all([store.listSets(), store.countCardsBySet()]);
  let body = '';
  if (!sets.length) {
    body = `<div class="empty"><p class="empty-title">Noch keine Sets</p>
      <p>Lege ein Set an und füge Vokabeln ein, zum Beispiel aus einer Liste: ein Wort pro Zeile, Englisch und Deutsch getrennt durch Tabulator, Semikolon oder „ - “.</p></div>`;
  } else {
    let folder = null;
    let open = false;
    for (const s of sets) {
      const f = s.folder || '';
      if (f !== folder) {
        if (open) body += '</ul>';
        body += `<p class="folder">${f ? h(f) : 'Ohne Ordner'}</p><ul class="set-list">`;
        open = true;
        folder = f;
      }
      const n = counts.get(s.id) || 0;
      body += `<li><a class="set-item" href="#set/${h(s.id)}"><span class="name">${h(s.name)}</span>
        <span class="cnt">${n} ${n === 1 ? 'Wort' : 'Wörter'}</span>${ICON.chev}</a></li>`;
    }
    if (open) body += '</ul>';
  }
  el.innerHTML = `<h1 tabindex="-1">Sets</h1>${body}
    <div class="row-actions"><a class="btn" href="#import/new">Neues Set aus Liste</a>
    <a class="btn btn-ghost" href="#edit/new">Von Hand anlegen</a></div>`;
}

// ---------- Set-Ansicht ----------
export async function renderSet(el, id, go) {
  const set = await store.getSet(id);
  if (!set) return go('sets');
  const cards = await store.getCards(id);
  el.innerHTML = `<div class="view-head">${backBtn('#sets', 'Zurück zu den Sets')}<h1 tabindex="-1">${h(set.name)}</h1></div>
    <p class="sub">${set.folder ? h(set.folder) + ' · ' : ''}${cards.length} ${cards.length === 1 ? 'Wort' : 'Wörter'} · ${h(store.langLabel(set.termLang))} → ${h(store.langLabel(set.defLang))}</p>
    <div id="voice-warn">${voiceWarning(set)}</div>
    <button class="btn btn-block" type="button" disabled>Lernen (kommt in Phase 2)</button>
    <div class="row-actions">
      <a class="btn btn-ghost" href="#edit/${set.id}">Bearbeiten</a>
      <a class="btn btn-ghost" href="#import/${set.id}">Importieren</a>
    </div>
    ${cards.length ? `<ul class="word-list">${cards.map((c) => `<li><div class="w"><div class="t" lang="${h(set.termLang)}">${h(c.term)}</div><div class="d" lang="${h(set.defLang)}">${h(c.definition)}</div></div>
      <button class="icon-btn" type="button" data-speak="${h(c.term)}" aria-label="${h(c.term)} vorlesen">${ICON.speaker}</button></li>`).join('')}</ul>`
      : '<div class="empty"><p>Dieses Set hat noch keine Wörter.</p></div>'}
    <div class="row-actions"><button class="btn btn-danger" type="button" id="del-set">Set löschen</button></div>`;
  el.querySelectorAll('[data-speak]').forEach((b) =>
    b.addEventListener('click', () => {
      if (!speak(b.dataset.speak, set.termLang)) {
        el.querySelector('#voice-warn').innerHTML = '<p class="warn">Vorlesen hat nicht geklappt. Prüfe, ob der Ton am iPhone eingeschaltet ist.</p>';
      }
    }));
  onVoices(() => { const w = el.querySelector('#voice-warn'); if (w) w.innerHTML = voiceWarning(set); });
  el.querySelector('#del-set').addEventListener('click', async () => {
    await store.trashSet(set.id);
    go('sets', `„${set.name}“ liegt jetzt 30 Tage im Papierkorb (unter „Mehr“).`);
  });
}

// ---------- Bearbeiten ----------
const inputAttrs = 'autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false"';

function rowHtml(c, i, set) {
  return `<div class="card-row" data-id="${h(c.id || '')}">
    <div class="inputs">
      <span class="num-badge">${i + 1}</span>
      <input class="input term" ${inputAttrs} lang="${h(set.termLang)}" aria-label="Wort ${i + 1} (${h(store.langLabel(set.termLang))})" placeholder="${h(store.langLabel(set.termLang))}" value="${h(c.term)}">
      <input class="input def" ${inputAttrs} lang="${h(set.defLang)}" aria-label="Bedeutung ${i + 1} (${h(store.langLabel(set.defLang))})" placeholder="${h(store.langLabel(set.defLang))}" value="${h(c.definition)}">
    </div>
    <button class="icon-btn del-row" type="button" aria-label="Wort ${i + 1} entfernen">${ICON.trash}</button>
  </div>`;
}

export async function renderEdit(el, id, go) {
  const isNew = id === 'new';
  const set = isNew ? { name: '', folder: '', termLang: 'en-GB', defLang: 'de-DE' } : await store.getSet(id);
  if (!set) return go('sets');
  const cards = isNew ? [{ term: '', definition: '' }] : await store.getCards(id);
  if (!cards.length) cards.push({ term: '', definition: '' });
  const folders = await store.listFolders();
  el.innerHTML = `<div class="view-head">${backBtn(isNew ? '#sets' : `#set/${id}`, 'Abbrechen')}<h1 tabindex="-1">${isNew ? 'Neues Set' : 'Set bearbeiten'}</h1></div>
    <form id="edit-form" novalidate>
      <div class="field"><label for="f-name">Name</label><input class="input" id="f-name" required autocomplete="off" autocorrect="off" spellcheck="false" value="${h(set.name)}" placeholder="z. B. Unit 3 – Travel"></div>
      <div class="field"><label for="f-folder">Ordner (optional)</label><input class="input" id="f-folder" list="folders" autocomplete="off" autocorrect="off" spellcheck="false" value="${h(set.folder)}" placeholder="z. B. Englisch Kurs B1">
        <datalist id="folders">${folders.map((f) => `<option value="${h(f)}"></option>`).join('')}</datalist></div>
      <div class="two">
        <div class="field"><label for="f-tl">Wort</label><select class="input" id="f-tl">${langOptions(set.termLang)}</select></div>
        <div class="field"><label for="f-dl">Bedeutung</label><select class="input" id="f-dl">${langOptions(set.defLang)}</select></div>
      </div>
      <p class="lbl-strong">Wörter</p>
      <div class="card-rows" id="rows">${cards.map((c, i) => rowHtml(c, i, set)).join('')}</div>
      <button class="btn btn-ghost btn-block" type="button" id="add-row">Wort hinzufügen</button>
      <p class="msg err" id="edit-msg" role="alert"></p>
      <div class="row-actions"><button class="btn" type="submit">Speichern</button></div>
    </form>`;
  const rows = el.querySelector('#rows');
  const renumber = () => rows.querySelectorAll('.card-row').forEach((r, i) => {
    r.querySelector('.num-badge').textContent = i + 1;
    r.querySelector('.term').setAttribute('aria-label', `Wort ${i + 1}`);
    r.querySelector('.def').setAttribute('aria-label', `Bedeutung ${i + 1}`);
    r.querySelector('.del-row').setAttribute('aria-label', `Wort ${i + 1} entfernen`);
  });
  const cur = () => ({ termLang: el.querySelector('#f-tl').value, defLang: el.querySelector('#f-dl').value });
  el.querySelector('#add-row').addEventListener('click', () => {
    rows.insertAdjacentHTML('beforeend', rowHtml({ term: '', definition: '' }, rows.children.length, cur()));
    rows.lastElementChild.querySelector('.term').focus();
  });
  rows.addEventListener('click', (e) => {
    const b = e.target.closest('.del-row');
    if (!b) return;
    const row = b.closest('.card-row');
    const next = row.nextElementSibling || row.previousElementSibling;
    row.remove();
    if (!rows.children.length) rows.insertAdjacentHTML('beforeend', rowHtml({ term: '', definition: '' }, 0, cur()));
    renumber();
    (next || rows.lastElementChild).querySelector('.term').focus();
  });
  // Enter im Bedeutungsfeld der letzten Zeile: neue Zeile (schnelles Abtippen am Laptop).
  rows.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' || !e.target.classList.contains('def')) return;
    e.preventDefault();
    if (e.target.closest('.card-row') === rows.lastElementChild) el.querySelector('#add-row').click();
    else e.target.closest('.card-row').nextElementSibling.querySelector('.term').focus();
  });
  let busy = false;
  el.querySelector('#edit-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    if (busy) return;
    const name = el.querySelector('#f-name').value.trim();
    if (!name) {
      el.querySelector('#edit-msg').textContent = 'Bitte gib dem Set einen Namen.';
      el.querySelector('#f-name').focus();
      return;
    }
    const list = [...rows.querySelectorAll('.card-row')].map((r) => ({
      id: r.dataset.id || undefined,
      term: r.querySelector('.term').value,
      definition: r.querySelector('.def').value,
    }));
    const half = list.find((c) => !!c.term.trim() !== !!c.definition.trim());
    if (half) {
      el.querySelector('#edit-msg').textContent = 'Bei einem Wort fehlt Wort oder Bedeutung. Ergänze es oder entferne die Zeile.';
      return;
    }
    busy = true;
    el.querySelector('button[type=submit]').disabled = true;
    try {
      const saved = await store.saveSet({ id: isNew ? undefined : id, name, folder: el.querySelector('#f-folder').value, ...cur() }, list);
      go(`set/${saved.id}`, 'Gespeichert.');
    } catch (err) {
      busy = false;
      el.querySelector('button[type=submit]').disabled = false;
      el.querySelector('#edit-msg').textContent = 'Speichern hat nicht geklappt: ' + err.message;
    }
  });
}

// ---------- Import ----------
export async function renderImport(el, id, go) {
  const isNew = id === 'new';
  const set = isNew ? null : await store.getSet(id);
  if (!isNew && !set) return go('sets');
  const folders = await store.listFolders();
  el.innerHTML = `<div class="view-head">${backBtn(isNew ? '#sets' : `#set/${id}`, 'Abbrechen')}<h1 tabindex="-1">${isNew ? 'Neues Set aus Liste' : 'Wörter hinzufügen'}</h1></div>
    ${isNew ? `<div class="field"><label for="i-name">Name des Sets</label><input class="input" id="i-name" autocomplete="off" autocorrect="off" spellcheck="false" placeholder="z. B. Unit 3 – Travel"></div>
      <div class="field"><label for="i-folder">Ordner (optional)</label><input class="input" id="i-folder" list="folders" autocomplete="off" autocorrect="off" spellcheck="false">
        <datalist id="folders">${folders.map((f) => `<option value="${h(f)}"></option>`).join('')}</datalist></div>
      <div class="two">
        <div class="field"><label for="i-tl">Wort</label><select class="input" id="i-tl">${langOptions('en-GB')}</select></div>
        <div class="field"><label for="i-dl">Bedeutung</label><select class="input" id="i-dl">${langOptions('de-DE')}</select></div>
      </div>` : `<p class="sub">Neue Wörter werden an „${h(set.name)}“ angehängt.</p>`}
    <div class="field"><label for="i-text">Liste einfügen: ein Wort pro Zeile</label>
      <textarea class="input" id="i-text" ${inputAttrs} placeholder="holiday;Ferien&#10;to arrive;ankommen&#10;luggage - Gepäck"></textarea></div>
    <div class="row-actions"><label class="btn btn-ghost file-btn">Datei wählen (.txt, .csv)<input type="file" id="i-file" accept=".txt,.csv,.tsv,text/plain,text/csv"></label></div>
    <div class="field"><label for="i-delim">Trennzeichen zwischen Wort und Bedeutung</label>
      <select class="input" id="i-delim">${DELIMITERS.map((d) => `<option value="${d.id}">${h(d.label)}</option>`).join('')}</select></div>
    <label class="check"><input type="checkbox" id="i-swap"> Spalten tauschen (Deutsch steht vorne)</label>
    <label class="check"><input type="checkbox" id="i-head"> Erste Zeile ist eine Überschrift</label>
    <div id="i-preview"></div>
    <p class="msg err" id="i-msg" role="alert"></p>
    <div class="row-actions"><button class="btn" type="button" id="i-save" disabled>Übernehmen</button></div>`;

  const $ = (s) => el.querySelector(s);
  let parsed = { rows: [] };
  const update = () => {
    const text = $('#i-text').value;
    parsed = parseCards(text, { delimiter: $('#i-delim').value, swap: $('#i-swap').checked, skipHeader: $('#i-head').checked });
    const good = parsed.rows.filter((r) => r.ok);
    const bad = parsed.rows.length - good.length;
    const detected = DELIMITERS.find((d) => d.id === parsed.delimiter)?.label;
    $('#i-save').disabled = !good.length;
    if (!text.trim()) { $('#i-preview').innerHTML = ''; return; }
    $('#i-preview').innerHTML = `<p class="summary" role="status">${good.length} ${good.length === 1 ? 'Wort' : 'Wörter'} erkannt${bad ? `, ${bad} ${bad === 1 ? 'Zeile' : 'Zeilen'} unvollständig (rot, werden übersprungen)` : ''}.${$('#i-delim').value === 'auto' ? ` Trennzeichen: ${h(detected)}.` : ''}</p>
      <div class="preview-wrap"><table class="preview"><thead><tr><th scope="col">Zeile</th><th scope="col">Wort</th><th scope="col">Bedeutung</th></tr></thead><tbody>
      ${parsed.rows.slice(0, 300).map((r) => `<tr class="${r.ok ? '' : 'bad'}"><td class="n">${r.line}</td><td>${h(r.term) || '–'}</td><td>${h(r.definition) || '–'}</td></tr>`).join('')}
      </tbody></table></div>${parsed.rows.length > 300 ? `<p class="summary">Vorschau zeigt die ersten 300 Zeilen.</p>` : ''}`;
  };
  ['#i-text', '#i-delim', '#i-swap', '#i-head'].forEach((s) => $(s).addEventListener('input', update));
  $('#i-file').addEventListener('change', async (e) => {
    const f = e.target.files[0];
    e.target.value = ''; // gleiche Datei nochmal wählbar
    if (!f) return;
    if (/\.pdf$/i.test(f.name)) { $('#i-msg').textContent = 'PDFs kann die App erst ab Phase 4 lesen. Schick mir das PDF bis dahin im Chat.'; return; }
    try {
      $('#i-text').value = decodeText(await f.arrayBuffer()).text;
    } catch {
      $('#i-msg').textContent = 'Die Datei konnte nicht gelesen werden.';
      return;
    }
    $('#i-msg').textContent = '';
    if (isNew && !$('#i-name').value) $('#i-name').value = f.name.replace(/\.[^.]+$/, '');
    update();
  });
  let busy = false;
  $('#i-save').addEventListener('click', async () => {
    const good = parsed.rows.filter((r) => r.ok).map((r) => ({ term: r.term, definition: r.definition }));
    if (!good.length || busy) return;
    if (isNew && !$('#i-name').value.trim()) { $('#i-msg').textContent = 'Bitte gib dem Set einen Namen.'; $('#i-name').focus(); return; }
    busy = true;
    $('#i-save').disabled = true;
    try {
      await importNow(good);
    } catch (err) {
      busy = false;
      $('#i-save').disabled = false;
      $('#i-msg').textContent = 'Übernehmen hat nicht geklappt: ' + err.message;
    }
  });
  async function importNow(good) {
    if (isNew) {
      const name = $('#i-name').value.trim();
      const s = await store.saveSet({ name, folder: $('#i-folder').value, termLang: $('#i-tl').value, defLang: $('#i-dl').value }, good);
      go(`set/${s.id}`, `${good.length} Wörter übernommen.`);
    } else {
      const existing = await store.getCards(set.id);
      await store.saveSet(set, [...existing, ...good]);
      go(`set/${set.id}`, `${good.length} Wörter hinzugefügt.`);
    }
  }
}
