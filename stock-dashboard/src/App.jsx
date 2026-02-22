/**
 * App.jsx — Shell principal du StockDashboard.
 *
 * Responsabilités :
 * - Barre de recherche avec autocomplete
 * - En-tête société (nom, prix, variation)
 * - Navigation par onglets
 * - Routing vers les onglets : Overview, Financials, Piotroski, Buffett
 *
 * Chaque onglet est isolé dans src/tabs/.
 * Les composants réutilisables sont dans src/components/ui/.
 * Les utilitaires sont dans src/utils/formatters.js.
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { TrendingUp, TrendingDown, Layers, BarChart3, Award, TrendingUp as BuffettIcon } from 'lucide-react';

import { useIsMobile }       from './hooks/Useismobile';
import { Badge }             from './components/ui/Badge';
import { SECTOR_COLORS, getCurrencySymbol } from './utils/Formatters';

import OverviewTab   from './tabs/OverviewTab';
import FinancialsTab from './tabs/FinancialsTab';
import PiotroskiTab  from './tabs/PiotroskiTab';
import BuffettTab    from './tabs/BuffettTab';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';
const SEARCH_DEBOUNCE_MS = 350;

// ---------------------------------------------------------------------------
// Skeleton Loader
// ---------------------------------------------------------------------------

const SkeletonBlock = ({ style = {} }) => (
  <div style={{
    background: 'rgba(255,255,255,0.05)', borderRadius: '12px',
    animation: 'pulse 1.5s ease infinite', ...style,
  }} />
);

const SkeletonDashboard = () => (
  <div style={{ minHeight: '100vh', background: '#0b0f1a', padding: '32px 24px' }}>
    <div style={{ maxWidth: '1280px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '24px' }}>
      <SkeletonBlock style={{ height: '48px', width: '320px' }} />
      <SkeletonBlock style={{ height: '100px', width: '400px' }} />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px' }}>
        {[...Array(4)].map((_, i) => <SkeletonBlock key={i} style={{ height: '120px' }} />)}
      </div>
      <SkeletonBlock style={{ height: '300px' }} />
    </div>
  </div>
);

// ---------------------------------------------------------------------------
// TabBar
// ---------------------------------------------------------------------------

const TABS = [
  { id: 'overview',   label: "Vue d'ensemble", icon: Layers },
  { id: 'financials', label: 'Financiers',     icon: BarChart3 },
  { id: 'piotroski',  label: 'Piotroski',      icon: Award },
  { id: 'buffett',    label: 'Buffett',         icon: BuffettIcon },
];

const TabBar = ({ active, onChange }) => (
  <div style={{
    display: 'flex', gap: '4px', background: '#0d1117',
    borderRadius: '14px', padding: '5px',
    border: '1px solid #1e293b', marginBottom: '32px',
  }}>
    {TABS.map(({ id, label, icon: Icon }) => {
      const isActive = active === id;
      return (
        <button key={id} onClick={() => onChange(id)} style={{
          flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
          padding: '10px 16px', borderRadius: '10px', border: 'none', cursor: 'pointer',
          fontFamily: 'DM Sans, sans-serif', fontSize: '13px', fontWeight: '600',
          transition: 'all 0.2s',
          background: isActive ? '#2563eb' : 'transparent',
          color:      isActive ? '#fff'     : '#64748b',
          boxShadow:  isActive ? '0 4px 14px rgba(37,99,235,0.3)' : 'none',
        }}>
          <Icon size={14} />
          <span>{label}</span>
        </button>
      );
    })}
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

  useEffect(() => {
    fetchAnalysis(ticker);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  // ── États spéciaux ───────────────────────────────────────────────────────

  if (loading) return <SkeletonDashboard />;

  if (error) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center',
      height: '100vh', background: '#0b0f1a' }}>
      <div style={{
        background: 'rgba(127,29,29,0.3)', border: '1px solid rgba(239,68,68,0.3)',
        borderRadius: '16px', padding: '40px', maxWidth: '400px', textAlign: 'center',
      }}>
        <div style={{ color: '#f87171', fontSize: '18px', fontWeight: '700',
          fontFamily: 'Syne, sans-serif', marginBottom: '10px' }}>
          Erreur de chargement
        </div>
        <div style={{ color: 'rgba(248,113,113,0.7)', fontSize: '14px',
          marginBottom: '24px', fontFamily: 'DM Sans, sans-serif' }}>
          {error}
        </div>
        <button onClick={() => { setError(null); fetchAnalysis(ticker); }}
          style={{
            padding: '10px 24px', background: '#dc2626', color: '#fff',
            border: 'none', borderRadius: '10px', cursor: 'pointer',
            fontFamily: 'DM Sans, sans-serif', fontWeight: '600',
          }}>
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
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Syne:wght@400;600;700;800&family=DM+Sans:opsz,wght@9..40,300;9..40,400;9..40,500;9..40,600&family=DM+Mono:wght@400;500&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { background: #0b0f1a !important; }
        @keyframes cardIn {
          from { opacity: 0; transform: translateY(10px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50%       { opacity: 0.4; }
        }
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-track { background: #0b0f1a; }
        ::-webkit-scrollbar-thumb { background: #1e293b; border-radius: 4px; }
      `}</style>

      <div style={{ minHeight: '100vh', background: '#0b0f1a', color: '#e2e8f0',
        fontFamily: 'DM Sans, sans-serif' }}>
        <div style={{ maxWidth: '1280px', margin: '0 auto', padding: '32px 24px' }}>

          {/* ── Barre de recherche ──────────────────────────────── */}
          <div style={{ position: 'relative', marginBottom: '40px' }}>
            <div style={{ display: 'flex', gap: '12px' }}>
              <div style={{ position: 'relative', flex: 1 }}>
                <input
                  type="text" value={ticker}
                  onChange={handleTickerChange} onKeyDown={handleKeyDown}
                  placeholder="Ticker ou nom de société…"
                  style={{
                    width: '100%', padding: '14px 20px',
                    background: '#0d1117', border: '1px solid #21262d',
                    borderRadius: '12px', color: '#e2e8f0', fontSize: '14px',
                    fontFamily: 'DM Mono, monospace', outline: 'none',
                    transition: 'border-color 0.2s',
                  }}
                  onFocus={(e) => e.target.style.borderColor = '#2563eb'}
                  onBlur={(e)  => e.target.style.borderColor = '#21262d'}
                />

                {(suggestions.length > 0 || suggestionsLoading) && (
                  <div style={{
                    position: 'absolute', top: 'calc(100% + 8px)', left: 0, right: 0, zIndex: 50,
                    background: '#0d1117', border: '1px solid #21262d', borderRadius: '12px',
                    overflow: 'hidden', boxShadow: '0 16px 40px rgba(0,0,0,0.6)',
                  }}>
                    {suggestionsLoading && (
                      <div style={{ padding: '12px 16px', color: '#475569', fontSize: '13px' }}>
                        Recherche…
                      </div>
                    )}
                    {suggestions.map((s, idx) => (
                      <div key={idx} onMouseDown={(e) => handleSuggestion(e, s.symbol)}
                        style={{
                          padding: '12px 16px', cursor: 'pointer',
                          display: 'flex', alignItems: 'center', gap: '12px',
                          borderBottom: '1px solid #161b22', transition: 'background 0.15s',
                        }}
                        onMouseEnter={(e) => e.currentTarget.style.background = '#161b22'}
                        onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}>
                        <span style={{ fontFamily: 'DM Mono, monospace', fontWeight: '700',
                          color: '#60a5fa', fontSize: '13px', width: '60px', flexShrink: 0 }}>
                          {s.symbol}
                        </span>
                        <span style={{ color: '#94a3b8', fontSize: '13px',
                          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {s.name}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <button onClick={handleAnalyze} style={{
                padding: '14px 28px',
                background: 'linear-gradient(135deg, #2563eb, #1d4ed8)',
                color: '#fff', border: 'none', borderRadius: '12px', cursor: 'pointer',
                fontWeight: '600', fontSize: '14px', fontFamily: 'DM Sans, sans-serif',
                boxShadow: '0 4px 14px rgba(37,99,235,0.3)', transition: 'transform 0.2s',
              }}
                onMouseEnter={(e) => e.target.style.transform = 'translateY(-1px)'}
                onMouseLeave={(e) => e.target.style.transform = 'translateY(0)'}>
                Analyser
              </button>
            </div>
          </div>

          {/* Affichage uniquement si une analyse est chargée */}
          {analysis && (
            <>
              {/* ── En-tête société ──────────────────────────────── */}
              <div style={{ marginBottom: '32px', animation: 'cardIn 0.4s ease forwards' }}>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '12px' }}>
                  {sector  && <Badge label={sector}   color={sectorColor} />}
                  {market  && <Badge label={market}   color="#64748b" />}
                  <Badge label={currency} color="#6366f1" />
                </div>

                <h1 style={{
                  fontSize: 'clamp(28px, 5vw, 52px)', fontWeight: '800',
                  fontFamily: 'Syne, sans-serif', color: '#f8fafc',
                  marginBottom: '12px', lineHeight: 1.1,
                }}>
                  {name}
                </h1>

                <div style={{ display: 'flex', alignItems: 'baseline', gap: '16px', flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 'clamp(32px, 6vw, 60px)', fontWeight: '700',
                    fontFamily: 'Syne, sans-serif', color: '#f8fafc' }}>
                    {currencySymbol}{kpis.current_price}
                  </span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '6px',
                    fontSize: '20px', fontWeight: '600',
                    color: pricePositive ? '#22c55e' : '#ef4444' }}>
                    {pricePositive ? <TrendingUp size={20} /> : <TrendingDown size={20} />}
                    {pricePositive ? '+' : ''}{kpis.price_change}%
                  </span>
                </div>
              </div>

              {/* ── Navigation ──────────────────────────────────── */}
              <TabBar active={activeTab} onChange={setActiveTab} />

              {/* ── Onglets ─────────────────────────────────────── */}
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
              {activeTab === 'buffett' && (
                <BuffettTab />
              )}
            </>
          )}

          {/* Footer */}
          <div style={{ marginTop: '48px', paddingBottom: '24px', textAlign: 'center',
            color: '#1e293b', fontSize: '12px', fontFamily: 'DM Mono, monospace' }}>
            Données fournies par Yahoo Finance · yfinance · FRED · Banque Mondiale
          </div>
        </div>
      </div>
    </>
  );
};

export default StockDashboard;