/**
 * App.jsx — Shell principal du StockDashboard.
 *
 * Responsabilités :
 * - Barre de recherche avec autocomplete
 * - En-tête société (nom, prix, variation)
 * - Navigation par onglets
 * - Routing vers les onglets : Overview, Financials, Piotroski, Buffett, Comparer
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { TrendingUp, TrendingDown, Layers, BarChart3, Award, TrendingUp as BuffettIcon, GitCompare, Download } from 'lucide-react';

import { useIsMobile }  from './hooks/Useismobile';
import { useFavorites } from './hooks/useFavorites';
import { Badge }        from './components/ui/Badge';
import { SECTOR_COLORS, getCurrencySymbol, SEARCH_DEBOUNCE_MS } from './utils/Formatters';
import { exportToCSV }  from './utils/exportUtils';

import OverviewTab   from './tabs/OverviewTab';
import FinancialsTab from './tabs/FinancialsTab';
import PiotroskiTab  from './tabs/PiotroskiTab';
import BuffettTab    from './tabs/BuffettTab';
import CompareTab    from './tabs/CompareTab';

import styles from './App.module.css';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

const TABS = [
  { id: 'overview',   label: "Vue d'ensemble", icon: Layers     },
  { id: 'financials', label: 'Financiers',     icon: BarChart3  },
  { id: 'piotroski',  label: 'Piotroski',      icon: Award      },
  { id: 'buffett',    label: 'Buffett',         icon: BuffettIcon },
  { id: 'compare',   label: 'Comparer',        icon: GitCompare },
];

// ---------------------------------------------------------------------------
// Skeleton
// ---------------------------------------------------------------------------

const SkeletonDashboard = () => (
  <div className={styles.skeletonPage}>
    <div className={styles.skeletonInner}>
      <div className={styles.skeletonBlock} style={{ height: '48px', width: '320px' }} />
      <div className={styles.skeletonBlock} style={{ height: '100px', width: '400px' }} />
      <div className={styles.skeletonGrid}>
        {[...Array(4)].map((_, i) => (
          <div key={i} className={styles.skeletonBlock} style={{ height: '120px' }} />
        ))}
      </div>
      <div className={styles.skeletonBlock} style={{ height: '300px' }} />
    </div>
  </div>
);

// ---------------------------------------------------------------------------
// TabBar
// ---------------------------------------------------------------------------

const TabBar = ({ active, onChange }) => (
  <div className={styles.tabBar}>
    {TABS.map(({ id, label, icon: Icon }) => (
      <button
        key={id}
        onClick={() => onChange(id)}
        className={active === id ? styles.tabActive : styles.tab}
      >
        <Icon size={14} />
        <span>{label}</span>
      </button>
    ))}
  </div>
);

// ---------------------------------------------------------------------------
// Composant principal
// ---------------------------------------------------------------------------

const StockDashboard = () => {
  const [ticker, setTicker]                         = useState('AAPL');
  const [loading, setLoading]                       = useState(false);
  const [error, setError]                           = useState(null);
  const [analysis, setAnalysis]                     = useState(null);
  const [suggestions, setSuggestions]               = useState([]);
  const [suggestionsLoading, setSuggestionsLoading] = useState(false);
  const [activeTab, setActiveTab]                   = useState('overview');

  const debounceRef = useRef(null);
  const isMobile    = useIsMobile();
  const chartHeight = isMobile ? 200 : 280;
  const { favorites, toggle: toggleFavorite, isFavorite } = useFavorites();

  // ── Appels API ────────────────────────────────────────────────────────────

  const fetchSuggestions = useCallback(async (query) => {
    if (!query || query.trim().length < 1) { setSuggestions([]); return; }
    setSuggestionsLoading(true);
    try {
      const resp = await fetch(`${API_URL}/api/search/${encodeURIComponent(query)}`);
      if (resp.status === 404) { setSuggestions([]); return; }
      if (!resp.ok) throw new Error('Erreur recherche');
      setSuggestions((await resp.json()).results || []);
    } catch { setSuggestions([]); }
    finally { setSuggestionsLoading(false); }
  }, []);

  const fetchAnalysis = useCallback(async (symbol) => {
    setLoading(true); setError(null); setSuggestions([]);
    try {
      const resp = await fetch(`${API_URL}/api/analyze/${encodeURIComponent(symbol)}`);
      if (!resp.ok) {
        const body = await resp.json().catch(() => ({}));
        throw new Error(body.detail || 'Erreur récupération');
      }
      setAnalysis(await resp.json());
      setActiveTab('overview');
    } catch (err) {
      setError(err.message);
      setAnalysis(null);
    } finally {
      setLoading(false);
    }
  }, []);

  // Chargement initial
  useEffect(() => { fetchAnalysis(ticker); }, [fetchAnalysis]);

  // Nettoyage debounce
  useEffect(() => {
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, []);

  // ── Handlers ─────────────────────────────────────────────────────────────

  const handleTickerChange = (e) => {
    const value = e.target.value;
    setTicker(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => fetchSuggestions(value), SEARCH_DEBOUNCE_MS);
  };

  const handleAnalyze    = ()  => { if (ticker.trim()) fetchAnalysis(ticker.trim()); };
  const handleKeyDown    = (e) => { if (e.key === 'Enter') handleAnalyze(); };
  const handleSuggestion = (e, symbol) => {
    e.preventDefault();
    setTicker(symbol);
    setSuggestions([]);
    fetchAnalysis(symbol);
  };

  // ── États spéciaux ────────────────────────────────────────────────────────

  if (loading) return <SkeletonDashboard />;

  if (error) return (
    <div className={styles.errorPage}>
      <div className={styles.errorCard}>
        <div className={styles.errorTitle}>Erreur de chargement</div>
        <div className={styles.errorMessage}>{error}</div>
        <button onClick={() => { setError(null); fetchAnalysis(ticker); }} className={styles.errorBtn}>
          Réessayer
        </button>
      </div>
    </div>
  );

  // ── Rendu principal ───────────────────────────────────────────────────────

  const kpis          = analysis?.kpis || {};
  const sector        = analysis?.sector   || null;
  const market        = analysis?.market   || null;
  const currency      = analysis?.currency || 'USD';
  const name          = analysis?.name     || ticker;
  const pricePositive = parseFloat(kpis.price_change) >= 0;
  const sectorColor   = SECTOR_COLORS[sector] || '#3b82f6';
  const currencySymbol = getCurrencySymbol(currency);

  return (
    <div className={styles.page}>
      <div className={styles.container}>

        {/* ── Barre de recherche ───────────────────────────── */}
        <div className={favorites.length > 0 ? styles.searchAreaTight : styles.searchAreaSpaced}>
          <div className={styles.searchRow}>
            <div className={styles.searchInputWrap}>
              <input
                type="text"
                value={ticker}
                onChange={handleTickerChange}
                onKeyDown={handleKeyDown}
                placeholder="Ticker ou nom de société…"
                className={styles.searchInput}
              />

              {(suggestions.length > 0 || suggestionsLoading) && (
                <div className={styles.dropdown}>
                  {suggestionsLoading && (
                    <div className={styles.dropdownLoading}>Recherche…</div>
                  )}
                  {suggestions.map((s, idx) => (
                    <div key={idx} className={styles.suggestion} onMouseDown={(e) => handleSuggestion(e, s.symbol)}>
                      <span className={styles.suggestionSymbol}>{s.symbol}</span>
                      <span className={styles.suggestionName}>{s.name}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <button onClick={handleAnalyze} className={styles.searchBtn}>
              Analyser
            </button>
          </div>
        </div>

        {/* ── Barre de favoris ─────────────────────────────── */}
        {favorites.length > 0 && (
          <div className={styles.favBar}>
            {favorites.map((fav) => (
              <button
                key={fav}
                onClick={() => { setTicker(fav); fetchAnalysis(fav); }}
                className={analysis?.ticker === fav ? styles.favBtnActive : styles.favBtn}
              >
                ★ {fav}
              </button>
            ))}
          </div>
        )}

        {/* ── Contenu principal ────────────────────────────── */}
        {analysis && (
          <>
            {/* En-tête société */}
            <div className={styles.stockHeader}>
              <div className={styles.headerBadges}>
                {sector && <Badge label={sector}   color={sectorColor} />}
                {market && <Badge label={market}   color="#64748b" />}
                <Badge label={currency} color="#6366f1" />

                <button
                  onClick={() => toggleFavorite(analysis.ticker)}
                  title={isFavorite(analysis.ticker) ? 'Retirer des favoris' : 'Ajouter aux favoris'}
                  className={isFavorite(analysis.ticker) ? styles.starBtnActive : styles.starBtn}
                >
                  {isFavorite(analysis.ticker) ? '★' : '☆'}
                </button>

                <button onClick={() => exportToCSV(analysis)} title="Exporter en CSV" className={styles.exportBtn}>
                  <Download size={12} />
                  CSV
                </button>
              </div>

              <h1 className={styles.stockName}>{name}</h1>

              <div className={styles.priceRow}>
                <span className={styles.price}>{currencySymbol}{kpis.current_price}</span>
                <span className={`${styles.priceChange} ${pricePositive ? styles.priceUp : styles.priceDown}`}>
                  {pricePositive ? <TrendingUp size={20} /> : <TrendingDown size={20} />}
                  {pricePositive ? '+' : ''}{kpis.price_change}%
                </span>
              </div>
            </div>

            {/* Navigation */}
            <TabBar active={activeTab} onChange={setActiveTab} />

            {/* Onglets */}
            {activeTab === 'overview' && (
              <OverviewTab
                kpis={kpis}
                historical_data={analysis.historical_data}
                dividend_history={analysis.dividend_history}
                profit_margin_history={analysis.profit_margin_history}
                chartHeight={chartHeight}
              />
            )}
            {activeTab === 'financials' && (
              <FinancialsTab
                profit_margin_history={analysis.profit_margin_history}
                dividend_history={analysis.dividend_history}
                chartHeight={chartHeight}
              />
            )}
            {activeTab === 'piotroski' && (
              <PiotroskiTab piotroski_score={analysis.piotroski_score} />
            )}
            {activeTab === 'buffett' && <BuffettTab />}
            {activeTab === 'compare'  && <CompareTab mainAnalysis={analysis} />}
          </>
        )}

        {/* Footer */}
        <div className={styles.footer}>
          Données fournies par Yahoo Finance · yfinance · FRED · Banque Mondiale
        </div>
      </div>
    </div>
  );
};

export default StockDashboard;
