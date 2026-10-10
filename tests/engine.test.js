import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  listerPostes, calculerMinimum, calculerLigne, calculerCotisations, fraisIntermediaire,
  categorieStatut, cadreImpose, cadreParDefaut, statutPourMetier,
  comparerDemande, appliquerSurcharges, toCents, REGLAGES_DEFAUT, convertirBudget,
  parseInput, formatEcartPct, formatDateFr, formatFrNombre, fraisFixes, packChoisi,
  validerQuantite, validerHeuresJour, validerBrut, validerMois, validerSaisieParam, BORNES,
  dureeApresChangementUnite, conserverSaisie,
  analyserPhrase, indexerMetiers, typesDisponibles, solutionsBudget, famillesDe, labelType,
  texteResume, bilanPoste, lignesCalcul, quiResume, dureeResume, comparerIntermediaires,
  recoDepuisLigne, LIGNE_CLIP, LIGNE_DEMI_PIGE, LIGNE_DEMI_ARTISTE, LIGNE_ARTISTE_2642,
  LIGNE_ARTISTE_2121, LIGNE_DEMI_ARTISTE_2121, LIGNE_JOUR_2642, LIGNE_COTISATIONS_TECH,
  LIGNE_FRANCE_TRAVAIL_ARTISTE, LIGNE_FRANCE_TRAVAIL_TECH, phraseSansHoraire,
  dureeAuBrut, valeurUnitaire,
} from '../src/engine/index.js';

const data = JSON.parse(readFileSync(new URL('../data/simulateur_data.json', import.meta.url), 'utf8'));
const eur = (c) => c / 100;
const proche = (cents, attendu, tol = 0.02) => expect(Math.abs(eur(cents) - attendu)).toBeLessThanOrEqual(tol + 1e-9);

/** Trouve l'id d'un poste par un fragment de libellé. */
function poste(conv, fragment, opts = {}) {
  const p = listerPostes(data, conv, opts).find((x) => x.metier.includes(fragment));
  if (!p) throw new Error(`Poste introuvable : ${conv} / ${fragment}`);
  return p.id;
}
const base = (conv, fragment, extra = {}) => ({
  convention: conv, posteId: poste(conv, fragment, { genre: extra.genre, grille: extra.grille }),
  quantite: 1, heures: {}, statut: { categorie: 'technicien', cadre: false }, ...extra,
});

describe('Minima (§ 9)', () => {
  it('T1 : 3097 pub, 1er assistant opérateur, 1 jour de 8 h', () => {
    const m = calculerMinimum(data, base('3097_pub', '1er assistant opérateur', { unite: 'minimum_journee_8h', heuresParJour: 8 }));
    expect(eur(m.minimumCents)).toBe(409.37);
    expect(eur(m.tauxCents)).toBe(51.17);
  });
  it('T2 : 1 jour de 10 h → 614,05 €', () => {
    const m = calculerMinimum(data, base('3097_pub', '1er assistant opérateur', { unite: 'minimum_journee_8h', heuresParJour: 10 }));
    proche(m.minimumCents, 614.05, 0.03);
  });
  it('T3 : 1 jour de 11 h → 767,56 €', () => {
    const m = calculerMinimum(data, base('3097_pub', '1er assistant opérateur', { unite: 'minimum_journee_8h', heuresParJour: 11 }));
    proche(m.minimumCents, 767.56, 0.03);
  });
  it('T4 : réalisateur de films publicitaires, 1 jour', () => {
    const m = calculerMinimum(data, base('3097_pub', 'Réalisateur de films publicitaires', { unite: 'minimum_journee_8h', heuresParJour: 8 }));
    expect(eur(m.minimumCents)).toBe(1120.18);
  });
  it('T5 : directeur de la photographie, 2 jours', () => {
    const m = calculerMinimum(data, base('3097_pub', 'Directeur de la photographie', { unite: 'minimum_journee_8h', quantite: 2, heuresParJour: 8 }));
    expect(eur(m.minimumCents)).toBe(1654.86);
  });
  it('T6 : 3097 cinéma, chef opérateur du son, semaine 39 h et journée 7 h', () => {
    const s = calculerMinimum(data, base('3097_cinema', 'Chef opérateur du son', { unite: 'minimum_semaine_39h', heuresSemaine: 39 }));
    expect(eur(s.minimumCents)).toBe(1930.06);
    const j = calculerMinimum(data, base('3097_cinema', 'Chef opérateur du son', { unite: 'minimum_journee_7h', heuresParJour: 7 }));
    expect(eur(j.minimumCents)).toBe(422.2);
  });
  it('T7 : artiste-interprète long et court métrage, 3 jours', () => {
    const lm = calculerMinimum(data, base('3097_cinema', 'long métrage – engagement à la journée', { unite: 'minimum_journee', quantite: 3, heuresParJour: 8 }));
    expect(eur(lm.minimumCents)).toBe(1254.75);
    const cm = calculerMinimum(data, base('3097_cinema', 'COURT MÉTRAGE – journée', { unite: 'minimum_journee', quantite: 3, heuresParJour: 8 }));
    expect(eur(cm.minimumCents)).toBe(448.5);
  });
  it('T8 : 2642 fiction, 1er assistant réalisateur, 1 jour', () => {
    const m = calculerMinimum(data, base('2642', '1er assistant réalisateur', { genre: 'Fiction / documentaire', unite: 'minimum_journee_8h', heuresParJour: 8 }));
    expect(eur(m.minimumCents)).toBe(305.05);
  });
  it('T9 : 2642 flux, chef OPS, semaine 35 h', () => {
    const m = calculerMinimum(data, base('2642', 'Chef OPS', { genre: 'Flux (émissions TV)', unite: 'minimum_semaine_35h', heuresSemaine: 35 }));
    expect(eur(m.minimumCents)).toBe(1206.8);
  });
  it('T10 : 2642 figurant < 30 → SMIC appliqué', () => {
    const m = calculerMinimum(data, base('2642', 'Figurant', { unite: 'minimum_journee', heuresParJour: 8 }));
    expect(eur(m.minimumCents)).toBe(98.48);
    expect(m.smicApplique).toBe(true);
  });
  it('T11 : 1285 danseur, 2 puis 4 représentations', () => {
    const id = poste('1285', 'cachet représentation');
    const p2 = calculerMinimum(data, { convention: '1285', posteId: id, unite: 'cachet_palier', quantite: 2, representations: 2, heures: {} });
    expect(eur(p2.minimumCents)).toBe(325.5);
    const p4 = calculerMinimum(data, { convention: '1285', posteId: id, unite: 'cachet_palier', quantite: 4, representations: 4, heures: {} });
    expect(eur(p4.minimumCents)).toBe(566.52);
  });
  it('T12 : 3090 artiste chorégraphique d\'ensemble, 5 dates, grilles 2025 et NAO 2026', () => {
    const g25 = calculerMinimum(data, base('3090', "Artiste chorégraphique d'ensemble", { grille: '2025', unite: 'cachet_representation', quantite: 5, representations: 5 }));
    expect(eur(g25.minimumCents)).toBe(721.3);
    const g26 = calculerMinimum(data, base('3090', "Artiste chorégraphique d'ensemble", { grille: '2026', unite: 'cachet_representation', quantite: 5, representations: 5 }));
    expect(eur(g26.minimumCents)).toBe(732.1);
  });
  it('T13 : 3090 technicien Employés, salle ≤ 200, 8 h → SMIC', () => {
    const m = calculerMinimum(data, base('3090', 'Employés : poursuiteur', { grille: '2025', unite: 'horaire_jauge', jauge: '200', quantite: 8 }));
    expect(eur(m.minimumCents)).toBe(98.48);
    expect(m.smicApplique).toBe(true);
  });
  it('T20 : 3097 pub styliste → non trouvé, plancher SMIC 8 h', () => {
    const m = calculerMinimum(data, base('3097_pub', 'Styliste', { heuresParJour: 8 }));
    expect(m.nonTrouve).toBe(true);
    expect(m.plancherSmic).toBe(true);
    expect(eur(m.minimumCents)).toBe(98.48);
  });
});

describe('Cotisations (§ 9, T14 : exemple officiel Audiens 2026)', () => {
  const c = calculerCotisations(data, { brutCents: toCents(400), statut: { categorie: 'artiste', cadre: false }, idcc: 3090, jours: 1 });
  it('cotisations patronales 223,99 € (±0,02)', () => proche(c.patronal, 223.99));
  it('cotisations salariales 76,46 € + CSG/CRDS non déductible 11,47 €', () => {
    proche(c.salarialHorsNonDeductible, 76.46);
    proche(c.salarialNonDeductible, 11.47);
  });
  it('net avant impôt 312,07 € et coût employeur 623,99 €', () => {
    proche(c.net, 312.07);
    proche(c.coutEmployeur, 623.99);
  });
  it('une cotisation laissée à null est comptée à 0 et signalée', () => {
    const d = structuredClone(data);
    d.cotisations.lignes.push({ code: 'test_null', libelle: 'Ligne vide', patronal: null, salarial: null, applique_a: 'tous' });
    const t = calculerCotisations(d, { brutCents: toCents(400), statut: { categorie: 'technicien', cadre: false }, idcc: 3097, jours: 1 });
    const v = t.lignes.find((l) => l.code === 'test_null');
    expect(v.nonTrouve).toBe(true);
    expect(v.patronal).toBe(0);
    expect(t.nonTrouves).toBe(1);
  });
});

/** Frais de plusieurs personnes : bulletins de chaque ligne, abonnement une seule fois. */
function fraisGroupe(postes, reglages) {
  const regs = { ...REGLAGES_DEFAUT, ...reglages };
  const lignes = postes.map((p) => calculerLigne(data, p, regs));
  const fixes = fraisFixes(data, regs.intermediaire, regs);
  const credits = Math.round((lignes.reduce((s, l) => s + (l.frais.credits || 0), 0) + fixes.reduce((s, f) => s + (f.credits || 0), 0)) * 100) / 100;
  const ht = lignes.reduce((s, l) => s + l.frais.ht, 0) + fixes.reduce((s, f) => s + f.montant, 0);
  return { lignes, fixes, credits, ht };
}

describe('Intermédiaires (§ 9)', () => {
  const t1 = base('3097_pub', '1er assistant opérateur', { unite: 'minimum_journee_8h', heuresParJour: 8 });
  const t8 = base('2642', '1er assistant réalisateur', { genre: 'Fiction / documentaire', unite: 'minimum_journee_8h', heuresParJour: 8 });
  const t11 = { convention: '1285', posteId: poste('1285', 'cachet représentation'), unite: 'cachet_palier', quantite: 2, representations: 2, heures: {}, statut: { categorie: 'artiste', cadre: false } };

  it('T15 : CulturePay, 3 contrats → 53,70 € HT', () => {
    const g = fraisGroupe([t1, t8, t11], { intermediaire: 'culturepay' });
    expect(eur(g.ht)).toBe(53.7);
    expect(eur(fraisIntermediaire(data, 'culturepay', { contrats: 1 }).ht)).toBe(17.9);
  });
  it('T16 : Movinmotion Basic, Pack 1, 1 mois → 68 crédits = 98,60 € HT', () => {
    const g = fraisGroupe([t1, t8, t11], { intermediaire: 'movinmotion', formule: 'basic', mois: 1 });
    const pack = packChoisi(data.intermediaires.options.find((o) => o.id === 'movinmotion'), REGLAGES_DEFAUT);
    // 3 personnes × (14 bulletin + 2 signature) + Basic 20, au prix du Pack 1 (1,45 €)
    expect(g.credits).toBe(68);
    expect(eur(g.ht)).toBe(98.6);
    expect(g.fixes).toHaveLength(1);
    expect(pack.id).toBe('pack1');
    expect(pack.prix_credit_ht).toBe(1.45);
    expect(g.fixes[0].libelle).toMatch(/20 crédits × 1,45 €/);
    expect(g.lignes[0].frais.credits).toBe(16);
    expect(g.lignes[0].frais.details[0].libelle).toMatch(/1 bulletin × 14 crédits × 1,45 €/);
    expect(g.lignes[0].frais.details[1].libelle).toMatch(/Signature électronique × 1 contrat × 2 crédits/);
  });
  it('T16 bis : 3 mois → un bulletin par personne et par mois, signature une fois, abonnement × 3', () => {
    const g = fraisGroupe([t1, t8, t11], { mois: 3 });
    // 3 × (3 × 14 + 2) + 20 × 3 = 192 crédits × 1,45 €
    expect(g.credits).toBe(192);
    expect(eur(g.ht)).toBe(278.4);
    expect(g.lignes.every((l) => l.frais.credits === 44)).toBe(true);
  });
  it('1 électricien, 1 jour, Basic, Pack 1 → 36 crédits = 52,20 € HT', () => {
    const elec = base('3097_pub', 'Électricien de prise de vues', { unite: 'minimum_journee_8h', heuresParJour: 8, quantite: 1 });
    const g = fraisGroupe([elec], { formule: 'basic', mois: 1, pack: 'pack1' });
    expect(g.credits).toBe(36);
    expect(eur(g.ht)).toBe(52.2);
    expect(g.lignes[0].frais.credits).toBe(16);
    expect(eur(g.fixes[0].montant)).toBe(29);
  });
  it('les jours ne multiplient pas le bulletin, les mois oui, la signature reste par contrat', () => {
    const elec = base('3097_pub', 'Électricien de prise de vues', { unite: 'minimum_journee_8h', heuresParJour: 8, quantite: 5 });
    const unMois = fraisGroupe([elec], {});
    const deuxMois = fraisGroupe([elec], { mois: 2 });
    expect(unMois.lignes[0].frais.credits).toBe(16);
    expect(deuxMois.lignes[0].frais.credits).toBe(30);
    expect(deuxMois.credits).toBe(70);
    expect(eur(deuxMois.ht)).toBe(101.5);
  });
  it('une 2e édition dans le même mois coûte 14 crédits de plus', () => {
    const elec = base('3097_pub', 'Électricien de prise de vues', { unite: 'minimum_journee_8h', bulletins: 2 });
    const g = fraisGroupe([elec], { mois: 1, formule: 'basic' });
    expect(g.lignes[0].frais.credits).toBe(30);
    expect(g.credits).toBe(50);
    expect(eur(g.ht)).toBe(72.5);
    expect(g.lignes[0].frais.details[0].libelle).toMatch(/2 bulletins × 14 crédits/);
  });
  it('la signature électronique est comptée par défaut, et se retire', () => {
    const elec = base('3097_pub', 'Électricien de prise de vues', { unite: 'minimum_journee_8h' });
    const avec = fraisGroupe([elec], { formule: 'basic' });
    const sans = fraisGroupe([elec], { signature: false, formule: 'basic' });
    expect(REGLAGES_DEFAUT.signature).toBe(true);
    expect(avec.credits).toBe(36);
    expect(eur(avec.ht)).toBe(52.2);
    expect(sans.credits).toBe(34);
    expect(eur(sans.ht)).toBe(49.3);
    expect(sans.lignes[0].frais.details.some((d) => /signature/i.test(d.libelle))).toBe(false);
    const hors = lignesCalcul(data, bilanPoste(data, elec, { ...REGLAGES_DEFAUT, signature: false }), { ...REGLAGES_DEFAUT, signature: false });
    expect(hors.join('\n')).toMatch(/n'est pas comptée/);
    expect(hors.join('\n')).toMatch(/aucun crédit en plus/);
  });
  it('l\'inscription suit le pack choisi, pas 1,30 €', () => {
    const elec = base('3097_pub', 'Électricien de prise de vues', { unite: 'minimum_journee_8h' });
    const g = fraisGroupe([elec], { formule: 'aucune', premiereInscription: true });
    expect(g.credits).toBe(166);
    expect(eur(g.ht)).toBe(240.7);
    expect(g.fixes[0].libelle).toMatch(/150 crédits × 1,45 €/);
    expect(g.fixes[0].libelle).not.toMatch(/1,30/);
  });
  it('Premium = 40 crédits par mois, au même prix de crédit', () => {
    const elec = base('3097_pub', 'Électricien de prise de vues', { unite: 'minimum_journee_8h' });
    const g = fraisGroupe([elec], { formule: 'premium', mois: 1 });
    expect(g.credits).toBe(56);
    expect(eur(g.ht)).toBe(81.2);
    expect(g.fixes[0].libelle).toMatch(/Premium × 1 mois × 40 crédits × 1,45 €/);
  });
  it('le Pack 2 change le prix du crédit, pas le nombre de crédits', () => {
    const elec = base('3097_pub', 'Électricien de prise de vues', { unite: 'minimum_journee_8h' });
    const g = fraisGroupe([elec], { pack: 'pack2', formule: 'basic', mois: 1 });
    const pack = packChoisi(data.intermediaires.options.find((o) => o.id === 'movinmotion'), { pack: 'pack2' });
    expect(g.credits).toBe(36);
    expect(eur(g.ht)).toBe(50.4);
    expect(pack.prix_credit_ht).toBe(1.4);
  });
  it('T17 : Smart sur 1 000 € de coût employeur → 65 € HT + TVA 13 €', () => {
    const f = fraisIntermediaire(data, 'smart', { coutEmployeurCents: 100000, convention: '1285' });
    expect(eur(f.ht)).toBe(65);
    expect(eur(f.tva)).toBe(13);
  });
  it('T18 : GUSO sur une ligne 3097 → 0 € et avertissement', () => {
    const f = fraisIntermediaire(data, 'guso', { coutEmployeurCents: 50000, convention: '3097_pub' });
    expect(f.ht).toBe(0);
    expect(f.avertissements.join(' ')).toMatch(/GUSO réservé au spectacle vivant occasionnel/);
  });
  it('#DIESE → tarif sur devis', () => {
    const f = fraisIntermediaire(data, 'diese', { coutEmployeurCents: 50000, convention: '3097_pub' });
    expect(f.surDevis).toBe(true);
    expect(f.avertissements.join(' ')).toMatch(/Tarif sur devis/);
  });
  it('T19 : « ma demande » 350 € sur T1 → −59,37 € (−14,5 %), alerte', () => {
    const m = calculerMinimum(data, t1);
    const d = comparerDemande(m, { montant: 350, mode: 'total' });
    expect(eur(d.ecartCents)).toBe(-59.37);
    expect(d.ecartPct).toBe(-14.5);
    expect(d.sousMinimum).toBe(true);
    const l = calculerLigne(data, { ...t1, demande: { montant: 350, mode: 'total' } });
    expect(eur(l.brutCents)).toBe(350);
  });
  it('le total HT d\'une ligne égale le coût employeur, les frais de ligne et l\'abonnement', () => {
    const regs = { ...REGLAGES_DEFAUT, mois: 1.5 };
    const b = bilanPoste(data, t1, regs);
    expect(b.totalCents).toBe(b.ligne.cot.coutEmployeur + b.ligne.frais.ht + b.fixesCents);
    expect(b.fixes[0].libelle).toContain('1,5 mois');
    expect(b.fixes[0].libelle).not.toMatch(/1\.5/);
  });
  it('une surcharge locale du taux AT/MP change le résultat sans toucher au code', () => {
    const d2 = appliquerSurcharges(data, { cotisations: { at_mp: { patronal: 2.19 } } });
    const a = calculerCotisations(data, { brutCents: 40000, statut: { categorie: 'artiste', cadre: false }, idcc: 3090, jours: 1 });
    const b = calculerCotisations(d2, { brutCents: 40000, statut: { categorie: 'artiste', cadre: false }, idcc: 3090, jours: 1 });
    expect(b.patronal - a.patronal).toBe(400);
  });
});

describe('Convertisseur budget HT → cachet', () => {
  const t1 = base('3097_pub', '1er assistant opérateur', { unite: 'minimum_journee_8h', heuresParJour: 8 });
  const danse = { convention: '1285', posteId: poste('1285', 'cachet représentation'), unite: 'cachet_palier', quantite: 1, representations: 1, heures: {}, statut: { categorie: 'artiste', cadre: false } };

  it('250 € HT pour un 1er assistant opérateur en pub : impossible, avec le budget nécessaire', () => {
    const r = convertirBudget(data, t1, 250);
    expect(r.possible).toBe(false);
    expect(r.brutCents).toBeLessThan(r.minimumCents);
    expect(r.budgetMinimum).toBeGreaterThan(25000);
    expect(r.avertissements.find((a) => a.niveau === 'bloquant').texte).toMatch(/Il faut au moins/);
  });
  it('500 € HT pour un danseur (1285, 1 cachet) : brut maximal qui tient au centime près', () => {
    const r = convertirBudget(data, danse, 500, { ...REGLAGES_DEFAUT, intermediaire: 'culturepay' });
    expect(r.possible).toBe(true);
    expect(r.ligne.coutTotal).toBeLessThanOrEqual(50000);
    const plus = convertirBudget(data, danse, (r.ligne.coutTotal + 1) / 100, { ...REGLAGES_DEFAUT, intermediaire: 'culturepay' });
    expect(plus.brutCents).toBeGreaterThanOrEqual(r.brutCents);
    // 1 centime de brut en plus ferait dépasser le budget
    const l = calculerLigne(data, { ...danse, demande: { montant: (r.brutCents + 1) / 100, mode: 'total' } }, { ...REGLAGES_DEFAUT, intermediaire: 'culturepay' });
    expect(l.coutTotal).toBeGreaterThan(50000);
  });
  it('budget par unité multiplié par la quantité', () => {
    const r = convertirBudget(data, { ...danse, quantite: 2, representations: 2 }, 400, REGLAGES_DEFAUT, { parUnite: true });
    expect(r.budgetCents).toBe(80000);
  });
  it('GUSO sur une pub : avertissement bloquant', () => {
    const r = convertirBudget(data, t1, 2000, { ...REGLAGES_DEFAUT, intermediaire: 'guso' });
    expect(r.avertissements.some((a) => a.niveau === 'bloquant' && /GUSO/.test(a.texte))).toBe(true);
  });
});

describe('Vieillesse technicien (taux URSSAF 2026)', () => {
  const brut = 409.37;
  const tech = calculerCotisations(data, { brutCents: toCents(brut), statut: { categorie: 'technicien', cadre: false }, idcc: 3097, jours: 1 });
  const art = calculerCotisations(data, { brutCents: toCents(brut), statut: { categorie: 'artiste', cadre: false }, idcc: 3097, jours: 1 });
  const plaf = tech.lignes.find((l) => l.code === 'urssaf_vieillesse_plaf_technicien');
  const de = tech.lignes.find((l) => l.code === 'urssaf_vieillesse_deplaf_technicien');

  it('applique 8,55 % / 6,90 % sous le plafond SS et 2,11 % / 0,40 % sur le total', () => {
    expect(plaf.tauxPatronal).toBe(8.55);
    expect(plaf.tauxSalarial).toBe(6.9);
    expect(de.tauxPatronal).toBe(2.11);
    expect(de.tauxSalarial).toBe(0.4);
    expect(plaf.nonTrouve).toBe(false);
    proche(plaf.assiette, data.cotisations.parametres_calcul.plafond_ss_journalier);
    proche(plaf.patronal, 220 * 8.55 / 100);
    proche(plaf.salarial, 220 * 6.9 / 100);
    proche(de.assiette, brut);
    proche(de.patronal, brut * 2.11 / 100);
    proche(de.salarial, brut * 0.4 / 100);
    expect(plaf.note).toMatch(/gestionnaire de paie/);
  });
  it('les cotisations patronales du technicien dépassent celles de l’artiste au même brut', () => {
    expect(tech.patronal).toBeGreaterThan(art.patronal);
    expect(tech.patronal / toCents(brut)).toBeGreaterThan(0.55);
    const artPlaf = art.lignes.find((l) => l.code === 'urssaf_vieillesse_plaf_artiste');
    expect(artPlaf.tauxPatronal).toBeCloseTo(8.55 * 0.7, 2);
    expect(artPlaf.tauxSalarial).toBeCloseTo(6.9 * 0.7, 2);
  });
});

describe('Saisie, bornes et formats', () => {
  it('lit le format 1.234,56 et garde le point décimal simple', () => {
    expect(parseInput('1.234,56')).toBe(1234.56);
    expect(parseInput('1 234,56')).toBe(1234.56);
    expect(parseInput('1234,56')).toBe(1234.56);
    expect(parseInput('1.5')).toBe(1.5);
    expect(parseInput('12,31')).toBe(12.31);
    expect(parseInput('abc')).toBe(null);
    expect(parseInput('')).toBe(null);
  });
  it('rejette quantité vide, nulle, illisible ou démesurée', () => {
    expect(validerQuantite('').ok).toBe(false);
    expect(validerQuantite('0').ok).toBe(false);
    expect(validerQuantite('abc').ok).toBe(false);
    expect(validerQuantite('-2').ok).toBe(false);
    expect(validerQuantite('1').ok).toBe(true);
    expect(validerQuantite('1.234,5', 'heure').valeur).toBe(1234.5);
    const enorme = validerQuantite('999999', 'jour');
    expect(enorme.ok).toBe(false);
    expect(enorme.message).toMatch(/maximum/);
  });
  it('rejette une journée de 30 h, un brut négatif ou 1e9, des mois négatifs', () => {
    const h = validerHeuresJour('30');
    expect(h.ok).toBe(false);
    expect(h.message).toMatch(/24 h/);
    expect(validerHeuresJour('10,5').valeur).toBe(10.5);
    expect(validerHeuresJour('abc').ok).toBe(false);
    const neg = validerBrut('-20');
    expect(neg.ok).toBe(false);
    expect(neg.message).toMatch(/négatif/);
    const grand = validerBrut('1e9');
    expect(grand.ok).toBe(false);
    expect(grand.message).toMatch(/100 000/);
    expect(validerBrut('1.234,56').valeur).toBe(1234.56);
    expect(validerBrut('').ok).toBe(true);
    const mois = validerMois('-1');
    expect(mois.ok).toBe(false);
    expect(mois.message).toMatch(/négative/);
    expect(validerMois('abc').ok).toBe(false);
    expect(validerMois('1,5').valeur).toBe(1.5);
  });
  it('une saisie SMIC illisible ne remplace pas la valeur précédente', () => {
    const r = validerSaisieParam('abc', BORNES.smic);
    expect(r.ok).toBe(false);
    expect(r.message).toMatch(/ancienne valeur/);
    const d = appliquerSurcharges(data, { smic: null, cotisations: { at_mp: { patronal: null } } });
    expect(d.cotisations.smic_horaire_brut.valeur).toBe(data.cotisations.smic_horaire_brut.valeur);
    expect(d.cotisations.lignes.find((l) => l.code === 'at_mp').patronal).toBe(1.19);
    expect(d.cotisations.smic_horaire_brut.source).toMatch(/insee\.fr/);
    expect(d.cotisations.smic_horaire_brut.reference).toMatch(/Journal officiel/);
  });
  it('borne un écart de pourcentage absurde et écrit les mois en français', () => {
    expect(formatEcartPct(244277692.7)).toBe('> +999 %');
    expect(formatEcartPct(-14.5)).toBe('-14,5 %');
    expect(formatDateFr('2026-10-09')).toBe('9 octobre 2026');
    const lignes = fraisFixes(data, 'movinmotion', { ...REGLAGES_DEFAUT, mois: 1.5, formule: 'basic' });
    expect(lignes[0].libelle).toContain('1,5 mois');
    expect(lignes[0].libelle).not.toMatch(/1\.5/);
    expect(lignes[0].credits).toBe(30);
    expect(eur(lignes[0].montant)).toBe(43.5);
    expect(formatFrNombre(1.5)).toBe('1,5');
  });
  it('changer d’unité garde une durée saisie et met à jour la durée nominale', () => {
    expect(dureeApresChangementUnite('10', 8, 7)).toBe('10');
    expect(dureeApresChangementUnite('8', 8, 7)).toBe('7');
    expect(dureeApresChangementUnite('', 8, 8)).toBe('8');
    const suivant = conserverSaisie(
      { quantite: '3', heuresParJour: '10', demande: { montant: '500', mode: 'total' }, heures: { nuit: '2' }, statutForce: true, statut: { categorie: 'artiste', cadre: true }, cadreChoisi: true },
      { convention: '2642', quantite: '1', heuresParJour: '', demande: { montant: '', mode: 'total' }, heures: { nuit: '' }, statut: { categorie: 'technicien', cadre: false } },
    );
    expect(suivant.convention).toBe('2642');
    expect(suivant.quantite).toBe('3');
    expect(suivant.heuresParJour).toBe('10');
    expect(suivant.demande.montant).toBe('500');
    expect(suivant.heures.nuit).toBe('2');
    expect(suivant.statut.categorie).toBe('technicien');
    expect(suivant.cadreChoisi).toBe(true);
    expect(suivant.statutForce).toBeUndefined();
  });
});

describe('Statut déduit du métier', () => {
  it('ne confond pas « non-artistique » avec un artiste', () => {
    expect(categorieStatut('Artiste')).toBe('artiste');
    expect(categorieStatut('Technicien')).toBe('technicien');
    expect(categorieStatut('Technicien / non-artistique')).toBe('technicien');
  });
  it('classe chaque ligne de chaque convention', () => {
    let n = 0;
    for (const conv of Object.values(data.conventions)) {
      for (const ligne of conv.lignes || []) {
        n += 1;
        const attendu = /^artiste\b/i.test(String(ligne.categorie).trim()) ? 'artiste' : 'technicien';
        expect([ligne.metier, categorieStatut(ligne.categorie)]).toEqual([ligne.metier, attendu]);
        const st = statutPourMetier(
          { categorie: ligne.categorie, metier: ligne.metier },
          { categorie: attendu === 'artiste' ? 'technicien' : 'artiste', cadre: !cadreParDefaut(ligne.metier) },
        );
        expect([ligne.metier, st.categorie]).toEqual([ligne.metier, attendu]);
        const impose = cadreImpose(ligne.metier);
        if (impose == null) expect(st.cadreEditable).toBe(true);
        else {
          expect(st.cadre).toBe(impose);
          expect(st.cadreEditable).toBe(false);
        }
      }
    }
    expect(n).toBeGreaterThan(100);
  });
  it('verrouille le cadre seulement quand la grille le nomme', () => {
    expect(cadreImpose('Groupe 1 – échelon 1')).toBe(true);
    expect(cadreImpose('Groupe 2 – échelon 1')).toBe(false);
    expect(cadreImpose('Cadres : directeur technique')).toBe(true);
    expect(cadreImpose('Agents de maîtrise : régisseur')).toBe(false);
    expect(cadreImpose('Employés : poursuiteur')).toBe(false);
    expect(cadreImpose('HMC cadres (chef costumier)')).toBe(true);
    expect(cadreImpose('HMC employés (habilleur)')).toBe(false);
    expect(cadreImpose('Directeur de la photographie')).toBe(null);
    expect(cadreParDefaut('Directeur de la photographie')).toBe(true);
    const photo = listerPostes(data, '3097_pub').find((p) => p.metier === 'Directeur de la photographie');
    expect(statutPourMetier(photo, {}).cadre).toBe(true);
    expect(statutPourMetier(photo, { cadre: false }).cadre).toBe(false);
    expect(statutPourMetier(photo, { cadre: false }).cadreEditable).toBe(true);
  });
  it('un directeur de la photo enregistré comme artiste reste technicien, y compris dupliqué', () => {
    const p = base('3097_pub', 'Directeur de la photographie', {
      unite: 'minimum_journee_8h', heuresParJour: 8,
      statut: { categorie: 'artiste', cadre: false },
    });
    const l = calculerLigne(data, p);
    expect(l.statut.categorie).toBe('technicien');
    expect(l.statut.cadre).toBe(false);
    expect(l.cot.lignes.some((x) => x.code === 'urssaf_vieillesse_plaf_technicien')).toBe(true);
    expect(l.cot.lignes.some((x) => x.code === 'urssaf_vieillesse_plaf_artiste')).toBe(false);
    const dup = calculerLigne(data, structuredClone(p));
    expect(dup.statut.categorie).toBe('technicien');
    expect(dup.cot.lignes.some((x) => x.code === 'urssaf_vieillesse_plaf_artiste')).toBe(false);
  });
});

describe('Comment c\'est calculé', () => {
  const t1 = base('3097_pub', '1er assistant opérateur', { unite: 'minimum_journee_8h', heuresParJour: 8 });
  const danse = { convention: '1285', posteId: poste('1285', 'cachet représentation'), unite: 'cachet_palier', quantite: 1, representations: 1, heures: { nuit: 2 }, majoPct: { nuit: '' }, statut: { categorie: 'artiste', cadre: false } };

  it('heures de nuit sans taux (1285) : avertissement, pas de +0 %', () => {
    const m = calculerMinimum(data, danse);
    expect(m.majorations.some((x) => /nuit/i.test(x.libelle))).toBe(false);
    expect(m.avertissements.join(' ')).toMatch(/heures de nuit/);
    expect(m.avertissements.join(' ')).not.toMatch(/\+0/);
  });
  it('le détail reprend le total de la phrase, et les 14 crédits de bulletin', () => {
    const regs = { ...REGLAGES_DEFAUT, mois: 1.5 };
    const b = bilanPoste(data, t1, regs);
    const lignes = lignesCalcul(data, b, regs, { grille: 'Pub' });
    const texte = texteResume({
      qui: '1er assistant opérateur', projet: 'Pub', duree: '1 jour 8 h',
      mode: 'metier', possible: true,
      employeurCents: b.ligne.cot.coutEmployeur,
      brutCents: b.ligne.brutCents, netCents: b.ligne.cot.net, totalCents: b.totalCents,
    });
    expect(lignes.at(-1)).toBe(`Total HT : ${texte.match(/coût total (.+) HT/)[1]}.`);
    expect(lignes.join('\n')).toMatch(/Ces 14 crédits de bulletin couvrent la paie, le bulletin, l'AEM, les congés spectacles et la DSN/);
    expect(lignes.join('\n')).toMatch(/DPAE \(déclaration unique d'embauche\) : aucun crédit en plus, elle est comprise dans l'abonnement \(conditions financières Movinmotion Social, 18 décembre 2023\)/);
    expect(lignes.join('\n')).toMatch(/La signature électronique coûte 2 crédits par contrat et est comptée/);
    expect(lignes.join('\n')).toMatch(/1,5 mois/);
    expect(texte).not.toMatch(/crédits de bulletin/);
    expect(texte).not.toMatch(/Cotisations/);
    expect(lignes[0]).toMatch(/Minimum conventionnel/);
    expect(lignes[0]).toMatch(/grille Pub/);
  });
});

describe('Phrase libre', () => {
  const jobs = indexerMetiers(data);

  it('250 € pour un élec, 8 h, clip', () => {
    const a = analyserPhrase('250 € pour un élec, 8 h, clip', jobs);
    expect(a.montant).toBe(250);
    expect(a.brut).toBe(false);
    expect(a.famille).toBe('elec');
    expect(a.heures).toBe(8);
    expect(a.kind).toBe('heure');
    expect(a.typeProjet).toBe('clip');
    expect(a.grade).toBe('');
  });

  it('lit un montant européen, le HT, les jours et la pub', () => {
    const a = analyserPhrase('1 250,50 € HT pour 2 jours de cadreur en pub');
    expect(a.montant).toBe(1250.5);
    expect(a.brut).toBe(false);
    expect(a.jours).toBe(2);
    expect(a.kind).toBe('jour');
    expect(a.famille).toBe('camera');
    expect(a.typeProjet).toBe('pub');
  });

  it('lit un brut, un grade et la télé', () => {
    const a = analyserPhrase('400 brut, chef électr, télé');
    expect(a.brut).toBe(true);
    expect(a.montant).toBe(400);
    expect(a.famille).toBe('elec');
    expect(a.grade).toBe('chef');
    expect(a.typeProjet).toBe('tele');
  });

  it('reconnaît un artiste et le spectacle sans montant', () => {
    const a = analyserPhrase('un danseur, captation');
    expect(a.montant).toBe(null);
    expect(a.famille).toBe('artistes');
    expect(a.typeProjet).toBe('spectacle');
    expect(a.brut).toBe(false);
  });

  it('ne prend pas les heures pour un montant', () => {
    const a = analyserPhrase('8h pour un machino');
    expect(a.montant).toBe(null);
    expect(a.heures).toBe(8);
    expect(a.famille).toBe('machinerie');
  });

  it('danseur + clip : IDCC 2121 annexe IX art. 2.2.1, 256,54 €, pas la grille 2642', () => {
    const a = analyserPhrase('250 € pour un danseur, 8 h, clip', jobs);
    expect(a.famille).toBe('artistes');
    expect(a.statut).toBe('artiste');
    expect(a.typeProjet).toBe('clip');
    expect(a.choix).toEqual([]);
    expect(a.question).toBe('');
    expect(a.metierCle).toBe('danseur – videomusique / clip');
    for (const p of ['danseuse clip', 'danse, clip', 'danseurs pour un clip', 'une danseuse, vidéoclip', '250 € par danseur, clip']) {
      const b = analyserPhrase(p, jobs);
      expect(b.metierCle, p).toBe('danseur – videomusique / clip');
      expect(b.statut, p).toBe('artiste');
      expect(b.typeProjet, p).toBe('clip');
      expect(b.choix, p).toEqual([]);
    }
    const ballet = jobs.find((j) => /corps de ballet/.test(j.nom) && /émission chorégraphique/.test(j.nom));
    const soliste = jobs.find((j) => /soliste/.test(j.nom) && /émission chorégraphique/.test(j.nom));
    expect(ballet.variantes.map((v) => v.convention)).toEqual(['2642']);
    expect(typesDisponibles(ballet.variantes).map((t) => t.id)).toEqual(['tele']);
    expect(typesDisponibles(soliste.variantes).map((t) => t.id)).toEqual(['tele']);
    const ligne = data.conventions['2121'].lignes[0];
    expect(ligne.metier).toBe('Danseur – vidéomusique / clip');
    expect(ligne.minimum_cachet).toBe(256.54);
    expect(ligne.heures_max).toBe(10);
    expect(ligne.article).toBe('art. 2.2.1');
    expect(ligne.note).toMatch(/2\.2\.1/);
    expect(ligne.note).toMatch(/256,54/);
    expect(ligne.note).toMatch(/\+1,18/);
    expect(ligne.note).toMatch(/10 mai 2026/);
    expect(ligne.source).toMatch(/2026-Accord-NAO-Edition-Phonographique/);
    expect(data.conventions['2121'].lignes[1].minimum_cachet).toBe(256.54);
    expect(data.conventions['2121'].lignes.every((l) => l.minimum_cachet === 256.54)).toBe(true);
    expect(data._meta.sources.NAO_2121_2026).toMatch(/sma-syndicat/);
    expect(data._meta.sources.NAO_2121_2026_EXT).toMatch(/JORFTEXT000054051134/);
    expect(data._meta.sources.CCN_2121_ANNX_IX).toMatch(/KALITEXT000049878950/);
    const clip = jobs.find((j) => j.nom === 'Danseur – vidéomusique / clip');
    const s = solutionsBudget(data, {
      jobs, famille: 'artistes', metierCle: clip.cle, roles: ['danseur – videomusique'], statut: 'artiste',
      typeProjet: 'clip', budgetEuros: 250, heures: 8, kind: 'heure',
    });
    expect(s.options.map((o) => o.nom)).toEqual(['Danseur – vidéomusique / clip']);
    expect(s.options[0].convention).toBe('2121');
    expect(s.options[0].brut).toBe(25654);
    expect(s.options[0].statut.categorie).toBe('artiste');
    expect(s.options[0].lecture).toMatch(/cachet indivisible/);
    expect(s.options[0].lecture).toMatch(/256,54 €/);
    expect(s.options[0].lecture).toMatch(/art\. 2\.2\.1/);
    expect(s.options[0].lecture).not.toMatch(/4 h 30/);
    expect(s.options[0].lecture).not.toMatch(/289,23|432,86/);
    expect(s.options[0].employeur).toBe(40110);
    expect(s.options[0].budgetMinimum).toBe(45330);
    expect(s.options[0].net).toBe(19872);
    expect(s.reco.texte).toBe('Passe par CulturePay et monte à 419,00 € HT. Coût employeur 401,10 €, coût total 419,00 € HT. Brut 256,54 €, net 198,72 €.');
    expect(s.note).toBe(LIGNE_ARTISTE_2121);
    expect(s.note).not.toBe(LIGNE_CLIP);
    expect(s.note).not.toMatch(/5\.14\.4/);
    const tele = analyserPhrase('danseur télé', jobs);
    expect(tele.choix.map((c) => c.court)).toEqual(['Soliste', 'Corps de ballet']);
    const haut = solutionsBudget(data, {
      jobs, famille: 'artistes', metierCle: soliste.cle, roles: ['soliste'], statut: 'artiste',
      typeProjet: 'tele', budgetEuros: 250,
    });
    expect(haut.options.map((o) => o.nom)).toEqual(['Danseur – émission chorégraphique, soliste (≤ 6 h)']);
    expect(haut.options[0].convention).toBe('2642');
    expect(haut.options[0].brut).toBe(43286);
  });

  it('250 € clip sans métier demande artiste ou technicien', () => {
    const a = analyserPhrase('250 € clip', jobs);
    expect(a.famille).toBe('');
    expect(a.statut).toBe('');
    expect(a.metierCle).toBe('');
    expect(a.question).toBe('Artiste ou technicien ?');
    expect(a.choix.map((c) => c.statut)).toEqual(['artiste', 'technicien']);
    const elec = analyserPhrase('250 € pour un élec, 8 h, clip', jobs);
    expect(elec.statut).toBe('technicien');
    expect(elec.choix).toEqual([]);
    expect(elec.famille).toBe('elec');
  });

  it('une phrase ambiguë pose un choix au lieu de deviner', () => {
    const tele = analyserPhrase('danseur télé', jobs);
    expect(tele.metierCle).toBe('');
    expect(tele.choix.map((c) => c.court)).toEqual(['Soliste', 'Corps de ballet']);
    expect(analyserPhrase('chorégraphe, clip', jobs).metierCle).toBe('');
    expect(analyserPhrase('chorégraphe, clip', jobs).question).toMatch(/chorégraphe/);
    expect(analyserPhrase('figurant clip', jobs).choix.map((c) => c.court)).toEqual(['Émission TV', 'Cinéma', 'Pub']);
    expect(analyserPhrase('musicien, clip', jobs).question).toMatch(/enregistrement/);
    expect(analyserPhrase('assistant réa, clip', jobs).choix.map((c) => c.court)).toEqual(['1er assistant', '2e assistant']);
    expect(analyserPhrase('comédienne, film', jobs).choix.map((c) => c.court)).toEqual(['Long métrage', 'Court métrage']);
    expect(analyserPhrase('un danseur, captation', jobs).choix.length).toBeGreaterThan(1);
  });

  it('reconnaît les métiers, genres, pluriels, fautes et abréviations', () => {
    const attendre = (phrase, attendu) => {
      const a = analyserPhrase(phrase, jobs);
      expect({ phrase, famille: a.famille, type: a.typeProjet, grade: a.grade, choix: a.choix.length }, phrase).toMatchObject(attendu);
    };
    attendre('comédien clip', { famille: 'artistes', type: 'clip', grade: '', choix: 0 });
    expect(analyserPhrase('comédienne, clip', jobs).metierCle).toBe('comedien – videomusique / clip');
    expect(analyserPhrase('comédienne, clip', jobs).question).toBe('');
    const chore = analyserPhrase('chorégraphe, clip', jobs);
    expect(chore.question).toMatch(/chorégraphe/);
    expect(chore.choix.some((c) => /vidéomusique/.test(c.nom))).toBe(true);
    attendre('figurants, cinéma', { famille: 'artistes', type: 'film', choix: 0 });
    expect(analyserPhrase('figu, film', jobs).metierCle).toBe(analyserPhrase('figurante, film', jobs).metierCle);
    attendre('mannequins en pub', { famille: 'artistes', type: 'pub', choix: 0 });
    attendre('chef op, 8 h, clip', { famille: 'camera', type: 'clip', grade: 'chef', choix: 0 });
    attendre('cadreurs, 2 jours, pub', { famille: 'camera', type: 'pub', grade: '', choix: 0 });
    attendre('dop édito', { famille: 'camera', type: 'edito', grade: 'chef', choix: 0 });
    attendre('perchmen, clip', { famille: 'son', type: 'clip', grade: 'assistant', choix: 0 });
    attendre('ingé son, télé', { famille: 'son', type: 'tele', grade: 'chef', choix: 0 });
    attendre('ingénieur du son, film', { famille: 'son', type: 'film', grade: 'chef', choix: 0 });
    attendre('250 € pour un élec, 8 h, clip', { famille: 'elec', type: 'clip', grade: '', choix: 0 });
    attendre('cheffes électriciennes, clip', { famille: 'elec', type: 'clip', grade: 'chef', choix: 0 });
    attendre('electrecin, pub', { famille: 'elec', type: 'pub', choix: 0 });
    attendre('machinos, film', { famille: 'machinerie', type: 'film', choix: 0 });
    attendre('chef machino, télé', { famille: 'machinerie', type: 'tele', grade: 'chef', choix: 0 });
    attendre('déco, édito', { famille: 'deco', type: 'edito', choix: 0 });
    attendre('décoratrices, pub', { famille: 'deco', type: 'pub', choix: 0 });
    attendre('maquilleuses, clip', { famille: 'hmc', type: 'clip', choix: 0 });
    attendre('maquilleuze, 8 h, pub', { famille: 'hmc', type: 'pub', choix: 0 });
    attendre('coiffeurs, télé', { famille: 'hmc', type: 'tele', choix: 0 });
    attendre('costumières, film', { famille: 'hmc', type: 'film', choix: 0 });
    attendre('stylistes, édito', { famille: 'hmc', type: 'edito', choix: 0 });
    attendre('régisseurs, clip', { famille: 'regie', type: 'clip', choix: 0 });
    attendre('1er assistant réa, pub', { famille: 'real', type: 'pub', grade: 'assistant', choix: 0 });
    expect(jobs.find((j) => j.cle === analyserPhrase('1er assistant réa, pub', jobs).metierCle).nom).toBe('1er assistant réalisateur');
    attendre('monteurs, télé', { famille: 'montage', type: 'tele', choix: 0 });
    attendre('étalonneuse, clip', { famille: 'montage', type: 'clip', choix: 0 });
    expect(analyserPhrase('chef opérateur du son, clip', jobs).famille).toBe('son');
    expect(analyserPhrase('chef opérateur du son, clip', jobs).grade).toBe('chef');
  });
});

describe('Métiers uniques et types de projet', () => {
  const jobs = indexerMetiers(data);

  it('ne liste chaque intitulé qu’une fois', () => {
    const cles = jobs.map((j) => j.cle);
    expect(new Set(cles).size).toBe(cles.length);
    const assistant = jobs.find((j) => j.nom === '1er assistant réalisateur');
    expect(assistant.variantes).toHaveLength(4);
    const types = typesDisponibles(assistant.variantes);
    expect(types.map((t) => t.id)).toEqual(['clip', 'edito', 'pub', 'film', 'tele']);
    expect(types.map((t) => t.label).join(' ')).not.toMatch(/3097|2642|1285|3090|IDCC/);
  });

  it('classe les familles demandées', () => {
    expect(famillesDe('Chef électricien')).toEqual(['elec']);
    expect(famillesDe('Électricien / éclairagiste')).toEqual(['elec']);
    expect(famillesDe('Cadreur / opérateur de prise de vues')).toEqual(['camera']);
    expect(famillesDe('Chef opérateur du son')).toEqual(['son']);
    expect(famillesDe('Machiniste de prise de vues')).toEqual(['machinerie']);
    expect(famillesDe('Chef décorateur')).toEqual(['deco']);
    expect(famillesDe('Chef maquilleur')).toEqual(['hmc']);
    expect(famillesDe('Régisseur général')).toEqual(['regie']);
    expect(famillesDe('Directeur de production')).toEqual(['prod']);
    expect(famillesDe('Danseur soliste en tournée (annexe 4) – 1 à 7 représentations/mois')).toEqual(['artistes']);
    expect(famillesDe('1er assistant réalisateur')).toEqual(['real']);
    expect(famillesDe('Chef monteur')).toEqual(['montage']);
    for (const id of ['elec', 'camera', 'son', 'machinerie', 'deco', 'hmc', 'regie', 'prod', 'real', 'montage', 'artistes']) {
      expect(jobs.some((j) => j.familles.includes(id))).toBe(true);
    }
  });

  it('nomme le spectacle sans numéro, et la télé pour une émission', () => {
    const dramatique = jobs.find((j) => j.nom.startsWith('Artiste dramatique'));
    const types = typesDisponibles(dramatique.variantes);
    expect(types.map((t) => t.label)).toEqual(['Captation / spectacle']);
    expect(labelType('spectacle_sub')).toBe('Captation / spectacle');
    const danseTv = jobs.find((j) => /Danseur – émission/.test(j.nom));
    expect(typesDisponibles(danseTv.variantes).map((t) => t.id)).toEqual(['tele']);
    const phono = jobs.find((j) => j.nom === 'Danseur – vidéomusique / clip');
    expect(typesDisponibles(phono.variantes).map((t) => t.id)).toEqual(['clip']);
  });
});

describe('Solutions de budget', () => {
  const jobs = indexerMetiers(data);
  const baseOpts = { jobs, famille: 'elec', typeProjet: 'clip', heures: 8, kind: 'heure' };

  it('250 € pour un élec en clip : rien ne passe, le moins cher d’abord, statut technicien', () => {
    const s = solutionsBudget(data, { ...baseOpts, budgetEuros: 250 });
    expect(s.options.length).toBeGreaterThanOrEqual(2);
    expect(s.possible).toBe(false);
    expect(s.options.every((o) => o.possible === false)).toBe(true);
    expect(s.options.every((o) => o.statut.categorie === 'technicien')).toBe(true);
    expect(s.options.some((o) => /éclairagiste/i.test(o.nom))).toBe(true);
    expect(s.options.some((o) => /prise de vues/i.test(o.nom))).toBe(false);
    expect(s.options[0].recommande).toBe(true);
    const mins = s.options.map((o) => o.budgetMinimum);
    expect([...mins].sort((a, b) => a - b)).toEqual(mins);
    expect(s.minimumHt).toBe(mins[0]);
    expect(s.note).toBe(LIGNE_CLIP);
    expect(s.note).not.toMatch(/indivisible/);
    expect(s.options.some((o) => o.statut.categorie === 'artiste')).toBe(false);
  });

  it('un gros budget recommande le grade de base en journée 8 h, pas le chef', () => {
    const s = solutionsBudget(data, { ...baseOpts, budgetEuros: 2000 });
    expect(s.possible).toBe(true);
    const i = s.options.findIndex((o) => !o.possible);
    expect(s.options.slice(0, i === -1 ? s.options.length : i).every((o) => o.possible)).toBe(true);
    expect(s.options[0].recommande).toBe(true);
    expect(s.options[0].possible).toBe(true);
    expect(s.options[0].grade).toBe('base');
    expect(s.options[0].kind).toBe('jour');
    expect(s.options[0].nom).toMatch(/éclairagiste/i);
    expect(s.options[0].statut.categorie).toBe('technicien');
    expect(s.options[0].poste.statut.categorie).toBe('technicien');
    expect(s.options[0].brut).toBeGreaterThan(0);
    expect(s.options[0].net).toBeGreaterThan(0);
  });

  it('« chef » recommande le chef quand le budget le permet', () => {
    const s = solutionsBudget(data, { ...baseOpts, budgetEuros: 2000, grade: 'chef' });
    expect(s.options[0].grade).toBe('chef');
    expect(s.options[0].possible).toBe(true);
  });

  it('la pub ne mélange pas la grille du clip', () => {
    const s = solutionsBudget(data, { jobs, famille: 'elec', typeProjet: 'pub', budgetEuros: 5000, heures: 8, kind: 'heure' });
    expect(s.options.some((o) => /prise de vues/i.test(o.nom))).toBe(true);
    expect(s.options.some((o) => /éclairagiste/i.test(o.nom))).toBe(false);
    expect(s.options.every((o) => o.statut.categorie === 'technicien')).toBe(true);
  });

  it('250 € pour un élec en clip : phrase courte, et l\'abonnement Basic dans le minimum', () => {
    const s = solutionsBudget(data, { ...baseOpts, budgetEuros: 250 });
    const sans = solutionsBudget(data, { ...baseOpts, budgetEuros: 250, reglages: { ...REGLAGES_DEFAUT, formule: 'aucune' } });
    expect(s.minimumHt - sans.minimumHt).toBe(2900);
    const opt = s.options[0];
    const texte = texteResume({
      qui: quiResume('elec', ''),
      projet: 'Clip',
      duree: dureeResume(opt),
      mode: 'budget',
      possible: false,
      budgetEuros: 250,
      minimumCents: s.minimumHt,
      employeurCents: opt.employeur,
      brutCents: opt.brut,
      netCents: opt.net,
    });
    expect(quiResume('elec', '')).toBe('Élec');
    expect(dureeResume(opt)).toBe('1 jour 8 h');
    expect(texte).toBe(`Élec · Clip · 1 jour 8 h — Pas possible avec 250 € HT. Minimum : coût employeur ${texte.split('coût employeur ')[1]}`);
    expect(texte).toMatch(/^Élec · Clip · 1 jour 8 h — Pas possible avec 250 € HT\. Minimum : coût employeur .+ €, coût total .+ € HT\. Brut .+ €, net .+ €\.$/);
    expect(texte).toContain('Minimum : coût employeur 338,75 €, coût total 390,95 € HT. Brut 210,76 €, net 159,67 €.');
    expect(opt.brut).toBe(21076);
    expect(opt.employeur).toBe(33875);
    expect(opt.net).toBe(15967);
    expect(opt.heuresNominales).toBe(8);
    expect(s.options.every((o) => o.heuresNominales !== 7)).toBe(true);
    expect(s.options.every((o) => o.reduit == null)).toBe(true);
    const b = bilanPoste(data, opt.poste, REGLAGES_DEFAUT);
    expect(b.totalCents).toBe(opt.budgetMinimum);
    const lignes = lignesCalcul(data, b, REGLAGES_DEFAUT, { grille: 'Clip' });
    expect(lignes.at(-1)).toContain('Total HT');
    expect(lignes.join(' ')).toMatch(/14 crédits de bulletin/);
    expect(lignes.join(' ')).toMatch(/DPAE \(déclaration unique d'embauche\) : aucun crédit en plus/);
    expect(b.ligne.frais.details.some((d) => /dpae|embauche/i.test(d.libelle))).toBe(false);
    expect(b.ligne.frais.credits).toBe(16);
    expect(lignes.join(' ')).toMatch(/Demi-pige \?/);
    expect(lignes.join(' ')).toContain(LIGNE_DEMI_PIGE);
    expect(lignes).toContain(LIGNE_JOUR_2642);
    expect(lignes).toContain(LIGNE_COTISATIONS_TECH);
    expect(lignes.join(' ')).toMatch(/coefficient 0,0396/);
    expect(lignes.join(' ')).toMatch(/Congés Spectacles : patronal 15,5 %/);
    expect(lignes.at(-2)).toBe(LIGNE_FRANCE_TRAVAIL_TECH);
    expect(lignes.at(-1)).toMatch(/^Total HT/);
    expect(texte).not.toMatch(/Cotisations|crédits|Demi-pige/);
  });

  it('2642 : journée de référence 8 h, vidéomusiques en fiction, le cinéma reste à 7 h', () => {
    const av = data.conventions['2642'].majorations;
    expect(av.journee_min_heures).toBe(8);
    expect(av.journee).toMatch(/8 h/);
    expect(av.journee).toMatch(/VI\.8\.4/);
    expect(av.journee).toMatch(/art\. 34/);
    expect(av.note).toBe('Vidéomusiques = fiction (avenant 19). La colonne 7 h est la semaine de 35 h ÷ 4,5, la colonne 8 h est la semaine de 39 h ÷ 4,5.');
    expect(av.source).toEqual(expect.arrayContaining([
      'https://lma-asso.fr/salaires-et-conventions',
      'https://www.uspa.fr/storage/wsm_medias/240416-avenant-18-signe.pdf',
    ]));
    expect(data.conventions['3097_cinema'].majorations.journee_min_heures).toBe(7);
    expect(phraseSansHoraire({ typeProjet: 'pub', convention: '3097_pub', aHeure: false })).toMatch(/Pas de tarif horaire/);
    expect(phraseSansHoraire({ typeProjet: 'clip', convention: '2642', aHeure: true })).toBe('');
    expect(phraseSansHoraire({ typeProjet: 'clip', convention: '2642', aHeure: false, categorie: 'artiste' })).toBe(LIGNE_ARTISTE_2121);
    expect(phraseSansHoraire({ typeProjet: 'clip', convention: '2121', aHeure: false, categorie: 'artiste' })).toBe(LIGNE_ARTISTE_2121);
    expect(phraseSansHoraire({ typeProjet: 'tele', convention: '2642', aHeure: false, categorie: 'artiste' })).toBe(LIGNE_ARTISTE_2642);
    expect(phraseSansHoraire({ typeProjet: 'clip', convention: '2642', aHeure: false, categorie: 'technicien' })).toBe(LIGNE_CLIP);
    const pub = solutionsBudget(data, { jobs, famille: 'elec', typeProjet: 'pub', budgetEuros: 5000, heures: 8, kind: 'heure' });
    expect(pub.note).toMatch(/Pas de tarif horaire ni de demi-journée/);
    expect(pub.note).not.toMatch(/IV\.2\.1/);
  });

  it('2642 électricien : 7 h = 184,41 €, 8 h = 210,76 €, réduction générale patronale seulement', () => {
    const ligne = data.conventions['2642'].lignes.find((l) => l.metier === 'Électricien / éclairagiste' && l.genre === 'Fiction / documentaire');
    expect(ligne.minimum_semaine_35h).toBe(829.85);
    expect(ligne.minimum_semaine_39h).toBe(948.4);
    expect(ligne.minimum_journee_7h).toBe(184.41);
    expect(ligne.minimum_journee_8h).toBe(210.76);
    const s7 = solutionsBudget(data, { jobs, famille: 'elec', typeProjet: 'clip', heures: 7, kind: 'heure', budgetEuros: 250 });
    expect(s7.options[0].nom).toMatch(/éclairagiste/);
    expect(s7.options[0].brut).toBe(18441);
    expect(s7.options[0].employeur).toBe(29639);
    expect(s7.options[0].net).toBe(13969);
    expect(s7.options[0].budgetMinimum).toBe(34859);
    expect(s7.options[0].heuresNominales).toBe(7);
    expect(s7.options.every((o) => o.heuresNominales !== 8)).toBe(true);
    const s4 = solutionsBudget(data, { jobs, famille: 'elec', typeProjet: 'clip', heures: 4, kind: 'heure', budgetEuros: 250 });
    expect(s4.options[0].brut).toBe(18441);
    expect(s4.options[0].heuresNominales).toBe(7);
    const art = calculerCotisations(data, { brutCents: toCents(210.76), statut: { categorie: 'artiste', cadre: false }, idcc: 2642, jours: 1, heures: 8 });
    expect(art.lignes.some((l) => l.code === 'rgdu')).toBe(false);
    const sansHeures = calculerCotisations(data, { brutCents: toCents(210.76), statut: { categorie: 'technicien', cadre: false }, idcc: 2642, jours: 1 });
    expect(sansHeures.lignes.some((l) => l.code === 'rgdu')).toBe(false);
  });

  it('réduit les heures seulement quand un taux horaire est publié', () => {
    const regs = { ...REGLAGES_DEFAUT, intermediaire: 'culturepay' };
    const large = solutionsBudget(data, { jobs, famille: 'hmc', typeProjet: 'spectacle', heures: 8, kind: 'heure', budgetEuros: 5000, reglages: regs });
    const heure = large.options.find((o) => o.kind === 'heure');
    expect(heure.reduit.heuresMax).toBe(8);
    expect(heure.reduit.texte).toBe('');
    const poste3 = { ...heure.poste, quantite: 3, demande: null };
    const r3 = convertirBudget(data, poste3, 100000, regs);
    const r8 = convertirBudget(data, { ...poste3, quantite: 8 }, 100000, regs);
    expect(r8.budgetMinimum).toBeGreaterThan(r3.budgetMinimum);
    const s = solutionsBudget(data, {
      jobs, famille: 'hmc', typeProjet: 'spectacle', heures: 8, kind: 'heure', reglages: regs,
      budgetEuros: (r3.budgetMinimum + 1) / 100,
    });
    const card = s.options.find((o) => o.cle === heure.cle && o.kind === 'heure');
    expect(card.reduit.heuresMax).toBeGreaterThan(0);
    expect(card.reduit.heuresMax).toBeLessThan(8);
    expect(card.reduit.texte).toMatch(/^Pas 8 h mais \d+ h : possible, coût employeur .+ coût total .+ HT\. Brut .+ net .+\.$/);
  });

  it('compare les frais : Movinmotion, CulturePay, tarif #DIESE non public', () => {
    const elec = base('3097_pub', 'Électricien de prise de vues', { unite: 'minimum_journee_8h', heuresParJour: 8, quantite: 1 });
    const cmp = comparerIntermediaires(data, elec, REGLAGES_DEFAUT);
    const mm = cmp.find((x) => x.id === 'movinmotion');
    const cp = cmp.find((x) => x.id === 'culturepay');
    const diese = cmp.find((x) => x.id === 'diese');
    const guso = cmp.find((x) => x.id === 'guso');
    expect(mm.credits).toBe(36);
    expect(eur(mm.fraisCents)).toBe(52.2);
    expect(mm.libelle).toMatch(/36 crédits/);
    expect(eur(cp.fraisCents)).toBe(17.9);
    expect(diese.surDevis).toBe(true);
    expect(diese.libelle).toMatch(/non public/);
    expect(diese.fraisCents).toBe(null);
    expect(guso.fraisCents).toBe(0);
    expect(guso.avertissements.join(' ')).toMatch(/spectacle vivant/);
    const s = solutionsBudget(data, { ...baseOpts, budgetEuros: 250 });
    expect(s.intermediaires.find((x) => x.id === 'culturepay').fraisCents).toBe(1790);
    expect(s.intermediaires.some((x) => x.id === 'direct')).toBe(false);
  });

  it('250 € pour un élec en clip : CulturePay, le moins cher au tarif public, sans heure inventée', () => {
    const s = solutionsBudget(data, { ...baseOpts, budgetEuros: 250 });
    expect(s.reco.id).toBe('culturepay');
    expect(s.reco.total).toBe(35665);
    expect(s.reco.brut).toBe(21076);
    expect(s.reco.net).toBe(15967);
    expect(s.reco.employeur).toBe(33875);
    expect(s.reco.texte).toBe('Passe par CulturePay et monte à 356,65 € HT. Coût employeur 338,75 €, coût total 356,65 € HT. Brut 210,76 €, net 159,67 €.');
    expect(s.reco.texte).not.toMatch(/heure|GUSO|#DIESE|direct/i);
    const copie = texteResume({
      qui: 'Électricien / éclairagiste', projet: 'Clip', duree: '1 jour 8 h',
      mode: 'budget', possible: false, budgetEuros: 250, minimumCents: s.minimumHt,
      employeurCents: s.options[0].employeur, brutCents: s.options[0].brut, netCents: s.options[0].net,
      reco: s.reco.texte,
    });
    expect(copie).toContain('Ma reco : Passe par CulturePay et monte à 356,65 € HT.');
    expect(copie).not.toMatch(/Cotisations|crédits/);
  });

  it('déjà chez CulturePay : on monte le budget, sans changer d’intermédiaire', () => {
    const s = solutionsBudget(data, {
      ...baseOpts, budgetEuros: 250,
      reglages: { ...REGLAGES_DEFAUT, intermediaire: 'culturepay' },
    });
    expect(s.reco.texte).toBe('Monte le budget à 356,65 € HT. Coût employeur 338,75 €, coût total 356,65 € HT. Brut 210,76 €, net 159,67 €.');
  });

  it('un budget qui passe confirme l’option, sans dire de monter', () => {
    const s = solutionsBudget(data, { ...baseOpts, budgetEuros: 2000 });
    expect(s.reco.possible).toBe(true);
    expect(s.reco.phrase).toBe('Prends Électricien / éclairagiste, 1 jour 8 h.');
    expect(s.reco.texte).not.toMatch(/monte/i);
    expect(s.reco.brut).toBe(s.options[0].brut);
    expect(s.reco.total).toBe(s.options[0].total);
  });

  it('370 € : CulturePay tient, Movinmotion non, on ne monte pas', () => {
    const s = solutionsBudget(data, { ...baseOpts, budgetEuros: 370 });
    expect(s.options[0].possible).toBe(false);
    expect(s.reco.possible).toBe(true);
    expect(s.reco.id).toBe('culturepay');
    expect(s.reco.texte).toBe('Passe par CulturePay. Coût employeur 352,10 €, coût total 370,00 € HT. Brut 218,48 €, net 165,50 €.');
  });

  it('raccourcit seulement quand la grille publie l’heure', () => {
    const regs = { ...REGLAGES_DEFAUT, intermediaire: 'culturepay' };
    const large = solutionsBudget(data, { jobs, famille: 'hmc', typeProjet: 'spectacle', heures: 8, kind: 'heure', budgetEuros: 5000, reglages: regs });
    const heure = large.options.find((o) => o.kind === 'heure');
    const r3 = convertirBudget(data, { ...heure.poste, quantite: 3, demande: null }, 100000, regs);
    const s = solutionsBudget(data, {
      jobs, famille: 'hmc', typeProjet: 'spectacle', heures: 8, kind: 'heure', reglages: regs,
      budgetEuros: (r3.budgetMinimum + 1) / 100,
    });
    expect(s.reco.heures).toBe(3);
    expect(s.reco.heures).toBeLessThan(8);
    expect(s.reco.id).not.toBe('direct');
    expect(s.reco.texte).toMatch(/^Passe par Smart, à 3 h\. Coût employeur .+ coût total .+ HT\. Brut .+ net .+\.$/);
    expect(s.reco.texte).not.toMatch(/monte|direct/i);
    const clip = solutionsBudget(data, { ...baseOpts, budgetEuros: 250 });
    expect(clip.reco.heures).toBeNull();
    expect(clip.reco.texte).not.toMatch(/\d+ h/);
  });

  it('un brut sous le minimum dit de le monter, un métier confirme la ligne', () => {
    const bas = recoDepuisLigne({
      nom: 'Électricien / éclairagiste', duree: '1 jour 8 h', sousMinimum: true,
      brutMinimumCents: 21076, employeurCents: 33875, brutCents: 21076, netCents: 15967, totalCents: 33875,
    });
    expect(bas.texte).toBe('Monte le brut à 210,76 €. Coût employeur 338,75 €, coût total 338,75 € HT. Brut 210,76 €, net 159,67 €.');
    const ok = recoDepuisLigne({
      nom: 'Électricien / éclairagiste', duree: '1 jour 8 h', sousMinimum: false,
      employeurCents: 62399, brutCents: 40000, netCents: 31207, totalCents: 62399,
    });
    expect(ok.phrase).toBe('Prends Électricien / éclairagiste, 1 jour 8 h.');
  });

  it('un taux horaire publié se convertit en heures, une journée indivisible non', () => {
    const entree = listerPostes(data, '3090').find((p) => p.ligne.horaire_salle_200 === 14.91);
    const taux = toCents(valeurUnitaire(entree, 'horaire_jauge', { jauge: '200' }).valeur);
    expect(taux).toBe(toCents(14.91));
    const brut = 4 * taux;
    expect(brut).toBe(5964);
    const texte = dureeAuBrut({
      brutPlafondCents: brut, minimumCents: 8 * taux, employeurCents: 10000, totalCents: 12000,
      tauxHoraireCents: taux, kind: 'heure',
    });
    expect(texte).toMatch(/^Coût employeur .+ coût total .+ HT\. Brut maximum .+ = 4 h \(minimum horaire/);
    expect(texte).not.toMatch(/4 h \d/);
    const demi = dureeAuBrut({
      brutPlafondCents: 4 * taux + Math.round(taux / 2), minimumCents: taux, employeurCents: 1, totalCents: 1,
      tauxHoraireCents: taux, kind: 'heure',
    });
    expect(demi).toMatch(/4 h 30 \(minimum horaire/);
    expect(demi).not.toMatch(/4 h 30 min/);
    const jour = dureeAuBrut({
      brutPlafondCents: 10000, minimumCents: 28923, employeurCents: 15000, totalCents: 25000,
      kind: 'jour', article: 'art. 5.1 et 5.14.4', heuresMax: 6,
    });
    expect(jour).toMatch(/journée indivisible/);
    expect(jour).toMatch(/289,23 €/);
    expect(jour).not.toMatch(/4 h 30/);
  });

  it('un service publié compte des services entiers, et les heures seulement si la durée est publiée', () => {
    const ligne = data.conventions['3097_cinema'].lignes.find((l) => l.heures_service === 3);
    expect(ligne.minimum_service).toBe(54.37);
    const un = toCents(ligne.minimum_service);
    const deux = dureeAuBrut({
      brutPlafondCents: 2 * un, minimumCents: un, employeurCents: 1, totalCents: 1,
      kind: 'service', serviceCents: un, heuresService: 3,
    });
    expect(deux).toMatch(/2 services de 3 h/);
    const zero = dureeAuBrut({
      brutPlafondCents: un - 1, minimumCents: un, employeurCents: 1, totalCents: 1,
      kind: 'service', serviceCents: un, heuresService: 3,
    });
    expect(zero).toMatch(/ne couvre pas un service/);
    expect(zero).not.toMatch(/\d+ h/);
  });

  it('France Travail : 12 h pour un cachet d’artiste, heures réelles pour un technicien, hors de la phrase courte', () => {
    const danse = base('2642', 'corps de ballet', { unite: 'minimum_journee' });
    const bArt = bilanPoste(data, danse, REGLAGES_DEFAUT);
    const lignesArt = lignesCalcul(data, bArt, REGLAGES_DEFAUT, { typeProjet: 'tele', convention: '2642' });
    expect(lignesArt.at(-1)).toMatch(/^Total HT/);
    expect(lignesArt.at(-2)).toBe(LIGNE_FRANCE_TRAVAIL_ARTISTE);
    expect(lignesArt.join('\n')).toContain(LIGNE_DEMI_ARTISTE);
    expect(lignesArt.join('\n')).not.toContain(LIGNE_DEMI_PIGE);
    const danseClip = base('2121', 'Danseur – vidéomusique', { unite: 'minimum_cachet' });
    const lignesClip = lignesCalcul(data, bilanPoste(data, danseClip, REGLAGES_DEFAUT), REGLAGES_DEFAUT, { typeProjet: 'clip', convention: '2121' });
    expect(lignesClip.at(-1)).toMatch(/^Total HT/);
    expect(lignesClip.at(-2)).toBe(LIGNE_FRANCE_TRAVAIL_ARTISTE);
    expect(lignesClip.join('\n')).toContain(LIGNE_DEMI_ARTISTE_2121);
    expect(lignesClip.join('\n')).not.toContain(LIGNE_DEMI_PIGE);
    expect(lignesClip.join('\n')).not.toContain(LIGNE_DEMI_ARTISTE);
    const elec = base('2642', 'Électricien / éclairagiste', { unite: 'minimum_journee_8h', genre: 'Fiction / documentaire', heuresParJour: 8 });
    const lignesTech = lignesCalcul(data, bilanPoste(data, elec, REGLAGES_DEFAUT), REGLAGES_DEFAUT, { typeProjet: 'clip', convention: '2642' });
    expect(lignesTech.at(-2)).toBe(LIGNE_FRANCE_TRAVAIL_TECH);
    expect(lignesTech).toContain(LIGNE_DEMI_PIGE);
    expect(lignesTech).toContain(LIGNE_JOUR_2642);
    expect(lignesTech).toContain(LIGNE_COTISATIONS_TECH);
    expect(lignesArt.join('\n')).not.toContain(LIGNE_COTISATIONS_TECH);
    expect(lignesClip.join('\n')).not.toContain(LIGNE_COTISATIONS_TECH);
    const texte = texteResume({
      qui: 'Danseur', projet: 'Clip', duree: '1 jour', mode: 'budget', possible: false, budgetEuros: 250,
      minimumCents: 1, employeurCents: 1, brutCents: 28923, netCents: 1,
    });
    expect(texte).not.toMatch(/France Travail|annexe 10|annexe 8|Cotisations|crédits/);
  });

  it('les grilles artistes et techniciens ne se mélangent pas', () => {
    const melanges = jobs.filter((j) => new Set(j.variantes.map((v) => categorieStatut(v.categorie))).size > 1).map((j) => j.nom);
    expect(melanges).toEqual([]);
    const hors = [];
    for (const j of jobs) {
      for (const v of j.variantes) {
        if (categorieStatut(v.categorie) === 'artiste' && v.genre === 'Fiction / documentaire') hors.push(j.nom);
        if (categorieStatut(v.categorie) !== 'artiste' && v.convention === '2121') hors.push(`${j.nom} en 2121`);
      }
    }
    expect(hors).toEqual([]);
    const tech = solutionsBudget(data, { jobs, famille: 'elec', typeProjet: 'clip', budgetEuros: 250, statut: 'technicien', heures: 8, kind: 'heure' });
    expect(tech.options.every((o) => o.statut.categorie === 'technicien' && o.convention === '2642')).toBe(true);
    const art = solutionsBudget(data, { jobs, famille: 'artistes', typeProjet: 'clip', budgetEuros: 250, statut: 'artiste' });
    expect(art.options.length).toBeGreaterThan(0);
    expect(art.options.every((o) => o.statut.categorie === 'artiste' && o.convention === '2121')).toBe(true);
    expect(art.options.some((o) => /vidéomusique/.test(o.nom))).toBe(true);
    expect(art.options.some((o) => /émission chorégraphique/.test(o.nom))).toBe(false);
    expect(art.options.some((o) => o.brut === 28923 || o.brut === 43286)).toBe(false);
    expect(jobs.find((j) => j.nom === 'Styliste').categorie).toBe('Technicien');
    expect(jobs.find((j) => j.nom === 'Figurant (< 30 personnes)').categorie).toBe('Artiste');
    expect(jobs.find((j) => j.nom === 'Doublure lumière').categorie).toBe('Artiste');
  });
});
