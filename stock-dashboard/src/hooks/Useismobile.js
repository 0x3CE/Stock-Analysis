import { useState, useEffect } from 'react';

/**
 * Retourne true si la largeur de la fenêtre est inférieure à 768px.
 * Se met à jour automatiquement au redimensionnement.
 */
export function useIsMobile() {
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);

  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, []);

  return isMobile;
}