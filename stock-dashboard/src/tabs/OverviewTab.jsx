import { DollarSign, Activity, BarChart3 } from 'lucide-react';
import { KpiCard } from '../components/ui/KpiCard';
import { MetricRow } from '../components/ui/MetricRow';
import { StyledAreaChart } from '../components/ui/StyledAreaChart';
import { getPERatioColor, sortByYear } from '../utils/Formatters';

const CARD_STYLE = {
  background: '#111827', border: '1px solid #1e293b', borderRadius: '16px', padding: '24px',
};

/**
 * OverviewTab — Vue d'ensemble : KPIs, graphique de prix 30j, métriques clés.
 */
const OverviewTab = ({ kpis, historical_data, dividend_history, profit_margin_history, chartHeight }) => {
  const recentPrices   = historical_data.slice(-30);
  const dividendSorted = sortByYear(dividend_history);
  const profitSorted   = sortByYear(profit_margin_history);

  return (
    <div>
      {/* KPI Cards */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
        gap: '16px', marginBottom: '24px',
      }}>
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
      <div style={{ ...CARD_STYLE, marginBottom: '20px', animation: 'cardIn 0.4s ease 0.25s forwards', opacity: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <h2 style={{ fontFamily: 'Syne, sans-serif', fontWeight: '700', fontSize: '17px', color: '#f1f5f9' }}>
            Évolution du Prix
          </h2>
          <span style={{ fontSize: '11px', color: '#475569', fontFamily: 'DM Mono, monospace' }}>
            30 derniers jours
          </span>
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
      <div style={{ ...CARD_STYLE, animation: 'cardIn 0.4s ease 0.3s forwards', opacity: 0 }}>
        <h2 style={{ fontFamily: 'Syne, sans-serif', fontWeight: '700', fontSize: '17px', color: '#f1f5f9', marginBottom: '16px' }}>
          Métriques Clés
        </h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '0 40px' }}>
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