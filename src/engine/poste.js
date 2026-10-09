// Minimum conventionnel d'un poste : base, plancher SMIC, majorations.
import { toCents, mul, roundInt, formatEuros, formatNumber } from './money.js';
import { trouverPoste, unitesDisponibles, valeurUnitaire } from './catalogue.js';

const n0 = (v) => (v === null || v === undefined || v === '' || Number.isNaN(Number(v)) ? 0 : Number(v));
const pctTxt = (s) => `+${formatNumber(s * 100).replace(/,00$/, '')} %`;

/** Conventions dont les majorations sont absentes du JSON : taux saisis par l'utilisateur. */
export const majorationsSaisies = (conv) => !conv?.majorations || Object.keys(conv.majorations).every((k) => ['note', 'source'].includes(k));

/** Heures nominales couvertes par une unité. */
function heuresNominales(unite, poste, conv, params) {
  if (typeof unite.heures === 'number') return unite.heures;
  if (unite.heures === 'mensuel') return params.heures_mensuelles;
  if (unite.kind === 'jour' || unite.kind === 'cachet' || unite.kind === 'service') return n0(poste.heuresParJour) || conv?.majorations?.journee_min_heures || 8;
  if (unite.kind === 'semaine') return n0(poste.heuresSemaine) || 35;
  return 1;
}

/** Jours couverts par la ligne (pour les plafonds et la nuit). */
export function joursCouverts(unite, quantite) {
  const q = n0(quantite) || 0;
  switch (unite.kind) {
    case 'semaine': return q * 5;
    case 'mois': return Math.ceil(q * 22);
    case 'heure': return Math.max(1, Math.ceil(q / 8));
    default: return Math.max(1, Math.ceil(q));
  }
}

/** Heures d'une plage [from, to] (rangs d'heures, inclus) au-delà de `inclus` et jusqu'à `total`. */
const heuresDansTranche = (total, inclus, from, to) => Math.max(0, Math.min(total, to) - Math.max(inclus, from - 1));

/**
 * Calcule le minimum conventionnel d'un poste.
 * poste : { convention, posteId, genre, grille, jauge, unite, quantite, heuresParJour, heuresSemaine,
 *           joursProrata, representations, exploitationContinue, ouvrier,
 *           heures: { nuit, dimanche, ferie, premierMai, ferieMineur, sup }, majoPct: { sup, nuit, dimanche, ferie } }
 */
export function calculerMinimum(data, poste) {
  const conv = data.conventions[poste.convention];
  const params = data.cotisations.parametres_calcul;
  const smic = data.cotisations.smic_horaire_brut.valeur;
  const smicCents = toCents(smic);
  const entree = trouverPoste(data, poste.convention, poste.posteId, { genre: poste.genre, grille: poste.grille });
  if (!entree) return null;
  const unites = unitesDisponibles(entree, conv);
  const unite = unites.find((u) => u.key === poste.unite) || unites[0];
  const quantite = n0(poste.quantite);
  const v = valeurUnitaire(entree, unite.key, { ...poste, quantite });
  const ligneSource = v.ligne || entree.ligne;
  const hNom = heuresNominales(unite, poste, conv, params);
  const formules = [];
  const avertissements = [];

  // 1. Valeur unitaire + plancher SMIC
  let nonTrouve = v.valeur === null || v.valeur === undefined;
  let plancherSmic = false;
  let smicApplique = false;
  let unitCents;
  if (nonTrouve) {
    plancherSmic = true;
    unitCents = mul(smicCents, hNom);
    formules.push(`Non trouvé : plancher légal SMIC ${formatEuros(smicCents)} × ${formatNumber(hNom)} h = ${formatEuros(unitCents)}`);
  } else {
    unitCents = toCents(v.valeur);
    const soumisSmic = ['jour', 'semaine', 'mois', 'heure'].includes(unite.kind);
    if (soumisSmic && hNom > 0 && v.valeur / hNom < smic - 1e-9) {
      smicApplique = true;
      const avant = unitCents;
      unitCents = mul(smicCents, hNom);
      formules.push(`${formatEuros(avant)} ÷ ${formatNumber(hNom)} h = ${formatNumber(v.valeur / hNom)} € < SMIC ${formatEuros(smicCents)} : SMIC appliqué, ${formatEuros(smicCents)} × ${formatNumber(hNom)} h = ${formatEuros(unitCents)}`);
    }
  }

  // 2. Base
  let baseCents = mul(unitCents, quantite);
  const uniteTxt = { jour: 'jour(s)', semaine: 'semaine(s)', cachet: 'cachet(s)', service: 'service(s)', mois: 'mois', heure: 'heure(s)' }[unite.kind];
  formules.push(`${formatEuros(unitCents)} × ${formatNumber(quantite).replace(/,00$/, '')} ${uniteTxt} = ${formatEuros(baseCents)}`);
  if (v.detail) formules.push(v.detail);
  if (unite.kind === 'mois' && n0(poste.joursProrata) > 0) {
    const pr = roundInt((unitCents * n0(poste.joursProrata)) / params.jours_prorata_mois);
    baseCents += pr;
    formules.push(`Prorata : ${formatEuros(unitCents)} × ${poste.joursProrata} j / ${params.jours_prorata_mois} = ${formatEuros(pr)} (approximation)`);
    avertissements.push('Prorata mensuel : approximation (montant × jours / 30).');
  }

  // 3. Taux horaire de référence
  const l = entree.ligne;
  let tauxCents;
  let tauxTxt;
  if (poste.convention === '2642' && (l.minimum_semaine_39h != null || l.minimum_semaine_35h != null)) {
    if (l.minimum_semaine_39h != null) { tauxCents = toCents(l.minimum_semaine_39h / 40); tauxTxt = 'semaine 39 h ÷ 40'; }
    else { tauxCents = toCents(l.minimum_semaine_35h / 35); tauxTxt = 'semaine 35 h ÷ 35'; }
  } else if (unite.key === 'minimum_semaine_39h') {
    tauxCents = toCents(unitCents / 100 / 40); tauxTxt = 'semaine 39 h ÷ 40';
  } else if (unite.kind === 'heure') {
    tauxCents = unitCents; tauxTxt = 'taux horaire';
  } else {
    tauxCents = toCents(unitCents / 100 / hNom); tauxTxt = `${UNITE_TXT(unite)} ÷ ${formatNumber(hNom).replace(/,00$/, '')} h`;
  }
  if (tauxCents < smicCents) { tauxCents = smicCents; tauxTxt += ' (SMIC)'; }

  // 4. Majorations
  const m = conv?.majorations || {};
  const majorations = [];
  const ajoute = (libelle, heures, mult, supplement = true) => {
    if (!(heures > 0)) return;
    const montant = roundInt(heures * tauxCents * mult);
    majorations.push({ libelle, heures, mult, montant, supplement });
  };
  const H = poste.heures || {};
  const jours = unite.kind === 'jour' ? Math.max(1, Math.ceil(quantite)) : joursCouverts(unite, quantite);

  if (majorationsSaisies(conv)) {
    const P = poste.majoPct || {};
    const manque = (k, h) => n0(h) > 0 && (P[k] === '' || P[k] == null);
    if (['sup', 'nuit', 'dimanche', 'ferie'].some((k) => manque(k, k === 'ferie' ? n0(H.ferie) + n0(H.premierMai) : H[k]))) {
      avertissements.push('Majorations non trouvées pour cette convention : renseignez les taux (%).');
    }
    ajoute(`Heures supplémentaires (+${n0(P.sup)} %)`, n0(H.sup), 1 + n0(P.sup) / 100, false);
    ajoute(`Heures de nuit (+${n0(P.nuit)} %)`, n0(H.nuit), n0(P.nuit) / 100);
    ajoute(`Heures du dimanche (+${n0(P.dimanche)} %)`, n0(H.dimanche), n0(P.dimanche) / 100);
    ajoute(`Heures de jour férié (+${n0(P.ferie)} %)`, n0(H.ferie) + n0(H.premierMai), n0(P.ferie) / 100);
  } else {
    const cap = m.plafond_cumul_conventionnel ?? Infinity;
    const c = (s) => Math.min(s, cap);
    // Heures supplémentaires à la journée (3097)
    const hpj = n0(poste.heuresParJour);
    if (unite.kind === 'jour' && hpj > hNom && poste.convention.startsWith('3097')) {
      const s1 = poste.convention === '3097_pub' ? m.heures_sup_au_dela_8h : m.heures_sup_journee_au_dela_7h;
      const s2 = m.heures_au_dela_10h_total;
      const t1 = Math.min(hpj, 10) - hNom;
      const t2 = Math.max(0, hpj - 10);
      if (s1 != null) ajoute(`Heures au-delà de ${hNom} h (${pctTxt(c(s1))}) : ${formatNumber(t1)} h × ${formatNumber(quantite)} j`, t1 * quantite, 1 + c(s1), false);
      if (s2 != null && t2 > 0) ajoute(`Heures au-delà de 10 h (${pctTxt(s2)}) : ${formatNumber(t2)} h × ${formatNumber(quantite)} j`, t2 * quantite, 1 + s2, false);
    }
    // Heures supplémentaires à la semaine (3097 cinéma, 2642)
    const hs = n0(poste.heuresSemaine);
    if (unite.kind === 'semaine' && hs > hNom && (m.hebdo_36_43 != null)) {
      let tranches;
      if (poste.convention === '2642') {
        tranches = poste.ouvrier && m.hebdo_48_plus_ouvriers != null
          ? [[36, 43, m.hebdo_36_43], [44, 47, m.hebdo_44_plus], [48, Infinity, m.hebdo_48_plus_ouvriers]]
          : [[36, 43, m.hebdo_36_43], [44, Infinity, m.hebdo_44_plus]];
      } else {
        tranches = [[36, 43, m.hebdo_36_43], [44, 48, m.hebdo_44_48], [49, Infinity, m.hebdo_49_plus]];
      }
      for (const [from, to, s] of tranches) {
        const h = heuresDansTranche(hs, hNom, from, to);
        if (h > 0 && s != null) ajoute(`Heures ${from}e${to === Infinity ? ' et +' : `–${to}e`} (${pctTxt(s)}) : ${formatNumber(h)} h × ${formatNumber(quantite)} sem.`, h * quantite, 1 + s, false);
      }
    }
    // Nuit
    const nuit = n0(H.nuit);
    if (nuit > 0) {
      if (m.nuit_8_premieres != null) {
        const n1 = Math.min(nuit, 8 * jours);
        ajoute(`Nuit, 8 premières heures (${pctTxt(c(m.nuit_8_premieres))})`, n1, c(m.nuit_8_premieres));
        if (nuit > n1) ajoute(`Nuit au-delà de 8 h (${pctTxt(c(m.nuit_au_dela_8))})`, nuit - n1, c(m.nuit_au_dela_8));
      } else if (m.nuit_autres != null) {
        const s = poste.ouvrier ? m.nuit_ouvriers_deco : m.nuit_autres;
        ajoute(`Nuit (${pctTxt(s)}${poste.ouvrier ? ', électriciens/machinistes/déco' : ''})`, nuit, s);
      }
    }
    if (m.dimanche != null) ajoute(`Dimanche (${pctTxt(c(m.dimanche))})`, n0(H.dimanche), c(m.dimanche));
    if (m.ferie != null) {
      ajoute(`Jour férié (${pctTxt(c(m.ferie))})`, n0(H.ferie), c(m.ferie));
      ajoute(`1er mai (${pctTxt(c(m.ferie))})`, n0(H.premierMai), c(m.ferie));
    } else {
      if (m.ferie_principaux != null) ajoute(`Jour férié principal (${pctTxt(m.ferie_principaux)})`, n0(H.ferie), m.ferie_principaux);
      if (m.ferie_1er_mai != null) ajoute(`1er mai (${pctTxt(m.ferie_1er_mai)})`, n0(H.premierMai), m.ferie_1er_mai);
      if (m.ferie_paques_8mai_ascension != null) ajoute(`Lundi de Pâques, 8 mai, Ascension (${pctTxt(m.ferie_paques_8mai_ascension)})`, n0(H.ferieMineur), m.ferie_paques_8mai_ascension);
    }
    if (m.plafond_cumul_conventionnel != null && majorations.some((x) => x.supplement)) {
      avertissements.push(`Cumul des majorations plafonné à ${pctTxt(m.plafond_cumul_conventionnel)} ; les heures de nuit, dimanche et férié saisies sont supposées distinctes.`);
    }
  }
  for (const x of majorations) {
    formules.push(`${x.libelle} : ${formatNumber(x.heures)} h × ${formatEuros(tauxCents)} × ${formatNumber(x.mult)} = ${formatEuros(x.montant)}`);
  }
  const majCents = majorations.reduce((s, x) => s + x.montant, 0);
  const minimumCents = baseCents + majCents;
  if (majorations.length) formules.push(`Minimum = ${formatEuros(baseCents)} + ${formatEuros(majCents)} = ${formatEuros(minimumCents)}`);

  return {
    entree, ligne: ligneSource, conv, unite, unites, quantite, valeurSource: v.valeur, colonne: v.colonne,
    nonTrouve, plancherSmic, smicApplique, unitCents, baseCents, tauxCents, tauxTxt,
    majorations, majCents, minimumCents, formules, avertissements, jours, heuresNominales: hNom,
  };
}

function UNITE_TXT(u) {
  return { jour: 'journée', semaine: 'semaine', cachet: 'cachet', service: 'service', mois: 'mois', heure: 'heure' }[u.kind];
}

/**
 * Compare « ma demande » au minimum.
 * demande : { montant, mode: 'unite' | 'total' } ; renvoie null si vide.
 */
export function comparerDemande(min, demande) {
  const montant = demande?.montant;
  if (montant === null || montant === undefined || montant === '' || Number.isNaN(Number(montant))) return null;
  const cents = demande.mode === 'unite' ? mul(toCents(montant), min.quantite || 1) : toCents(montant);
  const ecartCents = cents - min.minimumCents;
  const ecartPct = min.minimumCents ? Math.round((ecartCents / min.minimumCents) * 1000) / 10 : null;
  return { cents, ecartCents, ecartPct, sousMinimum: ecartCents < 0 };
}
