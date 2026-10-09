// Surcharges locales des données (taux, tarifs, paramètres).
export const AVERTISSEMENT = "Simulation indicative, ce n'est pas un conseil de paie. Les minima et les taux proviennent des grilles et des barèmes publiés (sources et dates d'effet indiquées pour chaque chiffre) et peuvent avoir changé. Les taux URSSAF des techniciens, le taux AT/MP, les réductions de cotisations et les abattements sont à vérifier auprès de votre gestionnaire de paie (Movinmotion ou autre) ou de votre expert-comptable. Le minimum conventionnel ne remplace pas la lecture de la convention collective ni des avenants en vigueur.";

/** Nombre utilisable, ou null si vide, illisible ou non fini. */
const nombreFini = (v) => {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/** Applique les surcharges locales (taux, tarifs, paramètres) à une copie des données. Une valeur illisible est ignorée : l'ancienne valeur du JSON reste. */
export function appliquerSurcharges(data, s = {}) {
  const d = structuredClone(data);
  for (const [code, v] of Object.entries(s.cotisations || {})) {
    const l = d.cotisations.lignes.find((x) => x.code === code);
    if (!l || !v || typeof v !== 'object') continue;
    const pat = nombreFini(v.patronal);
    const sal = nombreFini(v.salarial);
    if (pat !== null) l.patronal = pat;
    if (sal !== null) l.salarial = sal;
  }
  for (const [k, v] of Object.entries(s.parametres || {})) {
    const n = nombreFini(v);
    if (n !== null) d.cotisations.parametres_calcul[k] = n;
  }
  const smic = nombreFini(s.smic);
  if (smic !== null && smic > 0) d.cotisations.smic_horaire_brut.valeur = smic;
  const p1 = nombreFini(s.plafondT1);
  if (p1 !== null && p1 > 0) d.cotisations.plafonds_2026.plafond_journalier_intermittent_cadre_T1 = p1;
  for (const [id, v] of Object.entries(s.intermediaires || {})) {
    const o = d.intermediaires.options.find((x) => x.id === id);
    if (!o) continue;
    for (const [k, val] of Object.entries(v)) {
      const n = nombreFini(val);
      if (n === null) continue;
      if (k.startsWith('abonnement.')) o.abonnement_mensuel_ht[k.split('.')[1]] = n;
      else o[k] = n;
    }
  }
  return d;
}
