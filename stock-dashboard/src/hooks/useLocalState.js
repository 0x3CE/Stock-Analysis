import { useCallback, useState } from 'react';

/**
 * État gardé dans le navigateur (localStorage), sans jamais planter :
 * navigation privée ou stockage bloqué → la valeur reste en mémoire.
 * En attendant les comptes (Supabase), c'est là que vivent la devise,
 * les favoris et les thèses de l'utilisateur.
 */
export function useLocalState(cle, defaut) {
  const [valeur, setValeur] = useState(() => {
    try {
      const brut = window.localStorage.getItem(cle);
      return brut == null ? defaut : JSON.parse(brut);
    } catch {
      return defaut;
    }
  });

  const ecrire = useCallback((suivante) => {
    setValeur((prec) => {
      const v = typeof suivante === 'function' ? suivante(prec) : suivante;
      try { window.localStorage.setItem(cle, JSON.stringify(v)); } catch { /* stockage indisponible */ }
      return v;
    });
  }, [cle]);

  return [valeur, ecrire];
}
