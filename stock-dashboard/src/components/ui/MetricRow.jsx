/**
 * MetricRow — Ligne de métrique financière (libellé + valeur alignés).
 */
export const MetricRow = ({ label, value, valueColor }) => (
  <div style={{
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    padding: '10px 0', borderBottom: '1px solid #1a2332',
  }}>
    <span style={{ color: '#64748b', fontSize: '13px', fontFamily: 'DM Sans, sans-serif' }}>
      {label}
    </span>
    <span style={{
      color: valueColor || '#e2e8f0', fontSize: '13px',
      fontWeight: '600', fontFamily: 'DM Mono, monospace',
    }}>
      {value ?? 'N/A'}
    </span>
  </div>
);