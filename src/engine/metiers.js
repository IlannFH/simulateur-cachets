// Métiers uniques, familles (élec, caméra, son…) et types de projet en langage clair.
// Les numéros de convention ne sortent pas d'ici : l'interface les garde dans un détail.
import { listerPostes } from './catalogue.js';

const sansAccent = (s) => String(s || '').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

export const CONVENTIONS_ACTIVES = ['3097_pub', '3097_cinema', '2642', '2121', '1285', '3090'];

/** Libellés courts des familles. L'identifiant sert au parseur et au classement. */
export const FAMILLES = [
  { id: 'elec', label: 'Électricité' },
  { id: 'camera', label: 'Caméra' },
  { id: 'son', label: 'Son' },
  { id: 'machinerie', label: 'Machinerie' },
  { id: 'deco', label: 'Déco' },
  { id: 'hmc', label: 'HMC' },
  { id: 'regie', label: 'Régie' },
  { id: 'prod', label: 'Production' },
  { id: 'real', label: 'Réalisation' },
  { id: 'montage', label: 'Montage' },
  { id: 'artistes', label: 'Artistes' },
];

const REGLES_FAMILLE = [
  { id: 'son', re: /\bson\b|perch|mixeur|bruitage/ },
  { id: 'elec', re: /electricien|eclairagiste|poursuiteur|pupitreur|conducteur de groupe/ },
  { id: 'machinerie', re: /machiniste/ },
  { id: 'camera', re: /cadreur|prise de vues|directeur photo|photograph|photographe|\boperateur\b/ },
  { id: 'hmc', re: /maquillage|maquilleur|coiffeur|costum|habilleur|styliste|couturier|\bhmc\b/ },
  { id: 'deco', re: /decor|ensemblier|accessoir/ },
  { id: 'montage', re: /monteur|etalon/ },
  { id: 'regie', re: /regisseur|\bregie\b/ },
  { id: 'prod', re: /\bprod(?:uction|ucteur)?\b/ },
  { id: 'real', re: /realisateur|scripte/ },
  { id: 'artistes', re: /artiste|comedien|danseur|musicien|figurant|silhouette|mannequin|doublure|cirque|choregraph|varietes/ },
];

/**
 * Types de projet affichés. `genre` vide = toute la convention.
 * Clip et édito partagent la grille audiovisuelle fiction / documentaire :
 * le choix nomme le tournage, le minimum publié est le même.
 * Les lignes 2642 sans genre (artistes d'émission) ne collent qu'à Télé.
 */
export const TYPES_PROJET = [
  { id: 'clip', label: 'Clip', convention: '2642', genre: 'Fiction / documentaire', aussi: [{ convention: '2121', genre: '' }] },
  { id: 'edito', label: 'Édito / mode', convention: '2642', genre: 'Fiction / documentaire' },
  { id: 'pub', label: 'Pub', convention: '3097_pub', genre: '' },
  { id: 'film', label: 'Film / fiction', convention: '3097_cinema', genre: '' },
  { id: 'tele', label: 'Télé', convention: '2642', genre: 'Flux (émissions TV)' },
  { id: 'spectacle', label: 'Captation / spectacle', convention: '3090', genre: '' },
  { id: 'spectacle_sub', label: 'Spectacle subventionné', convention: '1285', genre: '' },
];

export const labelFamille = (id) => FAMILLES.find((f) => f.id === id)?.label || '';
export const typeParId = (id) => TYPES_PROJET.find((t) => t.id === id) || null;

export function labelType(id) {
  if (id === 'spectacle_sub') return 'Captation / spectacle';
  return typeParId(id)?.label || '';
}

/** Nom sans l'année de grille ni la mention de palier, pour regrouper le même métier. */
export function nomAffiche(metier = '') {
  return String(metier)
    .replace(/\s*\(selon le nombre de représentations dans le mois\)\s*$/i, '')
    .replace(/\s+[–—-]\s+(?:grille\s+)?(?:NAO\s+)?20\d{2}\s*$/i, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export const cleMetier = (nom) => sansAccent(nomAffiche(nom));

/** chef / assistant / base, pour recommander le grade qui correspond aux mots saisis. */
export function gradeDe(metier = '') {
  const n = sansAccent(metier).trim();
  if (/^(employes|hmc employes)\b/.test(n)) return 'assistant';
  if (/sous-chef|\bassistants?\b|\bauxiliaires?\b|\badjoints?\b|\brenforts?\b|\b2e assistant\b|\b1er assistant\b/.test(n)
    && !/^(cadres|agents de maitrise|hmc cadres|hmc agents)\b/.test(n)) return 'assistant';
  if (/^(cadres|agents de maitrise|hmc cadres|hmc agents)\b/.test(n)) return 'chef';
  if (/\b(chefs?|directeurs?|realisateurs?|concepteurs?|createurs?)\b/.test(n)) return 'chef';
  return 'base';
}

/**
 * Familles d'un intitulé. Une ligne fourre-tout (« Agents de maîtrise : régisseur, chef électricien, … »)
 * entre dans chaque famille citée. Un intitulé simple n'a que la famille la plus précise.
 */
export function famillesDe(metier = '') {
  const n = sansAccent(metier);
  const omnibus = /:/.test(metier) && (String(metier).match(/,/g) || []).length >= 2;
  const ids = [];
  for (const r of REGLES_FAMILLE) {
    if (!r.re.test(n)) continue;
    if (r.id === 'real' && /realisateur lumiere/.test(n)) continue;
    ids.push(r.id);
    if (!omnibus) break;
  }
  return ids;
}

function scoreAnnee(metier) {
  if (/NAO\s*2026/i.test(metier)) return 3;
  if (/2026/.test(metier)) return 2;
  if (/2025/.test(metier)) return 1;
  return 2;
}

function memeGrille(variante, cible, type) {
  if (variante.convention !== cible.convention) return false;
  if (!cible.genre) return !variante.genre;
  if (variante.genre) return variante.genre === cible.genre;
  return type.id === 'tele';
}

/** Une variante correspond à un type si la convention (et le genre, pour l'audiovisuel) collent. */
export function correspondType(variante, type) {
  if (!variante || !type) return false;
  if (variante.projets?.length) return variante.projets.includes(type.id);
  const cibles = [{ convention: type.convention, genre: type.genre || '' }, ...(type.aussi || [])];
  return cibles.some((c) => memeGrille(variante, c, type));
}

/**
 * Types proposés pour ces variantes. Un seul spectacle affiché « Captation / spectacle ».
 * Les deux (privé et subventionné) restent distincts, sans numéro de convention.
 */
export function typesDisponibles(variantes = []) {
  const out = [];
  for (const t of TYPES_PROJET) {
    const hit = variantes.find((v) => correspondType(v, t));
    if (hit) out.push({ ...t, variante: hit });
  }
  const hasPrive = out.some((t) => t.id === 'spectacle');
  const hasSub = out.some((t) => t.id === 'spectacle_sub');
  if (hasSub && !hasPrive) out.find((t) => t.id === 'spectacle_sub').label = 'Captation / spectacle';
  return out;
}

/** Libellé clair d'une ligne déjà enregistrée (devis), sans numéro. */
export function labelPourPoste(poste = {}) {
  if (poste.typeProjet) return labelType(poste.typeProjet);
  if (poste.convention === '3097_pub') return 'Pub';
  if (poste.convention === '3097_cinema') return 'Film / fiction';
  if (poste.convention === '2121') return 'Clip';
  if (poste.convention === '2642' && poste.genre === 'Flux (émissions TV)') return 'Télé';
  if (poste.convention === '2642') return 'Clip';
  if (poste.convention === '1285' || poste.convention === '3090') return 'Captation / spectacle';
  return '';
}

/**
 * Un métier = un nom, quelle que soit la convention.
 * Chaque variante garde la convention, le genre et l'identifiant de ligne.
 * 2025 et 2026 du même nom : on garde 2026 (la colonne ou la ligne).
 */
export function indexerMetiers(data) {
  const jobs = new Map();
  for (const key of CONVENTIONS_ACTIVES) {
    for (const p of listerPostes(data, key)) {
      const nom = nomAffiche(p.metier);
      const cle = cleMetier(nom);
      if (!cle) continue;
      const genre = p.ligne?.genre || '';
      const variante = {
        convention: key,
        genre,
        posteId: p.id,
        grille: scoreAnnee(p.metier) >= 2 ? '2026' : '2025',
        grade: gradeDe(p.metier),
        categorie: p.categorie,
        metier: p.metier,
        projets: p.ligne?.projets || null,
      };
      let job = jobs.get(cle);
      if (!job) {
        job = { cle, nom, categorie: p.categorie, familles: famillesDe(p.metier), variantes: [] };
        jobs.set(cle, job);
      }
      const i = job.variantes.findIndex((v) => v.convention === key && v.genre === genre);
      if (i < 0) job.variantes.push(variante);
      else if (scoreAnnee(p.metier) > scoreAnnee(job.variantes[i].metier)) job.variantes[i] = variante;
    }
  }
  return [...jobs.values()].sort((a, b) => a.nom.localeCompare(b.nom, 'fr'));
}
