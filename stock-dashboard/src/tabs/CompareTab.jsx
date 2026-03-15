import { useState, useCallback } from 'react';
import { Plus, X, TrendingUp, TrendingDown } from 'lucide-react';
import styles from './CompareTab.module.css';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';
const MAX_COMPARE = 3;

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
  const [value, setValue]   = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError]   = useState(null);

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
      onAdd(await resp.json());
      setValue('');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [value, onAdd]);

  const handleKey = (e) => { if (e.key === 'Enter') handleAdd(); };

  return (
    <div>
      <div className={styles.inputRow}>
        <input
          value={value}
          onChange={(e) => { setValue(e.target.value.toUpperCase()); setError(null); }}
          onKeyDown={handleKey}
          placeholder="Ex: MSFT, TSLA…"
          disabled={disabled || loading}
          className={`${styles.input} ${error ? styles.inputError : ''}`}
        />
        <button
          onClick={handleAdd}
          disabled={disabled || loading || !value.trim()}
          className={styles.addBtn}
        >
          <Plus size={14} />
          {loading ? 'Chargement…' : 'Ajouter'}
        </button>
      </div>
      {error && <p className={styles.errorMsg}>{error}</p>}
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

  const handleRemove = (ticker) => setCompareList((prev) => prev.filter((a) => a.ticker !== ticker));

  const allAnalyses = [mainAnalysis, ...compareList];
  const canAdd = compareList.length < MAX_COMPARE;

  return (
    <div className={styles.layout}>

      {/* Section ajout */}
      <div className={styles.card}>
        <h2 className={styles.sectionTitle}>
          Ajouter des tickers à comparer
          <span className={styles.countBadge}>({compareList.length}/{MAX_COMPARE} ajoutés)</span>
        </h2>

        <AddTickerInput onAdd={handleAdd} disabled={!canAdd} />

        {!canAdd && (
          <p className={styles.limitMsg}>
            Maximum {MAX_COMPARE} tickers en comparaison. Supprimez-en un pour en ajouter un autre.
          </p>
        )}

        {compareList.length > 0 && (
          <div className={styles.tickerBadges}>
            {compareList.map((a) => (
              <div key={a.ticker} className={styles.tickerBadge}>
                <span className={styles.tickerSymbol}>{a.ticker}</span>
                <span className={styles.tickerName}>{a.name}</span>
                <button onClick={() => handleRemove(a.ticker)} className={styles.removeBtn}>
                  <X size={12} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Tableau de comparaison */}
      {allAnalyses.length > 0 && (
        <div className={styles.card}>
          <h2 className={styles.tableTitle}>Comparaison des KPIs</h2>
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th className={styles.thLabel}>Indicateur</th>
                  {allAnalyses.map((a, i) => (
                    <th key={a.ticker} className={i === 0 ? styles.thMain : styles.th}>
                      <div className={i === 0 ? styles.thTickerMain : styles.thTicker}>
                        {a.ticker}
                        {i === 0 && <span className={styles.thCurrentTag}>ACTUEL</span>}
                      </div>
                      <div className={styles.thName}>{a.name}</div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {KPI_ROWS.map(({ key, label, format }, rowIdx) => {
                  const values = allAnalyses.map((a) => a.kpis?.[key] ?? null);
                  return (
                    <tr key={key} className={rowIdx % 2 === 0 ? styles.trEven : styles.trOdd}>
                      <td className={styles.tdLabel}>{label}</td>
                      {values.map((v, colIdx) => (
                        <td key={colIdx} className={colIdx === 0 ? styles.tdMain : styles.td}>
                          <span className={styles.cellValue} style={{ color: getColor(key, v, values) }}>
                            {format(v)}
                          </span>
                          {key === 'price_change' && v != null && (
                            v >= 0
                              ? <TrendingUp size={12} color="#22c55e" style={{ marginLeft: 4 }} />
                              : <TrendingDown size={12} color="#ef4444" style={{ marginLeft: 4 }} />
                          )}
                        </td>
                      ))}
                    </tr>
                  );
                })}

                {/* Piotroski Score */}
                <tr className={styles.trPiotroski}>
                  <td className={styles.tdPiotroskiLabel}>Piotroski Score</td>
                  {allAnalyses.map((a, i) => {
                    const score = a.piotroski_score?.total_score;
                    const color = score >= 7 ? '#22c55e' : score >= 4 ? '#f59e0b' : '#ef4444';
                    return (
                      <td key={i} className={i === 0 ? styles.tdPiotroskiMain : styles.tdPiotroski}>
                        <span className={styles.piotroskiScore} style={{ color }}>
                          {score ?? 'N/A'}
                          <span className={styles.piotroskiMax}>/9</span>
                        </span>
                      </td>
                    );
                  })}
                </tr>
              </tbody>
            </table>
          </div>
          <p className={styles.tableLegend}>
            🟢 Meilleure valeur · 🔴 Moins bonne valeur · Gris = neutre ou non comparable
          </p>
        </div>
      )}

      {compareList.length === 0 && (
        <div className={styles.emptyCard}>
          <p className={styles.emptyText}>
            Ajoutez jusqu'à {MAX_COMPARE} tickers pour les comparer côte à côte.
          </p>
        </div>
      )}
    </div>
  );
};

export default CompareTab;
