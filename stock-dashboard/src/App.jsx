/**
 * App.jsx — Shell principal du StockDashboard Aurum Wealth.
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { Search, TrendingUp, TrendingDown, Layers, BarChart3, Award, GitCompare, Download, Star } from 'lucide-react';

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
  { id: 'financials', label: 'Financiers',      icon: BarChart3  },
  { id: 'piotroski',  label: 'Piotroski',       icon: Award      },
  { id: 'buffett',    label: 'Buffett',          icon: TrendingUp },
  { id: 'compare',    label: 'Comparer',         icon: GitCompare },
];

const TICKER_DATA = [
  { label: 'DJIA',    value: '39,127.14', change: '+0.38%', up: true  },
  { label: 'S&P 500', value: '5,204.34',  change: '+0.24%', up: true  },
  { label: 'NASDAQ',  value: '16,290.50', change: '-0.18%', up: false },
  { label: 'EUR/USD', value: '1.0862',    change: '+0.12%', up: true  },
  { label: 'Gold',    value: '2,338.60',  change: '+0.55%', up: true  },
  { label: 'BTC',     value: '67,412.00', change: '-1.20%', up: false },
  { label: 'Oil WTI', value: '83.42',     change: '+0.31%', up: true  },
];

// ---------------------------------------------------------------------------
// Carousel de ticker (auto-advance + navigation par points)
// ---------------------------------------------------------------------------

const CAROUSEL_VISIBLE = 4; // indices visibles simultanément

const TickerCarousel = () => {
  const [index, setIndex]   = useState(0);
  const [paused, setPaused] = useState(false);
  const total = TICKER_DATA.length;

  useEffect(() => {
    if (paused) return;
    const id = setInterval(() => setIndex(i => (i + 1) % total), 3000);
    return () => clearInterval(id);
  }, [paused, total]);

  // Fenêtre glissante avec wrapping circulaire
  const visible = Array.from(
    { length: CAROUSEL_VISIBLE },
    (_, k) => TICKER_DATA[(index + k) % total]
  );

  return (
    <div
      className={styles.tickerBar}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      {/* Cartes visibles — la clé change à chaque index pour déclencher l'animation */}
      <div className={styles.tickerSlide} key={index}>
        {visible.map((item, i) => (
          <div key={i} className={styles.tickerCard}>
            <span className={styles.tickerLabel}>{item.label}</span>
            <span className={styles.tickerValue}>{item.value}</span>
            <span className={item.up ? styles.tickerUp : styles.tickerDown}>
              {item.change}
            </span>
          </div>
        ))}
      </div>

      {/* Points de navigation */}
      <div className={styles.tickerDots}>
        {TICKER_DATA.map((_, i) => (
          <button
            key={i}
            className={i === index ? styles.dotActive : styles.dot}
            onClick={() => setIndex(i)}
            aria-label={TICKER_DATA[i].label}
          />
        ))}
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Logo Aurum Wealth
// ---------------------------------------------------------------------------

const AurumLogo = () => (
  <div className={styles.logo}>
    <div className={styles.logoIcon}>
      <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
        <path d="M14 3L25 24H3L14 3Z" fill="none" stroke="#B8860B" strokeWidth="2.2" strokeLinejoin="round"/>
        <path d="M9 17H19" stroke="#B8860B" strokeWidth="2" strokeLinecap="round"/>
      </svg>
    </div>
    <div className={styles.logoText}>
      <span className={styles.logoAurum}>Stock Analysis</span>
      <span className={styles.logoWealth}>Dashboard</span>
    </div>
  </div>
);

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
    {TABS.map(({ id, label }) => (
      <button
        key={id}
        onClick={() => onChange(id)}
        className={active === id ? styles.tabActive : styles.tab}
      >
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
  const chartHeight = isMobile ? 200 : 260;
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

  useEffect(() => { fetchAnalysis(ticker); }, [fetchAnalysis]);

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
      {/* ── En-tête Aurum Wealth ──────────────────────────── */}
      <header className={styles.header}>
        <AurumLogo />

        <div className={styles.headerSearch}>
          <div className={styles.searchInputWrap}>
            <Search size={16} className={styles.searchIcon} />
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

        <nav className={styles.headerNav}>
          <a href="#" className={styles.navLink}>Dashboard</a>
          <a href="#" className={styles.navLink}>Portfolio</a>
          <a href="#" className={styles.navLink}>Reports</a>
          <a href="#" className={styles.navLink}>Profile</a>
        </nav>
      </header>

      {/* ── Barre ticker ─────────────────────────────────── */}
      <TickerCarousel />

      {/* ── Contenu principal ────────────────────────────── */}
      <div className={styles.container}>

        {/* Barre de favoris */}
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

        {/* Contenu */}
        {analysis && (
          <>
            {/* En-tête société */}
            <div className={styles.stockHeader}>
              <h1 className={styles.stockName}>{name}</h1>

              <div className={styles.priceRow}>
                <span className={styles.price}>{currencySymbol}{kpis.current_price}</span>
                <span className={`${styles.priceChange} ${pricePositive ? styles.priceUp : styles.priceDown}`}>
                  {pricePositive ? <TrendingUp size={18} /> : <TrendingDown size={18} />}
                  {pricePositive ? '+' : ''}{kpis.price_change}%
                </span>
              </div>

              <div className={styles.headerBadges}>
                {sector && <Badge label={sector}   color={sectorColor} />}
                {market && <Badge label={market}   color="#64748b" />}
                <Badge label={currency} color="#6366f1" />
                <button
                  onClick={() => toggleFavorite(analysis.ticker)}
                  title={isFavorite(analysis.ticker) ? 'Retirer des favoris' : 'Ajouter aux favoris'}
                  className={isFavorite(analysis.ticker) ? styles.starBtnActive : styles.starBtn}
                >
                  <Star size={13} fill={isFavorite(analysis.ticker) ? 'currentColor' : 'none'} />
                </button>
                <button onClick={() => exportToCSV(analysis)} title="Exporter en CSV" className={styles.exportBtn}>
                  <Download size={12} />
                  CSV
                </button>
              </div>
            </div>

            {/* Navigation par onglets */}
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
