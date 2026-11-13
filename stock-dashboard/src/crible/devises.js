/**
 * devises.js — Conversion des montants du crible dans la devise choisie.
 *
 * Chaque ligne du crible porte la valeur en USD d'une unité de sa devise de
 * cotation (taux_usd_devise) et de sa devise des comptes (taux_usd_comptable).
 * meta.taux_usd donne la même chose pour les devises du site. Un taux absent
 * donne null : on n'affiche jamais un montant converti au hasard (règle 2).
 */

export const DEVISES = ['EUR', 'USD', 'CHF', 'JPY', 'GBP'];

export const SYMBOLES = { EUR: '€', USD: '$', CHF: 'CHF', JPY: '¥', GBP: '£' };

/** montant (dans une devise valant tauxUsdSource USD) → devise valant tauxUsdCible USD. */
export const convertir = (montant, tauxUsdSource, tauxUsdCible) => {
  if (montant == null || tauxUsdSource == null || !tauxUsdCible) return null;
  return (montant * tauxUsdSource) / tauxUsdCible;
};

/** Capitalisation dans la devise choisie, à partir de capi_usd. */
export const capiDans = (ligne, devise, tauxSite) =>
  convertir(ligne.capi_usd, 1, tauxSite?.[devise]);

/**
 * Montant des comptes (CA, cash-flow libre, dette nette…) dans la devise choisie.
 * Sans conversion si les comptes sont déjà dans cette devise.
 */
export const montantComptableDans = (ligne, cle, devise, tauxSite) => {
  const v = ligne[cle];
  if (v == null) return null;
  if (ligne.devise_comptable === devise) return v;
  return convertir(v, ligne.taux_usd_comptable, tauxSite?.[devise]);
};

const nf = (d) => new Intl.NumberFormat('fr-FR', { maximumFractionDigits: d, minimumFractionDigits: 0 });

/** 1,2 T€ · 345 Md€ · 12,3 Md€ · 850 M€ */
export const formatMontant = (v, devise) => {
  if (v == null) return '—';
  const s = SYMBOLES[devise] || devise || '';
  const a = Math.abs(v);
  if (a >= 1e12) return `${nf(2).format(v / 1e12)} T${s}`;
  if (a >= 1e9) return `${nf(a >= 1e11 ? 0 : 1).format(v / 1e9)} Md${s}`;
  if (a >= 1e6) return `${nf(0).format(v / 1e6)} M${s}`;
  return `${nf(0).format(v)} ${s}`;
};
