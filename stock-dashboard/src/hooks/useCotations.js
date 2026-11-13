import { useEffect, useState } from 'react';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';
const RAFRAICHIR_MS = 60_000;

/**
 * Cours et variation du jour d'une liste de tickers (12 au plus), via /api/cotations.
 * Renvoie { [ticker]: { cours, variation_pct, devise } } ; une valeur inconnue reste null.
 */
export function useCotations(tickers) {
  const [cotations, setCotations] = useState({});
  const cle = (tickers || []).slice(0, 12).join(',');

  useEffect(() => {
    if (!cle) { setCotations({}); return undefined; }
    let actif = true;
    const charger = async () => {
      try {
        const r = await fetch(`${API_URL}/api/cotations?tickers=${encodeURIComponent(cle)}`);
        if (!r.ok) return;
        const j = await r.json();
        if (!actif) return;
        const parTicker = {};
        (j.cotations || []).forEach((c) => { parTicker[c.ticker] = c; });
        setCotations(parTicker);
      } catch { /* réseau indisponible : on garde les dernières valeurs */ }
    };
    charger();
    const id = setInterval(charger, RAFRAICHIR_MS);
    return () => { actif = false; clearInterval(id); };
  }, [cle]);

  return cotations;
}
