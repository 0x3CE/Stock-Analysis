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
      <h2 className={styles.title}>Performance Ledger</h2>

      <div className={styles.table}>
        {rows.map((row) => (
          <div key={row.key} className={styles.row}>
            <div className={styles.label}>{row.label}</div>
            <div className={styles.value}>{row.value}</div>

            <div className={styles.trackWrap}>
              <div className={styles.track}>
                {row.position != null && (
                  <span
                    className={styles.thumb}
                    style={{ left: `${Math.round(row.position * 100)}%` }}
                    aria-hidden="true"
                  />
                )}
              </div>
            </div>

            <div className={`${styles.badge} ${statusClassByTone[row.status.tone] || styles.badgeNeutral}`}>
              {row.status.label}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
};
