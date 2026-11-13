import { describe, it, expect } from 'vitest';
import { convertir, capiDans, montantComptableDans, formatMontant } from './devises';

// Taux du crible extrait le 13/11/2026 (valeur en USD d'une unité)
const TAUX = { EUR: 1.1055, USD: 1, CHF: 1.1932, JPY: 0.0062536, GBP: 1.3234 };

describe('conversion des montants du crible', () => {
  const hsbc = { capi_usd: 305e9, devise: 'GBp', devise_comptable: 'USD', taux_usd_comptable: 1, fcf: 20e9 };

  it('capitalisation depuis capi_usd', () => {
    expect(capiDans(hsbc, 'EUR', TAUX)).toBeCloseTo(305e9 / 1.1055, 0);
  });

  it('comptes déjà dans la devise choisie : pas de conversion', () => {
    expect(montantComptableDans(hsbc, 'fcf', 'USD', TAUX)).toBe(20e9);
  });

  it('comptes en USD affichés en CHF', () => {
    expect(montantComptableDans(hsbc, 'fcf', 'CHF', TAUX)).toBeCloseTo(20e9 / 1.1932, 0);
  });

  it('taux ou montant absent : null, jamais 0', () => {
    expect(montantComptableDans({ devise_comptable: 'SEK', fcf: 1e9, taux_usd_comptable: null }, 'fcf', 'EUR', TAUX)).toBeNull();
    expect(montantComptableDans({ devise_comptable: 'EUR', fcf: null }, 'fcf', 'EUR', TAUX)).toBeNull();
    expect(convertir(5, 1, 0)).toBeNull();
  });

  it('format', () => {
    expect(formatMontant(305e9 / 1.1055, 'EUR')).toBe('276 Md€');
    expect(formatMontant(5.157e12, 'USD')).toBe('5,16 T$');
    expect(formatMontant(null, 'EUR')).toBe('—');
  });
});
