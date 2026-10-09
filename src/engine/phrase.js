// Lecture locale d'une phrase (« 250 € pour un élec, 8 h, clip »). Aucun appel réseau.
import { parseInput } from './money.js';
import { categorieStatut } from './catalogue.js';
import { TYPES_PROJET, cleMetier } from './metiers.js';

const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/\p{M}/gu, '');
const nomDe = (j) => norm(j?.nom || '');

/**
 * Synonymes. Le plus long qui colle gagne.
 * `prefixe` : le mot peut commencer un mot plus long (« elec » → électricien). « danse » ne doit pas manger « danseur ».
 * `resoudre` : métier précis, ou une question quand plusieurs grilles restent possibles.
 */
const ALIAS_METIER = [
  entree({
    mots: ['directeur de la photographie', 'directeur de la photo', 'directeur photo', 'chef operateur prise de vues', 'chef operateur', 'chef op', 'dop'],
    prefixe: true,
    famille: 'camera',
    grade: 'chef',
    roles: ['directeur photo', 'directeur de la photographie', 'chef operateur prise'],
  }),
  entree({
    mots: ['chef operateur du son', 'ingenieur du son', 'ingenieur son', 'inge son', 'ingeson', 'chef ops'],
    famille: 'son',
    grade: 'chef',
    roles: ['ingenieur du son', 'operateur du son', 'chef ops'],
  }),
  entree({
    mots: ['perchwoman', 'perchman', 'perchmen', 'perchiste', 'perchistee'],
    prefixe: true,
    famille: 'son',
    grade: 'assistant',
    roles: ['perchiste', 'perchman'],
  }),
  entree({
    mots: ['cadreuse', 'cadreur', 'cadreurs', 'cadreu'],
    prefixe: true,
    famille: 'camera',
    roles: ['cadreur'],
  }),
  entree({
    mots: ['prise de vues', 'camera', 'photo'],
    prefixe: true,
    famille: 'camera',
    resoudre: (type, jobs) => question('Cadreur ou chef op ?', [
      offre(trouver(jobs, /^cadreur/), 'Cadreur', type),
      offre(trouver(jobs, /directeur photo$|directeur de la photographie/), 'Chef op', type),
    ]),
  }),
  entree({
    mots: ['mixeur', 'mixeuse'],
    famille: 'son',
    roles: ['mixeur'],
  }),
  entree({
    mots: ['son'],
    famille: 'son',
    resoudre: (type, jobs) => question('Perchman ou ingé son ?', [
      offre(trouver(jobs, /perchiste/), 'Perchman', type),
      offre(trouver(jobs, /ingenieur du son|chef ops/), 'Ingé son', type),
    ]),
  }),
  entree({
    mots: ['chef electricienne', 'chef electricien', 'chef eclairagiste', 'chef elec', 'chef electr'],
    prefixe: true,
    famille: 'elec',
    grade: 'chef',
  }),
  entree({
    mots: ['electricienne', 'electricien', 'electriciens', 'eclairagiste', 'electrecin', 'electricen', 'eletricien', 'electro', 'elec'],
    prefixe: true,
    famille: 'elec',
  }),
  entree({
    mots: ['chef machiniste', 'chef machino'],
    prefixe: true,
    famille: 'machinerie',
    grade: 'chef',
  }),
  entree({
    mots: ['machiniste', 'machinerie', 'machinos', 'machino'],
    prefixe: true,
    famille: 'machinerie',
  }),
  entree({
    mots: ['chef decorateur', 'chef decoratrice', 'chef deco'],
    prefixe: true,
    famille: 'deco',
    grade: 'chef',
    roles: ['decorateur'],
  }),
  entree({
    mots: ['decoratrice', 'decorateur', 'decorateurs'],
    prefixe: true,
    famille: 'deco',
    roles: ['decorateur'],
  }),
  entree({
    mots: ['accessoiriste'],
    prefixe: true,
    famille: 'deco',
    roles: ['accessoiriste'],
  }),
  entree({
    mots: ['decor', 'deco'],
    prefixe: true,
    famille: 'deco',
  }),
  entree({
    mots: ['chef maquilleuse', 'chef maquilleur'],
    prefixe: true,
    famille: 'hmc',
    grade: 'chef',
    roles: ['maquilleur'],
  }),
  entree({
    mots: ['maquilleuse', 'maquilleur', 'maquilleuze', 'maquillage'],
    prefixe: true,
    famille: 'hmc',
    roles: ['maquilleur'],
  }),
  entree({
    mots: ['chef coiffeuse', 'chef coiffeur'],
    prefixe: true,
    famille: 'hmc',
    grade: 'chef',
    roles: ['coiffeur'],
  }),
  entree({
    mots: ['coiffeuse', 'coiffeur', 'coiffeuze', 'coiffure'],
    prefixe: true,
    famille: 'hmc',
    roles: ['coiffeur'],
  }),
  entree({
    mots: ['chef costumiere', 'chef costumier'],
    prefixe: true,
    famille: 'hmc',
    grade: 'chef',
    roles: ['costumier'],
  }),
  entree({
    mots: ['createur de costumes', 'creatrice de costumes'],
    famille: 'hmc',
    grade: 'chef',
    roles: ['createur de costumes', 'creatrice de costumes'],
  }),
  entree({
    mots: ['costumiere', 'costumieres', 'costumier', 'costumiers'],
    prefixe: true,
    famille: 'hmc',
    roles: ['costumier'],
  }),
  entree({
    mots: ['habilleuse', 'habilleur'],
    prefixe: true,
    famille: 'hmc',
    roles: ['habilleur'],
  }),
  entree({
    mots: ['styliste', 'stylistes'],
    famille: 'hmc',
    roles: ['styliste'],
  }),
  entree({
    mots: ['hmc'],
    famille: 'hmc',
  }),
  entree({
    mots: ['regisseur adjoint', 'regisseuse adjointe', 'auxiliaire de regie'],
    famille: 'regie',
    grade: 'assistant',
    roles: ['regisseur adjoint', 'auxiliaire de regie'],
  }),
  entree({
    mots: ['regisseuse', 'regisseur', 'regisseurs'],
    prefixe: true,
    famille: 'regie',
    roles: ['regisseur'],
  }),
  entree({
    mots: ['regie'],
    famille: 'regie',
  }),
  entree({
    mots: ['assistant de production', 'assistante de production'],
    famille: 'prod',
    grade: 'assistant',
    roles: ['assistant de production'],
  }),
  entree({
    mots: ['directeur de production', 'directrice de production', 'producteur', 'productrice', 'production', 'prod'],
    prefixe: true,
    famille: 'prod',
    grade: 'chef',
  }),
  entree({
    mots: ['2e assistant realisateur', '2e assistante realisatrice', 'deuxieme assistant realisateur', 'assistant rea', 'assistante rea', 'assistant real', 'assist real', '1er assistant realisateur', '1er assistante realisatrice', 'premier assistant realisateur'],
    prefixe: true,
    famille: 'real',
    grade: 'assistant',
    resoudre: (type, jobs, texte) => {
      const a1 = trouver(jobs, /^1er assistant realisateur$/);
      const a2 = trouver(jobs, /^2e assistant realisateur$/);
      if (/2e|deuxieme/.test(texte) && a2) return { metierCle: a2.cle, roles: ['2e assistant realisateur'] };
      if (/1er|premier/.test(texte) && a1) return { metierCle: a1.cle, roles: ['1er assistant realisateur'] };
      return question('1er ou 2e assistant ?', [offre(a1, '1er assistant', type), offre(a2, '2e assistant', type)]);
    },
  }),
  entree({
    mots: ['scripte'],
    famille: 'real',
    roles: ['scripte'],
  }),
  entree({
    mots: ['realisatrice', 'realisateur', 'realisateurs', 'rea', 'real'],
    prefixe: true,
    famille: 'real',
    grade: 'chef',
    roles: ['realisateur'],
    sauf: ['assistant'],
  }),
  entree({
    mots: ['etalonneuse', 'etalonneur', 'etalonneurs'],
    prefixe: true,
    famille: 'montage',
    roles: ['etalonneur'],
  }),
  entree({
    mots: ['monteuse', 'monteur', 'monteurs', 'montage'],
    prefixe: true,
    famille: 'montage',
    roles: ['monteur'],
    sauf: ['monteur son'],
  }),
  entree({
    mots: ['danseuse', 'danseur', 'danseurs', 'danseuses', 'danse'],
    prefixe: true,
    famille: 'artistes',
    resoudre: resoudreDanseur,
  }),
  entree({
    mots: ['comedienne', 'comedien', 'comediens', 'comediennes'],
    prefixe: true,
    famille: 'artistes',
    resoudre: resoudreComedien,
  }),
  entree({
    mots: ['musicienne', 'musicien', 'musiciens'],
    prefixe: true,
    famille: 'artistes',
    resoudre: resoudreMusicien,
  }),
  entree({
    mots: ['figurante', 'figurant', 'figurants'],
    prefixe: true,
    famille: 'artistes',
    resoudre: resoudreFigurant,
  }),
  entree({
    mots: ['figu'],
    famille: 'artistes',
    resoudre: resoudreFigurant,
  }),
  entree({
    mots: ['silhouette parlante', 'silhouette', 'silhouettes'],
    prefixe: true,
    famille: 'artistes',
    resoudre: (type, jobs, texte) => {
      const muette = trouver(jobs, /^silhouette$/);
      const parlante = trouver(jobs, /silhouette parlante/);
      if (/parlante/.test(texte) && parlante) return { metierCle: parlante.cle, roles: ['silhouette parlante'] };
      if (muette && parlante) return question('Silhouette muette ou parlante ?', [offre(muette, 'Muette', type), offre(parlante, 'Parlante', type)]);
      return { metierCle: (muette || parlante)?.cle || '', roles: ['silhouette'] };
    },
  }),
  entree({
    mots: ['mannequin', 'mannequins', 'manequin'],
    famille: 'artistes',
    resoudre: resoudreMannequin,
  }),
  entree({
    mots: ['choregraphe', 'choregraphes'],
    prefixe: true,
    famille: 'artistes',
    resoudre: (type, jobs) => question('Pas de minimum publié pour un chorégraphe. Soliste ou corps de ballet ?', [
      offre(trouver(jobs, /danseur – emission choregraphique, soliste/), 'Soliste', type === 'edito' ? 'clip' : (type || 'clip')),
      offre(trouver(jobs, /danseur – emission choregraphique, corps de ballet/), 'Corps de ballet', type === 'edito' ? 'clip' : (type || 'clip')),
    ]),
  }),
  entree({
    mots: ['doublure lumiere', 'doublure'],
    prefixe: true,
    famille: 'artistes',
    roles: ['doublure'],
  }),
  entree({
    mots: ['artiste', 'artistes'],
    prefixe: true,
    famille: 'artistes',
    resoudre: (type, jobs) => question('Quel artiste ?', [
      offre(trouver(jobs, /danseur – emission choregraphique, soliste/), 'Danseur, soliste', type === 'tele' ? 'tele' : 'clip'),
      offre(trouver(jobs, /danseur – emission choregraphique, corps de ballet/), 'Danseur, corps de ballet', type === 'tele' ? 'tele' : 'clip'),
      offre(trouver(jobs, /emission dramatique \/ fiction/), 'Comédien, télé', 'tele'),
      offre(trouver(jobs, /^figurant$/), 'Figurant, film', 'film'),
      offre(trouver(jobs, /musicien – cachet/), 'Musicien, télé', 'tele'),
    ]),
  }),
];

const ALIAS_TYPE = [
  ['publicitaire', 'pub', true],
  ['publicite', 'pub', false],
  ['spot', 'pub', false],
  ['pub', 'pub', false],
  ['lookbook', 'edito', false],
  ['fashion', 'edito', false],
  ['editorial', 'edito', true],
  ['edito', 'edito', true],
  ['mode', 'edito', false],
  ['videomusique', 'clip', true],
  ['videoclip', 'clip', true],
  ['clips', 'clip', false],
  ['clipe', 'clip', false],
  ['clip', 'clip', false],
  ['television', 'tele', true],
  ['emission', 'tele', true],
  ['plateau', 'tele', false],
  ['flux', 'tele', false],
  ['tele', 'tele', true],
  ['tv', 'tele', false],
  ['captation', 'spectacle', true],
  ['spectacle', 'spectacle', true],
  ['concert', 'spectacle', false],
  ['theatre', 'spectacle', true],
  ['scene', 'spectacle', false],
  ['live', 'spectacle', false],
  ['long metrage', 'film', false],
  ['court metrage', 'film', false],
  ['cinema', 'film', true],
  ['fiction', 'film', false],
  ['film', 'film', true],
  ['serie', 'clip', true],
  ['documentaire', 'clip', true],
  ['doc', 'clip', false],
  ['autre', '', false],
].sort((a, b) => b[0].length - a[0].length);

const MOTS_NB = { un: 1, une: 1, deux: 2, trois: 3, quatre: 4 };

function entree(e) {
  const mots = [...e.mots].sort((a, b) => b.length - a.length);
  return { ...e, mots, prefixe: !!e.prefixe, grade: e.grade || '', roles: e.roles || [], sauf: e.sauf || [] };
}

function contient(texte, alias, prefixe) {
  const fin = prefixe ? '' : '(?:[^a-z0-9]|$)';
  return new RegExp(`(?:^|[^a-z0-9])${alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}${fin}`).test(texte);
}

function premierAlias(texte, table) {
  for (const [alias, id, prefixe] of table) {
    if (contient(texte, alias, prefixe)) return { id, alias };
  }
  return { id: '', alias: '' };
}

function meilleurMetier(texte) {
  let gagne = null;
  let longueur = -1;
  for (const e of ALIAS_METIER) {
    for (const mot of e.mots) {
      if (mot.length <= longueur) continue;
      if (!contient(texte, mot, e.prefixe)) continue;
      gagne = { ...e, alias: mot };
      longueur = mot.length;
    }
  }
  return gagne;
}

function distance(a, b) {
  if (Math.abs(a.length - b.length) > 1) return 2;
  const m = Array.from({ length: a.length + 1 }, (_, i) => [i]);
  for (let j = 1; j <= b.length; j++) m[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      m[i][j] = Math.min(m[i - 1][j] + 1, m[i][j - 1] + 1, m[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
  }
  return m[a.length][b.length];
}

/** Une faute d'une lettre sur un mot d'au moins 5 lettres, si une seule entrée colle. */
function metierFlou(texte) {
  const tokens = texte.split(/[^a-z0-9]+/).filter((t) => t.length >= 5);
  const paires = [];
  const mots = texte.split(/[^a-z0-9]+/).filter(Boolean);
  for (let i = 0; i < mots.length - 1; i++) paires.push(`${mots[i]} ${mots[i + 1]}`);
  const candidats = new Set();
  for (const e of ALIAS_METIER) {
    for (const mot of e.mots) {
      if (mot.length < 5) continue;
      const pool = mot.includes(' ') ? paires : tokens;
      if (pool.some((t) => t !== mot && distance(t, mot) === 1)) candidats.add(e);
    }
  }
  if (candidats.size !== 1) return null;
  const e = [...candidats][0];
  return { ...e, alias: e.mots[0] };
}

function trouver(jobs, re) {
  return (jobs || []).find((j) => re.test(nomDe(j))) || null;
}

function offre(job, court, type) {
  if (!job) return null;
  return { cle: job.cle, nom: job.nom, court, type: type || '' };
}

function question(texte, choix) {
  return { question: texte, choix: choix.filter(Boolean), metierCle: '', roles: [] };
}

function resoudreDanseur(type, jobs) {
  const soliste = trouver(jobs, /danseur – emission choregraphique, soliste/);
  const ballet = trouver(jobs, /danseur – emission choregraphique, corps de ballet/);
  const pub = trouver(jobs, /danseur en film publicitaire/);
  const long = trouver(jobs, /artiste-interprete long metrage – engagement/);
  const court = trouver(jobs, /artiste-interprete court metrage/);
  const tourneeS = trouver(jobs, /danseur soliste en tournee/);
  const tourneeB = trouver(jobs, /danseur du ballet en tournee/);
  const ensemble = trouver(jobs, /artiste choregraphique d'ensemble/);
  const sub = trouver(jobs, /artiste dramatique \/ choregraphique – cachet representation/);
  const choeur = question('Soliste ou corps de ballet ? Journée indivisible, 6 h au plus (IDCC 2642, art. 5.14.4).', [
    offre(soliste, 'Soliste', type || 'tele'),
    offre(ballet, 'Corps de ballet', type || 'tele'),
  ]);
  if (type === 'clip' || type === 'tele') return choeur;
  if (type === 'pub' && pub) return { metierCle: pub.cle, roles: ['film publicitaire'] };
  if (type === 'film') return question('Long métrage ou court métrage ?', [offre(long, 'Long métrage', 'film'), offre(court, 'Court métrage', 'film')]);
  if (type === 'spectacle' || type === 'spectacle_sub') {
    return question('Quel danseur ?', [
      offre(ensemble, 'Ensemble', 'spectacle'),
      offre(tourneeS, 'Tournée, soliste', 'spectacle'),
      offre(tourneeB, 'Tournée, ballet', 'spectacle'),
      offre(sub, 'Subventionné', 'spectacle_sub'),
    ]);
  }
  if (type === 'edito') {
    return question('Pas de grille danseur pour l’édito.', [
      offre(soliste, 'Clip, soliste', 'clip'),
      offre(ballet, 'Clip, corps de ballet', 'clip'),
    ]);
  }
  return question('Danseur : c’est pour quoi ?', [
    offre(soliste, 'Clip, soliste', 'clip'),
    offre(ballet, 'Clip, corps de ballet', 'clip'),
    offre(soliste, 'Télé, soliste', 'tele'),
    offre(ballet, 'Télé, ballet', 'tele'),
    offre(pub, 'Pub', 'pub'),
    offre(long, 'Film', 'film'),
    offre(ensemble, 'Spectacle', 'spectacle'),
  ]);
}

function resoudreComedien(type, jobs) {
  const tele = trouver(jobs, /emission dramatique \/ fiction/);
  const pub = trouver(jobs, /comedien \/ mannequin \/ danseur/);
  const long = trouver(jobs, /artiste-interprete long metrage – engagement/);
  const court = trouver(jobs, /artiste-interprete court metrage/);
  if (type === 'clip') {
    return question('Pas de ligne « comédien de clip » pour un producteur audiovisuel. Le cachet IDCC 2121 ne vaut que pour un éditeur phonographique.', [
      offre(tele, 'Émission dramatique', 'tele'),
    ]);
  }
  if (type === 'pub' && pub) return { metierCle: pub.cle, roles: ['film publicitaire'] };
  if (type === 'tele' && tele) return { metierCle: tele.cle, roles: ['emission dramatique'] };
  if (type === 'film') return question('Long métrage ou court métrage ?', [offre(long, 'Long métrage', 'film'), offre(court, 'Court métrage', 'film')]);
  return question('Comédien : c’est pour quoi ?', [
    offre(tele, 'Télé', 'tele'),
    offre(pub, 'Pub', 'pub'),
    offre(long, 'Film', 'film'),
  ]);
}

function resoudreMusicien(type, jobs) {
  const tele = trouver(jobs, /musicien – cachet/);
  const ensemble = trouver(jobs, /musicien \(ensemble/);
  const actuelles = trouver(jobs, /musiques actuelles/);
  if (type === 'tele' && tele) return { metierCle: tele.cle, roles: ['musicien – cachet'] };
  if (type === 'clip') return question('Pas de cachet musicien pour un tournage de clip. Le cachet d’enregistrement ?', [offre(tele, 'Enregistrement', 'tele')]);
  if (type === 'spectacle' || type === 'spectacle_sub') {
    return question('Quel musicien ?', [offre(ensemble, 'Ensemble', 'spectacle'), offre(actuelles, 'Musiques actuelles', 'spectacle')]);
  }
  return question('Musicien : c’est pour quoi ?', [
    offre(tele, 'Télé, enregistrement', 'tele'),
    offre(ensemble, 'Spectacle', 'spectacle'),
    offre(actuelles, 'Musiques actuelles', 'spectacle'),
  ]);
}

function resoudreFigurant(type, jobs) {
  const tele = trouver(jobs, /figurant \(< 30/);
  const pub = trouver(jobs, /figurant \(cinema/);
  const film = trouver(jobs, /^figurant$/);
  if (type === 'tele' && tele) return { metierCle: tele.cle, roles: ['figurant (< 30'] };
  if (type === 'pub' && pub) return { metierCle: pub.cle, roles: ['figurant (cinema'] };
  if (type === 'film' && film) return { metierCle: film.cle, roles: ['figurant'] };
  if (type === 'clip' || type === 'edito') {
    return question('Pas de figurant propre au clip. Lequel ?', [
      offre(tele, 'Émission TV', 'tele'),
      offre(film, 'Cinéma', 'film'),
      offre(pub, 'Pub', 'pub'),
    ]);
  }
  return question('Figurant : c’est pour quoi ?', [
    offre(film, 'Cinéma', 'film'),
    offre(tele, 'Télé', 'tele'),
    offre(pub, 'Pub', 'pub'),
  ]);
}

function resoudreMannequin(type, jobs) {
  const pub = trouver(jobs, /film publicitaire/);
  const tele = trouver(jobs, /^mannequin$/);
  if (type === 'pub' && pub) return { metierCle: pub.cle, roles: ['film publicitaire'] };
  return question('Mannequin : pub, ou un autre cadre ?', [
    offre(pub, 'Pub', 'pub'),
    offre(tele, 'Télé', 'tele'),
  ]);
}

function lireDuree(texte) {
  const out = { heures: null, jours: null, cachets: null, semaines: null, kind: '', masque: [] };
  const re = /(\d+(?:[.,]\d+)?)\s*(heures?|h|journees?|jours?|cachets?|semaines?)\b/g;
  let m;
  while ((m = re.exec(texte))) {
    const val = Number(m[1].replace(',', '.'));
    const u = m[2];
    if (u === 'h' || u.startsWith('heure')) out.heures = val;
    else if (u.startsWith('jour')) out.jours = val;
    else if (u.startsWith('cachet')) out.cachets = val;
    else out.semaines = val;
    out.masque.push([m.index, m.index + m[0].length]);
  }
  const mot = /\b(un|une|deux|trois|quatre)\s+(heures?|journees?|jours?|cachets?|semaines?)\b/.exec(texte);
  if (mot) {
    const val = MOTS_NB[mot[1]];
    const u = mot[2];
    if ((u === 'h' || u.startsWith('heure')) && out.heures == null) out.heures = val;
    else if (u.startsWith('jour') && out.jours == null) out.jours = val;
    else if (u.startsWith('cachet') && out.cachets == null) out.cachets = val;
    else if (u.startsWith('semaine') && out.semaines == null) out.semaines = val;
    out.masque.push([mot.index, mot.index + mot[0].length]);
  }
  if (out.heures != null) out.kind = 'heure';
  else if (out.jours != null) out.kind = 'jour';
  else if (out.cachets != null) out.kind = 'cachet';
  else if (out.semaines != null) out.kind = 'semaine';
  return out;
}

function lireMontant(texte, masque) {
  const euro = /(\d[\d\s\u00a0\u202f.]*(?:[.,]\d+)?)\s*(?:€|euros?\b|eur\b)/i.exec(texte);
  if (euro) return parseInput(euro[1]);
  const re = /\d[\d\s]*(?:[.,]\d+)?/g;
  let m;
  while ((m = re.exec(texte))) {
    if (masque.some(([a, b]) => m.index >= a && m.index < b)) continue;
    const v = parseInput(m[0]);
    if (v != null) return v;
  }
  return null;
}

function gradeDePhrase(texte) {
  if (/\bcheff?e?s?\b/.test(texte) && !/\bsous-?cheff?e?s?\b/.test(texte)) return 'chef';
  if (/\b(assistantes?|assistants?|auxiliaires?|renforts?|sous-?cheff?e?s?)\b/.test(texte)) return 'assistant';
  return '';
}

/**
 * Extrait montant, brut ou HT, famille, durée et type de projet.
 * `choix` : plusieurs métiers restent possibles, on ne devine pas.
 * `jobs` (sortie de indexerMetiers) permet de reconnaître un intitulé exact.
 */
export function analyserPhrase(texte, jobs = []) {
  const n = norm(texte);
  const duree = lireDuree(n);
  const montant = lireMontant(n, duree.masque);
  const ditBrut = /\bbruts?\b/.test(n);
  const ditHt = /\bht\b|\bbudget\b|\benveloppe\b/.test(n);
  const alias = meilleurMetier(n) || metierFlou(n);
  const typeTrouve = premierAlias(n, ALIAS_TYPE);
  const typeProjet = TYPES_PROJET.some((t) => t.id === typeTrouve.id) ? typeTrouve.id : '';
  let metierCle = '';
  let roles = alias?.roles ? [...alias.roles] : [];
  let sauf = alias?.sauf ? [...alias.sauf] : [];
  let choix = [];
  let questionTexte = '';
  if (alias?.resoudre) {
    const r = alias.resoudre(typeProjet, jobs, n) || {};
    if (r.metierCle) metierCle = r.metierCle;
    if (r.roles) roles = r.roles;
    if (r.sauf) sauf = r.sauf;
    choix = r.choix || [];
    questionTexte = r.question || '';
  }
  if (!metierCle && !choix.length && jobs.length) {
    const hits = jobs.filter((j) => j.nom.length > 5 && n.includes(cleMetier(j.nom)));
    hits.sort((a, b) => b.nom.length - a.nom.length);
    if (hits[0]) metierCle = hits[0].cle;
  }
  const famille = alias?.famille || (metierCle ? (jobs.find((j) => j.cle === metierCle)?.familles[0] || '') : '');
  const grade = gradeDePhrase(n) || alias?.grade || '';
  let statut = '';
  if (famille === 'artistes') statut = 'artiste';
  else if (famille) statut = 'technicien';
  else if (metierCle) {
    const job = jobs.find((j) => j.cle === metierCle);
    if (job) statut = categorieStatut(job.categorie) === 'artiste' ? 'artiste' : 'technicien';
  }
  const reconnu = Boolean(montant != null || famille || typeProjet || metierCle || choix.length || duree.kind);
  if (reconnu && !statut && !questionTexte && !choix.length) {
    questionTexte = 'Artiste ou technicien ?';
    choix = [
      { statut: 'artiste', court: 'Artiste', nom: 'Grilles artistes-interprètes', cle: '' },
      { statut: 'technicien', court: 'Technicien', nom: 'Grilles techniciens', cle: '' },
    ];
  }
  return {
    montant,
    brut: ditBrut && !ditHt,
    famille,
    statut,
    metierCle,
    roles,
    sauf,
    grade,
    heures: duree.heures,
    jours: duree.jours,
    cachets: duree.cachets,
    semaines: duree.semaines,
    kind: duree.kind,
    typeProjet,
    indice: alias?.alias || '',
    choix,
    question: questionTexte,
    reconnu,
  };
}
