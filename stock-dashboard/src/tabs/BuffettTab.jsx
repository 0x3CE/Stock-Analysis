/**
 * BuffettTab — Buffett Indicator (Market Cap / GDP) pour US, Zone Euro, UK, Japon.
 * Données : FRED API (US) + Banque Mondiale (autres pays).
 */

import { useState, useEffect } from 'react';
import { RefreshCw } from 'lucide-react';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

const CARD_STYLE = {
  background: '#111827', border: '1px solid #1e293b', borderRadius: '16px', padding: '24px',
};

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
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      <svg width="200" height="120" viewBox="0 0 200 120">
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

const ThresholdLegend = () => {
  const items = [
    { range: '< 75%',    label: 'Sous-évalué',           color: '#22c55e' },
    { range: '75–100%',  label: 'Correctement valorisé', color: '#60a5fa' },
    { range: '100–125%', label: 'Légèrement surévalué',  color: '#f59e0b' },
    { range: '125–150%', label: 'Fortement surévalué',   color: '#ef4444' },
    { range: '> 150%',   label: 'Extrêmement surévalué', color: '#dc2626' },
  ];
  return (
    <div style={{
      background: '#0d1117', border: '1px solid #1e293b',
      borderRadius: '12px', padding: '16px',
    }}>
      <p style={{
        fontSize: '11px', color: '#475569', fontFamily: 'DM Mono, monospace',
        textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '12px',
      }}>
        Grille d'interprétation
      </p>
      {items.map(({ range, label, color }) => (
        <div key={range} style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
          <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: color, flexShrink: 0 }} />
          <span style={{ fontSize: '12px', fontFamily: 'DM Mono, monospace', color: '#64748b', width: '80px' }}>{range}</span>
          <span style={{ fontSize: '12px', fontFamily: 'DM Sans, sans-serif', color: '#94a3b8' }}>{label}</span>
        </div>
      ))}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Carte pays
// ---------------------------------------------------------------------------

const CountryCard = ({ data, isSelected, onClick }) => {
  if (data.error) return (
    <div style={{ ...CARD_STYLE, opacity: 0.4, cursor: 'not-allowed' }}>
      <div style={{ fontSize: '24px', marginBottom: '8px' }}>{data.flag || '🌐'}</div>
      <div style={{ color: '#64748b', fontSize: '13px', fontFamily: 'DM Sans, sans-serif' }}>
        {data.country} — Données indisponibles
      </div>
    </div>
  );

  return (
    <div onClick={onClick} style={{
      background: isSelected ? `${data.color}12` : '#111827',
      border: `1px solid ${isSelected ? `${data.color}50` : '#1e293b'}`,
      borderRadius: '16px', padding: '24px', cursor: 'pointer',
      transition: 'all 0.2s',
      boxShadow: isSelected ? `0 0 24px ${data.color}20` : 'none',
      animation: 'cardIn 0.4s ease forwards', opacity: 0,
    }}
      onMouseEnter={(e) => { if (!isSelected) e.currentTarget.style.borderColor = '#334155'; }}
      onMouseLeave={(e) => { if (!isSelected) e.currentTarget.style.borderColor = '#1e293b'; }}>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
        <div>
          <span style={{ fontSize: '28px' }}>{data.flag}</span>
          <div style={{ fontSize: '14px', fontWeight: '600', color: '#e2e8f0',
            fontFamily: 'Syne, sans-serif', marginTop: '6px' }}>{data.country}</div>
        </div>
        <div style={{ fontSize: '28px', fontWeight: '800', fontFamily: 'Syne, sans-serif',
          color: data.color, filter: `drop-shadow(0 0 8px ${data.color}60)` }}>
          {data.ratio}%
        </div>
      </div>

      <div style={{
        display: 'inline-block', fontSize: '11px', fontWeight: '700',
        padding: '3px 10px', borderRadius: '20px', fontFamily: 'DM Sans, sans-serif',
        background: `${data.color}20`, color: data.color, border: `1px solid ${data.color}40`,
        marginBottom: '14px',
      }}>
        {data.label}
      </div>

      <div style={{ display: 'flex', gap: '20px' }}>
        {[['Market Cap', `${data.market_cap}${data.unit}`], ['GDP', `${data.gdp}${data.unit}`]].map(([lbl, val]) => (
          <div key={lbl}>
            <div style={{ fontSize: '10px', color: '#475569', fontFamily: 'DM Mono, monospace',
              textTransform: 'uppercase', letterSpacing: '0.1em' }}>{lbl}</div>
            <div style={{ fontSize: '14px', fontWeight: '600', color: '#94a3b8',
              fontFamily: 'DM Mono, monospace' }}>{val}</div>
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
  const [data, setData]       = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(null);
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
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {[...Array(3)].map((_, i) => (
        <div key={i} style={{ ...CARD_STYLE, height: '100px', background: 'rgba(255,255,255,0.03)' }} />
      ))}
    </div>
  );

  if (error) return (
    <div style={{ ...CARD_STYLE, textAlign: 'center', padding: '48px' }}>
      <p style={{ color: '#ef4444', marginBottom: '16px', fontFamily: 'DM Sans, sans-serif' }}>{error}</p>
      <button onClick={load} style={{
        padding: '10px 20px', background: '#1e293b', color: '#e2e8f0',
        border: 'none', borderRadius: '10px', cursor: 'pointer',
        fontFamily: 'DM Sans, sans-serif', display: 'inline-flex', alignItems: 'center', gap: '8px',
      }}>
        <RefreshCw size={14} /> Réessayer
      </button>
    </div>
  );

  if (!data) return null;

  const countries   = data.countries || [];
  const validData   = countries.filter(c => !c.error);
  const activeData  = countries[selected];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>

      {/* En-tête */}
      <div style={{ ...CARD_STYLE, animation: 'cardIn 0.4s ease forwards', opacity: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '12px' }}>
          <div>
            <h2 style={{ fontFamily: 'Syne, sans-serif', fontWeight: '800', fontSize: '20px', color: '#f1f5f9', marginBottom: '8px' }}>
              Buffett Indicator
            </h2>
            <p style={{ color: '#64748b', fontSize: '13px', fontFamily: 'DM Sans, sans-serif', maxWidth: '600px', lineHeight: '1.6' }}>
              Popularisé par Warren Buffett, cet indicateur rapporte la capitalisation boursière totale
              d'un marché à son PIB pour évaluer si ce marché est globalement sur- ou sous-évalué.
            </p>
          </div>
          <button onClick={load} style={{
            padding: '8px 14px', background: '#1e293b', color: '#64748b',
            border: '1px solid #334155', borderRadius: '10px', cursor: 'pointer',
            fontFamily: 'DM Sans, sans-serif', fontSize: '12px',
            display: 'inline-flex', alignItems: 'center', gap: '6px', transition: 'color 0.2s',
          }}
            onMouseEnter={(e) => e.currentTarget.style.color = '#e2e8f0'}
            onMouseLeave={(e) => e.currentTarget.style.color = '#64748b'}>
            <RefreshCw size={12} /> Actualiser
          </button>
        </div>
      </div>

      {/* Grille des pays */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px' }}>
        {countries.map((c, idx) => (
          <CountryCard key={idx} data={c} isSelected={selected === idx}
            onClick={() => !c.error && setSelected(idx)} />
        ))}
      </div>

      {/* Détail pays sélectionné */}
      {activeData && !activeData.error && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px' }}>

          {/* Jauge + interprétation */}
          <div style={{ ...CARD_STYLE, animation: 'cardIn 0.4s ease 0.1s forwards', opacity: 0 }}>
            <h3 style={{ fontFamily: 'Syne, sans-serif', fontWeight: '700', fontSize: '15px',
              color: '#f1f5f9', marginBottom: '20px' }}>
              {activeData.flag} {activeData.country}
            </h3>
            <BuffettGauge ratio={activeData.ratio} color={activeData.color} />
            <div style={{
              marginTop: '20px', padding: '14px', borderRadius: '10px',
              background: `${activeData.color}10`, border: `1px solid ${activeData.color}25`,
            }}>
              <div style={{ fontSize: '13px', fontWeight: '600', color: activeData.color,
                fontFamily: 'Syne, sans-serif', marginBottom: '6px' }}>{activeData.label}</div>
              <p style={{ fontSize: '13px', color: '#94a3b8', fontFamily: 'DM Sans, sans-serif',
                lineHeight: '1.6', margin: 0 }}>
                {activeData.message}
              </p>
            </div>
            <div style={{ marginTop: '12px', fontSize: '10px', color: '#334155',
              fontFamily: 'DM Mono, monospace', textAlign: 'right' }}>
              Source : {activeData.source}
            </div>
          </div>

          {/* Légende + barres de comparaison */}
          <div style={{ ...CARD_STYLE, animation: 'cardIn 0.4s ease 0.15s forwards', opacity: 0,
            display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
            <ThresholdLegend />
            {validData.length > 1 && (
              <div style={{ marginTop: '20px' }}>
                <p style={{ fontSize: '11px', color: '#475569', fontFamily: 'DM Mono, monospace',
                  textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '12px' }}>
                  Comparaison
                </p>
                {validData.map((c) => (
                  <div key={c.country} style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
                    <span style={{ fontSize: '16px', width: '24px' }}>{c.flag}</span>
                    <div style={{ flex: 1, height: '6px', background: '#1e293b', borderRadius: '3px', overflow: 'hidden' }}>
                      <div style={{
                        height: '100%', borderRadius: '3px',
                        width: `${Math.min((c.ratio / 200) * 100, 100)}%`,
                        background: c.color, transition: 'width 1s ease',
                        boxShadow: `0 0 6px ${c.color}60`,
                      }} />
                    </div>
                    <span style={{ fontSize: '12px', fontFamily: 'DM Mono, monospace',
                      color: c.color, width: '48px', textAlign: 'right' }}>
                      {c.ratio}%
                    </span>
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