// Pour un budget et une famille : chaque grade et chaque façon de déclarer (cachet, journée, heures).
import { calculerLigne, convertirBudget, fraisFixes, REGLAGES_DEFAUT } from './devis.js';
import { statutPourMetier, trouverPoste, unitesDisponibles, valeurUnitaire } from './catalogue.js';
import { correspondType, indexerMetiers, typeParId } from './metiers.js';
import { formatEuros, formatFrNombre } from './money.js';

const euros = (cents) => formatEuros(cents).replace(/[\u202f\u00a0]/g, ' ');
const HORAIRES = new Set(['horaire_grille', 'horaire_jauge', 'taux_horaire_calcule']);

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

function uniteHoraire(entree, conv, poste) {
  const u = unitesDisponibles(entree, conv).find((x) => !x.nonTrouve && HORAIRES.has(x.key));
  if (!u) return null;
  const v = valeurUnitaire(entree, u.key, { jauge: poste.jauge || '200', grille: poste.grille, quantite: 1 });
  if (v?.valeur == null) return null;
  return u;
}

function heuresCible(demande) {
  if (demande.kind === 'cachet' || demande.kind === 'service') return null;
  if (demande.heures) return Math.min(12, Math.max(1, Math.round(demande.heures)));
  if (demande.kind === 'heure' || demande.kind === 'jour' || !demande.kind) return 8;
  return null;
}

/**
 * Plus grand nombre d'heures entières qui tient dans le budget, quand un taux horaire est publié.
 * Rien si la grille n'a pas d'heure : on n'invente pas une demi-journée.
 */
function reduitHeures(data, entree, conv, posteModele, reglages, budget, demandees) {
  const unite = uniteHoraire(entree, conv, posteModele);
  if (!unite || !demandees) return null;
  const essai = (h) => convertirBudget(data, {
    ...posteModele,
    unite: unite.key,
    quantite: h,
    representations: h,
    demande: null,
  }, budget, reglages);
  const bas = essai(1);
  if (!bas?.possible) return { heuresMax: 0, demandees, texte: 'Même 1 h ne tient pas dans ce budget.' };
  let lo = 1;
  let hi = demandees;
  let max = 1;
  let meilleur = bas;
  while (lo <= hi) {
    const mid = Math.floor((lo + hi) / 2);
    const r = mid === 1 ? bas : essai(mid);
    if (r?.possible) { max = mid; meilleur = r; lo = mid + 1; }
    else hi = mid - 1;
  }
  if (max >= demandees) return { heuresMax: max, demandees, texte: '' };
  const net = meilleur.ligne?.cot?.net ?? 0;
  return {
    heuresMax: max,
    demandees,
    texte: `Pas ${formatFrNombre(demandees)} h mais ${formatFrNombre(max)} h : possible, brut ${euros(meilleur.brutCents)}, net ${euros(net)}.`,
  };
}

const nomCourt = (nom) => String(nom || '').split(' (')[0];

/**
 * Frais HT de chaque intermédiaire pour le même engagement.
 * #DIESE n'a pas de tarif public. Les cotisations ne changent pas, sauf le pourcentage Smart.
 */
export function comparerIntermediaires(data, poste, reglages = REGLAGES_DEFAUT) {
  return data.intermediaires.options.map((o) => {
    const r = { ...reglages, intermediaire: o.id };
    const ligne = calculerLigne(data, { ...poste, intermediaire: o.id }, r);
    const fixes = fraisFixes(data, o.id, r);
    const fixesCents = fixes.reduce((s, f) => s + f.montant, 0);
    const credits = Math.round((((ligne?.frais.credits || 0) + fixes.reduce((s, f) => s + (f.credits || 0), 0)) * 100)) / 100;
    const saisi = (ligne?.frais.details || []).some((d) => /saisi/.test(d.libelle));
    const surDevis = !!ligne?.frais.surDevis && !saisi;
    const fraisCents = surDevis ? null : (ligne ? ligne.frais.ht + fixesCents : null);
    const tva = ligne?.frais.tva || 0;
    let libelle = 'tarif non public';
    if (!surDevis && fraisCents != null) {
      if (credits) libelle = `${euros(fraisCents)} HT · ${formatFrNombre(credits)} crédits`;
      else if (tva) libelle = `${euros(fraisCents)} HT + TVA ${euros(tva)}`;
      else libelle = `${euros(fraisCents)} HT`;
    }
    return {
      id: o.id,
      nom: nomCourt(o.nom),
      fraisCents,
      surDevis,
      credits,
      tva,
      avertissements: ligne?.frais.avertissements || [],
      libelle,
    };
  });
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
    return { options: [], possible: false, minimumHt: null, note: '', typeProjet: opts.typeProjet || '', intermediaires: [] };
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
  const cible = heuresCible(demande);
  const reduits = new Map();
  const options = [];
  for (const v of membres) {
    const entree = trouverPoste(data, v.convention, v.posteId, { genre: v.genre, grille: v.grille });
    if (!entree) continue;
    const conv = data.conventions[v.convention];
    const st = statutPourMetier(entree, {});
    const cleVar = `${v.convention}|${v.posteId}|${v.genre || ''}|${v.grille || ''}`;
    if (!reduits.has(cleVar)) {
      reduits.set(cleVar, reduitHeures(data, entree, conv, {
        convention: v.convention,
        posteId: v.posteId,
        genre: v.genre || undefined,
        grille: v.grille,
        jauge: '200',
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
        bulletins: Number(extra.bulletins) > 0 ? Number(extra.bulletins) : 1,
        contrats: Number(extra.contrats) > 0 ? Number(extra.contrats) : 1,
      }, reglages, budget, cible));
    }
    const reduit = reduits.get(cleVar);
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
        bulletins: Number(extra.bulletins) > 0 ? Number(extra.bulletins) : 1,
        contrats: Number(extra.contrats) > 0 ? Number(extra.contrats) : 1,
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
        total: r.possible && r.ligne ? r.ligne.coutTotal + r.fixesCents : r.budgetMinimum,
        reduit,
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
    intermediaires: options[0] ? comparerIntermediaires(data, options[0].poste, reglages) : [],
  };
}
