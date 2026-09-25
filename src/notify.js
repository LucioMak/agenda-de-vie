// Notifications locales (Android) : planification glissante sur N jours.
import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';
import { S, resolveDay, today, status } from './logic.js';
import { addDays, at, fmt, toMin, fromMin, dayLabel, CATS } from './data.js';

export const NATIVE = Capacitor.isNativePlatform();
const CHANNEL = 'agenda';
const MAX = 450;
let busy = false, again = false, timer = null;

export async function initNotifications(onAction) {
  if (!NATIVE) return;
  try {
    await LocalNotifications.createChannel({
      id: CHANNEL, name: 'Agenda de vie', description: 'Rappels de l’emploi du temps',
      importance: 5, visibility: 1, vibration: true,
    });
    await LocalNotifications.registerActionTypes({
      types: [
        { id: 'TRACK', actions: [{ id: 'done', title: 'Fait ✔' }, { id: 'missed', title: 'Pas fait' }] },
        { id: 'FLEX', actions: [{ id: 'courses', title: 'Courses faites' }, { id: 'sport', title: 'Sport fait' }, { id: 'missed', title: 'Pas fait' }] },
      ],
    });
    await LocalNotifications.addListener('localNotificationActionPerformed', (a) => onAction(a.actionId, a.notification?.extra || {}));
  } catch (e) { console.warn('init notifications', e); }
}

export async function permissionState() {
  if (!NATIVE) return { display: 'web', exact: 'web' };
  const p = await LocalNotifications.checkPermissions();
  let exact = 'granted';
  try { exact = (await LocalNotifications.checkExactNotificationSetting()).exact_alarm; } catch (e) { /* ancien Android */ }
  return { display: p.display, exact };
}
export async function askPermission() {
  if (!NATIVE) return;
  await LocalNotifications.requestPermissions();
}
export async function openExactSettings() {
  if (!NATIVE) return;
  try { await LocalNotifications.changeExactNotificationSetting(); } catch (e) { /* ignore */ }
}

export function scheduleSoon() {
  clearTimeout(timer);
  timer = setTimeout(reschedule, 1200);
}

function build(now = new Date()) {
  const st = S.settings;
  const list = [];
  const push = (when, title, body, extra = {}, actionTypeId) => {
    if (when <= now) return;
    list.push({ when, title, body, extra, actionTypeId });
  };
  const t = today();
  for (let i = 0; i < st.horizonDays; i++) {
    const ds = addDays(t, i);
    const blocks = resolveDay(ds);
    for (const b of blocks) {
      if (!b.notify) continue;
      const range = `${fmt(b.start)} – ${fmt(b.end)}`;
      if (st.before && st.beforeMin > 0) {
        const w = at(ds, fromMin(Math.max(0, toMin(b.start) - st.beforeMin)));
        push(w, `Dans ${st.beforeMin} min : ${b.title}`, range, { ds, id: b.id, kind: 'before' });
      }
      if (st.start) {
        let body = `Jusqu’à ${fmt(b.end)}`;
        if (b.cat === 'repos') body = `Repos protégé jusqu’à ${fmt(b.end)}. Rien d’autre à faire.`;
        else if (b.note) body += ` · ${b.note}`;
        push(at(ds, b.start), `C’est l’heure : ${b.title}`, body, { ds, id: b.id, kind: 'start' });
      }
      if (st.end && b.track && !status(ds, b)) {
        const flex = b.cat === 'flex' && !b.catchup;
        push(at(ds, b.end), `${b.title} — c’est fait ?`,
          flex ? 'Courses, sport, ou pas fait ?' : 'Réponds pour tenir ton bilan à jour.',
          { ds, id: b.id, kind: 'end' }, flex ? 'FLEX' : 'TRACK');
      }
    }
    if (st.summary) {
      const next = addDays(ds, 1);
      const nb = resolveDay(next).filter((b) => !['famille', 'repas', 'trajet'].includes(b.cat));
      const label = S.overrides[next]?.label;
      const body = nb.length
        ? nb.map((b) => `${fmt(b.start)} ${b.title.split(' — ')[0].split(' (')[0]}`).join(' · ')
        : 'Journée libre.';
      push(at(ds, st.summaryTime), `Demain — ${dayLabel(next)}${label ? ' · ' + label : ''}`, body, { open: 'week', ds: next });
    }
    if (st.weekly && (new Date(at(ds, '12:00')).getDay() === 0)) {
      push(at(ds, st.weeklyTime), 'Ton bilan de la semaine est prêt', 'Ouvre l’appli pour voir tes chiffres.', { open: 'stats' });
    }
  }
  list.sort((a, b) => a.when - b.when);
  return list.slice(0, MAX);
}

export async function reschedule() {
  if (!NATIVE) return 0;
  if (busy) { again = true; return; }
  busy = true;
  try {
    const pending = await LocalNotifications.getPending();
    if (pending.notifications.length) {
      await LocalNotifications.cancel({ notifications: pending.notifications.map((n) => ({ id: n.id })) });
    }
    const list = build();
    if (list.length) {
      await LocalNotifications.schedule({
        notifications: list.map((n, i) => ({
          id: i + 1,
          title: n.title,
          body: n.body,
          largeBody: n.body,
          channelId: CHANNEL,
          smallIcon: 'ic_stat_agenda',
          iconColor: '#3FB8A5',
          schedule: { at: n.when, allowWhileIdle: true },
          extra: n.extra,
          actionTypeId: n.actionTypeId,
          autoCancel: true,
        })),
      });
    }
    return list.length;
  } catch (e) {
    console.warn('reschedule', e);
  } finally {
    busy = false;
    if (again) { again = false; scheduleSoon(); }
  }
}

export async function testNotification() {
  if (!NATIVE) return false;
  await LocalNotifications.schedule({
    notifications: [{
      id: 99999, title: 'Test — Agenda de vie', body: 'Les rappels fonctionnent. Réponds avec un bouton.',
      channelId: CHANNEL, smallIcon: 'ic_stat_agenda', iconColor: '#3FB8A5',
      schedule: { at: new Date(Date.now() + 5000), allowWhileIdle: true }, actionTypeId: 'TRACK', extra: { test: true },
    }],
  });
  return true;
}

export { build as _buildForTest, CATS };
