import { App as CapApp } from '@capacitor/app';
import {
  CATS, TRACK_CATS, DAYS, uid, toMin, fmt, fmtDur, ymd, addDays, at, mondayOf,
  dayLabel, dayShort, parseYmd, MONTHS,
} from './data.js';
import {
  S, save, onChange, resolveDay, status, setStatus, toValidate, freeSlots, planCatchup,
  unplanCatchup, dropCatchup, weekStats, today, durMin, replaceState, resetAll,
} from './logic.js';
import {
  NATIVE, initNotifications, reschedule, scheduleSoon, permissionState, askPermission,
  openExactSettings, testNotification, _buildForTest,
} from './notify.js';

// ---------- état d'interface ----------
const ui = {
  view: 'now',
  weekOffset: 0,
  statsOffset: 0,
  tplDay: 0,
  modal: null,     // {type, ...}
  otherSlotsFor: null,
  perm: null,
  toast: '',
};
const $app = document.getElementById('app');
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const color = (cat) => (CATS[cat] || CATS.perso).color;

function toast(msg) {
  ui.toast = msg; render();
  setTimeout(() => { if (ui.toast === msg) { ui.toast = ''; render(); } }, 2200);
}

// ---------- rendu ----------
function render() {
  const pendingCatch = S.catchups.filter((c) => c.status === 'pending').length;
  const valid = toValidate().length;
  $app.innerHTML = `
    <main class="view">${VIEWS[ui.view]()}</main>
    <nav class="tabs">
      ${tab('now', 'Maintenant', ICON.now, valid)}
      ${tab('week', 'Semaine', ICON.week)}
      ${tab('catch', 'Rattrapage', ICON.catch, pendingCatch)}
      ${tab('stats', 'Bilan', ICON.stats)}
      ${tab('settings', 'Réglages', ICON.settings)}
    </nav>
    ${ui.modal ? `<div class="overlay" data-a="closeModal"><div class="sheet" data-stop>${MODALS[ui.modal.type]()}</div></div>` : ''}
    ${ui.toast ? `<div class="toast">${esc(ui.toast)}</div>` : ''}
  `;
}
const tab = (v, label, icon, badge) => `
  <button class="tab ${ui.view === v ? 'on' : ''}" data-a="go" data-v="${v}">
    ${icon}<span>${label}</span>${badge ? `<i class="badge">${badge}</i>` : ''}
  </button>`;

const catDot = (cat) => `<span class="dot" style="background:${color(cat)}"></span>`;

function statusPill(ds, b) {
  const st = status(ds, b);
  if (!st) return '';
  if (st === 'missed') return '<span class="pill miss">Pas fait</span>';
  if (st === 'done:sport') return '<span class="pill ok">Sport ✔</span>';
  if (st === 'done:courses') return '<span class="pill ok">Courses ✔</span>';
  return '<span class="pill ok">Fait ✔</span>';
}

function answerButtons(ds, b) {
  const base = `data-ds="${ds}" data-id="${b.id}"`;
  if (b.cat === 'flex' && !b.catchup) {
    return `<div class="btns">
      <button class="btn ok" data-a="mark" data-st="done:courses" ${base}>Courses</button>
      <button class="btn ok" data-a="mark" data-st="done:sport" ${base}>Sport</button>
      <button class="btn ghost" data-a="mark" data-st="missed" ${base}>Pas fait</button></div>`;
  }
  return `<div class="btns">
    <button class="btn ok" data-a="mark" data-st="done" ${base}>Fait ✔</button>
    <button class="btn ghost" data-a="mark" data-st="missed" ${base}>Pas fait</button></div>`;
}

// ---------- vue : Maintenant ----------
function viewNow() {
  const now = new Date();
  const ds = ymd(now);
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const blocks = resolveDay(ds);
  const cur = blocks.filter((b) => toMin(b.start) <= nowMin && nowMin < toMin(b.end)).pop();
  let next = blocks.find((b) => toMin(b.start) > nowMin);
  let nextDs = ds;
  if (!next) {
    for (let i = 1; i < 8 && !next; i++) {
      const d2 = addDays(ds, i);
      next = resolveDay(d2)[0];
      if (next) nextDs = d2;
    }
  }
  const label = S.overrides[ds]?.label;

  let curHtml;
  if (cur) {
    const total = durMin(cur), el = nowMin - toMin(cur.start), left = total - el;
    const repos = cur.cat === 'repos';
    curHtml = `
      <section class="card now ${repos ? 'repos' : ''}" style="--c:${color(cur.catchupCat || cur.cat)}">
        <div class="kicker">En ce moment · ${esc(CATS[cur.cat]?.label || '')}</div>
        <h1>${esc(cur.title)}</h1>
        <div class="range">${fmt(cur.start)} – ${fmt(cur.end)} · encore ${fmtDur(left)}</div>
        <div class="bar"><i style="width:${Math.round((el / total) * 100)}%"></i></div>
        ${repos ? '<p class="calm">Repos protégé. Rien d’autre à faire.</p>' : cur.note ? `<p class="calm">${esc(cur.note)}</p>` : ''}
        ${cur.track && !repos && !status(ds, cur) ? `<div class="early">Déjà fini ?</div>${answerButtons(ds, cur)}` : statusPill(ds, cur)}
      </section>`;
  } else {
    const until = next ? (nextDs === ds ? `jusqu’à ${fmt(next.start)}` : '') : '';
    curHtml = `
      <section class="card now free">
        <div class="kicker">En ce moment</div>
        <h1>Temps libre</h1>
        <div class="range">${until}</div>
      </section>`;
  }

  const nextHtml = next ? `
    <section class="card next" style="--c:${color(next.catchupCat || next.cat)}">
      <div class="kicker">Ensuite${nextDs !== ds ? ' · ' + esc(dayLabel(nextDs)) : ''}</div>
      <h2>${esc(next.title)}</h2>
      <div class="range">${fmt(next.start)} – ${fmt(next.end)}${nextDs === ds ? ` · dans ${fmtDur(toMin(next.start) - nowMin)}` : ''}</div>
    </section>` : '';

  const tv = toValidate(now);
  const tvHtml = tv.length ? `
    <h3 class="sec">À valider <span class="muted">(${tv.length})</span></h3>
    ${tv.slice().reverse().slice(0, 6).map(({ ds: d, b }) => `
      <div class="card row" style="--c:${color(b.catchupCat || b.cat)}">
        <div class="rowtxt"><b>${esc(b.title)}</b><small>${d === ds ? 'Aujourd’hui' : esc(dayShort(d))} · ${fmt(b.start)} – ${fmt(b.end)}</small></div>
        ${answerButtons(d, b)}
      </div>`).join('')}${tv.length > 6 ? `<p class="muted pad">+ ${tv.length - 6} plus ancien${tv.length - 6 > 1 ? 's' : ''} (visibles dans Semaine)</p>` : ''}` : '';

  const list = blocks.map((b) => {
    const past = toMin(b.end) <= nowMin, isCur = cur && b.id === cur.id;
    return `<li class="${past ? 'past' : ''} ${isCur ? 'cur' : ''}" style="--c:${color(b.catchupCat || b.cat)}">
      <span class="t">${fmt(b.start)}</span><span class="ttl">${esc(b.title)}</span>${statusPill(ds, b)}</li>`;
  }).join('');

  return `
    <header class="top"><div><div class="date">${esc(dayLabel(ds))}</div>${label ? `<div class="tag">${esc(label)}</div>` : ''}</div>
      <div class="clock">${now.getHours()}h${String(now.getMinutes()).padStart(2, '0')}</div></header>
    ${permBanner()}
    ${curHtml}${nextHtml}${tvHtml}
    <h3 class="sec">Aujourd’hui</h3>
    ${blocks.length ? `<ul class="timeline">${list}</ul>` : '<p class="muted pad">Journée libre.</p>'}
  `;
}

function permBanner() {
  if (!NATIVE) return '<div class="banner">Mode aperçu (navigateur) : les notifications ne sont actives que dans l’appli Android.</div>';
  const p = ui.perm;
  if (!p) return '';
  if (p.display !== 'granted') return `<div class="banner warn">Notifications désactivées. <button class="btn small" data-a="askPerm">Autoriser</button></div>`;
  if (p.exact && p.exact !== 'granted') return `<div class="banner warn">Rappels à l’heure exacte non autorisés. <button class="btn small" data-a="exactPerm">Autoriser</button></div>`;
  return '';
}

// ---------- vue : Semaine ----------
function viewWeek() {
  const mon = addDays(mondayOf(today()), ui.weekOffset * 7);
  const t = today();
  const days = Array.from({ length: 7 }, (_, i) => addDays(mon, i)).map((ds) => {
    const blocks = resolveDay(ds).filter((b) => !['famille', 'repas', 'trajet'].includes(b.cat));
    const ov = S.overrides[ds];
    return `<button class="card day ${ds === t ? 'today' : ''}" data-a="openDay" data-ds="${ds}">
      <div class="dayhead"><b>${esc(dayLabel(ds))}</b>${ov ? `<span class="tag">${esc(ov.label || 'Modifiée')}</span>` : ''}</div>
      <div class="chips">${blocks.length ? blocks.map((b) => `<span class="chip" style="--c:${color(b.catchupCat || b.cat)}">${fmt(b.start)} ${esc(short(b.title))}${status(ds, b) ? (status(ds, b) === 'missed' ? ' ✗' : ' ✔') : ''}</span>`).join('') : '<span class="muted">Libre</span>'}</div>
    </button>`;
  }).join('');
  return `
    <header class="top"><div class="date">Semaine</div></header>
    <div class="weeknav">
      <button class="btn ghost" data-a="wk" data-d="-1">‹</button>
      <span>${esc(rangeLabel(mon))}</span>
      <button class="btn ghost" data-a="wk" data-d="1">›</button>
    </div>
    ${ui.weekOffset ? '<button class="link" data-a="wk0">Revenir à cette semaine</button>' : ''}
    ${days}`;
}
const short = (t) => t.replace(/^Rattrapage : /, '↺ ').split(' — ')[0].split(' (')[0];
function rangeLabel(mon) {
  const a = parseYmd(mon), b = parseYmd(addDays(mon, 6));
  return `${a.getDate()} ${MONTHS[a.getMonth()]} – ${b.getDate()} ${MONTHS[b.getMonth()]}`;
}

// ---------- vue : Rattrapage ----------
function viewCatch() {
  const pending = S.catchups.filter((c) => c.status === 'pending');
  const planned = S.catchups.filter((c) => c.status === 'planned').sort((a, b) => (a.date + a.blockId).localeCompare(b.date + b.blockId));
  const doneN = S.catchups.filter((c) => c.status === 'done').length;

  const pHtml = pending.map((c) => {
    const slots = freeSlots(ui.otherSlotsFor === c.id ? 6 : 1);
    const s = slots[0];
    const fitWarn = s && c.minutes > durMin(s.b)
      ? `<p class="warn-txt">${fmtDur(c.minutes)} prévues, créneau de ${fmtDur(durMin(s.b))} : avance au maximum.</p>` : '';
    return `<div class="card" style="--c:${color(c.cat)}">
      <div class="rowtxt"><b>${esc(c.title)}</b><small>Loupé ${esc(dayShort(c.fromDate))} · ${fmtDur(c.minutes)}</small></div>
      ${s ? `<p class="prop">Proposé : <b>${esc(dayShort(s.ds))} · ${fmt(s.b.start)} – ${fmt(s.b.end)}</b></p>${fitWarn}
        <div class="btns">
          <button class="btn ok" data-a="plan" data-c="${c.id}" data-ds="${s.ds}" data-id="${s.b.id}">Valider</button>
          <button class="btn ghost" data-a="otherSlots" data-c="${c.id}">Autre créneau</button>
          <button class="btn ghost" data-a="drop" data-c="${c.id}">Abandonner</button>
        </div>
        ${ui.otherSlotsFor === c.id ? `<div class="slots">${slots.slice(1).map((x) => `<button class="btn small" data-a="plan" data-c="${c.id}" data-ds="${x.ds}" data-id="${x.b.id}">${esc(dayShort(x.ds))} · ${fmt(x.b.start)}</button>`).join('') || '<span class="muted">Pas d’autre créneau tampon libre sur 3 semaines.</span>'}</div>` : ''}`
      : `<p class="muted">Aucun créneau tampon libre sur 3 semaines. Ajoute un tampon dans la semaine type ou une journée modifiée.</p>
         <div class="btns"><button class="btn ghost" data-a="drop" data-c="${c.id}">Abandonner</button></div>`}
    </div>`;
  }).join('');

  const plHtml = planned.map((c) => `
    <div class="card row" style="--c:${color(c.cat)}">
      <div class="rowtxt"><b>${esc(c.title)}</b><small>Prévu ${esc(dayShort(c.date))} · créneau tampon</small></div>
      <div class="btns"><button class="btn ghost small" data-a="unplan" data-c="${c.id}">Annuler</button></div>
    </div>`).join('');

  return `
    <header class="top"><div class="date">Rattrapage</div></header>
    <p class="muted pad">Quand tu réponds « Pas fait », la tâche arrive ici. L’appli te propose le prochain créneau tampon, tu valides. Le repos n’est jamais utilisé.</p>
    <h3 class="sec">À replacer <span class="muted">(${pending.length})</span></h3>
    ${pHtml || '<p class="muted pad">Rien à rattraper. 👌</p>'}
    <h3 class="sec">Planifiés <span class="muted">(${planned.length})</span></h3>
    ${plHtml || '<p class="muted pad">Aucun.</p>'}
    <p class="muted pad">Rattrapages réussis depuis le début : <b>${doneN}</b></p>`;
}

// ---------- vue : Bilan ----------
function viewStats() {
  const mon = addDays(mondayOf(today()), ui.statsOffset * 7);
  const r = weekStats(mon);
  const prev = weekStats(addDays(mon, -7));
  const delta = r.rate != null && prev.rate != null ? r.rate - prev.rate : null;
  const bar = (done, planned, c) => `<div class="hbar"><i style="width:${planned ? Math.min(100, Math.round((done / planned) * 100)) : 0}%;background:${c}"></i></div>`;
  const catRows = ['admin', 'maison', 'sport', 'flex', 'tampon', 'perso', 'repos'].filter((k) => r.cats[k]).map((k) => {
    const x = r.cats[k];
    return `<div class="statrow">
      <div class="statlbl">${catDot(k)}${esc(CATS[k].label)}</div>
      <div class="statval">${fmtDur(x.doneMin)} <span class="muted">/ ${fmtDur(x.plannedMin)}</span></div>
      ${bar(x.doneMin, x.plannedMin, color(k))}
    </div>`;
  }).join('');

  return `
    <header class="top"><div class="date">Bilan</div></header>
    <div class="weeknav">
      <button class="btn ghost" data-a="st" data-d="-1">‹</button>
      <span>${esc(rangeLabel(mon))}</span>
      <button class="btn ghost" data-a="st" data-d="1">›</button>
    </div>
    <section class="card big">
      <div class="kicker">Taux de réalisation</div>
      <div class="bignum">${r.rate == null ? '—' : r.rate + ' %'}</div>
      <div class="muted">${r.done} fait${r.done > 1 ? 's' : ''} sur ${r.elapsed} bloc${r.elapsed > 1 ? 's' : ''} passés${delta != null ? ` · ${delta >= 0 ? '+' : ''}${delta} pts vs semaine précédente` : ''}</div>
    </section>
    <div class="grid">
      <div class="card kpi"><div class="kicker">Séances de sport</div><div class="num">${r.sport}<span class="muted"> / ${S.settings.sportGoal}</span></div></div>
      <div class="card kpi"><div class="kicker">Repos pris</div><div class="num">${r.reposDone}<span class="muted"> / ${r.reposPlanned}</span></div></div>
      <div class="card kpi"><div class="kicker">Courses</div><div class="num">${r.courses}</div></div>
      <div class="card kpi"><div class="kicker">Loupés</div><div class="num">${r.missed}</div></div>
      <div class="card kpi"><div class="kicker">Rattrapés</div><div class="num">${r.catchDone}<span class="muted"> / ${r.catchCreated}</span></div></div>
      <div class="card kpi"><div class="kicker">Sans réponse</div><div class="num">${r.unanswered}</div></div>
    </div>
    <h3 class="sec">Heures par activité</h3>
    <section class="card">${catRows || '<p class="muted">Rien de suivi cette semaine.</p>'}</section>
    ${r.unanswered ? `<p class="muted pad">${r.unanswered} bloc${r.unanswered > 1 ? 's' : ''} sans réponse : valide-les dans « Maintenant » pour un bilan juste.</p>` : ''}
  `;
}

// ---------- vue : Réglages ----------
function viewSettings() {
  const st = S.settings;
  const d = ui.tplDay;
  const blocks = [...S.template[d]].sort((a, b) => toMin(a.start) - toMin(b.start));
  const tgl = (k, label) => `<label class="tgl"><span>${label}</span><input type="checkbox" data-a="set" data-k="${k}" ${st[k] ? 'checked' : ''}></label>`;
  return `
    <header class="top"><div class="date">Réglages</div></header>
    <h3 class="sec">Semaine type</h3>
    <div class="daytabs">${DAYS.map((n, i) => `<button class="dt ${i === d ? 'on' : ''}" data-a="tplDay" data-d="${i}">${n.slice(0, 3)}</button>`).join('')}</div>
    ${blockList(blocks, { kind: 'tpl', day: d })}
    <button class="btn wide" data-a="addBlock" data-kind="tpl" data-day="${d}">+ Ajouter un bloc le ${DAYS[d].toLowerCase()}</button>

    <h3 class="sec">Rappels</h3>
    <section class="card">
      ${tgl('before', 'Rappel avant chaque bloc')}
      <label class="tgl"><span>Minutes avant</span><input type="number" min="1" max="60" value="${st.beforeMin}" data-a="setNum" data-k="beforeMin"></label>
      ${tgl('start', 'Rappel au début du bloc')}
      ${tgl('end', 'Fin de bloc : « c’est fait ? »')}
      ${tgl('summary', 'Résumé du lendemain')}
      <label class="tgl"><span>Heure du résumé</span><input type="time" value="${st.summaryTime}" data-a="setTime" data-k="summaryTime"></label>
      ${tgl('weekly', 'Bilan le dimanche')}
      <label class="tgl"><span>Heure du bilan</span><input type="time" value="${st.weeklyTime}" data-a="setTime" data-k="weeklyTime"></label>
      <label class="tgl"><span>Objectif sport / semaine</span><input type="number" min="1" max="7" value="${st.sportGoal}" data-a="setNum" data-k="sportGoal"></label>
      <div class="btns"><button class="btn" data-a="testNotif">Tester une notification</button></div>
    </section>

    <h3 class="sec">Sauvegarde</h3>
    <section class="card">
      <p class="muted">Tes données restent sur le téléphone. Copie une sauvegarde de temps en temps (ex. dans une note ou un mail à toi-même).</p>
      <div class="btns">
        <button class="btn" data-a="export">Exporter</button>
        <button class="btn" data-a="import">Importer</button>
        <button class="btn ghost" data-a="reset">Réinitialiser</button>
      </div>
    </section>
    <p class="muted pad center">Agenda de vie · v1.0</p>`;
}

function blockList(blocks, ctx) {
  if (!blocks.length) return '<p class="muted pad">Aucun bloc.</p>';
  const c = ctx.kind === 'tpl' ? `data-kind="tpl" data-day="${ctx.day}"` : `data-kind="ov" data-ds="${ctx.ds}"`;
  return `<ul class="blist">${blocks.map((b) => `
    <li style="--c:${color(b.cat)}" data-a="editBlock" data-id="${b.id}" ${c}>
      <span class="t">${fmt(b.start)}<br><small>${fmt(b.end)}</small></span>
      <span class="ttl">${esc(b.title)}<small>${esc(CATS[b.cat]?.label || '')}${b.track ? ' · suivi' : ''}${b.notify ? '' : ' · sans rappel'}</small></span>
      <span class="chev">›</span>
    </li>`).join('')}</ul>`;
}

const VIEWS = { now: viewNow, week: viewWeek, catch: viewCatch, stats: viewStats, settings: viewSettings };

// ---------- modales ----------
const MODALS = {
  day() {
    const ds = ui.modal.ds;
    const blocks = resolveDay(ds);
    const ov = S.overrides[ds];
    const now = new Date();
    return `
      <div class="sheethead"><h2>${esc(dayLabel(ds))}</h2>${ov ? `<span class="tag">${esc(ov.label || 'Modifiée')}</span>` : ''}</div>
      ${ov ? blockList(ov.blocks.slice().sort((a, b) => toMin(a.start) - toMin(b.start)), { kind: 'ov', ds }) : `
      <ul class="timeline">${blocks.map((b) => `<li style="--c:${color(b.catchupCat || b.cat)}"><span class="t">${fmt(b.start)}</span><span class="ttl">${esc(b.title)}</span>${statusPill(ds, b)}</li>`).join('')}</ul>`}
      ${blocks.filter((b) => b.track && at(ds, b.end) <= now && !status(ds, b)).map((b) => `
        <div class="card row" style="--c:${color(b.cat)}"><div class="rowtxt"><b>${esc(b.title)}</b></div>${answerButtons(ds, b)}</div>`).join('')}
      <h3 class="sec">Changer cette journée seulement</h3>
      <div class="btns col">
        ${ov ? `<button class="btn" data-a="addBlock" data-kind="ov" data-ds="${ds}">+ Ajouter un bloc</button>
                 <button class="btn" data-a="labelDay" data-ds="${ds}">Renommer la journée</button>
                 <button class="btn ghost" data-a="clearOv" data-ds="${ds}">Revenir à la semaine type</button>`
               : `<button class="btn" data-a="makeOv" data-ds="${ds}" data-p="copy">Modifier cette journée</button>`}
        <button class="btn" data-a="makeOv" data-ds="${ds}" data-p="compet">Compétition (journée entière)</button>
        <button class="btn" data-a="makeOv" data-ds="${ds}" data-p="off">Journée libre / vacances</button>
      </div>
      <button class="btn wide ghost" data-a="closeModal">Fermer</button>`;
  },
  block() {
    const m = ui.modal;
    const b = m.block;
    const opts = Object.entries(CATS).map(([k, v]) => `<option value="${k}" ${b.cat === k ? 'selected' : ''}>${v.label}</option>`).join('');
    return `
      <h2>${m.isNew ? 'Nouveau bloc' : 'Modifier le bloc'}</h2>
      <p class="muted">${m.kind === 'tpl' ? `Semaine type · chaque ${DAYS[m.day].toLowerCase()}` : `Uniquement le ${esc(dayLabel(m.ds))}`}</p>
      <label class="fld"><span>Intitulé</span><input id="f-title" value="${esc(b.title)}" placeholder="Ex. Administratif"></label>
      <label class="fld"><span>Catégorie</span><select id="f-cat">${opts}</select></label>
      <div class="two">
        <label class="fld"><span>Début</span><input id="f-start" type="time" value="${b.start}"></label>
        <label class="fld"><span>Fin</span><input id="f-end" type="time" value="${b.end}"></label>
      </div>
      <label class="fld"><span>Note (optionnel)</span><input id="f-note" value="${esc(b.note || '')}"></label>
      <label class="tgl"><span>Demander « c’est fait ? »</span><input id="f-track" type="checkbox" ${b.track ? 'checked' : ''}></label>
      <label class="tgl"><span>Rappels pour ce bloc</span><input id="f-notify" type="checkbox" ${b.notify ? 'checked' : ''}></label>
      <p id="f-err" class="warn-txt">${esc(m.err || '')}</p>
      <div class="btns">
        <button class="btn ok" data-a="saveBlock">Enregistrer</button>
        ${m.isNew ? '' : '<button class="btn danger" data-a="delBlock">Supprimer</button>'}
        <button class="btn ghost" data-a="${m.back ? 'backDay' : 'closeModal'}">Annuler</button>
      </div>`;
  },
  export() {
    return `<h2>Exporter</h2><p class="muted">Copie ce texte et garde-le en lieu sûr.</p>
      <textarea id="f-json" readonly>${esc(JSON.stringify(S))}</textarea>
      <div class="btns"><button class="btn ok" data-a="copy">Copier</button><button class="btn ghost" data-a="closeModal">Fermer</button></div>`;
  },
  import() {
    return `<h2>Importer</h2><p class="muted">Colle une sauvegarde. Elle remplace les données actuelles.</p>
      <textarea id="f-json" placeholder="{ ... }">${esc(ui.modal.text || '')}</textarea><p id="f-err" class="warn-txt">${esc(ui.modal.err || '')}</p>
      <div class="btns"><button class="btn ok" data-a="doImport">Importer</button><button class="btn ghost" data-a="closeModal">Annuler</button></div>`;
  },
  confirm() {
    return `<h2>${esc(ui.modal.title)}</h2><p class="muted">${esc(ui.modal.text)}</p>
      <div class="btns"><button class="btn danger" data-a="${ui.modal.ok}">Confirmer</button><button class="btn ghost" data-a="closeModal">Annuler</button></div>`;
  },
  label() {
    return `<h2>Nom de la journée</h2>
      <label class="fld"><span>Ex. Stage, Compétition, Vacances</span><input id="f-label" value="${esc(S.overrides[ui.modal.ds]?.label || '')}"></label>
      <div class="btns"><button class="btn ok" data-a="saveLabel">Enregistrer</button><button class="btn ghost" data-a="backDay">Annuler</button></div>`;
  },
};

// ---------- listes de blocs (modèle ou journée) ----------
function listFor(kind, ref) {
  return kind === 'tpl' ? S.template[Number(ref)] : S.overrides[ref].blocks;
}

function overlapsRepos(list, b) {
  const s = toMin(b.start), e = toMin(b.end);
  return list.some((x) => x.id !== b.id && x.cat === 'repos' && toMin(x.start) < e && s < toMin(x.end));
}

// ---------- actions ----------
const A = {
  go(el) { ui.view = el.dataset.v; ui.otherSlotsFor = null; window.scrollTo(0, 0); },
  closeModal() { ui.modal = null; },
  backDay() { ui.modal = ui.modal?.ds ? { type: 'day', ds: ui.modal.ds } : null; },
  mark(el) {
    const ds = el.dataset.ds;
    const b = resolveDay(ds).find((x) => x.id === el.dataset.id);
    if (!b) return;
    setStatus(ds, b, el.dataset.st);
    if (el.dataset.st === 'missed' && (b.catchup || ['admin', 'sport', 'maison', 'flex', 'perso'].includes(b.cat))) toast('Envoyé en rattrapage');
  },
  wk(el) { ui.weekOffset += Number(el.dataset.d); },
  wk0() { ui.weekOffset = 0; },
  st(el) { ui.statsOffset += Number(el.dataset.d); },
  openDay(el) { ui.modal = { type: 'day', ds: el.dataset.ds }; },
  makeOv(el) {
    const ds = el.dataset.ds, p = el.dataset.p;
    const copy = (arr) => arr.map((b) => ({ ...b, id: uid() }));
    if (p === 'copy') S.overrides[ds] = { label: 'Modifiée', blocks: copy(resolveDay(ds).map(({ catchup, catchupCat, baseTitle, ...b }) => ({ ...b, title: baseTitle || b.title }))) };
    if (p === 'compet') S.overrides[ds] = { label: 'Compétition', blocks: [{ id: uid(), start: '07:00', end: '19:00', title: 'Compétition', cat: 'karate', track: false, notify: true, note: '' }] };
    if (p === 'off') S.overrides[ds] = { label: 'Journée libre', blocks: [] };
    // les rattrapages prévus ce jour-là repartent à replacer
    S.catchups.forEach((c) => { if (c.status === 'planned' && c.date === ds) { c.status = 'pending'; c.date = null; c.blockId = null; } });
    save();
  },
  clearOv(el) {
    const ds = el.dataset.ds;
    delete S.overrides[ds];
    S.catchups.forEach((c) => { if (c.status === 'planned' && c.date === ds) { c.status = 'pending'; c.date = null; c.blockId = null; } });
    save();
  },
  labelDay(el) { ui.modal = { type: 'label', ds: el.dataset.ds }; },
  saveLabel() {
    const v = document.getElementById('f-label').value.trim();
    S.overrides[ui.modal.ds].label = v || 'Modifiée';
    save(); A.backDay();
  },
  tplDay(el) { ui.tplDay = Number(el.dataset.d); },
  addBlock(el) {
    const kind = el.dataset.kind;
    ui.modal = {
      type: 'block', isNew: true, kind, day: Number(el.dataset.day), ds: el.dataset.ds, back: kind === 'ov',
      block: { id: uid(), start: '09:00', end: '10:00', title: '', cat: 'perso', track: true, notify: true, note: '' },
    };
  },
  editBlock(el) {
    const kind = el.dataset.kind;
    const list = listFor(kind, kind === 'tpl' ? el.dataset.day : el.dataset.ds);
    const b = list.find((x) => x.id === el.dataset.id);
    if (!b) return;
    ui.modal = { type: 'block', isNew: false, kind, day: Number(el.dataset.day), ds: el.dataset.ds, back: kind === 'ov', block: { ...b } };
  },
  saveBlock() {
    const m = ui.modal;
    const g = (id) => document.getElementById(id);
    const b = {
      ...m.block,
      title: g('f-title').value.trim(), cat: g('f-cat').value,
      start: g('f-start').value, end: g('f-end').value, note: g('f-note').value.trim(),
      track: g('f-track').checked, notify: g('f-notify').checked,
    };
    m.block = b;
    if (!b.title) { m.err = 'Donne un intitulé.'; return; }
    if (!b.start || !b.end || toMin(b.end) <= toMin(b.start)) { m.err = 'La fin doit être après le début.'; return; }
    const list = listFor(m.kind, m.kind === 'tpl' ? m.day : m.ds);
    if (b.cat !== 'repos' && overlapsRepos(list, b) && !m.forceRepos) {
      m.err = 'Ce bloc empiète sur un temps de repos. Appuie encore sur Enregistrer pour confirmer.';
      m.forceRepos = true; return;
    }
    const i = list.findIndex((x) => x.id === b.id);
    if (i >= 0) list[i] = b; else list.push(b);
    save();
    if (m.back) A.backDay(); else ui.modal = null;
    toast('Enregistré');
  },
  delBlock() {
    const m = ui.modal;
    const list = listFor(m.kind, m.kind === 'tpl' ? m.day : m.ds);
    const i = list.findIndex((x) => x.id === m.block.id);
    if (i >= 0) list.splice(i, 1);
    S.catchups.forEach((c) => { if (c.status === 'planned' && c.blockId === m.block.id) { c.status = 'pending'; c.date = null; c.blockId = null; } });
    save();
    if (m.back) A.backDay(); else ui.modal = null;
    toast('Supprimé');
  },
  plan(el) { planCatchup(el.dataset.c, el.dataset.ds, el.dataset.id); ui.otherSlotsFor = null; toast('Rattrapage planifié'); },
  otherSlots(el) { ui.otherSlotsFor = ui.otherSlotsFor === el.dataset.c ? null : el.dataset.c; },
  drop(el) { dropCatchup(el.dataset.c); },
  unplan(el) { unplanCatchup(el.dataset.c); },
  set(el) { S.settings[el.dataset.k] = el.checked; save(); },
  async testNotif() {
    if (!NATIVE) { toast('Disponible dans l’appli Android'); return; }
    await testNotification(); toast('Notification dans 5 secondes');
  },
  export() { ui.modal = { type: 'export' }; },
  import() { ui.modal = { type: 'import' }; },
  async copy() {
    const t = document.getElementById('f-json');
    try { await navigator.clipboard.writeText(t.value); toast('Copié'); } catch (e) { t.select(); document.execCommand('copy'); toast('Copié'); }
  },
  doImport() {
    const txt = document.getElementById('f-json').value;
    try {
      const o = JSON.parse(txt);
      if (!o.template || !Array.isArray(o.template) || o.template.length !== 7) throw new Error();
      replaceState(o); ui.modal = null; toast('Sauvegarde importée');
    } catch (e) { ui.modal.text = txt; ui.modal.err = 'Texte invalide.'; }
  },
  reset() { ui.modal = { type: 'confirm', title: 'Tout réinitialiser ?', text: 'Semaine type d’origine, historique et rattrapages effacés.', ok: 'doReset' }; },
  doReset() { resetAll(); ui.modal = null; toast('Réinitialisé'); },
  async askPerm() { await askPermission(); await refreshPerm(); },
  async exactPerm() { await openExactSettings(); },
};

document.addEventListener('click', async (e) => {
  const el = e.target.closest('[data-a]');
  if (!el) return;
  if (el.dataset.a === 'closeModal' && e.target.closest('[data-stop]') && !e.target.closest('button')) return;
  if (el.tagName === 'INPUT') return;
  const f = A[el.dataset.a];
  if (!f) return;
  await f(el);
  render();
});
document.addEventListener('change', (e) => {
  const el = e.target;
  const a = el.dataset?.a;
  if (a === 'set') { S.settings[el.dataset.k] = el.checked; save(); }
  if (a === 'setNum') { const v = Number(el.value); if (v > 0) { S.settings[el.dataset.k] = v; save(); } }
  if (a === 'setTime') { if (el.value) { S.settings[el.dataset.k] = el.value; save(); } }
});

// ---------- icônes ----------
const svg = (p) => `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${p}</svg>`;
const ICON = {
  now: svg('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>'),
  week: svg('<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>'),
  catch: svg('<path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 4v5h5"/>'),
  stats: svg('<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>'),
  settings: svg('<path d="M4 6h16M4 12h16M4 18h16"/><circle cx="9" cy="6" r="2" fill="currentColor"/><circle cx="15" cy="12" r="2" fill="currentColor"/><circle cx="7" cy="18" r="2" fill="currentColor"/>'),
};

// ---------- démarrage ----------
async function refreshPerm() { try { ui.perm = await permissionState(); } catch (e) { ui.perm = null; } render(); }

async function onNotifAction(actionId, extra) {
  if (extra.open) ui.view = extra.open;
  if (extra.ds && extra.id && ['done', 'missed', 'courses', 'sport'].includes(actionId)) {
    const b = resolveDay(extra.ds).find((x) => x.id === extra.id);
    if (b) {
      const st = actionId === 'courses' ? 'done:courses' : actionId === 'sport' ? 'done:sport' : actionId;
      setStatus(extra.ds, b, st);
    }
  } else if (extra.kind === 'end') ui.view = 'now';
  render();
}

onChange(() => scheduleSoon());

(async function start() {
  render();
  setInterval(() => { if (!ui.modal && ['now'].includes(ui.view)) render(); }, 30000);
  if (NATIVE) {
    await initNotifications(onNotifAction);
    await askPermission();
    await refreshPerm();
    await reschedule();
    CapApp.addListener('resume', async () => { await refreshPerm(); reschedule(); });
    CapApp.addListener('backButton', () => {
      if (ui.modal) { ui.modal = null; render(); }
      else if (ui.view !== 'now') { ui.view = 'now'; render(); }
      else CapApp.minimizeApp();
    });
  }
})();

// Pour les tests
window.__adv = { S, resolveDay, weekStats, setStatus, ui, render, buildNotifs: _buildForTest };
