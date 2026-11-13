/**
 * Libellés français du crible : secteurs, pays, seuils, recommandations.
 * Repris de la page claude.ai « Crible des marchés ».
 */

export const SECTEURS_FR = {
  'Technology': 'Technologie', 'Healthcare': 'Santé', 'Financial Services': 'Finance',
  'Consumer Cyclical': 'Consommation cyclique', 'Consumer Defensive': 'Consommation de base',
  'Industrials': 'Industrie', 'Energy': 'Énergie', 'Utilities': 'Services aux collectivités',
  'Basic Materials': 'Matériaux', 'Communication Services': 'Communication', 'Real Estate': 'Immobilier',
};

export const PAYS_FR = {
  'United States': 'États-Unis', 'United Kingdom': 'Royaume-Uni', 'Germany': 'Allemagne', 'France': 'France',
  'Netherlands': 'Pays-Bas', 'Switzerland': 'Suisse', 'Italy': 'Italie', 'Spain': 'Espagne', 'Sweden': 'Suède',
  'Denmark': 'Danemark', 'Finland': 'Finlande', 'Norway': 'Norvège', 'Belgium': 'Belgique', 'Austria': 'Autriche',
  'Ireland': 'Irlande', 'Portugal': 'Portugal', 'Luxembourg': 'Luxembourg', 'Japan': 'Japon',
  'South Korea': 'Corée du Sud', 'Taiwan': 'Taïwan', 'Jersey': 'Jersey', 'Guernsey': 'Guernesey',
  'Bermuda': 'Bermudes', 'Canada': 'Canada', 'Liechtenstein': 'Liechtenstein', 'Greece': 'Grèce',
  'Poland': 'Pologne', 'Israel': 'Israël', 'China': 'Chine', 'Hong Kong': 'Hong Kong', 'Singapore': 'Singapour',
  'Australia': 'Australie', 'Isle of Man': 'Île de Man', 'Cayman Islands': 'Îles Caïmans', 'Uruguay': 'Uruguay',
};

export const REGIONS = ['États-Unis', 'Europe', 'Suisse', 'Asie'];

export const RECO_FR = {
  strong_buy: 'achat fort', buy: 'achat', hold: 'conserver', underperform: 'sous-pondérer', sell: 'vendre', none: 'aucune',
};

/** Seuils affichés pour chaque profil : [clé, libellé, unité]. Les clés sont celles de SEUILS_DEFAUT. */
export const SEUILS_LIBELLES = {
  defensif: [
    ['capex_min_pct_ca', 'Capex minimum', '% du CA'], ['marge_op_min_pct', 'Marge opérationnelle minimum', '%'],
    ['marge_brute_ecart_type_max', 'Écart-type max de la marge brute', 'points'],
    ['hausse_dette_nette_max_pct', 'Hausse max de la dette nette', '% par an'],
    ['croissance_min_pct', 'Croissance minimum du CA', '% par an'], ['croissance_max_pct', 'Croissance maximum du CA', '% par an'],
    ['per_max', 'PER prévisionnel maximum', 'fois'], ['dette_nette_ebitda_max', 'Dette nette / EBITDA maximum', 'fois'],
    ['beta_max', 'Bêta maximum', ''],
  ],
  offensif: [
    ['of_ca_min', 'Croissance minimum du CA', '%'], ['of_bpa_min', 'Croissance minimum du BPA', '%'],
    ['of_mb_min', 'Marge brute minimum', '%'], ['of_mo_min', 'Marge opérationnelle minimum', '%'],
    ['of_peg_max', 'PEG maximum', ''], ['of_lev_max', 'Dette nette / EBITDA maximum', 'fois'],
  ],
  rendement: [
    ['rd_rdt_min', 'Rendement minimum', '%'], ['rd_payout_max', 'Taux de distribution maximum', '%'],
    ['rd_annees_min', 'Années de dividende minimum', 'ans'], ['rd_lev_max', 'Dette nette / EBITDA maximum', 'fois'],
    ['rd_beta_max', 'Bêta maximum', ''],
  ],
  valeur: [
    ['va_per_max', 'PER prévisionnel maximum', 'fois'], ['va_ve_max', 'VE / EBITDA maximum', 'fois'],
    ['va_fcf_min', 'Rendement FCF minimum', '%'], ['va_pb_max', 'Cours / valeur comptable maximum', 'fois'],
    ['va_ca_min', 'Croissance minimum du CA', '%'], ['va_lev_max', 'Dette nette / EBITDA maximum', 'fois'],
  ],
};

export const secteurFr = (s) => (s ? SECTEURS_FR[s] || s : '—');
export const paysFr = (s) => (s ? PAYS_FR[s] || s : '—');
