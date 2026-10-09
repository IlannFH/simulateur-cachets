// Interface : barre projet, poste, résultat, devis.
import * as E from '../engine/index.js';

const LS = { devis: 'simcachets.devis.v1', reglages: 'simcachets.reglages.v1', surcharges: 'simcachets.surcharges.v1', form: 'simcachets.form.v1', projet: 'simcachets.projet.v1' };
const CONVENTIONS = [
  { key: '3097_pub', label: 'Films publicitaires', idcc: '3097' },
  { key: '3097_cinema', label: 'Cinéma', idcc: '3097' },
  { key: '2642', label: 'Audiovisuel', idcc: '2642' },
  { key: '1285', label: 'Spectacle vivant subventionné', idcc: '1285' },
  { key: '3090', label: 'Spectacle vivant privé', idcc: '3090' },
  { key: '2412', label: 'Animation', idcc: '2412' },
];
const ESS = 1; const RES = 2; const AJU = 4; const DEV = 8; const PRO = 16; const ACT = 32;
const AIDE_DANSE = 'Compagnie subventionnée (État ou collectivité) : spectacle vivant subventionné, IDCC 1285. Sinon : spectacle vivant privé, IDCC 3090. Le GUSO seulement si le spectacle n’est pas l’activité principale de l’employeur.';

let RAW = null;
let DATA = null;
const state = {
  form: null, devis: [], reglages: { ...E.REGLAGES_DEFAUT }, surcharges: {},
  editUid: null, projet: '', projetOuvert: false, statutOuvert: false, ajusterOuvert: false,
  confirmNouveau: false, exportOuvert: false, recherche: '', metierOuvert: false, highlight: 0,
};
const plan = { bits: 0, timer: null };

const $ = (sel, root = document) => root.querySelector(sel);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const eur = (c) => E.formatEuros(c);
const lsGet = (k, d) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* stockage indisponible */ } };
const uid = () => Math.random().toString(36).slice(2, 10);
const norm = (s) => String(s ?? '').toLowerCase().normalize('NFD').replace(/\p{M}/gu, '');
const dedupe = (list) => { const s = new Set(); return list.filter((t) => { const k = String(t || '').trim(); if (!k || s.has(k)) return false; s.add(k); return true; }); };
const lien = (url, txt = 'Source') => (url ? `<a href="${esc(url)}" target="_blank" rel="noopener">${esc(txt)}</a>` : '');
const sourcesDe = (s) => (Array.isArray(s) ? s : s ? [s] : []);

function getPath(o, p) { return p.split('.').reduce((a, k) => (a == null ? a : a[k]), o); }
function setPath(o, p, v) {
  const ks = p.split('.');
  let cur = o;
  ks.slice(0, -1).forEach((k) => { cur[k] = cur[k] && typeof cur[k] === 'object' ? cur[k] : {}; cur = cur[k]; });
  cur[ks[ks.length - 1]] = v;
}
function planRender(bits) {
  plan.bits |= bits;
  if (plan.timer) return;
  plan.timer = setTimeout(() => {
    const b = plan.bits;
    plan.bits = 0; plan.timer = null;
    if (b & PRO) renderProjet();
    if (b & ESS) renderEssentiels();
    if (b & AJU) renderAjuster();
    if (b & RES) renderResultat();
    if (b & ACT) renderActions();
    if (b & DEV) renderDevis();
    majErreurs();
    majCompte();
    majAction();
  }, 0);
}

function formVide(convention = '3097_pub') {
  return {
    convention, genre: 'Fiction / documentaire', grille: '2025', jauge: '200',
    posteId: null, unite: null, quantite: '1', heuresParJour: '', heuresSemaine: '', joursProrata: '',
    representations: '', exploitationContinue: false, ouvrier: false,
    heures: { nuit: '', dimanche: '', ferie: '', premierMai: '', ferieMineur: '', sup: '' },
    majoPct: { sup: '', nuit: '', dimanche: '', ferie: '' },
    statut: { categorie: 'technicien', cadre: false }, statutForce: false,
    demande: { montant: '', mode: 'total' }, saisie: 'brut', onglet: 'brut',
    budget: { montant: '', mode: 'total' },
    jours: '', bulletins: '1', contrats: '1', intermediaire: '', fraisManuel: '',
    avance: false, abattementPct: '', rgduPct: '',
  };
}
const optsListe = (f) => ({ genre: f.convention === '2642' ? f.genre : undefined, grille: f.convention === '3090' ? f.grille : undefined });
function entreeCourante(f = state.form) {
  if (!f?.posteId) return null;
  return E.listerPostes(DATA, f.convention, optsListe(f)).find((p) => p.id === f.posteId) || null;
}
function uniteCourante(f = state.form) {
  const e = entreeCourante(f);
  if (!e) return null;
  const unites = E.unitesDisponibles(e, DATA.conventions[f.convention]);
  return unites.find((u) => u.key === f.unite) || unites[0];
}
function nominaleJour(u) {
  if (!u) return null;
  if (u.kind === 'jour' && typeof u.heures === 'number') return u.heures;
  if (u.kind === 'cachet' || u.kind === 'service') return 8;
  return null;
}
function nominaleSemaine(u) {
  if (!u || u.kind !== 'semaine') return null;
  return typeof u.heures === 'number' ? u.heures : 35;
}
function appliquerMetier(id) {
  const f = state.form;
  const e = E.listerPostes(DATA, f.convention, optsListe(f)).find((p) => p.id === id);
  if (!e) return;
  const unites = E.unitesDisponibles(e, DATA.conventions[f.convention]);
  const avant = unites.find((u) => u.key === f.unite);
  const u = avant || unites[0];
  const prevKind = avant?.kind;
  f.heuresParJour = E.dureeApresChangementUnite(f.heuresParJour, nominaleJour(avant), nominaleJour(u));
  f.heuresSemaine = E.dureeApresChangementUnite(f.heuresSemaine, nominaleSemaine(avant), nominaleSemaine(u));
  if (u.kind === 'heure' && (f.quantite === '1' || f.quantite === '')) f.quantite = '8';
  else if (prevKind === 'heure' && u.kind !== 'heure' && f.quantite === '8') f.quantite = '1';
  f.posteId = e.id;
  f.unite = u.key;
  if (!f.statutForce) f.statut = { categorie: E.categorieStatut(e.categorie), cadre: E.cadreParDefaut(e.metier) };
  state.recherche = e.metier;
  state.metierOuvert = false;
  state.highlight = 0;
}
function changerUnite(key) {
  const f = state.form;
  const e = entreeCourante();
  if (!e) return;
  const unites = E.unitesDisponibles(e, DATA.conventions[f.convention]);
  const avant = unites.find((u) => u.key === f.unite);
  const u = unites.find((x) => x.key === key) || unites[0];
  f.heuresParJour = E.dureeApresChangementUnite(f.heuresParJour, nominaleJour(avant), nominaleJour(u));
  f.heuresSemaine = E.dureeApresChangementUnite(f.heuresSemaine, nominaleSemaine(avant), nominaleSemaine(u));
  if (u.kind === 'heure' && (f.quantite === '1' || f.quantite === '')) f.quantite = '8';
  else if (avant?.kind === 'heure' && u.kind !== 'heure' && f.quantite === '8') f.quantite = '1';
  f.unite = u.key;
}
function changerConvention(cle) {
  const prev = state.form;
  const nom = entreeCourante(prev)?.metier;
  const f = E.conserverSaisie(prev, formVide(cle));
  f.convention = cle;
  state.form = f;
  const liste = E.listerPostes(DATA, cle, optsListe(f));
  const eq = nom && liste.find((p) => p.metier === nom);
  if (eq) appliquerMetier(eq.id);
  else { f.posteId = null; f.unite = null; state.recherche = ''; }
}
function changerFiltre(k, val) {
  const prevNom = entreeCourante()?.metier;
  state.form[k] = val;
  const liste = E.listerPostes(DATA, state.form.convention, optsListe(state.form));
  const radical = (s) => String(s || '').replace(/\s*–\s*(grille\s*)?(NAO\s*)?20\d\d\s*$/i, '');
  const eq = liste.find((p) => p.metier === prevNom) || liste.find((p) => radical(p.metier) === radical(prevNom));
  if (eq) appliquerMetier(eq.id);
  else { state.form.posteId = null; state.recherche = ''; }
}

function erreursForm(f = state.form) {
  const e = {};
  if (!f || f.convention === '2412') return e;
  if (!f.posteId) e.metier = 'Choisissez un métier.';
  const u = uniteCourante(f);
  const q = E.validerQuantite(f.quantite, u?.kind || 'jour');
  if (!q.ok) e.quantite = q.message;
  if (u && ['jour', 'cachet', 'service'].includes(u.kind)) {
    const h = E.validerHeuresJour(f.heuresParJour);
    if (!h.ok) e.heuresParJour = h.message;
  }
  if (u?.kind === 'semaine') {
    const h = E.validerHeuresSemaine(f.heuresSemaine);
    if (!h.ok) e.heuresSemaine = h.message;
  }
  if (f.saisie === 'brut') {
    const b = E.validerBrut(f.demande.montant);
    if (!b.ok) e.brut = b.message;
  }
  if (f.saisie === 'budget' && String(f.budget.montant).trim() !== '') {
    const b = E.validerBrut(f.budget.montant, { label: 'budget' });
    if (!b.ok) e.budget = b.message;
  }
  for (const [k, v] of Object.entries(f.heures)) {
    const h = E.validerHeuresMajo(v);
    if (!h.ok) e[`heures.${k}`] = h.message;
  }
  for (const [k, v] of Object.entries(f.majoPct)) {
    const h = E.validerPourcentage(v);
    if (!h.ok) e[`majoPct.${k}`] = h.message;
  }
  if (String(f.jours || '').trim()) {
    const j = E.validerQuantite(f.jours, 'jour');
    if (!j.ok) e.jours = j.message;
  }
  if (f.avance) {
    const a = E.validerPourcentage(f.abattementPct, { max: 100 });
    if (!a.ok) e.abattementPct = a.message;
    const r = E.validerPourcentage(f.rgduPct, { max: 100 });
    if (!r.ok) e.rgduPct = r.message;
  }
  return e;
}
const peutAjouter = () => state.form?.convention !== '2412' && !!state.form?.posteId && Object.keys(erreursForm()).length === 0;

function posteDepuisForm(f = state.form) {
  if (!f?.posteId || Object.keys(erreursForm(f)).length) return null;
  const n = (v) => E.parseInput(v);
  const hJ = E.validerHeuresJour(f.heuresParJour);
  const hS = E.validerHeuresSemaine(f.heuresSemaine);
  const brut = f.saisie === 'brut' ? E.validerBrut(f.demande.montant) : { ok: true, valeur: null };
  const p = {
    convention: f.convention, posteId: f.posteId,
    genre: f.convention === '2642' ? f.genre : undefined,
    grille: f.grille, jauge: f.jauge, unite: f.unite,
    quantite: E.validerQuantite(f.quantite, uniteCourante(f)?.kind).valeur,
    heuresParJour: hJ.valeur, heuresSemaine: hS.valeur,
    joursProrata: n(f.joursProrata), representations: n(f.representations) ?? n(f.quantite),
    exploitationContinue: !!f.exploitationContinue, ouvrier: !!f.ouvrier,
    heures: Object.fromEntries(Object.entries(f.heures).map(([k, v]) => [k, E.validerHeuresMajo(v).valeur || 0])),
    majoPct: Object.fromEntries(Object.entries(f.majoPct).map(([k, v]) => [k, v === '' || v == null ? '' : n(v)])),
    statut: { ...f.statut },
    demande: { montant: brut.valeur, mode: f.demande.mode },
    jours: n(f.jours), bulletins: n(f.bulletins) ?? 1, contrats: n(f.contrats) ?? 1,
    intermediaire: f.intermediaire || '', fraisManuel: n(f.fraisManuel),
    abattementPct: f.avance ? n(f.abattementPct) : null,
    rgduPct: f.avance ? n(f.rgduPct) : null,
  };
  if (f.saisie === 'budget') {
    const b = E.validerBrut(f.budget.montant, { label: 'budget' });
    if (b.ok && b.valeur) {
      const c = E.convertirBudget(DATA, { ...p, demande: null }, b.valeur, state.reglages, { parUnite: f.budget.mode === 'unite' });
      if (c?.possible) p.demande = { montant: c.brutCents / 100, mode: 'total' };
      p._conversion = c;
    }
  }
  return p;
}
function ligneCourante() {
  const p = posteDepuisForm();
  if (!p) return null;
  return E.calculerLigne(DATA, p, state.reglages);
}
function compteAjustements(f = state.form) {
  if (!f) return 0;
  let n = 0;
  for (const v of Object.values(f.heures)) if ((E.parseInput(v) || 0) > 0) n += 1;
  if (f.saisie === 'brut' && String(f.demande.montant).trim()) n += 1;
  if (f.saisie === 'budget') n += 1;
  if (f.avance) n += 1;
  if (f.intermediaire) n += 1;
  if (String(f.jours || '').trim()) n += 1;
  if (f.ouvrier || f.exploitationContinue) n += 1;
  const nom = nominaleJour(uniteCourante(f));
  const h = E.parseInput(f.heuresParJour);
  if (nom != null && h != null && Math.abs(h - nom) > 1e-9) n += 1;
  return n;
}

function champ(id, k, label, valeur, { placeholder = '', suffix = '' } = {}) {
  return `<div class="field"><label for="${id}">${esc(label)}${suffix ? ` <span class="muted">(${esc(suffix)})</span>` : ''}</label>
    <input id="${id}" type="text" inputmode="decimal" autocomplete="off" data-k="${k}" value="${esc(valeur ?? '')}" placeholder="${esc(placeholder)}">
    <p class="field-error" id="err-${id.replace(/^f-/, '')}"></p></div>`;
}
const libelleStatut = (s) => `${s.categorie === 'artiste' ? 'Artiste' : 'Technicien'} · ${s.cadre ? 'cadre' : 'non cadre'}`;

function renderProjet() {
  const r = state.reglages;
  const o = E.optionIntermediaire(DATA, r.intermediaire);
  const abObj = o.abonnement_mensuel_ht && typeof o.abonnement_mensuel_ht === 'object';
  let fields = `<div class="field"><label for="projet-nom">Nom du projet</label><input id="projet-nom" type="text" autocomplete="off" value="${esc(state.projet)}" placeholder="Ex. Campagne SS27"></div>`;
  fields += `<div class="field"><label for="r-intermediaire">Intermédiaire</label><select id="r-intermediaire" data-r="intermediaire">${DATA.intermediaires.options.map((x) => `<option value="${x.id}" ${x.id === r.intermediaire ? 'selected' : ''}>${esc(x.nom.split(' (')[0])}</option>`).join('')}</select></div>`;
  if (abObj) {
    fields += `<div class="field"><label for="r-formule">Abonnement</label><select id="r-formule" data-r="formule">
      <option value="basic" ${r.formule === 'basic' ? 'selected' : ''}>Basic · ${E.formatNumber(o.abonnement_mensuel_ht.basic)} € / mois</option>
      <option value="premium" ${r.formule === 'premium' ? 'selected' : ''}>Premium · ${E.formatNumber(o.abonnement_mensuel_ht.premium)} € / mois</option>
      <option value="aucune" ${r.formule === 'aucune' ? 'selected' : ''}>Aucun</option></select></div>`;
  }
  fields += `<div class="field"><label for="r-mois">Durée du projet (mois)</label><input id="r-mois" type="text" inputmode="decimal" data-r="mois" value="${esc(E.formatFrNombre(Number(r.mois)))}"><p class="field-error" id="err-mois"></p></div>`;
  if (o.signature_electronique_contrat_ht) fields += `<label class="check"><input type="checkbox" data-r="signature" ${r.signature ? 'checked' : ''}>Signature électronique</label>`;
  if (o.frais_dossier_credits) {
    fields += `<label class="check"><input type="checkbox" data-r="premiereInscription" ${r.premiereInscription ? 'checked' : ''}>Première inscription (${o.frais_dossier_credits} crédits)</label>`;
    if (r.premiereInscription) fields += `<div class="field"><label for="r-credit">Valeur du crédit (€ HT)</label><input id="r-credit" type="text" inputmode="decimal" data-r="valeurCredit" value="${esc(r.valeurCredit ?? o.valeur_credit_ht.defaut)}"></div>`;
  }
  fields += `<label class="check"><input type="checkbox" data-r="prorata" ${r.prorata ? 'checked' : ''}>Répartir l'abonnement sur les lignes</label>`;
  $('#projet-bar').innerHTML = `<button type="button" class="projet-resume" aria-expanded="${state.projetOuvert}" data-action="projet"><span id="projet-resume-txt"></span><span class="projet-action muted">${state.projetOuvert ? 'Fermer' : 'Modifier'}</span></button><div id="projet-fields" class="projet-fields" ${state.projetOuvert ? '' : 'hidden'}>${fields}</div>`;
  majResume();
}
function majResume() {
  const el = $('#projet-resume-txt');
  if (el) el.textContent = resumeProjet();
}
function resumeProjet() {
  const o = E.optionIntermediaire(DATA, state.reglages.intermediaire);
  const abo = o.abonnement_mensuel_ht;
  const ab = abo && typeof abo === 'object' && state.reglages.formule !== 'aucune' ? (state.reglages.formule === 'premium' ? ' Premium' : ' Basic') : '';
  return `${state.projet.trim() || 'Sans nom'} · ${o.nom.split(' (')[0]}${ab} · ${E.formatFrNombre(Number(state.reglages.mois))} mois`;
}
function basculerProjet() {
  state.projetOuvert = !state.projetOuvert;
  const box = $('#projet-fields');
  const btn = $('.projet-resume');
  if (box) box.hidden = !state.projetOuvert;
  if (btn) btn.setAttribute('aria-expanded', String(state.projetOuvert));
  const label = $('.projet-action');
  if (label) label.textContent = state.projetOuvert ? 'Fermer' : 'Modifier';
}

function renderEssentiels() {
  const f = state.form;
  const conv = DATA.conventions[f.convention];
  let h = `<div class="field"><label for="f-convention">Type de production <span class="tip"><button type="button" class="tip-btn" aria-describedby="tip-danse" data-action="tip">?</button><span id="tip-danse" class="tip-bubble" role="tooltip">${esc(AIDE_DANSE)}</span></span></label>
    <select id="f-convention" data-k="convention">${CONVENTIONS.map((c) => `<option value="${c.key}" ${c.key === f.convention ? 'selected' : ''}>${esc(c.label)} · ${c.idcc}</option>`).join('')}</select></div>`;
  if (f.convention === '2412') {
    h += `<p class="banner banner-amber">${esc(conv.note || '')}</p><p class="muted small">Les films publicitaires en prise de vues réelle relèvent des films publicitaires (3097).</p>`;
    $('#essentiels').innerHTML = h;
    return;
  }
  if (f.convention === '2642') {
    const genres = [...new Set(conv.lignes.map((l) => l.genre).filter(Boolean))];
    h += `<div class="field"><label for="f-genre">Genre</label><select id="f-genre" data-k="genre">${genres.map((g) => `<option value="${esc(g)}" ${f.genre === g ? 'selected' : ''}>${esc(g)}</option>`).join('')}</select></div>`;
  }
  if (f.convention === '3090') {
    h += `<div class="field"><label for="f-grille">Grille</label><select id="f-grille" data-k="grille"><option value="2025" ${f.grille === '2025' ? 'selected' : ''}>2025 étendue</option><option value="2026" ${f.grille === '2026' ? 'selected' : ''}>NAO 2026 (adhérents)</option></select></div>`;
  }
  h += `<div class="field suggest"><label for="f-metier">Métier</label>
    <input id="f-metier" type="search" autocomplete="off" role="combobox" aria-expanded="${state.metierOuvert}" aria-controls="metier-suggest" aria-autocomplete="list" placeholder="Ex. assistant, danseur, maquilleur" value="${esc(state.recherche)}">
    <div id="metier-suggest" class="suggest-list" role="listbox" ${state.metierOuvert ? '' : 'hidden'}></div>
    <p class="field-error" id="err-metier"></p></div>`;
  const e = entreeCourante();
  if (e) {
    const u = uniteCourante();
    const unites = E.unitesDisponibles(e, conv);
    if (u?.key === 'horaire_jauge') {
      h += `<div class="field"><label for="f-jauge">Jauge</label><select id="f-jauge" data-k="jauge">${E.JAUGES.map((j) => `<option value="${j.id}" ${f.jauge === j.id ? 'selected' : ''}>${esc(j.label)}</option>`).join('')}</select></div>`;
    }
    if (u?.key === 'cachet_palier' || u?.key === 'cachet_representation') {
      h += champ('f-representations', 'representations', 'Représentations dans le mois', f.representations, { placeholder: f.quantite || '1' });
    }
    if (u?.key === 'cachet_representation') h += `<label class="check"><input type="checkbox" data-k="exploitationContinue" ${f.exploitationContinue ? 'checked' : ''}>Exploitation continue</label>`;
    h += `<div class="qte-line">${champ('f-quantite', 'quantite', 'Quantité', f.quantite)}<div class="field"><label for="f-unite">Unité</label>`;
    if (unites.length > 1) h += `<select id="f-unite" data-k="unite">${unites.map((x) => `<option value="${esc(x.key)}" ${x.key === u.key ? 'selected' : ''}>${esc(x.label)}${x.nonTrouve ? ' · non trouvé' : ''}</option>`).join('')}</select>`;
    else h += `<p class="unite-fixe" id="f-unite">${esc(u.label)}</p>`;
    h += `</div></div>`;
    h += `<div id="statut-zone">${blocStatut(f)}</div>`;
  }
  $('#essentiels').innerHTML = h;
  renderSuggestions();
}
function blocStatut(f) {
  if (!state.statutOuvert) {
    return `<p class="statut-line"><span>${esc(libelleStatut(f.statut))}</span><button type="button" class="btn-link" data-action="statut">Modifier</button></p>`;
  }
  return `<div class="field"><span>Statut</span><div class="segmented">
    <label class="seg"><input type="radio" name="statut" data-k="statut.categorie" value="artiste" ${f.statut.categorie === 'artiste' ? 'checked' : ''}><span>Artiste</span></label>
    <label class="seg"><input type="radio" name="statut" data-k="statut.categorie" value="technicien" ${f.statut.categorie === 'technicien' ? 'checked' : ''}><span>Technicien</span></label>
    </div>${`<label class="check"><input type="checkbox" data-k="statut.cadre" ${f.statut.cadre ? 'checked' : ''}>Cadre</label>`}</div>`;
}
function renderSuggestions() {
  const box = $('#metier-suggest');
  const input = $('#f-metier');
  if (!box) return;
  box.hidden = !state.metierOuvert;
  if (input) input.setAttribute('aria-expanded', String(state.metierOuvert));
  if (!state.metierOuvert) { box.innerHTML = ''; return; }
  const q = norm(state.recherche);
  const liste = E.listerPostes(DATA, state.form.convention, optsListe(state.form));
  const hits = liste.filter((p) => !q || norm(`${p.metier} ${p.departement} ${p.categorie}`).includes(q)).slice(0, 8);
  if (state.highlight >= hits.length) state.highlight = 0;
  if (!hits.length) { box.innerHTML = `<p class="empty-search">Aucun métier.</p>`; return; }
  const conv = DATA.conventions[state.form.convention];
  box.innerHTML = hits.map((p, i) => {
    const u = E.unitesDisponibles(p, conv)[0];
    const v = E.valeurUnitaire(p, u.key, { grille: state.form.grille, jauge: state.form.jauge, representations: 1 });
    const prix = v.valeur == null ? 'Non trouvé' : `${E.formatNumber(v.valeur)} €`;
    return `<button type="button" role="option" data-poste="${esc(p.id)}" aria-selected="${i === state.highlight}"><span>${esc(p.metier)}</span><small>${esc(prix)}</small></button>`;
  }).join('');
}
function choisirSuggestion(id) {
  const box = $('#metier-suggest');
  const btn = id ? box?.querySelector(`[data-poste="${CSS.escape(id)}"]`) : box?.querySelector('[aria-selected="true"]') || box?.querySelector('[data-poste]');
  const pid = id || btn?.dataset.poste;
  if (!pid) return;
  appliquerMetier(pid);
  sauverForm();
  planRender(ESS | AJU | RES | ACT);
}

function renderAjuster() {
  const f = state.form;
  if (!f || f.convention === '2412' || !f.posteId) { $('#ajuster').innerHTML = ''; return; }
  const conv = DATA.conventions[f.convention];
  const u = uniteCourante();
  const saisies = E.majorationsSaisies(conv);
  const n = compteAjustements(f);
  let h = `<details class="ajuster" id="ajuster-details" ${state.ajusterOuvert ? 'open' : ''}><summary>Ajuster <span class="badge b-ok" id="ajuster-count" ${n ? '' : 'hidden'}>${n || ''}</span></summary><div class="fields">`;
  if (u && ['jour', 'cachet', 'service'].includes(u.kind)) h += champ('f-heuresParJour', 'heuresParJour', u.kind === 'jour' ? 'Durée de la journée' : 'Heures par cachet', f.heuresParJour, { suffix: 'h' });
  if (u?.kind === 'semaine') h += champ('f-heuresSemaine', 'heuresSemaine', 'Heures dans la semaine', f.heuresSemaine);
  if (u?.kind === 'mois') h += champ('f-joursProrata', 'joursProrata', 'Jours en plus', f.joursProrata, { suffix: 'prorata / 30' });
  if (saisies) h += champ('f-heures-sup', 'heures.sup', 'Heures supplémentaires', f.heures.sup);
  h += champ('f-heures-nuit', 'heures.nuit', 'Heures de nuit', f.heures.nuit);
  h += champ('f-heures-dimanche', 'heures.dimanche', 'Heures du dimanche', f.heures.dimanche);
  h += champ('f-heures-ferie', 'heures.ferie', f.convention === '2642' ? 'Férié principal' : 'Jour férié', f.heures.ferie);
  h += champ('f-heures-premierMai', 'heures.premierMai', '1er mai', f.heures.premierMai);
  if (f.convention === '2642') h += champ('f-heures-ferieMineur', 'heures.ferieMineur', 'Pâques, 8 mai, Ascension', f.heures.ferieMineur);
  h += `</div>`;
  if (saisies) {
    h += `<div class="fields">
      ${champ('f-majo-sup', 'majoPct.sup', 'Heures sup.', f.majoPct.sup, { suffix: '%' })}
      ${champ('f-majo-nuit', 'majoPct.nuit', 'Nuit', f.majoPct.nuit, { suffix: '%' })}
      ${champ('f-majo-dimanche', 'majoPct.dimanche', 'Dimanche', f.majoPct.dimanche, { suffix: '%' })}
      ${champ('f-majo-ferie', 'majoPct.ferie', 'Férié', f.majoPct.ferie, { suffix: '%' })}</div>`;
  } else if (u?.kind === 'jour' && f.convention.startsWith('3097')) {
    h += `<p class="muted small">Au-delà de ${u.heures ?? 8} h, les heures supplémentaires sont calculées depuis la durée de la journée.</p>`;
  }
  if (f.convention === '2642') h += `<label class="check"><input type="checkbox" data-k="ouvrier" ${f.ouvrier ? 'checked' : ''}>Électricien, machiniste ou ouvrier déco</label>`;
  const onglet = f.saisie === 'budget' ? 'budget' : (f.onglet === 'propose' || String(f.demande.montant).trim() ? 'propose' : 'brut');
  h += `<div class="tabs-mini" role="tablist">
    <button type="button" role="tab" data-action="saisie" data-saisie="brut" aria-selected="${onglet === 'brut'}">Au minimum</button>
    <button type="button" role="tab" data-action="saisie" data-saisie="propose" aria-selected="${onglet === 'propose'}">Brut proposé</button>
    <button type="button" role="tab" data-action="saisie" data-saisie="budget" aria-selected="${onglet === 'budget'}">Budget HT</button></div>`;
  if (onglet === 'budget') {
    h += `<div class="qte-line">${champ('f-budget-montant', 'budget.montant', 'Budget disponible', f.budget.montant, { suffix: '€ HT', placeholder: 'Ex. 800' })}
      <div class="field"><label for="f-budget-mode">Le budget est</label><select id="f-budget-mode" data-k="budget.mode"><option value="total" ${f.budget.mode === 'total' ? 'selected' : ''}>pour toute la ligne</option><option value="unite" ${f.budget.mode === 'unite' ? 'selected' : ''}>par unité</option></select></div></div>`;
  } else if (onglet === 'propose') {
    h += `<div class="qte-line">${champ('f-demande-montant', 'demande.montant', 'Montant brut proposé', f.demande.montant, { suffix: '€', placeholder: 'Facultatif' })}
      <div class="field"><label for="f-demande-mode">Le montant est</label><select id="f-demande-mode" data-k="demande.mode"><option value="total" ${f.demande.mode === 'total' ? 'selected' : ''}>le total</option><option value="unite" ${f.demande.mode === 'unite' ? 'selected' : ''}>par unité</option></select></div></div>`;
  }
  const opt = E.optionIntermediaire(DATA, f.intermediaire || state.reglages.intermediaire);
  h += `<details class="help"><summary>Options avancées</summary><div class="fields" style="margin-top:10px">
    ${champ('f-jours', 'jours', 'Jours (plafonds)', f.jours, { placeholder: 'auto' })}
    ${champ('f-bulletins', 'bulletins', 'Bulletins', f.bulletins)}
    ${champ('f-contrats', 'contrats', 'Contrats', f.contrats)}
    <div class="field"><label for="f-intermediaire">Intermédiaire de la ligne</label><select id="f-intermediaire" data-k="intermediaire"><option value="">Comme le projet</option>${DATA.intermediaires.options.map((o) => `<option value="${o.id}" ${f.intermediaire === o.id ? 'selected' : ''}>${esc(o.nom.split(' (')[0])}</option>`).join('')}</select></div>
    ${opt.prix_par_contrat_ht === null ? champ('f-fraisManuel', 'fraisManuel', 'Frais saisis', f.fraisManuel, { suffix: '€ HT' }) : ''}
    </div><label class="check"><input type="checkbox" data-k="avance" ${f.avance ? 'checked' : ''}>Abattement et réduction générale</label>
    ${f.avance ? `<div class="fields">${champ('f-abattementPct', 'abattementPct', 'Abattement', f.abattementPct, { suffix: '%' })}${champ('f-rgduPct', 'rgduPct', 'Réduction générale', f.rgduPct, { suffix: '%' })}</div><p class="muted small">${esc(DATA.cotisations.reductions.note)}</p>` : ''}
    </details></details>`;
  $('#ajuster').innerHTML = h;
}
function majCompte() {
  const n = compteAjustements();
  const el = $('#ajuster-count');
  if (!el) return;
  el.hidden = n === 0;
  el.textContent = n ? String(n) : '';
}

function renderResultat() {
  const box = $('#resultat');
  const f = state.form;
  if (!box) return;
  if (!f || f.convention === '2412') { box.innerHTML = ''; return; }
  const errs = erreursForm(f);
  const messages = dedupe(Object.values(errs));
  if (!f.posteId) {
    box.innerHTML = `<div class="resultat"><p class="muted">Choisissez un métier pour voir le coût.</p></div>`;
    return;
  }
  if (Object.keys(errs).length) {
    box.innerHTML = `<div class="resultat">${messages.map((m) => `<p class="banner banner-red">${esc(m)}</p>`).join('')}</div>`;
    return;
  }
  const p = posteDepuisForm();
  const L = p && E.calculerLigne(DATA, p, state.reglages);
  if (!L) { box.innerHTML = ''; return; }
  const m = L.min;
  const bannières = [];
  if (m.nonTrouve) bannières.push('Minimum conventionnel non trouvé : le plancher retenu est le SMIC, pas un minimum de grille.');
  if (m.smicApplique || m.plancherSmic) bannières.push('Plancher SMIC appliqué.');
  for (const a of m.avertissements) bannières.push(a);
  for (const a of L.frais.avertissements) bannières.push(a);
  if (L.cot.nonTrouves) bannières.push(`${L.cot.nonTrouves} cotisation(s) non trouvée(s), comptée(s) à 0 € : le coût est sous-estimé.`);
  const conv = p._conversion;
  if (f.saisie === 'budget' && !String(f.budget.montant).trim()) bannières.push('Indiquez un budget HT pour calculer le brut.');
  if (conv) for (const a of conv.avertissements) if (a.niveau !== 'info') bannières.push(a.texte);
  if (L.demande && f.saisie !== 'budget' && L.demande.sousMinimum) bannières.push(`Montant brut proposé sous le minimum (${eur(L.demande.cents)}, écart ${E.formatEcartPct(L.demande.ecartPct)}).`);
  else if (L.demande && f.saisie !== 'budget') bannières.push(`Brut retenu ${eur(L.demande.cents)} (${E.formatEcartPct(L.demande.ecartPct)} par rapport au minimum).`);
  const vus = dedupe(bannières);
  let h = `<div class="resultat" aria-live="polite"><p class="p-metier">${esc(m.entree.metier)}</p><p class="p-poste">${esc(CONVENTIONS.find((c) => c.key === f.convention)?.label || m.conv.nom)} · ${esc(libelleStatut(L.statut))}</p>`;
  h += vus.map((t) => `<p class="banner ${/non chiffrée|sous le minimum|Impossible|SMIC|non trouvé|GUSO/i.test(t) ? 'banner-amber' : 'banner-grey'}">${esc(t)}</p>`).join('');
  h += `<dl class="kv">
    <dt>Minimum</dt><dd class="num">${eur(m.minimumCents)}</dd>
    <dt>Coût employeur</dt><dd class="num">${eur(L.cot.coutEmployeur)}</dd>
    <dt>Coût total</dt><dd class="num strong">${eur(L.coutTotal)}</dd>
    <dt>Net estimé</dt><dd class="num">${eur(L.cot.net)}</dd></dl>`;
  if (L.demande) h += `<p class="muted small">Calculé sur un brut de ${eur(L.brutCents)}${f.saisie === 'budget' ? ' (budget HT)' : ''}.</p>`;
  h += `<details><summary>Détail du calcul</summary><ul class="formules">${m.formules.map((x) => `<li>${esc(x)}</li>`).join('')}</ul></details>`;
  h += `<details class="cot"><summary>Cotisations (${L.cot.lignes.length})</summary>${tableCotisations(L.cot)}<p class="muted small">Taux 2026. Le plafond vieillesse des techniciens est à confirmer par un gestionnaire de paie. Le taux AT/MP est celui de votre structure.</p></details></div>`;
  box.innerHTML = h;
}
function tableCotisations(cot) {
  let h = `<div class="table-wrap"><table><thead><tr><th>Cotisation</th><th class="r">Patronal</th><th class="r">Salarial</th></tr></thead><tbody>`;
  for (const l of cot.lignes) {
    const badge = l.nonTrouve ? ' <span class="badge b-ko">Non trouvé</span>' : !l.verifie ? ' <span class="badge b-warn">À vérifier</span>' : '';
    h += `<tr class="${l.code === 'at_mp' ? 'at-mp' : ''}"><td>${esc(l.libelle)}${badge}${l.note ? `<br><span class="muted">${esc(l.note)}</span>` : ''}<br><span class="muted">${esc(l.assietteTxt)} · ${eur(l.assiette)}</span></td>
      <td class="r num">${l.nonTrouve ? '—' : eur(l.patronal)}</td><td class="r num">${eur(l.salarial)}</td></tr>`;
  }
  h += `</tbody><tfoot><tr class="is-total"><td>Total</td><td class="r num">${eur(cot.patronal)}</td><td class="r num">${eur(cot.salarial)}</td></tr></tfoot></table></div>`;
  return h;
}
function renderActions() {
  const edit = !!state.editUid;
  $('#actions-poste').innerHTML = `<button type="submit" class="btn" ${peutAjouter() ? '' : 'disabled'}>${edit ? 'Mettre à jour la ligne' : 'Ajouter au devis'}</button>${edit ? '<button type="button" class="btn btn-ghost" data-action="annuler-edition">Annuler</button>' : ''}`;
}
function majAction() {
  const btn = $('#actions-poste button[type="submit"]');
  if (btn) btn.disabled = !peutAjouter();
}
function majErreurs() {
  const e = state.form ? erreursForm() : {};
  const map = {
    quantite: ['err-quantite', 'f-quantite'], heuresParJour: ['err-heuresParJour', 'f-heuresParJour'],
    heuresSemaine: ['err-heuresSemaine', 'f-heuresSemaine'], brut: ['err-demande-montant', 'f-demande-montant'],
    budget: ['err-budget-montant', 'f-budget-montant'], jours: ['err-jours', 'f-jours'],
    abattementPct: ['err-abattementPct', 'f-abattementPct'], rgduPct: ['err-rgduPct', 'f-rgduPct'],
    metier: ['err-metier', 'f-metier'],
  };
  for (const [k, v] of Object.entries(state.form?.heures || {})) map[`heures.${k}`] = [`err-heures-${k}`, `f-heures-${k}`];
  for (const [k, v] of Object.entries(state.form?.majoPct || {})) map[`majoPct.${k}`] = [`err-majo-${k}`, `f-majo-${k}`];
  for (const [k, [errId, inputId]] of Object.entries(map)) {
    const err = document.getElementById(errId);
    const input = document.getElementById(inputId);
    if (err) err.textContent = e[k] || '';
    if (input) input.setAttribute('aria-invalid', e[k] ? 'true' : 'false');
  }
}

function renderDevis() {
  const box = $('#devis-body');
  const D = E.calculerDevis(DATA, state.devis, state.reglages);
  if (!D.lignes.length) {
    box.innerHTML = `<p class="empty">Aucun poste. Le bouton « Ajouter au devis » l’ajoute ici.</p><button type="button" class="btn btn-ghost" data-action="exemple">Charger un devis d’exemple</button>`;
    return;
  }
  let table = `<div class="table-wrap devis-table-wrap"><table class="devis-table"><thead><tr><th>Métier</th><th>Unité</th><th class="r">Brut</th><th class="r">Coût total</th><th></th></tr></thead><tbody>`;
  let cards = `<div class="devis-cards">`;
  D.lignes.forEach((L, i) => {
    const p = state.devis[i];
    const alerte = (L.demande?.sousMinimum ? ' <span class="badge b-ko">Sous le minimum</span>' : '') + (L.min.nonTrouve && !L.demande ? ' <span class="badge b-ko">Non trouvé</span>' : '');
    const qte = `${esc(L.min.unite.label)} × ${E.formatFrNombre(L.min.quantite)}`;
    const actions = `<button type="button" class="btn-link" data-action="modifier" data-uid="${p.uid}">Modifier</button><button type="button" class="btn-link" data-action="dupliquer" data-uid="${p.uid}">Dupliquer</button><button type="button" class="btn-link" data-action="supprimer" data-uid="${p.uid}">Supprimer</button>`;
    table += `<tr><td>${esc(L.min.entree.metier)}${alerte}<br><span class="muted">IDCC ${esc(L.min.conv.idcc)} · ${esc(libelleStatut(L.statut))}</span></td><td>${qte}</td><td class="r num">${eur(L.brutCents)}</td><td class="r num"><strong>${eur(L.coutTotal + (L.partFixes || 0))}</strong></td><td>${actions}</td></tr>`;
    cards += `<article class="poste-card"><h3>${esc(L.min.entree.metier)}</h3><p class="muted small">IDCC ${esc(L.min.conv.idcc)} · ${esc(libelleStatut(L.statut))} · ${qte}${alerte}</p><dl class="kv"><dt>Brut</dt><dd class="num">${eur(L.brutCents)}</dd><dt>Coût total</dt><dd class="num"><strong>${eur(L.coutTotal + (L.partFixes || 0))}</strong></dd></dl><p>${actions}</p></article>`;
  });
  table += `</tbody></table></div>`;
  cards += `</div>`;
  const recap = E.lignesRecapDevis(D);
  const detail = recap.detail.map(([lib, c]) => `<dt>${esc(lib)}</dt><dd class="num">${eur(c)}</dd>`).join('');
  box.innerHTML = `${table}${cards}
    <dl class="kv" style="margin-top:16px">${recap.visibles.map(([lib, c]) => `<dt>${esc(lib)}</dt><dd class="num">${eur(c)}</dd>`).join('')}</dl>
    <details><summary>Détail des totaux</summary><dl class="kv">${detail}</dl></details>
    <div class="big-row" style="margin-top:12px"><span class="big-label">Coût total</span><span class="big num">${eur(D.totaux.coutTotal)}</span></div>
    <div class="actions"><div class="export"><button type="button" class="btn" data-action="export-menu" aria-expanded="${state.exportOuvert}">Exporter</button>${state.exportOuvert ? '<div class="export-pop"><button type="button" data-action="pdf">PDF</button><button type="button" data-action="csv">CSV</button></div>' : ''}</div>
    <button type="button" class="btn btn-ghost" data-action="nouveau">${state.confirmNouveau ? 'Confirmer : tout effacer' : 'Nouveau devis'}</button>
    ${state.confirmNouveau ? '<button type="button" class="btn-link" data-action="annuler-nouveau">Annuler</button>' : ''}</div>
    <p id="export-statut" class="muted small" role="status"></p>`;
}

function sauverDevis() { lsSet(LS.devis, state.devis); lsSet(LS.reglages, state.reglages); }
function sauverForm() { lsSet(LS.form, state.form); }

function ajouterAuDevis(ev) {
  ev.preventDefault();
  if (!peutAjouter()) { majErreurs(); renderResultat(); return; }
  const brut = posteDepuisForm();
  const p = { ...brut, uid: state.editUid || uid(), _form: structuredClone(state.form) };
  delete p._conversion;
  if (state.editUid) {
    const i = state.devis.findIndex((x) => x.uid === state.editUid);
    if (i >= 0) state.devis[i] = p;
    state.editUid = null;
  } else state.devis.push(p);
  sauverDevis();
  planRender(ESS | ACT | DEV | RES);
  $('#devis')?.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
}

function onFormInput(ev) {
  const t = ev.target;
  if (t.id === 'f-metier') {
    state.recherche = t.value;
    state.metierOuvert = true;
    state.highlight = 0;
    renderSuggestions();
    return;
  }
  const k = t.dataset.k;
  if (!k || t.type === 'checkbox' || t.type === 'radio' || t.tagName === 'SELECT') return;
  setPath(state.form, k, t.value);
  sauverForm();
  majErreurs();
  renderResultat();
  majCompte();
  majAction();
}
function onFormChange(ev) {
  const t = ev.target;
  const k = t.dataset.k;
  if (!k) return;
  const val = t.type === 'checkbox' ? t.checked : t.value;
  if (k === 'convention') changerConvention(val);
  else if (k === 'genre' || k === 'grille') changerFiltre(k, val);
  else if (k === 'unite') changerUnite(val);
  else if (k === 'statut.categorie' || k === 'statut.cadre') { setPath(state.form, k, k === 'statut.cadre' ? val : val); state.form.statutForce = true; }
  else setPath(state.form, k, val);
  sauverForm();
  const structure = ['convention', 'genre', 'grille', 'unite', 'avance', 'intermediaire'].includes(k) || k === 'statut.categorie' || k === 'statut.cadre';
  planRender((structure ? ESS | AJU : 0) | RES | ACT);
}
function onProjet(ev) {
  const t = ev.target;
  if (t.id === 'projet-nom') { state.projet = t.value; lsSet(LS.projet, state.projet); majResume(); return; }
  const k = t.dataset.r;
  if (!k) return;
  if (k === 'mois') {
    const v = E.validerMois(t.value);
    const err = $('#err-mois');
    if (!v.ok) {
      if (err) err.textContent = v.message;
      if (ev.type === 'change') t.value = E.formatFrNombre(Number(state.reglages.mois));
      return;
    }
    if (err) err.textContent = '';
    state.reglages.mois = v.valeur;
    sauverDevis(); majResume(); planRender(DEV | RES);
    return;
  }
  if (k === 'valeurCredit') {
    const v = E.validerSaisieParam(t.value, { min: 0.5, max: 10 });
    if (!v.ok) {
      if (ev.type === 'change') t.value = String(state.reglages.valeurCredit ?? E.optionIntermediaire(DATA, state.reglages.intermediaire).valeur_credit_ht.defaut);
      return;
    }
    state.reglages.valeurCredit = v.valeur;
    sauverDevis(); planRender(DEV | RES);
    return;
  }
  state.reglages[k] = t.type === 'checkbox' ? t.checked : t.value;
  sauverDevis(); majResume();
  const structure = ['intermediaire', 'formule', 'premiereInscription', 'signature'].includes(k);
  planRender((structure ? PRO : 0) | DEV | RES);
}

function actions(ev) {
  const b = ev.target.closest('[data-action]');
  if (!b) {
    if (!ev.target.closest('.export')) state.exportOuvert = false;
    if (!ev.target.closest('.suggest')) {
      state.metierOuvert = false;
      const box = $('#metier-suggest');
      if (box) box.hidden = true;
    }
    if (state.exportOuvert === false && $('.export-pop') && !ev.target.closest('.export')) planRender(DEV);
    return;
  }
  const a = b.dataset.action;
  if (a === 'projet') { basculerProjet(); return; }
  if (a === 'tip') { b.closest('.tip')?.classList.toggle('is-open'); return; }
  if (a === 'statut') { state.statutOuvert = !state.statutOuvert; planRender(ESS); return; }
  if (a === 'saisie') {
    const mode = b.dataset.saisie;
    state.form.onglet = mode;
    if (mode === 'budget') state.form.saisie = 'budget';
    else {
      state.form.saisie = 'brut';
      if (mode === 'brut') state.form.demande.montant = '';
    }
    sauverForm();
    planRender(AJU | RES | ACT);
    return;
  }
  if (a === 'export-menu') { state.exportOuvert = !state.exportOuvert; planRender(DEV); return; }
  const i = state.devis.findIndex((x) => x.uid === b.dataset.uid);
  if (a === 'modifier' && i >= 0) {
    const saved = state.devis[i]._form || formVide();
    state.form = { ...formVide(saved.convention), ...structuredClone(saved) };
    state.recherche = entreeCourante()?.metier || '';
    state.editUid = state.devis[i].uid;
    state.ajusterOuvert = compteAjustements() > 0;
    planRender(ESS | AJU | RES | ACT);
    $('#poste-form')?.scrollIntoView({ block: 'start' });
  } else if (a === 'dupliquer' && i >= 0) {
    state.devis.splice(i + 1, 0, { ...structuredClone(state.devis[i]), uid: uid() });
    sauverDevis(); planRender(DEV);
  } else if (a === 'supprimer' && i >= 0) {
    state.devis.splice(i, 1);
    if (state.editUid === b.dataset.uid) state.editUid = null;
    sauverDevis(); planRender(DEV | ACT | ESS);
  } else if (a === 'annuler-edition') {
    state.editUid = null; planRender(ACT | ESS);
  } else if (a === 'nouveau') {
    if (!state.confirmNouveau) { state.confirmNouveau = true; planRender(DEV); return; }
    state.confirmNouveau = false; state.devis = []; state.editUid = null; state.projet = '';
    lsSet(LS.projet, '');
    sauverDevis(); planRender(PRO | ESS | DEV | ACT);
  } else if (a === 'annuler-nouveau') {
    state.confirmNouveau = false; planRender(DEV);
  } else if (a === 'csv') exporterCSV();
  else if (a === 'pdf') exporterPDF();
  else if (a === 'exemple') chargerExemple();
  else if (a === 'reset-params') { state.surcharges = {}; appliquerParametres(); planRender(0); renderSources(); }
}

function chargerExemple() {
  const mk = (conv, frag, extra = {}) => {
    const save = state.form;
    const saveR = state.recherche;
    state.form = { ...formVide(conv), ...extra };
    const p = E.listerPostes(DATA, conv, optsListe(state.form)).find((x) => x.metier.includes(frag));
    appliquerMetier(p.id);
    if (extra.apres) Object.assign(state.form, extra.apres);
    const brut = posteDepuisForm(state.form);
    const out = { ...brut, uid: uid(), _form: structuredClone(state.form) };
    delete out._conversion;
    state.form = save; state.recherche = saveR;
    return out;
  };
  state.devis = [
    mk('3097_pub', '1er assistant opérateur'),
    mk('2642', '1er assistant réalisateur', { genre: 'Fiction / documentaire' }),
    mk('1285', 'cachet représentation', { apres: { quantite: '2' } }),
  ];
  sauverDevis();
  planRender(DEV);
}

function telecharger(nom, contenu, type) {
  const blob = contenu instanceof Blob ? contenu : new Blob([contenu], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = nom; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}
function afficherStatut(msg) { const el = $('#export-statut'); if (el) el.textContent = msg; }
const nomFichier = (ext) => `devis-intermittents-${(state.projet || 'projet').toLowerCase().normalize('NFD').replace(/\p{M}/gu, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'projet'}-${new Date().toISOString().slice(0, 10)}.${ext}`;

function exporterCSV() {
  const D = E.calculerDevis(DATA, state.devis, state.reglages);
  telecharger(nomFichier('csv'), E.devisCSV(D, { projet: state.projet }), 'text/csv;charset=utf-8');
  state.exportOuvert = false;
}
function exporterPDF() {
  const D = E.calculerDevis(DATA, state.devis, state.reglages);
  const srcs = new Set();
  D.lignes.forEach((L) => { if (L.min.ligne.source) srcs.add(L.min.ligne.source); sourcesDe(L.frais.option.source).forEach((s) => srcs.add(s)); });
  srcs.add(DATA._meta.sources.AUDIENS);
  const date = new Date().toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
  const donnees = E.formatDateFr(DATA._meta.genere_le);
  const recap = E.lignesRecapDevis(D);
  $('#print-view').innerHTML = `<div class="pv-head"><div><p class="eyebrow">Simulation</p><h1>Devis intermittents</h1>${state.projet ? `<p><strong>${esc(state.projet)}</strong></p>` : ''}</div><div><p>${esc(date)}</p><p class="small">Données du ${esc(donnees)}</p></div></div>
    <table><thead><tr><th>Métier</th><th>Unité</th><th class="r">Brut</th><th class="r">Coût empl.</th><th class="r">Frais HT</th><th class="r">Coût total</th></tr></thead><tbody>
    ${D.lignes.map((L) => `<tr><td>${esc(L.min.entree.metier)}<br><span class="small">IDCC ${esc(L.min.conv.idcc)} · ${esc(libelleStatut(L.statut))}</span></td><td>${esc(L.min.unite.label)} × ${E.formatFrNombre(L.min.quantite)}</td><td class="r num">${eur(L.brutCents)}</td><td class="r num">${eur(L.cot.coutEmployeur)}</td><td class="r num">${eur(L.frais.ht)}</td><td class="r num">${eur(L.coutTotal)}</td></tr>`).join('')}
    </tbody></table><div class="pv-totaux"><dl class="kv">${recap.detail.map(([lib, c]) => `<dt>${esc(lib)}</dt><dd class="num">${eur(c)}</dd>`).join('')}</dl></div>
    <p class="pv-avert">${esc(E.AVERTISSEMENT)}</p>`;
  state.exportOuvert = false;
  if (window.jspdf?.jsPDF) { genererPDF(D, [...srcs].filter(Boolean), date, donnees, recap); return; }
  window.print();
}
function genererPDF(D, srcs, date, donnees, recap) {
  const txt = (s) => String(s ?? '').replace(/[\u202f\u00a0]/g, ' ').replace(/≤/g, '<=').replace(/≥/g, '>=').replace(/[\u2018\u2019]/g, "'").replace(/−/g, '-');
  const e = (c) => txt(eur(c));
  const doc = new window.jspdf.jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
  const W = doc.internal.pageSize.getWidth();
  const M = 14;
  doc.setFont('times', 'bold'); doc.setFontSize(22); doc.text('Devis intermittents', M, 22);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(95);
  doc.text(txt(date), W - M, 16, { align: 'right' });
  doc.text(txt(`Données du ${donnees}`), W - M, 21, { align: 'right' });
  if (state.projet) { doc.setTextColor(17); doc.setFontSize(11); doc.setFont('helvetica', 'bold'); doc.text(txt(state.projet), M, 29); }
  doc.setDrawColor(17); doc.line(M, 32, W - M, 32);
  doc.autoTable({
    startY: 36, margin: { left: M, right: M },
    head: [['Métier', 'Unité', 'Brut', 'Coût empl.', 'Frais HT', 'Coût total']],
    body: D.lignes.map((L) => [txt(`${L.min.entree.metier}\nIDCC ${L.min.conv.idcc} · ${libelleStatut(L.statut)}`), txt(`${L.min.unite.label} × ${E.formatFrNombre(L.min.quantite)}`), e(L.brutCents), e(L.cot.coutEmployeur), e(L.frais.ht), e(L.coutTotal)]),
    styles: { font: 'helvetica', fontSize: 8, cellPadding: 1.6, textColor: 17, lineColor: 220, lineWidth: 0.1 },
    headStyles: { fillColor: [17, 17, 17], textColor: 250, fontStyle: 'bold' },
    columnStyles: { 2: { halign: 'right' }, 3: { halign: 'right' }, 4: { halign: 'right' }, 5: { halign: 'right', fontStyle: 'bold' } },
  });
  const rows = recap.detail.map(([a, b]) => [txt(a), e(b)]);
  doc.autoTable({
    startY: doc.lastAutoTable.finalY + 6, margin: { left: W / 2 - 10, right: M }, body: rows, theme: 'plain',
    styles: { font: 'helvetica', fontSize: 8.5, cellPadding: 1.2, textColor: 17 },
    columnStyles: { 1: { halign: 'right' } },
    didParseCell: (d) => { if (d.row.index === rows.length - 1) { d.cell.styles.fontStyle = 'bold'; d.cell.styles.fontSize = 10; } },
  });
  let y = doc.lastAutoTable.finalY + 8;
  const H = doc.internal.pageSize.getHeight();
  const ligne = (s, size, style = 'normal') => {
    doc.setFont('helvetica', style); doc.setFontSize(size); doc.setTextColor(17);
    for (const l of doc.splitTextToSize(txt(s), W - 2 * M)) {
      if (y > H - 16) { doc.addPage(); y = 18; }
      doc.text(l, M, y); y += size * 0.45;
    }
  };
  ligne('Sources', 8, 'bold');
  srcs.forEach((s) => ligne(s, 7));
  y += 3; ligne(E.AVERTISSEMENT, 7.5);
  telecharger(nomFichier('pdf'), doc.output('blob'), 'application/pdf');
}

function renderSources() {
  const C = DATA.cotisations;
  const RAWC = RAW.cotisations;
  const inp = (attrs, v, base) => `<input type="text" inputmode="decimal" class="param-input" ${attrs} value="${esc(v ?? '')}" ${base !== undefined && String(v) !== String(base) ? 'style="border-color:var(--accent)"' : ''}>`;
  let h = `<div class="sources-grid"><section><h2>Sources</h2><p class="muted small">Données du ${esc(E.formatDateFr(DATA._meta.genere_le))}. ${esc(DATA._meta.avertissement)}</p><ul class="sources-list">`;
  for (const [k, url] of Object.entries(DATA._meta.sources)) h += `<li><code>${esc(k)}</code> ${lien(url, url)}</li>`;
  h += `</ul><p class="muted small">SMIC : ${esc(C.smic_horaire_brut.reference || '')} · ${lien(C.smic_horaire_brut.source, 'Insee')}</p></section>`;
  h += `<section><h2>Paramètres</h2><p class="muted small">Une valeur illisible est refusée : la précédente reste en vigueur.</p>
    <button type="button" class="btn btn-ghost" data-action="reset-params">Revenir aux valeurs du JSON</button>
    <div class="table-wrap"><table><thead><tr><th>Paramètre</th><th class="r">Valeur</th><th>Source</th></tr></thead><tbody>
    <tr><td>SMIC horaire brut (€) · ${esc(C.smic_horaire_brut.date_effet)}<br><span class="muted">${esc(C.smic_horaire_brut.reference || '')}</span></td><td class="r">${inp('data-p="smic"', C.smic_horaire_brut.valeur, RAWC.smic_horaire_brut.valeur)}</td><td>${lien(C.smic_horaire_brut.source, 'Insee')}</td></tr>
    <tr><td>Plafond journalier T1 (€)</td><td class="r">${inp('data-p="plafondT1"', C.plafonds_2026.plafond_journalier_intermittent_cadre_T1, RAWC.plafonds_2026.plafond_journalier_intermittent_cadre_T1)}</td><td>${lien(C.plafonds_2026.source)}</td></tr>`;
  const libP = {
    plafond_journalier_T2: 'Plafond journalier T2 (€)',
    plafond_vieillesse_artiste_jour: 'Plafond vieillesse artiste (€ / jour)',
    plafond_ss_journalier: 'Plafond SS journalier technicien (€) — à confirmer par un gestionnaire de paie',
    fnal_majoration_assiette: 'Majoration assiette FNAL artiste',
    csg_assiette_pct: 'Assiette CSG/CRDS (% du brut)',
    heures_mensuelles: 'Heures mensuelles',
    jours_prorata_mois: 'Jours pour le prorata mensuel',
  };
  for (const [k, lib] of Object.entries(libP)) h += `<tr><td>${esc(lib)}</td><td class="r">${inp(`data-p="parametres.${k}"`, C.parametres_calcul[k], RAWC.parametres_calcul[k])}</td><td>${lien(C.parametres_calcul.source)}</td></tr>`;
  h += `</tbody></table></div></section>`;
  h += `<section><h3>Taux de cotisation</h3><div class="table-wrap"><table><thead><tr><th>Cotisation</th><th class="r">Patronal %</th><th class="r">Salarial %</th><th>Statut</th></tr></thead><tbody>`;
  for (const l of C.lignes) {
    const b = RAWC.lignes.find((x) => x.code === l.code) || l;
    const statut = l.patronal === null ? '<span class="badge b-ko">Non trouvé</span>' : l.verifie ? '<span class="badge b-ok">Vérifié</span>' : '<span class="badge b-warn">À vérifier</span>';
    h += `<tr class="${l.code === 'at_mp' ? 'at-mp' : ''}"><td>${esc(l.libelle)}${l.note ? `<br><span class="muted">${esc(l.note)}</span>` : ''}</td>
      <td class="r">${inp(`data-c="${l.code}" data-f="patronal"`, l.patronal, b.patronal)}</td>
      <td class="r">${inp(`data-c="${l.code}" data-f="salarial"`, l.salarial, b.salarial)}</td><td>${statut}</td></tr>`;
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
  if (t.dataset.i) {
    const o = DATA.intermediaires.options.find((x) => x.id === t.dataset.i);
    if (t.dataset.f?.startsWith('abonnement.')) return o?.abonnement_mensuel_ht?.[t.dataset.f.split('.')[1]];
    return o?.[t.dataset.f];
  }
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
  } else if (t.dataset.i) {
    S.intermediaires = S.intermediaires || {};
    S.intermediaires[t.dataset.i] = { ...(S.intermediaires[t.dataset.i] || {}), [t.dataset.f]: check.valeur };
  }
  appliquerParametres();
  planRender(RES | DEV);
  // Ne pas reconstruire le tableau : le clic qui suit (autre taux, autre page) doit aboutir.
  const brut = valeurParamBrute(t);
  const courant = valeurParam(t);
  t.style.borderColor = brut !== undefined && String(courant) !== String(brut) ? 'var(--accent)' : '';
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

function route() {
  const v = location.hash === '#sources' ? 'sources' : 'simulateur';
  document.querySelectorAll('[data-view-panel]').forEach((s) => { s.hidden = s.dataset.viewPanel !== v; });
  document.querySelectorAll('.tabs a').forEach((a) => { if (a.dataset.view === v) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); });
  if (v === 'sources') { renderSources(); window.scrollTo(0, 0); }
}

function onKey(ev) {
  if (ev.target.id !== 'f-metier') return;
  const box = $('#metier-suggest');
  const btns = [...(box?.querySelectorAll('[data-poste]') || [])];
  if (ev.key === 'ArrowDown' || ev.key === 'ArrowUp') {
    ev.preventDefault();
    state.metierOuvert = true;
    if (!btns.length) renderSuggestions();
    const n = btns.length || 1;
    state.highlight = (state.highlight + (ev.key === 'ArrowDown' ? 1 : -1) + n) % n;
    renderSuggestions();
  } else if (ev.key === 'Enter') {
    ev.preventDefault();
    choisirSuggestion();
  } else if (ev.key === 'Escape') {
    state.metierOuvert = false;
    renderSuggestions();
  }
}

async function init() {
  try {
    const r = await fetch('data/simulateur_data.json', { cache: 'no-cache' });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    RAW = await r.json();
  } catch (e) {
    const box = $('#load-error');
    box.hidden = false;
    box.textContent = `Impossible de lire les données (${e.message}). Ouvrez le site via un serveur local.`;
    return;
  }
  state.surcharges = nettoyerSurcharges(lsGet(LS.surcharges, {}));
  DATA = E.appliquerSurcharges(RAW, state.surcharges);
  state.devis = lsGet(LS.devis, []);
  state.reglages = { ...E.REGLAGES_DEFAUT, ...lsGet(LS.reglages, {}) };
  const mois = E.validerMois(state.reglages.mois);
  state.reglages.mois = mois.ok ? mois.valeur : 1;
  state.projet = lsGet(LS.projet, '') || '';
  const fs = lsGet(LS.form, null);
  if (fs && DATA.conventions[fs.convention]) {
    const blank = formVide(fs.convention);
    state.form = { ...blank, ...fs, heures: { ...blank.heures, ...(fs.heures || {}) }, majoPct: { ...blank.majoPct, ...(fs.majoPct || {}) }, demande: { ...blank.demande, ...(fs.demande || {}) }, budget: { ...blank.budget, ...(fs.budget || {}) }, statut: { ...blank.statut, ...(fs.statut || {}) } };
    if (!entreeCourante()) state.form.posteId = null;
  } else {
    state.form = formVide('3097_pub');
    const p = E.listerPostes(DATA, '3097_pub').find((x) => x.metier === '1er assistant opérateur');
    if (p) appliquerMetier(p.id);
  }
  state.recherche = entreeCourante()?.metier || state.recherche || '';
  $('#avertissement-complet').textContent = E.AVERTISSEMENT;
  $('#lien-avertissement').addEventListener('click', () => {
    const el = $('#avertissement-complet');
    el.hidden = !el.hidden;
  });
  const form = $('#poste-form');
  form.addEventListener('input', onFormInput);
  form.addEventListener('change', onFormChange);
  form.addEventListener('submit', ajouterAuDevis);
  form.addEventListener('keydown', onKey);
  form.addEventListener('mousedown', (e) => { if (e.target.closest('#metier-suggest button')) e.preventDefault(); });
  form.addEventListener('click', (e) => {
    const poste = e.target.closest('[data-poste]');
    if (poste) choisirSuggestion(poste.dataset.poste);
  });
  form.addEventListener('focusin', (e) => { if (e.target.id === 'f-metier') { state.metierOuvert = true; renderSuggestions(); } });
  form.addEventListener('focusout', (e) => {
    if (e.target.id !== 'f-metier') return;
    setTimeout(() => {
      if (document.activeElement?.closest?.('#metier-suggest')) return;
      const cur = entreeCourante();
      state.recherche = cur ? cur.metier : '';
      state.metierOuvert = false;
      const input = $('#f-metier');
      if (input && document.activeElement !== input) input.value = state.recherche;
      renderSuggestions();
    }, 0);
  });
  $('#ajuster').addEventListener('toggle', (e) => { if (e.target.id === 'ajuster-details') state.ajusterOuvert = e.target.open; }, true);
  $('#projet-bar').addEventListener('input', (e) => { if (e.target.tagName !== 'SELECT' && e.target.type !== 'checkbox') onProjet(e); });
  $('#projet-bar').addEventListener('change', onProjet);
  document.addEventListener('click', actions);
  $('#sources-body').addEventListener('change', surParametre);
  window.addEventListener('hashchange', route);
  renderProjet(); renderEssentiels(); renderAjuster(); renderResultat(); renderActions(); renderDevis(); route();
  const pied = document.querySelector('.avertissement');
  if (pied && !pied.dataset.date) {
    pied.dataset.date = '1';
    const date = document.createElement('span');
    date.textContent = ` Données du ${E.formatDateFr(DATA._meta.genere_le)}. `;
    pied.insertBefore(date, $('#lien-avertissement'));
  }
}

init();
