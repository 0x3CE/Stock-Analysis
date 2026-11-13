import { getPiotroskiColor } from '../../utils/Formatters';
import styles from './PiotroskiGauge.module.css';

/**
 * PiotroskiGauge — Jauge demi-cercle SVG affichant le score Piotroski (0–9).
 */
export const PiotroskiGauge = ({ score, inconnus = 0, maxScore = 9 }) => {
  const colors = getPiotroskiColor(score, inconnus);
  const radius = 68;
  const cx = 88, cy = 88;
  const circumference = Math.PI * radius;
  const progress = score == null ? 0 : (score / maxScore) * circumference;
  // Avec des critères inconnus, le score réel est une fourchette : « 5–7 »
  const affiche = score == null ? '—' : inconnus > 0 ? `${score}–${score + inconnus}` : `${score}`;

  return (
    <div className={styles.wrapper}>
      <svg width="100%" viewBox="0 0 176 108">
        <path
          d={`M ${cx - radius},${cy} A ${radius},${radius} 0 0,1 ${cx + radius},${cy}`}
          fill="none" stroke="#263445" strokeWidth={10} strokeLinecap="round"
        />
        <path
          d={`M ${cx - radius},${cy} A ${radius},${radius} 0 0,1 ${cx + radius},${cy}`}
          fill="none" stroke={colors.text} strokeWidth={10} strokeLinecap="round"
          strokeDasharray={`${progress} ${circumference}`}
          style={{ filter: `drop-shadow(0 0 8px ${colors.text})` }}
        />
        <text x={cx} y={cy - 10} textAnchor="middle" fill={colors.text}
          fontSize={affiche.length > 2 ? 26 : 34} fontWeight="700" fontFamily="JetBrains Mono, ui-monospace, monospace">
          {affiche}
        </text>
        <text x={cx} y={cy + 12} textAnchor="middle" fill="#93A1B2"
          fontSize="13" fontFamily="JetBrains Mono, ui-monospace, monospace">
          / {maxScore}
        </text>
      </svg>
      <span className={styles.label} style={{ color: colors.text }}>
        {colors.label}
      </span>
    </div>
  );
};
