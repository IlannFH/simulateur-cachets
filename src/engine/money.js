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

/**
 * Lit une saisie (« 1 234,56 », « 1.234,56 », « 12.5 »).
 * Le point n'est un séparateur de milliers que devant une virgule décimale
 * (« 1.234,56 ») ou lorsqu'il est répété (« 1.234.567 »).
 * Renvoie null si vide ou invalide.
 */
export function parseInput(v) {
  if (v === null || v === undefined) return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  let s = String(v).trim().replace(/[\s\u00a0\u202f€]/g, '');
  if (s === '' || s === '-' || s === '+' || s === ',' || s === '.') return null;
  const lastComma = s.lastIndexOf(',');
  const lastDot = s.lastIndexOf('.');
  if (lastComma >= 0 && lastDot >= 0) {
    s = lastComma > lastDot ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
  } else if (lastComma >= 0) {
    s = s.replace(',', '.');
  } else if ((s.match(/\./g) || []).length >= 2) {
    s = s.replace(/\./g, '');
  }
  if (!/^[+-]?\d+(\.\d+)?([eE][+-]?\d+)?$/.test(s)) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/** « 1,5 » ou « 2 », sans zéro inutile. */
export function formatFrNombre(n) {
  if (typeof n !== 'number' || !Number.isFinite(n)) return '';
  const rounded = Math.round(n * 100) / 100;
  const [i, d] = String(rounded).split('.');
  return d ? `${i},${d}` : i;
}

/** « 2026-10-09 » → « 9 octobre 2026 ». */
export function formatDateFr(iso) {
  if (!iso) return '';
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso).trim());
  const d = m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
}

/** Écart en % borné : un brut énorme ne s'affiche pas en centaines de millions de %. */
export function formatEcartPct(pct) {
  if (pct === null || pct === undefined || !Number.isFinite(Number(pct))) return '—';
  const n = Number(pct);
  if (n > 999.9) return '> +999 %';
  if (n < -999.9) return '< −999 %';
  const signe = n > 0 ? '+' : '';
  return `${signe}${String(n).replace('.', ',')} %`;
}
