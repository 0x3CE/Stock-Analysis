import styles from './OverviewSidebar.module.css';

const formatCurrency = (value) => {
  const n = Number(value);
  if (!Number.isFinite(n)) return '—';
  return `$${n.toFixed(2)}`;
};

const formatPercent = (value) => {
  const n = Number(value);
  if (!Number.isFinite(n)) return '—';
  return `${n >= 0 ? '+' : ''}${n.toFixed(2)}%`;
};

const ExecutiveSummaryCard = ({ points = [] }) => (
  <section className={styles.card}>
    <h2 className={styles.title}>Executive Summary</h2>
    <ul className={styles.summaryList}>
      {points.length > 0 ? points.map((point, idx) => (
        <li key={`${point.text}-${idx}`} className={styles.summaryItem}>
          <span className={`${styles.summaryDot} ${point.tone === 'positive' ? styles.dotPositive : styles.dotNeutral}`} />
          <span>{point.text}</span>
        </li>
      )) : (
        <li className={styles.summaryItem}>
          <span className={`${styles.summaryDot} ${styles.dotNeutral}`} />
          <span>Données insuffisantes pour générer un résumé.</span>
        </li>
      )}
    </ul>
  </section>
);

const ThesisCard = ({ thesis }) => {
  const convictionClass = thesis.conviction === 'Élevée'
    ? styles.convictionHigh
    : thesis.conviction === 'Faible'
      ? styles.convictionLow
      : styles.convictionMedium;

  return (
    <section className={styles.card}>
      <h2 className={styles.title}>Carte de thèse</h2>

      <div className={styles.thesisGrid}>
        <div className={styles.metric}>
          <span className={styles.metricLabel}>Prix actuel</span>
          <span className={styles.metricValue}>{formatCurrency(thesis.currentPrice)}</span>
        </div>
        <div className={styles.metric}>
          <span className={styles.metricLabel}>Prix cible</span>
          <span className={styles.metricValue}>{formatCurrency(thesis.targetPrice)}</span>
        </div>
        <div className={styles.metric}>
          <span className={styles.metricLabel}>Potentiel</span>
          <span className={styles.metricValue}>{formatPercent(thesis.potentialPct)}</span>
        </div>
        <div className={styles.metric}>
          <span className={styles.metricLabel}>Conviction</span>
          <span className={`${styles.convictionBadge} ${convictionClass}`}>{thesis.conviction}</span>
        </div>
      </div>

      <p className={styles.note}>{thesis.note}</p>
      <button type="button" className={styles.editButton}>Modifier la thèse</button>
    </section>
  );
};

const WatchlistCard = ({ items = [] }) => (
  <section className={styles.card}>
    <h2 className={styles.title}>Watchlist</h2>

    <ul className={styles.watchlist}>
      {items.map((item) => {
        const changeClass = item.change >= 0 ? styles.changeUp : styles.changeDown;
        return (
          <li key={item.ticker} className={styles.watchlistRow}>
            <span className={styles.ticker}>{item.ticker}</span>
            <span className={styles.price}>{formatCurrency(item.price)}</span>
            <span className={`${styles.change} ${changeClass}`}>{formatPercent(item.change)}</span>
          </li>
        );
      })}
    </ul>
  </section>
);

export const OverviewSidebar = ({ summaryPoints, thesis, watchlistItems }) => (
  <div className={styles.stack}>
    <ExecutiveSummaryCard points={summaryPoints} />
    <ThesisCard thesis={thesis} />
    <WatchlistCard items={watchlistItems} />
  </div>
);
