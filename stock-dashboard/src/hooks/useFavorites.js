import { useCallback } from 'react';
import { useLocalState } from './useLocalState';

/**
 * Liste de tickers favoris (la watchlist), gardée dans le navigateur.
 * Même clé qu'avant ('stock_favorites') : les favoris existants sont conservés.
 */
export function useFavorites() {
  const [favorites, setFavorites] = useLocalState('stock_favorites', []);

  const toggle = useCallback((ticker) => {
    setFavorites((prev) => (prev.includes(ticker) ? prev.filter((t) => t !== ticker) : [...prev, ticker]));
  }, [setFavorites]);

  const isFavorite = (ticker) => favorites.includes(ticker);

  return { favorites, toggle, isFavorite };
}
