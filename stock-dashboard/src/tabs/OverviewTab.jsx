import { DollarSign, Activity, BarChart3 } from 'lucide-react';
import { KpiCard } from '../components/ui/KpiCard';
import { MetricRow } from '../components/ui/MetricRow';
import { StyledAreaChart } from '../components/ui/StyledAreaChart';
import { getPERatioColor, sortByYear } from '../utils/Formatters';
import styles from './OverviewTab.module.css';

const OverviewTab = ({ kpis, historical_data, dividend_history, profit_margin_history, chartHeight }) => {
  const recentPrices   = historical_data.slice(-30);
  const dividendSorted = sortByYear(dividend_history);
  const profitSorted   = sortByYear(profit_margin_history);

  return (
    <div>
      {/* KPI Cards */}
      <div className={styles.kpiGrid}>
        <KpiCard
          label="Market Cap" value={`$${kpis.market_cap}B`}
          icon={DollarSign} iconColor="text-blue-400"
          sparkData={profitSorted} sparkKey="net_income" sparkColor="#3b82f6"
          delay={0.05}
        />
        <KpiCard
          label="P/E Ratio" value={kpis.pe_ratio || 'N/A'}
          icon={BarChart3} iconColor="text-purple-400"
          valueColor={getPERatioColor(kpis.pe_ratio)}
          delay={0.10}
        />
        <KpiCard
          label="Dividend Yield" value={kpis.dividend_yield ? `${kpis.dividend_yield}%` : 'N/A'}
          icon={Activity} iconColor="text-green-400"
          sparkData={dividendSorted} sparkKey="amount" sparkColor="#22c55e"
          valueColor={kpis.dividend_yield > 0 ? '#22c55e' : undefined}
          delay={0.15}
        />
        <KpiCard
          label="Volume" value={`${kpis.volume}M`}
          icon={Activity} iconColor="text-orange-400"
          delay={0.20}
        />
      </div>

      {/* Graphique prix 30j */}
      <div className={styles.card} style={{ marginBottom: '20px', animation: 'cardIn 0.4s ease 0.25s forwards', opacity: 0 }}>
        <div className={styles.cardHeader}>
          <h2 className={styles.cardTitle}>Évolution du Prix</h2>
          <span className={styles.cardUnit}>30 derniers jours</span>
        </div>
        <div style={{ height: chartHeight }}>
          <StyledAreaChart
            data={recentPrices} dataKey="price" stroke="#3b82f6"
            gradientId="priceGrad" xDataKey="date"
            yTickFormatter={(v) => `$${v}`}
            tooltipFormatter={(v) => [`$${v}`, 'Prix']}
            yDomain={['dataMin - 5', 'dataMax + 5']}
          />
        </div>
      </div>

      {/* Métriques clés */}
      <div className={styles.card} style={{ animation: 'cardIn 0.4s ease 0.3s forwards', opacity: 0 }}>
        <h2 className={styles.cardTitle} style={{ marginBottom: '16px' }}>Métriques Clés</h2>
        <div className={styles.metricsGrid}>
          <MetricRow label="52W High"      value={kpis.high_52w      ? `$${kpis.high_52w}`        : null} valueColor="#22c55e" />
          <MetricRow label="52W Low"       value={kpis.low_52w       ? `$${kpis.low_52w}`         : null} valueColor="#ef4444" />
          <MetricRow label="Beta"          value={kpis.beta          || null} />
          <MetricRow label="EPS"           value={kpis.eps           ? `$${kpis.eps}`              : null} />
          <MetricRow label="ROE"           value={kpis.roe           ? `${kpis.roe}%`             : null} valueColor={kpis.roe > 15 ? '#22c55e' : undefined} />
          <MetricRow label="Debt / Equity" value={kpis.debt_to_equity || null}                           valueColor={kpis.debt_to_equity > 2 ? '#ef4444' : undefined} />
          <MetricRow label="Current Ratio" value={kpis.current_ratio  || null}                           valueColor={kpis.current_ratio > 1 ? '#22c55e' : '#ef4444'} />
          <MetricRow label="Profit Margin" value={kpis.profit_margin  ? `${kpis.profit_margin}%` : null} valueColor={kpis.profit_margin > 20 ? '#22c55e' : undefined} />
        </div>
      </div>
    </div>
  );
};

export default OverviewTab;
