// Ligne complète (minimum → brut → cotisations → intermédiaire) et devis d'équipe.
import { toCents, mul, pctOf, roundInt, formatEuros, formatFrNombre } from './money.js';
import { calculerMinimum, comparerDemande } from './poste.js';
import { calculerCotisations } from './cotisations.js';
import { statutPourMetier } from './catalogue.js';

const CONVENTIONS_AUDIOVISUELLES = ['3097_pub', '3097_cinema', '2642', '2412'];

export const REGLAGES_DEFAUT = {
  intermediaire: 'movinmotion',
  formule: 'basic', // abonnement Movinmotion : basic | premium | aucune
  mois: 1,
  prorata: false,
  premiereInscription: false,
  signature: false,
  pack: 'pack1', // Movinmotion : Pack 1 à 1,45 € HT le crédit
};

export const optionIntermediaire = (data, id) => data.intermediaires.options.find((o) => o.id === id) || data.intermediaires.options[0];

const enCredits = (o) => !!(o?.credits && o.packs?.length);

/** Pack retenu : le choix, sinon le pack par défaut, sinon le premier. */
export function packChoisi(option, reglages = {}) {
  const packs = option?.packs || [];
  if (!packs.length) return null;
  const id = reglages?.pack || option.pack_defaut;
  return packs.find((p) => p.id === id) || packs.find((p) => p.id === option.pack_defaut) || packs[0];
}

const prixCreditTxt = (cents) => (cents / 100).toFixed(2).replace('.', ',');

/** Crédits, éventuellement fractionnaires (1,5 mois), arrondis au centième. */
const creditsArrondis = (n) => roundInt(Number(n) * 100) / 100;

const quantiteMot = (n, singulier, pluriel) => `${formatFrNombre(n)} ${Math.abs(n) > 1 ? pluriel : singulier}`;

/** Mois couverts par un bulletin : au moins 1, y compris si la durée saisie est nulle. */
const moisBulletins = (mois) => {
  const n = Number(mois);
  if (!Number.isFinite(n)) return 1;
  return Math.max(1, n);
};

/**
 * Bulletins d'une personne : un par mois couvert, davantage si une édition
 * supplémentaire est saisie. Jamais multiplié par les jours ou les cachets.
 */
function nombreBulletins(mois, saisis) {
  const couverts = moisBulletins(mois);
  const n = Number(saisis);
  const demande = Number.isFinite(n) && n > 0 ? n : couverts;
  return Math.max(couverts, demande);
}

/**
 * Frais d'intermédiaire d'une ligne (hors abonnement).
 * ctx : { coutEmployeurCents, convention, bulletins, contrats, signature, fraisManuel, mois, pack }
 */
export function fraisIntermediaire(data, optionId, ctx = {}) {
  const o = optionIntermediaire(data, optionId);
  const contrats = Math.max(0, Number(ctx.contrats ?? 1));
  const details = [];
  const avertissements = [];
  let ht = 0;
  let tva = 0;
  let surDevis = false;
  let credits = null;

  if (o.prix_par_bulletin_ht === null || o.prix_par_contrat_ht === null || o.pourcentage === null) surDevis = true;

  if (enCredits(o)) {
    credits = 0;
    const pack = packChoisi(o, ctx);
    const prix = toCents(pack.prix_credit_ht);
    const prixTxt = prixCreditTxt(prix);
    const nBull = nombreBulletins(ctx.mois, ctx.bulletins);
    const taux = Number(o.credits.bulletin) || 0;
    const tauxReed = Number(o.credits.reedition_bulletin ?? taux) || 0;
    const couverts = moisBulletins(ctx.mois);
    const nBase = tauxReed === taux ? nBull : Math.min(nBull, couverts);
    const nExtra = tauxReed === taux ? 0 : Math.max(0, nBull - couverts);
    const ajouter = (quantite, tauxUnite, libelle) => {
      if (!(quantite > 0) || !(tauxUnite > 0)) return;
      const c = creditsArrondis(quantite * tauxUnite);
      const m = mul(prix, c);
      credits = creditsArrondis(credits + c);
      ht += m;
      details.push({ libelle, montant: m, credits: c });
    };
    ajouter(nBase, taux, `${quantiteMot(nBase, 'bulletin', 'bulletins')} × ${formatFrNombre(taux)} crédits × ${prixTxt} €`);
    ajouter(nExtra, tauxReed, `${quantiteMot(nExtra, 'édition supplémentaire', 'éditions supplémentaires')} × ${formatFrNombre(tauxReed)} crédits × ${prixTxt} €`);
    if (ctx.signature && o.credits.signature_contrat) {
      const parContrat = Number(o.credits.signature_contrat);
      ajouter(contrats, parContrat, `Signature électronique × ${quantiteMot(contrats, 'contrat', 'contrats')} × ${formatFrNombre(parContrat)} crédits × ${prixTxt} €`);
    }
  } else {
    const bulletins = Math.max(0, Number(ctx.bulletins ?? 1));
    if (o.prix_par_bulletin_ht) {
      const m = mul(toCents(o.prix_par_bulletin_ht), bulletins);
      ht += m; details.push({ libelle: `${bulletins} bulletin(s) × ${formatEuros(toCents(o.prix_par_bulletin_ht))}`, montant: m });
    }
    if (o.prix_par_contrat_ht) {
      const m = mul(toCents(o.prix_par_contrat_ht), contrats);
      ht += m; details.push({ libelle: `${contrats} contrat(s) × ${formatEuros(toCents(o.prix_par_contrat_ht))}`, montant: m });
    }
    if (ctx.signature && o.signature_electronique_contrat_ht) {
      const m = mul(toCents(o.signature_electronique_contrat_ht), contrats);
      ht += m; details.push({ libelle: `Signature électronique × ${contrats}`, montant: m });
    }
  }

  if (o.pourcentage) {
    const m = pctOf(ctx.coutEmployeurCents, o.pourcentage);
    ht += m; details.push({ libelle: `${String(o.pourcentage).replace('.', ',')} % du coût employeur`, montant: m });
    if (o.tva_sur_frais) tva = pctOf(m, o.tva_sur_frais);
  }
  if (surDevis) {
    const manuel = ctx.fraisManuel === '' || ctx.fraisManuel == null ? null : toCents(ctx.fraisManuel);
    if (manuel !== null) { ht += manuel; details.push({ libelle: 'Montant saisi (tarif sur devis)', montant: manuel }); }
    else avertissements.push('Tarif sur devis : saisir un montant.');
  }
  if (o.id === 'guso') {
    if (CONVENTIONS_AUDIOVISUELLES.includes(ctx.convention)) avertissements.push('GUSO réservé au spectacle vivant occasionnel : non utilisable pour une production audiovisuelle ou cinéma.');
    avertissements.push("GUSO interdit si le spectacle est l'activité principale de l'employeur.");
  }
  return { option: o, ht, tva, details, avertissements, surDevis, credits };
}

/** Abonnement et frais d'inscription d'une option, pour le devis entier. */
export function fraisFixes(data, optionId, reglages) {
  const o = optionIntermediaire(data, optionId);
  const lignes = [];
  const mois = Math.max(0, Number(reglages.mois ?? 1));
  if (enCredits(o)) {
    const pack = packChoisi(o, reglages);
    const prix = toCents(pack.prix_credit_ht);
    const prixTxt = prixCreditTxt(prix);
    const parMois = o.credits.abonnement?.[reglages.formule];
    if (parMois) {
      const c = creditsArrondis(Number(parMois) * mois);
      const nom = reglages.formule === 'premium' ? 'Premium' : 'Basic';
      lignes.push({
        libelle: `Abonnement ${nom} × ${formatFrNombre(mois)} mois × ${formatFrNombre(parMois)} crédits × ${prixTxt} €`,
        montant: mul(prix, c),
        credits: c,
      });
    }
    if (reglages.premiereInscription && o.credits.inscription) {
      const c = creditsArrondis(o.credits.inscription);
      lignes.push({
        libelle: `Inscription : ${formatFrNombre(c)} crédits × ${prixTxt} €`,
        montant: mul(prix, c),
        credits: c,
      });
    }
    return lignes;
  }
  const ab = o.abonnement_mensuel_ht;
  if (ab && typeof ab === 'object') {
    const prix = ab[reglages.formule];
    if (prix) lignes.push({ libelle: `Abonnement ${o.nom.split(' (')[0]} ${reglages.formule === 'premium' ? 'Premium' : 'Basic'} × ${formatFrNombre(mois)} mois`, montant: mul(toCents(prix), mois) });
  } else if (typeof ab === 'number' && ab > 0) {
    lignes.push({ libelle: `Abonnement ${o.nom} × ${formatFrNombre(mois)} mois`, montant: mul(toCents(ab), mois) });
  }
  return lignes;
}

/** Calcule une ligne de devis complète. */
export function calculerLigne(data, poste, reglages = REGLAGES_DEFAUT) {
  const min = calculerMinimum(data, poste);
  if (!min) return null;
  const demande = comparerDemande(min, poste.demande);
  const brutCents = demande ? demande.cents : min.minimumCents;
  // Une ligne enregistrée ou dupliquée ne peut pas garder une catégorie contraire au métier.
  const statut = statutPourMetier(min.entree, poste.statut);
  const jours = Number(poste.jours) > 0 ? Number(poste.jours) : min.jours;
  const cot = calculerCotisations(data, { brutCents, statut, idcc: min.conv.idcc, jours, abattementPct: poste.abattementPct, rgduPct: poste.rgduPct });
  const intermediaire = poste.intermediaire || reglages.intermediaire;
  const frais = fraisIntermediaire(data, intermediaire, {
    coutEmployeurCents: cot.coutEmployeur, convention: poste.convention,
    bulletins: poste.bulletins, contrats: poste.contrats, signature: reglages.signature, fraisManuel: poste.fraisManuel,
    mois: reglages.mois, pack: reglages.pack,
  });
  return { poste, min, demande, brutCents, statut, jours, cot, intermediaire, frais, coutTotal: cot.coutEmployeur + frais.ht };
}

/**
 * Convertit un budget HT (montant facturé ou enveloppe disponible) en brut maximal pour un poste.
 * Le budget couvre brut + cotisations patronales + frais d'intermédiaire de la ligne (hors abonnement).
 * opts.parUnite : le budget est exprimé par unité (jour, cachet…) et multiplié par la quantité.
 */
export function convertirBudget(data, poste, budgetEuros, reglages = REGLAGES_DEFAUT, opts = {}) {
  const base = calculerLigne(data, { ...poste, demande: null }, reglages);
  if (!base) return null;
  const quantite = base.min.quantite || 1;
  const budgetCents = opts.parUnite ? mul(toCents(budgetEuros), quantite) : toCents(budgetEuros);
  const cout = (brut) => calculerLigne(data, { ...poste, demande: { montant: brut / 100, mode: 'total' } }, reglages);
  const avertissements = [];

  // Le coût total croît avec le brut : recherche dichotomique du plus grand brut qui tient dans le budget
  let lo = 0;
  let hi = Math.max(budgetCents, 1);
  let meilleur = null;
  if (cout(0).coutTotal > budgetCents) {
    avertissements.push({ niveau: 'bloquant', texte: `Impossible : les frais fixes de l'intermédiaire (${formatEuros(cout(0).frais.ht)} HT) dépassent déjà le budget.` });
  } else {
    while (lo <= hi) {
      const mid = Math.floor((lo + hi) / 2);
      const l = cout(mid);
      if (l.coutTotal <= budgetCents) { meilleur = l; lo = mid + 1; } else hi = mid - 1;
    }
  }
  const brutCents = meilleur ? meilleur.brutCents : 0;
  const minimumCents = base.min.minimumCents;
  const budgetMinimum = base.coutTotal;
  const possible = !!meilleur && brutCents >= minimumCents;
  if (meilleur && !possible) {
    avertissements.push({
      niveau: 'bloquant',
      texte: `Impossible au minimum conventionnel : ce budget donne ${formatEuros(brutCents)} brut, alors que le minimum est de ${formatEuros(minimumCents)}. Il faut au moins ${formatEuros(budgetMinimum)} HT (il manque ${formatEuros(budgetMinimum - budgetCents)}). Payer moins que le minimum expose à un rappel de salaire et à une sanction.`,
    });
  }
  if (base.min.nonTrouve) {
    avertissements.push({ niveau: 'attention', texte: "Minimum conventionnel non trouvé pour ce métier : la comparaison se fait au SMIC, qui n'est qu'un plancher légal." });
  }
  if (base.cot.nonTrouves) {
    avertissements.push({ niveau: 'attention', texte: `${base.cot.nonTrouves} cotisation(s) non trouvée(s) comptée(s) à 0 € : le brut réellement possible est un peu plus bas.` });
  }
  const opt = optionIntermediaire(data, base.intermediaire);
  const abonnementActif = (enCredits(opt) ? opt.credits.abonnement : (typeof opt.abonnement_mensuel_ht === 'object' ? opt.abonnement_mensuel_ht : null));
  if (abonnementActif && reglages.formule !== 'aucune') {
    avertissements.push({ niveau: 'info', texte: "L'abonnement mensuel de l'intermédiaire n'est pas déduit : il est compté une fois au total du devis." });
  }
  if (base.frais.surDevis && (poste.fraisManuel === null || poste.fraisManuel === undefined || poste.fraisManuel === '')) {
    avertissements.push({ niveau: 'attention', texte: "Tarif de l'intermédiaire sur devis : ses frais ne sont pas déduits du budget." });
  }
  for (const a of base.frais.avertissements) if (/GUSO/.test(a)) avertissements.push({ niveau: 'bloquant', texte: a });
  if (base.statut.categorie === 'artiste') {
    avertissements.push({ niveau: 'info', texte: "Un artiste engagé pour un spectacle ou un tournage est présumé salarié (code du travail, art. L7121-3) : il ne peut pas vous facturer sa prestation, d'où la conversion en cachet." });
  } else {
    avertissements.push({ niveau: 'info', texte: "Un technicien engagé en CDDU sur une fonction des annexes 8 et 10 est salarié : sa facture doit être remplacée par un bulletin de paie (à vérifier selon son statut)." });
  }
  return {
    budgetCents, brutCents, possible, minimumCents, budgetMinimum, quantite,
    brutParUnite: quantite ? roundInt(brutCents / quantite) : brutCents,
    ligne: meilleur, reste: meilleur ? budgetCents - meilleur.coutTotal : budgetCents,
    avertissements,
  };
}

/** Devis d'équipe : lignes, abonnements (comptés une fois), totaux. */
export function calculerDevis(data, postes, reglages = REGLAGES_DEFAUT) {
  const lignes = postes.map((p) => calculerLigne(data, p, reglages)).filter(Boolean);
  const optionsUtilisees = [...new Set(lignes.map((l) => l.intermediaire))];
  if (lignes.length === 0) optionsUtilisees.push(reglages.intermediaire);
  const fixes = lignes.length ? optionsUtilisees.flatMap((id) => fraisFixes(data, id, reglages)) : [];
  const fixesCents = fixes.reduce((s, f) => s + f.montant, 0);

  // Répartition facultative des frais fixes au prorata du coût employeur
  if (reglages.prorata && fixesCents && lignes.length) {
    const totalCE = lignes.reduce((s, l) => s + l.cot.coutEmployeur, 0) || 1;
    let reste = fixesCents;
    lignes.forEach((l, i) => {
      const part = i === lignes.length - 1 ? reste : roundInt((fixesCents * l.cot.coutEmployeur) / totalCE);
      reste -= part;
      l.partFixes = part;
    });
  }

  const somme = (f, filtre = () => true) => lignes.filter(filtre).reduce((s, l) => s + f(l), 0);
  const estArtiste = (l) => l.statut.categorie === 'artiste';
  const t = {
    brut: somme((l) => l.brutCents),
    patronal: somme((l) => l.cot.patronal),
    salarial: somme((l) => l.cot.salarial),
    coutEmployeur: somme((l) => l.cot.coutEmployeur),
    fraisLignes: somme((l) => l.frais.ht),
    tva: somme((l) => l.frais.tva),
    fixes: fixesCents,
    artistes: somme((l) => l.coutTotal, estArtiste),
    techniciens: somme((l) => l.coutTotal, (l) => !estArtiste(l)),
  };
  t.frais = t.fraisLignes + t.fixes;
  t.coutTotal = t.coutEmployeur + t.frais;
  const suitCredits = lignes.some((l) => l.frais.credits != null) || fixes.some((f) => f.credits != null);
  t.credits = suitCredits
    ? creditsArrondis(lignes.reduce((s, l) => s + (l.frais.credits || 0), 0) + fixes.reduce((s, f) => s + (f.credits || 0), 0))
    : 0;
  const optCredit = optionsUtilisees.map((id) => optionIntermediaire(data, id)).find(enCredits) || null;
  const pack = optCredit ? packChoisi(optCredit, reglages) : null;
  return { lignes, fixes, totaux: t, pack, mention: pack ? 'Prix HT, TVA en plus.' : '' };
}

/**
 * Lignes de synthèse communes au web, au PDF et au CSV.
 * Artistes + techniciens + abonnement = coût total.
 * Coût employeur + frais par ligne + abonnement = coût total.
 */
export function lignesRecapDevis(devis) {
  const t = devis.totaux;
  const detailFrais = (devis.lignes || []).flatMap((l) => (l.frais?.details || []).map((d) => {
    const nom = l.min?.entree?.metier;
    return [nom ? `${nom} — ${d.libelle}` : d.libelle, d.montant];
  }));
  const detail = [
    ['Sous-total artistes', t.artistes],
    ['Sous-total techniciens', t.techniciens],
    ['Abonnement et frais fixes', t.fixes],
    ['Total brut', t.brut],
    ['Total cotisations patronales', t.patronal],
    ['Coût employeur', t.coutEmployeur],
    ["Frais d'intermédiaire par ligne", t.fraisLignes],
    ...detailFrais,
    ...devis.fixes.map((f) => [f.libelle, f.montant]),
    ["Total frais d'intermédiaire HT", t.frais],
  ];
  if (t.tva) detail.push(['TVA sur frais (non comprise)', t.tva]);
  detail.push(["Coût total de l'équipe", t.coutTotal]);
  return {
    visibles: [
      ['Brut', t.brut],
      ['Coût employeur', t.coutEmployeur],
      ['Frais', t.frais],
    ],
    detail,
  };
}
