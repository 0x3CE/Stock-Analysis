import { useState, useEffect } from 'react';
import { RefreshCw } from 'lucide-react';
import styles from './BuffettTab.module.css';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

// ---------------------------------------------------------------------------
// Jauge SVG demi-cercle
// ---------------------------------------------------------------------------

const BuffettGauge = ({ ratio, color }) => {
  const maxRatio = 200;
  const radius = 80;
  const cx = 100, cy = 100;
  const circumference = Math.PI * radius;
  const progress = (Math.min(ratio, maxRatio) / maxRatio) * circumference;
  const thresholdMarkers = [75, 100, 125, 150];

  return (
    <div className={styles.gaugeWrap}>
      <svg width="100%" viewBox="0 0 200 120">
        <path d={`M ${cx - radius},${cy} A ${radius},${radius} 0 0,1 ${cx + radius},${cy}`}
          fill="none" stroke="#1e293b" strokeWidth={12} strokeLinecap="round" />
        <path d={`M ${cx - radius},${cy} A ${radius},${radius} 0 0,1 ${cx + radius},${cy}`}
          fill="none" stroke={color} strokeWidth={12} strokeLinecap="round"
          strokeDasharray={`${progress} ${circumference}`}
          style={{ filter: `drop-shadow(0 0 10px ${color})`, transition: 'stroke-dasharray 1s ease' }} />
        {thresholdMarkers.map((t) => {
          const angle = (t / maxRatio) * Math.PI;
          return (
            <circle key={t}
              cx={cx - radius * Math.cos(angle)}
              cy={cy - radius * Math.sin(angle)}
              r={3} fill="#334155" stroke="#475569" strokeWidth={1} />
          );
        })}
        <text x={cx} y={cy - 12} textAnchor="middle" fill={color}
          fontSize="30" fontWeight="800" fontFamily="Syne, sans-serif">{ratio}%</text>
        <text x={cx} y={cy + 10} textAnchor="middle" fill="#475569"
          fontSize="11" fontFamily="DM Mono, monospace">MktCap / GDP</text>
      </svg>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Légende des seuils
// ---------------------------------------------------------------------------

const THRESHOLD_ITEMS = [
  { range: '< 75%',    label: 'Sous-évalué',           color: '#22c55e' },
  { range: '75–100%',  label: 'Correctement valorisé', color: '#60a5fa' },
  { range: '100–125%', label: 'Légèrement surévalué',  color: '#f59e0b' },
  { range: '125–150%', label: 'Fortement surévalué',   color: '#ef4444' },
  { range: '> 150%',   label: 'Extrêmement surévalué', color: '#dc2626' },
];

const ThresholdLegend = () => (
  <div className={styles.legend}>
    <p className={styles.legendTitle}>Grille d'interprétation</p>
    {THRESHOLD_ITEMS.map(({ range, label, color }) => (
      <div key={range} className={styles.legendItem}>
        <div className={styles.legendDot} style={{ background: color }} />
        <span className={styles.legendRange}>{range}</span>
        <span className={styles.legendLabel}>{label}</span>
      </div>
    ))}
  </div>
);

// ---------------------------------------------------------------------------
// Carte pays
// ---------------------------------------------------------------------------

const CountryCard = ({ data, isSelected, onClick }) => {
  if (data.error) return (
    <div className={styles.countryCardError}>
      <div className={styles.countryFlag}>{data.flag || '🌐'}</div>
      <div className={styles.countryErrorText}>{data.country} — Données indisponibles</div>
    </div>
  );

  return (
    <div
      onClick={onClick}
      className={styles.countryCard}
      style={{
        background:  isSelected ? `${data.color}12` : '#111827',
        border:      `1px solid ${isSelected ? `${data.color}50` : '#1e293b'}`,
        boxShadow:   isSelected ? `0 0 24px ${data.color}20` : 'none',
      }}
    >
      <div className={styles.countryHeader}>
        <div>
          <div className={styles.countryFlag}>{data.flag}</div>
          <div className={styles.countryName}>{data.country}</div>
        </div>
        <div className={styles.countryRatio} style={{ color: data.color, filter: `drop-shadow(0 0 8px ${data.color}60)` }}>
          {data.ratio}%
        </div>
      </div>

      <div
        className={styles.countryLabel}
        style={{ background: `${data.color}20`, color: data.color, border: `1px solid ${data.color}40` }}
      >
        {data.label}
      </div>

      <div className={styles.countryStats}>
        {[['Market Cap', `${data.market_cap}${data.unit}`], ['GDP', `${data.gdp}${data.unit}`]].map(([lbl, val]) => (
          <div key={lbl} className={styles.statItem}>
            <div className={styles.statLabel}>{lbl}</div>
            <div className={styles.statValue}>{val}</div>
          </div>
        ))}
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// BuffettTab
// ---------------------------------------------------------------------------

const BuffettTab = () => {
  const [data, setData]         = useState(null);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState(null);
  const [selected, setSelected] = useState(0);

  const load = async () => {
    setLoading(true); setError(null);
    try {
      const resp = await fetch(`${API_URL}/api/buffett-indicator`);
      if (!resp.ok) throw new Error('Erreur récupération');
      setData(await resp.json());
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  if (loading) return (
    <div className={styles.layout}>
      {[...Array(3)].map((_, i) => (
        <div key={i} className={styles.skeleton} style={{ height: '100px' }} />
      ))}
    </div>
  );

  if (error) return (
    <div className={styles.errorCard}>
      <p className={styles.errorText}>{error}</p>
      <button onClick={load} className={styles.retryBtn}>
        <RefreshCw size={14} /> Réessayer
      </button>
    </div>
  );

  if (!data) return null;

  const countries  = data.countries || [];
  const validData  = countries.filter(c => !c.error);
  const activeData = countries[selected];

  return (
    <div className={styles.layout}>

      {/* En-tête */}
      <div className={styles.cardAnimated} style={{ animation: 'cardIn 0.4s ease forwards' }}>
        <div className={styles.headerInner}>
          <div>
            <h2 className={styles.headerTitle}>Buffett Indicator</h2>
            <p className={styles.headerDesc}>
              Popularisé par Warren Buffett, cet indicateur rapporte la capitalisation boursière totale
              d'un marché à son PIB pour évaluer si ce marché est globalement sur- ou sous-évalué.
            </p>
          </div>
          <button onClick={load} className={styles.refreshBtn}>
            <RefreshCw size={12} /> Actualiser
          </button>
        </div>
      </div>

      {/* Grille des pays */}
      <div className={styles.countriesGrid}>
        {countries.map((c, idx) => (
          <CountryCard key={idx} data={c} isSelected={selected === idx}
            onClick={() => !c.error && setSelected(idx)} />
        ))}
      </div>

      {/* Détail pays sélectionné */}
      {activeData && !activeData.error && (
        <div className={styles.detailGrid}>

          {/* Jauge + interprétation */}
          <div className={styles.cardAnimated} style={{ animation: 'cardIn 0.4s ease 0.1s forwards' }}>
            <h3 className={styles.detailGaugeTitle}>{activeData.flag} {activeData.country}</h3>
            <BuffettGauge ratio={activeData.ratio} color={activeData.color} />
            <div
              className={styles.interpretation}
              style={{ background: `${activeData.color}10`, border: `1px solid ${activeData.color}25` }}
            >
              <div className={styles.interpretationLabel} style={{ color: activeData.color }}>
                {activeData.label}
              </div>
              <p className={styles.interpretationText}>{activeData.message}</p>
            </div>
            <div className={styles.source}>Source : {activeData.source}</div>
          </div>

          {/* Légende + barres de comparaison */}
          <div className={`${styles.cardAnimated} ${styles.detailPanel}`}
            style={{ animation: 'cardIn 0.4s ease 0.15s forwards' }}>
            <ThresholdLegend />
            {validData.length > 1 && (
              <div className={styles.compareSection}>
                <p className={styles.compareTitle}>Comparaison</p>
                {validData.map((c) => (
                  <div key={c.country} className={styles.compareBar}>
                    <span className={styles.compareFlag}>{c.flag}</span>
                    <div className={styles.compareTrack}>
                      <div
                        className={styles.compareFill}
                        style={{
                          width: `${Math.min((c.ratio / 200) * 100, 100)}%`,
                          background: c.color,
                          boxShadow: `0 0 6px ${c.color}60`,
                        }}
                      />
                    </div>
                    <span className={styles.compareRatio} style={{ color: c.color }}>{c.ratio}%</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default BuffettTab;
