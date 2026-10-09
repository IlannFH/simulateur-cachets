// Interface : formulaire, panneau de calcul, devis, sources et paramètres.
import * as E from '../engine/index.js';

const LS = { devis: 'simcachets.devis.v1', reglages: 'simcachets.reglages.v1', surcharges: 'simcachets.surcharges.v1', form: 'simcachets.form.v1', projet: 'simcachets.projet.v1' };
const CONVENTIONS = [
  { key: '3097_pub', label: 'Films publicitaires', sub: 'IDCC 3097, art. 34' },
  { key: '3097_cinema', label: 'Cinéma long / court métrage', sub: 'IDCC 3097' },
  { key: '2642', label: 'Audiovisuel : clips, séries, émissions', sub: 'IDCC 2642' },
  { key: '1285', label: 'Spectacle vivant subventionné', sub: 'IDCC 1285 · CCNEAC' },
  { key: '3090', label: 'Spectacle vivant privé', sub: 'IDCC 3090 · CCNSVP' },
  { key: '2412', label: 'Animation', sub: 'IDCC 2412' },
];
const QTE_LABEL = { jour: 'Nombre de jours', semaine: 'Nombre de semaines', cachet: 'Nombre de cachets', service: 'Nombre de services', mois: 'Nombre de mois', heure: "Nombre d'heures" };

let RAW = null;
let DATA = null;
const state = { form: null, devis: [], reglages: { ...E.REGLAGES_DEFAUT }, surcharges: {}, editUid: null, recherche: '' };

const $ = (sel, root = document) => root.querySelector(sel);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const eur = (c) => E.formatEuros(c);
const lsGet = (k, d) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* stockage indisponible */ } };
const uid = () => Math.random().toString(36).slice(2, 10);
const num = (v) => E.parseInput(v);
const pct = (p) => (p === null || p === undefined ? '—' : `${String(p).replace('.', ',')} %`);
const lien = (url, txt = 'Source') => (url ? `<a href="${esc(url)}" target="_blank" rel="noopener">${esc(txt)}</a>` : '');
const sources = (s) => (Array.isArray(s) ? s : s ? [s] : []);

function getPath(o, p) { return p.split('.').reduce((a, k) => (a == null ? a : a[k]), o); }
function setPath(o, p, v) {
  const ks = p.split('.');
  let cur = o;
  ks.slice(0, -1).forEach((k) => { cur[k] = cur[k] && typeof cur[k] === 'object' ? cur[k] : {}; cur = cur[k]; });
  cur[ks[ks.length - 1]] = v;
}

// ————————————————————————————————————————————— état du formulaire

function formVide(convention = '3097_pub') {
  return {
    convention, genre: 'Fiction / documentaire', grille: '2025', jauge: '200',
    posteId: null, unite: null, quantite: '1', heuresParJour: '', heuresSemaine: '', joursProrata: '',
    representations: '', exploitationContinue: false, ouvrier: false,
    heures: { nuit: '', dimanche: '', ferie: '', premierMai: '', ferieMineur: '', sup: '' },
    majoPct: { sup: '', nuit: '', dimanche: '', ferie: '' },
    statut: { categorie: 'technicien', cadre: false },
    demande: { montant: '', mode: 'total' },
    saisie: 'brut', budget: { montant: '', mode: 'total' },
    jours: '', bulletins: '1', contrats: '1', intermediaire: '', fraisManuel: '',
    avance: false, abattementPct: '', rgduPct: '',
  };
}

const optsListe = (f) => ({ genre: f.convention === '2642' ? f.genre : undefined, grille: f.convention === '3090' ? f.grille : undefined });

function entreeCourante(f = state.form) {
  return E.listerPostes(DATA, f.convention, optsListe(f)).find((p) => p.id === f.posteId) || null;
}

/** Applique les valeurs par défaut quand le métier ou l'unité change. */
function choisirPoste(id) {
  const f = state.form;
  const liste = E.listerPostes(DATA, f.convention, optsListe(f));
  const e = liste.find((p) => p.id === id) || liste[0] || null;
  f.posteId = e ? e.id : null;
  if (!e) return;
  f.statut = { categorie: E.categorieStatut(e.categorie), cadre: E.cadreParDefaut(e.metier) };
  const unites = E.unitesDisponibles(e, DATA.conventions[f.convention]);
  choisirUnite(unites[0].key);
}
function choisirUnite(key) {
  const f = state.form;
  const e = entreeCourante();
  if (!e) return;
  const u = E.unitesDisponibles(e, DATA.conventions[f.convention]).find((x) => x.key === key);
  f.unite = u.key;
  f.heuresParJour = String(u.kind === 'jour' && typeof u.heures === 'number' ? u.heures : 8);
  f.heuresSemaine = String(typeof u.heures === 'number' && u.kind === 'semaine' ? u.heures : 35);
  if (u.kind === 'heure' && (f.quantite === '1' || f.quantite === '')) f.quantite = '8';
  else if (u.kind !== 'heure' && f.quantite === '8') f.quantite = '1';
}

/** Poste prêt pour le moteur (saisies converties en nombres). */
function posteBrut(f = state.form) {
  const n = (v) => num(v);
  const map = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, n(v)]));
  return {
    convention: f.convention, posteId: f.posteId, genre: f.convention === '2642' ? f.genre : undefined,
    grille: f.grille, jauge: f.jauge, unite: f.unite,
    quantite: n(f.quantite) ?? 0, heuresParJour: n(f.heuresParJour), heuresSemaine: n(f.heuresSemaine),
    joursProrata: n(f.joursProrata), representations: n(f.representations) ?? n(f.quantite),
    exploitationContinue: !!f.exploitationContinue, ouvrier: !!f.ouvrier,
    heures: map(f.heures), majoPct: Object.fromEntries(Object.entries(f.majoPct).map(([k, v]) => [k, v === '' ? '' : n(v)])),
    statut: { ...f.statut }, demande: { montant: n(f.demande.montant), mode: f.demande.mode },
    jours: n(f.jours), bulletins: n(f.bulletins) ?? 1, contrats: n(f.contrats) ?? 1,
    intermediaire: f.intermediaire || '', fraisManuel: n(f.fraisManuel),
    abattementPct: f.avance ? n(f.abattementPct) : null, rgduPct: f.avance ? n(f.rgduPct) : null,
  };
}

/** Conversion budget HT → brut, si le mode « budget » est actif et le montant saisi. */
function conversionCourante(f = state.form) {
  if (f.saisie !== 'budget' || !f.posteId) return null;
  const b = num(f.budget?.montant);
  if (b === null || b <= 0) return null;
  return E.convertirBudget(DATA, posteBrut(f), b, state.reglages, { parUnite: f.budget.mode === 'unite' });
}

/** Poste prêt pour le moteur ; en mode budget, le brut est celui calculé depuis le budget. */
function posteDepuisForm(f = state.form) {
  const p = posteBrut(f);
  if (f.saisie === 'budget') {
    const c = conversionCourante(f);
    p.demande = c ? { montant: c.brutCents / 100, mode: 'total' } : null;
    if (c) p.budget = { montant: c.budgetCents / 100 };
  }
  return p;
}

// ————————————————————————————————————————————— rendu du formulaire

function seg(name, value, checked, label, sub = '', struct = true) {
  return `<label class="seg"><input type="radio" name="${name}" value="${esc(value)}" data-k="${name}" ${struct ? 'data-struct' : ''} ${checked ? 'checked' : ''}><span>${esc(label)}${sub ? `<small>${esc(sub)}</small>` : ''}</span></label>`;
}
function champ(k, label, { placeholder = '', suffix = '', struct = false, badge = '' } = {}) {
  const v = getPath(state.form, k) ?? '';
  const id = `f-${k.replace(/\./g, '-')}`;
  return `<div class="field"><label for="${id}">${esc(label)}${suffix ? ` <span class="muted">(${esc(suffix)})</span>` : ''} ${badge}</label>
    <input id="${id}" type="text" inputmode="decimal" autocomplete="off" data-k="${k}" ${struct ? 'data-struct' : ''} value="${esc(v)}" placeholder="${esc(placeholder)}"></div>`;
}
function caseACocher(k, label, struct = false) {
  const id = `f-${k.replace(/\./g, '-')}`;
  return `<label class="check" for="${id}"><input id="${id}" type="checkbox" data-k="${k}" ${struct ? 'data-struct' : ''} ${getPath(state.form, k) ? 'checked' : ''}>${esc(label)}</label>`;
}

function valeurAffichee(e, conv) {
  const u = E.unitesDisponibles(e, conv)[0];
  const v = E.valeurUnitaire(e, u.key, { grille: state.form.grille, jauge: state.form.jauge, representations: 1 });
  if (v.valeur == null) return 'Non trouvé';
  return `${E.formatNumber(v.valeur)} € / ${u.label.toLowerCase().replace(/ \(.*/, '')}`;
}

function renderForm() {
  const f = state.form;
  const conv = DATA.conventions[f.convention];
  const body = $('#form-body');
  let h = '';

  // 1. Convention
  h += `<fieldset class="step"><legend>1 · Convention</legend><div class="segmented conventions">`;
  for (const c of CONVENTIONS) h += seg('convention', c.key, f.convention === c.key, c.label, c.sub);
  h += `</div><div class="sub">`;
  if (f.convention === '2642') {
    const genres = [...new Set(conv.lignes.map((l) => l.genre).filter(Boolean))];
    h += `<div class="field"><span>Genre</span><div class="segmented">${genres.map((g) => seg('genre', g, f.genre === g, g.replace(' (émissions TV)', ' (émissions)'))).join('')}</div></div>`;
  }
  if (f.convention === '3090') {
    h += `<div class="field"><span>Grille</span><div class="segmented">${seg('grille', '2025', f.grille === '2025', '2025 étendue', 'tous les employeurs')}${seg('grille', '2026', f.grille === '2026', 'NAO 2026', 'adhérents uniquement')}</div></div>`;
    h += `<div class="field"><span>Jauge (techniciens)</span><div class="segmented">${E.JAUGES.map((j) => seg('jauge', j.id, f.jauge === j.id, j.label)).join('')}</div></div>`;
  }
  h += `</div>
    <details class="help"><summary>Quelle convention pour une compagnie de danse ?</summary>
      <p><strong>CCNEAC (IDCC 1285)</strong> si la compagnie est subventionnée directement par l'État ou une collectivité (convention ou aide au projet).</p>
      <p>Sinon <strong>CCNSVP (IDCC 3090)</strong>, annexe 1 (annexe 4 en tournée).</p>
      <p>Le <strong>GUSO</strong> ne s'utilise que si le spectacle n'est pas l'activité principale de l'employeur.</p>
    </details></fieldset>`;

  if (f.convention === '2412') {
    h += `<div class="banner banner-amber">${esc(conv.note || '')}</div><p class="muted small">Les films publicitaires en prise de vues réelle relèvent de l'IDCC 3097 : choisissez « Films publicitaires ».</p>`;
    body.innerHTML = h;
    return;
  }

  // 2. Métier
  const liste = E.listerPostes(DATA, f.convention, optsListe(f));
  const groupes = E.grouperPostes(liste);
  h += `<fieldset class="step"><legend>2 · Métier</legend>
    <div class="field"><label for="f-recherche">Rechercher un métier</label>
      <input id="f-recherche" type="search" autocomplete="off" placeholder="Ex. assistant, danseur, maquilleur…" value="${esc(state.recherche)}"></div>
    <div class="metiers" id="metiers" role="radiogroup" aria-label="Métiers">`;
  for (const g of groupes) {
    h += `<div class="m-groupe" data-groupe><h4>${esc(g.categorie)}</h4>`;
    for (const d of g.departements) {
      h += `<div data-dept>${d.departement !== g.categorie ? `<h5>${esc(d.departement)}</h5>` : ''}`;
      for (const p of d.postes) {
        const sel = p.id === f.posteId;
        h += `<label class="metier ${sel ? 'is-selected' : ''}" data-search="${esc(`${p.metier} ${d.departement} ${g.categorie}`.toLowerCase())}">
          <input type="radio" name="posteId" value="${esc(p.id)}" data-k="posteId" data-struct ${sel ? 'checked' : ''}>
          <span class="m-label">${esc(p.metier)}</span><span class="m-val num">${esc(valeurAffichee(p, conv))}</span></label>`;
      }
      h += `</div>`;
    }
    h += `</div>`;
  }
  h += `<p class="empty-search" id="metiers-vide" hidden>Aucun métier ne correspond.</p></div></fieldset>`;

  const e = entreeCourante();
  if (!e) { body.innerHTML = h; filtrerMetiers(); return; }
  const unites = E.unitesDisponibles(e, conv);
  const u = unites.find((x) => x.key === f.unite) || unites[0];

  // 3. Statut
  h += `<fieldset class="step"><legend>3 · Statut</legend><div class="segmented">
    ${seg('statut.categorie', 'artiste', f.statut.categorie === 'artiste', 'Artiste', '', false)}
    ${seg('statut.categorie', 'technicien', f.statut.categorie === 'technicien', 'Technicien', '', false)}
    </div>${caseACocher('statut.cadre', 'Cadre')}</fieldset>`;

  // 4. Unité
  h += `<fieldset class="step"><legend>4 · Unité de rémunération</legend><div class="segmented">`;
  for (const x of unites) h += seg('unite', x.key, x.key === u.key, x.label, x.nonTrouve ? 'non trouvé' : '');
  h += `</div></fieldset>`;

  // 5. Quantités et majorations
  const saisies = E.majorationsSaisies(conv);
  h += `<fieldset class="step"><legend>5 · Quantités</legend><div class="fields">`;
  h += champ('quantite', QTE_LABEL[u.kind]);
  if (u.kind === 'jour') h += champ('heuresParJour', 'Durée de la journée', { suffix: 'heures' });
  if (u.kind === 'cachet' || u.kind === 'service') h += champ('heuresParJour', 'Heures par cachet', { suffix: 'base des majorations' });
  if (u.kind === 'semaine') h += champ('heuresSemaine', 'Heures dans la semaine');
  if (u.kind === 'mois') h += champ('joursProrata', 'Jours en plus', { suffix: 'prorata / 30' });
  if (u.key === 'cachet_palier' || u.key === 'cachet_representation') h += champ('representations', 'Représentations dans le mois', { placeholder: f.quantite || '1' });
  h += `</div>`;
  if (u.key === 'cachet_representation') h += caseACocher('exploitationContinue', 'Exploitation continue');
  if (f.convention === '2642') h += caseACocher('ouvrier', 'Électricien, machiniste ou ouvrier déco (majorations ouvriers)');

  h += `<p class="step-title" style="margin-top:18px">Heures majorées ${saisies ? '<span class="badge b-ko">Non trouvé : à renseigner</span>' : ''}</p><div class="fields">`;
  if (saisies) h += champ('heures.sup', 'Heures supplémentaires');
  h += champ('heures.nuit', 'Heures de nuit');
  h += champ('heures.dimanche', 'Heures du dimanche');
  h += champ('heures.ferie', f.convention === '2642' ? 'Heures de férié principal' : 'Heures de jour férié');
  h += champ('heures.premierMai', 'Heures du 1er mai');
  if (f.convention === '2642') h += champ('heures.ferieMineur', 'Pâques, 8 mai, Ascension');
  h += `</div>`;
  if (saisies) {
    const nt = '<span class="badge b-ko">Non trouvé</span>';
    h += `<p class="step-title" style="margin-top:18px">Taux de majoration</p><div class="fields">
      ${champ('majoPct.sup', 'Heures sup.', { suffix: '%', placeholder: 'à renseigner', badge: nt })}
      ${champ('majoPct.nuit', 'Nuit', { suffix: '%', placeholder: 'à renseigner', badge: nt })}
      ${champ('majoPct.dimanche', 'Dimanche', { suffix: '%', placeholder: 'à renseigner', badge: nt })}
      ${champ('majoPct.ferie', 'Férié', { suffix: '%', placeholder: 'à renseigner', badge: nt })}</div>`;
  } else if (u.kind === 'jour' && f.convention.startsWith('3097')) {
    h += `<p class="muted small">Les heures au-delà de ${u.heures ?? 8} h sont calculées à partir de la durée de la journée.</p>`;
  } else if (f.convention === '2642' && u.kind === 'jour') {
    h += `<p class="muted small">En 2642, les heures supplémentaires se calculent à la semaine : choisissez une unité « semaine ».</p>`;
  }
  h += `</fieldset>`;

  // 6. Ma demande ou budget
  const budget = f.saisie === 'budget';
  h += `<fieldset class="step"><legend>6 · Rémunération</legend><div class="segmented" style="margin-bottom:14px">
    ${seg('saisie', 'brut', !budget, 'Je propose un brut', 'comparé au minimum')}
    ${seg('saisie', 'budget', budget, "J'ai un budget HT", 'facture, enveloppe → cachet')}
    </div>`;
  if (budget) {
    h += `<div class="demande-row">
      ${champ('budget.montant', 'Budget disponible', { suffix: '€ HT', placeholder: 'Ex. 250' })}
      <div class="field"><label for="f-budget-mode">Le budget est</label>
        <select id="f-budget-mode" data-k="budget.mode"><option value="total" ${f.budget.mode === 'total' ? 'selected' : ''}>pour toute la ligne</option><option value="unite" ${f.budget.mode === 'unite' ? 'selected' : ''}>par ${esc(u.kind === 'jour' ? 'jour' : u.kind === 'semaine' ? 'semaine' : u.kind === 'heure' ? 'heure' : u.kind === 'mois' ? 'mois' : u.kind)}</option></select></div>
      </div>
      <p class="muted small">Le budget couvre le brut, les cotisations patronales et les frais de l'intermédiaire. Le résultat s'affiche dans le calcul, avec ses avertissements.</p>`;
  } else {
    h += `<div class="demande-row">
      ${champ('demande.montant', 'Montant brut proposé', { suffix: '€', placeholder: 'Facultatif' })}
      <div class="field"><label for="f-demande-mode">Le montant est</label>
        <select id="f-demande-mode" data-k="demande.mode"><option value="total" ${f.demande.mode === 'total' ? 'selected' : ''}>le total</option><option value="unite" ${f.demande.mode === 'unite' ? 'selected' : ''}>par unité</option></select></div>
      </div>`;
  }
  h += `</fieldset>`;

  // Avancé
  const opt = E.optionIntermediaire(DATA, f.intermediaire || state.reglages.intermediaire);
  h += `<details class="help" ${f.avance || f.intermediaire || f.jours ? 'open' : ''}><summary>Avancé : plafonds, intermédiaire, réductions</summary>
    <div class="fields" style="margin-top:10px">
      ${champ('jours', 'Jours (plafonds sociaux)', { placeholder: 'auto' })}
      ${champ('bulletins', 'Bulletins')}
      ${champ('contrats', 'Contrats')}
      <div class="field"><label for="f-intermediaire">Intermédiaire de la ligne</label><select id="f-intermediaire" data-k="intermediaire" data-struct>
        <option value="">Comme le devis</option>${DATA.intermediaires.options.map((o) => `<option value="${o.id}" ${f.intermediaire === o.id ? 'selected' : ''}>${esc(o.nom.split(' (')[0])}</option>`).join('')}</select></div>
      ${opt.prix_par_contrat_ht === null ? champ('fraisManuel', 'Frais saisis', { suffix: '€ HT' }) : ''}
    </div>
    ${caseACocher('avance', 'Activer abattement et réduction générale (à vérifier)', true)}
    ${f.avance ? `<div class="fields">${champ('abattementPct', 'Abattement frais pro.', { suffix: '%' })}${champ('rgduPct', 'Réduction générale', { suffix: '% du brut' })}</div><p class="muted small"><span class="badge b-warn">À vérifier</span> ${esc(DATA.cotisations.reductions.note)}</p>` : ''}
  </details>`;

  h += `<div class="actions"><button type="submit" class="btn">${state.editUid ? 'Mettre à jour la ligne' : 'Ajouter au devis'}</button>
    ${state.editUid ? '<button type="button" class="btn btn-ghost" data-action="annuler-edition">Annuler</button>' : ''}</div>`;
  body.innerHTML = h;
  filtrerMetiers();
}

function filtrerMetiers() {
  const box = $('#metiers');
  if (!box) return;
  const q = state.recherche.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  let total = 0;
  box.querySelectorAll('[data-dept]').forEach((d) => {
    let n = 0;
    d.querySelectorAll('.metier').forEach((m) => {
      const ok = !q || m.dataset.search.normalize('NFD').replace(/[̀-ͯ]/g, '').includes(q);
      m.hidden = !ok; if (ok) n++;
    });
    d.hidden = n === 0; total += n;
  });
  box.querySelectorAll('[data-groupe]').forEach((g) => { g.hidden = !g.querySelector('[data-dept]:not([hidden])'); });
  $('#metiers-vide').hidden = total > 0;
}

// ————————————————————————————————————————————— panneau de calcul

function badgesMinimum(m) {
  const b = [];
  if (m.nonTrouve) b.push('<span class="badge b-ko">Non trouvé : saisir un montant</span>');
  if (m.plancherSmic) b.push('<span class="badge b-smic">Plancher légal : SMIC</span>');
  if (m.smicApplique) b.push('<span class="badge b-smic">SMIC appliqué</span>');
  return b.join(' ');
}

function tableCotisations(cot) {
  let h = `<div class="table-wrap"><table><thead><tr><th>Cotisation</th><th>Assiette</th><th class="r">Taux pat.</th><th class="r">Patronal</th><th class="r">Taux sal.</th><th class="r">Salarial</th></tr></thead><tbody>`;
  for (const l of cot.lignes) {
    const badge = l.nonTrouve ? ' <span class="badge b-ko">Non trouvé : à vérifier</span>' : !l.verifie ? ' <span class="badge b-warn">À vérifier</span>' : '';
    h += `<tr class="${l.code === 'at_mp' ? 'at-mp' : ''}"><td>${esc(l.libelle)}${badge}${l.note ? `<br><span class="muted">${esc(l.note)}</span>` : ''}</td>
      <td><span class="num">${eur(l.assiette)}</span><br><span class="muted">${esc(l.assietteTxt)}</span></td>
      <td class="r num">${l.nonTrouve ? '—' : pct(l.tauxPatronal)}</td><td class="r num">${eur(l.patronal)}</td>
      <td class="r num">${pct(l.tauxSalarial)}</td><td class="r num">${eur(l.salarial)}</td></tr>`;
  }
  h += `</tbody><tfoot><tr class="is-total"><td colspan="3">Total</td><td class="r num">${eur(cot.patronal)}</td><td></td><td class="r num">${eur(cot.salarial)}</td></tr></tfoot></table></div>`;
  return h;
}

/** Bloc « budget HT → cachet » avec ses avertissements, en tête du panneau. */
function renderConversion(m) {
  const f = state.form;
  if (f.saisie !== 'budget') return '';
  const c = conversionCourante();
  if (!c) return `<div class="card conv"><p class="big-label">Budget HT → cachet</p><p class="muted">Saisissez un budget pour obtenir le brut maximal de ce poste.</p></div>`;
  const uniteTxt = { jour: 'jour', semaine: 'semaine', cachet: 'cachet', service: 'service', mois: 'mois', heure: 'heure' }[m.unite.kind];
  const ok = c.possible;
  const niveaux = { bloquant: 'banner-red', attention: 'banner-amber', info: 'banner-grey' };
  const ordre = { bloquant: 0, attention: 1, info: 2 };
  const avs = [...c.avertissements].sort((a, b) => ordre[a.niveau] - ordre[b.niveau]);
  let h = `<div class="card conv ${ok ? 'conv-ok' : 'conv-ko'}" aria-live="polite">
    <p class="big-label">Budget ${eur(c.budgetCents)} HT → cachet</p>
    <div class="big-row" style="margin-top:6px"><span class="muted small">Brut maximal${c.quantite > 1 ? ` (${E.formatNumber(c.quantite).replace(/,00$/, '')} ${uniteTxt}s)` : ''}</span><span class="big xl num ${ok ? '' : 'ko-text'}">${eur(c.brutCents)}</span></div>
    ${c.quantite > 1 ? `<p class="muted small" style="text-align:right;margin:0">soit ${eur(c.brutParUnite)} brut par ${uniteTxt}</p>` : ''}
    <div class="verdict ${ok ? 'ok' : 'ko'}" role="status">${ok
      ? `<strong>Possible.</strong> ${eur(c.brutCents - c.minimumCents)} au-dessus du minimum conventionnel (${eur(c.minimumCents)}).`
      : `<strong>Pas possible au minimum.</strong> Budget nécessaire : ${eur(c.budgetMinimum)} HT.`}</div>`;
  if (c.ligne) {
    h += `<dl class="kv small" style="margin-top:12px">
      <dt>Brut</dt><dd class="num">${eur(c.ligne.brutCents)}</dd>
      <dt>+ cotisations patronales</dt><dd class="num">${eur(c.ligne.cot.patronal)}</dd>
      <dt>+ frais ${esc(c.ligne.frais.option.nom.split(' (')[0])} HT</dt><dd class="num">${eur(c.ligne.frais.ht)}</dd>
      <dt class="strong">= coût total</dt><dd class="num strong">${eur(c.ligne.coutTotal)}</dd>
      <dt>Reste sur le budget</dt><dd class="num">${eur(c.reste)}</dd>
      <dt>Net estimé pour la personne</dt><dd class="num">${eur(c.ligne.cot.net)}</dd>
    </dl>`;
  }
  h += `<div class="conv-avert">${avs.map((a) => `<p class="banner ${niveaux[a.niveau]}">${a.niveau === 'bloquant' ? '<strong>Bloquant · </strong>' : a.niveau === 'attention' ? '<strong>Attention · </strong>' : ''}${esc(a.texte)}</p>`).join('')}</div></div>`;
  return h;
}

function renderPanel() {
  const box = $('#panel-body');
  const f = state.form;
  if (!f || f.convention === '2412' || !f.posteId) {
    box.innerHTML = `<div class="card"><p class="muted">${f?.convention === '2412' ? 'Grille animation non collectée : aucun calcul possible.' : 'Choisissez un métier pour afficher le minimum.'}</p></div>`;
    return;
  }
  const L = E.calculerLigne(DATA, posteDepuisForm(), state.reglages);
  if (!L) { box.innerHTML = ''; return; }
  const m = L.min;
  const l = m.ligne;
  let h = renderConversion(m);
  h += `<div class="card"><p class="p-poste">${esc(m.conv.nom)} · IDCC ${esc(m.conv.idcc)}</p><p class="p-metier">${esc(m.entree.metier)}</p>`;
  h += `<div class="big-row"><span class="big-label">Minimum conventionnel</span><span class="big xl num">${eur(m.minimumCents)}</span></div>`;
  h += `<div class="meta"><p>${badgesMinimum(m)}</p>
    <p>${esc(m.unite.label)} : ${m.valeurSource == null ? 'non trouvé' : `${E.formatNumber(m.valeurSource)} €`} · taux horaire de référence ${eur(m.tauxCents)} (${esc(m.tauxTxt)})</p>
    <p>Date d'effet : ${esc(l.date_effet || m.conv.date_effet || '—')} · ${lien(l.source || m.conv.majorations?.source)}</p>
    ${l.note ? `<p>${esc(l.note)}</p>` : ''}</div>`;
  h += `<ul class="formules">${m.formules.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>`;
  if (m.avertissements.length) h += `<ul class="notes">${m.avertissements.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>`;
  if (E.majorationsSaisies(m.conv) && m.conv.majorations?.note) h += `<p class="muted small">${esc(m.conv.majorations.note)}</p>`;

  if (L.demande && f.saisie !== 'budget') {
    const d = L.demande;
    const signe = d.ecartCents > 0 ? '+' : '';
    h += `<div class="ecart ${d.sousMinimum ? 'ko' : 'ok'}" role="status"><strong>Ma demande : ${eur(d.cents)}</strong> · écart ${signe}${eur(d.ecartCents)} (${signe}${String(d.ecartPct).replace('.', ',')} %)
      ${d.sousMinimum ? '<br><strong>En dessous du minimum conventionnel</strong>' : ''}</div>`;
  } else if (m.nonTrouve) {
    h += `<div class="ecart ko">Minimum non trouvé : saisissez un montant dans « Ma demande ».</div>`;
  }
  h += `</div>`;

  // Cotisations et coûts
  h += `<div class="card" style="margin-top:16px" aria-live="polite">`;
  if (L.cot.nonTrouves) h += `<p class="banner banner-amber">${L.cot.nonTrouves} cotisation(s) non trouvée(s), comptée(s) à 0 € : le coût est sous-estimé.</p>`;
  h += `<dl class="kv">
    <dt>Brut retenu ${L.demande ? (f.saisie === 'budget' ? '(depuis le budget)' : '(ma demande)') : '(minimum)'}</dt><dd class="num strong">${eur(L.brutCents)}</dd>
    <dt>Cotisations patronales</dt><dd class="num">${eur(L.cot.patronal)}</dd>
    <dt class="strong">Coût employeur</dt><dd class="num strong">${eur(L.cot.coutEmployeur)}</dd>
    <dt>Frais ${esc(L.frais.option.nom.split(' (')[0])} (HT)</dt><dd class="num">${eur(L.frais.ht)}</dd>
    ${L.frais.tva ? `<dt class="muted">TVA sur frais (non comprise)</dt><dd class="num muted">${eur(L.frais.tva)}</dd>` : ''}
  </dl>
  <div class="big-row total-row" style="margin-top:12px;border-top:1px solid var(--fg);padding-top:12px"><span class="big-label">Coût total</span><span class="big num">${eur(L.coutTotal)}</span></div>
  <dl class="kv" style="margin-top:12px"><dt>Net salarié estimé (indicatif)</dt><dd class="num">${eur(L.cot.net)}</dd>
    <dt>Jours retenus pour les plafonds</dt><dd class="num">${L.jours}</dd></dl>`;
  if (L.frais.details.length) h += `<p class="muted small">${L.frais.details.map((x) => `${esc(x.libelle)} = ${eur(x.montant)}`).join(' · ')}${E.optionIntermediaire(DATA, L.intermediaire).abonnement_mensuel_ht ? ' · abonnement compté au total du devis' : ''}</p>`;
  if (L.frais.avertissements.length) h += `<ul class="notes">${L.frais.avertissements.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>`;
  h += `<details class="cot"><summary>Détail des cotisations (${L.cot.lignes.length} lignes) ${L.cot.aVerifier ? `<span class="badge b-warn">${L.cot.aVerifier} à vérifier</span>` : ''}</summary>${tableCotisations(L.cot)}</details>
    <p class="banner banner-grey" style="margin-top:12px">Taux 2026 vérifiés sur Audiens ; taux URSSAF des techniciens à vérifier ; taux AT/MP propre à votre structure.</p></div>`;
  box.innerHTML = h;
}

// ————————————————————————————————————————————— devis

function sauverDevis() { lsSet(LS.devis, state.devis); lsSet(LS.reglages, state.reglages); }

function renderReglages() {
  const r = state.reglages;
  const o = E.optionIntermediaire(DATA, r.intermediaire);
  const abObj = o.abonnement_mensuel_ht && typeof o.abonnement_mensuel_ht === 'object';
  let h = `<div class="field"><label for="r-intermediaire">Intermédiaire de paie</label><select id="r-intermediaire" data-r="intermediaire">
    ${DATA.intermediaires.options.map((x) => `<option value="${x.id}" ${x.id === r.intermediaire ? 'selected' : ''}>${esc(x.nom.split(' (')[0])}</option>`).join('')}</select></div>`;
  if (abObj) {
    h += `<div class="field"><label for="r-formule">Abonnement</label><select id="r-formule" data-r="formule">
      <option value="basic" ${r.formule === 'basic' ? 'selected' : ''}>Basic · ${E.formatNumber(o.abonnement_mensuel_ht.basic)} € HT / mois</option>
      <option value="premium" ${r.formule === 'premium' ? 'selected' : ''}>Premium · ${E.formatNumber(o.abonnement_mensuel_ht.premium)} € HT / mois</option>
      <option value="aucune" ${r.formule === 'aucune' ? 'selected' : ''}>Aucun</option></select></div>`;
  }
  h += `<div class="field"><label for="r-mois">Durée du projet (mois)</label><input id="r-mois" type="text" inputmode="numeric" data-r="mois" value="${esc(r.mois)}"></div>`;
  if (o.signature_electronique_contrat_ht) h += `<label class="check"><input type="checkbox" data-r="signature" ${r.signature ? 'checked' : ''}>Signature électronique (${E.formatNumber(o.signature_electronique_contrat_ht)} € HT / contrat)</label>`;
  if (o.frais_dossier_credits) {
    h += `<label class="check"><input type="checkbox" data-r="premiereInscription" ${r.premiereInscription ? 'checked' : ''}>Première inscription (${o.frais_dossier_credits} crédits)</label>`;
    if (r.premiereInscription) h += `<div class="field"><label for="r-credit">Valeur du crédit (€ HT, ${E.formatNumber(o.valeur_credit_ht.min)} à ${E.formatNumber(o.valeur_credit_ht.max)})</label><input id="r-credit" type="text" inputmode="decimal" data-r="valeurCredit" value="${esc(r.valeurCredit ?? o.valeur_credit_ht.defaut)}"></div>`;
  }
  h += `<label class="check"><input type="checkbox" data-r="prorata" ${r.prorata ? 'checked' : ''}>Répartir l'abonnement sur les lignes</label>`;
  h += `<p class="muted small" style="grid-column:1/-1;margin:0">${esc(o.note || '')} Tarifs publics « à partir de », relevés le ${esc(DATA.intermediaires._date_releve)}, à remplacer par vos tarifs négociés (page <a href="#sources">Paramètres</a>). ${sources(o.source).map((s, i) => lien(s, `source ${i + 1}`)).join(' · ')}</p>`;
  $('#devis-reglages').innerHTML = h;
}

function renderDevis() {
  renderReglages();
  const D = E.calculerDevis(DATA, state.devis, state.reglages);
  const box = $('#devis-body');
  if (!D.lignes.length) {
    box.innerHTML = `<p class="empty">Aucun poste pour l'instant. Choisissez un métier ci-dessus puis « Ajouter au devis ».</p>
      <div class="actions"><button class="btn btn-ghost" data-action="exemple">Charger un devis d'exemple</button></div>`;
    return;
  }
  let h = `<div class="table-wrap"><table class="devis-table"><thead><tr><th>Convention</th><th>Métier</th><th>Unité × qté</th><th class="r">Brut</th><th class="r">Cot. patronales</th><th class="r">Frais interm.</th><th class="r">Coût total</th><th><span class="visually-hidden">Actions</span></th></tr></thead><tbody>`;
  D.lignes.forEach((L, i) => {
    const p = state.devis[i];
    const alerte = (L.demande?.sousMinimum ? ' <span class="badge b-ko">Sous le minimum</span>' : '') + (p.budget ? ` <span class="badge b-ok">depuis ${eur(E.toCents(p.budget.montant))} HT</span>` : '');
    const nt = L.min.nonTrouve && !L.demande ? ' <span class="badge b-ko">Non trouvé</span>' : '';
    const surcharge = p.intermediaire ? `<br><span class="muted">${esc(L.frais.option.nom.split(' (')[0])}</span>` : '';
    h += `<tr><td>IDCC ${esc(L.min.conv.idcc)}<br><span class="muted">${esc(L.min.conv.nom.split(' – ')[0].split(' (')[0])}</span></td>
      <td>${esc(L.min.entree.metier)}${alerte}${nt}<br><span class="muted">${L.statut.categorie === 'artiste' ? 'Artiste' : 'Technicien'}${L.statut.cadre ? ', cadre' : ''}</span></td>
      <td>${esc(L.min.unite.label)} × ${E.formatNumber(L.min.quantite).replace(/,00$/, '')}${L.min.majorations.length ? `<br><span class="muted">+ ${L.min.majorations.length} majoration(s)</span>` : ''}</td>
      <td class="r num">${eur(L.brutCents)}</td><td class="r num">${eur(L.cot.patronal)}</td>
      <td class="r num">${eur(L.frais.ht)}${L.partFixes ? `<br><span class="muted">+ ${eur(L.partFixes)} abon.</span>` : ''}${surcharge}</td>
      <td class="r num"><strong>${eur(L.coutTotal + (L.partFixes || 0))}</strong></td>
      <td class="actions-cell"><button class="btn-link" data-action="modifier" data-uid="${p.uid}">Modifier</button><button class="btn-link" data-action="dupliquer" data-uid="${p.uid}">Dupliquer</button><button class="btn-link" data-action="supprimer" data-uid="${p.uid}">Supprimer</button></td></tr>`;
  });
  h += `</tbody></table></div>`;
  const t = D.totaux;
  h += `<div class="totaux"><div>
      <div class="actions" style="margin-top:0"><button class="btn" data-action="csv">Exporter CSV</button><button class="btn" data-action="pdf">Exporter PDF</button>
      <button class="btn btn-ghost" data-action="nouveau">${state.confirmNouveau ? 'Confirmer : tout effacer' : 'Nouveau devis'}</button>
      ${state.confirmNouveau ? '<button class="btn-link" data-action="annuler-nouveau">Annuler</button>' : ''}</div>
      <p id="export-statut" class="muted small" role="status"></p>
      ${t.tva ? `<p class="muted small">TVA sur les frais Smart : ${eur(t.tva)}, non comprise dans les totaux HT.</p>` : ''}
    </div>
    <dl class="kv" aria-live="polite">
      <dt>Sous-total artistes</dt><dd class="num">${eur(t.artistes)}</dd>
      <dt>Sous-total techniciens</dt><dd class="num">${eur(t.techniciens)}</dd>
      <dt style="margin-top:8px">Total brut</dt><dd class="num" style="margin-top:8px">${eur(t.brut)}</dd>
      <dt>Total cotisations patronales</dt><dd class="num">${eur(t.patronal)}</dd>
      <dt>Coût employeur</dt><dd class="num">${eur(t.coutEmployeur)}</dd>
      <dt>Frais d'intermédiaire par ligne (HT)</dt><dd class="num">${eur(t.fraisLignes)}</dd>
      ${D.fixes.map((x) => `<dt>${esc(x.libelle)}</dt><dd class="num">${eur(x.montant)}</dd>`).join('')}
      <dt class="strong">Total frais d'intermédiaire (HT)</dt><dd class="num strong">${eur(t.frais)}</dd>
    </dl></div>
    <div class="big-row" style="margin-top:20px;border-top:1px solid var(--fg);padding-top:14px" aria-live="polite"><span class="big-label">Coût total de l'équipe</span><span class="big xl num">${eur(t.coutTotal)}</span></div>`;
  box.innerHTML = h;
}

// ————————————————————————————————————————————— exports

/** Propose un fichier : capacité « downloads » une fois publié, lien de téléchargement en local. */
async function telecharger(nom, contenu, type) {
  const blob = contenu instanceof Blob ? contenu : new Blob([contenu], { type });
  let dl = null;
  try { dl = window.claude?.use ? await window.claude.use('downloads') : null; } catch { dl = null; }
  if (dl) {
    try { await dl.save({ filename: nom, data: blob }); afficherStatut(`${nom} enregistré.`); }
    catch (e) { afficherStatut(e?.code === 'declined' ? 'Téléchargement annulé.' : `Téléchargement impossible (${e?.code || 'erreur'}).`); }
    return;
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = nom; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function afficherStatut(msg) {
  const el = $('#export-statut');
  if (el) el.textContent = msg;
}
const nomFichier = (ext) => `devis-intermittents-${(state.projet || 'projet').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}-${new Date().toISOString().slice(0, 10)}.${ext}`;

function exporterCSV() {
  const D = E.calculerDevis(DATA, state.devis, state.reglages);
  telecharger(nomFichier('csv'), E.devisCSV(D, { projet: state.projet }), 'text/csv;charset=utf-8');
}

function exporterPDF() {
  const D = E.calculerDevis(DATA, state.devis, state.reglages);
  const t = D.totaux;
  const srcs = new Set();
  D.lignes.forEach((L) => L.min.ligne.source && srcs.add(L.min.ligne.source));
  srcs.add(DATA._meta.sources.AUDIENS); srcs.add(DATA._meta.sources.AUDIENS_WC);
  D.lignes.forEach((L) => sources(L.frais.option.source).forEach((s) => srcs.add(s)));
  const date = new Date().toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
  $('#print-view').innerHTML = `
    <div class="pv-head"><div><p class="eyebrow">Facteur Humain · simulation</p><h1>Devis intermittents</h1>${state.projet ? `<p><strong>${esc(state.projet)}</strong></p>` : ''}</div>
      <div style="text-align:right"><p>${esc(date)}</p><p class="small">Données du ${esc(DATA._meta.genere_le)}</p></div></div>
    <table><thead><tr><th>Convention</th><th>Métier</th><th>Unité × qté</th><th class="r">Minimum</th><th class="r">Brut</th><th class="r">Cot. pat.</th><th class="r">Coût empl.</th><th class="r">Frais HT</th><th class="r">Coût total</th></tr></thead><tbody>
    ${D.lignes.map((L) => `<tr><td>IDCC ${esc(L.min.conv.idcc)}</td><td>${esc(L.min.entree.metier)}<br><span class="small">${L.statut.categorie === 'artiste' ? 'Artiste' : 'Technicien'}${L.statut.cadre ? ', cadre' : ''} · ${esc(L.frais.option.nom.split(' (')[0])}</span></td>
      <td>${esc(L.min.unite.label)} × ${E.formatNumber(L.min.quantite).replace(/,00$/, '')}</td><td class="r num">${eur(L.min.minimumCents)}</td><td class="r num">${eur(L.brutCents)}</td>
      <td class="r num">${eur(L.cot.patronal)}</td><td class="r num">${eur(L.cot.coutEmployeur)}</td><td class="r num">${eur(L.frais.ht)}</td><td class="r num">${eur(L.coutTotal)}</td></tr>`).join('')}
    </tbody></table>
    <div class="pv-totaux"><dl class="kv">
      <dt>Sous-total artistes</dt><dd class="num">${eur(t.artistes)}</dd><dt>Sous-total techniciens</dt><dd class="num">${eur(t.techniciens)}</dd>
      <dt>Total brut</dt><dd class="num">${eur(t.brut)}</dd><dt>Total cotisations patronales</dt><dd class="num">${eur(t.patronal)}</dd>
      <dt>Coût employeur</dt><dd class="num">${eur(t.coutEmployeur)}</dd>
      ${D.fixes.map((x) => `<dt>${esc(x.libelle)}</dt><dd class="num">${eur(x.montant)}</dd>`).join('')}
      <dt>Total frais d'intermédiaire HT</dt><dd class="num">${eur(t.frais)}</dd>
      ${t.tva ? `<dt>TVA sur frais (non comprise)</dt><dd class="num">${eur(t.tva)}</dd>` : ''}
      <dt class="strong">Coût total de l'équipe</dt><dd class="num strong">${eur(t.coutTotal)}</dd></dl></div>
    <div class="pv-sources"><strong>Sources</strong><ul>${[...srcs].filter(Boolean).map((s) => `<li><a href="${esc(s)}">${esc(s)}</a></li>`).join('')}</ul></div>
    <p class="pv-avert"><strong>Simulation indicative, ce n'est pas un conseil de paie.</strong> ${esc(E.AVERTISSEMENT.replace("Simulation indicative, ce n'est pas un conseil de paie. ", ''))}</p>`;
  if (window.jspdf?.jsPDF) { genererPDF(D, [...srcs].filter(Boolean), date); return; }
  const titre = document.title;
  document.title = nomFichier('pdf').replace(/\.pdf$/, '');
  window.print();
  document.title = titre;
}

/** PDF A4 généré dans le navigateur (jsPDF + autoTable). */
function genererPDF(D, srcs, date) {
  const t = D.totaux;
  // Les polices standard du PDF ne couvrent que le jeu WinAnsi
  const txt = (s) => String(s ?? '').replace(/[\u202f\u00a0]/g, ' ').replace(/≤/g, '<=').replace(/≥/g, '>=').replace(/[\u2018\u2019]/g, "'");
  const e = (c) => txt(eur(c));
  const doc = new window.jspdf.jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
  const W = doc.internal.pageSize.getWidth();
  const M = 14;
  doc.setFont('times', 'bold'); doc.setFontSize(22); doc.text('Devis intermittents', M, 22);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(95);
  doc.text(txt(date), W - M, 16, { align: 'right' });
  doc.text(txt(`Données du ${DATA._meta.genere_le}`), W - M, 21, { align: 'right' });
  if (state.projet) { doc.setTextColor(17); doc.setFontSize(11); doc.setFont('helvetica', 'bold'); doc.text(txt(state.projet), M, 29); }
  doc.setDrawColor(17); doc.line(M, 32, W - M, 32);
  doc.autoTable({
    startY: 36, margin: { left: M, right: M },
    head: [['IDCC', 'Métier', 'Unité × qté', 'Minimum', 'Brut', 'Cot. pat.', 'Coût empl.', 'Frais HT', 'Coût total'].map(txt)],
    body: D.lignes.map((L) => [
      L.min.conv.idcc,
      txt(`${L.min.entree.metier}\n${L.statut.categorie === 'artiste' ? 'Artiste' : 'Technicien'}${L.statut.cadre ? ', cadre' : ''} · ${L.frais.option.nom.split(' (')[0]}`),
      txt(`${L.min.unite.label} × ${E.formatNumber(L.min.quantite).replace(/,00$/, '')}`),
      e(L.min.minimumCents), e(L.brutCents), e(L.cot.patronal), e(L.cot.coutEmployeur), e(L.frais.ht), e(L.coutTotal),
    ]),
    styles: { font: 'helvetica', fontSize: 7.5, cellPadding: 1.6, textColor: 17, lineColor: 220, lineWidth: 0.1 },
    headStyles: { fillColor: [17, 17, 17], textColor: 250, fontStyle: 'bold' },
    columnStyles: { 0: { cellWidth: 11 }, 1: { cellWidth: 48 }, 3: { halign: 'right' }, 4: { halign: 'right' }, 5: { halign: 'right' }, 6: { halign: 'right' }, 7: { halign: 'right' }, 8: { halign: 'right', fontStyle: 'bold' } },
  });
  const rows = [
    ['Sous-total artistes', e(t.artistes)], ['Sous-total techniciens', e(t.techniciens)],
    ['Total brut', e(t.brut)], ['Total cotisations patronales', e(t.patronal)], ['Coût employeur', e(t.coutEmployeur)],
    ...D.fixes.map((x) => [txt(x.libelle), e(x.montant)]),
    ["Total frais d'intermédiaire HT", e(t.frais)],
    ...(t.tva ? [['TVA sur frais (non comprise)', e(t.tva)]] : []),
    ["Coût total de l'équipe", e(t.coutTotal)],
  ].map(([a, b]) => [txt(a), b]);
  doc.autoTable({
    startY: doc.lastAutoTable.finalY + 6, margin: { left: W / 2 - 4, right: M }, body: rows, theme: 'plain',
    styles: { font: 'helvetica', fontSize: 8.5, cellPadding: 1.2, textColor: 17 },
    columnStyles: { 1: { halign: 'right' } },
    didParseCell: (d) => { if (d.row.index === rows.length - 1) { d.cell.styles.fontStyle = 'bold'; d.cell.styles.fontSize = 10; } },
  });
  let y = doc.lastAutoTable.finalY + 8;
  const H = doc.internal.pageSize.getHeight();
  const ligne = (s, size, style = 'normal', color = 60) => {
    doc.setFont('helvetica', style); doc.setFontSize(size); doc.setTextColor(color);
    for (const l of doc.splitTextToSize(txt(s), W - 2 * M)) {
      if (y > H - 16) { doc.addPage(); y = 18; }
      doc.text(l, M, y); y += size * 0.42;
    }
  };
  ligne('Sources', 8.5, 'bold', 17); y += 1;
  srcs.forEach((s) => ligne(s, 7));
  y += 4;
  ligne(E.AVERTISSEMENT, 7.5, 'normal', 17);
  const n = doc.getNumberOfPages();
  for (let i = 1; i <= n; i++) {
    doc.setPage(i); doc.setFont('helvetica', 'normal'); doc.setFontSize(6.5); doc.setTextColor(120);
    doc.text(txt("Simulation indicative, ce n'est pas un conseil de paie."), M, H - 8);
    doc.text(`${i} / ${n}`, W - M, H - 8, { align: 'right' });
  }
  telecharger(nomFichier('pdf'), doc.output('blob'), 'application/pdf');
}

// ————————————————————————————————————————————— sources et paramètres

function renderSources() {
  const C = DATA.cotisations;
  const inp = (attrs, v, base) => `<input type="text" inputmode="decimal" class="param-input" ${attrs} value="${esc(v ?? '')}" aria-label="valeur" ${base !== undefined && String(v) !== String(base) ? 'style="border-color:var(--accent)"' : ''}>`;
  const RAWC = RAW.cotisations;
  let h = `<div class="sources-grid"><section><h2>Sources</h2><p class="muted small">${esc(DATA._meta.avertissement)}</p><ul class="sources-list">`;
  for (const [k, url] of Object.entries(DATA._meta.sources)) h += `<li><code>${esc(k)}</code> ${lien(url, url)}</li>`;
  h += `</ul></section>`;

  h += `<section><h2>Paramètres</h2><p class="muted small">Les modifications restent dans ce navigateur et s'appliquent à tous les calculs. Les valeurs modifiées sont encadrées en bordeaux.</p>
    <div class="actions"><button class="btn btn-ghost" data-action="reset-params">Revenir aux valeurs du JSON</button></div>
    <div class="table-wrap"><table><thead><tr><th>Paramètre</th><th class="r">Valeur</th><th>Source</th></tr></thead><tbody>
    <tr><td>SMIC horaire brut (€) · ${esc(C.smic_horaire_brut.date_effet)}</td><td class="r">${inp('data-p="smic"', C.smic_horaire_brut.valeur, RAWC.smic_horaire_brut.valeur)}</td><td>${lien(C.smic_horaire_brut.source)}</td></tr>
    <tr><td>Plafond journalier T1 (€)</td><td class="r">${inp('data-p="plafondT1"', C.plafonds_2026.plafond_journalier_intermittent_cadre_T1, RAWC.plafonds_2026.plafond_journalier_intermittent_cadre_T1)}</td><td>${lien(C.plafonds_2026.source)}</td></tr>`;
  const libP = { plafond_journalier_T2: 'Plafond journalier T2 (€)', plafond_vieillesse_artiste_jour: 'Plafond vieillesse artiste (€ / jour)', fnal_majoration_assiette: 'Majoration assiette FNAL artiste (coef.)', csg_assiette_pct: 'Assiette CSG/CRDS (% du brut)', heures_mensuelles: 'Heures mensuelles', jours_prorata_mois: 'Jours pour le prorata mensuel' };
  for (const [k, lib] of Object.entries(libP)) h += `<tr><td>${esc(lib)}</td><td class="r">${inp(`data-p="parametres.${k}"`, C.parametres_calcul[k], RAWC.parametres_calcul[k])}</td><td>${lien(C.parametres_calcul.source)}</td></tr>`;
  h += `</tbody></table></div></section>`;

  h += `<section><h3>Taux de cotisation</h3><p class="banner banner-amber" style="margin-top:12px">Le taux AT/MP est propre à votre structure : remplacez 1,19 % par le taux notifié par la CARSAT.</p>
    <div class="table-wrap"><table><thead><tr><th>Cotisation</th><th>S'applique à</th><th class="r">Patronal %</th><th class="r">Salarial %</th><th>Statut</th><th>Source</th></tr></thead><tbody>`;
  for (const l of C.lignes) {
    const b = RAWC.lignes.find((x) => x.code === l.code);
    const statut = l.patronal === null ? '<span class="badge b-ko">Non trouvé</span>' : l.verifie ? '<span class="badge b-ok">Vérifié</span>' : '<span class="badge b-warn">À vérifier</span>';
    h += `<tr class="${l.code === 'at_mp' ? 'at-mp' : ''}"><td>${l.code === 'at_mp' ? '<strong>' : ''}${esc(l.libelle)}${l.code === 'at_mp' ? '</strong>' : ''}${l.note ? `<br><span class="muted">${esc(l.note)}</span>` : ''}</td><td>${esc(l.applique_a.replace(/_/g, ' '))}</td>
      <td class="r">${inp(`data-c="${l.code}" data-f="patronal"`, l.patronal, b.patronal)}</td><td class="r">${inp(`data-c="${l.code}" data-f="salarial"`, l.salarial, b.salarial)}</td><td>${statut}</td><td>${lien(l.source)}</td></tr>`;
  }
  h += `</tbody></table></div></section>`;

  h += `<section><h3>Intermédiaires de paie</h3><p class="muted small">Tarifs publics « à partir de », relevés le ${esc(DATA.intermediaires._date_releve)}. Tous les prix sont HT.</p><div class="table-wrap"><table><thead><tr><th>Option</th><th class="r">Bulletin</th><th class="r">Contrat</th><th class="r">Signature</th><th class="r">Abon. Basic / mois</th><th class="r">Abon. Premium / mois</th><th class="r">% coût empl.</th><th>Note</th></tr></thead><tbody>`;
  for (const o of DATA.intermediaires.options) {
    const b = RAW.intermediaires.options.find((x) => x.id === o.id);
    const cel = (k) => (k in o ? inp(`data-i="${o.id}" data-f="${k}"`, o[k], b[k]) : '<span class="muted">—</span>');
    const ab = typeof o.abonnement_mensuel_ht === 'object' && o.abonnement_mensuel_ht;
    h += `<tr><td><strong>${esc(o.nom)}</strong></td><td class="r">${cel('prix_par_bulletin_ht')}</td><td class="r">${cel('prix_par_contrat_ht')}</td><td class="r">${cel('signature_electronique_contrat_ht')}</td>
      <td class="r">${ab ? inp(`data-i="${o.id}" data-f="abonnement.basic"`, ab.basic, b.abonnement_mensuel_ht.basic) : cel('abonnement_mensuel_ht')}</td>
      <td class="r">${ab ? inp(`data-i="${o.id}" data-f="abonnement.premium"`, ab.premium, b.abonnement_mensuel_ht.premium) : '<span class="muted">—</span>'}</td>
      <td class="r">${cel('pourcentage')}</td><td class="small">${esc(o.note)} ${sources(o.source).map((s, i) => lien(s, `source ${i + 1}`)).join(' · ')}</td></tr>`;
  }
  h += `</tbody></table></div></section></div>`;
  $('#sources-body').innerHTML = h;
}

function appliquerParametres() {
  DATA = E.appliquerSurcharges(RAW, state.surcharges);
  lsSet(LS.surcharges, state.surcharges);
  renderPanel(); renderDevis();
}

// ————————————————————————————————————————————— navigation et événements

function route() {
  const v = location.hash === '#sources' ? 'sources' : 'simulateur';
  document.querySelectorAll('[data-view-panel]').forEach((s) => { s.hidden = s.dataset.viewPanel !== v; });
  document.querySelectorAll('.tabs a').forEach((a) => { if (a.dataset.view === v) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); });
  if (v === 'sources') { renderSources(); window.scrollTo(0, 0); }
}

function sauverForm() { lsSet(LS.form, state.form); }

function surSaisieForm(ev) {
  const t = ev.target;
  if (t.id === 'f-recherche') { state.recherche = t.value; filtrerMetiers(); return; }
  const k = t.dataset.k;
  if (!k) return;
  if (t.type === 'radio' && !t.checked) return;
  const val = t.type === 'checkbox' ? t.checked : t.value;
  const f = state.form;
  if (k === 'convention') {
    const nouveau = formVide(val);
    nouveau.grille = f.grille; nouveau.jauge = f.jauge; nouveau.genre = f.genre;
    state.form = nouveau; state.recherche = '';
    choisirPoste(null);
  } else if (k === 'genre' || k === 'grille') {
    setPath(f, k, val);
    const e = E.listerPostes(DATA, f.convention, optsListe(f));
    if (!e.some((p) => p.id === f.posteId)) {
      // Garde le métier équivalent dans l'autre grille si possible
      const ancien = E.listerPostes(DATA, f.convention, {}).find((p) => p.id === f.posteId);
      const radical = (s) => s.replace(/\s*–\s*(grille\s*)?(NAO\s*)?20\d\d\s*$/, '');
      const eq = ancien && e.find((p) => radical(p.metier) === radical(ancien.metier));
      choisirPoste(eq ? eq.id : null);
    }
  } else if (k === 'posteId') {
    choisirPoste(val);
  } else if (k === 'unite') {
    choisirUnite(val);
  } else {
    setPath(f, k, val);
  }
  sauverForm();
  if (t.hasAttribute('data-struct') || t.type === 'radio') {
    const scroll = $('#metiers')?.scrollTop;
    renderForm();
    if (scroll && $('#metiers')) $('#metiers').scrollTop = scroll;
    const again = t.id ? document.getElementById(t.id) : document.querySelector(`[name="${t.name}"][value="${CSS.escape(t.value)}"]`);
    again?.focus({ preventScroll: true });
  }
  renderPanel();
}

function ajouterAuDevis(ev) {
  ev.preventDefault();
  if (!state.form.posteId) return;
  const p = { ...posteDepuisForm(), uid: state.editUid || uid(), _form: structuredClone(state.form) };
  if (state.editUid) {
    const i = state.devis.findIndex((x) => x.uid === state.editUid);
    if (i >= 0) state.devis[i] = p;
    state.editUid = null;
  } else state.devis.push(p);
  sauverDevis(); renderForm(); renderDevis();
  $('#devis').scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
}

function actions(ev) {
  const b = ev.target.closest('[data-action]');
  if (!b) return;
  const a = b.dataset.action;
  const i = state.devis.findIndex((x) => x.uid === b.dataset.uid);
  if (a === 'modifier' && i >= 0) {
    state.form = structuredClone(state.devis[i]._form || formVide());
    state.editUid = state.devis[i].uid;
    renderForm(); renderPanel();
    $('#poste-form').scrollIntoView({ block: 'start' });
  } else if (a === 'dupliquer' && i >= 0) {
    state.devis.splice(i + 1, 0, { ...structuredClone(state.devis[i]), uid: uid() });
    sauverDevis(); renderDevis();
  } else if (a === 'supprimer' && i >= 0) {
    state.devis.splice(i, 1);
    if (state.editUid === b.dataset.uid) { state.editUid = null; renderForm(); }
    sauverDevis(); renderDevis();
  } else if (a === 'annuler-edition') {
    state.editUid = null; renderForm();
  } else if (a === 'nouveau') {
    if (!state.confirmNouveau) { state.confirmNouveau = true; renderDevis(); return; }
    state.confirmNouveau = false; state.devis = []; state.editUid = null; state.projet = '';
    $('#projet').value = ''; lsSet(LS.projet, '');
    sauverDevis(); renderForm(); renderDevis();
  } else if (a === 'annuler-nouveau') {
    state.confirmNouveau = false; renderDevis();
  } else if (a === 'csv') exporterCSV();
  else if (a === 'pdf') exporterPDF();
  else if (a === 'exemple') chargerExemple();
  else if (a === 'reset-params') { state.surcharges = {}; appliquerParametres(); renderSources(); }
}

/** Exemple : les cas T1, T8 et T11 du cahier des charges. */
function chargerExemple() {
  const mk = (conv, frag, extra) => {
    const f = { ...formVide(conv), ...extra };
    const save = state.form; state.form = f;
    const p = E.listerPostes(DATA, conv, optsListe(f)).find((x) => x.metier.includes(frag));
    choisirPoste(p.id);
    Object.assign(f, extra.apres || {});
    const out = { ...posteDepuisForm(f), uid: uid(), _form: structuredClone(f) };
    state.form = save;
    return out;
  };
  state.devis = [
    mk('3097_pub', '1er assistant opérateur', {}),
    mk('2642', '1er assistant réalisateur', { genre: 'Fiction / documentaire' }),
    mk('1285', 'cachet représentation', { apres: { quantite: '2' } }),
  ];
  sauverDevis(); renderDevis();
}

function surReglage(ev) {
  const t = ev.target;
  const k = t.dataset.r;
  if (!k) return;
  let v = t.type === 'checkbox' ? t.checked : t.value;
  if (k === 'mois' || k === 'valeurCredit') v = num(v) ?? (k === 'mois' ? 0 : null);
  state.reglages[k] = v;
  sauverDevis();
  renderDevis();
  renderPanel();
}

function surParametre(ev) {
  const t = ev.target;
  if (ev.type !== 'change') return;
  const v = num(t.value);
  const S = state.surcharges;
  if (t.dataset.p) {
    const p = t.dataset.p;
    if (p.startsWith('parametres.')) { S.parametres = S.parametres || {}; S.parametres[p.split('.')[1]] = v; }
    else S[p] = v;
  } else if (t.dataset.c) {
    S.cotisations = S.cotisations || {};
    S.cotisations[t.dataset.c] = { ...(S.cotisations[t.dataset.c] || {}), [t.dataset.f]: v };
  } else if (t.dataset.i) {
    S.intermediaires = S.intermediaires || {};
    S.intermediaires[t.dataset.i] = { ...(S.intermediaires[t.dataset.i] || {}), [t.dataset.f]: v };
  } else return;
  appliquerParametres(); renderSources();
}

// ————————————————————————————————————————————— démarrage

async function init() {
  try {
    const r = await fetch('data/simulateur_data.json', { cache: 'no-cache' });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    RAW = await r.json();
  } catch (e) {
    const box = $('#load-error');
    box.hidden = false;
    box.innerHTML = `Impossible de lire <code>data/simulateur_data.json</code> (${esc(e.message)}). Ouvrez le site via un serveur local : <code>npm run dev</code> ou <code>npx serve</code>, pas en double-cliquant sur le fichier.`;
    return;
  }
  state.surcharges = lsGet(LS.surcharges, {});
  DATA = E.appliquerSurcharges(RAW, state.surcharges);
  state.devis = lsGet(LS.devis, []);
  state.reglages = { ...E.REGLAGES_DEFAUT, ...lsGet(LS.reglages, {}) };
  state.projet = lsGet(LS.projet, '');
  $('#projet').value = state.projet;
  const fs = lsGet(LS.form, null);
  if (fs && DATA.conventions[fs.convention]) { state.form = { ...formVide(fs.convention), ...fs }; if (!entreeCourante()) choisirPoste(null); }
  else {
    state.form = formVide('3097_pub');
    const p = E.listerPostes(DATA, '3097_pub').find((x) => x.metier === '1er assistant opérateur');
    choisirPoste(p?.id);
  }

  const d = new Date(DATA._meta.genere_le);
  $('#data-date').textContent = Number.isNaN(d.getTime()) ? DATA._meta.genere_le : d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
  $('#avertissement').innerHTML = `<strong>Simulation indicative, ce n'est pas un conseil de paie.</strong> ${esc(E.AVERTISSEMENT.replace("Simulation indicative, ce n'est pas un conseil de paie. ", ''))}`;

  const form = $('#poste-form');
  form.addEventListener('input', (e) => { if (e.target.type !== 'radio' && e.target.type !== 'checkbox' && e.target.tagName !== 'SELECT') surSaisieForm(e); });
  form.addEventListener('change', (e) => { if (e.target.type === 'radio' || e.target.type === 'checkbox' || e.target.tagName === 'SELECT') surSaisieForm(e); });
  form.addEventListener('submit', ajouterAuDevis);
  document.addEventListener('click', actions);
  $('#devis-reglages').addEventListener('change', surReglage);
  $('#sources-body').addEventListener('change', surParametre);
  $('#projet').addEventListener('input', (e) => { state.projet = e.target.value; lsSet(LS.projet, state.projet); });
  window.addEventListener('hashchange', route);

  renderForm(); renderPanel(); renderDevis(); route();
}

init();
