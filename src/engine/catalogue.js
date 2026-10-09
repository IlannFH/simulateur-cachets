// Lecture des grilles : unités disponibles, filtres (genre, grille), regroupements.
// Aucun montant ici : seuls les noms de champs du JSON sont connus du code.

/** Unités simples : champ du JSON → description. `heures` = heures nominales couvertes par l'unité. */
export const UNITES = {
  minimum_journee_8h: { label: 'Journée 8 h', kind: 'jour', heures: 8 },
  minimum_journee_7h: { label: 'Journée 7 h', kind: 'jour', heures: 7 },
  minimum_journee: { label: 'Journée', kind: 'jour', heures: null },
  minimum_semaine_35h: { label: 'Semaine 35 h', kind: 'semaine', heures: 35 },
  minimum_semaine_39h: { label: 'Semaine 39 h', kind: 'semaine', heures: 39 },
  minimum_semaine: { label: 'Semaine', kind: 'semaine', heures: null },
  minimum_cachet: { label: 'Cachet', kind: 'cachet', heures: null },
  minimum_service: { label: 'Service de répétition', kind: 'service', heures: null },
  minimum_mois: { label: 'Mois', kind: 'mois', heures: 'mensuel' },
  taux_horaire_calcule: { label: 'Heure (calculée : mensuel / 151,67)', kind: 'heure', heures: 1 },
  // Unités « virtuelles » dont le taux dépend d'un choix (représentations, jauge, grille, palier)
  cachet_representation: { label: 'Cachet de représentation', kind: 'cachet', heures: null },
  horaire_jauge: { label: 'Heure (selon la jauge)', kind: 'heure', heures: 1 },
  horaire_grille: { label: 'Heure', kind: 'heure', heures: 1 },
  cachet_palier: { label: 'Cachet de représentation', kind: 'cachet', heures: null },
};

const CHAMPS_3090_CACHET = ['cachet_1_7_dates', 'cachet_8_16_dates', 'cachet_exploitation_continue'];
const CHAMPS_JAUGE = { '200': 'horaire_salle_200', '201_500': 'horaire_salle_201_500', '500_plus': 'horaire_salle_500_plus' };
export const JAUGES = [
  { id: '200', label: '≤ 200 places' },
  { id: '201_500', label: '201 à 500 places' },
  { id: '500_plus', label: '> 500 places' },
];

const sansAccent = (s) => String(s || '').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

/**
 * Artiste ou technicien, d'après la catégorie de la grille — jamais un choix de l'utilisateur.
 * « Technicien / non-artistique » (CCNEAC) reste technicien : le mot artiste n'y est pas une catégorie.
 */
export function categorieStatut(categorie = '') {
  const s = sansAccent(categorie).replace(/\bnon[-\s]+artiste\w*/g, ' ');
  return /\bartiste\b/.test(s) ? 'artiste' : 'technicien';
}

/** Cadre suggéré quand la grille ne l'impose pas. L'interface peut encore le changer. */
export function cadreParDefaut(metier = '') {
  return /^(réalisateur|directeur (?!de casting)|chef décorateur|chef opérateur(?! du son)|créateur de costumes|cadres|HMC cadres|groupe 1 )/i.test(metier);
}

/**
 * true / false si l'intitulé de la grille fixe le cadre (Cadres, Employés, Groupe 1…).
 * null si le métier laisse le choix.
 */
export function cadreImpose(metier = '') {
  const s = sansAccent(metier).trim();
  if (/^(cadres|hmc cadres|groupe 1)\b/.test(s)) return true;
  if (/^(agents de maitrise|hmc agents de maitrise|employes|hmc employes|groupe [2-9])\b/.test(s)) return false;
  return null;
}

/**
 * Statut de paie d'un métier.
 * La catégorie artiste/technicien vient toujours de la grille.
 * Le cadre vient de la grille s'il est imposé, sinon du choix (ou du défaut).
 * statut.cadre n'est respecté que lorsqu'il s'agit d'un booléen explicite.
 */
export function statutPourMetier(entree, statut = {}) {
  const categorie = categorieStatut(entree?.categorie || '');
  const impose = cadreImpose(entree?.metier || '');
  const cadre = impose != null ? impose : (typeof statut?.cadre === 'boolean' ? statut.cadre : cadreParDefaut(entree?.metier || ''));
  return { categorie, cadre, cadreEditable: impose == null };
}

/** Lignes regroupées en paliers selon le nombre de représentations dans le mois (CCNEAC). */
const RE_PALIER = /\s*\((?:(\d+) ou (\d+)|> ?(\d+)) dans le mois\)\s*$/;

/**
 * Liste des postes d'une convention, filtrée et prête pour l'interface.
 * opts.genre : filtre 2642 ; opts.grille : '2025' | '2026' pour 3090.
 * Chaque entrée : { id, categorie, departement, metier, ligne, paliers? }
 */
export function listerPostes(data, conventionKey, opts = {}) {
  const conv = data.conventions[conventionKey];
  if (!conv || !Array.isArray(conv.lignes)) return [];
  const out = [];
  const paliers = new Map();
  conv.lignes.forEach((ligne, i) => {
    if (opts.genre && ligne.genre && ligne.genre !== opts.genre) return;
    if (conventionKey === '3090' && opts.grille) {
      if (opts.grille === '2025' && /NAO 2026/.test(ligne.metier)) return;
      if (opts.grille === '2026' && /–\s*(grille\s*)?2025\s*$/.test(ligne.metier)) return;
    }
    const m = ligne.metier.match(RE_PALIER);
    if (m && ligne.minimum_cachet !== undefined) {
      const base = ligne.metier.replace(RE_PALIER, '');
      if (!paliers.has(base)) {
        const entree = { id: `${conventionKey}:p:${i}`, categorie: ligne.categorie, departement: ligne.departement, metier: `${base} (selon le nombre de représentations dans le mois)`, ligne, paliers: [] };
        paliers.set(base, entree);
        out.push(entree);
      }
      const max = m[2] ? Number(m[2]) : Infinity;
      const min = m[3] ? Number(m[3]) + 1 : Number(m[1]);
      paliers.get(base).paliers.push({ min, max, valeur: ligne.minimum_cachet, ligne });
      return;
    }
    out.push({ id: `${conventionKey}:${i}`, categorie: ligne.categorie, departement: ligne.departement, metier: ligne.metier, ligne });
  });
  return out;
}

/** Retrouve une entrée par son id (dans la liste non filtrée par genre). */
export function trouverPoste(data, conventionKey, id, opts = {}) {
  return listerPostes(data, conventionKey, opts).find((p) => p.id === id)
    || listerPostes(data, conventionKey, {}).find((p) => p.id === id) || null;
}

/** Regroupe par catégorie puis département. */
export function grouperPostes(postes) {
  const groupes = [];
  for (const p of postes) {
    let g = groupes.find((x) => x.categorie === p.categorie);
    if (!g) groupes.push((g = { categorie: p.categorie, departements: [] }));
    let d = g.departements.find((x) => x.departement === p.departement);
    if (!d) g.departements.push((d = { departement: p.departement, postes: [] }));
    d.postes.push(p);
  }
  return groupes;
}

/**
 * Unités proposées pour un poste. Renvoie [{ key, label, kind, heures, nonTrouve }].
 * Les unités dont la valeur est null restent proposées, marquées « non trouvé ».
 * Si la ligne n'a aucun champ de minimum, on propose une journée au plancher SMIC.
 */
export function unitesDisponibles(entree, conv) {
  const l = entree.ligne;
  const res = [];
  if (entree.paliers) return [{ key: 'cachet_palier', ...UNITES.cachet_palier, nonTrouve: false }];
  if (CHAMPS_3090_CACHET.some((c) => c in l)) res.push({ key: 'cachet_representation', ...UNITES.cachet_representation, nonTrouve: CHAMPS_3090_CACHET.every((c) => l[c] == null) });
  if (Object.values(CHAMPS_JAUGE).some((c) => c in l)) res.push({ key: 'horaire_jauge', ...UNITES.horaire_jauge, nonTrouve: false });
  if ('horaire_2025' in l || 'horaire_2026' in l) res.push({ key: 'horaire_grille', ...UNITES.horaire_grille, nonTrouve: false });
  for (const [k, u] of Object.entries(UNITES)) {
    if (k in l && ['minimum_journee_8h', 'minimum_journee_7h', 'minimum_journee', 'minimum_semaine_35h', 'minimum_semaine_39h', 'minimum_semaine', 'minimum_cachet', 'minimum_service', 'minimum_mois', 'taux_horaire_calcule'].includes(k)) {
      res.push({ key: k, ...u, nonTrouve: l[k] == null });
    }
  }
  if (res.length === 0) {
    const h = conv?.majorations?.journee_min_heures ?? 8;
    res.push({ key: 'minimum_journee', ...UNITES.minimum_journee, label: `Journée ${h} h`, heures: h, nonTrouve: true });
  }
  // Les unités chiffrées d'abord
  return res.sort((a, b) => Number(a.nonTrouve) - Number(b.nonTrouve));
}

/**
 * Valeur unitaire du minimum (en euros) pour une unité, ou null si non trouvée.
 * o : { representations, exploitationContinue, jauge, grille, quantite }
 * Renvoie { valeur, colonne, detail }.
 */
export function valeurUnitaire(entree, uniteKey, o = {}) {
  const l = entree.ligne;
  switch (uniteKey) {
    case 'cachet_palier': {
      const n = Math.max(1, Number(o.representations || o.quantite || 1));
      const p = entree.paliers.find((x) => n >= x.min && n <= x.max) || entree.paliers[entree.paliers.length - 1];
      return { valeur: p.valeur, colonne: p.ligne.metier, detail: `${n} représentation(s) dans le mois → palier « ${p.ligne.metier.match(RE_PALIER)?.[0].trim() ?? ''} »`, ligne: p.ligne };
    }
    case 'cachet_representation': {
      const n = Math.max(1, Number(o.representations || o.quantite || 1));
      let col = 'cachet_1_7_dates';
      if (o.exploitationContinue || n > 16) col = 'cachet_exploitation_continue';
      else if (n >= 8) col = 'cachet_8_16_dates';
      const libelle = { cachet_1_7_dates: '1 à 7 dates dans le mois', cachet_8_16_dates: '8 à 16 dates dans le mois', cachet_exploitation_continue: 'exploitation continue' }[col];
      return { valeur: l[col] ?? null, colonne: col, detail: `${n} représentation(s) → colonne « ${libelle} »` };
    }
    case 'horaire_jauge': {
      const col = CHAMPS_JAUGE[o.jauge || '200'];
      return { valeur: l[col] ?? null, colonne: col, detail: `Jauge ${JAUGES.find((j) => CHAMPS_JAUGE[j.id] === col)?.label}` };
    }
    case 'horaire_grille': {
      const col = o.grille === '2026' ? 'horaire_2026' : 'horaire_2025';
      return { valeur: l[col] ?? null, colonne: col, detail: o.grille === '2026' ? 'Grille NAO 2026' : 'Grille 2025 étendue' };
    }
    default:
      return { valeur: l[uniteKey] ?? null, colonne: uniteKey, detail: uniteKey === 'taux_horaire_calcule' ? 'calculé (mensuel / 151,67)' : '' };
  }
}
