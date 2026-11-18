// Sala de espera: jugadores en vivo, "listo", ajustes del líder, reglas, chat y votaciones.
import { el, toast } from './ui.js';
import { t } from './i18n.js';
import { avatarSVG } from './avatar.js';
import { createSidePanel } from './panels.js';
import { openTutorial } from './tutorial.js';

export const RULES = [
  ['Pasá la bomba', 'En tu turno aparece una sílaba (como "ion" o "tr"). Escribí una palabra que la contenga y apretá Enter antes de que explote. No hace falta tocar nada: cuando te toca, ya podés escribir.'],
  ['No se repite NADA', 'Una palabra aceptada no la puede volver a usar nadie en toda la partida: ni vos ni los demás. Tampoco cambiándole tildes o mayúsculas. Si lo intentás, la mecha sigue corriendo (pero no perdés vida).'],
  ['Si te explota', 'Perdés una vida y la bomba pasa al siguiente CON LA MISMA SÍLABA. Si él tampoco la sabe, recién ahí sale una sílaba nueva. Sin vidas, quedás eliminado y mirás desde la tribuna. Gana el último que queda.'],
  ['La mecha se acorta', 'De a poco, de dos formas: con el tiempo de partida (un 5 % menos por minuto) y cada vez que alguien pierde una vida (un 3 % menos; un poco más si queda eliminado). Mirá el nivel de peligro arriba.'],
  ['Muerte súbita', 'Si la partida se alarga, aparece una cuenta regresiva. Cuando llega a cero, la pantalla se pone roja: todos quedan con 1 vida y la bomba va el doble de rápido.'],
  ['Bonus de alfabeto', 'Cada palabra tacha sus letras. Completá todas y ganás una vida extra (hasta el máximo; en muerte súbita no).'],
  ['Sin tildes', '"canción" y "cancion" valen igual. Se aceptan plurales, femeninos, conjugaciones, voseo y regionalismos.'],
];
export function rulesList(settings) {
  return el('ol', { class: 'rules-list' }, ...RULES.map(([title, text], i) => {
    let body = text;
    if (settings && i === 3) body = `De a poco, de dos formas: con el tiempo de partida (un 5 % menos por minuto) y cada vez que alguien pierde una vida (un 3 % menos; un poco más si queda eliminado). Empieza en ${settings.fuseInitial} s y nunca baja de ${settings.fuseMin} s.`;
    if (settings && i === 4) body = settings.suddenDeathMinutes > 0
      ? `A los ${settings.suddenDeathMinutes} minutos de partida (con cuenta regresiva el último minuto) la pantalla se pone roja: todos quedan con 1 vida y la bomba va el doble de rápido.`
      : 'En esta sala está desactivada.';
    if (settings && i === 5) body = `Cada palabra tacha sus letras. Completá todas y ganás una vida extra (hasta ${settings.maxLives}; en muerte súbita no).`;
    return el('li', {}, el('strong', { text: `${title}: ` }), body);
  }));
}

const SETTING_FIELDS = [
  ['startLives', 'Vidas por jugador', 1, 10],
  ['maxLives', 'Vidas máximas (bonus)', 1, 10],
  ['minWordLength', 'Largo mínimo de palabra', 2, 8],
  ['minSyllableWords', 'Palabras mínimas por sílaba', 1, 50],
  ['fuseInitial', 'Mecha inicial (s)', 4, 30],
  ['fuseMin', 'Mecha mínima (s)', 2, 10],
  ['suddenDeathMinutes', 'Muerte súbita a los (min, 0 = nunca)', 0, 30],
];

export function mountLobby(app, ctx) {
  const { S } = ctx;
  const root = el('main', { class: 'lobby' });
  const main = el('div', { class: 'lobby-main' });
  const header = el('div', { class: 'card stack' });
  const playersCard = el('section', { class: 'card stack', 'aria-label': t('players') });
  const settingsCard = el('section', { class: 'card stack', 'aria-label': t('settings') });
  const rulesCard = el('section', { class: 'card stack', 'aria-label': t('rules') });
  const votesBox = el('div', { class: 'stack' });
  main.append(header, votesBox, playersCard, settingsCard, rulesCard);
  const side = createSidePanel(ctx, { tabs: ['chat'] });
  root.append(main, side.el);
  app.replaceChildren(ctx.topbar({}), root);

  function renderHeader() {
    const r = S.room;
    const me = r.members.find((m) => m.id === r.you);
    const leader = r.leaderId === r.you;
    const connected = r.members.filter((m) => m.connected).length;
    const startBtn = el('button', { class: 'btn go big', type: 'button', text: t('start'), disabled: connected < 2, onclick: async () => {
      const res = await ctx.net.call('room:start');
      if (!res.ok) toast(res.error, { bad: true });
    } });
    const readyBtn = el('button', { class: `btn ${me?.ready ? 'go' : ''}`, type: 'button', text: me?.ready ? `✓ ${t('ready')}` : '¿Listo?', 'aria-pressed': String(Boolean(me?.ready)),
      onclick: () => ctx.net.call('room:ready', { ready: !me?.ready }) });
    header.replaceChildren(
      el('div', { class: 'row', style: { justifyContent: 'space-between' } },
        el('div', {}, el('h2', { text: r.name }), el('p', { class: 'muted small', text: `${r.isPublic ? 'Pública' : 'Privada'}${r.hasPassword ? ' · 🔒 con contraseña' : ''} · ${r.members.length}/${r.maxPlayers} jugadores` })),
        el('div', { class: 'row' }, el('button', { class: 'btn ghost', type: 'button', text: '📖 Tutorial', onclick: () => openTutorial() }), readyBtn,
          leader ? startBtn : el('span', { class: 'pill', text: '👑 El líder empieza la partida' }))),
      leader && connected < 2 ? el('p', { class: 'muted small', text: 'Hacen falta al menos 2 jugadores. Pasales el código o el link.' }) : null);
  }

  function renderPlayers() {
    const r = S.room;
    const leader = r.leaderId === r.you;
    const grid = el('div', { class: 'players-grid' });
    for (const m of r.members) {
      const vote = r.votes.find((v) => v.targetId === m.id);
      grid.append(el('div', { class: `pcard${m.id === r.you ? ' me' : ''}${m.connected ? '' : ' off'}` },
        m.leader ? el('span', { class: 'crown', title: 'Líder', text: '👑' }) : null,
        avatarSVG(m.avatar, { size: 64, title: m.name }),
        el('span', { class: 'nm', text: m.name }),
        el('span', { class: `pill ${m.ready ? 'good' : ''}`, text: m.connected ? (m.ready ? `✓ ${t('ready')}` : t('notReady')) : 'desconectado' }),
        m.id !== r.you ? el('div', { class: 'actions' },
          leader ? el('button', { class: 'btn small ghost', type: 'button', text: 'Expulsar', onclick: () => confirmKick(m) }) : null,
          !vote ? el('button', { class: 'btn small ghost', type: 'button', text: 'Votar', title: 'Proponer expulsarlo', onclick: async () => {
            const res = await ctx.net.call('vote:kick', { playerId: m.id });
            if (!res.ok) toast(res.error, { bad: true });
          } }) : null) : null));
    }
    playersCard.replaceChildren(el('h3', { text: `${t('players')} (${r.members.length})` }), grid);
  }

  async function confirmKick(m) {
    if (!window.confirm(`¿Expulsar a ${m.name} de la sala?`)) return;
    const res = await ctx.net.call('room:kick', { playerId: m.id });
    if (!res.ok) toast(res.error, { bad: true });
  }

  function renderSettings() {
    const r = S.room;
    const leader = r.leaderId === r.you;
    const fields = SETTING_FIELDS.map(([key, label, lo, hi]) => el('label', { class: 'field' }, label,
      el('input', { class: 'input', type: 'number', min: lo, max: hi, value: r.settings[key], disabled: !leader, dataset: { key } })));
    const name = el('input', { class: 'input', maxlength: 28, value: r.name, disabled: !leader });
    const max = el('input', { class: 'input', type: 'number', min: 2, max: 16, value: r.maxPlayers, disabled: !leader });
    const pub = el('input', { type: 'checkbox', checked: r.isPublic, disabled: !leader });
    const filter = el('input', { type: 'checkbox', checked: r.filterChat, disabled: !leader });
    const pass = el('input', { class: 'input', maxlength: 24, placeholder: r.hasPassword ? '(tiene contraseña: escribí una nueva o dejá vacío)' : 'Sin contraseña', disabled: !leader });
    const save = el('button', { class: 'btn violet', type: 'button', text: 'Guardar ajustes', hidden: !leader, onclick: async () => {
      const settings = {};
      for (const inp of settingsCard.querySelectorAll('input[data-key]')) settings[inp.dataset.key] = Number(inp.value);
      const patch = { settings, name: name.value, maxPlayers: Number(max.value), isPublic: pub.checked, filterChat: filter.checked };
      if (pass.value || !r.hasPassword) patch.password = pass.value;
      const res = await ctx.net.call('room:settings', patch);
      toast(res.ok ? 'Ajustes guardados.' : res.error, { bad: !res.ok });
    } });
    settingsCard.replaceChildren(
      el('div', { class: 'row', style: { justifyContent: 'space-between' } }, el('h3', { text: t('settings') }), leader ? null : el('span', { class: 'small muted', text: 'Solo el líder los cambia.' })),
      el('div', { class: 'settings-grid' }, el('label', { class: 'field' }, 'Nombre', name), el('label', { class: 'field' }, 'Jugadores máx.', max), ...fields, el('label', { class: 'field' }, 'Contraseña', pass)),
      el('div', { class: 'row' }, el('label', { class: 'check' }, pub, 'Sala pública'), el('label', { class: 'check' }, filter, 'Filtrar insultos en el chat')),
      save);
  }

  function renderRules() {
    rulesCard.replaceChildren(el('h3', { text: t('rules') }), el('p', { class: 'hl-rule', text: '🚫 Regla de oro: ninguna palabra se puede repetir en toda la partida. 💣 La mecha se acorta con el tiempo y con cada vida perdida. 💀 Y si dura mucho: muerte súbita.' }), rulesList(S.room.settings));
  }

  function renderVotes() {
    const r = S.room;
    votesBox.replaceChildren(...r.votes.map((v) => el('div', { class: 'vote-bar', role: 'status' },
      `🗳️ ¿Expulsar a ${v.target}? (${v.yes} sí · ${v.no} no · hacen falta ${v.needed})`,
      v.targetId !== r.you ? el('button', { class: 'btn small', type: 'button', text: 'Sí', onclick: () => ctx.net.call('vote:cast', { voteId: v.id, yes: true }) }) : null,
      v.targetId !== r.you ? el('button', { class: 'btn small ghost', type: 'button', text: 'No', onclick: () => ctx.net.call('vote:cast', { voteId: v.id, yes: false }) }) : null)));
  }

  const update = (what = 'all') => {
    if (!S.room) return;
    if (what === 'all' || what === 'members') {
      renderHeader();
      renderPlayers();
    }
    if (what === 'all' || what === 'settings') {
      renderSettings();
      renderRules();
      renderHeader();
    }
    if (what === 'all' || what === 'votes') {
      renderVotes();
      renderPlayers();
    }
    if (what === 'all' || what === 'chat') side.renderChat();
  };
  update('all');
  return { update, addChat: (m) => side.addChat(m), unmount() {} };
}
