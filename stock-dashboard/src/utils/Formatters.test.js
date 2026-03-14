import { describe, it, expect } from 'vitest';
import {
  sortByYear,
  getPiotroskiColor,
  getPERatioColor,
  getCurrencySymbol,
  PIOTROSKI_HIGH,
  PIOTROSKI_MID,
  SEARCH_DEBOUNCE_MS,
} from './Formatters';

// ---------------------------------------------------------------------------
// Constantes
// ---------------------------------------------------------------------------

describe('Constantes', () => {
  it('PIOTROSKI_HIGH doit être 7', () => {
    expect(PIOTROSKI_HIGH).toBe(7);
  });

  it('PIOTROSKI_MID doit être 4', () => {
    expect(PIOTROSKI_MID).toBe(4);
  });

  it('SEARCH_DEBOUNCE_MS doit être un nombre positif', () => {
    expect(SEARCH_DEBOUNCE_MS).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// sortByYear
// ---------------------------------------------------------------------------

describe('sortByYear', () => {
  it('trie par année croissante', () => {
    const input = [{ year: '2023' }, { year: '2021' }, { year: '2022' }];
    const result = sortByYear(input);
    expect(result.map(r => r.year)).toEqual(['2021', '2022', '2023']);
  });

  it('ne mute pas le tableau original', () => {
    const input = [{ year: '2023' }, { year: '2021' }];
    sortByYear(input);
    expect(input[0].year).toBe('2023');
  });

  it('retourne un tableau vide si entrée vide', () => {
    expect(sortByYear([])).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// getPiotroskiColor
// ---------------------------------------------------------------------------

describe('getPiotroskiColor', () => {
  it('score >= 7 → SOLIDE (vert)', () => {
    const { label, text } = getPiotroskiColor(7);
    expect(label).toBe('SOLIDE');
    expect(text).toBe('#22c55e');
  });

  it('score = 9 → SOLIDE', () => {
    expect(getPiotroskiColor(9).label).toBe('SOLIDE');
  });

  it('score = 4 → MOYEN (orange)', () => {
    const { label, text } = getPiotroskiColor(4);
    expect(label).toBe('MOYEN');
    expect(text).toBe('#f59e0b');
  });

  it('score = 6 → MOYEN', () => {
    expect(getPiotroskiColor(6).label).toBe('MOYEN');
  });

  it('score < 4 → FAIBLE (rouge)', () => {
    const { label, text } = getPiotroskiColor(3);
    expect(label).toBe('FAIBLE');
    expect(text).toBe('#ef4444');
  });

  it('score = 0 → FAIBLE', () => {
    expect(getPiotroskiColor(0).label).toBe('FAIBLE');
  });
});

// ---------------------------------------------------------------------------
// getPERatioColor
// ---------------------------------------------------------------------------

describe('getPERatioColor', () => {
  it('PE nul → gris', () => {
    expect(getPERatioColor(null)).toBe('#94a3b8');
    expect(getPERatioColor(0)).toBe('#94a3b8');
  });

  it('PE < 15 → vert', () => {
    expect(getPERatioColor(10)).toBe('#22c55e');
  });

  it('PE entre 15 et 30 → orange', () => {
    expect(getPERatioColor(20)).toBe('#f59e0b');
  });

  it('PE > 30 → rouge', () => {
    expect(getPERatioColor(50)).toBe('#ef4444');
  });
});

// ---------------------------------------------------------------------------
// getCurrencySymbol
// ---------------------------------------------------------------------------

describe('getCurrencySymbol', () => {
  it('USD → $', () => expect(getCurrencySymbol('USD')).toBe('$'));
  it('EUR → €', () => expect(getCurrencySymbol('EUR')).toBe('€'));
  it('GBP → £', () => expect(getCurrencySymbol('GBP')).toBe('£'));
  it('JPY → ¥', () => expect(getCurrencySymbol('JPY')).toBe('¥'));
  it('devise inconnue → code brut', () => expect(getCurrencySymbol('CHF')).toBe('CHF'));
});
