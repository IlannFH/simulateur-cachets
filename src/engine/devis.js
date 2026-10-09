// Ligne complète : minimum, brut, cotisations, frais d'intermédiaire.
import { toCents, mul, pctOf, roundInt, formatEuros, formatFrNombre } from './money.js';
import { calculerMinimum, comparerDemande } from './poste.js';
import { calculerCotisations } from './cotisations.js';
import { statutPourMetier } from './catalogue.js';

const CONVENTIONS_AUDIOVISUELLES = ['3097_pub', '3097_cinema', '2642', '2412', '2121'];

export const REGLAGES_DEFAUT = {
  intermediaire: 'movinmotion',
  formule: 'basic', // abonnement Movinmotion : basic | premium | aucune
  mois: 1,
  premiereInscription: false,
  signature: false,
  pack: 'pack1', // Movinmotion : Pack 1 à 1,45 € HT le crédit
};

export const optionIntermediaire = (data, id) => {
  const options = (data.intermediaires?.options || []).filter((o) => o.id !== 'direct');
  return options.find((o) => o.id === id) || options[0];
};

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
    if (CONVENTIONS_AUDIOVISUELLES.includes(ctx.convention)) avertissements.push('GUSO réservé au spectacle vivant occasionnel : non utilisable pour une production audiovisuelle, un clip ou le cinéma.');
    avertissements.push("GUSO interdit si le spectacle est l'activité principale de l'employeur.");
  }
  return { option: o, ht, tva, details, avertissements, surDevis, credits };
}

/** Abonnement et frais d'inscription, comptés une fois pour la simulation. */
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

/** Calcule une ligne complète. */
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
 * Le budget couvre le brut, les cotisations patronales et les frais d'intermédiaire,
 * abonnement compris (une fois, pour cette simulation).
 * opts.parUnite : le budget est exprimé par unité (jour, cachet…) et multiplié par la quantité.
 */
export function convertirBudget(data, poste, budgetEuros, reglages = REGLAGES_DEFAUT, opts = {}) {
  const base = calculerLigne(data, { ...poste, demande: null }, reglages);
  if (!base) return null;
  const quantite = base.min.quantite || 1;
  const budgetCents = opts.parUnite ? mul(toCents(budgetEuros), quantite) : toCents(budgetEuros);
  const fixesCents = fraisFixes(data, poste.intermediaire || reglages.intermediaire, reglages).reduce((s, f) => s + f.montant, 0);
  const cout = (brut) => calculerLigne(data, { ...poste, demande: { montant: brut / 100, mode: 'total' } }, reglages);
  const tient = (l) => l.coutTotal + fixesCents <= budgetCents;
  const avertissements = [];

  // Le coût total croît avec le brut : recherche dichotomique du plus grand brut qui tient dans le budget
  let lo = 0;
  let hi = Math.max(budgetCents, 1);
  let meilleur = null;
  if (!tient(cout(0))) {
    avertissements.push({ niveau: 'bloquant', texte: `Impossible : les frais de l'intermédiaire (${formatEuros(cout(0).frais.ht + fixesCents)} HT) dépassent déjà le budget.` });
  } else {
    while (lo <= hi) {
      const mid = Math.floor((lo + hi) / 2);
      const l = cout(mid);
      if (tient(l)) { meilleur = l; lo = mid + 1; } else hi = mid - 1;
    }
  }
  const brutCents = meilleur ? meilleur.brutCents : 0;
  const minimumCents = base.min.minimumCents;
  const budgetMinimum = base.coutTotal + fixesCents;
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
  if (base.frais.surDevis && (poste.fraisManuel === null || poste.fraisManuel === undefined || poste.fraisManuel === '')) {
    avertissements.push({ niveau: 'attention', texte: "Tarif de l'intermédiaire sur devis : ses frais ne sont pas déduits du budget." });
  }
  for (const a of base.frais.avertissements) if (/GUSO/.test(a)) avertissements.push({ niveau: 'bloquant', texte: a });
  if (base.statut.categorie === 'artiste') {
    avertissements.push({ niveau: 'info', texte: "Un artiste engagé pour un spectacle ou un tournage est présumé salarié (code du travail, art. L7121-3) : il ne peut pas vous facturer sa prestation, d'où la conversion en cachet." });
  } else {
    avertissements.push({ niveau: 'info', texte: "Un technicien engagé en CDDU sur une fonction des annexes 8 et 10 est salarié : sa facture doit être remplacée par un bulletin de paie (à vérifier selon son statut)." });
  }
  const retenu = possible ? meilleur : base;
  return {
    budgetCents, brutCents, possible, minimumCents, budgetMinimum, quantite,
    brutParUnite: quantite ? roundInt(brutCents / quantite) : brutCents,
    ligne: meilleur, reste: meilleur ? budgetCents - meilleur.coutTotal - fixesCents : budgetCents, fixesCents,
    employeurCents: retenu.cot.coutEmployeur,
    netCents: retenu.cot.net,
    avertissements,
  };
}
