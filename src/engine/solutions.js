// Pour un budget et une famille : chaque grade et chaque façon de déclarer (cachet, journée, heures).
import { calculerLigne, convertirBudget, fraisFixes, REGLAGES_DEFAUT } from './devis.js';
import { categorieStatut, statutPourMetier, trouverPoste, unitesDisponibles, valeurUnitaire } from './catalogue.js';
import { correspondType, indexerMetiers, typeParId } from './metiers.js';
import { formatEuros, formatFrNombre, toCents } from './money.js';
import { dureeResume, phraseSansHoraire } from './resume.js';

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
  if (demande.metierCle && o.cle === demande.metierCle) s += 1e13;
  if (o.possible) {
    const jourPourHeures = demande.kind === 'heure' && o.kind === 'jour' && o.heuresNominales
      && demande.heures && o.heuresNominales * o.quantite === demande.heures;
    if (demande.kind && (o.kind === demande.kind || jourPourHeures)) s += 1e9;
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
  const employeur = meilleur.ligne?.cot?.coutEmployeur ?? 0;
  const total = (meilleur.ligne?.coutTotal ?? 0) + (meilleur.fixesCents || 0);
  return {
    heuresMax: max,
    demandees,
    texte: `Pas ${formatFrNombre(demandees)} h mais ${formatFrNombre(max)} h : possible, coût employeur ${euros(employeur)}, coût total ${euros(total)} HT. Brut ${euros(meilleur.brutCents)}, net ${euros(net)}.`,
  };
}

const nomCourt = (nom) => String(nom || '').split(' (')[0];

function texteHeures(brutCents, tauxCents) {
  const minutes = Math.round((brutCents * 60) / tauxCents);
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (!m) return `${formatFrNombre(h)} h`;
  return `${formatFrNombre(h)} h ${String(m).padStart(2, '0')}`;
}

function articlePour(ligne, convention, categorie) {
  if (ligne?.article) return ligne.article;
  if (categorie === 'artiste' && convention === '2642') return 'art. 5.1';
  if (convention === '2121') return 'art. 2.2.1';
  if (categorie !== 'artiste' && convention === '2642') return 'art. IV.2.1';
  return '';
}

/**
 * Ce que ce brut maximum achète, dans l'unité que la convention publie.
 * Heures seulement si un taux horaire est publié. Une journée ou un cachet
 * indivisible ne devient pas « 4 h 30 ».
 */
export function dureeAuBrut({
  brutPlafondCents = 0,
  minimumCents = 0,
  employeurCents = 0,
  totalCents = 0,
  tauxHoraireCents = null,
  kind = '',
  article = '',
  heuresMax = null,
  serviceCents = null,
  heuresService = null,
} = {}) {
  const tete = `Coût employeur ${euros(employeurCents)}, coût total ${euros(totalCents)} HT.`;
  const art = article ? `, ${article}` : '';
  if (kind === 'heure' && tauxHoraireCents > 0) {
    return `${tete} Brut maximum ${euros(brutPlafondCents)} = ${texteHeures(brutPlafondCents, tauxHoraireCents)} (minimum horaire ${euros(tauxHoraireCents)}).`;
  }
  if (kind === 'service' && serviceCents > 0) {
    const n = Math.floor(brutPlafondCents / serviceCents);
    const mot = n > 1 ? 'services' : 'service';
    if (n < 1) return `${tete} Brut maximum ${euros(brutPlafondCents)}. Ça ne couvre pas un service (minimum ${euros(serviceCents)}${art}).`;
    const de = heuresService ? ` de ${formatFrNombre(heuresService)} h` : '';
    return `${tete} Brut maximum ${euros(brutPlafondCents)} = ${formatFrNombre(n)} ${mot}${de} (minimum ${euros(serviceCents)}${art}).`;
  }
  if (kind === 'semaine' || kind === 'mois') {
    if (brutPlafondCents < minimumCents) return `${tete} Brut maximum ${euros(brutPlafondCents)}. Ça ne couvre pas le minimum (${euros(minimumCents)}${art}).`;
    return '';
  }
  const unite = kind === 'cachet' ? 'un cachet indivisible' : 'une journée indivisible';
  if (!(brutPlafondCents >= minimumCents)) {
    return `${tete} Brut maximum ${euros(brutPlafondCents)}. Ça ne couvre pas ${unite} (minimum ${euros(minimumCents)}${art}).`;
  }
  const max = heuresMax ? `, ${formatFrNombre(heuresMax)} h de travail effectif au plus` : '';
  const mot = kind === 'cachet' ? 'Cachet indivisible' : 'Journée indivisible';
  return `${tete} ${mot} : minimum ${euros(minimumCents)}${max}${art}. Pas de prorata horaire.`;
}

function tauxDeLoption(data, entree, unite, poste) {
  if (!HORAIRES.has(unite.key) || unite.nonTrouve) return null;
  const v = valeurUnitaire(entree, unite.key, { jauge: poste.jauge || '200', grille: poste.grille, quantite: 1 });
  if (v?.valeur == null) return null;
  const smic = toCents(data.cotisations.smic_horaire_brut.valeur);
  return Math.max(toCents(v.valeur), smic);
}

/**
 * Frais HT de chaque intermédiaire pour le même engagement.
 * #DIESE n'a pas de tarif public. Les cotisations ne changent pas, sauf le pourcentage Smart.
 */
export function comparerIntermediaires(data, poste, reglages = REGLAGES_DEFAUT) {
  return data.intermediaires.options.filter((o) => o.id !== 'direct').map((o) => {
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

function noteDecla(demande, options, ctx = {}) {
  if (demande.kind === 'cachet' && options.length && !options.some((o) => o.kind === 'cachet')) {
    return 'Pas de cachet pour ce métier : on compare la journée et l’heure.';
  }
  const aHeure = options.some((o) => o.kind === 'heure');
  const regle = phraseSansHoraire({
    typeProjet: ctx.typeProjet || '',
    convention: options[0]?.convention || '',
    categorie: options[0]?.statut?.categorie || '',
    aHeure,
  });
  if (regle) return regle;
  if (demande.kind === 'heure' && options.length && !aHeure && options.some((o) => o.kind === 'jour')) {
    return 'Pas de tarif horaire ni de demi-journée : la journée publiée est la déclaration pour ces heures.';
  }
  return '';
}

/**
 * Classe les façons de payer un budget pour une famille (ou un métier précis) et un type de projet.
 * Les possibles d'abord. Le premier est recommandé : le grade demandé, sinon le grade de base,
 * sur la durée demandée (8 h → journée 8 h quand c'est elle qui couvre 8 h).
 * Le statut artiste / technicien vient du métier. S'il est déjà connu, l'autre grille est écartée.
 */
export function solutionsBudget(data, opts = {}) {
  const jobs = opts.jobs || indexerMetiers(data);
  const type = typeParId(opts.typeProjet);
  if (!opts.famille && !opts.metierCle) {
    return { options: [], possible: false, minimumHt: null, note: '', typeProjet: opts.typeProjet || '', intermediaires: [], reco: null };
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
  const plier = (xs) => (xs || []).map((r) => String(r).normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()).filter(Boolean);
  const roles = plier(opts.roles);
  const sauf = plier(opts.sauf);
  for (const job of jobs) {
    if (opts.famille && !job.familles.includes(opts.famille)) continue;
    if (!opts.famille && job.cle !== opts.metierCle) continue;
    if (roles.length || sauf.length) {
      const nom = job.nom.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
      if (roles.length && !roles.some((r) => nom.includes(r))) continue;
      if (sauf.some((r) => nom.includes(r))) continue;
    }
    for (const v of job.variantes) {
      if (type && !correspondType(v, type)) continue;
      const cat = categorieStatut(v.categorie);
      if (opts.statut === 'artiste' && cat !== 'artiste') continue;
      if (opts.statut === 'technicien' && cat === 'artiste') continue;
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
      // Au-dessus de 7 h, la colonne publiée est la journée de 8 h. À 7 h et en dessous, le plancher est la journée de 7 h.
      if (unite.key === 'minimum_journee_7h' && Number(demande.heures) > 7) continue;
      if (unite.key === 'minimum_journee_8h' && Number(demande.heures) > 0 && Number(demande.heures) <= 7) continue;
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
      const taux = tauxDeLoption(data, entree, unite, poste);
      const serviceCents = unite.kind === 'service' && entree.ligne.minimum_service != null ? toCents(entree.ligne.minimum_service) : null;
      const lecture = dureeAuBrut({
        brutPlafondCents: r.brutCents,
        minimumCents: r.minimumCents,
        employeurCents: r.ligne?.cot?.coutEmployeur ?? r.employeurCents,
        totalCents: r.ligne ? r.ligne.coutTotal + r.fixesCents : r.budgetMinimum,
        tauxHoraireCents: taux,
        kind: unite.kind,
        article: articlePour(entree.ligne, v.convention, st.categorie),
        heuresMax: entree.ligne.heures_max || null,
        serviceCents,
        heuresService: entree.ligne.heures_service || null,
      });
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
        brutPlafond: r.brutCents,
        lecture,
        net: r.netCents ?? null,
        employeur: r.employeurCents ?? null,
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
    note: noteDecla(demande, options, { typeProjet: opts.typeProjet || '' }),
    typeProjet: opts.typeProjet || '',
    intermediaires: options[0] ? comparerIntermediaires(data, options[0].poste, reglages) : [],
    reco: maReco(data, { options, reglages, budgetEuros: budget, demande }),
  };
}

function inutilisable(comparaison, resultat) {
  if (comparaison && (comparaison.surDevis || comparaison.fraisCents == null)) return true;
  if (comparaison && (comparaison.avertissements || []).some((a) => /GUSO/.test(a))) return true;
  const textes = (resultat?.avertissements || []).map((a) => a.texte).join(' ');
  return /GUSO|sur devis/.test(textes);
}

function nomService(data, id) {
  const o = data.intermediaires.options.find((x) => x.id === id);
  return nomCourt(o?.nom || id);
}

function tarifPublic(x) {
  return x.id !== 'direct' && !x.surDevis && x.fraisCents != null && !(x.avertissements || []).some((a) => /GUSO/.test(a));
}

function joindre(parts) {
  if (parts.length <= 1) return parts[0] || '';
  if (parts.length === 2) return `${parts[0]} et ${parts[1]}`;
  return `${parts.slice(0, -1).join(', ')} et ${parts.at(-1)}`;
}

function phraseDe(action, c) {
  const phrase = `${action.charAt(0).toUpperCase()}${action.slice(1)}.`;
  const chiffres = `Coût employeur ${euros(c.employeur)}, coût total ${euros(c.total)} HT.`;
  const secondaire = `Brut ${euros(c.brut)}, net ${euros(c.net)}.`;
  return { ...c, phrase, chiffres, secondaire, texte: `${phrase} ${chiffres} ${secondaire}` };
}

/**
 * Une seule suite concrète : un métier de la famille, un intermédiaire au tarif public,
 * une durée plus courte seulement si la grille publie l'heure, sinon le budget exact.
 * La paie interne (sans intermédiaire), GUSO bloqué et le tarif sur devis (#DIESE) ne sont pas proposés.
 */
export function maReco(data, { options, reglages, budgetEuros, demande }) {
  if (!options?.length) return null;
  const courant = options.find((o) => o.recommande) || options[0];
  const regs0 = reglages || REGLAGES_DEFAUT;
  const budget = Number(budgetEuros);
  const ids = comparerIntermediaires(data, { ...courant.poste, demande: null }, regs0)
    .filter(tarifPublic)
    .map((x) => x.id);
  if (courant.possible && ids.includes(regs0.intermediaire)) {
    return phraseDe(`prends ${courant.nom}, ${dureeResume(courant)}`, {
      id: regs0.intermediaire,
      cle: courant.cle,
      nom: courant.nom,
      brut: courant.brut,
      net: courant.net,
      employeur: courant.employeur,
      total: courant.total,
      possible: true,
      heures: null,
    });
  }
  const vus = new Set();
  const candidats = [];
  for (const o of options) {
    const cle = `${o.cle}|${o.kind}|${o.quantite}`;
    if (vus.has(cle)) continue;
    vus.add(cle);
    for (const id of ids) {
      const regs = { ...regs0, intermediaire: id };
      const poste = { ...o.poste, demande: null, intermediaire: id };
      const r = convertirBudget(data, poste, budget, regs);
      if (!r || inutilisable(null, r)) continue;
      const ligneMin = calculerLigne(data, poste, regs);
      const fixesCents = fraisFixes(data, id, regs).reduce((s, f) => s + f.montant, 0);
      const possible = !!r.possible;
      candidats.push({
        id,
        cle: o.cle,
        nom: o.nom,
        kind: o.kind,
        quantite: o.quantite,
        heuresNominales: o.heuresNominales,
        poste,
        possible,
        serviceNom: nomService(data, id),
        brut: possible ? r.brutCents : ligneMin.brutCents,
        net: possible ? r.ligne.cot.net : ligneMin.cot.net,
        employeur: possible ? r.ligne.cot.coutEmployeur : ligneMin.cot.coutEmployeur,
        total: possible ? r.ligne.coutTotal + r.fixesCents : ligneMin.coutTotal + fixesCents,
        heures: null,
      });
    }
  }
  const tient = candidats.filter((c) => c.possible);
  const meilleur = (liste, cmp) => liste.reduce((a, b) => (cmp(b, a) ? b : a));
  if (tient.length) {
    const g = meilleur(tient, (a, b) => a.net > b.net || (a.net === b.net && a.total < b.total));
    return phraseDe(actionDe(g, courant, regs0, demande), g);
  }
  const cible = heuresCible(demande || {});
  const heures = [];
  const deja = new Set();
  for (const o of options) {
    const k = `${o.convention}|${o.poste.posteId}|${o.poste.genre || ''}|${o.poste.grille || ''}`;
    if (deja.has(k) || !cible) continue;
    deja.add(k);
    const entree = trouverPoste(data, o.poste.convention, o.poste.posteId, { genre: o.poste.genre, grille: o.poste.grille });
    const conv = data.conventions[o.poste.convention];
    if (!entree || !uniteHoraire(entree, conv, o.poste)) continue;
    for (const id of ids) {
      const regs = { ...regs0, intermediaire: id };
      const red = reduitHeures(data, entree, conv, { ...o.poste, demande: null, intermediaire: id }, regs, budget, cible);
      if (!red || !(red.heuresMax > 0) || red.heuresMax >= cible) continue;
      const poste = { ...o.poste, demande: null, intermediaire: id, unite: uniteHoraire(entree, conv, o.poste).key, quantite: red.heuresMax, representations: red.heuresMax };
      const r = convertirBudget(data, poste, budget, regs);
      if (!r?.possible || inutilisable(null, r)) continue;
      heures.push({
        id,
        cle: o.cle,
        nom: o.nom,
        kind: 'heure',
        quantite: red.heuresMax,
        heuresNominales: 1,
        possible: true,
        serviceNom: nomService(data, id),
        brut: r.brutCents,
        net: r.ligne.cot.net,
        employeur: r.ligne.cot.coutEmployeur,
        total: r.ligne.coutTotal + r.fixesCents,
        heures: red.heuresMax,
        demandees: cible,
      });
    }
  }
  if (heures.length) {
    const g = meilleur(heures, (a, b) => a.heures > b.heures || (a.heures === b.heures && a.net > b.net));
    return phraseDe(actionDe(g, courant, regs0, demande), g);
  }
  if (!candidats.length) return null;
  const g = meilleur(candidats, (a, b) => a.total < b.total || (a.total === b.total && a.net > b.net));
  return phraseDe(actionDe(g, courant, regs0, demande), g);
}

function actionDe(c, courant, reglages, demande) {
  const parts = [];
  const autreMetier = c.cle !== courant.cle;
  const autreService = c.id !== (reglages.intermediaire || REGLAGES_DEFAUT.intermediaire);
  const moinsDheures = c.heures && demande?.heures && c.heures < demande.heures;
  if (autreMetier) parts.push(`prends ${c.nom}`);
  if (autreService && moinsDheures) {
    const n = formatFrNombre(c.heures);
    parts.push(`passe par ${c.serviceNom}, à ${n} h`);
  } else if (autreService) {
    parts.push(`passe par ${c.serviceNom}`);
  } else if (moinsDheures) {
    parts.push(`passe à ${formatFrNombre(c.heures)} h`);
  }
  if (!c.possible) parts.push(parts.length ? `monte à ${euros(c.total)} HT` : `monte le budget à ${euros(c.total)} HT`);
  if (!parts.length) parts.push(`prends ${c.nom}, ${dureeResume(c)}`);
  return joindre(parts);
}
