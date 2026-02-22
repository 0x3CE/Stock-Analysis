import { LineChart, Line, ResponsiveContainer } from 'recharts';

/**
 * MiniSparkline — Courbe minimaliste intégrée dans une KpiCard.
 */
const MiniSparkline = ({ data, dataKey, color }) => (
  <ResponsiveContainer width="100%" height={36}>
    <LineChart data={data}>
      <Line type="monotone" dataKey={dataKey} stroke={color} strokeWidth={1.5} dot={false} />
    </LineChart>
  </ResponsiveContainer>
);

/**
 * KpiCard — Carte indicateur avec libellé, icône, valeur colorisée et sparkline optionnelle.
 * La hauteur est fixe (120px) pour aligner toutes les cards entre elles.
 */
export const KpiCard = ({
  label, value, icon: Icon, iconColor,
  sparkData, sparkKey, sparkColor,
  valueColor, delay = 0,
}) => (
  <div style={{
    background: 'rgba(17,24,39,0.8)', border: '1px solid #1e293b',
    borderRadius: '14px', padding: '20px',
    height: '120px', display: 'flex', flexDirection: 'column',
    transition: 'transform 0.2s, border-color 0.2s, box-shadow 0.2s',
    animation: `cardIn 0.4s ease ${delay}s forwards`, opacity: 0,
  }}
    onMouseEnter={(e) => {
      e.currentTarget.style.transform = 'translateY(-2px)';
      e.currentTarget.style.borderColor = '#334155';
      e.currentTarget.style.boxShadow = '0 8px 24px rgba(0,0,0,0.4)';
    }}
    onMouseLeave={(e) => {
      e.currentTarget.style.transform = 'translateY(0)';
      e.currentTarget.style.borderColor = '#1e293b';
      e.currentTarget.style.boxShadow = 'none';
    }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
      <span style={{
        fontSize: '11px', color: '#64748b', textTransform: 'uppercase',
        letterSpacing: '0.1em', fontFamily: 'DM Sans, sans-serif',
      }}>
        {label}
      </span>
      <div style={{ background: '#1e293b', borderRadius: '8px', padding: '6px' }}>
        <Icon className={iconColor} size={14} />
      </div>
    </div>

    <div style={{
      fontSize: '24px', fontWeight: '700',
      fontFamily: 'Syne, sans-serif', color: valueColor || '#f1f5f9',
    }}>
      {value}
    </div>

    {sparkData && sparkData.length > 1 && (
      <div style={{ marginTop: 'auto' }}>
        <MiniSparkline data={sparkData} dataKey={sparkKey} color={sparkColor || '#3b82f6'} />
      </div>
    )}
  </div>
);