// Lecture locale d'une phrase (« 250 € pour un élec, 8 h, clip »). Aucun appel réseau.
import { parseInput } from './money.js';
import { TYPES_PROJET, cleMetier } from './metiers.js';

const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/\p{M}/gu, '');

/** alias, famille ou type, prefixe = vrai si le mot peut commencer un mot plus long (« elec » → électricien). */
const ALIAS_FAMILLE = [
  ['directeur de la photographie', 'camera', false],
  ['directeur de la photo', 'camera', false],
  ['directeur photo', 'camera', false],
  ['prise de vues', 'camera', false],
  ['cadreur', 'camera', false],
  ['cadreuse', 'camera', false],
  ['camera', 'camera', true],
  ['dop', 'camera', false],
  ['photo', 'camera', true],
  ['ingenieur du son', 'son', false],
  ['inge son', 'son', false],
  ['perchiste', 'son', false],
  ['perchman', 'son', false],
  ['mixeur', 'son', false],
  ['son', 'son', false],
  ['electricienne', 'elec', true],
  ['electricien', 'elec', true],
  ['eclairagiste', 'elec', false],
  ['electro', 'elec', true],
  ['elec', 'elec', true],
  ['machiniste', 'machinerie', true],
  ['machinerie', 'machinerie', false],
  ['machino', 'machinerie', true],
  ['decorateur', 'deco', true],
  ['decoratrice', 'deco', true],
  ['decor', 'deco', true],
  ['deco', 'deco', true],
  ['maquilleuse', 'hmc', true],
  ['maquilleur', 'hmc', true],
  ['coiffeuse', 'hmc', true],
  ['coiffeur', 'hmc', true],
  ['costumier', 'hmc', true],
  ['habilleuse', 'hmc', true],
  ['habilleur', 'hmc', true],
  ['styliste', 'hmc', false],
  ['hmc', 'hmc', false],
  ['regisseur', 'regie', true],
  ['regie', 'regie', false],
  ['production', 'prod', true],
  ['producteur', 'prod', true],
  ['productrice', 'prod', true],
  ['prod', 'prod', false],
  ['realisateur', 'real', true],
  ['realisatrice', 'real', true],
  ['scripte', 'real', false],
  ['real', 'real', true],
  ['monteuse', 'montage', true],
  ['monteur', 'montage', true],
  ['etalonneur', 'montage', true],
  ['danseuse', 'artistes', true],
  ['danseur', 'artistes', true],
  ['comedienne', 'artistes', true],
  ['comedien', 'artistes', true],
  ['musicienne', 'artistes', true],
  ['musicien', 'artistes', true],
  ['figurante', 'artistes', true],
  ['figurant', 'artistes', true],
  ['mannequin', 'artistes', false],
  ['artiste', 'artistes', true],
  ['choregraphe', 'artistes', true],
].sort((a, b) => b[0].length - a[0].length);

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
  ['clips', 'clip', false],
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

function contient(texte, alias, prefixe) {
  const fin = prefixe ? '' : '(?:[^a-z0-9]|$)';
  return new RegExp(`(?:^|[^a-z0-9])${alias}${fin}`).test(texte);
}

function premierAlias(texte, table) {
  for (const [alias, id, prefixe] of table) {
    if (contient(texte, alias, prefixe)) return { id, alias };
  }
  return { id: '', alias: '' };
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
  if (/\bchefs?\b/.test(texte) && !/\bsous-?chefs?\b/.test(texte)) return 'chef';
  if (/\b(assistants?|auxiliaires?|renforts?|sous-?chefs?)\b/.test(texte)) return 'assistant';
  return '';
}

/**
 * Extrait montant, brut ou HT, famille, durée et type de projet.
 * `jobs` (sortie de indexerMetiers) permet de reconnaître un intitulé exact.
 */
export function analyserPhrase(texte, jobs = []) {
  const n = norm(texte);
  const duree = lireDuree(n);
  const montant = lireMontant(n, duree.masque);
  const ditBrut = /\bbruts?\b/.test(n);
  const ditHt = /\bht\b|\bbudget\b|\benveloppe\b/.test(n);
  const familleTrouvee = premierAlias(n, ALIAS_FAMILLE);
  const typeTrouve = premierAlias(n, ALIAS_TYPE);
  const famille = familleTrouvee.id;
  const typeProjet = typeTrouve.id;
  let metierCle = '';
  if (jobs.length) {
    const hits = jobs.filter((j) => j.nom.length > 5 && n.includes(cleMetier(j.nom)));
    hits.sort((a, b) => b.nom.length - a.nom.length);
    if (hits[0]) metierCle = hits[0].cle;
  }
  const familleFinale = famille || (metierCle ? (jobs.find((j) => j.cle === metierCle)?.familles[0] || '') : '');
  return {
    montant,
    brut: ditBrut && !ditHt,
    famille: familleFinale,
    metierCle,
    grade: gradeDePhrase(n),
    heures: duree.heures,
    jours: duree.jours,
    cachets: duree.cachets,
    semaines: duree.semaines,
    kind: duree.kind,
    typeProjet: TYPES_PROJET.some((t) => t.id === typeProjet) ? typeProjet : '',
    indice: familleTrouvee.alias,
    reconnu: Boolean(montant != null || familleFinale || typeProjet || metierCle || duree.kind),
  };
}
