import { Activity, Database, Droplets, Percent, RefreshCw, TrendingUp, Wallet, Waves } from 'lucide-react';
import { buildPerformanceLedgerRows, DEFAULT_METRIC_RULES } from './metricEvaluation';
import styles from './PerformanceLedger.module.css';

const statusClassByTone = {
  good: styles.badgeGood,
  warn: styles.badgeWarn,
  neutral: styles.badgeNeutral,
};

const ICONES = {
  'Range 52 semaines': TrendingUp,
  'Beta': Activity,
  'ROE': RefreshCw,
  'Debt / Equity': Database,
  'Current Ratio': Droplets,
  'EPS': Wallet,
  'Profit Margin': Percent,
};

export const PerformanceLedger = ({ kpis = {}, metricRules = DEFAULT_METRIC_RULES, symbole = '$' }) => {
  const rows = buildPerformanceLedgerRows(kpis, metricRules, symbole);

  return (
    <section className={styles.card}>
      <h2 className={styles.title}>
        <span className={styles.titleIcon} aria-hidden="true">
          <svg width="20" height="20" viewBox="0 0 20 20"><rect x="2" y="11" width="4" height="7" fill="currentColor" /><rect x="8" y="6" width="4" height="12" fill="currentColor" /><rect x="14" y="2" width="4" height="16" fill="currentColor" /></svg>
        </span>
        Performance
      </h2>

      <div className={styles.grid}>
        {rows.map((row) => {
          const Icone = ICONES[row.label] || Waves;
          return (
            <div key={row.key} className={styles.tile}>
              <div className={styles.tileHeader}>
                <Icone size={20} className={styles.tileIcon} aria-hidden="true" />
                <span className={styles.label}>{row.label}</span>
                <span className={`${styles.badge} ${statusClassByTone[row.status.tone] || styles.badgeNeutral}`}>
                  {row.status.label}
                </span>
              </div>

              <div className={styles.value}>{row.value}</div>

              {row.position != null && (
                <div className={styles.track} aria-hidden="true">
                  <span className={styles.thumb} style={{ left: `${Math.round(row.position * 100)}%` }} />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
};
