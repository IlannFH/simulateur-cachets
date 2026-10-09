// Phrase courte du résultat, et le détail « Comment c'est calculé ».
// La phrase copiée ne reprend pas le détail.
import { formatEuros, formatFrNombre, toCents } from './money.js';
import { calculerLigne, fraisFixes, optionIntermediaire, packChoisi, REGLAGES_DEFAUT } from './devis.js';

const euros = (cents) => formatEuros(cents).replace(/[\u202f\u00a0]/g, ' ');

const QUI = {
  elec: 'Élec',
  camera: 'Caméra',
  son: 'Son',
  machinerie: 'Machinerie',
  deco: 'Déco',
  hmc: 'HMC',
  regie: 'Régie',
  prod: 'Prod',
  real: 'Réal',
  montage: 'Montage',
  artistes: 'Artistes',
};

/** Nom court de la phrase : le métier s'il est choisi, sinon la famille. */
export function quiResume(famille, nom) {
  if (nom) return nom;
  return QUI[famille] || '';
}

/** « 1 jour 8 h », « 8 heures », « 1 cachet ». */
export function dureeResume({ kind, quantite, heuresNominales } = {}) {
  const q = Number(quantite) || 1;
  const n = formatFrNombre(q);
  if (kind === 'jour') {
    const jour = q > 1 ? `${n} jours` : '1 jour';
    return heuresNominales ? `${jour} ${formatFrNombre(heuresNominales)} h` : jour;
  }
  if (kind === 'heure') return q > 1 ? `${n} heures` : '1 heure';
  if (kind === 'cachet') return q > 1 ? `${n} cachets` : '1 cachet';
  if (kind === 'service') return q > 1 ? `${n} services` : '1 service';
  if (kind === 'semaine') return q > 1 ? `${n} semaines` : '1 semaine';
  if (kind === 'mois') return q > 1 ? `${n} mois` : '1 mois';
  return '';
}

/** « 250 € » si le montant est rond, sinon « 250,50 € ». */
export function eurosSaisi(montant) {
  const n = Number(montant);
  if (!Number.isFinite(n)) return '';
  if (Math.abs(n - Math.round(n)) < 1e-9) return `${formatFrNombre(Math.round(n))} €`;
  return euros(toCents(n));
}

const tauxTxt = (n) => `${String(n).replace('.', ',')} %`;

function nomCotisation(libelle) {
  let s = String(libelle).replace(/\s*\([^)]*\)/g, '').trim();
  s = s.replace(/\s+[–—-]\s+.*$/, '').trim();
  s = s.replace(/^URSSAF\s+/i, '');
  if (!s) return String(libelle);
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/**
 * Une phrase, ou deux lignes jointes par « — ».
 * mode budget impossible : « Pas possible avec 250 € HT. Minimum : … € HT. »
 * mode brut impossible : brut minimum, sans HT.
 * sinon : brut, net, coût total HT (frais compris).
 */
export function texteResume({ qui, projet, duree, mode, possible, budgetEuros, minimumCents, brutMinimumCents, brutCents, netCents, totalCents }) {
  const tete = [qui, projet, duree].filter(Boolean).join(' · ');
  let suite;
  if (mode === 'budget' && possible === false) {
    suite = `Pas possible avec ${eurosSaisi(budgetEuros)} HT. Minimum : ${euros(minimumCents)} HT.`;
  } else if (mode === 'brut' && possible === false) {
    suite = `Pas possible. Brut minimum : ${euros(brutMinimumCents)}.`;
  } else {
    suite = `Brut ${euros(brutCents)}, net ${euros(netCents)}, coût total ${euros(totalCents)} HT.`;
  }
  return tete ? `${tete} — ${suite}` : suite;
}

/** Ligne au brut demandé, plus l'abonnement et l'inscription. */
export function bilanPoste(data, poste, reglages = REGLAGES_DEFAUT) {
  const ligne = calculerLigne(data, poste, reglages);
  if (!ligne) return null;
  const fixes = fraisFixes(data, poste.intermediaire || reglages.intermediaire, reglages);
  const fixesCents = fixes.reduce((s, f) => s + f.montant, 0);
  const creditsLigne = ligne.frais.credits || 0;
  const creditsFixes = fixes.reduce((s, f) => s + (f.credits || 0), 0);
  const credits = Math.round((creditsLigne + creditsFixes) * 100) / 100;
  return {
    ligne, fixes, fixesCents, credits,
    totalCents: ligne.coutTotal + fixesCents,
  };
}

function ligneCotisation(l) {
  if (l.nonTrouve) return null;
  const parts = [];
  if (l.patronal) parts.push(`patronal ${tauxTxt(l.tauxPatronal)} (${euros(l.patronal)})`);
  if (l.salarial) parts.push(`salarial ${tauxTxt(l.tauxSalarial)} (${euros(l.salarial)})`);
  if (!parts.length) return null;
  return `${nomCotisation(l.libelle)} : ${parts.join(', ')}.`;
}

function ligneFrais(data, bilan, reglages) {
  const o = optionIntermediaire(data, bilan.ligne.intermediaire);
  const montant = (bilan.ligne.frais.ht || 0) + bilan.fixesCents;
  if (!montant && !bilan.credits) return 'Frais d\'intermédiaire : 0 €.';
  if (o.credits && o.packs?.length && bilan.credits) {
    const pack = packChoisi(o, reglages);
    const prix = (toCents(pack.prix_credit_ht) / 100).toFixed(2).replace('.', ',');
    const court = (libelle) => {
      const tete = String(libelle).split(' × ')[0].replace(/ :.*/, '');
      const mois = String(libelle).match(/\d+(?:,\d+)? mois/);
      return mois ? `${tete} ${mois[0]}` : tete;
    };
    const morceaux = [];
    for (const d of bilan.ligne.frais.details || []) {
      if (d.credits) morceaux.push(`${formatFrNombre(d.credits)} crédits (${court(d.libelle)})`);
    }
    for (const f of bilan.fixes) {
      if (f.credits) morceaux.push(`${formatFrNombre(f.credits)} crédits (${court(f.libelle)})`);
    }
    const dont = morceaux.length ? ` ${morceaux.join(', ')}.` : '';
    return `Movinmotion : ${formatFrNombre(bilan.credits)} crédits × ${prix} € = ${euros(montant)} HT.${dont}`;
  }
  const libs = [
    ...(bilan.ligne.frais.details || []).map((d) => d.libelle),
    ...bilan.fixes.map((f) => f.libelle),
  ];
  return `Frais d'intermédiaire : ${euros(montant)} HT${libs.length ? ` (${libs.join(' ; ')})` : ''}.`;
}

/**
 * Lignes du déroulant, dans l'ordre du calcul, pour CETTE ligne.
 * Le total HT est le même montant que le coût total de la phrase courte.
 */
export function lignesCalcul(data, bilan, reglages = REGLAGES_DEFAUT, ctx = {}) {
  if (!bilan) return [];
  const L = bilan.ligne;
  const unite = L.min.unite?.label || ctx.unite || '';
  const qte = formatFrNombre(L.min.quantite || ctx.quantite || 1);
  const grille = ctx.grille ? `grille ${ctx.grille}, ` : '';
  const out = [];
  out.push(`Minimum conventionnel : ${euros(L.min.minimumCents)} (${grille}${unite} × ${qte}).`);
  out.push(`Brut : ${euros(L.brutCents)}.`);
  out.push(`Cotisations patronales : ${euros(L.cot.patronal)}. Cotisations salariales : ${euros(L.cot.salarial)}.`);
  for (const l of L.cot.lignes) {
    const row = ligneCotisation(l);
    if (row) out.push(row);
  }
  if (L.cot.nonTrouves) out.push(`${L.cot.nonTrouves} cotisation(s) non chiffrée(s), comptée(s) à 0 €.`);
  out.push(`Net : ${euros(L.cot.net)}.`);
  out.push(`Coût employeur : ${euros(L.cot.coutEmployeur)}.`);
  out.push(ligneFrais(data, bilan, reglages));
  const o = optionIntermediaire(data, L.intermediaire);
  const tauxBulletin = Number(o?.credits?.bulletin);
  const aUnBulletin = (L.frais.details || []).some((d) => /bulletin/i.test(d.libelle));
  if (tauxBulletin && aUnBulletin) {
    out.push(`Ces ${formatFrNombre(tauxBulletin)} crédits de bulletin couvrent la paie, le bulletin, l'AEM, les congés spectacles et la DSN.`);
  }
  out.push(`Total HT : ${euros(bilan.totalCents)}.`);
  return out;
}
