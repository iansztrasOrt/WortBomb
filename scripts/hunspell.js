// Expansor de diccionarios hunspell (.aff + .dic) escrito en JavaScript, sin dependencias.
// Hace lo mismo que la herramienta "unmunch": genera todas las formas que el diccionario
// acepta (plurales, femeninos, conjugaciones, pronombres enclíticos...), incluidos los
// sufijos encadenados ("twofold") y la combinación prefijo + sufijo.

/** Lee las reglas PFX/SFX de un .aff. Soporta FLAG UTF-8 (un carácter por bandera). */
export function parseAff(text) {
  const rules = new Map();
  const lines = text.split(/\r?\n/);
  let flagMode = 'char';
  for (let i = 0; i < lines.length; i += 1) {
    const parts = lines[i].trim().split(/\s+/);
    if (parts[0] === 'FLAG') flagMode = parts[1] === 'long' ? 'long' : parts[1] === 'num' ? 'num' : 'char';
    if ((parts[0] === 'PFX' || parts[0] === 'SFX') && parts.length >= 4 && /^\d+$/.test(parts[3])) {
      const [type, flag, cross, count] = parts;
      const entries = [];
      for (let j = 1; j <= Number(count); j += 1) {
        const p = (lines[i + j] || '').trim().split(/\s+/);
        if (p[0] !== type || p[1] !== flag) continue;
        let strip = p[2];
        const addRaw = p[3] ?? '0';
        const cond = p[4] ?? '.';
        if (strip === '0') strip = '';
        const slash = addRaw.indexOf('/');
        let add = slash >= 0 ? addRaw.slice(0, slash) : addRaw;
        const cont = slash >= 0 ? splitFlags(addRaw.slice(slash + 1), flagMode) : [];
        if (add === '0') add = '';
        const re = cond === '.' ? null : new RegExp(type === 'SFX' ? `${cond}$` : `^${cond}`, 'u');
        entries.push({ strip, add, cont, re });
      }
      rules.set(flag, { type, cross: cross === 'Y', entries });
      i += Number(count);
    }
  }
  return { rules, flagMode };
}

export function splitFlags(s, mode = 'char') {
  if (!s) return [];
  if (mode === 'long') return s.match(/../g) || [];
  if (mode === 'num') return s.split(',');
  return [...s];
}

function applySfx(rules, word, flag, out, depth) {
  const r = rules.get(flag);
  if (!r || r.type !== 'SFX') return [];
  const made = [];
  for (const e of r.entries) {
    if (e.strip && !word.endsWith(e.strip)) continue;
    if (e.re && !e.re.test(word)) continue;
    const w = word.slice(0, word.length - e.strip.length) + e.add;
    out.add(w);
    made.push([w, r.cross]);
    if (depth < 2) {
      for (const c of e.cont) {
        const cr = rules.get(c);
        if (cr?.type === 'SFX') applySfx(rules, w, c, out, depth + 1);
        else if (cr?.type === 'PFX') applyPfx(rules, w, c, out);
      }
    }
  }
  return made;
}

function applyPfx(rules, word, flag, out) {
  const r = rules.get(flag);
  if (!r || r.type !== 'PFX') return [];
  const made = [];
  for (const e of r.entries) {
    if (e.strip && !word.startsWith(e.strip)) continue;
    if (e.re && !e.re.test(word)) continue;
    const w = e.add + word.slice(e.strip.length);
    out.add(w);
    made.push(w);
  }
  return made;
}

/** Agrega a `out` todas las formas de una entrada del .dic. */
export function expandEntry(aff, word, flagString, out = new Set()) {
  const { rules, flagMode } = aff;
  out.add(word);
  const flags = splitFlags(flagString, flagMode);
  const crossSfx = [];
  for (const f of flags) {
    if (rules.get(f)?.type !== 'SFX') continue;
    for (const [w, cross] of applySfx(rules, word, f, out, 1)) if (cross) crossSfx.push(w);
  }
  for (const f of flags) {
    const r = rules.get(f);
    if (r?.type !== 'PFX') continue;
    applyPfx(rules, word, f, out);
    if (r.cross) for (const w of crossSfx) applyPfx(rules, w, f, out);
  }
  return out;
}

/** Recorre un .dic: devuelve [{ word, flags }]. */
export function parseDic(text) {
  const lines = text.split(/\r?\n/);
  const out = [];
  for (let i = 1; i < lines.length; i += 1) {
    const line = lines[i];
    if (!line || line.startsWith('#')) continue;
    const token = line.split(/[\t ]/)[0];
    // La barra separa palabra y banderas (una barra escapada "\/" no aparece en español).
    const slash = token.indexOf('/');
    const word = slash >= 0 ? token.slice(0, slash) : token;
    const flags = slash >= 0 ? token.slice(slash + 1) : '';
    if (word) out.push({ word, flags });
  }
  return out;
}
