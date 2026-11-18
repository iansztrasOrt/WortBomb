// Ayudas de interfaz: crear elementos (siempre con textContent: nada de HTML del usuario),
// avisos, modales, tema claro/oscuro y almacenamiento seguro.

export const $ = (sel, root = document) => root.querySelector(sel);

export function el(tag, attrs = {}, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === null || v === undefined || v === false) continue;
    if (k === 'class') e.className = v;
    else if (k === 'text') e.textContent = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(e.style, v);
    else if (k.startsWith('on') && typeof v === 'function') e.addEventListener(k.slice(2), v);
    else if (k === 'dataset') Object.assign(e.dataset, v);
    else e.setAttribute(k, v === true ? '' : String(v));
  }
  for (const kid of kids.flat()) if (kid !== null && kid !== undefined && kid !== false) e.append(kid instanceof Node ? kid : document.createTextNode(String(kid)));
  return e;
}

export const store = {
  get(key, def = null) {
    try {
      const v = localStorage.getItem(key);
      return v === null ? def : JSON.parse(v);
    } catch {
      return def;
    }
  },
  set(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch { /* sin almacenamiento */ }
  },
};

// Durante la partida los avisos no flotan sobre la ronda: la pantalla de juego los recibe y los
// muestra en su línea de mensajes (ver setToastSink).
let sink = null;
export function setToastSink(fn) {
  sink = fn;
  if (fn) document.getElementById('toasts').replaceChildren();
}
export function toast(text, { bad = false, ms = 3200 } = {}) {
  if (sink) {
    sink(text, { bad, ms });
    return;
  }
  const t = el('div', { class: `toast${bad ? ' bad' : ''}`, text });
  document.getElementById('toasts').append(t);
  setTimeout(() => t.remove(), ms);
}

export function announce(text) {
  const a = document.getElementById('announcer');
  a.textContent = '';
  requestAnimationFrame(() => { a.textContent = text; });
}

/** Modal accesible: devuelve { close }. Esc o clic afuera cierran. */
export function modal(content, { onClose, label = 'Ventana', dismissable = true } = {}) {
  const prev = document.activeElement;
  const box = el('div', { class: 'overlay', role: 'dialog', 'aria-modal': 'true', 'aria-label': label }, content);
  const close = () => {
    box.remove();
    document.removeEventListener('keydown', onKey);
    onClose?.();
    prev?.focus?.();
  };
  const onKey = (e) => { if (e.key === 'Escape' && dismissable) close(); };
  if (dismissable) box.addEventListener('mousedown', (e) => { if (e.target === box) close(); });
  document.addEventListener('keydown', onKey);
  document.body.append(box);
  setTimeout(() => (box.querySelector('[autofocus]') || box.querySelector('input, button'))?.focus(), 30);
  return { close, box };
}

export function setTheme(theme) {
  if (theme) document.documentElement.dataset.theme = theme;
  else delete document.documentElement.dataset.theme;
  store.set('wortbomb.theme', theme || null);
  try {
    if (theme) localStorage.setItem('wortbomb.theme', theme);
    else localStorage.removeItem('wortbomb.theme');
  } catch { /* nada */ }
}
export function currentTheme() {
  const t = document.documentElement.dataset.theme;
  if (t) return t;
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

/** Resalta la sílaba dentro de una palabra (sin HTML: nodos de texto y <mark>). */
export function highlight(word, syllable) {
  const frag = document.createDocumentFragment();
  if (!word) return frag;
  const plain = (s) => s.normalize('NFD').replace(/ñ/g, '\u0001').replace(/[̀-ͯ]/g, '').replace(/\u0001/g, 'ñ').toLowerCase();
  const i = syllable ? plain(word).indexOf(syllable) : -1;
  if (i < 0) {
    frag.append(word);
    return frag;
  }
  frag.append(word.slice(0, i), el('mark', { text: word.slice(i, i + syllable.length) }), word.slice(i + syllable.length));
  return frag;
}

export const fmtTime = (ms) => {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};
