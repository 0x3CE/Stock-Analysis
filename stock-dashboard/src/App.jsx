/**
 * App.jsx — Coquille du Stock Analysis Dashboard (thème terminal).
 *
 * Deux vues : « Analyse » (une société) et « Crible des marchés » (#crible).
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import {
  Search, Play, Settings, BarChart3, Table2, TrendingUp, Trophy, Scale, Star, Download, X,
} from 'lucide-react';

import { useIsMobile }   from './hooks/Useismobile';
import { useFavorites }  from './hooks/useFavorites';
import { useLocalState } from './hooks/useLocalState';
import { getCurrencySymbol, SEARCH_DEBOUNCE_MS } from './utils/Formatters';
import { exportToCSV }   from './utils/exportUtils';
import { DEVISES }       from './crible/devises';

import OverviewTab   from './tabs/OverviewTab';
import FinancialsTab from './tabs/FinancialsTab';
import PiotroskiTab  from './tabs/PiotroskiTab';
import BuffettTab    from './tabs/BuffettTab';
import CompareTab    from './tabs/CompareTab';
import CribleView    from './crible/CribleView';

import styles from './App.module.css';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

const TABS = [
  { id: 'overview',   label: "Vue d'ensemble", icon: BarChart3  },
  { id: 'financials', label: 'Financiers',     icon: Table2     },
  { id: 'piotroski',  label: 'Piotroski',      icon: TrendingUp },
  { id: 'buffett',    label: 'Buffett',        icon: Trophy     },
  { id: 'compare',    label: 'Comparer',       icon: Scale      },
];

const TICKER_FALLBACK = [
  { label: 'DJIA',    value: '—', change: '—', up: true },
  { label: 'S&P 500', value: '—', change: '—', up: true },
  { label: 'NASDAQ',  value: '—', change: '—', up: true },
  { label: 'EUR/USD', value: '—', change: '—', up: true },
  { label: 'Gold',    value: '—', change: '—', up: true },
  { label: 'BTC',     value: '—', change: '—', up: true },
  { label: 'Oil WTI', value: '—', change: '—', up: true },
];

// ---------------------------------------------------------------------------
// Bandeau des marchés : 4 indices visibles, défilement automatique, points de navigation
// ---------------------------------------------------------------------------

const CAROUSEL_VISIBLE = 4;

const TickerCarousel = () => {
  const [tickerData, setTickerData] = useState(TICKER_FALLBACK);
  const [index, setIndex]           = useState(0);
  const [paused, setPaused]         = useState(false);
  const total = tickerData.length;

  useEffect(() => {
    const load = async () => {
      try {
        const resp = await fetch(`${API_URL}/api/market-snapshot`);
        if (resp.ok) {
          const data = await resp.json();
          if (Array.isArray(data) && data.length > 0) setTickerData(data);
        }
      } catch {
        // On garde les valeurs « — »
      }
    };
    load();
    const refreshId = setInterval(load, 60_000);
    return () => clearInterval(refreshId);
  }, []);

  useEffect(() => {
    if (paused) return undefined;
    const id = setInterval(() => setIndex((i) => (i + 1) % total), 4000);
    return () => clearInterval(id);
  }, [paused, total]);

  const visible = Array.from({ length: Math.min(CAROUSEL_VISIBLE, total) }, (_, k) => tickerData[(index + k) % total]);

  return (
    <div className={styles.tickerBar} onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)}>
      <div className={styles.tickerSlide} key={index}>
        {visible.map((item, i) => (
          <div key={`${item.label}-${i}`} className={styles.tickerItem}>
            <span className={styles.tickerLabel}>{item.label}</span>
            <span className={styles.tickerValue}>{item.value}</span>
            <span className={item.change === '—' ? styles.tickerFlat : item.up ? styles.tickerUp : styles.tickerDown}>
              {item.change}
            </span>
          </div>
        ))}
      </div>
      <div className={styles.tickerDots}>
        {tickerData.map((item, i) => (
          <button
            key={item.label}
            className={i === index ? styles.dotActive : styles.dot}
            onClick={() => setIndex(i)}
            aria-label={`Commencer le bandeau à ${item.label}`}
          />
        ))}
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Logo
// ---------------------------------------------------------------------------

const LogoBarres = ({ taille = 36 }) => (
  <svg width={taille} height={taille} viewBox="0 0 36 36" fill="none" aria-hidden="true">
    <rect x="3"  y="21" width="6" height="12" rx="1" fill="var(--accent)" opacity="0.7" />
    <rect x="11" y="15" width="6" height="18" rx="1" fill="var(--accent)" opacity="0.8" />
    <rect x="19" y="18" width="6" height="15" rx="1" fill="var(--accent)" opacity="0.9" />
    <rect x="27" y="6"  width="6" height="27" rx="1" fill="var(--accent)" />
    <path d="M4 17 L13 10 L21 13 L31 3" stroke="var(--accent)" strokeWidth="1.6" strokeLinecap="round" fill="none" />
  </svg>
);

const Logo = ({ onClick }) => (
  <button className={styles.logo} onClick={onClick} aria-label="Stock Analysis Dashboard, accueil">
    <LogoBarres />
    <span className={styles.logoText}>
      <span className={styles.logoTitle}>Stock Analysis</span>
      <span className={styles.logoSub}>Dashboard</span>
    </span>
  </button>
);

// ---------------------------------------------------------------------------
// Réglages (engrenage)
// ---------------------------------------------------------------------------

const Reglages = ({ devise, onDevise, onFermer }) => {
  const ref = useRef(null);
  useEffect(() => {
    // Le parent contient aussi l'engrenage : cliquer dessus ne doit pas fermer puis rouvrir le panneau
    const clic = (e) => { if (ref.current && !ref.current.parentElement.contains(e.target)) onFermer(); };
    const touche = (e) => { if (e.key === 'Escape') onFermer(); };
    document.addEventListener('mousedown', clic);
    document.addEventListener('keydown', touche);
    return () => { document.removeEventListener('mousedown', clic); document.removeEventListener('keydown', touche); };
  }, [onFermer]);

  return (
    <div className={styles.reglages} ref={ref} role="dialog" aria-label="Réglages">
      <div className={styles.reglagesTete}>
        <span>Réglages</span>
        <button className={styles.iconBtn} onClick={onFermer} aria-label="Fermer"><X size={14} /></button>
      </div>
      <label className={styles.reglagesChamp}>
        <span>Devise d'affichage du crible</span>
        <select value={devise} onChange={(e) => onDevise(e.target.value)}>
          {DEVISES.map((d) => <option key={d} value={d}>{d}</option>)}
        </select>
      </label>
      <p className={styles.reglagesNote}>
        Données : Yahoo Finance (yfinance, API non officielle), FRED, Banque mondiale. Chiffres datés, à
        recouper avec les publications des sociétés. Favoris et thèses sont gardés dans ce navigateur.
      </p>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Squelette de chargement
// ---------------------------------------------------------------------------

const SkeletonDashboard = () => (
  <div className={styles.skeletonInner} aria-busy="true" aria-label="Chargement de l'analyse">
    <div className={styles.skeletonBlock} style={{ height: '56px', width: 'min(420px, 80%)' }} />
    <div className={styles.skeletonBlock} style={{ height: '48px', width: 'min(300px, 60%)' }} />
    <div className={styles.skeletonGrid}>
      {[...Array(3)].map((_, i) => <div key={i} className={styles.skeletonBlock} style={{ height: '120px' }} />)}
    </div>
    <div className={styles.skeletonBlock} style={{ height: '300px' }} />
  </div>
);

// ---------------------------------------------------------------------------
// Onglets
// ---------------------------------------------------------------------------

const TabBar = ({ active, onChange }) => (
  <div className={styles.tabBar} role="tablist" aria-label="Analyse de la société">
    {TABS.map(({ id, label, icon: Icon }) => (
      <button
        key={id}
        role="tab"
        aria-selected={active === id}
        onClick={() => onChange(id)}
        className={active === id ? styles.tabActive : styles.tab}
      >
        <Icon size={17} strokeWidth={2} />
        <span>{label}</span>
      </button>
    ))}
  </div>
);

// ---------------------------------------------------------------------------
// Composant principal
// ---------------------------------------------------------------------------

const vueDepuisAdresse = () => (typeof window !== 'undefined' && window.location.hash === '#crible' ? 'crible' : 'analyse');

const StockDashboard = () => {
  const [vue, setVueEtat]                           = useState(vueDepuisAdresse);
  const [ticker, setTicker]                         = useState('AAPL');
  const [loading, setLoading]                       = useState(false);
  const [error, setError]                           = useState(null);
  const [analysis, setAnalysis]                     = useState(null);
  const [suggestions, setSuggestions]               = useState([]);
  const [suggestionsLoading, setSuggestionsLoading] = useState(false);
  const [activeTab, setActiveTab]                   = useState('overview');
  const [reglagesOuverts, setReglagesOuverts]       = useState(false);
  const [devise, setDevise]                         = useLocalState('crible.devise.v2', 'EUR');

  const debounceRef = useRef(null);
  const isMobile    = useIsMobile();
  const chartHeight = isMobile ? 220 : 280;
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

  useEffect(() => { fetchAnalysis(ticker); }, [fetchAnalysis]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => () => { if (debounceRef.current) clearTimeout(debounceRef.current); }, []);

  const setVue = useCallback((v) => {
    setVueEtat(v);
    if (typeof window !== 'undefined') window.history.replaceState(null, '', v === 'crible' ? '#crible' : '#');
  }, []);

  const analyser = useCallback((symbol) => {
    if (!symbol) return;
    setTicker(symbol);
    setSuggestions([]);
    setVue('analyse');
    fetchAnalysis(symbol);
  }, [fetchAnalysis, setVue]);

  // ── Handlers ─────────────────────────────────────────────────────────────

  const handleTickerChange = (e) => {
    const value = e.target.value;
    setTicker(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => fetchSuggestions(value), SEARCH_DEBOUNCE_MS);
  };

  const handleAnalyze = () => { if (ticker.trim()) analyser(ticker.trim()); };
  const handleKeyDown = (e) => { if (e.key === 'Enter') handleAnalyze(); };

  // ── Rendu ─────────────────────────────────────────────────────────────────

  const kpis           = analysis?.kpis || {};
  const currency       = analysis?.currency || 'USD';
  const currencySymbol = getCurrencySymbol(currency);
  const pricePositive  = kpis.price_change != null && kpis.price_change >= 0;

  let contenu;
  if (vue === 'crible') {
    contenu = <CribleView onAnalyser={analyser} devise={devise} onDevise={setDevise} />;
  } else if (loading) {
    contenu = <SkeletonDashboard />;
  } else if (error) {
    contenu = (
      <div className={styles.errorCard} role="alert">
        <div className={styles.errorTitle}>Erreur de chargement</div>
        <div className={styles.errorMessage}>{error}</div>
        <button onClick={() => { setError(null); fetchAnalysis(ticker); }} className={styles.primaryBtn}>Réessayer</button>
      </div>
    );
  } else if (analysis) {
    contenu = (
      <>
        <section className={styles.stockHeader}>
          <h1 className={styles.stockName}>{analysis.name || analysis.ticker}</h1>
          <div className={styles.priceRow}>
            <span className={styles.price}>
              {kpis.current_price != null ? `${currencySymbol}${kpis.current_price.toFixed(2)}` : '—'}
            </span>
            {kpis.price_change != null && (
              <span className={pricePositive ? styles.priceUp : styles.priceDown}>
                <span className={styles.triangle} aria-hidden="true">{pricePositive ? '▲' : '▼'}</span>
                {pricePositive ? '+' : ''}{kpis.price_change.toFixed(2)}%
              </span>
            )}
          </div>
          <div className={styles.headerBadges}>
            {analysis.sector   && <span className={styles.badgeVert}>{analysis.sector}</span>}
            {analysis.market   && <span className={styles.badgeBleu}>{analysis.market}</span>}
            <span className={styles.badgeBleu}>{currency}</span>
            <button
              onClick={() => toggleFavorite(analysis.ticker)}
              title={isFavorite(analysis.ticker) ? 'Retirer de la watchlist' : 'Ajouter à la watchlist'}
              aria-pressed={isFavorite(analysis.ticker)}
              className={isFavorite(analysis.ticker) ? styles.outlineBtnActif : styles.outlineBtn}
            >
              <Star size={15} fill={isFavorite(analysis.ticker) ? 'currentColor' : 'none'} />
            </button>
            <button onClick={() => exportToCSV(analysis)} title="Exporter en CSV" className={styles.outlineBtn}>
              <Download size={15} /> CSV
            </button>
          </div>
        </section>

        <TabBar active={activeTab} onChange={setActiveTab} />

        <div className={styles.tabContent}>
          {activeTab === 'overview' && (
            <OverviewTab
              kpis={kpis}
              currency={currency}
              historical_data={analysis.historical_data}
              chartHeight={chartHeight}
              ticker={analysis.ticker}
              favorites={favorites}
              onSelectTicker={analyser}
            />
          )}
          {activeTab === 'financials' && (
            <FinancialsTab
              profit_margin_history={analysis.profit_margin_history}
              dividend_history={analysis.dividend_history}
              chartHeight={chartHeight}
            />
          )}
          {activeTab === 'piotroski' && <PiotroskiTab piotroski_score={analysis.piotroski_score} />}
          {activeTab === 'buffett'   && <BuffettTab />}
          {activeTab === 'compare'   && <CompareTab mainAnalysis={analysis} />}
        </div>
      </>
    );
  }

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <Logo onClick={() => setVue('analyse')} />

        <div className={styles.headerSearch}>
          <div className={styles.searchInputWrap}>
            <Search size={20} className={styles.searchIcon} />
            <input
              type="text"
              value={ticker}
              onChange={handleTickerChange}
              onKeyDown={handleKeyDown}
              placeholder="Ticker ou nom de société…"
              aria-label="Ticker ou nom de société"
              className={styles.searchInput}
            />
            {(suggestions.length > 0 || suggestionsLoading) && (
              <div className={styles.dropdown}>
                {suggestionsLoading && <div className={styles.dropdownLoading}>Recherche…</div>}
                {suggestions.map((s) => (
                  <div key={s.symbol} className={styles.suggestion}
                    onMouseDown={(e) => { e.preventDefault(); analyser(s.symbol); }}>
                    <span className={styles.suggestionSymbol}>{s.symbol}</span>
                    <span className={styles.suggestionName}>{s.name}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
          <button onClick={handleAnalyze} className={styles.searchBtn}>
            <Play size={16} fill="currentColor" /> <span>Analyser</span>
          </button>
        </div>

        <nav className={styles.headerNav} aria-label="Vues">
          <button className={vue === 'analyse' ? styles.navLinkActif : styles.navLink}
            aria-current={vue === 'analyse' ? 'page' : undefined} onClick={() => setVue('analyse')}>
            Analyse
          </button>
          <button className={vue === 'crible' ? styles.navLinkActif : styles.navLink}
            aria-current={vue === 'crible' ? 'page' : undefined} onClick={() => setVue('crible')}>
            Crible des marchés
          </button>
          <div className={styles.reglagesWrap}>
            <button className={styles.iconBtn} aria-label="Réglages" aria-expanded={reglagesOuverts}
              onClick={() => setReglagesOuverts((o) => !o)}>
              <Settings size={22} />
            </button>
            {reglagesOuverts && (
              <Reglages devise={devise} onDevise={setDevise} onFermer={() => setReglagesOuverts(false)} />
            )}
          </div>
        </nav>
      </header>

      <TickerCarousel />

      <main className={styles.container}>{contenu}</main>

      <footer className={styles.footer}>
        <span className={styles.prompt} aria-hidden="true">&gt;_</span>
        <span className={styles.footerText}>Données fournies par Yahoo Finance · yfinance · FRED · Banque Mondiale</span>
        <span className={styles.footerLogo}><LogoBarres taille={20} /></span>
      </footer>
    </div>
  );
};

export default StockDashboard;
