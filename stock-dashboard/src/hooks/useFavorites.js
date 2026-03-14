import { useState } from 'react';

const STORAGE_KEY = 'stock_favorites';

function load() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
  } catch {
    return [];
  }
}

function save(list) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
}

/**
 * Gère une liste de tickers favoris persistée dans localStorage.
 */
export function useFavorites() {
  const [favorites, setFavorites] = useState(load);

  const toggle = (ticker) => {
    setFavorites((prev) => {
      const next = prev.includes(ticker)
        ? prev.filter((t) => t !== ticker)
        : [...prev, ticker];
      save(next);
      return next;
    });
  };

  const isFavorite = (ticker) => favorites.includes(ticker);

  return { favorites, toggle, isFavorite };
}
