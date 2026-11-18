// Muestra los reportes de "palabra que falta", agrupados y ordenados por cantidad.
// Uso: npm run reports   (archivo: REPORTS_FILE o data/reports/missing-words.jsonl)
// Los reportes NO habilitan nada: para aceptar una palabra, agregala a data/extra-words.txt
// (o como lema en data/extra-lemmas.txt) y reiniciá el servidor.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const file = process.env.REPORTS_FILE || path.join(ROOT, 'data/reports/missing-words.jsonl');
if (!fs.existsSync(file)) {
  console.log('No hay reportes todavía.');
  process.exit(0);
}
const byWord = new Map();
for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
  if (!line.trim()) continue;
  try {
    const r = JSON.parse(line);
    const e = byWord.get(r.word) || { word: r.word, count: 0, players: new Set(), notes: [], last: r.at };
    e.count += 1;
    if (r.player) e.players.add(r.player);
    if (r.note) e.notes.push(r.note);
    e.last = r.at;
    byWord.set(r.word, e);
  } catch { /* línea rota */ }
}
const list = [...byWord.values()].sort((a, b) => b.count - a.count);
console.log(`${list.length} palabras reportadas:\n`);
for (const e of list) console.log(`${String(e.count).padStart(3)} × ${e.word.padEnd(20)} ${[...e.players].join(', ')}${e.notes.length ? ` · "${e.notes.slice(-2).join('" "')}"` : ''}`);
