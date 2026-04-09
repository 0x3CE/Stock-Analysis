import { TrendingUp, TrendingDown, BarChart2, Activity, DollarSign, Percent, Scale, Layers } from 'lucide-react';
import { StyledAreaChart } from '../components/ui/StyledAreaChart';
import { getPERatioColor } from '../utils/Formatters';
import styles from './OverviewTab.module.css';

// ---------------------------------------------------------------------------
// Executive Summary — génère des points clés depuis les KPIs
// ---------------------------------------------------------------------------

function buildSummaryPoints(kpis) {
  const points = [];

  if (kpis.profit_margin != null) {
    if (kpis.profit_margin > 20)
      points.push(`Marge bénéficiaire solide à ${kpis.profit_margin}%.`);
    else if (kpis.profit_margin > 10)
      points.push(`Marge bénéficiaire correcte à ${kpis.profit_margin}%.`);
    else
      points.push(`Marge bénéficiaire sous pression (${kpis.profit_margin}%).`);
  }

  if (kpis.roe != null) {
    if (kpis.roe > 20)
      points.push(`Excellente rentabilité des capitaux propres (ROE ${kpis.roe}%).`);
    else if (kpis.roe > 10)
      points.push(`ROE positif à ${kpis.roe}% — rendement correct.`);
    else
      points.push(`ROE limité à ${kpis.roe}% — surveiller l'efficacité.`);
  }

  if (kpis.debt_to_equity != null) {
    if (kpis.debt_to_equity > 150)
      points.push(`Levier financier élevé (D/E ${kpis.debt_to_equity}%) — prudence.`);
    else if (kpis.debt_to_equity > 50)
      points.push(`Endettement modéré avec un D/E de ${kpis.debt_to_equity}%.`);
    else
      points.push(`Bilan peu endetté, D/E à ${kpis.debt_to_equity ?? '—'}%.`);
  }

  if (kpis.pe_ratio != null) {
    if (kpis.pe_ratio > 30)
      points.push(`Valorisation premium avec un P/E de ${kpis.pe_ratio}x.`);
    else if (kpis.pe_ratio > 15)
      points.push(`Valorisation raisonnable à ${kpis.pe_ratio}x les bénéfices.`);
    else
      points.push(`Valorisation attractive — P/E à ${kpis.pe_ratio}x.`);
  }

  if (kpis.dividend_yield > 0)
    points.push(`Dividende annuel de ${kpis.dividend_yield}%.`);

  return points.slice(0, 3);
}

// ---------------------------------------------------------------------------
// KPI Mini Card
// ---------------------------------------------------------------------------

const KpiMiniCard = ({ label, value, valueColor, icon: Icon, delay = 0 }) => (
  <div className={styles.kpiCard} style={{ animationDelay: `${delay}s` }}>
    <div className={styles.kpiHeader}>
      <span className={styles.kpiLabel}>{label}</span>
      {Icon && <Icon size={16} className={styles.kpiIcon} />}
    </div>
    <div className={styles.kpiValue} style={{ color: valueColor || 'var(--text-primary)' }}>
      {value ?? '—'}
    </div>
  </div>
);

// ---------------------------------------------------------------------------
// OverviewTab
// ---------------------------------------------------------------------------

const OverviewTab = ({ kpis, historical_data, dividend_history, profit_margin_history, chartHeight }) => {
  const recentPrices = historical_data.slice(-30);
  const summaryPoints = buildSummaryPoints(kpis);

  return (
    <div>
      {/* ── Rangée supérieure : Executive Summary + Graphique ── */}
      <div className={styles.topRow}>
        {/* Executive Summary */}
        <div className={styles.summaryCard}>
          <h2 className={styles.cardTitle}>Executive Summary</h2>
          <ul className={styles.summaryList}>
            {summaryPoints.length > 0
              ? summaryPoints.map((pt, i) => (
                  <li key={i} className={styles.summaryItem}>{pt}</li>
                ))
              : <li className={styles.summaryItem}>Données insuffisantes pour générer un résumé.</li>
            }
          </ul>
        </div>

        {/* Graphique prix 30j */}
        <div className={styles.chartCard}>
          <div className={styles.cardHeader}>
            <h2 className={styles.cardTitle}>Évolution du Prix</h2>
            <span className={styles.cardUnit}>30 derniers jours</span>
          </div>
          <div style={{ height: chartHeight }}>
            <StyledAreaChart
              data={recentPrices} dataKey="price" stroke="#1B2B4B"
              gradientId="priceGrad" xDataKey="date"
              yTickFormatter={(v) => `$${v}`}
              tooltipFormatter={(v) => [`$${v}`, 'Prix']}
              yDomain={['dataMin - 5', 'dataMax + 5']}
            />
          </div>
        </div>
      </div>

      {/* ── Performance Breakdown ───────────────────────────── */}
      <h2 className={styles.sectionTitle}>Performance Breakdown</h2>

      {/* Rangée 1 : 52W High, 52W Low, Beta */}
      <div className={styles.kpiRow3}>
        <KpiMiniCard
          label="52W High"
          value={kpis.high_52w ? `$${kpis.high_52w}` : null}
          valueColor="var(--green)"
          icon={TrendingUp}
          delay={0.05}
        />
        <KpiMiniCard
          label="52W Low"
          value={kpis.low_52w ? `$${kpis.low_52w}` : null}
          valueColor="var(--red)"
          icon={TrendingDown}
          delay={0.10}
        />
        <KpiMiniCard
          label="Beta"
          value={kpis.beta ?? null}
          icon={BarChart2}
          delay={0.15}
        />
      </div>

      {/* Rangée 2 : ROE, Debt/Equity, Current Ratio, EPS, Profit Margin */}
      <div className={styles.kpiRow5}>
        <KpiMiniCard
          label="ROE"
          value={kpis.roe != null ? `${kpis.roe}%` : null}
          valueColor={kpis.roe > 15 ? 'var(--green)' : undefined}
          icon={DollarSign}
          delay={0.20}
        />
        <KpiMiniCard
          label="Debt / Equity"
          value={kpis.debt_to_equity ?? null}
          valueColor={kpis.debt_to_equity > 200 ? 'var(--red)' : undefined}
          icon={Scale}
          delay={0.25}
        />
        <KpiMiniCard
          label="Current Ratio"
          value={kpis.current_ratio ?? null}
          valueColor={kpis.current_ratio > 1 ? 'var(--green)' : 'var(--red)'}
          icon={Layers}
          delay={0.30}
        />
        <KpiMiniCard
          label="EPS"
          value={kpis.eps != null ? `$${kpis.eps}` : null}
          icon={Activity}
          delay={0.35}
        />
        <KpiMiniCard
          label="Profit Margin"
          value={kpis.profit_margin != null ? `${kpis.profit_margin}%` : null}
          valueColor={kpis.profit_margin > 20 ? 'var(--green)' : undefined}
          icon={Percent}
          delay={0.40}
        />
      </div>
    </div>
  );
};

export default OverviewTab;
