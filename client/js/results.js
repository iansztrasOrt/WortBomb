// Pantalla final: podio animado, estadísticas por jugador y revancha.
import { el, modal, fmtTime } from './ui.js';
import { t } from './i18n.js';
import { avatarSVG } from './avatar.js';
import { audio } from './audio.js';

export function showResults(ctx, results) {
  const { S } = ctx;
  const leader = S.room.leaderId === S.room.you;
  const r = results;
  const won = r.winner?.id === S.room.you;
  const top = [r.ranking.find((x) => x.place === 2), r.ranking.find((x) => x.place === 1), r.ranking.find((x) => x.place === 3)];
  const podium = el('div', { class: 'podium', 'aria-label': 'Podio' }, ...top.map((p, i) => {
    const place = [2, 1, 3][i];
    if (!p) return el('div', { class: `step p${place}` });
    return el('div', { class: `step p${place}` }, avatarSVG(p.avatar, { size: place === 1 ? 92 : 70, title: p.name }), el('span', { class: 'nm', text: p.name }), el('div', { class: 'block', text: place }));
  }));
  const fmtAvg = (ms) => (ms ? `${(ms / 1000).toFixed(1)} s` : '—');
  const rows = r.ranking.map((p) => el('tr', {},
    el('td', { text: p.place ?? '—' }), el('td', {}, el('b', { text: p.name })), el('td', { text: p.stats.words }), el('td', { text: p.stats.longest || '—' }),
    el('td', { text: fmtAvg(p.stats.avgMs) }), el('td', { text: p.stats.livesGained }), el('td', { text: p.stats.explosions }), el('td', { text: p.stats.repeats })));
  const table = el('div', { class: 'table-wrap' }, el('table', { class: 'stats-table' },
    el('thead', {}, el('tr', {}, ...['#', 'Jugador', 'Palabras', 'Más larga', 'Tiempo medio', 'Vidas ganadas', 'Explosiones', 'Intentos repetidos'].map((h) => el('th', { scope: 'col', text: h })))),
    el('tbody', {}, ...rows)));
  const me = S.room.members.find((m) => m.id === S.room.you);
  const again = leader
    ? el('button', { class: 'btn go big', type: 'button', text: t('rematch'), onclick: async () => { const res = await ctx.net.call('room:start'); if (!res.ok) ctx.toast(res.error, { bad: true }); } })
    : el('button', { class: `btn ${me?.ready ? 'go' : 'violet'} big`, type: 'button', text: me?.ready ? '✓ Listo' : t('rematchReady'), onclick: async (e) => { await ctx.net.call('room:ready', { ready: true }); e.target.textContent = '✓ Listo'; e.target.className = 'btn go big'; } });
  const card = el('div', { class: 'card results' },
    el('div', { class: 'row', style: { justifyContent: 'space-between' } },
      el('h2', { text: r.winner ? `🏆 ${t('winner', { name: r.winner.name })} ${r.byAbandon ? t('byAbandon') : ''}` : 'Terminó la partida' }),
      el('button', { class: 'btn icon ghost', type: 'button', text: '✕', 'aria-label': t('backRoom'), onclick: () => m.close() })),
    podium,
    el('div', { class: 'row', style: { justifyContent: 'center' } },
      el('span', { class: 'pill', text: `⏱️ ${t('duration')}: ${fmtTime(r.durationMs)}` }),
      el('span', { class: 'pill hot', text: `🔥 ${t('maxDanger')}: ${r.maxLevel}/10` }),
      el('span', { class: 'pill good', text: `📝 ${t('wordsUsed')}: ${r.words}` }),
      r.sudden ? el('span', { class: 'pill hot', text: '💀 Llegaron a la muerte súbita' }) : null),
    table,
    el('div', { class: 'row', style: { justifyContent: 'center' } }, again, el('button', { class: 'btn', type: 'button', text: t('backRoom'), onclick: () => m.close() })),
    leader ? null : el('p', { class: 'muted small', style: { textAlign: 'center' }, text: 'El líder arranca la revancha. Se reinicia el reloj y las palabras usadas.' }));
  const m = modal(card, { label: 'Resultados' });
  if (won) {
    audio.win();
    confetti();
  }
  return m;
}

function confetti() {
  const box = el('div', { class: 'confetti', 'aria-hidden': 'true' });
  const colors = ['#ff5a3c', '#ffc83d', '#3ddc97', '#7b5cff', '#4d96ff', '#f15bb5'];
  for (let i = 0; i < 90; i += 1) {
    const c = el('i');
    c.style.left = `${Math.random() * 100}%`;
    c.style.background = colors[i % colors.length];
    c.style.animationDuration = `${2.2 + Math.random() * 2}s`;
    c.style.animationDelay = `${Math.random() * 0.8}s`;
    box.append(c);
  }
  document.body.append(box);
  setTimeout(() => box.remove(), 5000);
}
