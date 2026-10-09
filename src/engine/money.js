// Calculs monétaires en centimes entiers. Arrondi au centime, demi-centime vers le haut (hors signe).

/** Arrondit un nombre (éventuellement flottant) à l'entier le plus proche, sans dérive binaire. */
export function roundInt(x) {
  const s = Math.sign(x);
  return s * Math.round(Number((Math.abs(x)).toFixed(6)));
}

/** Euros → centimes. */
export const toCents = (euros) => roundInt(Number(euros) * 100);

/** Centimes → euros (nombre). */
export const toEuros = (cents) => cents / 100;

/** Applique un pourcentage à un montant en centimes, arrondi au centime. */
export const pctOf = (cents, pct) => roundInt((cents * Number(pct)) / 100);

/** Multiplie un montant en centimes par un facteur, arrondi au centime. */
export const mul = (cents, factor) => roundInt(cents * Number(factor));

const fmt = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' });
const fmtNum = new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** « 1 234,56 € » */
export const formatEuros = (cents) => fmt.format(cents / 100);

/** « 1234,56 » (CSV, sans séparateur de milliers) */
export const formatDecimal = (cents) => (cents / 100).toFixed(2).replace('.', ',');

/** « 1 234,56 » */
export const formatNumber = (n) => fmtNum.format(n);

/** Lit une saisie utilisateur (« 1 234,5 ») ; renvoie null si vide ou invalide. */
export function parseInput(v) {
  if (v === null || v === undefined) return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  const s = String(v).replace(/\s| |€/g, '').replace(',', '.');
  if (s === '') return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}
