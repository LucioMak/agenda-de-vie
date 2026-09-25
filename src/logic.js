// État, résolution des journées, rattrapage et bilan.
import {
  defaultTemplate, defaultSettings, CATCHUP_CATS, uid,
  toMin, ymd, addDays, wd, at, mondayOf,
} from './data.js';

const KEY = 'agendaDeVie.v1';
let listeners = [];
export let S = load();

function fresh() {
  return { version: 1, installed: ymd(new Date()), template: defaultTemplate(), overrides: {}, log: {}, catchups: [], settings: defaultSettings() };
}

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const s = JSON.parse(raw);
      s.settings = { ...defaultSettings(), ...(s.settings || {}) };
      s.installed ||= ymd(new Date()); s.overrides ||= {}; s.log ||= {}; s.catchups ||= [];
      return s;
    }
  } catch (e) { /* stockage indisponible : on repart de zéro */ }
  const f = fresh();
  try { localStorage.setItem(KEY, JSON.stringify(f)); } catch (e) { /* ignore */ }
  return f;
}

export function save() {
  try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { /* ignore */ }
  listeners.forEach((f) => f());
}
export const onChange = (f) => listeners.push(f);
export function replaceState(obj) {
  const base = fresh();
  S = { ...base, ...obj, installed: obj.installed || base.installed, settings: { ...base.settings, ...(obj.settings || {}) } };
  save();
}
export function resetAll() { S = fresh(); save(); }

export const today = () => ymd(new Date());
export const key = (ds, b) => `${ds}|${b.id}`;

// ---- Journées ----
export function baseBlocks(ds) {
  const ov = S.overrides[ds];
  return ov ? ov.blocks : S.template[wd(ds)];
}

export function resolveDay(ds) {
  const blocks = baseBlocks(ds).map((b) => ({ ...b }));
  for (const c of S.catchups) {
    if (c.status === 'planned' && c.date === ds) {
      const t = blocks.find((b) => b.id === c.blockId);
      if (t) { t.catchup = c.id; t.baseTitle = t.title; t.title = `Rattrapage : ${c.title}`; t.catchupCat = c.cat; }
    }
  }
  return blocks.sort((a, b) => toMin(a.start) - toMin(b.start));
}

export const status = (ds, b) => S.log[key(ds, b)];
export const durMin = (b) => Math.max(0, toMin(b.end) - toMin(b.start));

// status: 'done' | 'done:sport' | 'done:courses' | 'missed' | undefined (effacer)
export function setStatus(ds, b, st) {
  const k = key(ds, b);
  if (st) S.log[k] = st; else delete S.log[k];

  if (b.catchup) {
    const c = S.catchups.find((x) => x.id === b.catchup);
    if (c) {
      if (st && st.startsWith('done')) { c.status = 'done'; c.doneDate = ds; }
      else if (st === 'missed') { c.status = 'pending'; c.date = null; c.blockId = null; }
    }
  } else if (CATCHUP_CATS.has(b.cat)) {
    const existing = S.catchups.find((x) => x.fromDate === ds && x.fromBlockId === b.id);
    if (st === 'missed' && !existing) {
      S.catchups.push({
        id: uid(), title: b.title.replace(/^Rattrapage : /, ''), cat: b.cat, minutes: durMin(b),
        fromDate: ds, fromBlockId: b.id, status: 'pending', date: null, blockId: null,
      });
    } else if (st !== 'missed' && existing && existing.status !== 'done') {
      S.catchups = S.catchups.filter((x) => x !== existing);
    }
  }
  save();
}

// Blocs passés à valider (7 derniers jours)
export function toValidate(now = new Date()) {
  const out = [];
  const t = ymd(now);
  for (let i = 7; i >= 0; i--) {
    const ds = addDays(t, -i);
    if (ds < S.installed) continue;
    for (const b of resolveDay(ds)) {
      if (!b.track) continue;
      if (at(ds, b.end) > now) continue;
      if (status(ds, b)) continue;
      out.push({ ds, b });
    }
  }
  return out;
}

// ---- Rattrapage ----
export function freeSlots(limit = 6, now = new Date(), exceptId = null) {
  const out = [];
  const t = ymd(now);
  for (let i = 0; i < 21 && out.length < limit; i++) {
    const ds = addDays(t, i);
    for (const b of baseBlocks(ds)) {
      if (b.cat !== 'tampon') continue;
      if (at(ds, b.start) <= now) continue;
      if (S.log[key(ds, b)]) continue;
      const taken = S.catchups.some((c) => c.status === 'planned' && c.date === ds && c.blockId === b.id && c.id !== exceptId);
      if (taken) continue;
      out.push({ ds, b });
      if (out.length >= limit) break;
    }
  }
  return out;
}

export function planCatchup(id, ds, blockId) {
  const c = S.catchups.find((x) => x.id === id);
  if (!c) return;
  c.status = 'planned'; c.date = ds; c.blockId = blockId;
  save();
}
export function unplanCatchup(id) {
  const c = S.catchups.find((x) => x.id === id);
  if (!c) return;
  c.status = 'pending'; c.date = null; c.blockId = null;
  save();
}
export function dropCatchup(id) {
  const c = S.catchups.find((x) => x.id === id);
  if (!c) return;
  c.status = 'dropped';
  save();
}

// ---- Bilan de la semaine ----
export function weekStats(monday, now = new Date()) {
  const days = Array.from({ length: 7 }, (_, i) => addDays(monday, i));
  const r = {
    monday, planned: 0, done: 0, missed: 0, unanswered: 0,
    tasksPlanned: 0, tasksDone: 0,
    reposPlanned: 0, reposDone: 0,
    sport: 0, courses: 0,
    cats: {}, // cat -> {plannedMin, doneMin}
    catchCreated: 0, catchDone: 0, catchPending: 0,
    elapsed: 0, // blocs suivis déjà terminés
  };
  const addCat = (cat, field, m) => {
    r.cats[cat] ||= { plannedMin: 0, doneMin: 0 };
    r.cats[cat][field] += m;
  };
  for (const ds of days) {
    if (ds < S.installed) continue;
    for (const b of resolveDay(ds)) {
      if (!b.track) continue;
      const m = durMin(b);
      const cat = b.catchup ? b.catchupCat : b.cat;
      const st = status(ds, b);
      const past = at(ds, b.end) <= now;
      r.planned++;
      addCat(cat === 'tampon' ? 'tampon' : cat, 'plannedMin', m);
      if (cat === 'repos') r.reposPlanned++; else r.tasksPlanned++;
      if (past) r.elapsed++;
      if (st && st.startsWith('done')) {
        r.done++;
        if (cat === 'repos') r.reposDone++; else r.tasksDone++;
        let doneCat = cat;
        if (st === 'done:sport') doneCat = 'sport';
        if (st === 'done:courses') { doneCat = 'courses'; r.courses++; }
        if (doneCat === 'sport') r.sport++;
        addCat(doneCat, 'doneMin', m);
      } else if (st === 'missed') r.missed++;
      else if (past) r.unanswered++;
    }
  }
  const inWeek = (d) => d && d >= days[0] && d <= days[6];
  for (const c of S.catchups) {
    if (inWeek(c.fromDate)) {
      r.catchCreated++;
      if (c.status === 'done') r.catchDone++;
      if (c.status === 'pending' || c.status === 'planned') r.catchPending++;
    }
  }
  const answered = r.done + r.missed;
  r.rate = r.elapsed ? Math.round((r.done / r.elapsed) * 100) : null;
  r.answered = answered;
  return r;
}

export const thisMonday = () => mondayOf(today());
