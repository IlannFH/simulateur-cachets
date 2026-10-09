// Parcours en trois branches. Le statut artiste/technicien vient du métier.
import * as E from '../engine/index.js';

const LS = {
  devis: 'simcachets.devis.v1',
  reglages: 'simcachets.reglages.v1',
  surcharges: 'simcachets.surcharges.v1',
  form: 'simcachets.form.v1',
  projet: 'simcachets.projet.v1',
};
const CONVENTIONS = [
  { key: '3097_pub', label: 'Publicité' },
  { key: '3097_cinema', label: 'Cinéma' },
  { key: '2642', label: 'Audiovisuel' },
  { key: '1285', label: 'Spectacle subventionné' },
  { key: '3090', label: 'Spectacle privé' },
];

const $ = (s, r = document) => r.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/\p{M}/gu, '');
const uid = () => Math.random().toString(36).slice(2, 10);
const sourcesDe = (s) => (Array.isArray(s) ? s : s ? [s] : []);
const lien = (url, label) => (url ? `<a href="${esc(url)}" target="_blank" rel="noopener">${esc(label || url)}</a>` : '');
const lsGet = (k, d) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* quota */ } };

const heuresVides = () => ({ nuit: '', dimanche: '', ferie: '', premierMai: '', ferieMineur: '', sup: '' });
const majoVides = () => ({ sup: '', nuit: '', dimanche: '', ferie: '' });
function parcoursVide() {
  return {
    depart: null, etape: 'depart', montant: '', convention: '', posteId: null, recherche: '',
    genre: '', grille: '2025', jauge: '200', unite: null, quantite: '1', representations: '',
    exploitationContinue: false, ouvrier: false, heuresParJour: '', heuresSemaine: '', joursProrata: '',
    heures: heuresVides(), majoPct: majoVides(), cadre: null, cadreTouche: false,
    jours: '', bulletins: '1', contrats: '1', intermediaire: '', fraisManuel: '',
    avance: false, abattementPct: '', rgduPct: '', affinerOuvert: false, highlight: 0, ouvert: false,
  };
}

let RAW = null;
let DATA = null;
let CATALOGUE = [];
let sourcesDessine = false;
const state = {
  parcours: parcoursVide(),
  devis: [],
  reglages: { ...E.REGLAGES_DEFAUT },
  surcharges: {},
  projet: '',
  editUid: null,
  exportOuvert: false,
  confirmVide: false,
};

function setPath(obj, path, v) {
  const ks = path.split('.');
  let cur = obj;
  ks.slice(0, -1).forEach((k) => { cur[k] = cur[k] && typeof cur[k] === 'object' ? cur[k] : {}; cur = cur[k]; });
  cur[ks.at(-1)] = v;
}
function indexer() {
  CATALOGUE = [];
  for (const c of CONVENTIONS) {
    for (const p of E.listerPostes(DATA, c.key)) CATALOGUE.push({ ...p, convention: c.key, convLabel: c.label });
  }
}
function vue() {
  const h = location.hash;
  if (h === '#sources') return 'sources';
  if (h === '#devis') return 'devis';
  return 'simuler';
}
function sauverForm() {
  const p = { ...state.parcours, ouvert: false };
  lsSet(LS.form, { parcours: p, editUid: state.editUid });
}
function sauverDevis() { lsSet(LS.devis, state.devis); lsSet(LS.reglages, state.reglages); }

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
function figerStatut(poste) {
  const e = E.trouverPoste(DATA, poste.convention, poste.posteId, { genre: poste.genre, grille: poste.grille });
  if (!e) return poste;
  const st = E.statutPourMetier(e, poste.statut);
  return { ...poste, statut: { categorie: st.categorie, cadre: st.cadre } };
}
const libelleStatut = (s) => `${s.categorie === 'artiste' ? 'Artiste' : 'Technicien'} · ${s.cadre ? 'cadre' : 'non-cadre'}`;

function besoinPrecision() {
  const u = uniteCourante();
  return !!u && (u.key === 'horaire_jauge' || u.key === 'cachet_palier' || u.key === 'cachet_representation');
}
function etapesActives() {
  const p = state.parcours;
  const list = [];
  if (p.depart === 'budget' || p.depart === 'brut') list.push('montant');
  list.push('metier');
  list.push('quantite');
  if (besoinPrecision()) list.push('precision');
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
    jours: num(p.jours), bulletins: num(p.bulletins) ?? 1, contrats: num(p.contrats) ?? 1,
    intermediaire: p.intermediaire || '', fraisManuel: num(p.fraisManuel),
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
    const nom = entreeCourante()?.metier || 'Métier';
    return nom.length > 32 ? `${nom.slice(0, 30)}…` : nom;
  }
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
  if (p.etape === 'quantite') return 'Combien ?';
  if (p.etape === 'precision') return uniteCourante()?.key === 'horaire_jauge' ? 'Quelle jauge ?' : 'Combien de dates dans le mois ?';
  return entreeCourante()?.metier || 'Résultat';
}

function choisirDepart(d) {
  state.parcours.depart = d;
  state.parcours.etape = d === 'metier' ? 'metier' : 'montant';
  state.parcours.ouvert = false;
  state.editUid = null;
  sauverForm();
  render();
}
function choisirPoste(convention, id) {
  const p = state.parcours;
  p.convention = convention;
  p.posteId = id;
  p.ouvert = false;
  p.cadreTouche = false;
  p.cadre = null;
  const e = entreeCourante();
  p.recherche = e?.metier || '';
  p.genre = e?.ligne?.genre || '';
  if (/NAO 2026/.test(e?.metier || '')) p.grille = '2026';
  else if (/2025/.test(e?.metier || '')) p.grille = '2025';
  const u = unitesCourantes(e)[0];
  p.unite = u?.key || null;
  if (u?.kind === 'heure' && (p.quantite === '1' || !p.quantite)) p.quantite = '8';
  const list = etapesActives();
  p.etape = list[list.indexOf('metier') + 1] || 'resultat';
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
  state.editUid = null;
  sauverForm();
  if (location.hash && location.hash !== '#simuler') location.hash = '#simuler';
  else render();
}
function validerEtape() {
  const et = state.parcours.etape;
  const msg = et === 'montant' ? erreurMontant() : et === 'metier' ? (state.parcours.posteId ? '' : 'Choisis un métier dans la liste.') : et === 'quantite' ? erreurQuantite() : et === 'precision' ? erreurPrecision() : '';
  const el = $('#err');
  if (el) el.textContent = msg;
  return !msg;
}

function figure(montant, label) {
  return `<p class="figure"><span class="n">${esc(montant)}</span><span class="lbl">${esc(label)}</span></p>`;
}
function notesCalcul(L) {
  const out = [];
  if (!L) return out;
  if (L.min.nonTrouve) out.push('Minimum non trouvé : plancher SMIC.');
  else if (L.min.smicApplique || L.min.plancherSmic) out.push('Plancher SMIC.');
  for (const a of L.min.avertissements || []) if (/non chiffrée/i.test(a)) out.push(a);
  return out;
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
  if (p.depart === 'budget') {
    const euros = E.validerBrut(p.montant, { label: 'budget' }).valeur;
    const r = E.convertirBudget(DATA, { ...poste, demande: null }, euros, state.reglages);
    let h = '';
    if (r.ligne) {
      h += figure(E.formatEuros(r.brutCents), 'Brut');
      h += figure(E.formatEuros(r.ligne.cot.net), 'Net');
    }
    h += r.possible
      ? '<p class="verdict ok">OK</p>'
      : `<p class="verdict ko">Pas assez</p><p class="lbl">Minimum ${esc(E.formatEuros(r.budgetMinimum))} HT</p>`;
    const bloque = (r.avertissements || []).filter((a) => a.niveau === 'bloquant' && /GUSO|dépassent déjà/i.test(a.texte));
    h += bloque.map((a) => `<p class="note">${esc(a.texte)}</p>`).join('');
    if (r.ligne) h += notesCalcul(r.ligne).map((t) => `<p class="note">${esc(t)}</p>`).join('');
    return h;
  }
  const L = E.calculerLigne(DATA, p.depart === 'brut' ? poste : { ...poste, demande: null }, state.reglages);
  if (!L) return '';
  let h = '';
  if (p.depart === 'brut') {
    h += figure(E.formatEuros(L.cot.coutEmployeur), 'Coût employeur');
    h += figure(E.formatEuros(L.cot.net), 'Net');
    h += L.demande?.sousMinimum
      ? `<p class="verdict ko">Sous le minimum</p><p class="lbl">Minimum ${esc(E.formatEuros(L.min.minimumCents))}</p>`
      : '<p class="verdict ok">OK</p>';
  } else {
    h += figure(E.formatEuros(L.min.minimumCents), 'Minimum');
    h += figure(E.formatEuros(L.cot.coutEmployeur), 'Coût employeur');
    h += figure(E.formatEuros(L.coutTotal), 'Coût total');
    h += figure(E.formatEuros(L.cot.net), 'Net');
  }
  h += notesCalcul(L).map((t) => `<p class="note">${esc(t)}</p>`).join('');
  return h;
}
function htmlAffiner() {
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
  if (st.cadreEditable) h += `<label class="check"><input type="checkbox" data-k="cadre" ${st.cadre ? 'checked' : ''}>Cadre</label>`;
  h += `<label class="lbl" for="f-inter">Intermédiaire de la ligne</label><select id="f-inter" data-k="intermediaire"><option value="">Comme le devis</option>${DATA.intermediaires.options.map((o) => `<option value="${o.id}" ${p.intermediaire === o.id ? 'selected' : ''}>${esc(o.nom.split(' (')[0])}</option>`).join('')}</select>`;
  h += champ('f-jours', 'jours', 'Jours pour les plafonds', p.jours);
  h += champ('f-bulletins', 'bulletins', 'Bulletins', p.bulletins);
  h += champ('f-contrats', 'contrats', 'Contrats', p.contrats);
  h += `</div></details>`;
  return h;
}
function htmlCotis() {
  const poste = posteDepuisParcours();
  if (!poste) return '';
  let L = null;
  if (state.parcours.depart === 'budget') {
    const euros = E.validerBrut(state.parcours.montant, { label: 'budget' }).valeur;
    L = E.convertirBudget(DATA, { ...poste, demande: null }, euros, state.reglages)?.ligne || null;
  } else L = E.calculerLigne(DATA, poste, state.reglages);
  if (!L) return '';
  let rows = '';
  for (const l of L.cot.lignes) {
    rows += `<tr><td>${esc(l.libelle)}</td><td class="r">${l.nonTrouve ? '—' : esc(E.formatEuros(l.patronal))}</td><td class="r">${esc(E.formatEuros(l.salarial))}</td></tr>`;
  }
  return `<details><summary>Cotisations</summary><div class="table-wrap"><table><thead><tr><th>Cotisation</th><th class="r">Patronal</th><th class="r">Salarial</th></tr></thead><tbody>${rows}</tbody></table></div><p class="lbl">Le plafond vieillesse des techniciens est à confirmer par un gestionnaire de paie.</p></details>`;
}

function chercher(q) {
  const n = norm(q);
  if (!n) return [];
  const hits = CATALOGUE.filter((p) => norm(`${p.metier} ${p.departement} ${p.categorie} ${p.convLabel} ${p.ligne?.genre || ''}`).includes(n));
  hits.sort((a, b) => (norm(a.metier).startsWith(n) ? 0 : 1) - (norm(b.metier).startsWith(n) ? 0 : 1) || a.metier.localeCompare(b.metier, 'fr'));
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
    const meta = [hit.convLabel, hit.ligne?.genre, st].filter(Boolean).join(' · ');
    const sel = hit.convention === p.convention && hit.id === p.posteId;
    return `<button type="button" role="option" data-poste="${esc(hit.id)}" data-convention="${esc(hit.convention)}" aria-selected="${i === p.highlight || sel}"><span>${esc(hit.metier)}</span><span class="sug-meta">${esc(meta)}</span></button>`;
  }).join('');
}

function htmlSimuler() {
  const p = state.parcours;
  if (p.etape === 'depart' || !p.depart) {
    return `<div class="ecran"><h2 class="q">Tu pars de quoi ?</h2><div class="choix">
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
    const st = statutCourant();
    const ok = !!posteDepuisParcours();
    return `<div class="ecran">${head}<h2 class="nom">${esc(titre())}</h2><p class="stat">${esc(libelleStatut(st))}</p><div id="chiffres" class="figures">${htmlChiffres()}</div>${htmlAffiner()}${htmlCotis()}<div class="bas"><button type="button" class="pixel-btn" id="btn-ajouter" data-action="ajouter" ${ok ? '' : 'disabled'}>${state.editUid ? 'Enregistrer' : 'Ajouter au devis'}</button></div></div>`;
  }
  let corps = '';
  if (p.etape === 'montant') {
    corps = `<label class="lbl" for="f-montant">${p.depart === 'budget' ? 'Montant HT' : 'Brut'}</label><input id="f-montant" data-autofocus type="text" inputmode="decimal" autocomplete="off" value="${esc(p.montant)}" placeholder="250">`;
  } else if (p.etape === 'metier') {
    corps = `<label class="lbl" for="f-metier">Métier</label><input id="f-metier" data-autofocus type="search" autocomplete="off" role="combobox" aria-autocomplete="list" aria-controls="suggest" aria-expanded="${p.ouvert}" value="${esc(p.recherche)}" placeholder="photo, danseur, assistant"><div id="suggest" class="suggest"></div>`;
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
  const suite = `<p id="err" role="alert"></p><div class="bas"><button type="button" class="pixel-btn" data-next>Continuer</button></div>`;
  return `<div class="ecran">${head}<h2 class="q" id="q">${esc(titre())}</h2>${corps}${suite}</div>`;
}

function htmlDevis() {
  const D = E.calculerDevis(DATA, state.devis, state.reglages);
  const r = state.reglages;
  const o = E.optionIntermediaire(DATA, r.intermediaire);
  const ab = o.abonnement_mensuel_ht && typeof o.abonnement_mensuel_ht === 'object';
  let reglages = `<label class="lbl" for="projet-nom">Projet</label><input id="projet-nom" type="text" autocomplete="off" value="${esc(state.projet)}" placeholder="Nom">`;
  reglages += `<label class="lbl" for="r-intermediaire">Intermédiaire</label><select id="r-intermediaire" data-r="intermediaire">${DATA.intermediaires.options.map((x) => `<option value="${x.id}" ${x.id === r.intermediaire ? 'selected' : ''}>${esc(x.nom.split(' (')[0])}</option>`).join('')}</select>`;
  reglages += `<label class="lbl" for="r-mois">Mois</label><input id="r-mois" type="text" inputmode="decimal" data-r="mois" value="${esc(E.formatFrNombre(Number(r.mois)))}"><p id="err-mois" class="note"></p>`;
  let plus = '';
  if (ab) {
    plus += `<label class="lbl" for="r-formule">Abonnement</label><select id="r-formule" data-r="formule"><option value="basic" ${r.formule === 'basic' ? 'selected' : ''}>Basic</option><option value="premium" ${r.formule === 'premium' ? 'selected' : ''}>Premium</option><option value="aucune" ${r.formule === 'aucune' ? 'selected' : ''}>Aucun</option></select>`;
  }
  if (o.signature_electronique_contrat_ht) plus += `<label class="check"><input type="checkbox" data-r="signature" ${r.signature ? 'checked' : ''}>Signature électronique</label>`;
  plus += `<label class="check"><input type="checkbox" data-r="prorata" ${r.prorata ? 'checked' : ''}>Répartir l'abonnement</label>`;
  const lignes = D.lignes.map((L, i) => {
    const id = state.devis[i].uid;
    return `<article class="ligne"><h3>${esc(L.min.entree.metier)}</h3><p class="lbl">${esc(L.min.conv.nom.split('–')[0].trim())} · ${esc(libelleStatut(L.statut))} · ${esc(L.min.unite.label)} × ${esc(E.formatFrNombre(L.min.quantite))}</p><p class="n">${esc(E.formatEuros(L.coutTotal + (L.partFixes || 0)))}</p><p class="actions"><button type="button" class="lien" data-action="modifier" data-uid="${esc(id)}">Modifier</button><button type="button" class="lien" data-action="dupliquer" data-uid="${esc(id)}">Dupliquer</button><button type="button" class="lien" data-action="supprimer" data-uid="${esc(id)}">Supprimer</button></p></article>`;
  }).join('');
  const vide = D.lignes.length ? '' : `<p class="lbl">Aucune ligne.</p><button type="button" class="pixel-btn" data-action="exemple">Exemple</button>`;
  const recap = E.lignesRecapDevis(D);
  let totaux = '';
  if (D.lignes.length) {
    totaux = `<div class="figures total">${recap.visibles.map(([lib, c]) => figure(E.formatEuros(c), lib)).join('')}<p class="figure"><span class="n">${esc(E.formatEuros(D.totaux.coutTotal))}</span><span class="lbl">Total</span></p></div><details><summary>Détail</summary><div class="figures">${recap.detail.map(([lib, c]) => figure(E.formatEuros(c), lib)).join('')}</div></details>`;
    totaux += `<div class="export"><button type="button" class="pixel-btn" data-action="export-menu">Exporter</button>${state.exportOuvert ? '<div class="pop"><button type="button" class="ghost" data-action="pdf">PDF</button><button type="button" class="ghost" data-action="csv">CSV</button></div>' : ''}<p id="export-statut" class="lbl" role="status"></p></div>`;
    totaux += state.confirmVide
      ? `<button type="button" class="lien" data-action="vider-oui">Oui, vider</button> <button type="button" class="lien" data-action="vider-non">Annuler</button>`
      : `<button type="button" class="lien" data-action="vider">Vider</button>`;
  }
  return `<div class="ecran"><h2 class="q">Devis</h2><div class="bloc">${reglages}</div><details><summary>Réglages</summary><div class="bloc">${plus}</div></details>${vide}${lignes}${totaux}</div>`;
}

function ajouterAuDevis() {
  if (!posteDepuisParcours()) { majChiffres(); return; }
  const poste = figerStatut(posteDepuisParcours());
  const ligne = { ...poste, uid: state.editUid || uid(), _parcours: structuredClone({ ...state.parcours, ouvert: false }) };
  if (state.editUid) {
    const i = state.devis.findIndex((x) => x.uid === state.editUid);
    if (i >= 0) state.devis[i] = ligne;
    else state.devis.push(ligne);
  } else state.devis.push(ligne);
  state.editUid = null;
  state.parcours = parcoursVide();
  sauverDevis();
  sauverForm();
  if (location.hash !== '#devis') location.hash = '#devis';
  else render();
}
function parcoursDepuisPoste(poste) {
  const p = parcoursVide();
  p.depart = poste.demande?.montant ? 'brut' : 'metier';
  p.etape = 'resultat';
  p.montant = poste.demande?.montant != null ? String(poste.demande.montant) : '';
  p.convention = poste.convention || '';
  p.posteId = poste.posteId || null;
  p.unite = poste.unite || null;
  p.quantite = String(poste.quantite ?? 1);
  p.grille = poste.grille || '2025';
  p.jauge = poste.jauge || '200';
  p.genre = poste.genre || '';
  p.cadre = typeof poste.statut?.cadre === 'boolean' ? poste.statut.cadre : null;
  p.cadreTouche = typeof poste.statut?.cadre === 'boolean';
  p.representations = poste.representations != null ? String(poste.representations) : '';
  p.exploitationContinue = !!poste.exploitationContinue;
  p.ouvrier = !!poste.ouvrier;
  p.heuresParJour = poste.heuresParJour != null ? String(poste.heuresParJour) : '';
  p.bulletins = String(poste.bulletins ?? 1);
  p.contrats = String(poste.contrats ?? 1);
  p.intermediaire = poste.intermediaire || '';
  const e = E.trouverPoste(DATA, p.convention, p.posteId, p);
  p.recherche = e?.metier || '';
  return p;
}
function modifierLigne(id) {
  const ligne = state.devis.find((x) => x.uid === id);
  if (!ligne) return;
  const saved = ligne._parcours;
  if (saved?.depart) {
    state.parcours = {
      ...parcoursVide(), ...structuredClone(saved),
      heures: { ...heuresVides(), ...(saved.heures || {}) },
      majoPct: { ...majoVides(), ...(saved.majoPct || {}) },
      etape: 'resultat', ouvert: false,
    };
  } else state.parcours = parcoursDepuisPoste(ligne);
  state.editUid = id;
  sauverForm();
  if (location.hash !== '#simuler') location.hash = '#simuler';
  else render();
}
function dupliquer(id) {
  const i = state.devis.findIndex((x) => x.uid === id);
  if (i < 0) return;
  const copy = figerStatut(structuredClone(state.devis[i]));
  copy.uid = uid();
  state.devis.splice(i + 1, 0, copy);
  sauverDevis();
  render();
}
function chargerExemple() {
  const mk = (conv, frag, qte) => {
    const e = E.listerPostes(DATA, conv).find((x) => x.metier.includes(frag));
    const u = E.unitesDisponibles(e, DATA.conventions[conv])[0];
    const st = E.statutPourMetier(e, {});
    const q = qte || (u.kind === 'heure' ? 8 : 1);
    return {
      convention: conv, posteId: e.id, unite: u.key, quantite: q, grille: /NAO 2026/.test(e.metier) ? '2026' : '2025',
      jauge: '200', representations: q, heures: { nuit: 0, dimanche: 0, ferie: 0, premierMai: 0, ferieMineur: 0, sup: 0 },
      majoPct: { sup: '', nuit: '', dimanche: '', ferie: '' }, statut: { categorie: st.categorie, cadre: st.cadre },
      demande: null, bulletins: 1, contrats: 1, uid: uid(),
    };
  };
  state.devis = [
    figerStatut(mk('3097_pub', '1er assistant opérateur')),
    figerStatut(mk('2642', '1er assistant réalisateur')),
    figerStatut(mk('1285', 'cachet représentation', 2)),
  ];
  sauverDevis();
  render();
}

function onProjet(ev) {
  const t = ev.target;
  if (t.id === 'projet-nom') { state.projet = t.value; lsSet(LS.projet, state.projet); return; }
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
    sauverDevis();
    planRender();
    return;
  }
  state.reglages[k] = t.type === 'checkbox' ? t.checked : t.value;
  sauverDevis();
  planRender();
}
function planRender() {
  clearTimeout(planRender.t);
  planRender.t = setTimeout(render, 0);
}

function majChiffres() {
  const box = $('#chiffres');
  if (box) box.innerHTML = htmlChiffres();
  const btn = $('#btn-ajouter');
  if (btn) btn.disabled = !posteDepuisParcours();
}

function render() {
  const v = vue();
  document.querySelectorAll('.nav a').forEach((a) => {
    if (a.dataset.view === 'devis') a.textContent = state.devis.length ? `Devis ${state.devis.length}` : 'Devis';
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
  ecran.innerHTML = v === 'devis' ? htmlDevis() : htmlSimuler();
  const focus = ecran.querySelector('[data-autofocus]');
  if (focus) focus.focus();
  if (v === 'simuler' && state.parcours.etape === 'metier') renderSuggestions();
}

function onClick(ev) {
  const b = ev.target.closest('[data-depart], [data-goto], [data-back], [data-next], [data-poste], [data-unite], [data-action]');
  if (!b) {
    if (!ev.target.closest('.export')) state.exportOuvert = false;
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
  if (b.dataset.poste) { choisirPoste(b.dataset.convention, b.dataset.poste); return; }
  if (b.dataset.unite) { changerUnite(b.dataset.unite); return; }
  const a = b.dataset.action;
  if (a === 'recommencer') { recommencer(); return; }
  if (a === 'ajouter') { ajouterAuDevis(); return; }
  if (a === 'modifier') { modifierLigne(b.dataset.uid); return; }
  if (a === 'dupliquer') { dupliquer(b.dataset.uid); return; }
  if (a === 'supprimer') {
    state.devis = state.devis.filter((x) => x.uid !== b.dataset.uid);
    if (state.editUid === b.dataset.uid) state.editUid = null;
    sauverDevis();
    render();
    return;
  }
  if (a === 'exemple') { chargerExemple(); return; }
  if (a === 'vider') { state.confirmVide = true; render(); return; }
  if (a === 'vider-non') { state.confirmVide = false; render(); return; }
  if (a === 'vider-oui') {
    state.confirmVide = false; state.devis = []; state.editUid = null; sauverDevis(); render(); return;
  }
  if (a === 'export-menu') { state.exportOuvert = !state.exportOuvert; render(); return; }
  if (a === 'csv') { exporterCSV(); return; }
  if (a === 'pdf') { exporterPDF(); return; }
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
  if (t.id === 'f-metier') {
    state.parcours.recherche = t.value;
    state.parcours.ouvert = true;
    state.parcours.highlight = 0;
    const e = entreeCourante();
    if (e && norm(t.value) !== norm(e.metier)) state.parcours.posteId = null;
    renderSuggestions();
    return;
  }
  if (t.id === 'f-montant') { state.parcours.montant = t.value; sauverForm(); return; }
  if (t.id === 'f-quantite') { state.parcours.quantite = t.value; sauverForm(); return; }
  if (t.id === 'f-representations') { state.parcours.representations = t.value; sauverForm(); return; }
  if (t.id === 'projet-nom') { state.projet = t.value; lsSet(LS.projet, state.projet); return; }
  if (t.dataset.r === 'mois') return;
  const k = t.dataset.k;
  if (!k || t.type === 'checkbox' || t.tagName === 'SELECT') return;
  setPath(state.parcours, k, t.value);
  sauverForm();
  if (state.parcours.etape === 'resultat') majChiffres();
}
function onChange(ev) {
  const t = ev.target;
  if (t.dataset.r || t.id === 'projet-nom') { onProjet(ev); return; }
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
    if (hit) choisirPoste(hit.convention, hit.id);
    else { const el = $('#err'); if (el) el.textContent = 'Choisis un métier dans la liste.'; }
  } else if (ev.key === 'Escape') {
    state.parcours.ouvert = false;
    renderSuggestions();
  }
}

function telecharger(nom, contenu, type) {
  const blob = contenu instanceof Blob ? contenu : new Blob([contenu], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = nom; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}
const nomFichier = (ext) => `devis-intermittents-${(state.projet || 'projet').toLowerCase().normalize('NFD').replace(/\p{M}/gu, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'projet'}-${new Date().toISOString().slice(0, 10)}.${ext}`;
function exporterCSV() {
  const D = E.calculerDevis(DATA, state.devis, state.reglages);
  telecharger(nomFichier('csv'), E.devisCSV(D, { projet: state.projet }), 'text/csv;charset=utf-8');
  state.exportOuvert = false;
  render();
}
function exporterPDF() {
  const D = E.calculerDevis(DATA, state.devis, state.reglages);
  const srcs = new Set();
  D.lignes.forEach((L) => { if (L.min.ligne.source) srcs.add(L.min.ligne.source); sourcesDe(L.frais.option.source).forEach((s) => srcs.add(s)); });
  srcs.add(DATA._meta.sources.AUDIENS);
  const date = new Date().toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
  const donnees = E.formatDateFr(DATA._meta.genere_le);
  const recap = E.lignesRecapDevis(D);
  const eur = (c) => E.formatEuros(c);
  $('#print-view').innerHTML = `<div class="pv-head"><h1>Devis</h1><p>${esc(date)}<br>Données du ${esc(donnees)}</p></div>${state.projet ? `<p><strong>${esc(state.projet)}</strong></p>` : ''}<table><thead><tr><th>Métier</th><th>Unité</th><th class="r">Brut</th><th class="r">Coût empl.</th><th class="r">Frais HT</th><th class="r">Coût total</th></tr></thead><tbody>${D.lignes.map((L) => `<tr><td>${esc(L.min.entree.metier)}<br>${esc(libelleStatut(L.statut))}</td><td>${esc(L.min.unite.label)} × ${esc(E.formatFrNombre(L.min.quantite))}</td><td class="r">${esc(eur(L.brutCents))}</td><td class="r">${esc(eur(L.cot.coutEmployeur))}</td><td class="r">${esc(eur(L.frais.ht))}</td><td class="r">${esc(eur(L.coutTotal))}</td></tr>`).join('')}</tbody></table><div class="pv-totaux">${recap.detail.map(([lib, c]) => `<p>${esc(lib)} ${esc(eur(c))}</p>`).join('')}</div><p class="pv-avert">${esc(E.AVERTISSEMENT)}</p>`;
  state.exportOuvert = false;
  if (window.jspdf?.jsPDF) { genererPDF(D, [...srcs].filter(Boolean), date, donnees, recap); return; }
  window.print();
}
function genererPDF(D, srcs, date, donnees, recap) {
  const txt = (s) => String(s ?? '').replace(/[\u202f\u00a0]/g, ' ').replace(/≤/g, '<=').replace(/≥/g, '>=').replace(/[\u2018\u2019]/g, "'").replace(/−/g, '-');
  const e = (c) => txt(E.formatEuros(c));
  const doc = new window.jspdf.jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
  const W = doc.internal.pageSize.getWidth();
  const M = 14;
  doc.setFont('helvetica', 'bold'); doc.setFontSize(18); doc.text('Devis', M, 18);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9);
  doc.text(txt(date), W - M, 14, { align: 'right' });
  doc.text(txt(`Données du ${donnees}`), W - M, 19, { align: 'right' });
  if (state.projet) doc.text(txt(state.projet), M, 26);
  doc.autoTable({
    startY: 32, margin: { left: M, right: M },
    head: [['Métier', 'Unité', 'Brut', 'Coût empl.', 'Frais HT', 'Coût total']],
    body: D.lignes.map((L) => [txt(`${L.min.entree.metier}\n${libelleStatut(L.statut)}`), txt(`${L.min.unite.label} × ${E.formatFrNombre(L.min.quantite)}`), e(L.brutCents), e(L.cot.coutEmployeur), e(L.frais.ht), e(L.coutTotal)]),
    styles: { font: 'helvetica', fontSize: 8, cellPadding: 1.6, textColor: 20 },
    headStyles: { fillColor: [27, 27, 42], textColor: 243 },
    columnStyles: { 2: { halign: 'right' }, 3: { halign: 'right' }, 4: { halign: 'right' }, 5: { halign: 'right' } },
  });
  const rows = recap.detail.map(([a, b]) => [txt(a), e(b)]);
  doc.autoTable({
    startY: doc.lastAutoTable.finalY + 6, margin: { left: W / 2 - 10, right: M }, body: rows, theme: 'plain',
    styles: { font: 'helvetica', fontSize: 8.5, cellPadding: 1.1, textColor: 20 },
    columnStyles: { 1: { halign: 'right' } },
  });
  let y = doc.lastAutoTable.finalY + 8;
  const H = doc.internal.pageSize.getHeight();
  const ligne = (s, size) => {
    doc.setFont('helvetica', 'normal'); doc.setFontSize(size);
    for (const l of doc.splitTextToSize(txt(s), W - 2 * M)) {
      if (y > H - 16) { doc.addPage(); y = 18; }
      doc.text(l, M, y); y += size * 0.45;
    }
  };
  srcs.forEach((s) => ligne(s, 7));
  y += 3; ligne(E.AVERTISSEMENT, 7.5);
  telecharger(nomFichier('pdf'), doc.output('blob'), 'application/pdf');
  render();
}

function renderSources() {
  const C = DATA.cotisations;
  const RAWC = RAW.cotisations;
  const inp = (attrs, v, base) => `<input type="text" inputmode="decimal" class="param-input" ${attrs} value="${esc(v ?? '')}">`;
  let h = `<div class="sources-grid"><section><h2>Sources</h2><p class="lbl">Données du ${esc(E.formatDateFr(DATA._meta.genere_le))}.</p><ul class="sources-list">`;
  for (const [k, url] of Object.entries(DATA._meta.sources)) h += `<li><code>${esc(k)}</code> ${lien(url, url)}</li>`;
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
  state.reglages = { ...E.REGLAGES_DEFAUT, ...lsGet(LS.reglages, {}) };
  const mois = E.validerMois(state.reglages.mois);
  state.reglages.mois = mois.ok ? mois.valeur : 1;
  state.projet = lsGet(LS.projet, '') || '';
  state.devis = (lsGet(LS.devis, []) || []).map(figerStatut);
  sauverDevis();
  const fs = lsGet(LS.form, null);
  if (fs?.parcours && (fs.parcours.depart || fs.parcours.etape === 'depart')) {
    const p = fs.parcours;
    state.parcours = { ...parcoursVide(), ...p, heures: { ...heuresVides(), ...(p.heures || {}) }, majoPct: { ...majoVides(), ...(p.majoPct || {}) }, ouvert: false };
    state.editUid = fs.editUid || null;
  }
  $('#avertissement-complet').textContent = E.AVERTISSEMENT;
  $('#lien-avertissement').addEventListener('click', () => {
    const el = $('#avertissement-complet');
    el.hidden = !el.hidden;
  });
  document.addEventListener('click', onClick);
  document.addEventListener('input', onInput);
  document.addEventListener('change', onChange);
  document.addEventListener('keydown', onKey);
  document.addEventListener('mousedown', (e) => { if (e.target.closest('#suggest button')) e.preventDefault(); });
  $('#affiner')?.addEventListener?.('toggle', () => {});
  document.addEventListener('toggle', (e) => { if (e.target.id === 'affiner') state.parcours.affinerOuvert = e.target.open; }, true);
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
