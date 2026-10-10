// Cotisations patronales et salariales, ligne par ligne, arrondies au centime.
import { pctOf, mul } from './money.js';

/** La ligne de cotisation s'applique-t-elle au statut ? */
export function sApplique(applique_a, statut, idcc) {
  const { categorie, cadre } = statut; // categorie : 'artiste' | 'technicien'
  switch (applique_a) {
    case 'tous': return true;
    case 'artiste': return categorie === 'artiste';
    case 'technicien': return categorie === 'technicien';
    case 'artiste_non_cadre': return categorie === 'artiste' && !cadre;
    case 'technicien_non_cadre': return categorie === 'technicien' && !cadre;
    case 'cadre': return !!cadre;
    case 'non_cadre': return !cadre;
    default: {
      const m = /^idcc_(\d+)$/.exec(applique_a || '');
      return m ? String(idcc) === m[1] : false;
    }
  }
}

/**
 * Calcule les cotisations d'une ligne.
 * o : { brutCents, statut: {categorie, cadre}, idcc, jours, heures?, abattementPct?, rgduPct? }
 */

/** Coefficient RGDU 2026, arrondi à 4 décimales. 0 au-delà de 3 SMIC de la période. */
export function coefficientRgdu(brutEuros, heures, p) {
  if (!(heures > 0) || !(brutEuros > 0)) return 0;
  const smic = Number(p.rgdu_smic_horaire) * heures;
  const inner = 0.5 * ((3 * smic) / brutEuros - 1);
  if (!(inner > 0)) return 0;
  const raw = Number(p.rgdu_t_min) + Number(p.rgdu_t_delta) * Math.pow(inner, Number(p.rgdu_p));
  const cap = Number(p.rgdu_t_max);
  return Math.round(Math.min(raw, cap) * 10000) / 10000;
}
export function calculerCotisations(data, o) {
  const C = data.cotisations;
  const P = C.parametres_calcul;
  const P1 = C.plafonds_2026.plafond_journalier_intermittent_cadre_T1 * 100;
  const P2 = P.plafond_journalier_T2 * 100;
  const jours = Math.max(1, o.jours || 1);
  const brut = o.brutCents;
  const abat = o.abattementPct ? Number(o.abattementPct) : 0;
  const brutAbattu = abat ? brut - pctOf(brut, abat) : brut;
  const plafT1 = P1 * jours;
  const plafT2 = P2 * jours;
  const plafVieillesse = P.plafond_vieillesse_artiste_jour * 100 * jours;

  const lignes = [];
  const applicables = C.lignes.filter((l) => sApplique(l.applique_a, o.statut, o.idcc));

  const assiette = (l) => {
    const b = /avant abattement/.test(l.assiette || '') ? brut : brutAbattu;
    const code = l.code;
    if (code.startsWith('prevoyance')) return { cents: Math.min(b, plafT1), txt: `brut plafonné (${C.plafonds_2026.plafond_journalier_intermittent_cadre_T1} €/j × ${jours} j)` };
    if (code === 'retraite_t1_cadre' || (code === 'ceg_t1' && o.statut.cadre)) return { cents: Math.min(b, plafT1), txt: `T1 (≤ ${C.plafonds_2026.plafond_journalier_intermittent_cadre_T1} €/j)` };
    if (code === 'retraite_t2_cadre') return { cents: Math.max(0, Math.min(b, plafT2) - plafT1), txt: `T2 (${C.plafonds_2026.plafond_journalier_intermittent_cadre_T1} à ${P.plafond_journalier_T2} €/j)` };
    if (code === 'apec') return { cents: Math.min(b, plafT2), txt: `T1 + T2` };
    if (code === 'urssaf_vieillesse_plaf_artiste') return { cents: Math.min(b, plafVieillesse), txt: `plafonnée (${P.plafond_vieillesse_artiste_jour} €/j × ${jours} j)` };
    // Assurance vieillesse technicien, taux plein 2026 (les taux artiste en sont 70 %).
    // Part plafonnée : plafond journalier de la sécurité sociale (arrêté du 22/12/2025).
    // Le plafond appliqué aux techniciens est à confirmer par un gestionnaire de paie :
    // un cachet peut suivre le plafond de 360 €, et non le plafond journalier de 220 €.
    if (code === 'urssaf_vieillesse_plaf_technicien') {
      const capJour = Number(P.plafond_ss_journalier) * 100;
      return { cents: Math.min(b, capJour * jours), txt: `plafonnée (plafond SS ${P.plafond_ss_journalier} €/j × ${jours} j) — plafond à confirmer par un gestionnaire de paie` };
    }
    if (code === 'urssaf_vieillesse_deplaf_technicien') return { cents: b, txt: 'totalité du brut' };
    if (code === 'urssaf_fnal_artiste') return { cents: mul(Math.min(b, plafVieillesse), P.fnal_majoration_assiette), txt: `plafonnée × ${String(P.fnal_majoration_assiette).replace('.', ',')}` };
    // FNAL < 50 salariés : 0,10 % de l'assiette plafonnée au plafond journalier, majorée de 11,5 %.
    if (code === 'urssaf_fnal_technicien') {
      const cap = Number(P.plafond_ss_journalier) * 100 * jours;
      return { cents: mul(Math.min(b, cap), P.fnal_majoration_assiette), txt: `plafonnée × ${String(P.fnal_majoration_assiette).replace('.', ',')}` };
    }
    // Retraite complémentaire non-cadre : le taux T1 reste appliqué à tout le brut.
    // Le partager au-dessus du plafond n'est pas faisable proprement : l'exemple Audiens
    // 2026 (400 €, artiste non cadre, 1 jour) applique ce taux à l'intégralité du brut,
    // et les sources ne publient pas de taux T2 non-cadre distinct.
    return { cents: b, txt: b === brut ? 'brut' : `brut après abattement ${abat} %` };
  };

  let prevoyancePatronale = 0;
  for (const l of applicables) {
    if (l.code === 'csg_crds') continue;
    const a = assiette(l);
    const nonTrouve = l.patronal === null || l.patronal === undefined;
    const pat = nonTrouve ? 0 : pctOf(a.cents, l.patronal);
    const sal = l.salarial == null ? 0 : pctOf(a.cents, l.salarial);
    if (l.code.startsWith('prevoyance')) prevoyancePatronale += pat;
    lignes.push({ code: l.code, libelle: l.libelle, assiette: a.cents, assietteTxt: a.txt, tauxPatronal: l.patronal, tauxSalarial: l.salarial, patronal: pat, salarial: sal, verifie: !!l.verifie, nonTrouve, note: l.note, source: l.source });
  }

  // CSG/CRDS : 98,25 % du brut + part patronale de prévoyance (salarial uniquement)
  const csg = applicables.find((l) => l.code === 'csg_crds');
  if (csg) {
    const base = pctOf(brut, P.csg_assiette_pct) + prevoyancePatronale;
    const txt = `${String(P.csg_assiette_pct).replace('.', ',')} % du brut + prévoyance patronale`;
    const parts = csg.ventilation?.length ? csg.ventilation : [{ libelle: csg.libelle, salarial: csg.salarial }];
    for (const v of parts) {
      lignes.push({ code: 'csg_crds', libelle: v.libelle, assiette: base, assietteTxt: txt, tauxPatronal: 0, tauxSalarial: v.salarial, patronal: 0, salarial: pctOf(base, v.salarial), verifie: !!csg.verifie, nonTrouve: false, nonDeductible: !!v.non_deductible, source: csg.source });
    }
  }

  // Réduction générale. Une saisie manuelle remplace le calcul. Sinon, technicien non cadre seulement.
  if (o.rgduPct) {
    const r = -pctOf(brut, o.rgduPct);
    lignes.push({ code: 'rgdu', libelle: `Réduction générale saisie (${o.rgduPct} % du brut)`, assiette: brut, assietteTxt: 'brut', tauxPatronal: -Number(o.rgduPct), tauxSalarial: 0, patronal: r, salarial: 0, verifie: false, nonTrouve: false });
  } else if (o.statut?.categorie === 'technicien' && !o.statut?.cadre && Number(o.heures) > 0) {
    const coef = coefficientRgdu(brut / 100, Number(o.heures), P);
    if (coef > 0) {
      const pct = Math.round(coef * 10000) / 100;
      lignes.push({
        code: 'rgdu',
        libelle: `Réduction générale, coefficient ${String(coef).replace('.', ',')}, URSSAF 2026, moins de 50 salariés`,
        assiette: brut,
        assietteTxt: 'brut',
        tauxPatronal: -pct,
        tauxSalarial: 0,
        patronal: -mul(brut, coef),
        salarial: 0,
        verifie: true,
        nonTrouve: false,
        note: 'SMIC de la formule gelé à 12,02 € (décret n° 2026-509).',
        source: 'https://www.urssaf.fr/accueil/employeur/beneficier-exonerations/reduction-generale-cotisation.html',
      });
    }
  }

  const patronal = lignes.reduce((s, l) => s + l.patronal, 0);
  const salarial = lignes.reduce((s, l) => s + l.salarial, 0);
  const salarialNonDeductible = lignes.filter((l) => l.nonDeductible).reduce((s, l) => s + l.salarial, 0);
  return {
    lignes, patronal, salarial,
    salarialHorsNonDeductible: salarial - salarialNonDeductible,
    salarialNonDeductible,
    net: brut - salarial,
    coutEmployeur: brut + patronal,
    nonTrouves: lignes.filter((l) => l.nonTrouve).length,
    aVerifier: lignes.filter((l) => !l.verifie).length,
  };
}

