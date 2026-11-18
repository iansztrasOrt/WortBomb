// Servidor de wORTbomb: Express (archivos del cliente) + Socket.IO (juego en tiempo real).
//
// Variables de entorno:
//   PORT            puerto HTTP (por defecto 3000)
//   PERSIST_FILE    archivo JSON para guardar y recuperar las salas (opcional)
//   REPORTS_FILE    dónde se guardan los reportes de palabras que faltan (data/reports/missing-words.jsonl)
//   MAX_ROOMS       tope de salas simultáneas (500)
//   LOG_LEVEL       debug | info | error (info)

import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { Server } from 'socket.io';
import { loadDictionary } from '../engine/dictionary.js';
import { SyllableBank } from '../engine/syllables.js';
import { ROOM_LIMITS } from '../engine/constants.js';
import { RoomManager, cleanCode } from './rooms.js';
import { attachSockets } from './sockets.js';
import { FilePersistence, ReportLog } from './persistence.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export function makeLogger(level = process.env.LOG_LEVEL || 'info') {
  const order = { debug: 0, info: 1, error: 2 };
  const on = (l) => order[l] >= (order[level] ?? 1);
  return {
    debug: (...a) => on('debug') && console.log(...a),
    info: (...a) => on('info') && console.log(...a),
    error: (...a) => on('error') && console.error(...a),
  };
}

export async function createServer({ port = Number(process.env.PORT) || 3000, persistFile = process.env.PERSIST_FILE, reportsFile = process.env.REPORTS_FILE || path.join(ROOT, 'data/reports/missing-words.jsonl'), log = makeLogger(), dict = null, bank = null, rates = {} } = {}) {
  // ---- diccionario y sílabas en memoria (se informa cuánto ocupan)
  const heap0 = process.memoryUsage().heapUsed;
  const t0 = Date.now();
  dict = dict || loadDictionary();
  bank = bank || SyllableBank.load();
  const dictMb = (process.memoryUsage().heapUsed - heap0) / 1048576;
  log.info(`Diccionario: ${dict.size.toLocaleString('es-AR')} palabras · ${bank.size} sílabas · ${Date.now() - t0} ms · ~${dictMb.toFixed(0)} MB`);

  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', true);
  app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'same-origin');
    next();
  });
  const server = http.createServer(app);
  const io = new Server(server, { maxHttpBufferSize: 16 * 1024, pingInterval: 10000, pingTimeout: 8000, serveClient: true });

  const manager = new RoomManager({ dict, bank, now: Date.now, log, maxRooms: Number(process.env.MAX_ROOMS) || ROOM_LIMITS.maxRooms });
  const reports = new ReportLog(reportsFile, log);
  attachSockets(io, { manager, reports, log, dict, rates });

  const persistence = new FilePersistence(persistFile, { log });
  if (persistence.enabled) {
    manager.restore(persistence.load());
    persistence.start(() => manager.toJSON());
    log.info(`Persistencia en ${persistence.file} (${manager.rooms.size} salas recuperadas)`);
  }
  const sweeper = setInterval(() => manager.sweep(), 15000);
  sweeper.unref?.();

  // ---- HTTP
  app.get('/healthz', (_req, res) => {
    const mem = process.memoryUsage();
    res.json({
      ok: true, rooms: manager.rooms.size, players: [...manager.rooms.values()].reduce((a, r) => a + r.connectedCount, 0),
      dictionary: dict.size, syllables: bank.size, memoryMb: { rss: Math.round(mem.rss / 1048576), heap: Math.round(mem.heapUsed / 1048576), dictionary: Math.round(dictMb) },
      uptime: Math.round(process.uptime()),
    });
  });
  app.get('/api/salas', (_req, res) => res.json({ rooms: manager.list() }));
  app.get('/sala/:code', (req, res) => res.redirect(`/?sala=${encodeURIComponent(cleanCode(req.params.code))}`));
  // El cliente usa algunos módulos del motor (círculo, constantes, normalización).
  const engineFiles = new Set(['circle.js', 'constants.js', 'normalize.js', 'fuse.js']);
  app.get('/engine/:file', (req, res, next) => (engineFiles.has(req.params.file) ? res.sendFile(path.join(ROOT, 'engine', req.params.file)) : next()));
  app.use(express.static(path.join(ROOT, 'client'), { extensions: ['html'], maxAge: '1h', setHeaders: (res, p) => { if (p.endsWith('.html')) res.setHeader('Cache-Control', 'no-cache'); } }));

  await new Promise((resolve) => server.listen(port, resolve));
  log.info(`wORTbomb escuchando en http://localhost:${server.address().port}`);

  const close = () => new Promise((resolve) => {
    clearInterval(sweeper);
    persistence.stop(() => manager.toJSON());
    for (const r of manager.rooms.values()) r.dispose();
    io.close();
    server.close(() => resolve());
  });
  return { app, server, io, manager, dict, bank, close, port: server.address().port };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const srv = await createServer();
  for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, async () => {
    await srv.close();
    process.exit(0);
  });
  process.on('unhandledRejection', (e) => console.error('[unhandledRejection]', e));
}
