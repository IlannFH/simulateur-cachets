// Parcours en trois branches. Le statut artiste/technicien vient du métier.
import * as E from '../engine/index.js';

const LS = {
  reglages: 'simcachets.reglages.v1',
  surcharges: 'simcachets.surcharges.v1',
  form: 'simcachets.form.v1',
  theme: 'simcachets.theme.v1',
};
const $ = (s, r = document) => r.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/\p{M}/gu, '');
const lien = (url, label) => (url ? `<a href="${esc(url)}" target="_blank" rel="noopener">${esc(label || url)}</a>` : '');
const lsGet = (k, d) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* quota */ } };

const heuresVides = () => ({ nuit: '', dimanche: '', ferie: '', premierMai: '', ferieMineur: '', sup: '' });
const majoVides = () => ({ sup: '', nuit: '', dimanche: '', ferie: '' });
function parcoursVide() {
  return {
    depart: null, etape: 'depart', montant: '', convention: '', posteId: null, recherche: '',
    phrase: '', famille: '', typeProjet: '', grade: '', kindDemande: '', metierCle: '',
    roles: [], sauf: [], choix: [], question: '',
    heuresDemandees: '', joursDemandes: '', cachetsDemandes: '',
    genre: '', grille: '2025', jauge: '200', unite: null, quantite: '1', representations: '',
    exploitationContinue: false, ouvrier: false, heuresParJour: '', heuresSemaine: '', joursProrata: '',
    heures: heuresVides(), majoPct: majoVides(), cadre: null, cadreTouche: false,
    jours: '', bulletins: '1', contrats: '1', intermediaire: '', fraisManuel: '',
    avance: false, abattementPct: '', rgduPct: '', affinerOuvert: false, calculOuvert: false, highlight: 0, ouvert: false,
  };
}

let RAW = null;
let DATA = null;
let JOBS = [];
let sourcesDessine = false;
const state = {
  parcours: parcoursVide(),
  reglages: { ...E.REGLAGES_DEFAUT },
  surcharges: {},
};

function setPath(obj, path, v) {
  const ks = path.split('.');
  let cur = obj;
  ks.slice(0, -1).forEach((k) => { cur[k] = cur[k] && typeof cur[k] === 'object' ? cur[k] : {}; cur = cur[k]; });
  cur[ks.at(-1)] = v;
}
function indexer() {
  JOBS = E.indexerMetiers(DATA);
}
function vue() {
  return location.hash === '#sources' ? 'sources' : 'simuler';
}
function sauverForm() {
  const p = { ...state.parcours, ouvert: false };
  lsSet(LS.form, { parcours: p });
}
function sauverReglages() { lsSet(LS.reglages, state.reglages); }

function entreeCourante() {
  const p = state.parcours;
  if (!p.posteId || !p.convention) return null;
  return E.trouverPoste(DATA, p.convention, p.posteId, { genre: p.genre, grille: p.grille });
}
function unitesCourantes(e = entreeCourante()) {
  if (!e) return [];
  return E.unitesDisponibles(e, DATA.conventions[state.parcours.convention]);
}
function uniteCourante() {
  const us = unitesCourantes();
  return us.find((u) => u.key === state.parcours.unite) || us[0] || null;
}
function statutCourant(e = entreeCourante()) {
  if (!e) return { categorie: 'technicien', cadre: false, cadreEditable: true };
  const souhait = state.parcours.cadreTouche ? { cadre: !!state.parcours.cadre } : {};
  return E.statutPourMetier(e, souhait);
}
const libelleStatut = (s) => `${s.categorie === 'artiste' ? 'Artiste' : 'Technicien'} · ${s.cadre ? 'cadre' : 'non-cadre'}`;

function assurerMetier() {
  const p = state.parcours;
  if ((p.metierCle && p.famille) || !p.posteId) return;
  const job = JOBS.find((j) => j.variantes.some((v) => v.posteId === p.posteId && v.convention === p.convention));
  if (!job) return;
  if (!p.metierCle) p.metierCle = job.cle;
  if (!p.famille) p.famille = job.familles[0] || '';
  if (!p.typeProjet) {
    const match = E.typesDisponibles(job.variantes).find((t) => t.variante.posteId === p.posteId && t.variante.convention === p.convention);
    if (match) p.typeProjet = match.id;
  }
}
function jobCourant() {
  return JOBS.find((j) => j.cle === state.parcours.metierCle) || null;
}
function typesCourants() {
  const p = state.parcours;
  if (p.metierCle && jobCourant()) return E.typesDisponibles(jobCourant().variantes);
  if (p.famille) {
    const vars = JOBS.filter((j) => j.familles.includes(p.famille)).flatMap((j) => j.variantes);
    return E.typesDisponibles(vars);
  }
  return [];
}
function variantePourResultat() {
  const p = state.parcours;
  const t = E.typeParId(p.typeProjet);
  const ok = (v) => !t || E.correspondType(v, t);
  if (p.metierCle && jobCourant()) return jobCourant().variantes.find(ok) || (t ? null : jobCourant().variantes[0]) || null;
  const vars = [];
  for (const j of JOBS) {
    if (!p.famille || !j.familles.includes(p.famille)) continue;
    for (const v of j.variantes) if (ok(v)) vars.push(v);
  }
  const grade = p.grade || 'base';
  return vars.find((v) => v.grade === grade) || vars.find((v) => v.grade === 'base') || vars[0] || null;
}
function lierPoste() {
  const p = state.parcours;
  const v = variantePourResultat();
  if (!v) return;
  p.convention = v.convention;
  p.posteId = v.posteId;
  p.genre = v.genre || '';
  p.grille = v.grille || '2026';
  const us = unitesCourantes(entreeCourante());
  const kind = p.kindDemande;
  const u = us.find((x) => x.kind === kind) || (kind === 'heure' ? us.find((x) => x.kind === 'jour') : null) || us[0];
  p.unite = u?.key || null;
  if (kind === 'heure' && u?.kind === 'heure' && p.heuresDemandees) p.quantite = String(p.heuresDemandees);
  else if (kind === 'jour' && p.joursDemandes) p.quantite = String(p.joursDemandes);
  else if (kind === 'cachet' && p.cachetsDemandes) p.quantite = String(p.cachetsDemandes);
  else if (u?.kind === 'heure' && (p.quantite === '1' || !p.quantite)) p.quantite = '8';
}
function etapeManquante() {
  const p = state.parcours;
  if ((p.depart === 'budget' || p.depart === 'brut') && erreurMontant()) return 'montant';
  if (p.choix?.length && !p.metierCle) return 'choix';
  if (!p.metierCle && (p.depart !== 'budget' || !p.famille)) return 'metier';
  if (typesCourants().length > 1 && !p.typeProjet) return 'projet';
  if (!p.typeProjet && typesCourants().length === 1) p.typeProjet = typesCourants()[0].id;
  lierPoste();
  if (p.depart !== 'budget' && !p.kindDemande) return 'quantite';
  return 'resultat';
}
function appliquerPhrase() {
  const p = state.parcours;
  const a = E.analyserPhrase(p.phrase, JOBS);
  const err = $('#err-phrase');
  if (!a.reconnu) {
    if (err) err.textContent = 'Écris un montant, un métier ou un projet.';
    return;
  }
  if (err) err.textContent = '';
  p.montant = a.montant != null ? String(a.montant).replace('.', ',') : '';
  p.depart = a.brut ? 'brut' : (a.montant != null ? 'budget' : 'metier');
  p.famille = a.famille || '';
  p.metierCle = a.choix?.length ? '' : (a.metierCle || '');
  p.roles = a.roles || [];
  p.sauf = a.sauf || [];
  p.choix = a.choix || [];
  p.question = a.question || '';
  p.grade = a.grade || '';
  p.kindDemande = a.kind || '';
  p.heuresDemandees = a.heures != null ? String(a.heures) : '';
  p.joursDemandes = a.jours != null ? String(a.jours) : '';
  p.cachetsDemandes = a.cachets != null ? String(a.cachets) : '';
  p.typeProjet = a.typeProjet || '';
  p.recherche = jobCourant()?.nom || a.indice || '';
  p.cadreTouche = false;
  p.cadre = null;
  state.parcours = p;
  if (p.choix.length) {
    p.etape = 'choix';
    p.ouvert = false;
    sauverForm();
    render();
    return;
  }
  const types = typesCourants();
  if (p.typeProjet && !types.some((t) => t.id === p.typeProjet)) p.typeProjet = '';
  if (!p.typeProjet && types.length === 1) p.typeProjet = types[0].id;
  lierPoste();
  p.etape = etapeManquante();
  p.ouvert = p.etape === 'metier';
  sauverForm();
  render();
}
function besoinPrecision() {
  const u = uniteCourante();
  return !!u && (u.key === 'horaire_jauge' || u.key === 'cachet_palier' || u.key === 'cachet_representation');
}
function etapesActives() {
  const p = state.parcours;
  const list = [];
  if (p.depart === 'budget' || p.depart === 'brut') list.push('montant');
  list.push('metier');
  if (typesCourants().length > 1) list.push('projet');
  if (p.depart !== 'budget') {
    list.push('quantite');
    if (besoinPrecision()) list.push('precision');
  }
  list.push('resultat');
  return list;
}
function erreurMontant() {
  const p = state.parcours;
  if (p.depart !== 'budget' && p.depart !== 'brut') return '';
  if (!String(p.montant).trim()) return p.depart === 'budget' ? 'Indique un budget.' : 'Indique un brut.';
  const b = E.validerBrut(p.montant, { label: p.depart === 'budget' ? 'budget' : 'brut' });
  return b.ok ? '' : b.message;
}
function erreurQuantite() {
  const q = E.validerQuantite(state.parcours.quantite, uniteCourante()?.kind || 'jour');
  return q.ok ? '' : q.message;
}
function erreurPrecision() {
  const r = state.parcours.representations;
  if (!String(r).trim()) return '';
  const q = E.validerQuantite(r, 'cachet');
  return q.ok ? '' : q.message;
}
function erreursAffiner() {
  const p = state.parcours;
  const e = {};
  const u = uniteCourante();
  if (u && ['jour', 'cachet', 'service'].includes(u.kind)) {
    const h = E.validerHeuresJour(p.heuresParJour);
    if (!h.ok) e.heuresParJour = h.message;
  }
  if (u?.kind === 'semaine') {
    const h = E.validerHeuresSemaine(p.heuresSemaine);
    if (!h.ok) e.heuresSemaine = h.message;
  }
  for (const [k, v] of Object.entries(p.heures)) {
    const h = E.validerHeuresMajo(v);
    if (!h.ok) e[k] = h.message;
  }
  for (const [k, v] of Object.entries(p.majoPct)) {
    const h = E.validerPourcentage(v);
    if (!h.ok) e['majo' + k] = h.message;
  }
  if (String(p.jours).trim()) {
    const j = E.validerQuantite(p.jours, 'jour');
    if (!j.ok) e.jours = j.message;
  }
  return e;
}
function posteDepuisParcours() {
  const p = state.parcours;
  const e = entreeCourante();
  if (!e || erreurQuantite() || erreurPrecision()) return null;
  if ((p.depart === 'budget' || p.depart === 'brut') && erreurMontant()) return null;
  if (Object.keys(erreursAffiner()).length) return null;
  const u = uniteCourante();
  const q = E.validerQuantite(p.quantite, u?.kind || 'jour');
  const st = statutCourant(e);
  const num = (v) => E.parseInput(v);
  const poste = {
    convention: p.convention, posteId: p.posteId, genre: p.genre || undefined, grille: p.grille, jauge: p.jauge,
    unite: u?.key, quantite: q.valeur,
    heuresParJour: E.validerHeuresJour(p.heuresParJour).valeur,
    heuresSemaine: E.validerHeuresSemaine(p.heuresSemaine).valeur,
    joursProrata: num(p.joursProrata),
    representations: num(p.representations) ?? q.valeur,
    exploitationContinue: !!p.exploitationContinue, ouvrier: !!p.ouvrier,
    heures: Object.fromEntries(Object.entries(p.heures).map(([k, v]) => [k, E.validerHeuresMajo(v).valeur || 0])),
    majoPct: Object.fromEntries(Object.entries(p.majoPct).map(([k, v]) => [k, v === '' || v == null ? '' : num(v)])),
    statut: { categorie: st.categorie, cadre: st.cadre },
    demande: null,
    typeProjet: p.typeProjet || '',
    famille: p.famille || '',
    jours: num(p.jours), bulletins: num(p.bulletins) ?? 1, contrats: num(p.contrats) ?? 1,
    intermediaire: '', fraisManuel: num(p.fraisManuel),
    abattementPct: p.avance ? num(p.abattementPct) : null,
    rgduPct: p.avance ? num(p.rgduPct) : null,
  };
  if (p.depart === 'brut') {
    const b = E.validerBrut(p.montant);
    if (b.ok && b.valeur) poste.demande = { montant: b.valeur, mode: 'total' };
  }
  return poste;
}

function crumb(et) {
  const p = state.parcours;
  if (et === 'montant') {
    const v = E.parseInput(p.montant);
    return v == null ? 'Montant' : `${E.formatNumber(v)} €`;
  }
  if (et === 'metier') {
    const nom = jobCourant()?.nom || E.labelFamille(p.famille) || 'Métier';
    return nom.length > 32 ? `${nom.slice(0, 30)}…` : nom;
  }
  if (et === 'projet') return E.labelType(p.typeProjet) || 'Projet';
  if (et === 'quantite') {
    const u = uniteCourante();
    const n = E.parseInput(p.quantite) || 1;
    const pl = n > 1;
    const mot = { jour: pl ? 'jours' : 'jour', semaine: pl ? 'semaines' : 'semaine', mois: 'mois', heure: pl ? 'heures' : 'heure', cachet: pl ? 'cachets' : 'cachet', service: pl ? 'services' : 'service' }[u?.kind] || '';
    return `${E.formatFrNombre(n)} ${mot}`.trim();
  }
  if (et === 'precision') {
    const u = uniteCourante();
    if (u?.key === 'horaire_jauge') return E.JAUGES.find((j) => j.id === p.jauge)?.label || 'Jauge';
    return p.representations ? `${p.representations} dates` : 'Dates';
  }
  return et;
}
function titre() {
  const p = state.parcours;
  if (p.etape === 'montant') return p.depart === 'budget' ? 'Quel budget HT ?' : 'Quel brut ?';
  if (p.etape === 'metier') return 'Quel métier ?';
  if (p.etape === 'choix') return 'Lequel ?';
  if (p.etape === 'projet') return "C'est pour quoi ?";
  if (p.etape === 'quantite') return 'Combien ?';
  if (p.etape === 'precision') return uniteCourante()?.key === 'horaire_jauge' ? 'Quelle jauge ?' : 'Combien de dates dans le mois ?';
  if (p.depart === 'budget' && p.famille) return E.labelFamille(p.famille);
  return entreeCourante()?.metier || jobCourant()?.nom || 'Résultat';
}

function choisirDepart(d) {
  state.parcours = parcoursVide();
  state.parcours.depart = d;
  state.parcours.etape = d === 'metier' ? 'metier' : 'montant';
  sauverForm();
  render();
}
function choisirMetier(cle) {
  const job = JOBS.find((j) => j.cle === cle);
  if (!job) return;
  const p = state.parcours;
  p.metierCle = cle;
  p.choix = [];
  p.question = '';
  p.roles = [];
  p.sauf = [];
  p.famille = job.familles[0] || p.famille || '';
  p.recherche = job.nom;
  p.ouvert = false;
  p.cadreTouche = false;
  p.cadre = null;
  const types = E.typesDisponibles(job.variantes);
  if (!types.some((t) => t.id === p.typeProjet)) p.typeProjet = types.length === 1 ? types[0].id : '';
  lierPoste();
  const list = etapesActives();
  let next = list[list.indexOf('metier') + 1] || 'resultat';
  if (next === 'projet' && p.typeProjet) next = list[list.indexOf('projet') + 1] || 'resultat';
  p.etape = next;
  sauverForm();
  render();
}
function choisirProjet(id) {
  const p = state.parcours;
  p.typeProjet = id;
  lierPoste();
  const list = etapesActives();
  p.etape = list[list.indexOf('projet') + 1] || 'resultat';
  sauverForm();
  render();
}
function changerUnite(key) {
  const p = state.parcours;
  const us = unitesCourantes();
  const avant = us.find((u) => u.key === p.unite);
  const u = us.find((x) => x.key === key) || us[0];
  if (u?.kind === 'heure' && (p.quantite === '1' || !p.quantite)) p.quantite = '8';
  else if (avant?.kind === 'heure' && u?.kind !== 'heure' && p.quantite === '8') p.quantite = '1';
  p.unite = u?.key || null;
  sauverForm();
  render();
}
function avancer() {
  const list = etapesActives();
  const next = list[list.indexOf(state.parcours.etape) + 1];
  if (!next) return;
  state.parcours.etape = next;
  sauverForm();
  render();
}
function precedent() {
  const list = etapesActives();
  const i = list.indexOf(state.parcours.etape);
  state.parcours.etape = i <= 0 ? 'depart' : list[i - 1];
  sauverForm();
  render();
}
function recommencer() {
  state.parcours = parcoursVide();
  sauverForm();
  if (location.hash && location.hash !== '#simuler') location.hash = '#simuler';
  else render();
}
function validerEtape() {
  const et = state.parcours.etape;
  if (et === 'metier' && !state.parcours.metierCle) {
    const hits = chercher(state.parcours.recherche);
    const hit = hits[state.parcours.highlight] || hits[0];
    if (hit && norm(state.parcours.recherche) === norm(hit.nom)) { choisirMetier(hit.cle); return false; }
  }
  const msg = et === 'montant' ? erreurMontant() : et === 'metier' ? (state.parcours.metierCle ? '' : 'Choisis un métier dans la liste.') : et === 'quantite' ? erreurQuantite() : et === 'precision' ? erreurPrecision() : '';
  const el = $('#err');
  if (el) el.textContent = msg;
  return !msg;
}

function figure(montant, label) {
  return `<p class="figure"><span class="n">${esc(montant)}</span><span class="lbl">${esc(label)}</span></p>`;
}
function verdictKo(titre, suite) {
  return `<p class="verdict ko"><span class="mot">${esc(titre)}</span>${suite ? `<span class="suite">${esc(suite)}</span>` : ''}</p>`;
}
function verdictOk(suite) {
  return `<p class="verdict ok"><span class="mot">OK</span>${suite ? `<span class="suite">${esc(suite)}</span>` : ''}</p>`;
}
function notesCalcul(L) {
  const out = [];
  if (!L) return out;
  if (L.min.nonTrouve) out.push('Minimum non trouvé : plancher SMIC.');
  else if (L.min.smicApplique || L.min.plancherSmic) out.push('Plancher SMIC.');
  for (const a of L.min.avertissements || []) if (/non chiffrée/i.test(a)) out.push(a);
  return out;
}
function dureeParcours(poste) {
  const u = uniteCourante();
  return E.dureeResume({
    kind: u?.kind,
    quantite: poste?.quantite,
    heuresNominales: u?.heures || (u?.kind === 'jour' ? 8 : 0),
  });
}
function regleGrille() {
  const aHeure = unitesCourantes().some((u) => u.kind === 'heure' && !u.nonTrouve);
  return E.phraseSansHoraire({
    typeProjet: state.parcours.typeProjet,
    convention: state.parcours.convention,
    aHeure,
  });
}
function htmlCouts(employeur, total, brut, net) {
  return `<div class="cout-pair">${figure(E.formatEuros(employeur), 'Coût employeur')}${figure(E.formatEuros(total), 'Coût total HT')}</div><p class="secondaire">Brut ${esc(E.formatEuros(brut))}, net ${esc(E.formatEuros(net))}.</p>`;
}
function htmlReco(reco, regle) {
  if (!reco?.phrase && !regle) return '';
  const corps = reco?.phrase
    ? `<p class="tag">Ma reco</p><p>${esc(reco.phrase)}</p><p>${esc(reco.chiffres)}</p>${reco.secondaire ? `<p class="secondaire">${esc(reco.secondaire)}</p>` : ''}`
    : '';
  const ligne = regle ? `<p class="reco-regle">${esc(regle)}</p>` : '';
  return `<aside class="ma-reco" id="ma-reco">${corps}${ligne}</aside>`;
}
function htmlResume(args, bilan) {
  const { reco, ...reste } = args;
  const blocs = E.blocsResume(reste);
  const copie = E.texteResume({ ...reste, reco });
  const lignes = bilan ? E.lignesCalcul(DATA, bilan, state.reglages, {
    grille: args.projet || '',
    typeProjet: state.parcours.typeProjet,
    convention: state.parcours.convention || bilan.ligne?.poste?.convention,
  }) : [];
  const open = state.parcours.calculOuvert ? 'open' : '';
  const detail = lignes.length
    ? `<details id="calcul" ${open}><summary>Comment c'est calculé</summary><div class="calcul">${lignes.map((l) => `<p>${esc(l)}</p>`).join('')}</div></details>`
    : '';
  return `<p id="resume-texte" class="resume"><span class="resume-suite">${esc(blocs.suite)}</span> <span class="secondaire">${esc(blocs.secondaire)}</span></p><span id="resume-copie" hidden>${esc(copie)}</span><button type="button" class="pixel-btn" id="btn-copier" data-action="copier">Copier</button>${detail}`;
}
function htmlComparaison(liste) {
  if (!liste?.length) return '';
  const rows = liste.map((x) => {
    const choisi = x.id === state.reglages.intermediaire ? ' · choisi' : '';
    return `<li>${esc(x.nom)} : ${esc(x.libelle)}${esc(choisi)}</li>`;
  }).join('');
  const warns = [...new Set(liste.flatMap((x) => x.avertissements || []))].map((t) => `<p class="note">${esc(t)}</p>`).join('');
  return `<section class="cmp"><h3>Intermédiaires</h3><ul>${rows}</ul>${warns}</section>`;
}
function htmlChiffres() {
  const aff = Object.values(erreursAffiner());
  if ((state.parcours.depart === 'budget' || state.parcours.depart === 'brut') && erreurMontant()) aff.unshift(erreurMontant());
  if (erreurQuantite()) aff.unshift(erreurQuantite());
  if (!state.parcours.posteId) aff.unshift('Choisis un métier.');
  if (aff.length) return [...new Set(aff)].map((m) => `<p class="note">${esc(m)}</p>`).join('');
  const poste = posteDepuisParcours();
  if (!poste) return '';
  const p = state.parcours;
  const qui = jobCourant()?.nom || entreeCourante()?.metier || '';
  const projet = E.labelType(p.typeProjet);
  const duree = dureeParcours(poste);
  if (p.depart === 'brut') {
    const L = E.calculerLigne(DATA, poste, state.reglages);
    if (!L) return '';
    const sous = !!L.demande?.sousMinimum;
    const bilan = E.bilanPoste(DATA, sous ? { ...poste, demande: null } : poste, state.reglages);
    const employeur = bilan.ligne.cot.coutEmployeur;
    const reco = E.recoDepuisLigne({
      nom: qui, duree, sousMinimum: sous,
      brutMinimumCents: L.min.minimumCents,
      employeurCents: employeur,
      brutCents: bilan.ligne.brutCents,
      netCents: bilan.ligne.cot.net,
      totalCents: bilan.totalCents,
    });
    let h = sous
      ? verdictKo('Pas possible', `Minimum : coût employeur ${E.formatEuros(employeur)}, coût total ${E.formatEuros(bilan.totalCents)} HT`)
      : verdictOk('');
    h += htmlCouts(employeur, bilan.totalCents, bilan.ligne.brutCents, bilan.ligne.cot.net);
    h += htmlReco(reco, regleGrille());
    h += htmlResume({
      qui, projet, duree, mode: 'brut', possible: !sous,
      brutMinimumCents: L.min.minimumCents,
      employeurCents: employeur,
      brutCents: bilan.ligne.brutCents,
      netCents: bilan.ligne.cot.net,
      totalCents: bilan.totalCents,
      reco: reco.texte,
    }, bilan);
    h += notesCalcul(sous ? bilan.ligne : L).map((t) => `<p class="note">${esc(t)}</p>`).join('');
    return h;
  }
  const bilan = E.bilanPoste(DATA, { ...poste, demande: null }, state.reglages);
  if (!bilan) return '';
  const employeurMetier = bilan.ligne.cot.coutEmployeur;
  const recoMetier = E.recoDepuisLigne({
    nom: qui, duree, sousMinimum: false,
    employeurCents: employeurMetier,
    brutCents: bilan.ligne.brutCents,
    netCents: bilan.ligne.cot.net,
    totalCents: bilan.totalCents,
  });
  let h = htmlCouts(employeurMetier, bilan.totalCents, bilan.ligne.brutCents, bilan.ligne.cot.net);
  h += htmlReco(recoMetier, regleGrille());
  h += htmlResume({
    qui, projet, duree, mode: 'metier', possible: true,
    employeurCents: employeurMetier,
    brutCents: bilan.ligne.brutCents,
    netCents: bilan.ligne.cot.net,
    totalCents: bilan.totalCents,
    reco: recoMetier.texte,
  }, bilan);
  h += notesCalcul(bilan.ligne).map((t) => `<p class="note">${esc(t)}</p>`).join('');
  return h;
}
function posteExtraAffiner() {
  const p = state.parcours;
  const num = (v) => E.parseInput(v);
  return {
    heuresParJour: p.heuresParJour,
    heuresSemaine: p.heuresSemaine,
    ouvrier: p.ouvrier,
    heures: Object.fromEntries(Object.entries(p.heures).map(([k, v]) => [k, E.validerHeuresMajo(v).valeur || 0])),
    majoPct: Object.fromEntries(Object.entries(p.majoPct).map(([k, v]) => [k, v === '' || v == null ? '' : num(v)])),
    bulletins: num(p.bulletins) ?? 1,
    contrats: num(p.contrats) ?? 1,
  };
}
function htmlSolutions() {
  const p = state.parcours;
  const euros = E.validerBrut(p.montant, { label: 'budget' });
  if (!euros.ok) return `<p class="note">${esc(euros.message || 'Indique un budget.')}</p>`;
  const s = E.solutionsBudget(DATA, {
    jobs: JOBS,
    famille: p.famille,
    metierCle: p.metierCle,
    typeProjet: p.typeProjet,
    budgetEuros: euros.valeur,
    heures: p.heuresDemandees ? E.parseInput(p.heuresDemandees) : null,
    jours: p.joursDemandes ? E.parseInput(p.joursDemandes) : null,
    cachets: p.cachetsDemandes ? E.parseInput(p.cachetsDemandes) : null,
    kind: p.kindDemande,
    grade: p.grade,
    roles: p.roles,
    sauf: p.sauf,
    reglages: state.reglages,
    posteExtra: posteExtraAffiner(),
  });
  if (!s.options.length) return '<p class="note">Aucun barème pour ce métier et ce projet.</p>';
  const opt = s.options[0];
  const bilan = E.bilanPoste(DATA, opt.poste, state.reglages);
  const qui = E.quiResume(p.metierCle ? '' : p.famille, p.metierCle ? (jobCourant()?.nom || opt.nom) : '');
  const projet = E.labelType(p.typeProjet);
  const totalAffiche = opt.possible ? opt.total : opt.budgetMinimum;
  const top = opt.possible
    ? `${verdictOk(`${opt.nom} · ${opt.uniteLabel}`)}${htmlCouts(opt.employeur, totalAffiche, opt.brut, opt.net)}`
    : `${verdictKo('Pas possible', `Minimum : coût employeur ${E.formatEuros(opt.employeur)}, coût total ${E.formatEuros(totalAffiche)} HT`)}${htmlCouts(opt.employeur, totalAffiche, opt.brut, opt.net)}`;
  const resume = htmlResume({
    qui, projet, duree: E.dureeResume(opt), mode: 'budget', possible: opt.possible,
    budgetEuros: euros.valeur,
    minimumCents: opt.budgetMinimum,
    employeurCents: opt.employeur,
    brutCents: opt.brut,
    netCents: opt.net,
    totalCents: opt.total,
    reco: s.reco?.texte,
  }, bilan);
  const cards = s.options.map((o) => {
    const totalCarte = o.possible ? o.total : o.budgetMinimum;
    const ligne = `<p class="cout-ligne">Coût employeur ${esc(E.formatEuros(o.employeur))}</p><p class="cout-ligne">Coût total ${esc(E.formatEuros(totalCarte))} HT</p><p class="secondaire">Brut ${esc(E.formatEuros(o.brut))}, net ${esc(E.formatEuros(o.net))}</p>${o.possible ? '<p class="ok-txt">Possible</p>' : '<p class="ko-txt">Pas possible</p>'}`;
    const reduit = o.reduit?.texte ? `<p class="reduit">${esc(o.reduit.texte)}</p>` : '';
    return `<article class="sol ${o.possible ? 'ok' : 'ko'}${o.recommande ? ' reco' : ''}">${o.recommande ? '<p class="tag">Recommandé</p>' : ''}<h3>${esc(o.nom)}</h3><p class="lbl">${esc(o.uniteLabel)} · ${esc(libelleStatut(o.statut))}</p>${ligne}${reduit}</article>`;
  }).join('');
  return `${top}${htmlReco(s.reco, s.note)}${resume}<div class="sols">${cards}</div>${htmlComparaison(s.intermediaires)}`;
}
function htmlDetail() {
  const c = DATA.conventions[state.parcours.convention];
  if (!c) return '';
  const meme = state.parcours.convention === '2642' && (state.parcours.typeProjet === 'clip' || state.parcours.typeProjet === 'edito')
    ? ' Clip, édito / mode et série : même grille.'
    : '';
  return `<details><summary>Détail</summary><p class="lbl">${esc(c.nom)} (IDCC ${esc(c.idcc)}).${esc(meme)}</p></details>`;
}
function htmlAffiner(opts = {}) {
  const p = state.parcours;
  const e = entreeCourante();
  const u = uniteCourante();
  const st = statutCourant(e);
  const conv = DATA.conventions[p.convention];
  const saisies = E.majorationsSaisies(conv);
  const champ = (id, k, label, val) => `<label class="lbl" for="${id}">${esc(label)}</label><input id="${id}" type="text" inputmode="decimal" data-k="${k}" value="${esc(val ?? '')}" autocomplete="off">`;
  let h = `<details id="affiner" ${p.affinerOuvert ? 'open' : ''}><summary>Affiner</summary><div class="bloc">`;
  h += champ('f-nuit', 'heures.nuit', 'Heures de nuit', p.heures.nuit);
  h += champ('f-dimanche', 'heures.dimanche', 'Heures de dimanche', p.heures.dimanche);
  h += champ('f-ferie', 'heures.ferie', 'Heures de férié', p.heures.ferie);
  if (saisies) {
    h += champ('f-majo-nuit', 'majoPct.nuit', 'Majoration nuit %', p.majoPct.nuit);
    h += champ('f-majo-dimanche', 'majoPct.dimanche', 'Majoration dimanche %', p.majoPct.dimanche);
    h += champ('f-majo-ferie', 'majoPct.ferie', 'Majoration férié %', p.majoPct.ferie);
  }
  if (u && ['jour', 'cachet', 'service'].includes(u.kind)) h += champ('f-duree', 'heuresParJour', 'Durée (h)', p.heuresParJour);
  if (u?.kind === 'semaine') h += champ('f-hsem', 'heuresSemaine', 'Heures dans la semaine', p.heuresSemaine);
  if (p.convention === '2642') h += `<label class="check"><input type="checkbox" data-k="ouvrier" ${p.ouvrier ? 'checked' : ''}>Électricien, machiniste ou déco</label>`;
  if (!opts.sansCadre && st.cadreEditable) h += `<label class="check"><input type="checkbox" data-k="cadre" ${st.cadre ? 'checked' : ''}>Cadre</label>`;
  h += htmlReglages();
  h += champ('f-jours', 'jours', 'Jours pour les plafonds', p.jours);
  h += champ('f-bulletins', 'bulletins', 'Bulletins', p.bulletins);
  h += champ('f-contrats', 'contrats', 'Contrats', p.contrats);
  h += `</div></details>`;
  return h;
}
function htmlReglages() {
  const r = state.reglages;
  const o = E.optionIntermediaire(DATA, r.intermediaire);
  const credit = !!(o.credits && o.packs?.length);
  const ab = credit ? o.credits.abonnement : (o.abonnement_mensuel_ht && typeof o.abonnement_mensuel_ht === 'object' ? o.abonnement_mensuel_ht : null);
  const pack = credit ? E.packChoisi(o, r) : null;
  const choixInter = DATA.intermediaires.options.filter((x) => x.id !== 'direct');
  let h = `<label class="lbl" for="r-intermediaire">Intermédiaire</label><select id="r-intermediaire" data-r="intermediaire">${choixInter.map((x) => `<option value="${x.id}" ${x.id === r.intermediaire ? 'selected' : ''}>${esc(x.nom.split(' (')[0])}</option>`).join('')}</select>`;
  if (credit) {
    h += `<label class="lbl" for="r-pack">Pack de crédits</label><select id="r-pack" data-r="pack">${o.packs.map((pk) => `<option value="${esc(pk.id)}" ${pk.id === pack.id ? 'selected' : ''}>${esc(pk.nom)} · ${esc(E.formatFrNombre(pk.credits))} crédits · ${esc(E.formatDecimal(E.toCents(pk.prix_credit_ht)))} €</option>`).join('')}</select><p class="lbl">Prix HT, TVA en plus.</p>`;
  }
  if (ab) {
    h += `<label class="lbl" for="r-formule">Abonnement</label><select id="r-formule" data-r="formule"><option value="basic" ${r.formule === 'basic' ? 'selected' : ''}>Basic</option><option value="premium" ${r.formule === 'premium' ? 'selected' : ''}>Premium</option><option value="aucune" ${r.formule === 'aucune' ? 'selected' : ''}>Aucun</option></select>`;
  }
  h += `<label class="lbl" for="r-mois">Mois</label><input id="r-mois" type="text" inputmode="decimal" data-r="mois" value="${esc(E.formatFrNombre(Number(r.mois)))}"><p id="err-mois" class="note"></p>`;
  if (credit && o.credits.inscription) h += `<label class="check"><input type="checkbox" data-r="premiereInscription" ${r.premiereInscription ? 'checked' : ''}>Première inscription (${esc(E.formatFrNombre(o.credits.inscription))} crédits)</label>`;
  if (o.credits?.signature_contrat) h += `<label class="check"><input type="checkbox" data-r="signature" ${r.signature ? 'checked' : ''}>Signature électronique (${esc(E.formatFrNombre(o.credits.signature_contrat))} crédits / contrat)</label>`;
  else if (o.signature_electronique_contrat_ht) h += `<label class="check"><input type="checkbox" data-r="signature" ${r.signature ? 'checked' : ''}>Signature électronique</label>`;
  return h;
}

function chercher(q) {
  const n = norm(q);
  if (!n) return [];
  const hits = JOBS.filter((j) => norm(`${j.nom} ${j.familles.map((id) => E.labelFamille(id)).join(' ')}`).includes(n));
  hits.sort((a, b) => (norm(a.nom).startsWith(n) ? 0 : 1) - (norm(b.nom).startsWith(n) ? 0 : 1) || (a.nom.includes(':') ? 1 : 0) - (b.nom.includes(':') ? 1 : 0) || a.nom.localeCompare(b.nom, 'fr'));
  return hits.slice(0, 8);
}
function renderSuggestions() {
  const box = $('#suggest');
  const input = $('#f-metier');
  if (!box) return;
  const p = state.parcours;
  box.hidden = !p.ouvert;
  if (input) input.setAttribute('aria-expanded', String(p.ouvert));
  if (!p.ouvert) { box.innerHTML = ''; return; }
  const hits = chercher(p.recherche);
  if (p.highlight >= hits.length) p.highlight = 0;
  if (!p.recherche.trim()) { box.innerHTML = '<p class="lbl">Écris un métier.</p>'; return; }
  if (!hits.length) { box.innerHTML = '<p class="lbl">Aucun métier.</p>'; return; }
  box.innerHTML = hits.map((hit, i) => {
    const st = E.categorieStatut(hit.categorie) === 'artiste' ? 'Artiste' : 'Technicien';
    const sel = hit.cle === p.metierCle;
    return `<button type="button" role="option" data-metier="${esc(hit.cle)}" aria-selected="${i === p.highlight || sel}"><span>${esc(hit.nom)}</span><span class="sug-meta">${esc(st)}</span></button>`;
  }).join('');
}

function htmlSimuler() {
  const p = state.parcours;
  if (p.etape === 'depart' || !p.depart) {
    return `<div class="ecran">
      <form id="phrase" class="phrase">
        <h2 class="q" id="q-besoin">Écris ton besoin</h2>
        <input id="f-phrase" aria-labelledby="q-besoin" data-autofocus type="text" autocomplete="off" value="${esc(p.phrase)}" placeholder="Ex. 250 € pour un élec, 8 h, clip">
        <button type="submit" class="pixel-btn">Voir</button>
        <p id="err-phrase" role="alert"></p>
      </form>
      <p class="ou">ou</p>
      <h2 class="q">Je me laisse guider</h2>
      <div class="choix">
      <button type="button" class="choice" data-depart="budget"><span class="pixel">J'ai un budget</span><span class="hint">un montant HT</span></button>
      <button type="button" class="choice" data-depart="metier"><span class="pixel">Je connais le métier</span><span class="hint">le minimum</span></button>
      <button type="button" class="choice" data-depart="brut"><span class="pixel">J'ai un brut en tête</span><span class="hint">coût et net</span></button>
    </div></div>`;
  }
  const list = etapesActives();
  const i = list.indexOf(p.etape);
  const crumbs = list.slice(0, Math.max(0, i)).map((et) => `<button type="button" data-goto="${et}">${esc(crumb(et))}</button>`).join('');
  const head = `<div class="top"><button type="button" class="ghost" data-back>Retour</button><button type="button" class="lien" data-action="recommencer">Recommencer</button></div>${crumbs ? `<nav class="crumbs" aria-label="Réponses">${crumbs}</nav>` : ''}`;
  if (p.etape === 'resultat') {
    assurerMetier();
    lierPoste();
    const st = statutCourant();
    const typeLabel = E.labelType(p.typeProjet);
    if (p.depart === 'budget') {
      const duree = p.kindDemande === 'heure' && p.heuresDemandees ? `${p.heuresDemandees} h` : (p.kindDemande === 'jour' && p.joursDemandes ? `${p.joursDemandes} j` : '');
      const sous = [typeLabel, duree].filter(Boolean).join(' · ');
      return `<div class="ecran">${head}<h2 class="q">${esc(titre())}</h2>${sous ? `<p class="stat">${esc(sous)}</p>` : ''}<div id="chiffres">${htmlSolutions()}</div>${htmlAffiner({ sansCadre: true })}${htmlDetail()}</div>`;
    }
    const sous = [typeLabel, libelleStatut(st)].filter(Boolean).join(' · ');
    return `<div class="ecran">${head}<h2 class="nom">${esc(titre())}</h2><p class="stat">${esc(sous)}</p><div id="chiffres" class="figures">${htmlChiffres()}</div>${htmlAffiner()}${htmlDetail()}</div>`;
  }
  let corps = '';
  if (p.etape === 'montant') {
    corps = `<label class="lbl" for="f-montant">${p.depart === 'budget' ? 'Montant HT' : 'Brut'}</label><input id="f-montant" data-autofocus type="text" inputmode="decimal" autocomplete="off" value="${esc(p.montant)}" placeholder="250">`;
  } else if (p.etape === 'metier') {
    corps = `<label class="lbl" for="f-metier">Métier</label><input id="f-metier" data-autofocus type="search" autocomplete="off" role="combobox" aria-autocomplete="list" aria-controls="suggest" aria-expanded="${p.ouvert}" value="${esc(p.recherche)}" placeholder="photo, danseur, assistant"><div id="suggest" class="suggest"></div>`;
  } else if (p.etape === 'choix') {
    corps = `<p class="lbl">${esc(p.question || '')}</p><div class="choix">${(p.choix || []).map((c) => `<button type="button" class="choice" data-metier="${esc(c.cle)}"${c.type ? ` data-projet="${esc(c.type)}"` : ''}><span class="pixel">${esc(c.court || c.nom)}</span><span class="hint">${esc(c.nom)}</span></button>`).join('')}</div>`;
  } else if (p.etape === 'projet') {
    const types = typesCourants();
    corps = `<div class="choix">${types.map((t) => `<button type="button" class="choice" data-projet="${esc(t.id)}"><span class="pixel">${esc(t.label)}</span></button>`).join('')}</div>`;
  } else if (p.etape === 'quantite') {
    const us = unitesCourantes();
    const u = uniteCourante();
    corps = `<label class="lbl" for="f-quantite">Quantité</label><input id="f-quantite" data-autofocus type="text" inputmode="decimal" autocomplete="off" value="${esc(p.quantite)}">`;
    if (us.length > 1) corps += `<div class="unites" role="group" aria-label="Unité">${us.map((x) => `<button type="button" data-unite="${esc(x.key)}" aria-pressed="${x.key === u?.key}">${esc(x.label)}</button>`).join('')}</div>`;
    else if (u) corps += `<p class="lbl">${esc(u.label)}</p>`;
  } else if (p.etape === 'precision') {
    const u = uniteCourante();
    if (u?.key === 'horaire_jauge') {
      corps = `<label class="lbl" for="f-jauge">Jauge</label><select id="f-jauge" data-k="jauge">${E.JAUGES.map((j) => `<option value="${j.id}" ${p.jauge === j.id ? 'selected' : ''}>${esc(j.label)}</option>`).join('')}</select>`;
    } else {
      corps = `<label class="lbl" for="f-representations">Dates dans le mois</label><input id="f-representations" data-autofocus type="text" inputmode="decimal" autocomplete="off" value="${esc(p.representations || p.quantite)}">`;
      if (u?.key === 'cachet_representation') corps += `<label class="check"><input type="checkbox" data-k="exploitationContinue" ${p.exploitationContinue ? 'checked' : ''}>Exploitation continue</label>`;
    }
  }
  if (p.etape === 'projet' || p.etape === 'choix') return `<div class="ecran">${head}<h2 class="q" id="q">${esc(titre())}</h2>${corps}</div>`;
  const suite = `<p id="err" role="alert"></p><div class="bas"><button type="button" class="pixel-btn" data-next>Continuer</button></div>`;
  return `<div class="ecran">${head}<h2 class="q" id="q">${esc(titre())}</h2>${corps}${suite}</div>`;
}


function onProjet(ev) {
  const t = ev.target;
  const k = t.dataset.r;
  if (!k) return;
  if (k === 'mois') {
    const v = E.validerMois(t.value);
    const err = $('#err-mois');
    if (!v.ok) {
      if (err) { err.hidden = false; err.textContent = v.message; }
      if (ev.type === 'change') t.value = E.formatFrNombre(Number(state.reglages.mois));
      return;
    }
    if (err) err.textContent = '';
    state.reglages.mois = v.valeur;
    sauverReglages();
    planRender();
    return;
  }
  state.reglages[k] = t.type === 'checkbox' ? t.checked : t.value;
  if (k === 'signature') state.reglages.signatureChoisie = true;
  sauverReglages();
  planRender();
}
function planRender() {
  clearTimeout(planRender.t);
  planRender.t = setTimeout(render, 0);
}

function majChiffres() {
  const box = $('#chiffres');
  if (box) box.innerHTML = state.parcours.depart === 'budget' ? htmlSolutions() : htmlChiffres();
}

function render() {
  const v = vue();
  document.querySelectorAll('.nav a').forEach((a) => {
    if (a.dataset.view === v) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  });
  const ecran = $('#ecran');
  const sources = $('#sources-body');
  if (v === 'sources') {
    ecran.hidden = true;
    sources.hidden = false;
    if (!sourcesDessine) { renderSources(); sourcesDessine = true; }
    return;
  }
  sources.hidden = true;
  const errS = $('#sources-erreur');
  if (errS && v !== 'sources') { /* garder le message si on y revient */ }
  ecran.hidden = false;
  ecran.innerHTML = htmlSimuler();
  const focus = ecran.querySelector('[data-autofocus]');
  if (focus) focus.focus();
  if (v === 'simuler' && state.parcours.etape === 'metier') renderSuggestions();
}

async function copierResume() {
  const texte = $('#resume-copie')?.textContent || $('#resume-texte')?.textContent || '';
  const btn = $('#btn-copier');
  let ok = false;
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(texte);
      ok = true;
    }
  } catch { ok = false; }
  if (!ok) {
    const ta = document.createElement('textarea');
    ta.value = texte;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.left = '-9999px';
    document.body.appendChild(ta);
    ta.select();
    try { ok = document.execCommand('copy'); } catch { ok = false; }
    ta.remove();
  }
  if (btn) btn.textContent = ok ? 'Copié' : 'Copier';
}
function onClick(ev) {
  const b = ev.target.closest('[data-depart], [data-goto], [data-back], [data-next], [data-metier], [data-projet], [data-unite], [data-action]');
  if (!b) {
    if (state.parcours.ouvert && !ev.target.closest('#f-metier') && !ev.target.closest('#suggest')) {
      state.parcours.ouvert = false;
      const box = $('#suggest');
      if (box) { box.hidden = true; box.innerHTML = ''; }
    }
    return;
  }
  if (b.dataset.depart) { choisirDepart(b.dataset.depart); return; }
  if (b.dataset.goto) { state.parcours.etape = b.dataset.goto; sauverForm(); render(); return; }
  if (b.hasAttribute('data-back')) { precedent(); return; }
  if (b.hasAttribute('data-next')) { if (validerEtape()) avancer(); return; }
  if (b.dataset.metier) {
    if (b.dataset.projet) state.parcours.typeProjet = b.dataset.projet;
    choisirMetier(b.dataset.metier);
    return;
  }
  if (b.dataset.projet) { choisirProjet(b.dataset.projet); return; }
  if (b.dataset.unite) { changerUnite(b.dataset.unite); return; }
  const a = b.dataset.action;
  if (a === 'recommencer') { recommencer(); return; }
  if (a === 'copier') { copierResume(); return; }
  if (a === 'reset-params') {
    state.surcharges = {};
    appliquerParametres();
    sourcesDessine = false;
    renderSources();
    sourcesDessine = true;
  }
}
function onInput(ev) {
  const t = ev.target;
  if (t.id === 'f-phrase') { state.parcours.phrase = t.value; return; }
  if (t.id === 'f-metier') {
    state.parcours.recherche = t.value;
    state.parcours.ouvert = true;
    state.parcours.highlight = 0;
    const job = jobCourant();
    if (job && norm(t.value) !== norm(job.nom)) {
      state.parcours.metierCle = '';
      state.parcours.posteId = null;
    }
    renderSuggestions();
    return;
  }
  if (t.id === 'f-montant') { state.parcours.montant = t.value; sauverForm(); return; }
  if (t.id === 'f-quantite') { state.parcours.quantite = t.value; sauverForm(); return; }
  if (t.id === 'f-representations') { state.parcours.representations = t.value; sauverForm(); return; }
  if (t.dataset.r === 'mois') return;
  const k = t.dataset.k;
  if (!k || t.type === 'checkbox' || t.tagName === 'SELECT') return;
  setPath(state.parcours, k, t.value);
  sauverForm();
  if (state.parcours.etape === 'resultat') majChiffres();
}
function onChange(ev) {
  const t = ev.target;
  if (t.dataset.r) { onProjet(ev); return; }
  if (t.dataset.p || t.dataset.c || t.dataset.i) { surParametre(ev); return; }
  if (t.dataset.k === 'cadre') {
    state.parcours.cadreTouche = true;
    state.parcours.cadre = t.checked;
    sauverForm();
    const st = statutCourant();
    const el = $('.stat');
    if (el) el.textContent = libelleStatut(st);
    majChiffres();
    return;
  }
  if (!t.dataset.k) return;
  setPath(state.parcours, t.dataset.k, t.type === 'checkbox' ? t.checked : t.value);
  sauverForm();
  if (state.parcours.etape === 'resultat') majChiffres();
}
function onKey(ev) {
  if (ev.target.id !== 'f-metier') return;
  const hits = chercher(state.parcours.recherche);
  if (ev.key === 'ArrowDown' || ev.key === 'ArrowUp') {
    ev.preventDefault();
    state.parcours.ouvert = true;
    const n = hits.length || 1;
    state.parcours.highlight = (state.parcours.highlight + (ev.key === 'ArrowDown' ? 1 : -1) + n) % n;
    renderSuggestions();
  } else if (ev.key === 'Enter') {
    ev.preventDefault();
    const hit = hits[state.parcours.highlight] || hits[0];
    if (hit) choisirMetier(hit.cle);
    else { const el = $('#err'); if (el) el.textContent = 'Choisis un métier dans la liste.'; }
  } else if (ev.key === 'Escape') {
    state.parcours.ouvert = false;
    renderSuggestions();
  }
}

function renderSources() {
  const C = DATA.cotisations;
  const RAWC = RAW.cotisations;
  const inp = (attrs, v, base) => `<input type="text" inputmode="decimal" class="param-input" ${attrs} value="${esc(v ?? '')}">`;
  let h = `<div class="sources-grid"><section><h2>Sources</h2><p class="lbl">Données du ${esc(E.formatDateFr(DATA._meta.genere_le))}.</p><ul class="sources-list">`;
  for (const [k, url] of Object.entries(DATA._meta.sources)) h += `<li><code>${esc(k)}</code> ${lien(url, url)}</li>`;
  h += `</ul><h2>Intermédiaires</h2><ul class="sources-list">`;
  for (const o of DATA.intermediaires.options.filter((x) => x.id !== 'direct')) {
    const urls = Array.isArray(o.source) ? o.source : (o.source ? [o.source] : []);
    h += `<li>${esc(o.nom.split(' (')[0])} — ${esc(o.note || '')} ${urls.map((u) => lien(u, u)).join(' ')}</li>`;
  }
  h += `</ul><p class="lbl">SMIC : ${esc(C.smic_horaire_brut.reference || '')} · ${lien(C.smic_horaire_brut.source, 'Insee')}</p></section>`;
  h += `<section><h2>Paramètres</h2><button type="button" class="lien" data-action="reset-params">Revenir aux valeurs du JSON</button><div class="table-wrap"><table><thead><tr><th>Paramètre</th><th class="r">Valeur</th><th>Source</th></tr></thead><tbody>`;
  h += `<tr><td>SMIC horaire brut (€)<br><span class="lbl">${esc(C.smic_horaire_brut.reference || '')}</span></td><td class="r">${inp('data-p="smic"', C.smic_horaire_brut.valeur, RAWC.smic_horaire_brut.valeur)}</td><td>${lien(C.smic_horaire_brut.source, 'Insee')}</td></tr>`;
  h += `<tr><td>Plafond journalier T1 (€)</td><td class="r">${inp('data-p="plafondT1"', C.plafonds_2026.plafond_journalier_intermittent_cadre_T1, RAWC.plafonds_2026.plafond_journalier_intermittent_cadre_T1)}</td><td>${lien(C.plafonds_2026.source)}</td></tr>`;
  const libP = {
    plafond_journalier_T2: 'Plafond journalier T2 (€)',
    plafond_vieillesse_artiste_jour: 'Plafond vieillesse artiste (€ / jour)',
    plafond_ss_journalier: 'Plafond SS journalier technicien (€), à confirmer',
    fnal_majoration_assiette: 'Majoration assiette FNAL artiste',
    csg_assiette_pct: 'Assiette CSG/CRDS (% du brut)',
    heures_mensuelles: 'Heures mensuelles',
    jours_prorata_mois: 'Jours pour le prorata mensuel',
  };
  for (const [k, lib] of Object.entries(libP)) h += `<tr><td>${esc(lib)}</td><td class="r">${inp(`data-p="parametres.${k}"`, C.parametres_calcul[k], RAWC.parametres_calcul[k])}</td><td>${lien(C.parametres_calcul.source)}</td></tr>`;
  h += `</tbody></table></div></section><section><h2>Taux</h2><div class="table-wrap"><table><thead><tr><th>Cotisation</th><th class="r">Patronal %</th><th class="r">Salarial %</th></tr></thead><tbody>`;
  for (const l of C.lignes) {
    h += `<tr><td>${esc(l.libelle)}${l.note ? `<br><span class="lbl">${esc(l.note)}</span>` : ''}</td><td class="r">${inp(`data-c="${l.code}" data-f="patronal"`, l.patronal)}</td><td class="r">${inp(`data-c="${l.code}" data-f="salarial"`, l.salarial)}</td></tr>`;
  }
  h += `</tbody></table></div></section></div>`;
  $('#sources-body').innerHTML = h;
}
function valeurParamBrute(t) {
  const C = RAW.cotisations;
  if (t.dataset.p === 'smic') return C.smic_horaire_brut.valeur;
  if (t.dataset.p === 'plafondT1') return C.plafonds_2026.plafond_journalier_intermittent_cadre_T1;
  if (t.dataset.p?.startsWith('parametres.')) return C.parametres_calcul[t.dataset.p.split('.')[1]];
  if (t.dataset.c) return C.lignes.find((x) => x.code === t.dataset.c)?.[t.dataset.f];
  return undefined;
}
function valeurParam(t) {
  if (t.dataset.p === 'smic') return DATA.cotisations.smic_horaire_brut.valeur;
  if (t.dataset.p === 'plafondT1') return DATA.cotisations.plafonds_2026.plafond_journalier_intermittent_cadre_T1;
  if (t.dataset.p?.startsWith('parametres.')) return DATA.cotisations.parametres_calcul[t.dataset.p.split('.')[1]];
  if (t.dataset.c) return DATA.cotisations.lignes.find((x) => x.code === t.dataset.c)?.[t.dataset.f];
  return '';
}
function surParametre(ev) {
  const t = ev.target;
  if (!t.dataset.p && !t.dataset.c && !t.dataset.i) return;
  const prev = valeurParam(t);
  const check = E.validerSaisieParam(t.value, E.bornesParametre(t.dataset.p || '', t.dataset.f || ''));
  const err = $('#sources-erreur');
  if (!check.ok) {
    t.value = prev == null ? '' : String(prev);
    if (err) { err.hidden = false; err.textContent = check.message; }
    return;
  }
  if (err) { err.hidden = true; err.textContent = ''; }
  const S = state.surcharges;
  if (t.dataset.p) {
    if (t.dataset.p.startsWith('parametres.')) { S.parametres = S.parametres || {}; S.parametres[t.dataset.p.split('.')[1]] = check.valeur; }
    else S[t.dataset.p] = check.valeur;
  } else if (t.dataset.c) {
    S.cotisations = S.cotisations || {};
    S.cotisations[t.dataset.c] = { ...(S.cotisations[t.dataset.c] || {}), [t.dataset.f]: check.valeur };
  }
  appliquerParametres();
  const brut = valeurParamBrute(t);
  const courant = valeurParam(t);
  t.style.borderColor = brut !== undefined && String(courant) !== String(brut) ? 'var(--amber)' : '';
}
function appliquerParametres() {
  DATA = E.appliquerSurcharges(RAW, state.surcharges);
  lsSet(LS.surcharges, state.surcharges);
}
function nettoyerSurcharges(s) {
  const out = structuredClone(s || {});
  if (!E.validerSaisieParam(out.smic, E.BORNES.smic).ok) delete out.smic;
  if (!E.validerSaisieParam(out.plafondT1, E.BORNES.plafond).ok) delete out.plafondT1;
  if (out.parametres) {
    for (const [k, v] of Object.entries(out.parametres)) {
      if (!E.validerSaisieParam(v, E.bornesParametre(`parametres.${k}`, '')).ok) delete out.parametres[k];
    }
  }
  if (out.cotisations) {
    for (const [code, v] of Object.entries(out.cotisations)) {
      if (!v || typeof v !== 'object') { delete out.cotisations[code]; continue; }
      for (const f of ['patronal', 'salarial']) if (v[f] != null && !E.validerSaisieParam(v[f], E.BORNES.taux).ok) delete v[f];
    }
  }
  return out;
}

async function init() {
  try {
    const r = await fetch('data/simulateur_data.json', { cache: 'no-cache' });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    RAW = await r.json();
  } catch (e) {
    const box = $('#load-error');
    box.hidden = false;
    box.textContent = `Impossible de lire les données (${e.message}).`;
    return;
  }
  state.surcharges = nettoyerSurcharges(lsGet(LS.surcharges, {}));
  DATA = E.appliquerSurcharges(RAW, state.surcharges);
  indexer();
  const savedReglages = lsGet(LS.reglages, {});
  state.reglages = { ...E.REGLAGES_DEFAUT, ...savedReglages };
  // L'ancien défaut était « pas de signature ». Ce false enregistré n'est pas un choix.
  if (!savedReglages.signatureChoisie) state.reglages.signature = E.REGLAGES_DEFAUT.signature;
  delete state.reglages.valeurCredit;
  delete state.reglages.prorata;
  if (!DATA.intermediaires.options.some((o) => o.id === state.reglages.intermediaire && o.id !== 'direct')) {
    state.reglages.intermediaire = E.REGLAGES_DEFAUT.intermediaire;
  }
  const optReglages = E.optionIntermediaire(DATA, state.reglages.intermediaire);
  if (optReglages.packs?.length && !optReglages.packs.some((p) => p.id === state.reglages.pack)) {
    state.reglages.pack = optReglages.pack_defaut || optReglages.packs[0].id;
  }
  const mois = E.validerMois(state.reglages.mois);
  state.reglages.mois = mois.ok ? mois.valeur : 1;
  sauverReglages();
  const fs = lsGet(LS.form, null);
  if (fs?.parcours && (fs.parcours.depart || fs.parcours.etape === 'depart')) {
    const p = fs.parcours;
    state.parcours = { ...parcoursVide(), ...p, heures: { ...heuresVides(), ...(p.heures || {}) }, majoPct: { ...majoVides(), ...(p.majoPct || {}) }, ouvert: false };
  }
  $('#avertissement-complet').textContent = E.AVERTISSEMENT;
  $('#lien-avertissement').addEventListener('click', () => {
    const el = $('#avertissement-complet');
    el.hidden = !el.hidden;
  });
  document.addEventListener('click', onClick);
  document.addEventListener('submit', (e) => {
    if (e.target.id !== 'phrase') return;
    e.preventDefault();
    const input = $('#f-phrase');
    if (input) state.parcours.phrase = input.value;
    appliquerPhrase();
  });
  document.addEventListener('input', onInput);
  document.addEventListener('change', onChange);
  document.addEventListener('keydown', onKey);
  document.addEventListener('mousedown', (e) => { if (e.target.closest('#suggest button')) e.preventDefault(); });
  document.addEventListener('toggle', (e) => {
    if (e.target.id === 'affiner') state.parcours.affinerOuvert = e.target.open;
    if (e.target.id === 'calcul') state.parcours.calculOuvert = e.target.open;
  }, true);
  $('#theme-toggle')?.addEventListener('click', () => {
    const next = document.documentElement.dataset.theme === 'light' ? 'dark' : 'light';
    document.documentElement.dataset.theme = next;
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.content = next === 'light' ? '#f3efe4' : '#1b1b2a';
    try { localStorage.setItem(LS.theme, next); } catch { /* quota */ }
    const btn = $('#theme-toggle');
    if (btn) btn.textContent = next === 'light' ? 'Sombre' : 'Clair';
  });
  matchMedia('(prefers-color-scheme: light)').addEventListener('change', (e) => {
    let stored = null;
    try { stored = localStorage.getItem(LS.theme); } catch { stored = null; }
    if (stored === 'light' || stored === 'dark') return;
    const next = e.matches ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.content = next === 'light' ? '#f3efe4' : '#1b1b2a';
    const btn = $('#theme-toggle');
    if (btn) btn.textContent = next === 'light' ? 'Sombre' : 'Clair';
  });
  window.addEventListener('hashchange', render);
  const pied = $('.avertissement');
  if (pied) {
    const date = document.createElement('span');
    date.textContent = ` Données du ${E.formatDateFr(DATA._meta.genere_le)}. `;
    pied.insertBefore(date, $('#lien-avertissement'));
  }
  render();
}

init();
