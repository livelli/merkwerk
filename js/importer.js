// Liest eingefügten Text oder CSV in Karten (Begriff + Bedeutung) ein.
// Reine Funktionen ohne Browser-Abhängigkeit, damit sie mit Node getestet werden können.

export const DELIMITERS = [
  { id: 'auto', label: 'Automatisch erkennen' },
  { id: 'tab', label: 'Tabulator', value: '\t' },
  { id: 'semicolon', label: 'Semikolon ;', value: ';' },
  { id: 'comma', label: 'Komma ,', value: ',' },
  { id: 'dash', label: 'Bindestrich mit Leerzeichen  –  ', value: ' - ' },
  { id: 'equals', label: 'Gleichheitszeichen =', value: '=' },
  { id: 'colon', label: 'Doppelpunkt :', value: ':' },
];

// Bindestrich-Varianten (–, —) mit Leerzeichen gelten auch als " - ".
const DASH_RE = /\s+[-–—]\s+/;

function splitCsvLine(line, sep) {
  // CSV mit Anführungszeichen: "a, b",c
  const out = [];
  let cur = '';
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (q) {
      if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (ch === '"') q = false;
      else cur += ch;
    } else if (ch === '"' && cur.trim() === '') { q = true; cur = ''; }
    else if (ch === sep) { out.push(cur); cur = ''; }
    else cur += ch;
  }
  out.push(cur);
  return out;
}

function splitLine(line, delim) {
  if (delim === 'dash') {
    const m = line.match(DASH_RE);
    if (!m) return [line];
    return [line.slice(0, m.index), line.slice(m.index + m[0].length)];
  }
  const d = DELIMITERS.find((x) => x.id === delim);
  if (!d || !d.value) return [line];
  if (delim === 'comma' || delim === 'semicolon') return splitCsvLine(line, d.value);
  const i = line.indexOf(d.value);
  if (i < 0) return [line];
  return [line.slice(0, i), line.slice(i + d.value.length)];
}

export function detectDelimiter(text) {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean).slice(0, 50);
  if (!lines.length) return 'tab';
  const candidates = ['tab', 'semicolon', 'dash', 'equals', 'comma', 'colon'];
  let best = 'tab';
  let bestScore = -1;
  for (const c of candidates) {
    const hits = lines.filter((l) => splitLine(l, c).length >= 2).length;
    // Tab und Semikolon sind eindeutiger als Komma/Doppelpunkt (die auch im Text vorkommen).
    const weight = { tab: 1.3, semicolon: 1.2, dash: 1.15, equals: 1.1, comma: 1, colon: 0.9 }[c];
    const score = (hits / lines.length) * weight;
    if (score > bestScore) { bestScore = score; best = c; }
  }
  return best;
}

const clean = (s) => s.replace(/\s+/g, ' ').trim();

// Ergebnis: { rows: [{term, definition, ok, line}], delimiter }
// CSV über den ganzen Text: Felder in Anführungszeichen dürfen Zeilenumbrüche enthalten.
// Bleibt ein Anführungszeichen offen, wird null zurückgegeben (dann zeilenweise ohne Anführungszeichen-Logik).
function parseCsvRecords(text, sep) {
  const out = [];
  let rec = [];
  let cur = '';
  let q = false;
  let line = 1;
  let startLine = 1;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"' && text[i + 1] === '"') { cur += '"'; i++; }
      else if (ch === '"') q = false;
      else { if (ch === '\n') line++; cur += ch; }
    } else if (ch === '"' && cur.trim() === '') { q = true; cur = ''; }
    else if (ch === sep) { rec.push(cur); cur = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      rec.push(cur);
      out.push({ parts: rec, line: startLine });
      rec = []; cur = ''; line++; startLine = line;
    } else cur += ch;
  }
  if (q) return null;
  rec.push(cur);
  out.push({ parts: rec, line: startLine });
  return out;
}

export function parseCards(text, { delimiter = 'auto', swap = false, skipHeader = false } = {}) {
  text = text.replace(/^\uFEFF/, '');
  const delim = delimiter === 'auto' ? detectDelimiter(text) : delimiter;
  let records = null;
  if (delim === 'comma' || delim === 'semicolon') {
    records = parseCsvRecords(text, delim === 'comma' ? ',' : ';');
  }
  if (!records) {
    records = text.split(/\r?\n/).map((raw, idx) => ({
      parts: (delim === 'comma' || delim === 'semicolon')
        ? raw.split(delim === 'comma' ? ',' : ';')
        : splitLine(raw, delim),
      line: idx + 1,
    }));
  }
  const rows = [];
  let first = true;
  records.forEach(({ parts: rawParts, line }) => {
    if (!rawParts.join('').trim()) return;
    if (first && skipHeader) { first = false; return; }
    first = false;
    const parts = rawParts.map(clean);
    let term = parts[0] || '';
    let definition = parts.slice(1).filter(Boolean).join(delim === 'comma' ? ', ' : '; ');
    if (swap) [term, definition] = [definition, term];
    rows.push({ term, definition, ok: !!term && !!definition, line });
  });
  return { rows, delimiter: delim };
}

// Datei-Inhalt lesen: UTF-8, sonst Windows-1252 (Excel unter Windows speichert CSV oft so).
export function decodeText(buffer) {
  try {
    return { text: new TextDecoder('utf-8', { fatal: true }).decode(buffer), encoding: 'utf-8' };
  } catch {
    return { text: new TextDecoder('windows-1252').decode(buffer), encoding: 'windows-1252' };
  }
}
