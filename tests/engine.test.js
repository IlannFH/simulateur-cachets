import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  listerPostes, calculerMinimum, calculerLigne, calculerDevis, calculerCotisations, fraisIntermediaire,
  comparerDemande, devisCSV, appliquerSurcharges, toCents, REGLAGES_DEFAUT, convertirBudget,
  parseInput, formatEcartPct, formatDateFr, formatFrNombre, lignesRecapDevis, fraisFixes,
  validerQuantite, validerHeuresJour, validerBrut, validerMois, validerSaisieParam, BORNES,
  dureeApresChangementUnite, conserverSaisie,
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

describe('Intermédiaires et devis (§ 9)', () => {
  const t1 = base('3097_pub', '1er assistant opérateur', { unite: 'minimum_journee_8h', heuresParJour: 8 });
  const t8 = base('2642', '1er assistant réalisateur', { genre: 'Fiction / documentaire', unite: 'minimum_journee_8h', heuresParJour: 8 });
  const t11 = { convention: '1285', posteId: poste('1285', 'cachet représentation'), unite: 'cachet_palier', quantite: 2, representations: 2, heures: {}, statut: { categorie: 'artiste', cadre: false } };

  it('T15 : CulturePay → 53,70 € HT', () => {
    const d = calculerDevis(data, [t1, t8, t11], { ...REGLAGES_DEFAUT, intermediaire: 'culturepay' });
    expect(eur(d.totaux.frais)).toBe(53.7);
  });
  it('T16 : Movinmotion Basic 1 mois → 71,30 € HT', () => {
    const d = calculerDevis(data, [t1, t8, t11], { ...REGLAGES_DEFAUT, intermediaire: 'movinmotion', formule: 'basic', mois: 1 });
    expect(eur(d.totaux.frais)).toBe(71.3);
    // L'abonnement n'est compté qu'une fois
    expect(d.fixes).toHaveLength(1);
  });
  it('T16 bis : 3 mois de projet → abonnement × 3', () => {
    const d = calculerDevis(data, [t1, t8, t11], { ...REGLAGES_DEFAUT, mois: 3 });
    expect(eur(d.totaux.frais)).toBe(48.3 + 69);
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
  it('le devis additionne au centime et le CSV reprend les mêmes totaux', () => {
    const d = calculerDevis(data, [t1, t8, t11]);
    const t = d.totaux;
    expect(t.coutTotal).toBe(d.lignes.reduce((s, l) => s + l.coutTotal, 0) + t.fixes);
    expect(t.artistes + t.techniciens + t.fixes).toBe(t.coutTotal);
    const csv = devisCSV(d);
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(csv).toContain((t.coutTotal / 100).toFixed(2).replace('.', ','));
    expect(csv.trim().split('\r\n').pop()).toMatch(/^"?Simulation indicative/);
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
    expect(formatFrNombre(1.5)).toBe('1,5');
  });
  it('changer d’unité garde une durée saisie et met à jour la durée nominale', () => {
    expect(dureeApresChangementUnite('10', 8, 7)).toBe('10');
    expect(dureeApresChangementUnite('8', 8, 7)).toBe('7');
    expect(dureeApresChangementUnite('', 8, 8)).toBe('8');
    const suivant = conserverSaisie(
      { quantite: '3', heuresParJour: '10', demande: { montant: '500', mode: 'total' }, heures: { nuit: '2' }, statutForce: true, statut: { categorie: 'artiste', cadre: true } },
      { convention: '2642', quantite: '1', heuresParJour: '', demande: { montant: '', mode: 'total' }, heures: { nuit: '' }, statut: { categorie: 'technicien', cadre: false } },
    );
    expect(suivant.convention).toBe('2642');
    expect(suivant.quantite).toBe('3');
    expect(suivant.heuresParJour).toBe('10');
    expect(suivant.demande.montant).toBe('500');
    expect(suivant.heures.nuit).toBe('2');
    expect(suivant.statut.categorie).toBe('artiste');
  });
});

describe('Synthèse du devis', () => {
  const t1 = base('3097_pub', '1er assistant opérateur', { unite: 'minimum_journee_8h', heuresParJour: 8 });
  const danse = { convention: '1285', posteId: poste('1285', 'cachet représentation'), unite: 'cachet_palier', quantite: 1, representations: 1, heures: { nuit: 2 }, majoPct: { nuit: '' }, statut: { categorie: 'artiste', cadre: false } };

  it('heures de nuit sans taux (1285) : avertissement, pas de +0 %', () => {
    const m = calculerMinimum(data, danse);
    expect(m.majorations.some((x) => /nuit/i.test(x.libelle))).toBe(false);
    expect(m.avertissements.join(' ')).toMatch(/heures de nuit/);
    expect(m.avertissements.join(' ')).not.toMatch(/\+0/);
  });
  it('artistes + techniciens + abonnement = total, et les frais par ligne ont leur ligne', () => {
    const d = calculerDevis(data, [t1, danse], { ...REGLAGES_DEFAUT, mois: 1.5 });
    const t = d.totaux;
    expect(t.artistes + t.techniciens + t.fixes).toBe(t.coutTotal);
    expect(t.coutEmployeur + t.fraisLignes + t.fixes).toBe(t.coutTotal);
    const recap = lignesRecapDevis(d);
    const libs = recap.detail.map(([lib]) => lib);
    expect(libs).toContain("Frais d'intermédiaire par ligne");
    expect(libs).toContain('Abonnement et frais fixes');
    expect(recap.visibles.map(([lib]) => lib)).toEqual(['Brut', 'Coût employeur', 'Frais']);
    const csv = devisCSV(d);
    expect(csv).toContain("Frais d'intermédiaire par ligne");
    expect(csv).toContain('Abonnement et frais fixes');
    expect(csv).toContain('1,5 mois');
    expect(csv).toContain('Montant brut proposé');
  });
});
