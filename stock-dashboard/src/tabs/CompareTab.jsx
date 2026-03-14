import { useState, useCallback } from 'react';
import { Plus, X, TrendingUp, TrendingDown } from 'lucide-react';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';
const MAX_COMPARE = 3;

const CARD_STYLE = {
  background: '#111827', border: '1px solid #1e293b',
  borderRadius: '16px', padding: '24px',
};

const KPI_ROWS = [
  { key: 'current_price',  label: 'Prix actuel',       format: (v) => v != null ? `$${v}` : 'N/A' },
  { key: 'price_change',   label: 'Variation (%)',      format: (v) => v != null ? `${v > 0 ? '+' : ''}${v}%` : 'N/A' },
  { key: 'market_cap',     label: 'Market Cap (Mds$)',  format: (v) => v != null ? `$${v}B` : 'N/A' },
  { key: 'pe_ratio',       label: 'P/E Ratio',          format: (v) => v ?? 'N/A' },
  { key: 'dividend_yield', label: 'Dividend Yield',     format: (v) => v != null ? `${v}%` : 'N/A' },
  { key: 'eps',            label: 'EPS',                format: (v) => v != null ? `$${v}` : 'N/A' },
  { key: 'roe',            label: 'ROE',                format: (v) => v != null ? `${v}%` : 'N/A' },
  { key: 'beta',           label: 'Beta',               format: (v) => v ?? 'N/A' },
  { key: 'profit_margin',  label: 'Marge nette',        format: (v) => v != null ? `${v}%` : 'N/A' },
  { key: 'debt_to_equity', label: 'Debt / Equity',      format: (v) => v ?? 'N/A' },
  { key: 'current_ratio',  label: 'Current Ratio',      format: (v) => v ?? 'N/A' },
];

// Détermine si une valeur est "meilleure" (contexte: higher is better pour la plupart)
const HIGHER_IS_BETTER = new Set(['current_price', 'dividend_yield', 'eps', 'roe', 'profit_margin', 'current_ratio']);
const LOWER_IS_BETTER  = new Set(['pe_ratio', 'beta', 'debt_to_equity']);

function getColor(key, value, allValues) {
  const nums = allValues.filter((v) => v != null && !isNaN(v));
  if (nums.length < 2 || value == null) return '#94a3b8';
  const max = Math.max(...nums);
  const min = Math.min(...nums);
  if (HIGHER_IS_BETTER.has(key)) {
    if (value === max) return '#22c55e';
    if (value === min) return '#ef4444';
  }
  if (LOWER_IS_BETTER.has(key)) {
    if (value === min) return '#22c55e';
    if (value === max) return '#ef4444';
  }
  return '#94a3b8';
}

// ---------------------------------------------------------------------------
// AddTickerInput
// ---------------------------------------------------------------------------

const AddTickerInput = ({ onAdd, disabled }) => {
  const [value, setValue] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleAdd = useCallback(async () => {
    const symbol = value.trim().toUpperCase();
    if (!symbol) return;
    setLoading(true);
    setError(null);
    try {
      const resp = await fetch(`${API_URL}/api/analyze/${encodeURIComponent(symbol)}`);
      if (!resp.ok) {
        const body = await resp.json().catch(() => ({}));
        throw new Error(body.detail || 'Ticker introuvable');
      }
      const data = await resp.json();
      onAdd(data);
      setValue('');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [value, onAdd]);

  const handleKey = (e) => { if (e.key === 'Enter') handleAdd(); };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      <div style={{ display: 'flex', gap: '8px' }}>
        <input
          value={value}
          onChange={(e) => { setValue(e.target.value.toUpperCase()); setError(null); }}
          onKeyDown={handleKey}
          placeholder="Ex: MSFT, TSLA…"
          disabled={disabled || loading}
          style={{
            flex: 1, padding: '10px 16px',
            background: '#0d1117', border: `1px solid ${error ? '#ef4444' : '#21262d'}`,
            borderRadius: '10px', color: '#e2e8f0', fontSize: '13px',
            fontFamily: 'DM Mono, monospace', outline: 'none',
          }}
        />
        <button
          onClick={handleAdd}
          disabled={disabled || loading || !value.trim()}
          style={{
            display: 'flex', alignItems: 'center', gap: '6px',
            padding: '10px 16px', borderRadius: '10px', border: 'none',
            background: disabled || !value.trim() ? '#1e293b' : '#2563eb',
            color: disabled || !value.trim() ? '#475569' : '#fff',
            cursor: disabled || !value.trim() ? 'not-allowed' : 'pointer',
            fontSize: '13px', fontWeight: '600', fontFamily: 'DM Sans, sans-serif',
            transition: 'background 0.2s',
          }}
        >
          <Plus size={14} />
          {loading ? 'Chargement…' : 'Ajouter'}
        </button>
      </div>
      {error && (
        <span style={{ fontSize: '12px', color: '#ef4444', fontFamily: 'DM Sans, sans-serif' }}>
          {error}
        </span>
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------
// CompareTab
// ---------------------------------------------------------------------------

const CompareTab = ({ mainAnalysis }) => {
  const [compareList, setCompareList] = useState([]);

  const handleAdd = useCallback((analysis) => {
    setCompareList((prev) => {
      if (prev.find((a) => a.ticker === analysis.ticker)) return prev;
      return [...prev, analysis];
    });
  }, []);

  const handleRemove = (ticker) => {
    setCompareList((prev) => prev.filter((a) => a.ticker !== ticker));
  };

  const allAnalyses = [mainAnalysis, ...compareList];
  const canAdd = compareList.length < MAX_COMPARE;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px', animation: 'cardIn 0.4s ease forwards' }}>

      {/* Ajouter des tickers */}
      <div style={CARD_STYLE}>
        <h2 style={{ fontFamily: 'Syne, sans-serif', fontWeight: '700', fontSize: '17px',
          color: '#f1f5f9', marginBottom: '16px' }}>
          Ajouter des tickers à comparer
          <span style={{ fontSize: '12px', color: '#475569', fontWeight: '400',
            fontFamily: 'DM Mono, monospace', marginLeft: '12px' }}>
            ({compareList.length}/{MAX_COMPARE} ajoutés)
          </span>
        </h2>

        <AddTickerInput onAdd={handleAdd} disabled={!canAdd} />

        {!canAdd && (
          <p style={{ marginTop: '8px', fontSize: '12px', color: '#475569',
            fontFamily: 'DM Sans, sans-serif' }}>
            Maximum {MAX_COMPARE} tickers en comparaison. Supprimez-en un pour en ajouter un autre.
          </p>
        )}

        {/* Badges tickers comparés */}
        {compareList.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '16px' }}>
            {compareList.map((a) => (
              <div key={a.ticker} style={{
                display: 'flex', alignItems: 'center', gap: '6px',
                padding: '6px 12px', background: '#1e293b',
                borderRadius: '8px', border: '1px solid #334155',
              }}>
                <span style={{ fontFamily: 'DM Mono, monospace', fontWeight: '700',
                  color: '#60a5fa', fontSize: '13px' }}>
                  {a.ticker}
                </span>
                <span style={{ color: '#64748b', fontSize: '12px' }}>{a.name}</span>
                <button onClick={() => handleRemove(a.ticker)} style={{
                  background: 'none', border: 'none', cursor: 'pointer',
                  color: '#475569', display: 'flex', alignItems: 'center', padding: '0 2px',
                }}>
                  <X size={12} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Tableau de comparaison */}
      {allAnalyses.length > 0 && (
        <div style={{ ...CARD_STYLE, overflowX: 'auto' }}>
          <h2 style={{ fontFamily: 'Syne, sans-serif', fontWeight: '700', fontSize: '17px',
            color: '#f1f5f9', marginBottom: '20px' }}>
            Comparaison des KPIs
          </h2>

          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '500px' }}>
            <thead>
              <tr>
                <th style={{ textAlign: 'left', padding: '10px 16px', color: '#475569',
                  fontSize: '12px', fontFamily: 'DM Mono, monospace', fontWeight: '500',
                  borderBottom: '1px solid #1e293b', width: '160px' }}>
                  Indicateur
                </th>
                {allAnalyses.map((a, i) => (
                  <th key={a.ticker} style={{
                    textAlign: 'right', padding: '10px 16px',
                    borderBottom: '1px solid #1e293b',
                    background: i === 0 ? 'rgba(37,99,235,0.08)' : 'transparent',
                    borderRadius: i === 0 ? '8px 8px 0 0' : 0,
                  }}>
                    <div style={{ fontFamily: 'DM Mono, monospace', fontWeight: '700',
                      color: i === 0 ? '#60a5fa' : '#94a3b8', fontSize: '13px' }}>
                      {a.ticker}
                      {i === 0 && (
                        <span style={{ marginLeft: '6px', fontSize: '10px',
                          color: '#2563eb', fontWeight: '600' }}>
                          ACTUEL
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: '11px', color: '#475569',
                      fontFamily: 'DM Sans, sans-serif', fontWeight: '400',
                      whiteSpace: 'nowrap', overflow: 'hidden',
                      textOverflow: 'ellipsis', maxWidth: '120px' }}>
                      {a.name}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {KPI_ROWS.map(({ key, label, format }, rowIdx) => {
                const values = allAnalyses.map((a) => a.kpis?.[key] ?? null);
                return (
                  <tr key={key} style={{
                    background: rowIdx % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.01)',
                  }}>
                    <td style={{ padding: '12px 16px', color: '#64748b',
                      fontSize: '13px', fontFamily: 'DM Sans, sans-serif',
                      borderBottom: '1px solid #0f172a' }}>
                      {label}
                    </td>
                    {values.map((v, colIdx) => {
                      const color = getColor(key, v, values);
                      const isMain = colIdx === 0;
                      return (
                        <td key={colIdx} style={{
                          textAlign: 'right', padding: '12px 16px',
                          borderBottom: '1px solid #0f172a',
                          background: isMain ? 'rgba(37,99,235,0.04)' : 'transparent',
                        }}>
                          <span style={{
                            fontFamily: 'DM Mono, monospace', fontSize: '13px',
                            fontWeight: '600', color,
                          }}>
                            {format(v)}
                          </span>
                          {/* Flèche prix */}
                          {key === 'price_change' && v != null && (
                            <span style={{ marginLeft: '4px' }}>
                              {v >= 0
                                ? <TrendingUp size={12} color="#22c55e" />
                                : <TrendingDown size={12} color="#ef4444" />}
                            </span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}

              {/* Piotroski Score */}
              <tr style={{ background: 'rgba(37,99,235,0.04)' }}>
                <td style={{ padding: '12px 16px', color: '#64748b',
                  fontSize: '13px', fontFamily: 'DM Sans, sans-serif',
                  borderTop: '1px solid #1e293b', fontWeight: '600' }}>
                  Piotroski Score
                </td>
                {allAnalyses.map((a, i) => {
                  const score = a.piotroski_score?.total_score;
                  const color = score >= 7 ? '#22c55e' : score >= 4 ? '#f59e0b' : '#ef4444';
                  return (
                    <td key={i} style={{
                      textAlign: 'right', padding: '12px 16px',
                      borderTop: '1px solid #1e293b',
                      background: i === 0 ? 'rgba(37,99,235,0.04)' : 'transparent',
                    }}>
                      <span style={{ fontFamily: 'DM Mono, monospace', fontSize: '14px',
                        fontWeight: '700', color }}>
                        {score ?? 'N/A'}<span style={{ color: '#475569', fontWeight: '400' }}>/9</span>
                      </span>
                    </td>
                  );
                })}
              </tr>
            </tbody>
          </table>

          <p style={{ marginTop: '12px', fontSize: '11px', color: '#334155',
            fontFamily: 'DM Sans, sans-serif' }}>
            🟢 Meilleure valeur · 🔴 Moins bonne valeur · Gris = neutre ou non comparable
          </p>
        </div>
      )}

      {compareList.length === 0 && (
        <div style={{ ...CARD_STYLE, textAlign: 'center', padding: '48px' }}>
          <p style={{ color: '#334155', fontSize: '14px', fontFamily: 'DM Sans, sans-serif' }}>
            Ajoutez jusqu'à {MAX_COMPARE} tickers pour les comparer côte à côte.
          </p>
        </div>
      )}
    </div>
  );
};

export default CompareTab;
