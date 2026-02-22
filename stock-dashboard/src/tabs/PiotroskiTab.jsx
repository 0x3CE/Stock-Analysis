import { Award } from 'lucide-react';
import { PiotroskiGauge } from '../components/ui/PiotroskiGauge';
import { getPiotroskiColor } from '../utils/Formatters';

const CARD_STYLE = {
  background: '#111827', border: '1px solid #1e293b', borderRadius: '16px', padding: '24px',
};

/**
 * Carte individuelle pour un critère Piotroski.
 * Affiche le nom du critère, le score (✓/✗) et le détail chiffré.
 */
const CriterionCard = ({ criterion, score, detail }) => (
  <div style={{
    borderRadius: '10px', padding: '12px',
    background: score === 1 ? 'rgba(34,197,94,0.05)' : 'rgba(239,68,68,0.04)',
    border: `1px solid ${score === 1 ? 'rgba(34,197,94,0.2)' : 'rgba(239,68,68,0.12)'}`,
  }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
      <span style={{ color: '#cbd5e1', fontSize: '13px', fontFamily: 'DM Sans, sans-serif' }}>
        {criterion}
      </span>
      <span style={{
        fontSize: '11px', fontWeight: '700', padding: '2px 8px', borderRadius: '20px',
        background: score === 1 ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.15)',
        color: score === 1 ? '#22c55e' : '#ef4444',
        fontFamily: 'DM Mono, monospace',
      }}>
        {score === 1 ? '✓ OUI' : '✗ NON'}
      </span>
    </div>
    <div style={{ fontSize: '11px', color: '#475569', fontFamily: 'DM Mono, monospace' }}>
      {detail}
    </div>
  </div>
);

/**
 * PiotroskiTab — Affiche la jauge, l'interprétation et les 9 critères détaillés.
 */
const PiotroskiTab = ({ piotroski_score }) => {
  const pioColors = getPiotroskiColor(piotroski_score.total_score);

  const categories = [
    { title: 'Rentabilité',               color: '#3b82f6', items: piotroski_score.profitability, delay: 0.1  },
    { title: 'Levier / Liquidité',        color: '#8b5cf6', items: piotroski_score.leverage,      delay: 0.15 },
    { title: 'Efficacité Opérationnelle', color: '#22c55e', items: piotroski_score.operating,     delay: 0.2  },
  ];

  return (
    <div>
      {/* En-tête score global */}
      <div style={{
        ...CARD_STYLE,
        border: `1px solid ${pioColors.text}30`,
        marginBottom: '20px',
        animation: 'cardIn 0.4s ease 0.05s forwards', opacity: 0,
      }}>
        <div style={{ display: 'flex', flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: '32px' }}>
          <PiotroskiGauge score={piotroski_score.total_score} />

          <div style={{ flex: 1, minWidth: '200px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
              <Award size={20} style={{ color: '#f59e0b' }} />
              <h2 style={{ fontFamily: 'Syne, sans-serif', fontWeight: '700', fontSize: '18px', color: '#f1f5f9' }}>
                Piotroski F-Score
              </h2>
            </div>

            <p style={{ color: '#94a3b8', fontSize: '14px', lineHeight: '1.6', marginBottom: '16px' }}>
              {piotroski_score.interpretation}
            </p>

            {/* Mini résumé par catégorie */}
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              {categories.map(({ title, items }) => (
                <span key={title} style={{
                  fontSize: '11px', padding: '4px 10px', borderRadius: '20px',
                  background: '#1e293b', color: '#64748b', fontFamily: 'DM Mono, monospace',
                }}>
                  {title.split(' ')[0]} {items.filter(c => c.score === 1).length}/{items.length}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Détail des 3 catégories */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '16px' }}>
        {categories.map(({ title, color, items, delay }) => (
          <div key={title} style={{ ...CARD_STYLE, animation: `cardIn 0.4s ease ${delay}s forwards`, opacity: 0 }}>
            <h3 style={{
              fontFamily: 'Syne, sans-serif', fontWeight: '700', fontSize: '15px',
              color, marginBottom: '16px',
            }}>
              {title}
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {items.map((item, idx) => (
                <CriterionCard key={idx} {...item} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default PiotroskiTab;