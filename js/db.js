// Lokaler Speicher (IndexedDB). Jede Karte und jeder Lernstand ist ein eigener
// Datensatz mit id und updatedAt, damit später pro Karte synchronisiert werden kann.

export const DB_NAME = 'merkwerk';
export const SCHEMA_VERSION = 1;

// Migrationen: Schlüssel = Zielversion. Jede Funktion bekommt die Datenbank und
// die laufende Upgrade-Transaktion. Alte Daten werden nie gelöscht, nur umgebaut.
export const migrations = {
  1(db) {
    const sets = db.createObjectStore('sets', { keyPath: 'id' });
    sets.createIndex('updatedAt', 'updatedAt');
    const cards = db.createObjectStore('cards', { keyPath: 'id' });
    cards.createIndex('setId', 'setId');
    cards.createIndex('updatedAt', 'updatedAt');
    // Lernstand: eigener Datensatz mit id, cardId, updatedAt (und später deletedAt
    // als Löschmarkierung statt echtem Löschen, damit der Sync Löschungen kennt).
    const progress = db.createObjectStore('progress', { keyPath: 'id' });
    progress.createIndex('cardId', 'cardId', { unique: true });
    progress.createIndex('due', 'due');
    progress.createIndex('updatedAt', 'updatedAt');
    db.createObjectStore('meta', { keyPath: 'key' });
  },
};

export function runMigrations(db, tx, oldVersion, newVersion) {
  for (let v = oldVersion + 1; v <= newVersion; v++) {
    const step = migrations[v];
    if (!step) throw new Error(`Migration auf Version ${v} fehlt`);
    step(db, tx);
  }
}

let dbPromise = null;

export function openDb(idb = globalThis.indexedDB) {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = idb.open(DB_NAME, SCHEMA_VERSION);
    req.onupgradeneeded = (e) => runMigrations(req.result, req.transaction, e.oldVersion, e.newVersion);
    req.onsuccess = () => {
      const db = req.result;
      // Neue App-Version in einem anderen Tab will die Datenbank umbauen: hier loslassen.
      db.onversionchange = () => { db.close(); dbPromise = null; };
      resolve(db);
    };
    req.onerror = () => { dbPromise = null; reject(req.error); };
    // "blocked" heißt nur: ein alter Tab hält die Datenbank noch. Wir warten einfach.
    req.onblocked = () => console.warn('Merkwerk wartet, bis ein anderer Tab geschlossen ist.');
  });
  return dbPromise;
}

function wrap(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function count(store) {
  const db = await openDb();
  return wrap(db.transaction(store).objectStore(store).count());
}

export async function getMeta(key) {
  const db = await openDb();
  const row = await wrap(db.transaction('meta').objectStore('meta').get(key));
  return row ? row.value : undefined;
}

export async function setMeta(key, value) {
  const db = await openDb();
  const tx = db.transaction('meta', 'readwrite');
  tx.objectStore('meta').put({ key, value });
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
