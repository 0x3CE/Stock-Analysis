import { useCallback } from 'react';
import { useLocalState } from './useLocalState';

export const CONVICTIONS = ['Faible', 'Moyenne', 'Élevée'];

/**
 * Thèses d'investissement écrites par l'utilisateur, une par ticker :
 * { hypothese, conviction, maj }. Rien n'est inventé : sans thèse écrite,
 * la carte le dit (règle 2 du CLAUDE.md).
 */
export function useTheses() {
  const [theses, setTheses] = useLocalState('theses', {});

  const enregistrer = useCallback((ticker, { hypothese, conviction }) => {
    setTheses((prec) => ({
      ...prec,
      [ticker]: { hypothese: (hypothese || '').trim(), conviction: conviction || null, maj: new Date().toISOString() },
    }));
  }, [setTheses]);

  const effacer = useCallback((ticker) => {
    setTheses((prec) => {
      const suivant = { ...prec };
      delete suivant[ticker];
      return suivant;
    });
  }, [setTheses]);

  return { theses, enregistrer, effacer };
}
