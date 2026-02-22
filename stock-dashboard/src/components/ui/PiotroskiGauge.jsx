import { getPiotroskiColor } from '../../utils/Formatters';

/**
 * PiotroskiGauge — Jauge demi-cercle SVG affichant le score Piotroski (0–9).
 * La couleur et le label s'adaptent automatiquement au score.
 */
export const PiotroskiGauge = ({ score, maxScore = 9 }) => {
  const colors = getPiotroskiColor(score);
  const radius = 68;
  const cx = 88, cy = 88;
  const circumference = Math.PI * radius;
  const progress = (score / maxScore) * circumference;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      <svg width="176" height="108" viewBox="0 0 176 108">
        {/* Arc de fond */}
        <path
          d={`M ${cx - radius},${cy} A ${radius},${radius} 0 0,1 ${cx + radius},${cy}`}
          fill="none" stroke="#1e293b" strokeWidth={10} strokeLinecap="round"
        />
        {/* Arc de progression */}
        <path
          d={`M ${cx - radius},${cy} A ${radius},${radius} 0 0,1 ${cx + radius},${cy}`}
          fill="none" stroke={colors.text} strokeWidth={10} strokeLinecap="round"
          strokeDasharray={`${progress} ${circumference}`}
          style={{ filter: `drop-shadow(0 0 8px ${colors.text})` }}
        />
        {/* Score */}
        <text x={cx} y={cy - 10} textAnchor="middle" fill={colors.text}
          fontSize="34" fontWeight="700" fontFamily="Syne, sans-serif">
          {score}
        </text>
        <text x={cx} y={cy + 12} textAnchor="middle" fill="#475569"
          fontSize="13" fontFamily="DM Sans, sans-serif">
          / {maxScore}
        </text>
      </svg>
      <span style={{
        color: colors.text, fontSize: '12px', fontWeight: '700',
        letterSpacing: '0.15em', fontFamily: 'Syne, sans-serif',
      }}>
        {colors.label}
      </span>
    </div>
  );
};