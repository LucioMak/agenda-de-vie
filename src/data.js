// Catégories, semaine type par défaut et utilitaires de temps.

export const CATS = {
  admin:   { label: 'Administratif',        color: '#5B8DEF' },
  sport:   { label: 'Sport',                color: '#F07A3A' },
  maison:  { label: 'Chantier maison',      color: '#D4A82A' },
  flex:    { label: 'Courses ou sport',     color: '#E0679A' },
  repos:   { label: 'Repos',                color: '#3FB8A5' },
  tampon:  { label: 'Tampon / rattrapage',  color: '#9A8CF0' },
  perso:   { label: 'Perso / projet',       color: '#B98FD9' },
  karate:  { label: 'Karaté',               color: '#D9534F' },
  famille: { label: 'Famille',              color: '#8FBF5A' },
  repas:   { label: 'Repas',                color: '#A7A29A' },
  soin:    { label: 'Kiné / santé',         color: '#6FC3E8' },
  trajet:  { label: 'Trajet',               color: '#7A7F87' },
};

// Catégories qui demandent « c'est fait ? » par défaut
export const TRACK_CATS = new Set(['admin', 'sport', 'maison', 'flex', 'repos', 'tampon', 'perso']);
// Catégories qui partent en rattrapage si loupées
export const CATCHUP_CATS = new Set(['admin', 'sport', 'maison', 'flex', 'perso']);

export const DAYS = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];
export const DAYS_SHORT = ['lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.', 'dim.'];
export const MONTHS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];

let n = 0;
export const uid = () => Date.now().toString(36) + (n++).toString(36) + Math.random().toString(36).slice(2, 6);

const B = (start, end, title, cat, opts = {}) => ({
  id: uid(), start, end, title, cat,
  track: opts.track ?? TRACK_CATS.has(cat),
  notify: opts.notify ?? true,
  note: opts.note || '',
});

const matin = () => [
  B('06:00', '07:30', 'Lever + petit déjeuner (fini à 7h30)', 'famille'),
  B('07:30', '08:00', 'Habillage + dents — départ 8h', 'famille'),
  B('08:00', '08:30', 'Dépôt des enfants à l’école', 'trajet'),
];
const soirEcole = () => [
  B('16:25', '17:00', 'Sortie d’école (2 enfants) + jeu', 'famille'),
  B('17:00', '19:00', 'Retour, devoirs, douche, repas (préparation + table)', 'famille'),
  B('19:00', '20:00', 'Repas en famille — temps calme', 'repas'),
  B('20:00', '20:30', 'Dents + histoire + coucher', 'famille'),
];

export function defaultTemplate() {
  return [
    // Lundi
    [
      ...matin(),
      B('08:30', '11:30', 'Administratif (perso + associations)', 'admin'),
      B('11:40', '12:30', 'Sport 1 — tranquille (faible à moyen) + douche', 'sport'),
      B('12:30', '13:30', 'Repas', 'repas'),
      B('13:30', '15:00', 'Repos', 'repos', { note: 'Repos protégé. Téléphone posé.' }),
      B('15:30', '16:00', 'Kiné (trajet inclus)', 'soin'),
      B('16:00', '17:45', 'Trajet', 'trajet'),
      B('17:45', '21:00', 'Karaté', 'karate'),
    ],
    // Mardi
    [
      ...matin(),
      B('08:30', '09:30', 'Administratif (suite et fin)', 'admin'),
      B('09:45', '11:00', 'Courses — ou Sport 3 si pas de courses', 'flex'),
      B('11:00', '11:45', 'Repas', 'repas'),
      B('11:45', '12:45', 'Repos', 'repos', { note: 'Repos avant le karaté.' }),
      B('13:00', '16:00', 'Karaté', 'karate'),
      ...soirEcole(),
    ],
    // Mercredi
    [
      B('09:00', '12:00', 'Karaté', 'karate'),
      B('12:00', '13:30', 'Pause repas + repos', 'repos'),
      B('13:30', '19:00', 'Karaté', 'karate'),
    ],
    // Jeudi
    [
      ...matin(),
      B('08:30', '09:20', 'Sport 2 — moyen + douche', 'sport'),
      B('09:20', '10:15', 'Tampon / rattrapage', 'tampon'),
      B('10:15', '11:15', 'Repos', 'repos', { note: 'Repos avant le karaté.' }),
      B('11:15', '11:45', 'Repas', 'repas'),
      B('12:00', '16:00', 'Karaté', 'karate'),
      ...soirEcole(),
    ],
    // Vendredi
    [
      ...matin(),
      B('08:30', '12:30', 'Chantier maison', 'maison'),
      B('12:30', '13:30', 'Repas', 'repas'),
      B('13:30', '15:00', 'Repos', 'repos'),
      B('15:00', '16:15', 'Tampon / rattrapage (ou chantier +)', 'tampon'),
      B('16:25', '17:00', 'Sortie d’école (2 enfants) + jeu', 'famille'),
      B('17:00', '18:00', 'Devoirs, douche, préparation départ karaté', 'famille'),
      B('18:00', '22:00', 'Karaté', 'karate'),
    ],
    // Samedi
    [
      B('09:00', '12:00', 'Cours', 'karate'),
      B('12:00', '13:30', 'Pause repas + repos', 'repos'),
      B('13:30', '17:00', 'Cours', 'karate'),
    ],
    // Dimanche
    [],
  ];
}

export function defaultSettings() {
  return {
    before: true, beforeMin: 10,
    start: true,
    end: true,
    summary: true, summaryTime: '20:45',
    weekly: true, weeklyTime: '19:00',
    sportGoal: 3,
    horizonDays: 10,
  };
}

// ---- temps ----
export const pad = (x) => String(x).padStart(2, '0');
export const toMin = (hm) => { const [h, m] = hm.split(':').map(Number); return h * 60 + m; };
export const fromMin = (m) => `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
export const fmt = (hm) => { const [h, m] = hm.split(':'); return `${Number(h)}h${m === '00' ? '' : m}`; };
export const fmtDur = (min) => {
  const h = Math.floor(min / 60), m = min % 60;
  if (!h) return `${m} min`;
  return m ? `${h}h${pad(m)}` : `${h}h`;
};
export const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const parseYmd = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
export const addDays = (s, k) => { const d = parseYmd(s); d.setDate(d.getDate() + k); return ymd(d); };
export const wd = (s) => (parseYmd(s).getDay() + 6) % 7; // 0 = lundi
export const at = (s, hm) => { const d = parseYmd(s); const [h, m] = hm.split(':').map(Number); d.setHours(h, m, 0, 0); return d; };
export const mondayOf = (s) => addDays(s, -wd(s));
export const dayLabel = (s) => { const d = parseYmd(s); return `${DAYS[wd(s)]} ${d.getDate()} ${MONTHS[d.getMonth()]}`; };
export const dayShort = (s) => { const d = parseYmd(s); return `${DAYS_SHORT[wd(s)]} ${d.getDate()}/${pad(d.getMonth() + 1)}`; };
