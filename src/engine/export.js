// Export CSV (Excel FR : UTF-8 avec BOM, « ; », virgule décimale) et surcharges locales des données.
import { formatDecimal } from './money.js';
import { lignesRecapDevis } from './devis.js';

export const AVERTISSEMENT = "Simulation indicative, ce n'est pas un conseil de paie. Les minima et les taux proviennent des grilles et des barèmes publiés (sources et dates d'effet indiquées pour chaque chiffre) et peuvent avoir changé. Les taux URSSAF des techniciens, le taux AT/MP, les réductions de cotisations et les abattements sont à vérifier auprès de votre gestionnaire de paie (Movinmotion ou autre) ou de votre expert-comptable. Le minimum conventionnel ne remplace pas la lecture de la convention collective ni des avenants en vigueur.";

const cell = (v) => {
  const s = v === null || v === undefined ? '' : String(v);
  return /[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const row = (cols) => cols.map(cell).join(';');
const dec = (c) => (c === null || c === undefined ? '' : formatDecimal(c));

export const COLONNES_CSV = ['Convention', 'IDCC', 'Métier', 'Statut', 'Unité', 'Quantité', 'Heures majorées (détail)', 'Minimum', 'Montant brut proposé', 'Écart (€)', 'Écart (%)', 'Brut retenu', 'Cotisations patronales', 'Cotisations salariales', 'Coût employeur', 'Intermédiaire', "Frais d'intermédiaire HT", 'Coût total', "Date d'effet", 'Source'];

/** Construit le texte CSV (avec BOM) du devis. */
export function devisCSV(devis, meta = {}) {
  const out = [];
  if (meta.projet) out.push(row(['Projet', meta.projet]));
  out.push(row(COLONNES_CSV));
  for (const l of devis.lignes) {
    const m = l.min;
    const statut = `${l.statut.categorie === 'artiste' ? 'Artiste' : 'Technicien'} ${l.statut.cadre ? 'cadre' : 'non cadre'}`;
    const maj = m.majorations.map((x) => `${x.libelle} : ${String(x.heures).replace('.', ',')} h`).join(' | ');
    out.push(row([
      m.conv.nom, m.conv.idcc, m.entree.metier, statut, m.unite.label, String(m.quantite).replace('.', ','), maj,
      dec(m.minimumCents), l.demande ? dec(l.demande.cents) : '', l.demande ? dec(l.demande.ecartCents) : '',
      l.demande && l.demande.ecartPct !== null ? String(l.demande.ecartPct).replace('.', ',') : '',
      dec(l.brutCents), dec(l.cot.patronal), dec(l.cot.salarial), dec(l.cot.coutEmployeur),
      l.frais.option.nom, dec(l.frais.ht), dec(l.coutTotal), m.ligne.date_effet || '', m.ligne.source || '',
    ]));
  }
  const total = (lib, c) => {
    const r = new Array(COLONNES_CSV.length).fill('');
    r[0] = lib; r[17] = dec(c); return row(r);
  };
  out.push('');
  for (const [lib, c] of lignesRecapDevis(devis).detail) out.push(total(lib, c));
  out.push('');
  out.push(row([AVERTISSEMENT]));
  return '﻿' + out.join('\r\n') + '\r\n';
}

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
