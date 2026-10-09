// Pour un budget et une famille : chaque grade et chaque façon de déclarer (cachet, journée, heures).
import { convertirBudget, REGLAGES_DEFAUT } from './devis.js';
import { statutPourMetier, trouverPoste, unitesDisponibles } from './catalogue.js';
import { correspondType, indexerMetiers, typeParId } from './metiers.js';
import { formatFrNombre } from './money.js';

const KINDS = new Set(['jour', 'heure', 'cachet', 'service']);

function quantitePour(unite, demande) {
  const hNom = unite.heures || (unite.kind === 'jour' ? 8 : 1);
  if (unite.kind === 'heure') {
    if (demande.heures) return demande.heures;
    if (demande.jours) return demande.jours * (hNom > 1 ? hNom : 8);
    return 8;
  }
  if (unite.kind === 'jour') {
    if (demande.jours) return demande.jours;
    if (demande.heures && hNom) return Math.max(1, Math.round(demande.heures / hNom));
    return 1;
  }
  if (unite.kind === 'cachet' || unite.kind === 'service') {
    if (demande.cachets) return demande.cachets;
    if (demande.jours) return demande.jours;
    return 1;
  }
  return demande.semaines || 1;
}

function libelle(unite, quantite) {
  const n = formatFrNombre(quantite);
  if (unite.kind === 'heure') return quantite > 1 ? `${n} heures` : '1 heure';
  if (unite.kind === 'cachet') return quantite > 1 ? `${n} cachets` : 'Cachet';
  if (unite.kind === 'service') return quantite > 1 ? `${n} services` : 'Service';
  if (quantite > 1) return `${n} × ${unite.label}`;
  return unite.label;
}

function unitesDecla(entree, conv) {
  const toutes = unitesDisponibles(entree, conv).filter((u) => !u.nonTrouve);
  const utiles = toutes.filter((u) => KINDS.has(u.kind));
  if (utiles.length) return utiles;
  return toutes.filter((u) => u.kind === 'semaine' || u.kind === 'mois').slice(0, 1);
}

function score(o, demande) {
  let s = 0;
  if (o.possible) s += 1e12;
  else s -= o.budgetMinimum;
  if (o.possible) {
    const jourPourHeures = demande.kind === 'heure' && o.kind === 'jour' && o.heuresNominales
      && demande.heures && o.heuresNominales * o.quantite === demande.heures;
    if (demande.kind && (o.kind === demande.kind || jourPourHeures)) s += 1e9;
    if (demande.metierCle && o.cle === demande.metierCle) s += 1e10;
    if (demande.grade && o.grade === demande.grade) s += 1e8;
    else if (!demande.grade && o.grade === 'base') s += 1e8;
    else if (!demande.grade && o.grade === 'assistant') s += 1e7;
    s += o.net || 0;
  }
  return s;
}

function noteDecla(demande, options) {
  if (demande.kind === 'cachet' && options.length && !options.some((o) => o.kind === 'cachet')) {
    return 'Pas de cachet pour ce métier : on compare la journée et l’heure.';
  }
  if (demande.kind === 'heure' && options.length && !options.some((o) => o.kind === 'heure') && options.some((o) => o.kind === 'jour')) {
    return 'Pas de taux horaire publié : la journée est la déclaration pour ces heures.';
  }
  return '';
}

/**
 * Classe les façons de payer un budget pour une famille (ou un métier précis) et un type de projet.
 * Les possibles d'abord. Le premier est recommandé : le grade demandé, sinon le grade de base,
 * sur la durée demandée (8 h → journée 8 h quand c'est elle qui couvre 8 h).
 * Le statut artiste / technicien vient du métier, jamais d'un choix.
 */
export function solutionsBudget(data, opts = {}) {
  const jobs = opts.jobs || indexerMetiers(data);
  const type = typeParId(opts.typeProjet);
  if (!opts.famille && !opts.metierCle) {
    return { options: [], possible: false, minimumHt: null, note: '', typeProjet: opts.typeProjet || '' };
  }
  const demande = {
    heures: Number(opts.heures) || null,
    jours: Number(opts.jours) || null,
    cachets: Number(opts.cachets) || null,
    semaines: Number(opts.semaines) || null,
    kind: opts.kind || '',
    grade: opts.grade || '',
    metierCle: opts.metierCle || '',
  };
  const extra = opts.posteExtra || {};
  const membres = [];
  for (const job of jobs) {
    if (opts.famille && !job.familles.includes(opts.famille)) continue;
    if (!opts.famille && job.cle !== opts.metierCle) continue;
    for (const v of job.variantes) {
      if (type && !correspondType(v, type)) continue;
      membres.push({ ...v, nom: job.nom, cle: job.cle });
    }
  }
  const reglages = opts.reglages || REGLAGES_DEFAUT;
  const budget = Number(opts.budgetEuros);
  const options = [];
  for (const v of membres) {
    const entree = trouverPoste(data, v.convention, v.posteId, { genre: v.genre, grille: v.grille });
    if (!entree) continue;
    const conv = data.conventions[v.convention];
    const st = statutPourMetier(entree, {});
    for (const unite of unitesDecla(entree, conv)) {
      const quantite = quantitePour(unite, demande);
      const poste = {
        convention: v.convention,
        posteId: v.posteId,
        genre: v.genre || undefined,
        grille: v.grille,
        jauge: '200',
        unite: unite.key,
        quantite,
        representations: quantite,
        heuresParJour: extra.heuresParJour ?? '',
        heuresSemaine: extra.heuresSemaine ?? '',
        exploitationContinue: false,
        ouvrier: !!extra.ouvrier,
        heures: extra.heures || { nuit: 0, dimanche: 0, ferie: 0, premierMai: 0, ferieMineur: 0, sup: 0 },
        majoPct: extra.majoPct || { sup: '', nuit: '', dimanche: '', ferie: '' },
        statut: { categorie: st.categorie, cadre: st.cadre },
        demande: null,
        typeProjet: opts.typeProjet || '',
        famille: opts.famille || '',
        jours: extra.jours,
        bulletins: 1,
        contrats: 1,
      };
      const r = convertirBudget(data, poste, budget, reglages);
      if (!r) continue;
      if (r.possible && r.brutCents > 0) poste.demande = { montant: r.brutCents / 100, mode: 'total' };
      options.push({
        nom: v.nom,
        cle: v.cle,
        grade: v.grade,
        kind: unite.kind,
        uniteLabel: libelle(unite, quantite),
        quantite,
        heuresNominales: unite.heures || (unite.kind === 'jour' ? 8 : 0),
        possible: r.possible,
        budgetMinimum: r.budgetMinimum,
        brut: r.possible ? r.brutCents : r.minimumCents,
        net: r.ligne?.cot?.net ?? null,
        statut: { categorie: st.categorie, cadre: st.cadre },
        poste,
        convention: v.convention,
      });
    }
  }
  options.sort((a, b) => score(b, demande) - score(a, demande) || a.nom.localeCompare(b.nom, 'fr') || a.uniteLabel.localeCompare(b.uniteLabel, 'fr'));
  options.forEach((o, i) => { o.recommande = i === 0; });
  const minimumHt = options.length ? Math.min(...options.map((o) => o.budgetMinimum)) : null;
  return {
    options,
    possible: options.some((o) => o.possible),
    minimumHt,
    note: noteDecla(demande, options),
    typeProjet: opts.typeProjet || '',
  };
}
