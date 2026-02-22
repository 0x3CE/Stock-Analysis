/**
 * Badge — Étiquette colorée pour secteur, marché ou devise.
 */
export const Badge = ({ label, color = '#3b82f6' }) => (
  <span style={{
    fontSize: '11px', fontWeight: '600', padding: '3px 10px', borderRadius: '20px',
    background: `${color}18`, color, border: `1px solid ${color}35`,
    fontFamily: 'DM Sans, sans-serif',
  }}>
    {label}
  </span>
);