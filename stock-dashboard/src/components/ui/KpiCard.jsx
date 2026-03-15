import { LineChart, Line, ResponsiveContainer } from 'recharts';
import styles from './KpiCard.module.css';

const MiniSparkline = ({ data, dataKey, color }) => (
  <ResponsiveContainer width="100%" height={36}>
    <LineChart data={data}>
      <Line type="monotone" dataKey={dataKey} stroke={color} strokeWidth={1.5} dot={false} />
    </LineChart>
  </ResponsiveContainer>
);

/**
 * KpiCard — Carte indicateur avec libellé, icône, valeur colorisée et sparkline optionnelle.
 */
export const KpiCard = ({
  label, value, icon: Icon, iconColor,
  sparkData, sparkKey, sparkColor,
  valueColor, delay = 0,
}) => (
  <div className={styles.card} style={{ animationDelay: `${delay}s` }}>
    <div className={styles.header}>
      <span className={styles.label}>{label}</span>
      <div className={styles.iconWrap}>
        <Icon className={iconColor} size={14} />
      </div>
    </div>

    <div className={styles.value} style={valueColor ? { color: valueColor } : undefined}>
      {value}
    </div>

    {sparkData && sparkData.length > 1 && (
      <div className={styles.sparkline}>
        <MiniSparkline data={sparkData} dataKey={sparkKey} color={sparkColor || '#3b82f6'} />
      </div>
    )}
  </div>
);
