/**
 * Utilitaires de formatage et d'interprétation partagés entre les onglets.
 */

// Seuils Piotroski — doivent correspondre aux constantes backend (stock_service.py)
export const PIOTROSKI_HIGH = 7;
export const PIOTROSKI_MID  = 4;

// Délai de debounce pour la recherche (ms)
export const SEARCH_DEBOUNCE_MS = 350;

/** Trie un tableau d'objets { year } par année croissante. */
export const sortByYear = (arr) =>
  [...arr].sort((a, b) => a.year.localeCompare(b.year));

const zonePiotroski = (score) => {
  if (score >= PIOTROSKI_HIGH) return { text: '#22c55e', label: 'SOLIDE' };
  if (score >= PIOTROSKI_MID)  return { text: '#f59e0b', label: 'MOYEN' };
  return { text: '#ef4444', label: 'FAIBLE' };
};

const PIOTROSKI_INCONNU = { text: '#94a3b8', label: 'À VÉRIFIER' };

/**
 * Couleur et libellé selon le score Piotroski.
 * score null : inconnu. Avec `inconnus` critères sans données, le score réel est
 * entre score et score + inconnus : on ne conclut que si les deux bornes tombent
 * dans la même zone (même règle que interpret_piotroski() côté backend).
 */
export const getPiotroskiColor = (score, inconnus = 0) => {
  if (score == null) return PIOTROSKI_INCONNU;
  const bas = zonePiotroski(score);
  if (!inconnus) return bas;
  return bas.label === zonePiotroski(score + inconnus).label ? bas : PIOTROSKI_INCONNU;
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