import { getPiotroskiColor } from '../../utils/Formatters';
import styles from './PiotroskiGauge.module.css';

/**
 * PiotroskiGauge — Jauge demi-cercle SVG affichant le score Piotroski (0–9).
 */
export const PiotroskiGauge = ({ score, maxScore = 9 }) => {
  const colors = getPiotroskiColor(score);
  const radius = 68;
  const cx = 88, cy = 88;
  const circumference = Math.PI * radius;
  const progress = (score / maxScore) * circumference;

  return (
    <div className={styles.wrapper}>
      <svg width="176" height="108" viewBox="0 0 176 108">
        <path
          d={`M ${cx - radius},${cy} A ${radius},${radius} 0 0,1 ${cx + radius},${cy}`}
          fill="none" stroke="#1e293b" strokeWidth={10} strokeLinecap="round"
        />
        <path
          d={`M ${cx - radius},${cy} A ${radius},${radius} 0 0,1 ${cx + radius},${cy}`}
          fill="none" stroke={colors.text} strokeWidth={10} strokeLinecap="round"
          strokeDasharray={`${progress} ${circumference}`}
          style={{ filter: `drop-shadow(0 0 8px ${colors.text})` }}
        />
        <text x={cx} y={cy - 10} textAnchor="middle" fill={colors.text}
          fontSize="34" fontWeight="700" fontFamily="Syne, sans-serif">
          {score}
        </text>
        <text x={cx} y={cy + 12} textAnchor="middle" fill="#475569"
          fontSize="13" fontFamily="DM Sans, sans-serif">
          / {maxScore}
        </text>
      </svg>
      <span className={styles.label} style={{ color: colors.text }}>
        {colors.label}
      </span>
    </div>
  );
};
