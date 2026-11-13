import {
  AreaChart, Area, CartesianGrid, XAxis, YAxis, Tooltip,
  ResponsiveContainer, ReferenceLine,
} from 'recharts';
import { StyledAreaChart } from '../components/ui/StyledAreaChart';
import { sortByYear } from '../utils/Formatters';
import styles from './FinancialsTab.module.css';

const FinancialsTab = ({ profit_margin_history, dividend_history, chartHeight }) => {
  const profitSorted   = sortByYear(profit_margin_history);
  const dividendSorted = sortByYear(dividend_history);

  return (
    <div className={styles.layout}>

      {/* Bénéfice net */}
      <div className={styles.card} style={{ animation: 'cardIn 0.4s ease 0.05s forwards' }}>
        <div className={styles.cardHeader}>
          <h2 className={styles.cardTitle}>Bénéfice Net</h2>
          <span className={styles.cardUnit}>milliards USD</span>
        </div>
        <div style={{ height: chartHeight }}>
          <StyledAreaChart
            data={profitSorted} dataKey="net_income" stroke="#f97316"
            gradientId="netIncomeGrad"
            yTickFormatter={(v) => `$${v}B`}
            tooltipFormatter={(v) => [`$${v}B`, 'Bénéfice net']}
            yDomain={['dataMin - 2', 'dataMax + 2']}
          />
        </div>
      </div>

      {/* Marge nette */}
      <div className={styles.card} style={{ animation: 'cardIn 0.4s ease 0.1s forwards' }}>
        <div className={styles.cardHeader}>
          <h2 className={styles.cardTitle}>Marge Nette</h2>
          <span className={styles.cardUnit}>%</span>
        </div>
        <div style={{ height: chartHeight }}>
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={profitSorted}>
              <defs>
                <linearGradient id="marginGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor="#22D468" stopOpacity={0.2} />
                  <stop offset="95%" stopColor="#22D468" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#1F2B3A" />
              <XAxis dataKey="year" stroke="#263445"
                tick={{ fontSize: 11, fill: '#C9D3DE', fontFamily: 'JetBrains Mono, ui-monospace, monospace' }} />
              <YAxis stroke="#263445"
                tick={{ fontSize: 11, fill: '#C9D3DE', fontFamily: 'JetBrains Mono, ui-monospace, monospace' }}
                tickFormatter={(v) => `${v}%`} />
              <ReferenceLine y={20} stroke="#22D468" strokeDasharray="4 4" strokeOpacity={0.35}
                label={{ value: 'Seuil 20%', fill: '#22D468', fontSize: 10, fontFamily: 'JetBrains Mono, ui-monospace, monospace' }} />
              <Tooltip
                contentStyle={{ background: '#121C29', border: '1px solid #263445', borderRadius: '10px', fontFamily: 'JetBrains Mono, ui-monospace, monospace' }}
                labelStyle={{ color: '#93A1B2', fontSize: '12px' }}
                formatter={(v) => [`${v}%`, 'Marge nette']}
              />
              <Area type="monotone" dataKey="margin" stroke="#22D468" strokeWidth={2}
                fill="url(#marginGrad)"
                dot={{ r: 3, fill: '#22D468', strokeWidth: 0 }}
                activeDot={{ r: 5, fill: '#22D468', stroke: '#0A1019', strokeWidth: 2 }}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Dividendes */}
      {dividendSorted.length > 0 ? (
        <div className={styles.card} style={{ animation: 'cardIn 0.4s ease 0.15s forwards' }}>
          <div className={styles.cardHeader}>
            <h2 className={styles.cardTitle}>Dividendes</h2>
            <span className={styles.cardUnit}>5 dernières années</span>
          </div>
          <div style={{ height: chartHeight }}>
            <StyledAreaChart
              data={dividendSorted} dataKey="amount" stroke="#10b981"
              gradientId="dividendGrad"
              yTickFormatter={(v) => `$${v.toFixed(2)}`}
              tooltipFormatter={(v) => [`$${v}`, 'Dividende']}
              yDomain={[(min) => Math.max(0, min - 0.05), (max) => max + 0.05]}
            />
          </div>
        </div>
      ) : (
        <div className={styles.emptyCard} style={{ animation: 'cardIn 0.4s ease 0.15s forwards' }}>
          <p className={styles.emptyText}>Aucun dividende versé sur les 5 dernières années.</p>
        </div>
      )}
    </div>
  );
};

export default FinancialsTab;
