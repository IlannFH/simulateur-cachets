// Bornes de saisie et conservation du formulaire. Aucun montant de grille ici.
import { parseInput, formatFrNombre } from './money.js';

export const BORNES = {
  smic: { min: 8, max: 30 },
  plafond: { min: 50, max: 20000 },
  taux: { min: 0, max: 40 },
  coef: { min: 1, max: 3 },
  csg: { min: 50, max: 100 },
  heuresMois: { min: 100, max: 200 },
  joursMois: { min: 1, max: 31 },
  prix: { min: 0, max: 500 },
  pourcentInter: { min: 0, max: 30 },
  brut: { min: 0.01, max: 100000 },
  pctMajo: { min: 0, max: 300 },
  heuresJour: { min: 0.25, max: 24 },
  heuresSemaine: { min: 0.25, max: 80 },
  heuresMajo: { min: 0, max: 200 },
  mois: { min: 0, max: 36 },
};

const MAX_QTE = { jour: 366, semaine: 53, mois: 24, heure: 2000, cachet: 400, service: 400 };

export function validerQuantite(v, kind = 'jour') {
  const texte = String(v ?? '').trim();
  const max = MAX_QTE[kind] || 400;
  if (texte === '') return { ok: false, message: 'Indiquez une quantité.' };
  const n = parseInput(texte);
  if (n === null) return { ok: false, message: 'Quantité illisible. Exemple : 2 ou 1,5.' };
  if (n <= 0) return { ok: false, message: 'La quantité doit être supérieure à 0.' };
  if (n > max) return { ok: false, message: `${formatFrNombre(max)} maximum pour cette unité.` };
  return { ok: true, valeur: n };
}

export function validerHeuresJour(v) {
  if (v === '' || v == null) return { ok: true, valeur: null };
  const n = parseInput(v);
  if (n === null) return { ok: false, message: 'Durée illisible. Exemple : 8 ou 10,5.' };
  if (n <= 0) return { ok: false, message: 'La durée doit être supérieure à 0.' };
  if (n > BORNES.heuresJour.max) return { ok: false, message: 'Une journée ne peut pas dépasser 24 h.' };
  return { ok: true, valeur: n };
}

export function validerHeuresSemaine(v) {
  if (v === '' || v == null) return { ok: true, valeur: null };
  const n = parseInput(v);
  if (n === null) return { ok: false, message: 'Durée illisible.' };
  if (n <= 0) return { ok: false, message: 'La durée doit être supérieure à 0.' };
  if (n > BORNES.heuresSemaine.max) return { ok: false, message: '80 h maximum dans la semaine.' };
  return { ok: true, valeur: n };
}

export function validerHeuresMajo(v) {
  if (v === '' || v == null) return { ok: true, valeur: null };
  const n = parseInput(v);
  if (n === null) return { ok: false, message: 'Heures illisibles.' };
  if (n < 0) return { ok: false, message: 'Les heures ne peuvent pas être négatives.' };
  if (n > BORNES.heuresMajo.max) return { ok: false, message: '200 h maximum.' };
  return { ok: true, valeur: n };
}

export function validerBrut(v, { label = 'brut' } = {}) {
  if (v === '' || v == null) return { ok: true, valeur: null };
  const n = parseInput(v);
  if (n === null) return { ok: false, message: 'Montant illisible. Exemple : 1 234,56.' };
  if (n < 0) return { ok: false, message: `Le ${label} ne peut pas être négatif.` };
  if (n === 0) return { ok: false, message: `Le ${label} doit être supérieur à 0.` };
  if (n > BORNES.brut.max) return { ok: false, message: '100 000 € maximum pour une ligne.' };
  return { ok: true, valeur: n };
}

export function validerPourcentage(v, { max = BORNES.pctMajo.max } = {}) {
  if (v === '' || v == null) return { ok: true, valeur: null };
  const n = parseInput(v);
  if (n === null) return { ok: false, message: 'Pourcentage illisible.' };
  if (n < 0) return { ok: false, message: 'Le pourcentage ne peut pas être négatif.' };
  if (n > max) return { ok: false, message: `${formatFrNombre(max)} % maximum.` };
  return { ok: true, valeur: n };
}

export function validerMois(v) {
  if (v === '' || v == null) return { ok: false, message: 'Indiquez une durée en mois.' };
  const n = parseInput(v);
  if (n === null) return { ok: false, message: 'Durée illisible. Exemple : 1,5.' };
  if (n < 0) return { ok: false, message: 'La durée ne peut pas être négative.' };
  if (n > BORNES.mois.max) return { ok: false, message: '36 mois maximum.' };
  return { ok: true, valeur: n };
}

/** Rejette une saisie de paramètre illisible ou hors bornes. L'appelant garde la valeur précédente. */
export function validerSaisieParam(brut, bornes) {
  const raw = String(brut ?? '').trim();
  if (raw === '') return { ok: false, message: 'Champ vide : l’ancienne valeur est conservée.' };
  const n = parseInput(raw);
  if (n === null) return { ok: false, message: `« ${raw} » n’est pas un nombre : l’ancienne valeur est conservée.` };
  if (n < bornes.min || n > bornes.max) return { ok: false, message: `Hors limites (${formatFrNombre(bornes.min)} à ${formatFrNombre(bornes.max)}) : l’ancienne valeur est conservée.` };
  return { ok: true, valeur: n };
}

const BORNES_PARAM = {
  smic: BORNES.smic,
  plafondT1: BORNES.plafond,
  'parametres.plafond_journalier_T2': BORNES.plafond,
  'parametres.plafond_vieillesse_artiste_jour': BORNES.plafond,
  'parametres.plafond_ss_journalier': BORNES.plafond,
  'parametres.fnal_majoration_assiette': BORNES.coef,
  'parametres.csg_assiette_pct': BORNES.csg,
  'parametres.heures_mensuelles': BORNES.heuresMois,
  'parametres.jours_prorata_mois': BORNES.joursMois,
};

export function bornesParametre(cle, champ) {
  if (BORNES_PARAM[cle]) return BORNES_PARAM[cle];
  if (champ === 'pourcentage') return BORNES.pourcentInter;
  if (champ === 'patronal' || champ === 'salarial') return BORNES.taux;
  return BORNES.prix;
}

/**
 * Durée conservée quand l'unité change.
 * Si la durée était encore la valeur nominale de l'ancienne unité, on prend celle de la nouvelle.
 * Une durée saisie à la main (10 h au lieu de 8) est gardée.
 */
export function dureeApresChangementUnite(actuelle, nominaleAvant, nominaleApres) {
  const a = parseInput(actuelle);
  if (a === null || actuelle === '' || actuelle == null) {
    return nominaleApres == null ? '' : String(nominaleApres);
  }
  if (nominaleAvant != null && Math.abs(a - Number(nominaleAvant)) < 1e-9 && nominaleApres != null) {
    return String(nominaleApres);
  }
  return String(a);
}

export const CLES_CONSERVEES = [
  'quantite', 'heuresParJour', 'heuresSemaine', 'joursProrata', 'representations',
  'exploitationContinue', 'ouvrier', 'saisie', 'bulletins', 'contrats', 'fraisManuel',
  'avance', 'abattementPct', 'rgduPct', 'jours', 'genre', 'grille', 'jauge', 'intermediaire',
];

/** Recopie dans un formulaire neuf ce qui reste valable (quantité, durées, brut, heures majorées). */
export function conserverSaisie(prev, base) {
  const out = { ...base };
  for (const k of CLES_CONSERVEES) if (k in (prev || {})) out[k] = prev[k];
  out.heures = { ...(base.heures || {}), ...(prev?.heures || {}) };
  out.majoPct = { ...(base.majoPct || {}), ...(prev?.majoPct || {}) };
  out.demande = { ...(base.demande || {}), ...(prev?.demande || {}) };
  out.budget = { ...(base.budget || {}), ...(prev?.budget || {}) };
  // La catégorie artiste/technicien suit le métier, elle ne se recopie pas.
  if (typeof prev?.cadreChoisi === 'boolean') out.cadreChoisi = prev.cadreChoisi;
  return out;
}
