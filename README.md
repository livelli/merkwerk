# Merkwerk

Eigene Vokabel-Lern-App: Wörter effizient und mit korrekter Schreibweise lernen, mit Lernplan bis zu einem Stichtag.

- Läuft im Browser auf Handy und Laptop, installierbar auf dem Home-Bildschirm, funktioniert offline.
- Gehostet mit GitHub Pages: https://livelli.github.io/merkwerk/
- **Persönliche Vokabeln liegen nie in diesem Repository**, nur auf dem Gerät (und später im privaten Online-Speicher).

## Aufbau

| Datei | Zweck |
|---|---|
| `index.html`, `css/app.css` | Oberfläche im Design „Nacht“ |
| `js/app.js` | Navigation, Installationshinweis, Updates |
| `js/db.js` | Lokaler Speicher (IndexedDB) mit Versionsnummer und Migrationen |
| `sw.js` | Service Worker für Offline-Betrieb |
| `tests/` | `node tests/check.mjs` (Dateien/Versionen), `node tests/smoke.cjs` (Browser-Test, braucht Playwright) |

Bei jeder Veröffentlichung `APP_VERSION` in `js/version.js` und `CACHE_VERSION` in `sw.js` gleich erhöhen.
