// Persistencia opcional en archivo: si se define PERSIST_FILE, las salas (con su partida, el Set de
// palabras usadas y el reloj de partida) se guardan cada pocos segundos y al apagar, y se
// recuperan al arrancar. Sin la variable, todo vive en memoria.

import fs from 'node:fs';
import path from 'node:path';

export class FilePersistence {
  constructor(file, { intervalMs = 5000, log = console } = {}) {
    this.file = file ? path.resolve(file) : null;
    this.intervalMs = intervalMs;
    this.log = log;
    this.timer = null;
  }

  get enabled() {
    return Boolean(this.file);
  }

  load() {
    if (!this.file || !fs.existsSync(this.file)) return null;
    try {
      return JSON.parse(fs.readFileSync(this.file, 'utf8'));
    } catch (err) {
      this.log.error(`[persistencia] no se pudo leer ${this.file}: ${err.message}`);
      return null;
    }
  }

  save(data) {
    if (!this.file) return;
    try {
      fs.mkdirSync(path.dirname(this.file), { recursive: true });
      const tmp = `${this.file}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify(data));
      fs.renameSync(tmp, this.file); // escritura atómica
    } catch (err) {
      this.log.error(`[persistencia] no se pudo guardar: ${err.message}`);
    }
  }

  start(getData) {
    if (!this.file) return;
    this.timer = setInterval(() => this.save(getData()), this.intervalMs);
    this.timer.unref?.();
  }

  stop(getData) {
    clearInterval(this.timer);
    if (this.file && getData) this.save(getData());
  }
}

/** Reportes de "palabra que falta": se guardan para revisión. NO habilitan la palabra. */
export class ReportLog {
  constructor(file, log = console) {
    this.file = path.resolve(file);
    this.log = log;
  }

  add(entry) {
    try {
      fs.mkdirSync(path.dirname(this.file), { recursive: true });
      fs.appendFileSync(this.file, `${JSON.stringify(entry)}\n`);
      return true;
    } catch (err) {
      this.log.error(`[reportes] ${err.message}`);
      return false;
    }
  }
}
