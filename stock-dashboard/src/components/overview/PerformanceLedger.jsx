import { buildPerformanceLedgerRows, DEFAULT_METRIC_RULES } from './metricEvaluation';
import styles from './PerformanceLedger.module.css';

const statusClassByTone = {
  good: styles.badgeGood,
  warn: styles.badgeWarn,
  neutral: styles.badgeNeutral,
};

export const PerformanceLedger = ({ kpis = {}, metricRules = DEFAULT_METRIC_RULES }) => {
  const rows = buildPerformanceLedgerRows(kpis, metricRules);

  return (
    <section className={styles.card}>
      <h2 className={styles.title}>Performance</h2>

      <div className={styles.grid}>
        {rows.map((row) => (
          <div key={row.key} className={styles.tile}>
            <div className={styles.tileHeader}>
              <span className={styles.label}>{row.label}</span>
              <span className={`${styles.badge} ${statusClassByTone[row.status.tone] || styles.badgeNeutral}`}>
                {row.status.label}
              </span>
            </div>

            <div className={styles.value}>{row.value}</div>

            {row.position != null && (
              <div className={styles.track}>
                <span
                  className={styles.thumb}
                  style={{ left: `${Math.round(row.position * 100)}%` }}
                  aria-hidden="true"
                />
              </div>
            )}
          </div>
        ))}
      </div>
    </section>
  );
};
