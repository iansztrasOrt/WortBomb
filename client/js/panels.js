// Panel lateral: chat (con canal propio para eliminados y espectadores), historial de palabras
// usadas (con buscador, la más reciente arriba) y letras del bonus de alfabeto.
import { el } from './ui.js';
import { t } from './i18n.js';
import { avatarSVG } from './avatar.js';

const ALPHABET = [...'abcdefghijlmnñopqrstuvyz'];

export function createSidePanel(ctx, { tabs = ['chat', 'words', 'letters'], className = 'side' } = {}) {
  const { S } = ctx;
  const root = el('section', { class: className, 'aria-label': 'Panel' });
  const tabBar = el('div', { class: 'tabs', role: 'tablist' });
  const panels = {};
  const badges = {};
  let current = tabs[0];
  const labels = { chat: t('chat'), words: t('words'), letters: t('letters') };
  for (const name of tabs) {
    badges[name] = el('span', { class: 'badge', hidden: true });
    const b = el('button', { type: 'button', role: 'tab', 'aria-selected': String(name === current), id: `tab-${name}`, onclick: () => select(name) }, labels[name], badges[name]);
    tabBar.append(b);
  }
  root.append(tabBar);

  // ---- chat
  const chatLog = el('ul', { class: 'chat-log', 'aria-live': 'polite', 'aria-label': 'Mensajes' });
  const chatInput = el('input', { class: 'input', maxlength: 200, placeholder: t('chatPh'), 'aria-label': 'Mensaje de chat', autocomplete: 'off' });
  const channelNote = el('div', { class: 'channel-note', text: t('deadChannel'), hidden: true });
  const chatForm = el('form', {
    class: 'chat-form',
    onsubmit: async (e) => {
      e.preventDefault();
      const text = chatInput.value.trim();
      if (!text) return;
      chatInput.value = '';
      const res = await ctx.net.call('chat:send', { text });
      if (res && res.ok === false && res.error) ctx.toast(res.error, { bad: true });
    },
  }, chatInput, el('button', { class: 'btn small', type: 'submit', text: '↵', 'aria-label': 'Enviar mensaje' }));
  panels.chat = el('div', { class: 'tabpanel', role: 'tabpanel', 'aria-labelledby': 'tab-chat' }, el('div', { style: { display: 'grid', gridTemplateRows: 'auto minmax(0,1fr)', minHeight: 0 } }, channelNote, chatLog), chatForm);

  // ---- palabras
  const search = el('input', { class: 'input', type: 'search', placeholder: t('searchWords'), 'aria-label': t('searchWords'), oninput: () => renderWords() });
  const wordsList = el('ul', { class: 'words-list', 'aria-label': 'Palabras usadas' });
  const wordsCount = el('div', { class: 'small muted', style: { padding: '0 10px 8px' } });
  panels.words = el('div', { class: 'tabpanel', role: 'tabpanel', 'aria-labelledby': 'tab-words', hidden: true, style: { gridTemplateRows: 'auto auto minmax(0,1fr)' } },
    el('div', { class: 'words-search' }, search), wordsCount, wordsList);

  // ---- letras
  const lettersBox = el('div', { class: 'letters', 'aria-label': 'Letras del bonus' });
  const lettersNote = el('p', { class: 'letters-note' });
  panels.letters = el('div', { class: 'tabpanel', role: 'tabpanel', 'aria-labelledby': 'tab-letters', hidden: true, style: { gridTemplateRows: 'auto auto' } }, lettersBox, lettersNote);

  for (const name of tabs) root.append(panels[name]);

  function select(name) {
    current = name;
    for (const b of tabBar.children) b.setAttribute('aria-selected', String(b.id === `tab-${name}`));
    for (const [n, p] of Object.entries(panels)) p.hidden = n !== name;
    badges[name].hidden = true;
    badges[name].textContent = '';
    if (name === 'chat') chatLog.scrollTop = chatLog.scrollHeight;
  }
  function bump(name) {
    if (current === name || !badges[name]) return;
    badges[name].hidden = false;
    badges[name].textContent = String(Number(badges[name].textContent || 0) + 1);
  }

  const memberColor = (id) => S.room?.members.find((m) => m.id === id)?.avatar?.color;
  function chatItem(m) {
    if (m.system) return el('li', { class: 'sys', text: m.text });
    return el('li', { class: m.channel === 'dead' ? 'dead' : '' }, m.channel === 'dead' ? '👻 ' : '', el('b', { text: `${m.from.name}: `, style: { color: m.from.color } }), m.text);
  }
  function renderChat() {
    const dead = ctx.isDead();
    channelNote.hidden = !dead;
    const items = [...(S.room?.chat.main || []).map((m) => ({ ...m, channel: 'main' })), ...(dead || S.room?.status !== 'playing' ? (S.room?.chat.dead || []).map((m) => ({ ...m, channel: 'dead' })) : [])]
      .sort((a, b) => a.at - b.at).slice(-120);
    chatLog.replaceChildren(...items.map(chatItem));
    chatLog.scrollTop = chatLog.scrollHeight;
  }
  function addChat(m) {
    const atBottom = chatLog.scrollHeight - chatLog.scrollTop - chatLog.clientHeight < 40;
    chatLog.append(chatItem(m));
    if (atBottom) chatLog.scrollTop = chatLog.scrollHeight;
    if (!m.system) bump('chat');
  }

  function renderWords(fresh = null) {
    const g = S.room?.game;
    const used = g?.used || [];
    const q = search.value.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    const list = q ? used.filter((u) => u.word.includes(q)) : used;
    wordsCount.textContent = `${g?.usedCount ?? used.length} ${used.length === 1 ? 'palabra usada' : 'palabras usadas'} · no se pueden repetir`;
    if (!list.length) {
      wordsList.replaceChildren(el('li', { class: 'muted', text: q ? 'Ninguna coincide.' : t('noWords'), style: { background: 'none' } }));
      return;
    }
    wordsList.replaceChildren(...list.slice(0, 400).map((u) => {
      const m = S.room.members.find((x) => x.id === u.by) || g.seats.find((x) => x.id === u.by);
      return el('li', { class: fresh && fresh === u.word ? 'new' : '' }, m ? avatarSVG(m.avatar, { size: 24 }) : '', u.word, el('span', { class: 'by', text: u.name, style: { color: memberColor(u.by) } }));
    }));
  }

  function renderLetters() {
    const g = S.room?.game;
    const seat = g?.seats.find((s) => s.id === S.room.you);
    const remaining = new Set(seat ? seat.remaining : ALPHABET);
    lettersBox.replaceChildren(...ALPHABET.map((l) => el('span', { class: remaining.has(l) ? '' : 'done', text: l, 'aria-label': `${l}${remaining.has(l) ? '' : ' tachada'}` })));
    lettersNote.textContent = seat ? t('lettersNote', { max: g.settings.maxLives }) : 'Las letras del bonus aparecen cuando jugás.';
  }
  function popLetters(crossed) {
    for (const span of lettersBox.children) if (crossed.includes(span.textContent)) span.classList.add('pop');
  }

  if (tabs.includes('letters')) renderLetters();
  return { el: root, renderChat, addChat, renderWords, renderLetters, popLetters, select, bumpWords: () => bump('words'), focusChat: () => chatInput.focus() };
}
