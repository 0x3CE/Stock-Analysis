import styles from './MetricRow.module.css';

/**
 * MetricRow — Ligne de métrique financière (libellé + valeur alignés).
 */
export const MetricRow = ({ label, value, valueColor }) => (
  <div className={styles.row}>
    <span className={styles.label}>{label}</span>
    <span className={styles.value} style={valueColor ? { color: valueColor } : undefined}>
      {value ?? 'N/A'}
    </span>
  </div>
);
