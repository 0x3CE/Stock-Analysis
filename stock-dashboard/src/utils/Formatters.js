/**
 * Utilitaires de formatage et d'interprétation partagés entre les onglets.
 */

/** Trie un tableau d'objets { year } par année croissante. */
export const sortByYear = (arr) =>
  [...arr].sort((a, b) => a.year.localeCompare(b.year));

/** Retourne couleur et libellé selon le score Piotroski. */
export const getPiotroskiColor = (score) => {
  if (score >= 7) return { text: '#22c55e', label: 'SOLIDE' };
  if (score >= 4) return { text: '#f59e0b', label: 'MOYEN' };
  return { text: '#ef4444', label: 'FAIBLE' };
};

/** Retourne une couleur CSS selon la valeur du P/E ratio. */
export const getPERatioColor = (pe) => {
  if (!pe || pe === 0) return '#94a3b8';
  if (pe < 15) return '#22c55e';
  if (pe < 30) return '#f59e0b';
  return '#ef4444';
};

/** Couleurs associées aux secteurs boursiers. */
export const SECTOR_COLORS = {
  'Technology':             '#3b82f6',
  'Healthcare':             '#10b981',
  'Financial Services':     '#8b5cf6',
  'Consumer Cyclical':      '#f97316',
  'Industrials':            '#64748b',
  'Communication Services': '#06b6d4',
  'Consumer Defensive':     '#84cc16',
  'Energy':                 '#f59e0b',
  'Real Estate':            '#ec4899',
  'Basic Materials':        '#a78bfa',
  'Utilities':              '#94a3b8',
};

/** Retourne le symbole monétaire à partir du code devise. */
export const getCurrencySymbol = (currency) => {
  const symbols = { USD: '$', EUR: '€', GBP: '£', JPY: '¥' };
  return symbols[currency] || currency;
};