// Conexión con el servidor (Socket.IO), sesión por token y reloj sincronizado.
// El token se guarda en localStorage; si otra pestaña del mismo navegador ya está jugando con él,
// el servidor le da uno nuevo a esta pestaña (que lo guarda en sessionStorage).

const TOKEN_KEY = 'wortbomb.token';
function readToken() {
  try {
    return sessionStorage.getItem(TOKEN_KEY) || localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export const net = {
  socket: null,
  offset: 0, // serverNow ≈ Date.now() + offset
  rtt: 0,

  connect() {
    // eslint-disable-next-line no-undef
    const socket = io({ auth: { token: readToken() }, transports: ['websocket', 'polling'] });
    this.socket = socket;
    socket.on('session', ({ token, fresh }) => {
      try {
        if (fresh) sessionStorage.setItem(TOKEN_KEY, token);
        else if (!sessionStorage.getItem(TOKEN_KEY)) localStorage.setItem(TOKEN_KEY, token);
        else sessionStorage.setItem(TOKEN_KEY, token);
      } catch { /* nada */ }
      socket.auth = { token };
    });
    socket.on('connect', () => this.sync());
    return socket;
  },

  /** Emite con confirmación (ack) y devuelve una promesa. */
  call(event, data = {}, timeout = 8000) {
    return new Promise((resolve) => {
      if (!this.socket?.connected) {
        resolve({ ok: false, error: 'Sin conexión con el servidor. Reintentando…' });
        return;
      }
      const timer = setTimeout(() => resolve({ ok: false, error: 'El servidor no respondió.' }), timeout);
      this.socket.emit(event, data, (res) => {
        clearTimeout(timer);
        resolve(res || { ok: true });
      });
    });
  },

  /** Estima la diferencia de reloj con el servidor (mejor de 5 mediciones). */
  async sync() {
    let best = null;
    for (let i = 0; i < 5; i += 1) {
      const t0 = Date.now();
      // eslint-disable-next-line no-await-in-loop
      const res = await new Promise((r) => this.socket.emit('time:sync', {}, r));
      const t1 = Date.now();
      const rtt = t1 - t0;
      if (!best || rtt < best.rtt) best = { rtt, offset: res.server - (t0 + rtt / 2) };
    }
    this.offset = best.offset;
    this.rtt = best.rtt;
  },

  serverNow() {
    return Date.now() + this.offset;
  },
};
