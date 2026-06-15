import { StyledAreaChart } from '../components/ui/StyledAreaChart';
import { PerformanceLedger } from '../components/overview/PerformanceLedger';
import { OverviewSidebar } from '../components/overview/OverviewSidebar';
import styles from './OverviewTab.module.css';
const getNiceStep = (rawStep) => {
  if (!Number.isFinite(rawStep) || rawStep <= 0) return 1;
  const magnitude = Math.pow(10, Math.floor(Math.log10(rawStep)));
  const residual = rawStep / magnitude;

  if (residual <= 1) return 1 * magnitude;
  if (residual <= 2) return 2 * magnitude;
  if (residual <= 2.5) return 2.5 * magnitude;
  if (residual <= 5) return 5 * magnitude;
  return 10 * magnitude;
};

const buildNicePriceAxis = (series, tickCount = 4) => {
  const prices = (series || [])
    .map((point) => Number(point?.price))
    .filter((value) => Number.isFinite(value));

  if (prices.length === 0) return { yTicks: undefined, yDomain: ['auto', 'auto'] };

  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const spread = Math.max(max - min, 1);
  const step = getNiceStep(spread / Math.max(tickCount - 1, 1));

  const niceMin = Math.floor(min / step) * step;
  const niceMax = Math.ceil(max / step) * step;
  const ticks = [];

  for (let value = niceMin; value <= niceMax + step * 0.5; value += step) {
    ticks.push(Number(value.toFixed(4)));
  }

  return {
    yTicks: ticks,
    yDomain: [niceMin, niceMax],
  };
};

const formatPriceTick = (value) => {
  const n = Number(value);
  if (!Number.isFinite(n)) return '$—';
  if (Math.abs(n) >= 100) return `$${Math.round(n)}`;
  if (Math.abs(n) >= 10) return `$${n.toFixed(0)}`;
  return `$${n.toFixed(2)}`;
};

// ---------------------------------------------------------------------------
// Executive Summary — génère des points clés depuis les KPIs
// ---------------------------------------------------------------------------

function buildSummaryPoints(kpis) {
  const points = [];

  if (kpis.profit_margin != null) {
    if (kpis.profit_margin > 20)
      points.push({ text: `Marge bénéficiaire solide à ${kpis.profit_margin}%.`, tone: 'positive' });
    else if (kpis.profit_margin > 10)
      points.push({ text: `Marge bénéficiaire correcte à ${kpis.profit_margin}%.`, tone: 'neutral' });
    else
      points.push({ text: `Marge bénéficiaire sous pression (${kpis.profit_margin}%).`, tone: 'neutral' });
  }

  if (kpis.roe != null) {
    if (kpis.roe > 20)
      points.push({ text: `Excellente rentabilité des capitaux propres (ROE ${kpis.roe}%).`, tone: 'positive' });
    else if (kpis.roe > 10)
      points.push({ text: `ROE positif à ${kpis.roe}% — rendement correct.`, tone: 'positive' });
    else
      points.push({ text: `ROE limité à ${kpis.roe}% — surveiller l'efficacité.`, tone: 'neutral' });
  }

  if (kpis.debt_to_equity != null) {
    if (kpis.debt_to_equity > 150)
      points.push({ text: `Levier financier élevé (D/E ${kpis.debt_to_equity}%) — prudence.`, tone: 'neutral' });
    else if (kpis.debt_to_equity > 50)
      points.push({ text: `Endettement modéré avec un D/E de ${kpis.debt_to_equity}%.`, tone: 'neutral' });
    else
      points.push({ text: `Bilan peu endetté, D/E à ${kpis.debt_to_equity ?? '—'}%.`, tone: 'positive' });
  }

  if (kpis.pe_ratio != null) {
    if (kpis.pe_ratio > 30)
      points.push({ text: `Valorisation premium avec un P/E de ${kpis.pe_ratio}x.`, tone: 'neutral' });
    else if (kpis.pe_ratio > 15)
      points.push({ text: `Valorisation raisonnable à ${kpis.pe_ratio}x les bénéfices.`, tone: 'positive' });
    else
      points.push({ text: `Valorisation attractive — P/E à ${kpis.pe_ratio}x.`, tone: 'positive' });
  }

  if (kpis.dividend_yield > 0)
    points.push({ text: `Dividende annuel de ${kpis.dividend_yield}%.`, tone: 'positive' });

  return points.slice(0, 3);
}


// ---------------------------------------------------------------------------
// OverviewTab
// ---------------------------------------------------------------------------

const OverviewTab = ({ kpis = {}, historical_data = [], dividend_history = [], profit_margin_history = [], chartHeight, ticker = '—' }) => {
  const recentPrices = (historical_data || []).slice(-30);
  const { yTicks, yDomain } = buildNicePriceAxis(recentPrices, 4);
  const summaryPoints = buildSummaryPoints(kpis || {});
  const currentPrice = Number(kpis.current_price);
  const hasPrice = Number.isFinite(currentPrice);
  const targetPrice = hasPrice ? currentPrice * 1.12 : null;
  const potentialPct = hasPrice ? ((targetPrice - currentPrice) / currentPrice) * 100 : null;

  const thesis = {
    currentPrice,
    targetPrice,
    potentialPct,
    conviction: 'Moyenne',
    note: 'Hypothèse initiale (placeholder) : exécution stable et progression graduelle des marges sur les prochains trimestres.',
  };

  const watchlistItems = [
    { ticker, price: hasPrice ? currentPrice : null, change: Number(kpis.price_change) || 0 },
    { ticker: 'MSFT', price: 468.15, change: 0.84 },
    { ticker: 'ASML', price: 1088.9, change: -1.12 },
    { ticker: 'MC.PA', price: 713.4, change: 0.46 },
  ];

  return (
    <div className={styles.overviewShell}>
      <div className={styles.overviewGrid}>
        <div className={styles.mainColumn}>
          {/* Graphique prix 30j */}
          <div className={styles.chartCard}>
            <div className={styles.cardHeader}>
              <h2 className={styles.cardTitle}>Évolution du Prix</h2>
              <span className={styles.cardUnit}>30 derniers jours</span>
            </div>
            <div style={{ height: chartHeight }}>
              <StyledAreaChart
                data={recentPrices} dataKey="price" stroke="#1B2030"
                gradientId="priceGrad" xDataKey="date"
                yTickFormatter={formatPriceTick}
                tooltipFormatter={(v) => [formatPriceTick(v), 'Prix']}
                yDomain={yDomain}
                yTicks={yTicks}
              />
            </div>
          </div>
          <PerformanceLedger kpis={kpis} />
        </div>

        <aside className={styles.sidebarColumn}>
          <OverviewSidebar
            summaryPoints={summaryPoints}
            thesis={thesis}
            watchlistItems={watchlistItems}
          />
        </aside>
      </div>
    </div>
  );
};

export default OverviewTab;
