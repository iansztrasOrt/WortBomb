// Pantalla de inicio: apodo, avatar, jugar rápido, crear sala, unirse con código y salas públicas.
import { el, modal, toast } from './ui.js';
import { t } from './i18n.js';
import { avatarSVG, AVATAR_OPTIONS, FACE_LABEL, ACC_LABEL, randomAvatar } from './avatar.js';
import { heroBomb } from './bomb.js';
import { loadStats } from './profile.js';
import { openTutorial } from './tutorial.js';

export function mountHome(app, ctx) {
  const { profile } = ctx;
  const root = el('main', { class: 'home' });

  // ---- héroe
  const stats = loadStats();
  const hero = el('section', { class: 'hero' },
    el('div', { class: 'row', style: { gap: '18px', alignItems: 'center' } }, heroBomb(),
      el('h1', { class: 'logo', 'aria-label': 'wORTbomb' }, el('span', { class: 'w', text: 'w' }), el('span', { class: 'ort', text: 'ORT' }), el('span', { class: 'bomb-word', text: 'bomb' }))),
    el('p', { class: 'tag', text: t('tagline') }),
    el('div', { class: 'row' },
      el('span', { class: 'pill hot', text: '💣 la mecha se acorta' }),
      el('span', { class: 'pill hot', text: '💀 muerte súbita' }),
      el('span', { class: 'pill', text: '🚫 no se repiten palabras' }),
      el('span', { class: 'pill good', text: '✨ sin tildes, todo vale igual' })),
    stats.games ? el('div', { class: 'stats-mini', 'aria-label': 'Tus estadísticas' },
      el('span', {}, el('b', { text: stats.games }), 'partidas'), el('span', {}, el('b', { text: stats.wins }), 'victorias'),
      el('span', {}, el('b', { text: stats.bestStreak }), 'mejor racha'), stats.longest ? el('span', {}, el('b', { text: stats.longest }), 'palabra más larga') : null) : null,
    el('div', { class: 'row' }, el('button', { class: 'btn violet', type: 'button', text: `📖 ${t('howTo')} · ver tutorial`, onclick: () => openTutorial() })));

  // ---- perfil
  const nick = el('input', { class: 'input', id: 'nick', maxlength: 16, placeholder: t('nickPh'), value: profile.name, autocomplete: 'nickname', 'aria-label': t('nick') });
  const preview = el('div', { class: 'preview' });
  const colorRow = el('div', { class: 'swatches', role: 'group', 'aria-label': 'Color' });
  const faceRow = el('div', { class: 'opt-row', role: 'group', 'aria-label': 'Carita' });
  const accRow = el('div', { class: 'opt-row', role: 'group', 'aria-label': 'Accesorio' });
  function drawAvatar() {
    preview.replaceChildren(avatarSVG(profile.avatar, { size: 112, title: 'Tu avatar' }));
    for (const b of colorRow.children) b.setAttribute('aria-pressed', String(b.dataset.v === profile.avatar.color));
    for (const b of faceRow.children) b.setAttribute('aria-pressed', String(b.dataset.v === profile.avatar.face));
    for (const b of accRow.children) b.setAttribute('aria-pressed', String(b.dataset.v === profile.avatar.accessory));
    ctx.saveProfile();
  }
  for (const c of AVATAR_OPTIONS.colors) colorRow.append(el('button', { type: 'button', class: 'swatch', style: { background: c }, dataset: { v: c }, 'aria-label': `Color ${c}`, onclick: () => { profile.avatar.color = c; drawAvatar(); } }));
  for (const f of AVATAR_OPTIONS.faces) faceRow.append(el('button', { type: 'button', class: 'opt', dataset: { v: f }, text: FACE_LABEL[f], onclick: () => { profile.avatar.face = f; drawAvatar(); } }));
  for (const a of AVATAR_OPTIONS.accessories) accRow.append(el('button', { type: 'button', class: 'opt', dataset: { v: a }, text: ACC_LABEL[a], onclick: () => { profile.avatar.accessory = a; drawAvatar(); } }));
  nick.addEventListener('input', () => {
    profile.name = nick.value;
    ctx.saveProfile();
  });

  const needName = () => {
    profile.name = nick.value.trim();
    if (!profile.name) {
      toast('Elegí un apodo primero 🙂', { bad: true });
      nick.focus();
      return false;
    }
    ctx.saveProfile();
    return true;
  };

  const code = el('input', { class: 'input code-input', maxlength: 5, placeholder: t('codePh'), 'aria-label': 'Código de sala', value: ctx.pendingCode || '', autocomplete: 'off', spellcheck: 'false' });
  code.addEventListener('input', () => { code.value = code.value.toUpperCase().replace(/[^A-Z0-9]/g, ''); });
  const busy = (btn, fn) => async () => {
    if (!needName()) return;
    btn.disabled = true;
    try {
      await fn();
    } finally {
      btn.disabled = false;
    }
  };
  const quickBtn = el('button', { class: 'btn primary big', type: 'button', text: t('quick') });
  quickBtn.onclick = busy(quickBtn, () => ctx.actions.quick());
  const createBtn = el('button', { class: 'btn violet', type: 'button', text: `＋ ${t('create')}` });
  createBtn.onclick = () => { if (needName()) openCreate(ctx); };
  const joinBtn = el('button', { class: 'btn go', type: 'submit', text: t('join') });
  const joinForm = el('form', { class: 'join-row', onsubmit: (e) => { e.preventDefault(); busy(joinBtn, () => ctx.actions.join(code.value))(); } }, code, joinBtn);

  const roomsList = el('div', { class: 'rooms-list', 'aria-live': 'polite' });
  async function refresh() {
    const res = await ctx.net.call('lobby:list');
    if (!root.isConnected) return;
    const rooms = res.rooms || [];
    roomsList.replaceChildren(...(rooms.length ? rooms.map((r) => el('button', {
      type: 'button', class: 'room-row', onclick: () => { code.value = r.code; if (needName()) ctx.actions.join(r.code); },
    }, el('span', {}, el('strong', { text: r.name }), el('br'), el('span', { class: 'small muted', text: `${r.leader ? `👑 ${r.leader}` : ''}${r.hasPassword ? ' · 🔒' : ''}` })),
    el('span', { class: `pill ${r.status === 'lobby' ? 'good' : 'hot'}`, text: r.status === 'lobby' ? t('waiting') : r.status === 'playing' ? t('playing') : t('results') }),
    el('b', { text: `${r.players}/${r.max}` }))) : [el('p', { class: 'muted small', text: t('noRooms') })]));
  }
  const timer = setInterval(refresh, 5000);
  refresh();

  const card = el('section', { class: 'card profile-card', 'aria-label': 'Tu perfil y salas' },
    el('label', { class: 'field', for: 'nick' }, t('nick'), nick),
    el('div', { class: 'field' }, t('avatar'),
      el('div', { class: 'avatar-editor' }, preview, el('div', { class: 'stack', style: { gap: '8px' } }, colorRow, faceRow, accRow,
        el('button', { class: 'btn small ghost', type: 'button', text: '🎲 Al azar', onclick: () => { profile.avatar = randomAvatar(); drawAvatar(); } })))),
    quickBtn,
    el('div', { class: 'row' }, createBtn, el('span', { class: 'muted small', text: 'o' }), el('div', { class: 'grow' }, joinForm)),
    el('div', { class: 'row', style: { justifyContent: 'space-between' } }, el('h3', { text: t('publicRooms') }), el('button', { class: 'btn small ghost', type: 'button', text: '↻', 'aria-label': 'Actualizar', onclick: refresh })),
    roomsList);

  root.append(hero, card);
  app.replaceChildren(ctx.topbar({ home: true }), root);
  drawAvatar();
  if (ctx.pendingCode) code.focus();
  else if (!profile.name) nick.focus();
  return { unmount: () => clearInterval(timer) };
}

function openCreate(ctx) {
  const name = el('input', { class: 'input', maxlength: 28, value: `Sala de ${ctx.profile.name}`.slice(0, 28), autofocus: true });
  const isPublic = el('input', { type: 'checkbox', checked: true });
  const pass = el('input', { class: 'input', maxlength: 24, placeholder: 'Sin contraseña', autocomplete: 'off' });
  const max = el('select', {}, ...Array.from({ length: 15 }, (_, i) => el('option', { value: i + 2, text: `${i + 2} jugadores`, selected: i + 2 === 8 })));
  const go = el('button', { class: 'btn primary big', type: 'submit', text: 'Crear sala' });
  const form = el('form', {
    class: 'card modal',
    onsubmit: async (e) => {
      e.preventDefault();
      go.disabled = true;
      const ok = await ctx.actions.create({ name: name.value, isPublic: isPublic.checked, password: pass.value, maxPlayers: Number(max.value) });
      go.disabled = false;
      if (ok) m.close();
    },
  },
  el('div', { class: 'modal-head' }, el('h2', { text: 'Crear sala' }), el('button', { class: 'btn icon ghost', type: 'button', text: '✕', 'aria-label': 'Cerrar', onclick: () => m.close() })),
  el('label', { class: 'field' }, 'Nombre de la sala', name),
  el('div', { class: 'row' }, el('label', { class: 'field grow' }, 'Máximo de jugadores', max), el('label', { class: 'field grow' }, 'Contraseña (opcional)', pass)),
  el('label', { class: 'check' }, isPublic, 'Pública: aparece en la lista de salas'),
  go);
  const m = modal(form, { label: 'Crear sala' });
}
