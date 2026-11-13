import { CalendarDays } from 'lucide-react';
import { StyledAreaChart } from '../components/ui/StyledAreaChart';
import { PerformanceLedger } from '../components/overview/PerformanceLedger';
import { OverviewSidebar } from '../components/overview/OverviewSidebar';
import { useTheses } from '../hooks/useTheses';
import { useCotations } from '../hooks/useCotations';
import { getCurrencySymbol } from '../utils/Formatters';
import styles from './OverviewTab.module.css';

const VERT = '#22D468';

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

  return { yTicks: ticks, yDomain: [niceMin, niceMax] };
};

const formatPriceTick = (symbole) => (value) => {
  const n = Number(value);
  if (!Number.isFinite(n)) return '—';
  if (Math.abs(n) >= 10) return `${symbole}${Math.round(n)}`;
  return `${symbole}${n.toFixed(2)}`;
};

// ---------------------------------------------------------------------------
// Executive Summary : constats chiffrés tirés des KPIs, sans conseil (règle 5)
// ---------------------------------------------------------------------------

export function buildSummaryPoints(kpis) {
  const points = [];

  if (kpis.profit_margin != null) {
    if (kpis.profit_margin > 20)
      points.push({ text: `Marge bénéficiaire solide à ${kpis.profit_margin}%.`, tone: 'positive' });
    else if (kpis.profit_margin > 10)
      points.push({ text: `Marge bénéficiaire correcte à ${kpis.profit_margin}%.`, tone: 'neutral' });
    else
      points.push({ text: `Marge bénéficiaire faible (${kpis.profit_margin}%).`, tone: 'neutral' });
  }

  if (kpis.roe != null) {
    if (kpis.roe > 20)
      points.push({ text: `Excellente rentabilité des capitaux propres (ROE ${kpis.roe}%).`, tone: 'positive' });
    else if (kpis.roe > 10)
      points.push({ text: `Rentabilité des capitaux propres correcte (ROE ${kpis.roe}%).`, tone: 'positive' });
    else
      points.push({ text: `Rentabilité des capitaux propres limitée (ROE ${kpis.roe}%).`, tone: 'neutral' });
  }

  if (kpis.debt_to_equity != null) {
    if (kpis.debt_to_equity > 150)
      points.push({ text: `Levier financier élevé, D/E à ${kpis.debt_to_equity}%.`, tone: 'neutral' });
    else if (kpis.debt_to_equity > 50)
      points.push({ text: `Endettement modéré, D/E à ${kpis.debt_to_equity}%.`, tone: 'neutral' });
    else
      points.push({ text: `Bilan peu endetté, D/E à ${kpis.debt_to_equity}%.`, tone: 'positive' });
  }

  if (kpis.pe_ratio != null) {
    if (kpis.pe_ratio > 30)
      points.push({ text: `P/E élevé : ${kpis.pe_ratio}x les bénéfices passés.`, tone: 'neutral' });
    else if (kpis.pe_ratio > 15)
      points.push({ text: `P/E de ${kpis.pe_ratio}x les bénéfices passés.`, tone: 'neutral' });
    else
      points.push({ text: `P/E bas : ${kpis.pe_ratio}x les bénéfices passés.`, tone: 'positive' });
  }

  if (kpis.dividend_yield > 0)
    points.push({ text: `Rendement du dividende de ${kpis.dividend_yield}%.`, tone: 'positive' });

  return points.slice(0, 3);
}

// ---------------------------------------------------------------------------
// OverviewTab
// ---------------------------------------------------------------------------

const OverviewTab = ({
  kpis = {}, currency = 'USD', historical_data = [], chartHeight, ticker = '—',
  favorites = [], onSelectTicker = () => {},
}) => {
  const symbole = getCurrencySymbol(currency);
  const recentPrices = (historical_data || []).slice(-30);
  const { yTicks, yDomain } = buildNicePriceAxis(recentPrices, 4);
  const fmtPrix = formatPriceTick(symbole);
  const { theses, enregistrer, effacer } = useTheses();
  const cotations = useCotations(favorites);

  return (
    <div className={styles.overviewGrid}>
      <div className={styles.mainColumn}>
        <section className={styles.chartCard}>
          <div className={styles.cardHeader}>
            <h2 className={styles.cardTitle}>
              <svg width="22" height="22" viewBox="0 0 20 20" aria-hidden="true" className={styles.cardIcon}>
                <rect x="2" y="11" width="4" height="7" fill="currentColor" />
                <rect x="8" y="6" width="4" height="12" fill="currentColor" />
                <rect x="14" y="2" width="4" height="16" fill="currentColor" />
              </svg>
              Évolution du Prix
            </h2>
            <span className={styles.cardUnit}><CalendarDays size={16} aria-hidden="true" /> 30 derniers jours</span>
          </div>
          <div style={{ height: chartHeight }}>
            {recentPrices.length > 1 ? (
              <StyledAreaChart
                data={recentPrices} dataKey="price" stroke={VERT}
                gradientId="priceGrad" xDataKey="date"
                yTickFormatter={fmtPrix}
                tooltipFormatter={(v) => [fmtPrix(v), 'Cours']}
                yDomain={yDomain}
                yTicks={yTicks}
              />
            ) : (
              <p className={styles.vide}>Historique de cours indisponible.</p>
            )}
          </div>
        </section>
        <PerformanceLedger kpis={kpis} symbole={symbole} />
      </div>

      <aside className={styles.sidebarColumn}>
        <OverviewSidebar
          summaryPoints={buildSummaryPoints(kpis)}
          these={{
            ticker,
            symbole,
            currentPrice: kpis.current_price ?? null,
            targetPrice: kpis.target_mean_price ?? null,
            analystCount: kpis.analyst_count ?? null,
            these: theses[ticker],
            onEnregistrer: enregistrer,
            onEffacer: effacer,
          }}
          watchlist={{ tickers: favorites, cotations, tickerCourant: ticker, onSelect: onSelectTicker }}
        />
      </aside>
    </div>
  );
};

export default OverviewTab;
